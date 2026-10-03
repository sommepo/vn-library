// Small synchronous LZ77 byte packer for machine snapshots (original format).
// Token stream: literal run  0x00 <u16 len> bytes...
//               match        0x01 <u16 len> <u32 distance>
export function pack(input) {
  const n = input.length, out = new Uint8Array(n + (n >> 3) + 64); let o = 0, lit = 0, i = 0;
  const head = new Int32Array(1 << 16).fill(-1), prev = new Int32Array(n).fill(-1);
  const hash = p => ((input[p] << 8 ^ input[p + 1] << 4 ^ input[p + 2]) * 2654435761 >>> 16) & 0xFFFF;
  const flush = end => { let s = end - lit; while (lit > 0) { const len = Math.min(lit, 0xFFFF); out[o++] = 0; out[o++] = len & 255; out[o++] = len >> 8; out.set(input.subarray(s, s + len), o); o += len; s += len; lit -= len; } };
  while (i < n) {
    let best = 0, dist = 0;
    if (i + 3 <= n) {
      const h = hash(i); let cand = head[h], tries = 16;
      while (cand >= 0 && tries-- && i - cand <= 0xFFFFFF) {
        let len = 0; while (i + len < n && len < 0xFFFF && input[cand + len] === input[i + len]) len++;
        if (len > best) { best = len; dist = i - cand; if (len > 256) break; }
        cand = prev[cand];
      }
      prev[i] = head[h]; head[h] = i;
    }
    if (best >= 8) {
      flush(i); out[o++] = 1; out[o++] = best & 255; out[o++] = best >> 8;
      out[o++] = dist & 255; out[o++] = dist >> 8 & 255; out[o++] = dist >> 16 & 255; out[o++] = dist >>> 24;
      for (let k = 1; k < best && i + k + 3 <= n; k += 4) { const h = hash(i + k); prev[i + k] = head[h]; head[h] = i + k; }
      i += best;
    } else { lit++; i++; }
    if (o + lit + 16 > out.length) return null; // incompressible: caller stores raw
  }
  flush(i); return out.slice(0, o);
}
export function unpack(data, size) {
  const out = new Uint8Array(size); let i = 0, o = 0;
  while (i < data.length) {
    const type = data[i++], len = data[i++] | data[i++] << 8;
    if (type === 0) { out.set(data.subarray(i, i + len), o); i += len; o += len; }
    else { const dist = (data[i++] | data[i++] << 8 | data[i++] << 16 | data[i++] << 24) >>> 0; for (let k = 0; k < len; k++, o++) out[o] = out[o - dist]; }
  }
  if (o !== size) throw Error('Snapshot size mismatch');
  return out;
}
export function toBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = ''; for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode(...bytes.subarray(k, k + 0x8000)); return btoa(s);
}
export function fromBase64(text) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const s = atob(text), out = new Uint8Array(s.length); for (let k = 0; k < s.length; k++) out[k] = s.charCodeAt(k); return out;
}
