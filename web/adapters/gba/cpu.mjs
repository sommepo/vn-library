// ARM7TDMI interpreter (ARM and Thumb states) for bounded native execution of an
// owner-supplied GBA cartridge. Original implementation from the public ARM
// architecture reference; timing is approximate (one cycle per instruction plus
// the bus cost reported by the memory map). SWI and IRQ entry are delegated to the
// host so no proprietary BIOS is needed.
const MODE = {usr: 0x10, fiq: 0x11, irq: 0x12, svc: 0x13, abt: 0x17, und: 0x1B, sys: 0x1F};
const bankOf = mode => ({0x10: 0, 0x1F: 0, 0x11: 1, 0x12: 2, 0x13: 3, 0x17: 4, 0x1B: 5})[mode] ?? 0;
const ror = (v, n) => (n &= 31) ? (v >>> n | v << (32 - n)) >>> 0 : v >>> 0;

export class ARM7 {
  constructor(bus) {
    this.bus = bus; this.r = new Uint32Array(16);
    this.bankSP = new Uint32Array(6); this.bankLR = new Uint32Array(6); this.bankSPSR = new Uint32Array(6);
    this.fiqHi = new Uint32Array(5); this.usrHi = new Uint32Array(5);
    this.n = 0; this.z = 0; this.c = 0; this.v = 0; this.i = 1; this.f = 1; this.t = 0; this.mode = MODE.sys;
    this.cycles = 0; this.halted = false; this.onSWI = null; this.hooks = null;
    // Idle-loop detection (see backward()).
    this.idleSkip = true; this.loopPC = -1; this.loopValid = false; this.loopPeriod = 0; this.loopCycles = 0; this.loopFlags = 0; this.loopRegs = new Uint32Array(15);
  }
  // A taken backward branch at pc. A loop that comes round to the same branch with every
  // register and flag unchanged, having written nothing and read no I/O (the bus marks
  // those as `dirty`), repeats exactly until something outside the CPU changes, and that
  // only happens at the bus's next event (`stopCycles`). Whole turns of such a loop are
  // skipped by adding their cycles; the turn in progress at the event still runs.
  backward(pc) {
    const bus = this.bus;
    if (pc !== this.loopPC || bus.dirty) { this.loopPC = pc; bus.dirty = false; this.loopValid = false; this.loopPeriod = 0; this.loopCycles = this.cycles; return; }
    const R = this.r, S = this.loopRegs, flags = this.cpsr;
    let same = this.loopValid && flags === this.loopFlags;
    for (let k = 0; same && k < 15; k++) same = R[k] === S[k];
    if (same) {
      if (!this.loopPeriod) this.loopPeriod = this.cycles - this.loopCycles; // one turn, measured between two clean passes
      const turns = Math.floor((bus.stopCycles - this.cycles - 1) / this.loopPeriod);
      if (turns > 0 && this.idleSkip) this.cycles += turns * this.loopPeriod;
      return;
    }
    for (let k = 0; k < 15; k++) S[k] = R[k];
    this.loopFlags = flags; this.loopValid = true; this.loopPeriod = 0; this.loopCycles = this.cycles;
  }
  get cpsr() { return (this.n << 31 | this.z << 30 | this.c << 29 | this.v << 28 | this.i << 7 | this.f << 6 | this.t << 5 | this.mode) >>> 0; }
  set cpsr(value) {
    this.setMode(value & 0x1F);
    this.n = value >>> 31 & 1; this.z = value >>> 30 & 1; this.c = value >>> 29 & 1; this.v = value >>> 28 & 1;
    this.i = value >>> 7 & 1; this.f = value >>> 6 & 1; this.t = value >>> 5 & 1;
  }
  get spsr() { const b = bankOf(this.mode); return b ? this.bankSPSR[b] : this.cpsr; }
  set spsr(v) { const b = bankOf(this.mode); if (b) this.bankSPSR[b] = v >>> 0; }
  setMode(mode) {
    if (mode === this.mode) return;
    const from = bankOf(this.mode), to = bankOf(mode);
    if (from !== to) {
      this.bus.dirty = true; // banked registers are not part of the idle-loop comparison
      this.bankSP[from] = this.r[13]; this.bankLR[from] = this.r[14];
      if (this.mode === MODE.fiq) for (let k = 0; k < 5; k++) { this.fiqHi[k] = this.r[8 + k]; this.r[8 + k] = this.usrHi[k]; }
      if (mode === MODE.fiq) for (let k = 0; k < 5; k++) { this.usrHi[k] = this.r[8 + k]; this.r[8 + k] = this.fiqHi[k]; }
      this.r[13] = this.bankSP[to]; this.r[14] = this.bankLR[to];
    }
    this.mode = mode;
  }
  reset(pc, sp = 0x03007F00) {
    this.setMode(MODE.irq); this.r[13] = 0x03007FA0; this.setMode(MODE.svc); this.r[13] = 0x03007FE0;
    this.setMode(MODE.sys); this.r[13] = sp; this.r[15] = pc >>> 0; this.t = pc & 1; this.r[15] &= ~1; this.i = 0; this.f = 1;
  }
  // Exception entry used for IRQ (vector handled by the host's BIOS stub address).
  exception(mode, vector, returnAddress) {
    const saved = this.cpsr; this.setMode(mode); this.spsr = saved; this.r[14] = returnAddress >>> 0;
    this.t = 0; this.i = 1; if (mode === MODE.fiq) this.f = 1; this.r[15] = vector >>> 0;
  }
  irq() {
    if (this.i) return false;
    this.halted = false;
    this.exception(MODE.irq, 0x18, this.r[15] + 4); // ARM: LR = next instruction + 4 (SUBS PC,LR,#4 returns)
    return true;
  }
  cond(cc) {
    switch (cc) {
      case 0: return this.z; case 1: return !this.z; case 2: return this.c; case 3: return !this.c;
      case 4: return this.n; case 5: return !this.n; case 6: return this.v; case 7: return !this.v;
      case 8: return this.c && !this.z; case 9: return !this.c || this.z; case 10: return this.n === this.v;
      case 11: return this.n !== this.v; case 12: return !this.z && this.n === this.v; case 13: return this.z || this.n !== this.v;
      case 14: return 1; default: return 0;
    }
  }
  nz(v) { this.n = v >>> 31; this.z = v === 0 ? 1 : 0; }
  add(a, b, carry = 0) {
    const r = (a + b + carry) >>> 0; this.c = (a + b + carry) > 0xFFFFFFFF ? 1 : 0;
    this.v = (~(a ^ b) & (a ^ r)) >>> 31; this.nz(r); return r;
  }
  sub(a, b, carry = 1) { // a - b - !carry
    const r = (a - b - (1 - carry)) >>> 0; this.c = a - b - (1 - carry) >= 0 ? 1 : 0;
    this.v = ((a ^ b) & (a ^ r)) >>> 31; this.nz(r); return r;
  }
  // Barrel shifter. Returns value; sets this.sc (shifter carry).
  shift(type, v, amount, reg) {
    v >>>= 0;
    switch (type) {
      case 0: // LSL
        if (amount === 0) { this.sc = this.c; return v; }
        if (amount < 32) { this.sc = v >>> (32 - amount) & 1; return (v << amount) >>> 0; }
        this.sc = amount === 32 ? v & 1 : 0; return 0;
      case 1: // LSR
        if (amount === 0) { if (reg) { this.sc = this.c; return v; } amount = 32; }
        if (amount < 32) { this.sc = v >>> (amount - 1) & 1; return v >>> amount; }
        this.sc = amount === 32 ? v >>> 31 : 0; return 0;
      case 2: // ASR
        if (amount === 0) { if (reg) { this.sc = this.c; return v; } amount = 32; }
        if (amount < 32) { this.sc = v >>> (amount - 1) & 1; return (v | 0) >> amount >>> 0; }
        this.sc = v >>> 31; return v >>> 31 ? 0xFFFFFFFF : 0;
      default: // ROR / RRX
        if (amount === 0) { if (reg) { this.sc = this.c; return v; } this.sc = v & 1; return (this.c << 31 | v >>> 1) >>> 0; }
        amount &= 31; if (amount === 0) { this.sc = v >>> 31; return v; }
        this.sc = v >>> (amount - 1) & 1; return ror(v, amount);
    }
  }
  step() {
    if (this.halted) { this.cycles += 4; return; }
    if (this.hooks) { const pc = this.r[15] | this.t; const h = this.hooks.get(pc); if (h && h(this) === false) return; }
    if (this.t) this.thumb(); else this.arm();
  }
  read32(a) { return this.bus.read32(a); } read16(a) { return this.bus.read16(a); } read8(a) { return this.bus.read8(a); }
  // Unaligned LDR rotates within the word, as on hardware.
  ldr(a) { const v = this.bus.read32(a & ~3); return ror(v, (a & 3) * 8); }
  branchX(value) { this.t = value & 1; this.r[15] = (value & ~(this.t ? 1 : 3)) >>> 0; }
  arm() {
    const pc = this.r[15], op = this.bus.fetch32(pc), region = pc >>> 24; this.r[15] = pc + 4; this.cycles += region >= 8 ? 4 : region === 2 ? 6 : 1;
    if (op >>> 28 !== 14 && !this.cond(op >>> 28)) return;
    const R = this.r;
    if ((op & 0x0FFFFFF0) === 0x012FFF10) { const n = op & 15; this.branchX(n === 15 ? pc + 8 : R[n]); return; } // BX
    switch (op >>> 25 & 7) {
      case 5: { // B/BL
        const off = (op << 8 >> 6); if (op & 0x01000000) R[14] = pc + 4; R[15] = (pc + 8 + off) >>> 0; if (off <= -8 && !(op & 0x01000000)) this.backward(pc); return;
      }
      case 7: if (op & 0x01000000) { this.swi(op >>> 16 & 0xFF, pc + 4); return; } break;
      case 4: { // LDM/STM
        const pre = op >>> 24 & 1, up = op >>> 23 & 1, sbit = op >>> 22 & 1, wb = op >>> 21 & 1, load = op >>> 20 & 1, rn = op >>> 16 & 15, list = op & 0xFFFF;
        let count = 0; for (let k = 0; k < 16; k++) if (list >> k & 1) count++;
        const base = R[rn]; let addr = up ? base : base - count * 4; if (pre === up) addr += 4;
        const final = up ? base + count * 4 : base - count * 4;
        const userBank = sbit && !(load && list & 0x8000), prevMode = this.mode; if (userBank) this.setMode(MODE.sys);
        if (load) {
          if (wb) R[rn] = final >>> 0;
          for (let k = 0; k < 16; k++) if (list >> k & 1) { const v = this.bus.read32(addr & ~3); if (k === 15) { R[15] = v & ~3; if (sbit) { this.cpsr = this.spsr; if (this.t) R[15] = v & ~1; } } else R[k] = v; addr += 4; }
        } else {
          let first = true;
          for (let k = 0; k < 16; k++) if (list >> k & 1) { this.bus.write32(addr & ~3, k === 15 ? pc + 12 : (k === rn && !first && wb ? final : R[k])); first = false; addr += 4; }
          if (wb) R[rn] = final >>> 0;
        }
        if (userBank) this.setMode(prevMode);
        this.cycles += count; return;
      }
      case 2: case 3: { // LDR/STR
        const imm = !(op >>> 25 & 1), pre = op >>> 24 & 1, up = op >>> 23 & 1, byte = op >>> 22 & 1, wb = op >>> 21 & 1, load = op >>> 20 & 1, rn = op >>> 16 & 15, rd = op >>> 12 & 15;
        const off = imm ? op & 0xFFF : this.shift(op >>> 5 & 3, R[op & 15], op >>> 7 & 31, false);
        const base = rn === 15 ? pc + 8 : R[rn], addr = (pre ? (up ? base + off : base - off) : base) >>> 0, next = (up ? base + off : base - off) >>> 0;
        if (load) {
          const v = byte ? this.bus.read8(addr) : this.ldr(addr);
          if (!pre || wb) R[rn] = pre ? addr : next;
          if (rd === 15) this.branchX(byte ? v : v & ~3); else R[rd] = v;
        } else {
          const v = rd === 15 ? pc + 12 : R[rd];
          if (byte) this.bus.write8(addr, v); else this.bus.write32(addr & ~3, v);
          if (!pre || wb) R[rn] = pre ? addr : next;
        }
        this.cycles += 2; return;
      }
    }
    // Multiply, swap, halfword transfers share the 000 space with bit 7 and bit 4 set.
    if ((op & 0x0E000090) === 0x00000090) {
      const sh = op >>> 5 & 3;
      if (sh === 0) {
        if ((op & 0x0FC000F0) === 0x00000090) { // MUL/MLA
          const rd = op >>> 16 & 15, rn = op >>> 12 & 15, rs = op >>> 8 & 15, rm = op & 15;
          let v = Math.imul(R[rm], R[rs]) >>> 0; if (op & 0x00200000) v = (v + R[rn]) >>> 0;
          R[rd] = v; if (op & 0x00100000) this.nz(v); this.cycles += 2; return;
        }
        if ((op & 0x0F8000F0) === 0x00800090) { // long multiply
          const signed = op >>> 22 & 1, acc = op >>> 21 & 1, hi = op >>> 16 & 15, lo = op >>> 12 & 15, rs = op >>> 8 & 15, rm = op & 15;
          let prod = signed ? BigInt.asIntN(32, BigInt(R[rm])) * BigInt.asIntN(32, BigInt(R[rs])) : BigInt(R[rm]) * BigInt(R[rs]);
          if (acc) prod += BigInt(R[hi]) << 32n | BigInt(R[lo]);
          prod = BigInt.asUintN(64, prod); R[lo] = Number(prod & 0xFFFFFFFFn); R[hi] = Number(prod >> 32n);
          if (op & 0x00100000) { this.n = R[hi] >>> 31; this.z = prod === 0n ? 1 : 0; }
          this.cycles += 3; return;
        }
        if ((op & 0x0FB00FF0) === 0x01000090) { // SWP
          const rn = op >>> 16 & 15, rd = op >>> 12 & 15, rm = op & 15, byte = op >>> 22 & 1, a = R[rn];
          const v = byte ? this.bus.read8(a) : this.ldr(a); if (byte) this.bus.write8(a, R[rm]); else this.bus.write32(a & ~3, R[rm]); R[rd] = v; return;
        }
      } else { // LDRH/STRH/LDRSB/LDRSH
        const pre = op >>> 24 & 1, up = op >>> 23 & 1, imm = op >>> 22 & 1, wb = op >>> 21 & 1, load = op >>> 20 & 1, rn = op >>> 16 & 15, rd = op >>> 12 & 15;
        const off = imm ? (op >>> 4 & 0xF0 | op & 15) : R[op & 15];
        const base = rn === 15 ? pc + 8 : R[rn], addr = (pre ? (up ? base + off : base - off) : base) >>> 0, next = (up ? base + off : base - off) >>> 0;
        if (load) {
          let v;
          if (sh === 1) v = addr & 1 ? ror(this.bus.read16(addr & ~1), 8) : this.bus.read16(addr);
          else if (sh === 2) v = this.bus.read8(addr) << 24 >> 24 >>> 0;
          else v = addr & 1 ? this.bus.read8(addr) << 24 >> 24 >>> 0 : this.bus.read16(addr) << 16 >> 16 >>> 0;
          if (!pre || wb) R[rn] = pre ? addr : next;
          R[rd] = v;
        } else {
          this.bus.write16(addr & ~1, rd === 15 ? pc + 12 : R[rd]);
          if (!pre || wb) R[rn] = pre ? addr : next;
        }
        this.cycles += 2; return;
      }
    }
    // PSR transfer
    if ((op & 0x0FBF0FFF) === 0x010F0000) { R[op >>> 12 & 15] = op & 0x00400000 ? this.spsr : this.cpsr; return; }
    if ((op & 0x0DB0F000) === 0x0120F000) {
      const spsrDest = op & 0x00400000, fields = op >>> 16 & 15;
      const v = op & 0x02000000 ? ror(op & 0xFF, (op >>> 8 & 15) * 2) : R[op & 15];
      let mask = 0; if (fields & 8) mask |= 0xFF000000; if (fields & 1) mask |= 0xFF;
      if (spsrDest) this.spsr = (this.spsr & ~mask | v & mask) >>> 0;
      else { if (this.mode === MODE.usr) mask &= 0xFF000000; this.cpsr = (this.cpsr & ~mask | v & mask) >>> 0; }
      return;
    }
    // Data processing
    const opc = op >>> 21 & 15, s = op >>> 20 & 1, rn = op >>> 16 & 15, rd = op >>> 12 & 15;
    let b;
    if (op & 0x02000000) { const rot = (op >>> 8 & 15) * 2; b = ror(op & 0xFF, rot); this.sc = rot ? b >>> 31 : this.c; }
    else if (op & 0x10) { const amt = R[op >>> 8 & 15] & 0xFF, rm = op & 15; b = this.shift(op >>> 5 & 3, rm === 15 ? pc + 12 : R[rm], amt, true); this.cycles++; }
    else { const rm = op & 15; b = this.shift(op >>> 5 & 3, rm === 15 ? pc + 8 : R[rm], op >>> 7 & 31, false); }
    const a = rn === 15 ? (op & 0x02000000 || !(op & 0x10) ? pc + 8 : pc + 12) : R[rn];
    this.dataOp(opc, s, rd, a >>> 0, b >>> 0);
  }
  dataOp(opc, s, rd, a, b) {
    const R = this.r, n0 = this.n, z0 = this.z, c0 = this.c, v0 = this.v;
    let v, write = true, logical = false;
    switch (opc) {
      case 0: v = (a & b) >>> 0; logical = true; break;
      case 1: v = (a ^ b) >>> 0; logical = true; break;
      case 2: v = this.sub(a, b); break;
      case 3: v = this.sub(b, a); break;
      case 4: v = this.add(a, b); break;
      case 5: v = this.add(a, b, c0); break;
      case 6: v = this.sub(a, b, c0); break;
      case 7: v = this.sub(b, a, c0); break;
      case 8: v = (a & b) >>> 0; logical = true; write = false; break;
      case 9: v = (a ^ b) >>> 0; logical = true; write = false; break;
      case 10: v = this.sub(a, b); write = false; break;
      case 11: v = this.add(a, b); write = false; break;
      case 12: v = (a | b) >>> 0; logical = true; break;
      case 13: v = b; logical = true; break;
      case 14: v = (a & ~b) >>> 0; logical = true; break;
      default: v = ~b >>> 0; logical = true;
    }
    if (!s) { this.n = n0; this.z = z0; this.c = c0; this.v = v0; }
    else if (logical) { this.nz(v); this.c = this.sc; this.v = v0; }
    if (write) {
      if (rd === 15) {
        if (s) { this.cpsr = this.spsr; R[15] = (v & ~(this.t ? 1 : 3)) >>> 0; }
        else R[15] = (v & ~3) >>> 0;
      } else R[rd] = v;
    }
  }
  thumb() {
    const pc = this.r[15], op = this.bus.fetch16(pc), region = pc >>> 24; this.r[15] = pc + 2; this.cycles += region >= 8 ? 2 : region === 2 ? 3 : 1;
    const R = this.r;
    switch (op >>> 13) {
      case 0: {
        if ((op >>> 11 & 3) === 3) { // add/sub
          const imm = op >>> 10 & 1, sub = op >>> 9 & 1, rn = op >>> 6 & 7, rs = op >>> 3 & 7, rd = op & 7;
          const b = imm ? rn : R[rn]; R[rd] = sub ? this.sub(R[rs], b) : this.add(R[rs], b); return;
        }
        const type = op >>> 11 & 3, amt = op >>> 6 & 31, rs = op >>> 3 & 7, rd = op & 7;
        const v = this.shift(type, R[rs], amt, false); R[rd] = v; this.nz(v); this.c = this.sc; return;
      }
      case 1: { // mov/cmp/add/sub imm8
        const o = op >>> 11 & 3, rd = op >>> 8 & 7, imm = op & 0xFF;
        if (o === 0) { R[rd] = imm; this.nz(imm); }
        else if (o === 1) this.sub(R[rd], imm);
        else if (o === 2) R[rd] = this.add(R[rd], imm);
        else R[rd] = this.sub(R[rd], imm);
        return;
      }
      case 2: {
        if ((op >>> 10) === 0x10) { // ALU
          const o = op >>> 6 & 15, rs = op >>> 3 & 7, rd = op & 7, a = R[rd], b = R[rs];
          switch (o) {
            case 0: R[rd] = (a & b) >>> 0; this.nz(R[rd]); break;
            case 1: R[rd] = (a ^ b) >>> 0; this.nz(R[rd]); break;
            case 2: R[rd] = this.shift(0, a, b & 0xFF, true); this.nz(R[rd]); this.c = this.sc; break;
            case 3: R[rd] = this.shift(1, a, b & 0xFF, true); this.nz(R[rd]); this.c = this.sc; break;
            case 4: R[rd] = this.shift(2, a, b & 0xFF, true); this.nz(R[rd]); this.c = this.sc; break;
            case 5: R[rd] = this.add(a, b, this.c); break;
            case 6: R[rd] = this.sub(a, b, this.c); break;
            case 7: R[rd] = this.shift(3, a, b & 0xFF, true); this.nz(R[rd]); this.c = this.sc; break;
            case 8: this.nz((a & b) >>> 0); break;
            case 9: R[rd] = this.sub(0, b); break;
            case 10: this.sub(a, b); break;
            case 11: this.add(a, b); break;
            case 12: R[rd] = (a | b) >>> 0; this.nz(R[rd]); break;
            case 13: R[rd] = Math.imul(a, b) >>> 0; this.nz(R[rd]); break;
            case 14: R[rd] = (a & ~b) >>> 0; this.nz(R[rd]); break;
            default: R[rd] = ~b >>> 0; this.nz(R[rd]);
          }
          return;
        }
        if ((op >>> 10) === 0x11) { // hi register ops / BX
          const o = op >>> 8 & 3, rs = op >>> 3 & 15, rd = (op & 7) | (op >>> 4 & 8);
          const vs = rs === 15 ? pc + 4 : R[rs];
          if (o === 0) { const v = ((rd === 15 ? pc + 4 : R[rd]) + vs) >>> 0; if (rd === 15) R[15] = v & ~1; else R[rd] = v; }
          else if (o === 1) this.sub(rd === 15 ? pc + 4 : R[rd], vs);
          else if (o === 2) { if (rd === 15) R[15] = vs & ~1; else R[rd] = vs; }
          else this.branchX(vs);
          return;
        }
        if ((op >>> 11) === 9) { R[op >>> 8 & 7] = this.bus.read32(((pc + 4) & ~3) + (op & 0xFF) * 4); this.cycles += 2; return; } // LDR pc-relative
        const ro = op >>> 6 & 7, rb = op >>> 3 & 7, rd = op & 7, addr = (R[rb] + R[ro]) >>> 0;
        this.cycles += 2;
        if (op & 0x0200) { // sign-extended / halfword
          switch (op >>> 10 & 3) {
            case 0: this.bus.write16(addr & ~1, R[rd]); break;
            case 1: R[rd] = this.bus.read8(addr) << 24 >> 24 >>> 0; break;
            case 2: R[rd] = addr & 1 ? ror(this.bus.read16(addr & ~1), 8) : this.bus.read16(addr); break;
            default: R[rd] = addr & 1 ? this.bus.read8(addr) << 24 >> 24 >>> 0 : this.bus.read16(addr) << 16 >> 16 >>> 0;
          }
        } else switch (op >>> 10 & 3) {
          case 0: this.bus.write32(addr & ~3, R[rd]); break;
          case 1: this.bus.write8(addr, R[rd]); break;
          case 2: R[rd] = this.ldr(addr); break;
          default: R[rd] = this.bus.read8(addr);
        }
        return;
      }
      case 3: { // LDR/STR imm offset
        const byte = op >>> 12 & 1, load = op >>> 11 & 1, off = op >>> 6 & 31, rb = op >>> 3 & 7, rd = op & 7;
        const addr = (R[rb] + (byte ? off : off * 4)) >>> 0; this.cycles += 2;
        if (load) R[rd] = byte ? this.bus.read8(addr) : this.ldr(addr);
        else if (byte) this.bus.write8(addr, R[rd]); else this.bus.write32(addr & ~3, R[rd]);
        return;
      }
      case 4: {
        this.cycles += 2;
        if (!(op & 0x1000)) { // STRH/LDRH imm
          const addr = (R[op >>> 3 & 7] + (op >>> 6 & 31) * 2) >>> 0, rd = op & 7;
          if (op & 0x0800) R[rd] = addr & 1 ? ror(this.bus.read16(addr & ~1), 8) : this.bus.read16(addr); else this.bus.write16(addr & ~1, R[rd]);
          return;
        }
        const rd = op >>> 8 & 7, addr = (R[13] + (op & 0xFF) * 4) >>> 0; // SP-relative
        if (op & 0x0800) R[rd] = this.ldr(addr); else this.bus.write32(addr & ~3, R[rd]);
        return;
      }
      case 5: {
        if (!(op & 0x1000)) { const rd = op >>> 8 & 7, imm = (op & 0xFF) * 4; R[rd] = op & 0x0800 ? (R[13] + imm) >>> 0 : (((pc + 4) & ~3) + imm) >>> 0; return; }
        if ((op & 0x0F00) === 0x0000) { const imm = (op & 0x7F) * 4; R[13] = (op & 0x80 ? R[13] - imm : R[13] + imm) >>> 0; return; }
        if ((op & 0x0600) === 0x0400) { // PUSH/POP
          const load = op & 0x0800, extra = op & 0x0100, list = op & 0xFF;
          if (load) {
            let a = R[13];
            for (let k = 0; k < 8; k++) if (list >> k & 1) { R[k] = this.bus.read32(a & ~3); a += 4; this.cycles++; }
            if (extra) { R[15] = this.bus.read32(a & ~3) & ~1; a += 4; }
            R[13] = a >>> 0;
          } else {
            let count = extra ? 1 : 0; for (let k = 0; k < 8; k++) if (list >> k & 1) count++;
            let a = (R[13] - count * 4) >>> 0; R[13] = a;
            for (let k = 0; k < 8; k++) if (list >> k & 1) { this.bus.write32(a, R[k]); a += 4; this.cycles++; }
            if (extra) this.bus.write32(a, R[14]);
          }
          return;
        }
        break;
      }
      case 6: {
        if (!(op & 0x1000)) { // LDMIA/STMIA
          const load = op & 0x0800, rb = op >>> 8 & 7, list = op & 0xFF; let a = R[rb];
          if (!list) { if (load) R[15] = this.bus.read32(a & ~3) & ~1; else this.bus.write32(a & ~3, pc + 6); R[rb] = a + 0x40; return; }
          for (let k = 0; k < 8; k++) if (list >> k & 1) {
            if (load) R[k] = this.bus.read32(a & ~3); else this.bus.write32(a & ~3, R[k]);
            a += 4; this.cycles++;
          }
          if (!(load && list >> rb & 1)) R[rb] = a >>> 0;
          return;
        }
        const cc = op >>> 8 & 15;
        if (cc === 15) { this.swi(op & 0xFF, pc + 2); return; }
        if (cc === 14) break;
        if (this.cond(cc)) { const off = (op & 0xFF) << 24 >> 23; R[15] = (pc + 4 + off) >>> 0; this.cycles += 2; if (off <= -4) this.backward(pc); }
        return;
      }
      case 7: {
        const h = op >>> 11 & 3;
        if (h === 0) { const off = (op & 0x7FF) << 21 >> 20; R[15] = (pc + 4 + off) >>> 0; this.cycles += 2; if (off <= -4) this.backward(pc); return; }
        if (h === 2) { R[14] = (pc + 4 + ((op & 0x7FF) << 21 >> 9)) >>> 0; return; }
        if (h === 3) { const target = (R[14] + (op & 0x7FF) * 2) >>> 0; R[14] = (pc + 2) | 1; R[15] = target & ~1; this.cycles += 2; return; }
        break; // BLX (ARMv5) is not ARM7TDMI
      }
    }
    throw Error(`Undefined Thumb instruction ${op.toString(16)} at ${pc.toString(16)}`);
  }
  swi(number, returnAddress) {
    if (!this.onSWI) throw Error(`SWI ${number.toString(16)} without a host handler`);
    this.onSWI(number, returnAddress);
  }
}
export {MODE};
