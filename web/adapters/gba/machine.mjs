// Game Boy Advance system: memory map, I/O, DMA, timers, interrupts, keypad and a
// high-level BIOS. Original implementation from public hardware documentation.
// No firmware image is used: SWI services run in JavaScript and a six-instruction
// IRQ dispatcher (written here) sits at the IRQ vector.
import {ARM7} from './cpu.mjs';
import {lz77, cpuSet, cpuFastSet, bgAffineSet, objAffineSet, rlUnComp, huffUnComp, midiKey2Freq} from './bios.mjs';

export const CYCLES_PER_LINE = 1232, LINES = 228, VISIBLE = 160, HDRAW = 960;
export const KEY = {A: 1, B: 2, SELECT: 4, START: 8, RIGHT: 16, LEFT: 32, UP: 64, DOWN: 128, R: 256, L: 512};
const IRQ = {vblank: 1, hblank: 2, vcount: 4, timer0: 8, dma0: 0x100, keypad: 0x1000};
const TIMER_SHIFT = [0, 6, 8, 10];

// ARM words: IRQ vector branch and the dispatcher that calls the handler at [0x03007FFC].
const BIOS_CODE = {0x18: 0xEA000042, 0x128: 0xE92D500F, 0x12C: 0xE3A00301, 0x130: 0xE28FE000, 0x134: 0xE510F004, 0x138: 0xE8BD500F, 0x13C: 0xE25EF004};

export class GBA {
  constructor(rom, {sram} = {}) {
    // Memory is read through aligned 16/32-bit views of the same bytes (the GBA is little-endian).
    if (new Uint8Array(new Uint16Array([1]).buffer)[0] !== 1) throw Error('The GBA machine needs a little-endian host');
    const source = new Uint8Array(rom); this.romSize = source.length;
    this.rom = new Uint8Array((source.length + 3) & ~3); this.rom.set(source);
    this.bios = new Uint8Array(0x4000);
    this.ewram = new Uint8Array(0x40000); this.iwram = new Uint8Array(0x8000);
    this.io = new Uint8Array(0x400); this.pal = new Uint8Array(0x400); this.vram = new Uint8Array(0x18000); this.oam = new Uint8Array(0x400);
    this.sram = sram ? new Uint8Array(sram) : new Uint8Array(0x8000).fill(0xFF);
    for (const k of ['rom', 'bios', 'ewram', 'iwram', 'pal', 'vram', 'oam']) { this[k + '16'] = new Uint16Array(this[k].buffer); this[k + '32'] = new Uint32Array(this[k].buffer); }
    for (const [addr, word] of Object.entries(BIOS_CODE)) this.bios32[Number(addr) >> 2] = word;
    this.cpu = new ARM7(this); this.cpu.onSWI = (n, ret) => this.swi(n, ret);
    this.keys = 0; this.line = 0; this.lineCycle = 0; this.frame = 0; this.biosLatch = 0;
    this.timers = Array.from({length: 4}, () => ({reload: 0, counter: 0, control: 0, acc: 0}));
    this.dma = Array.from({length: 4}, () => ({src: 0, dst: 0, count: 0, control: 0, isrc: 0, idst: 0, icount: 0}));
    this.waitMask = 0; this.waitReturn = -1; this.waitThumb = 0;
    this.ppu = null; this.apu = null; this.sramDirty = false;
    // Run state: timers and sound are advanced in batches (see runUntil); these place a
    // register access inside the batch that is running.
    this.inBatch = false; this.batchStart = 0; this.instrStart = 0; this.timerSync = 0; this.apuSync = 0; this.resync = false;
    // For the CPU's idle-loop skipping: `dirty` is set by every write, I/O read, BIOS call and
    // interrupt entry; `stopCycles` is the CPU cycle count at which the running batch ends.
    this.dirty = true; this.stopCycles = 0;
    // A host that will not show a frame can run it without drawing (the machine state is the same).
    this.skipRender = false;
    this.cpu.reset(0x08000000);
  }
  // --- bus -------------------------------------------------------------------------
  // Opcode fetches: ROM and work RAM directly; anything else through the ordinary read.
  fetch16(pc) {
    const hi = pc >>> 24;
    if (hi === 8) { const o = pc & 0x1FFFFFF; if (o < this.romSize) return this.rom16[o >> 1]; }
    else if (hi === 3) return this.iwram16[(pc & 0x7FFF) >> 1];
    else if (hi === 2) return this.ewram16[(pc & 0x3FFFF) >> 1];
    return this.read16(pc);
  }
  fetch32(pc) {
    const hi = pc >>> 24;
    if (hi === 8) { const o = pc & 0x1FFFFFF; if (o < this.romSize) return this.rom32[o >> 2]; }
    else if (hi === 3) return this.iwram32[(pc & 0x7FFF) >> 2];
    else if (hi === 2) return this.ewram32[(pc & 0x3FFFF) >> 2];
    return this.read32(pc);
  }
  fetchCost(pc, width) { const r = pc >>> 24; return r >= 8 ? (width === 4 ? 4 : 2) : r === 2 ? (width === 4 ? 6 : 3) : 1; }
  read8(addr) {
    addr >>>= 0;
    switch (addr >>> 24) {
      case 2: return this.ewram[addr & 0x3FFFF];
      case 3: return this.iwram[addr & 0x7FFF];
      case 8: case 9: case 10: case 11: case 12: case 13: { const o = addr & 0x1FFFFFF; return o < this.romSize ? this.rom[o] : this.openBus(addr) & 0xFF; }
      case 4: this.dirty = true; return this.readIO8(addr & 0x3FF);
      case 5: return this.pal[addr & 0x3FF];
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; return this.vram[o]; }
      case 7: return this.oam[addr & 0x3FF];
      case 0: return addr < 0x4000 ? this.bios[addr] : this.openBus(addr) & 0xFF;
      case 0xE: case 0xF: return this.sram[addr & 0x7FFF];
      default: return this.openBus(addr) & 0xFF;
    }
  }
  read16(addr) {
    addr >>>= 0;
    switch (addr >>> 24) {
      case 2: return this.ewram16[(addr & 0x3FFFF) >> 1];
      case 3: return this.iwram16[(addr & 0x7FFF) >> 1];
      case 8: case 9: case 10: case 11: case 12: case 13: { const o = addr & 0x1FFFFFF; return o < this.romSize ? this.rom16[o >> 1] : this.openBus(addr) & 0xFFFF; }
      case 4: this.dirty = true; return this.readIO16(addr & 0x3FE);
      case 5: return this.pal16[(addr & 0x3FF) >> 1];
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; return this.vram16[o >> 1]; }
      case 7: return this.oam16[(addr & 0x3FF) >> 1];
      case 0: return addr < 0x4000 ? this.bios16[addr >> 1] : this.openBus(addr) & 0xFFFF;
      case 0xE: case 0xF: return this.sram[addr & 0x7FFF] * 0x101;
      default: return this.openBus(addr) & 0xFFFF;
    }
  }
  read32(addr) {
    addr >>>= 0;
    switch (addr >>> 24) {
      case 2: return this.ewram32[(addr & 0x3FFFF) >> 2];
      case 3: return this.iwram32[(addr & 0x7FFF) >> 2];
      case 8: case 9: case 10: case 11: case 12: case 13: { const o = addr & 0x1FFFFFF; return o < this.romSize ? this.rom32[o >> 2] : this.openBus(addr); }
      case 4: { this.dirty = true; const o = addr & 0x3FC; return (this.readIO16(o) | this.readIO16(o + 2) << 16) >>> 0; }
      case 5: return this.pal32[(addr & 0x3FF) >> 2];
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; return this.vram32[o >> 2]; }
      case 7: return this.oam32[(addr & 0x3FF) >> 2];
      case 0: { // the BIOS is readable only while it runs; otherwise the last fetched word shows
        if ((this.cpu.r[15] >>> 24) !== 0) return this.biosLatch;
        if (addr >= 0x4000) return this.openBus(addr);
        return this.biosLatch = this.bios32[addr >> 2];
      }
      case 0xE: case 0xF: return this.sram[addr & 0x7FFF] * 0x1010101 >>> 0;
      default: return this.openBus(addr);
    }
  }
  openBus(addr) { return this.cpu.t ? this.read16(this.cpu.r[15]) * 0x10001 >>> 0 : this.read32(this.cpu.r[15]); }
  write8(addr, v) {
    this.dirty = true; addr >>>= 0; v &= 0xFF;
    switch (addr >>> 24) {
      case 2: this.ewram[addr & 0x3FFFF] = v; return;
      case 3: this.iwram[addr & 0x7FFF] = v; return;
      case 4: this.writeIO8(addr & 0x3FF, v); return;
      case 5: this.pal16[(addr & 0x3FF) >> 1] = v * 0x101; return; // duplicated into the halfword
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; this.vram16[o >> 1] = v * 0x101; return; }
      case 0xE: case 0xF: this.sram[addr & 0x7FFF] = v; this.sramDirty = true; return;
    } // byte writes to OAM are ignored; ROM, BIOS and unmapped space are not writable
  }
  write16(addr, v) {
    this.dirty = true; addr >>>= 0; v &= 0xFFFF;
    switch (addr >>> 24) {
      case 2: this.ewram16[(addr & 0x3FFFF) >> 1] = v; return;
      case 3: this.iwram16[(addr & 0x7FFF) >> 1] = v; return;
      case 4: this.writeIO16(addr & 0x3FE, v); return;
      case 5: this.pal16[(addr & 0x3FF) >> 1] = v; return;
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; this.vram16[o >> 1] = v; return; }
      case 7: this.oam16[(addr & 0x3FF) >> 1] = v; return;
      case 0xE: case 0xF: this.sram[addr & 0x7FFF] = v & 0xFF; this.sramDirty = true; return;
    }
  }
  write32(addr, v) {
    this.dirty = true; addr >>>= 0;
    switch (addr >>> 24) {
      case 2: this.ewram32[(addr & 0x3FFFF) >> 2] = v; return;
      case 3: this.iwram32[(addr & 0x7FFF) >> 2] = v; return;
      case 4: { const o = addr & 0x3FC; this.writeIO16(o, v & 0xFFFF); this.writeIO16(o + 2, v >>> 16); return; }
      case 5: this.pal32[(addr & 0x3FF) >> 2] = v; return;
      case 6: { let o = addr & 0x1FFFF; if (o >= 0x18000) o -= 0x8000; this.vram32[o >> 2] = v; return; }
      case 7: this.oam32[(addr & 0x3FF) >> 2] = v; return;
      case 0xE: case 0xF: this.sram[addr & 0x7FFF] = v & 0xFF; this.sramDirty = true; return;
    }
  }
  // --- I/O -----------------------------------------------------------------------
  io16(o) { return this.io[o] | this.io[o + 1] << 8; }
  readIO8(o) { const v = this.readIO16(o & ~1); return o & 1 ? v >>> 8 : v & 0xFF; }
  readIO16(o) {
    if (o === 0x004) { // DISPSTAT
      const s = this.io16(4) & 0xFF38, vb = this.line >= VISIBLE && this.line < 227 ? 1 : 0, hb = this.lineCycle >= HDRAW ? 2 : 0;
      const vc = this.line === (this.io16(4) >>> 8) ? 4 : 0; return s | vb | hb | vc;
    }
    if (o === 0x006) return this.line;
    if (o >= 0x100 && o < 0x110 && !(o & 2)) { this.syncTimers(); return this.timers[(o - 0x100) >> 2].counter & 0xFFFF; }
    if (o === 0x130) return ~this.keys & 0x3FF;
    if (o >= 0x0B0 && o < 0x0E0) { const reg = (o - 0xB0) % 12; return reg === 10 ? this.io16(o) : 0; } // DMA registers are write-only except control
    return this.io16(o);
  }
  writeIO8(o, v) {
    if (o === 0x301) { this.halt(); return; } // HALTCNT
    if (o === 0x202 || o === 0x203) { this.io[o] &= ~v; return; } // IF acknowledge
    const cur = this.io16(o & ~1); this.writeIO16(o & ~1, o & 1 ? cur & 0xFF | v << 8 : cur & 0xFF00 | v);
  }
  writeIO16(o, v) {
    if (o === 0x202) { this.io[0x202] &= ~v; this.io[0x203] &= ~(v >> 8); return; }
    if (o === 0x300) { if (v & 0xFF00) this.halt(); this.io[0x300] = v & 0xFF; return; }
    if (o === 0x130) return;
    if (o >= 0x100 && o < 0x110) { this.syncTimers(); this.resync = true; const t = this.timers[(o - 0x100) >> 2]; if (o & 2) { const was = t.control & 0x80; t.control = v; if (!was && v & 0x80) { t.counter = t.reload; t.acc = 0; } } else t.reload = v; this.io[o] = v; this.io[o + 1] = v >> 8; return; }
    if (o >= 0x060 && o < 0x0A0) this.syncSound(); // sound registers and wave RAM: samples so far use the old value
    if (o >= 0x0A0 && o < 0x0A8) { this.io[o] = v; this.io[o + 1] = v >> 8; this.apu?.fifoWrite(o < 0xA4 ? 0 : 1, v); return; }
    this.io[o] = v; this.io[o + 1] = v >> 8;
    if (o >= 0x0B0 && o < 0x0E0) this.dmaWrite(o, v);
    if (o >= 0x060 && o < 0x0A0) this.apu?.registerWrite(o, v);
    if (o >= 0x028 && o < 0x040 && (o & 0xF) >= 8) this.ppu?.affineRefWrite(o);
  }
  // --- DMA -------------------------------------------------------------------------
  dmaWrite(o, v) {
    const ch = Math.floor((o - 0xB0) / 12), reg = (o - 0xB0) % 12, d = this.dma[ch];
    if (reg < 4) { const lo = this.io16(0xB0 + ch * 12), hi = this.io16(0xB2 + ch * 12); d.src = (lo | hi << 16) >>> 0; return; }
    if (reg < 8) { const lo = this.io16(0xB4 + ch * 12), hi = this.io16(0xB6 + ch * 12); d.dst = (lo | hi << 16) >>> 0; return; }
    if (reg === 8) { d.count = v; return; }
    const was = d.control & 0x8000; d.control = v;
    if (!was && v & 0x8000) {
      d.isrc = d.src & (ch ? 0x0FFFFFFF : 0x07FFFFFF); d.idst = d.dst & (ch === 3 ? 0x0FFFFFFF : 0x07FFFFFF);
      d.icount = d.count || (ch === 3 ? 0x10000 : 0x4000);
      if ((v >> 12 & 3) === 0) this.runDMA(ch);
    }
  }
  triggerDMA(timing) { for (let ch = 0; ch < 4; ch++) { const d = this.dma[ch]; if (d.control & 0x8000 && (d.control >> 12 & 3) === timing) this.runDMA(ch); } }
  soundDMA(fifo) { // timing 3 on channels 1/2 targeting a FIFO: four words
    for (const ch of [1, 2]) { const d = this.dma[ch]; if (d.control & 0x8000 && (d.control >> 12 & 3) === 3 && (d.dst & 0xFFFFFFF) === 0x040000A0 + fifo * 4) {
      for (let k = 0; k < 4; k++) { this.write32(0x040000A0 + fifo * 4, this.read32(d.isrc)); d.isrc = (d.isrc + ((d.control >> 7 & 3) === 1 ? -4 : 4)) >>> 0; }
      if (d.control & 0x4000) this.raise(IRQ.dma0 << ch);
    } }
  }
  runDMA(ch) {
    const d = this.dma[ch], word = d.control & 0x400, size = word ? 4 : 2, dstMode = d.control >> 5 & 3, srcMode = d.control >> 7 & 3;
    const ds = dstMode === 1 ? -size : dstMode === 2 ? 0 : size, ss = srcMode === 1 ? -size : srcMode === 2 ? 0 : size;
    for (let k = 0; k < d.icount; k++) {
      if (word) this.write32(d.idst, this.read32(d.isrc)); else this.write16(d.idst, this.read16(d.isrc));
      d.isrc = (d.isrc + ss) >>> 0; d.idst = (d.idst + ds) >>> 0;
    }
    this.cpu.cycles += d.icount * 2;
    if (d.control & 0x4000) this.raise(IRQ.dma0 << ch);
    if (d.control & 0x200 && (d.control >> 12 & 3) !== 0) { d.icount = d.count || (ch === 3 ? 0x10000 : 0x4000); if (dstMode === 3) d.idst = d.dst & 0x0FFFFFFF; }
    else { d.control &= ~0x8000; const o = 0xBA + ch * 12; this.io[o + 1] &= 0x7F; }
  }
  // --- timers / interrupts ---------------------------------------------------------
  // Timers and sound advance in batches (runUntil). A register access inside a batch first
  // brings them up to the start of the instruction making it, which is where the
  // per-instruction model had them.
  syncTimers() {
    if (!this.inBatch) return;
    const at = this.instrStart - this.batchStart, d = at - this.timerSync;
    if (d > 0) { this.timerSync = at; this.advanceTimers(d); }
  }
  syncSound() {
    if (!this.inBatch || !this.apu) return;
    const at = this.instrStart - this.batchStart, d = at - this.apuSync;
    if (d > 0) { this.apuSync = at; this.apu.clock(d); }
  }
  // Cycles until the first running prescaler timer overflows (cascading timers follow those).
  timerDue() {
    let due = Infinity;
    for (let k = 0; k < 4; k++) {
      const t = this.timers[k], ctl = t.control;
      if (!(ctl & 0x80) || (k && ctl & 4)) continue;
      const d = ((0x10000 - t.counter) << TIMER_SHIFT[ctl & 3]) - t.acc;
      if (d < due) due = d;
    }
    return due;
  }
  advanceTimers(cycles) {
    let overflowPrev = 0;
    for (let k = 0; k < 4; k++) {
      const t = this.timers[k], ctl = t.control; let overflows = 0;
      if (ctl & 0x80) {
        if (k && ctl & 4) { if (overflowPrev) { const n = t.counter + overflowPrev; overflows = 0; let c = n; while (c > 0xFFFF) { c = c - 0x10000 + t.reload; overflows++; } t.counter = c; } }
        else {
          const shift = TIMER_SHIFT[ctl & 3]; t.acc += cycles; const ticks = t.acc >> shift; t.acc -= ticks << shift;
          let c = t.counter + ticks; while (c > 0xFFFF) { c = c - 0x10000 + t.reload; overflows++; } t.counter = c;
        }
        if (overflows) { if (ctl & 0x40) this.raise(IRQ.timer0 << k); if (k < 2) for (let n = 0; n < overflows; n++) this.apu?.timerOverflow(k); }
      }
      overflowPrev = overflows;
    }
  }
  raise(bits) { this.io[0x202] |= bits & 0xFF; this.io[0x203] |= bits >> 8; }
  halt() { this.cpu.halted = true; }
  // --- BIOS ------------------------------------------------------------------------
  swi(n, ret) {
    const R = this.cpu.r, cpu = this.cpu; cpu.cycles += 20; this.dirty = true;
    switch (n) {
      case 0x00: this.cpu.reset(0x08000000); return;
      case 0x01: { const f = R[0]; if (f & 1) this.ewram.fill(0); if (f & 2) this.iwram.fill(0, 0, 0x7E00); if (f & 4) this.pal.fill(0); if (f & 8) this.vram.fill(0); if (f & 0x10) this.oam.fill(0); break; }
      case 0x02: this.halt(); break;
      case 0x04: case 0x05: {
        if (n === 5) { R[0] = 1; R[1] = 1; }
        if (R[0]) this.write16(0x03007FF8, this.read16(0x03007FF8) & ~R[1]);
        this.waitMask = R[1] & 0x3FFF; this.waitReturn = ret; this.waitThumb = cpu.t; this.io[0x208] = 1; this.halt();
        break;
      }
      case 0x06: case 0x07: {
        let a = R[0] | 0, b = R[1] | 0; if (n === 7) [a, b] = [b, a]; if (!b) break;
        const q = Math.trunc(a / b), r = a - q * b; R[0] = q >>> 0; R[1] = r >>> 0; R[3] = Math.abs(q) >>> 0; break;
      }
      case 0x08: R[0] = Math.floor(Math.sqrt(R[0])); break;
      case 0x0A: { const y = R[1] << 16 >> 16, x = R[0] << 16 >> 16; R[0] = Math.round(Math.atan2(y, x) / (2 * Math.PI) * 0x10000) & 0xFFFF; break; }
      case 0x0B: cpuSet(this, R[0], R[1], R[2]); break;
      case 0x0C: cpuFastSet(this, R[0], R[1], R[2]); break;
      case 0x0E: bgAffineSet(this, R[0], R[1], R[2]); break;
      case 0x0F: objAffineSet(this, R[0], R[1], R[2], R[3]); break;
      case 0x11: case 0x12: lz77(this, R[0], R[1], n === 0x12); break;
      case 0x13: huffUnComp(this, R[0], R[1]); break;
      case 0x14: case 0x15: rlUnComp(this, R[0], R[1], n === 0x15); break;
      case 0x19: break; // SoundBias: level ramp only
      case 0x1F: R[0] = midiKey2Freq(this, R[0], R[1], R[2]); break;
      default: throw Error(`Unimplemented BIOS service ${n.toString(16)} at ${(ret - (cpu.t ? 2 : 4)).toString(16)}`);
    }
    R[15] = ret >>> 0;
  }
  // --- scheduling ------------------------------------------------------------------
  keyInput(mask) { this.keys = mask & 0x3FF; }
  runFrame() {
    const cpu = this.cpu; this.dirty = true; // memory may have been changed from outside between frames
    for (let line = 0; line < LINES; line++) {
      this.line = line;
      if (line === VISIBLE) { this.raiseIf(8, IRQ.vblank); this.triggerDMA(1); this.ppu?.vblank(); }
      const vcountTarget = this.io16(4) >>> 8; if (line === vcountTarget && this.io16(4) & 0x20) this.raise(IRQ.vcount);
      this.runUntil(HDRAW);
      if (line < VISIBLE) { if (!this.skipRender) this.ppu?.renderLine(line); this.triggerDMA(2); }
      this.raiseIf(0x10, IRQ.hblank);
      this.runUntil(CYCLES_PER_LINE);
      this.lineCycle -= CYCLES_PER_LINE; // carry overshoot: frames stay exactly 280896 cycles
    }
    this.frame++; this.apu?.endFrame();
  }
  raiseIf(dispstatBit, irq) { if (this.io16(4) & dispstatBit) this.raise(irq); }
  // Run the CPU to a point on the current line. Timers and sound are brought up to date in
  // batches: a batch ends at the line target, when a timer overflow falls due (it is applied
  // after the instruction that reaches it), when the CPU halts, or when a timer register is
  // written. Interrupts are checked before every instruction.
  runUntil(target) {
    const cpu = this.cpu, io = this.io, apu = this.apu;
    while (this.lineCycle < target) {
      // Any enabled request ends HALT, even with IME clear; it is taken when IME and the CPU allow.
      if ((io[0x200] & io[0x202]) | (io[0x201] & io[0x203])) { cpu.halted = false; if (io[0x208] & 1 && !cpu.i) { this.dirty = true; cpu.irq(); } }
      let spent;
      if (cpu.halted) {
        // Halted time passes in fixed slices; the slice in which a timer overflows ends the wait.
        const slice = apu ? 64 : 4096, remaining = target - this.lineCycle, due = this.timerDue();
        spent = Math.min(remaining, due > slice ? Math.ceil(due / slice) * slice : slice);
        cpu.cycles += spent;
        apu?.clock(spent); this.advanceTimers(spent);
      } else {
        const start = cpu.cycles, stop = start + Math.min(target - this.lineCycle, this.timerDue());
        this.batchStart = start; this.timerSync = 0; this.apuSync = 0; this.resync = false; this.inBatch = true; this.stopCycles = stop;
        for (;;) {
          this.instrStart = cpu.cycles;
          cpu.step();
          if (this.waitMask && cpu.r[15] === this.waitReturn && cpu.t === this.waitThumb && !cpu.halted) {
            const flags = this.read16(0x03007FF8);
            if (flags & this.waitMask) { this.write16(0x03007FF8, flags & ~this.waitMask); this.waitMask = 0; this.waitReturn = -1; }
            else this.halt();
          }
          if (cpu.cycles >= stop || cpu.halted || this.resync) break;
          if ((io[0x200] & io[0x202]) | (io[0x201] & io[0x203])) { cpu.halted = false; if (io[0x208] & 1 && !cpu.i) { this.dirty = true; cpu.irq(); } }
        }
        this.inBatch = false; this.stopCycles = 0;
        spent = cpu.cycles - start;
        apu?.clock(spent - this.apuSync); this.advanceTimers(spent - this.timerSync);
      }
      this.lineCycle += spent;
    }
  }
  // --- snapshots -------------------------------------------------------------------
  snapshot() {
    const c = this.cpu;
    return {ewram: this.ewram.slice(), iwram: this.iwram.slice(), io: this.io.slice(), pal: this.pal.slice(), vram: this.vram.slice(), oam: this.oam.slice(), sram: this.sram.slice(),
      cpu: {r: Array.from(c.r), cpsr: c.cpsr, bankSP: Array.from(c.bankSP), bankLR: Array.from(c.bankLR), bankSPSR: Array.from(c.bankSPSR), fiqHi: Array.from(c.fiqHi), usrHi: Array.from(c.usrHi), halted: c.halted, cycles: c.cycles},
      timers: structuredClone(this.timers), dma: structuredClone(this.dma), line: this.line, lineCycle: this.lineCycle, frame: this.frame, keys: this.keys,
      wait: [this.waitMask, this.waitReturn, this.waitThumb], apu: this.apu?.snapshot?.()};
  }
  restore(s) {
    for (const k of ['ewram', 'iwram', 'io', 'pal', 'vram', 'oam', 'sram']) this[k].set(s[k]);
    const c = this.cpu; c.mode = s.cpu.cpsr & 0x1F; c.r.set(s.cpu.r); c.cpsr = s.cpu.cpsr;
    for (const k of ['bankSP', 'bankLR', 'bankSPSR', 'fiqHi', 'usrHi']) c[k].set(s.cpu[k]);
    c.halted = s.cpu.halted; c.cycles = s.cpu.cycles;
    this.timers = structuredClone(s.timers); this.dma = structuredClone(s.dma); this.line = s.line; this.lineCycle = s.lineCycle; this.frame = s.frame; this.keys = s.keys;
    [this.waitMask, this.waitReturn, this.waitThumb] = s.wait; if (s.apu) this.apu?.restore?.(s.apu);
    this.dirty = true;
  }
}
