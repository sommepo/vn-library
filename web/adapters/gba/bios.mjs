// High-level GBA BIOS services, implemented from their public behavioural
// descriptions. Each function operates on the machine bus (read*/write*).
export function lz77(m, src, dst, vram) {
  const header = m.read32(src); let size = header >>> 8, s = src + 4, d = dst, out = [];
  const put = b => {
    if (!vram) { m.write8(d++, b); return; }
    out.push(b); if (out.length === 2) { m.write16(d, out[0] | out[1] << 8); d += 2; out = []; }
  };
  const written = []; // recent output for back references (VRAM cannot be byte-read reliably mid-halfword)
  while (size > 0) {
    const flags = m.read8(s++);
    for (let bit = 0; bit < 8 && size > 0; bit++) {
      if (flags & 0x80 >> bit) {
        const b1 = m.read8(s++), b2 = m.read8(s++), len = (b1 >> 4) + 3, disp = ((b1 & 15) << 8 | b2) + 1;
        for (let k = 0; k < len && size > 0; k++) { const v = written[written.length - disp]; written.push(v); put(v); size--; }
      } else { const v = m.read8(s++); written.push(v); put(v); size--; }
    }
  }
  if (vram && out.length) m.write16(d, out[0]);
}
export function rlUnComp(m, src, dst, vram) {
  let size = m.read32(src) >>> 8, s = src + 4, d = dst, pending = [];
  const put = b => { if (!vram) { m.write8(d++, b); return; } pending.push(b); if (pending.length === 2) { m.write16(d, pending[0] | pending[1] << 8); d += 2; pending = []; } };
  while (size > 0) {
    const flag = m.read8(s++);
    if (flag & 0x80) { const len = (flag & 0x7F) + 3, v = m.read8(s++); for (let k = 0; k < len && size > 0; k++, size--) put(v); }
    else { const len = (flag & 0x7F) + 1; for (let k = 0; k < len && size > 0; k++, size--) put(m.read8(s++)); }
  }
}
export function huffUnComp(m, src, dst) {
  const header = m.read32(src), bits = header & 15; let size = header >>> 8;
  const treeSize = m.read8(src + 4), treeStart = src + 5; let s = (src + 4 + (treeSize + 1) * 2 + 3) & ~3;
  let out = 0, outBits = 0, d = dst, node = treeStart, word = 0, wordBits = 0;
  while (size > 0) {
    if (!wordBits) { word = m.read32(s); s += 4; wordBits = 32; }
    const bit = word >>> 31; word = (word << 1) >>> 0; wordBits--;
    const value = m.read8(node), next = (node & ~1) + (value & 0x3F) * 2 + 2 + bit, leaf = bit ? value & 0x40 : value & 0x80;
    if (leaf) {
      out |= m.read8(next) << outBits; outBits += bits; node = treeStart;
      if (outBits === 32) { m.write32(d, out); d += 4; size -= 4; out = 0; outBits = 0; }
    } else node = next;
  }
}
export function cpuSet(m, src, dst, control) {
  const count = control & 0x1FFFFF, fill = control & 0x01000000, word = control & 0x04000000, step = word ? 4 : 2;
  const value = fill ? (word ? m.read32(src) : m.read16(src)) : 0;
  for (let k = 0; k < count; k++) {
    const v = fill ? value : word ? m.read32(src + k * 4) : m.read16(src + k * 2);
    if (word) m.write32(dst + k * 4, v); else m.write16(dst + k * 2, v);
  }
  return step;
}
export function cpuFastSet(m, src, dst, control) {
  const count = (control & 0x1FFFFF + 7) & ~7, fill = control & 0x01000000, value = fill ? m.read32(src) : 0;
  const n = ((control & 0x1FFFFF) + 7) & ~7;
  for (let k = 0; k < n; k++) m.write32(dst + k * 4, fill ? value : m.read32(src + k * 4));
  return count;
}
const sin = a => Math.round(Math.sin(a / 0x10000 * 2 * Math.PI) * 256), cos = a => Math.round(Math.cos(a / 0x10000 * 2 * Math.PI) * 256);
export function bgAffineSet(m, src, dst, count) {
  for (let k = 0; k < count; k++) {
    const s = src + k * 20, ox = m.read32(s) | 0, oy = m.read32(s + 4) | 0, cx = m.read16(s + 8) << 16 >> 16, cy = m.read16(s + 10) << 16 >> 16;
    const sx = m.read16(s + 12) << 16 >> 16, sy = m.read16(s + 14) << 16 >> 16, th = m.read16(s + 16) & 0xFF00;
    const c = cos(th), n = sin(th), pa = c * sx >> 8, pb = -n * sx >> 8, pc = n * sy >> 8, pd = c * sy >> 8, d = dst + k * 16;
    m.write16(d, pa); m.write16(d + 2, pb); m.write16(d + 4, pc); m.write16(d + 6, pd);
    m.write32(d + 8, ox - pa * cx - pb * cy); m.write32(d + 12, oy - pc * cx - pd * cy);
  }
}
export function objAffineSet(m, src, dst, count, stride) {
  for (let k = 0; k < count; k++) {
    const s = src + k * 8, sx = m.read16(s) << 16 >> 16, sy = m.read16(s + 2) << 16 >> 16, th = m.read16(s + 4) & 0xFF00;
    const c = cos(th), n = sin(th), d = dst + k * stride * 4;
    m.write16(d, c * sx >> 8); m.write16(d + stride, -n * sx >> 8); m.write16(d + stride * 2, n * sy >> 8); m.write16(d + stride * 3, c * sy >> 8);
  }
}
// MidiKey2Freq: frequency of a WaveData at a MIDI key with fine adjustment.
export function midiKey2Freq(m, wave, key, fine) {
  const freq = m.read32(wave + 4);
  return Math.floor(freq / Math.pow(2, (180 - key - fine / 256) / 12)) >>> 0;
}
