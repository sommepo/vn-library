// GBA sound: Direct Sound A/B FIFOs (timer-driven, DMA-refilled) and the four PSG
// channels, mixed to stereo float samples. Original implementation from public
// hardware documentation. The game's own sound driver runs on the emulated CPU.
const CPU_HZ = 16777216, DUTY = [0.125, 0.25, 0.5, 0.75], PSG_VOLUME = [0.25, 0.5, 1, 0], WAVE_VOLUME = [0, 1, 0.5, 0.25];
export class APU {
  constructor(machine, rate = 48000) {
    this.m = machine; this.rate = rate; this.cyclesPerSample = CPU_HZ / rate; this.acc = 0;
    this.fifo = [new Int8Array(32), new Int8Array(32)]; this.fifoLen = [0, 0]; this.fifoR = [0, 0]; this.fifoW = [0, 0]; this.ds = [0, 0];
    this.out = new Float32Array(rate); this.outLen = 0; // one second of interleaved stereo at most per drain
    this.sq = [0, 1].map(() => ({on: 0, phase: 0, freq: 0, vol: 0, env: 0, envDir: 0, envStep: 0, envTimer: 0, len: 0, useLen: 0, duty: 2, sweepTime: 0, sweepDir: 0, sweepShift: 0, sweepTimer: 0}));
    this.wave = {on: 0, phase: 0, freq: 0, vol: 0, len: 0, useLen: 0};
    this.noise = {on: 0, lfsr: 0x7FFF, acc: 0, rate: 0, short: 0, vol: 0, env: 0, envDir: 0, envStep: 0, envTimer: 0, len: 0, useLen: 0};
    this.seqCycles = 0; this.seqStep = 0; this.muted = false; this.psg = new Float64Array(4);
  }
  reg(o) { return this.m.io16(o); }
  fifoWrite(ch, v) { for (const b of [v & 0xFF, v >> 8]) if (this.fifoLen[ch] < 32) { this.fifo[ch][this.fifoW[ch]] = b; this.fifoW[ch] = (this.fifoW[ch] + 1) & 31; this.fifoLen[ch]++; } }
  resetFifo(ch) { this.fifoLen[ch] = 0; this.fifoR[ch] = 0; this.fifoW[ch] = 0; }
  timerOverflow(timer) {
    const h = this.reg(0x82);
    for (let ch = 0; ch < 2; ch++) {
      if ((h >> (10 + ch * 4) & 1) !== timer) continue;
      if (this.fifoLen[ch]) { this.ds[ch] = this.fifo[ch][this.fifoR[ch]]; this.fifoR[ch] = (this.fifoR[ch] + 1) & 31; this.fifoLen[ch]--; }
      if (this.fifoLen[ch] <= 16) this.m.soundDMA(ch);
    }
  }
  registerWrite(o, v) {
    const sq = o < 0x68 ? this.sq[0] : o < 0x70 ? this.sq[1] : null;
    switch (o) {
      case 0x60: sq.sweepShift = v & 7; sq.sweepDir = v >> 3 & 1; sq.sweepTime = v >> 4 & 7; break;
      case 0x62: case 0x68: { const s = o === 0x62 ? this.sq[0] : this.sq[1]; s.len = 64 - (v & 63); s.duty = v >> 6 & 3; s.envStep = v >> 8 & 7; s.envDir = v >> 11 & 1; s.env = v >> 12; break; }
      case 0x64: case 0x6C: { const s = o === 0x64 ? this.sq[0] : this.sq[1]; s.freq = v & 0x7FF; s.useLen = v >> 14 & 1; if (v & 0x8000) { s.on = s.env > 0 || s.envDir ? 1 : 0; s.vol = s.env; s.envTimer = s.envStep; s.sweepTimer = s.sweepTime; if (!s.len) s.len = 64; } break; }
      case 0x72: this.wave.len = 256 - (v & 0xFF); this.wave.vol = v >> 13 & 3; this.wave.force = v >> 15; break;
      case 0x74: this.wave.freq = v & 0x7FF; this.wave.useLen = v >> 14 & 1; if (v & 0x8000 && this.reg(0x70) & 0x80) { this.wave.on = 1; this.wave.phase = 0; if (!this.wave.len) this.wave.len = 256; } break;
      case 0x70: if (!(v & 0x80)) this.wave.on = 0; break;
      case 0x78: { const n = this.noise; n.len = 64 - (v & 63); n.envStep = v >> 8 & 7; n.envDir = v >> 11 & 1; n.env = v >> 12; break; }
      case 0x7C: { const n = this.noise, r = v & 7, s = v >> 4 & 15; n.rate = 524288 / (r || 0.5) / (1 << (s + 1)); n.short = v >> 3 & 1; n.useLen = v >> 14 & 1; if (v & 0x8000) { n.on = n.env > 0 || n.envDir ? 1 : 0; n.vol = n.env; n.envTimer = n.envStep; n.lfsr = n.short ? 0x7F : 0x7FFF; if (!n.len) n.len = 64; } break; }
      case 0x82: if (v & 0x0800) this.resetFifo(0); if (v & 0x8000) this.resetFifo(1); break;
      case 0x84: if (!(v & 0x80)) { this.sq[0].on = this.sq[1].on = this.wave.on = this.noise.on = 0; } break;
    }
  }
  // 512 Hz frame sequencer: length (256 Hz), sweep (128 Hz), envelope (64 Hz).
  sequence() {
    const s = this.seqStep++ & 7, chans = this.envelopes ??= [this.sq[0], this.sq[1], this.noise];
    if (!(s & 1)) { for (const c of chans) if (c.useLen && c.len && --c.len === 0) c.on = 0; const c = this.wave; if (c.useLen && c.len && --c.len === 0) c.on = 0; }
    if (s === 2 || s === 6) { const c = this.sq[0]; if (c.sweepTime && --c.sweepTimer <= 0) { c.sweepTimer = c.sweepTime; const d = c.freq >> c.sweepShift, f = c.sweepDir ? c.freq - d : c.freq + d; if (f > 2047) c.on = 0; else if (c.sweepShift) c.freq = f; } }
    if (s === 7) for (const c of chans) if (c.envStep && --c.envTimer <= 0) { c.envTimer = c.envStep; if (c.envDir && c.vol < 15) c.vol++; else if (!c.envDir && c.vol > 0) c.vol--; }
  }
  // Called with batches of CPU cycles: sequencer steps and output samples happen in the
  // order they fall due inside the batch.
  clock(cycles) {
    const per = this.cyclesPerSample;
    while (cycles > 0) {
      const n = Math.min(cycles, 32768 - this.seqCycles, Math.max(1, Math.ceil(per - this.acc)));
      cycles -= n; this.seqCycles += n; this.acc += n;
      if (this.seqCycles >= 32768) { this.seqCycles -= 32768; this.sequence(); }
      while (this.acc >= per) { this.acc -= per; this.sample(); }
    }
  }
  sample() {
    const cntL = this.reg(0x80), cntH = this.reg(0x82), master = this.reg(0x84) & 0x80;
    let l = 0, r = 0;
    if (master) {
      const psg = this.psg, dt = 1 / this.rate; psg[0] = psg[1] = psg[2] = psg[3] = 0;
      for (let k = 0; k < 2; k++) { const c = this.sq[k]; if (!c.on) continue; const hz = 131072 / (2048 - c.freq); c.phase = (c.phase + hz * dt) % 1; psg[k] = (c.phase < DUTY[c.duty] ? 1 : -1) * c.vol / 15; }
      { const c = this.wave; if (c.on) { const hz = 2097152 / (2048 - c.freq) / 32; c.phase = (c.phase + hz * dt * 32) % (this.reg(0x70) & 0x20 ? 64 : 32); const bank = this.reg(0x70) & 0x40 ? 1 : 0, idx = Math.floor(c.phase), wramByte = this.waveRam(idx, bank); const shift = c.force ? 0.75 : WAVE_VOLUME[c.vol]; psg[2] = (wramByte / 7.5 - 1) * shift; } }
      { const c = this.noise; if (c.on) { c.acc += c.rate * dt; while (c.acc >= 1) { c.acc--; const bit = c.lfsr & 1; c.lfsr >>= 1; if (bit) c.lfsr ^= c.short ? 0x60 : 0x6000; } psg[3] = (c.lfsr & 1 ? 1 : -1) * c.vol / 15; } }
      const psgVol = PSG_VOLUME[cntH & 3], lv = (cntL >> 4 & 7) / 7, rv = (cntL & 7) / 7;
      for (let k = 0; k < 4; k++) { if (cntL >> (12 + k) & 1) l += psg[k] * lv * psgVol * 0.25; if (cntL >> (8 + k) & 1) r += psg[k] * rv * psgVol * 0.25; }
      for (let ch = 0; ch < 2; ch++) {
        const v = this.ds[ch] / 128 * (cntH >> (2 + ch) & 1 ? 1 : 0.5);
        if (cntH >> (9 + ch * 4) & 1) l += v; if (cntH >> (8 + ch * 4) & 1) r += v;
      }
    }
    if (this.outLen + 2 <= this.out.length) { this.out[this.outLen++] = Math.max(-1, Math.min(1, l * 0.5)); this.out[this.outLen++] = Math.max(-1, Math.min(1, r * 0.5)); }
  }
  waveRam(idx, bank) {
    // Two 16-byte banks: the selected one plays; in 64-step mode both play in turn.
    const b = idx >= 32 ? 1 - bank : bank, i = idx & 31, byte = this.m.io[0x90 + (i >> 1)];
    return i & 1 ? byte & 15 : byte >> 4; // simplified: register view of the playing bank
  }
  drain() { const out = this.out.slice(0, this.outLen); this.outLen = 0; return out; }
  endFrame() {}
  snapshot() { return {fifo: this.fifo.map(f => Array.from(f)), fifoLen: [...this.fifoLen], fifoR: [...this.fifoR], fifoW: [...this.fifoW], ds: [...this.ds], sq: structuredClone(this.sq), wave: structuredClone(this.wave), noise: structuredClone(this.noise), seqStep: this.seqStep}; }
  restore(s) { s.fifo.forEach((f, k) => this.fifo[k].set(f)); this.fifoLen = [...s.fifoLen]; this.fifoR = [...s.fifoR]; this.fifoW = [...s.fifoW]; this.ds = [...s.ds]; this.sq = structuredClone(s.sq); this.wave = structuredClone(s.wave); this.noise = structuredClone(s.noise); this.seqStep = s.seqStep; this.envelopes = null; }
}
