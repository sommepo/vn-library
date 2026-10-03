// GBA picture processing, rendered per scanline into a 240x160 RGBA frame.
// Original implementation from public hardware documentation: text/affine/bitmap
// backgrounds, regular/affine objects, windows, alpha/brightness effects and mosaic.
const W = 240, H = 160, OBJ_SIZES = [[[8, 8], [16, 16], [32, 32], [64, 64]], [[16, 8], [32, 8], [32, 16], [64, 32]], [[8, 16], [8, 32], [16, 32], [32, 64]]];
const TRANSPARENT = -1;
export class PPU {
  constructor(machine) {
    this.m = machine; this.frame = new Uint8ClampedArray(W * H * 4); this.rgba = new Uint32Array(this.frame.buffer);
    this.layers = Array.from({length: 4}, () => new Int32Array(W)); this.objColor = new Int32Array(W); this.objPrio = new Uint8Array(W);
    this.objAlpha = new Uint8Array(W); this.objWin = new Uint8Array(W); this.win = new Uint8Array(W);
    this.refX = new Int32Array(2); this.refY = new Int32Array(2); this.onFrame = null; this.lut = new Uint32Array(0x8000);
    this.drawn = new Uint8Array(4); this.order = new Uint8Array(4); this.orderPrio = new Uint8Array(4); this.orderLine = [null, null, null, null]; this.alphaAny = false;
    const le = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
    for (let c = 0; c < 0x8000; c++) {
      const r = (c & 31) << 3 | (c & 31) >> 2, g = (c >> 5 & 31) << 3 | (c >> 5 & 31) >> 2, b = (c >> 10 & 31) << 3 | (c >> 10 & 31) >> 2;
      this.lut[c] = le ? (0xFF000000 | b << 16 | g << 8 | r) >>> 0 : (r << 24 | g << 16 | b << 8 | 0xFF) >>> 0;
    }
    // Optional filter used by the reader to hide the game's own text box layers.
    this.hideLayer = null; this.hideObj = null;
  }
  reg(o) { return this.m.io16(o); }
  s32(o) { return (this.reg(o) | this.reg(o + 2) << 16) << 4 >> 4; } // 28-bit signed
  affineRefWrite(o) {
    if (o === undefined) { for (let k = 0; k < 2; k++) { this.refX[k] = this.s32(0x28 + k * 16); this.refY[k] = this.s32(0x2C + k * 16); } return; }
    const k = o >= 0x38 ? 1 : 0, base = 0x28 + k * 16; if ((o & ~3) === base) this.refX[k] = this.s32(base); else this.refY[k] = this.s32(base + 4);
  }
  vblank() { this.affineRefWrite(); this.onFrame?.(this.frame); }
  palette(i) { return this.m.pal16[i]; }
  renderLine(y) {
    const disp = this.reg(0), row = y * W;
    if (disp & 0x80) { this.rgba.fill(this.lut[0x7FFF], row, row + W); return; }
    const mode = disp & 7, mosaic = this.reg(0x4C);
    for (let bg = 0; bg < 4; bg++) {
      const line = this.layers[bg]; this.drawn[bg] = 0;
      if (!(disp & 0x100 << bg) || (this.hideLayer && this.hideLayer(bg, y))) continue;
      const cnt = this.reg(8 + bg * 2);
      if (mode === 0 || (mode === 1 && bg < 2)) { line.fill(TRANSPARENT); this.textBG(bg, cnt, y, line, mosaic); this.drawn[bg] = 1; }
      else if ((mode === 1 && bg === 2) || (mode === 2 && bg >= 2)) { line.fill(TRANSPARENT); this.affineBG(bg, cnt, line); this.drawn[bg] = 1; }
      else if (mode >= 3 && bg === 2) { line.fill(TRANSPARENT); this.bitmapBG(mode, disp, y, line); this.drawn[bg] = 1; }
    }
    if (disp & 0x1000) this.objects(y, disp, mosaic); else { this.objColor.fill(TRANSPARENT); this.objWin.fill(0); this.alphaAny = false; }
    this.windows(disp, y);
    this.compose(row, disp);
    for (let k = 0; k < 2; k++) { this.refX[k] += this.reg(0x22 + k * 16) << 16 >> 16; this.refY[k] += this.reg(0x26 + k * 16) << 16 >> 16; }
  }
  textBG(bg, cnt, y, line, mosaic) {
    const vram = this.m.vram, charBase = (cnt >> 2 & 3) * 0x4000, screenBase = (cnt >> 8 & 31) * 0x800, bpp8 = cnt & 0x80, size = cnt >> 14;
    const mw = size & 1 ? 512 : 256, mh = size & 2 ? 512 : 256, hofs = this.reg(0x10 + bg * 4) & 0x1FF;
    let vofs = this.reg(0x12 + bg * 4) & 0x1FF, yy = y;
    if (!(cnt & 0x40)) { // one map entry per run of up to eight pixels
      const pal16 = this.m.pal16, sy = (y + vofs) & (mh - 1), fy = sy & 7;
      const rowBase = screenBase + (sy >= 256 ? (size === 3 ? 2 : 1) * 0x800 : 0) + ((sy & 255) >> 3) * 64;
      for (let x = 0, sx = hofs & (mw - 1); x < W;) {
        const entryAddr = rowBase + (sx >= 256 ? 0x800 : 0) + ((sx & 255) >> 3) * 2, entry = vram[entryAddr] | vram[entryAddr + 1] << 8;
        const flip = entry & 0x400, py = entry & 0x800 ? 7 - fy : fy, first = sx & 7, count = Math.min(8 - first, W - x);
        if (bpp8) {
          const base = charBase + (entry & 0x3FF) * 64 + py * 8;
          for (let k = 0; k < count; k++) { const a = base + (flip ? 7 - first - k : first + k); if (a >= 0x10000) continue; const c = vram[a]; if (c) line[x + k] = pal16[c]; }
        } else {
          const base = charBase + (entry & 0x3FF) * 32 + py * 4, palBase = (entry >> 12) * 16;
          for (let k = 0; k < count; k++) { const px = flip ? 7 - first - k : first + k, a = base + (px >> 1); if (a >= 0x10000) continue; const b = vram[a], c = px & 1 ? b >> 4 : b & 15; if (c) line[x + k] = pal16[palBase + c]; }
        }
        x += count; sx = (sx + count) & (mw - 1);
      }
      return;
    }
    if (cnt & 0x40) { const my = (mosaic >> 4 & 15) + 1; yy -= yy % my; }
    const sy = (yy + vofs) & (mh - 1), mx = cnt & 0x40 ? (mosaic & 15) + 1 : 1;
    for (let x = 0; x < W; x++) {
      const sx = ((x - x % mx) + hofs) & (mw - 1);
      let block = 0; if (sx >= 256) block += 1; if (sy >= 256) block += size === 3 ? 2 : 1;
      const entryAddr = screenBase + block * 0x800 + ((sy & 255) >> 3) * 64 + ((sx & 255) >> 3) * 2;
      const entry = vram[entryAddr] | vram[entryAddr + 1] << 8, tile = entry & 0x3FF;
      let px = sx & 7, py = sy & 7; if (entry & 0x400) px = 7 - px; if (entry & 0x800) py = 7 - py;
      let color;
      if (bpp8) { const a = charBase + tile * 64 + py * 8 + px; if (a >= 0x10000) continue; color = vram[a]; if (!color) continue; line[x] = this.palette(color); }
      else { const a = charBase + tile * 32 + py * 4 + (px >> 1); if (a >= 0x10000) continue; const b = vram[a]; color = px & 1 ? b >> 4 : b & 15; if (!color) continue; line[x] = this.palette((entry >> 12) * 16 + color); }
    }
  }
  affineBG(bg, cnt, line) {
    const k = bg - 2, vram = this.m.vram, charBase = (cnt >> 2 & 3) * 0x4000, screenBase = (cnt >> 8 & 31) * 0x800, size = 128 << (cnt >> 14), wrap = cnt & 0x2000;
    const pa = this.reg(0x20 + k * 16) << 16 >> 16, pc = this.reg(0x24 + k * 16) << 16 >> 16;
    let x0 = this.refX[k], y0 = this.refY[k];
    for (let x = 0; x < W; x++, x0 += pa, y0 += pc) {
      let sx = x0 >> 8, sy = y0 >> 8;
      if (wrap) { sx &= size - 1; sy &= size - 1; } else if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
      const tile = vram[screenBase + (sy >> 3) * (size >> 3) + (sx >> 3)], color = vram[charBase + tile * 64 + (sy & 7) * 8 + (sx & 7)];
      if (color) line[x] = this.palette(color);
    }
  }
  bitmapBG(mode, disp, y, line) {
    const vram = this.m.vram, page = disp & 0x10 ? 0xA000 : 0;
    for (let x = 0; x < W; x++) {
      if (mode === 3) line[x] = vram[(y * W + x) * 2] | vram[(y * W + x) * 2 + 1] << 8 & 0x7FFF;
      else if (mode === 4) { const c = vram[page + y * W + x]; if (c) line[x] = this.palette(c); }
      else if (x < 160 && y < 128) { const a = page + (y * 160 + x) * 2; line[x] = (vram[a] | vram[a + 1] << 8) & 0x7FFF; }
    }
  }
  objects(y, disp, mosaic) {
    const oam = this.m.oam, vram = this.m.vram, oneD = disp & 0x40, bitmap = (disp & 7) >= 3;
    this.objColor.fill(TRANSPARENT); this.objPrio.fill(4); this.objAlpha.fill(0); this.objWin.fill(0); this.alphaAny = false;
    const oam16 = this.m.oam16;
    for (let i = 127; i >= 0; i--) {
      const a0 = oam16[i * 4];
      const affine = a0 & 0x100, dbl = affine && a0 & 0x200;
      if (!affine && a0 & 0x200) continue;
      const shape = a0 >> 14; if (shape === 3) continue;
      const a1 = oam16[i * 4 + 1], size = OBJ_SIZES[shape][a1 >> 14], w = size[0], h = size[1], bw = dbl ? w * 2 : w, bh = dbl ? h * 2 : h;
      let oy = a0 & 0xFF; if (oy >= 160) oy -= 256;
      let yy = y - oy; if (yy < 0 || yy >= bh) continue;
      const a2 = oam16[i * 4 + 2];
      if (this.hideObj && this.hideObj(i, a0, a1, a2)) continue;
      let ox = a1 & 0x1FF; if (ox >= 240) ox -= 512;
      const mode = a0 >> 10 & 3, bpp8 = a0 & 0x2000, prio = a2 >> 10 & 3, tileBase = a2 & 0x3FF, pal = a2 >> 12;
      if (bitmap && tileBase < 512) continue;
      if (a0 & 0x1000) { const my = (mosaic >> 12 & 15) + 1; yy -= yy % my; }
      let pa = 256, pb = 0, pc = 0, pd = 256;
      if (affine) { const p = (a1 >> 9 & 31) * 32; pa = oam[p + 6] | oam[p + 7] << 8; pb = oam[p + 14] | oam[p + 15] << 8; pc = oam[p + 22] | oam[p + 23] << 8; pd = oam[p + 30] | oam[p + 31] << 8; pa = pa << 16 >> 16; pb = pb << 16 >> 16; pc = pc << 16 >> 16; pd = pd << 16 >> 16; }
      const rowTiles = oneD ? (bpp8 ? w / 4 : w / 8) : 32;
      for (let bx = 0; bx < bw; bx++) {
        const x = ox + bx; if (x < 0 || x >= W) continue;
        let tx, ty;
        if (affine) { const cx = bx - bw / 2, cy = yy - bh / 2; tx = (pa * cx + pb * cy >> 8) + w / 2; ty = (pc * cx + pd * cy >> 8) + h / 2; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue; }
        else { tx = a1 & 0x1000 ? w - 1 - bx : bx; ty = a1 & 0x2000 ? h - 1 - yy : yy; }
        let color, value;
        if (bpp8) { const tile = (tileBase & ~1) + (ty >> 3) * rowTiles + (tx >> 3) * 2; value = vram[0x10000 + (tile * 32 & 0x7FFF) + (ty & 7) * 8 + (tx & 7)]; if (!value) continue; color = this.palette(256 + value); }
        else { const tile = tileBase + (ty >> 3) * rowTiles + (tx >> 3), b = vram[0x10000 + (tile * 32 & 0x7FFF) + (ty & 7) * 4 + ((tx & 7) >> 1)]; value = tx & 1 ? b >> 4 : b & 15; if (!value) continue; color = this.palette(256 + pal * 16 + value); }
        if (mode === 2) { this.objWin[x] = 1; continue; }
        if (prio <= this.objPrio[x]) { this.objColor[x] = color; this.objPrio[x] = prio; if (mode === 1) { this.objAlpha[x] = 1; this.alphaAny = true; } else this.objAlpha[x] = 0; }
      }
    }
  }
  windows(disp, y) {
    const win = this.win;
    if (!(disp & 0xE000)) { win.fill(0x3F); return; }
    const out = this.reg(0x4A) & 0x3F, objIn = this.reg(0x4A) >> 8 & 0x3F; win.fill(out);
    if (disp & 0x8000) for (let x = 0; x < W; x++) if (this.objWin[x]) win[x] = objIn;
    for (let k = 1; k >= 0; k--) {
      if (!(disp & 0x2000 << k)) continue;
      const hreg = this.reg(0x40 + k * 2), vreg = this.reg(0x44 + k * 2), inside = this.reg(0x48) >> (k * 8) & 0x3F;
      let x1 = hreg >> 8, x2 = hreg & 0xFF, y1 = vreg >> 8, y2 = vreg & 0xFF;
      if (x2 > W || x1 > x2) x2 = W; if (y2 > H || y1 > y2) y2 = H;
      const inY = y1 <= y2 ? y >= y1 && y < y2 : y >= y1 || y < y2; if (!inY) continue;
      for (let x = x1; x < x2; x++) win[x] = inside;
    }
  }
  compose(row, disp) {
    const bldcnt = this.reg(0x50), effect = bldcnt >> 6 & 3, alpha = this.reg(0x52), eva = Math.min(16, alpha & 31), evb = Math.min(16, alpha >> 8 & 31), evy = Math.min(16, this.reg(0x54) & 31);
    const backdrop = this.palette(0), rgba = this.rgba, lut = this.lut, win = this.win, objColor = this.objColor, objPrio = this.objPrio, objAlpha = this.objAlpha;
    // Backgrounds that drew this line, in drawing order: by priority, then by number. An object
    // pixel comes before the first background whose priority is not higher than its own.
    const order = this.order, prio = this.orderPrio, lines = this.orderLine; let n = 0;
    for (let p = 0; p < 4; p++) for (let bg = 0; bg < 4; bg++) if (this.drawn[bg] && (this.reg(8 + bg * 2) & 3) === p) { order[n] = bg; prio[n] = p; lines[n] = this.layers[bg]; n++; }
    if (effect !== 1 && !this.alphaAny) { // only the top pixel matters
      const bright = effect >= 2;
      if (!(disp & 0xE000)) { // no windows: every layer shows everywhere
        const any = bright && (bldcnt & 0x3F) !== 0;
        for (let x = 0; x < W; x++) {
          const oc = objColor[x], op = oc !== TRANSPARENT ? objPrio[x] : 4;
          let top = TRANSPARENT, topLayer = 5;
          for (let k = 0; k < n; k++) {
            if (op <= prio[k]) { top = oc; topLayer = 4; break; }
            const c = lines[k][x]; if (c !== TRANSPARENT) { top = c; topLayer = order[k]; break; }
          }
          if (top === TRANSPARENT) { if (op < 4) { top = oc; topLayer = 4; } else top = backdrop; }
          if (any && bldcnt & 1 << topLayer) top = brightness(top, evy, effect === 2);
          rgba[row + x] = lut[top & 0x7FFF];
        }
        return;
      }
      for (let x = 0; x < W; x++) {
        const mask = win[x], oc = objColor[x], op = oc !== TRANSPARENT && mask & 0x10 ? objPrio[x] : 4;
        let top = TRANSPARENT, topLayer = 5;
        for (let k = 0; k < n; k++) {
          if (op <= prio[k]) { top = oc; topLayer = 4; break; }
          const bg = order[k]; if (!(mask >> bg & 1)) continue;
          const c = lines[k][x]; if (c !== TRANSPARENT) { top = c; topLayer = bg; break; }
        }
        if (top === TRANSPARENT) { if (op < 4) { top = oc; topLayer = 4; } else top = backdrop; }
        if (bright && mask & 0x20 && bldcnt & 1 << topLayer) top = brightness(top, evy, effect === 2);
        rgba[row + x] = lut[top & 0x7FFF];
      }
      return;
    }
    for (let x = 0; x < W; x++) {
      const mask = win[x], oc = objColor[x], op = oc !== TRANSPARENT && mask & 0x10 ? objPrio[x] : 4;
      let top = backdrop, topLayer = 5, second = backdrop, secondLayer = 5, found = 0, objPending = op < 4;
      for (let k = 0; k < n && found < 2; k++) {
        if (objPending && op <= prio[k]) { objPending = false; if (!found) { top = oc; topLayer = 4; } else { second = oc; secondLayer = 4; } if (++found === 2) break; }
        const bg = order[k]; if (!(mask >> bg & 1)) continue;
        const c = lines[k][x]; if (c === TRANSPARENT) continue;
        if (!found) { top = c; topLayer = bg; } else { second = c; secondLayer = bg; } found++;
      }
      if (objPending && found < 2) { if (!found) { top = oc; topLayer = 4; } else { second = oc; secondLayer = 4; } }
      let color = top;
      const firstTarget = bldcnt & 1 << topLayer, secondTarget = bldcnt >> 8 & 1 << secondLayer;
      if (topLayer === 4 && objAlpha[x] && secondTarget) color = blend(top, second, eva, evb);
      else if (mask & 0x20 && firstTarget) {
        if (effect === 1 && secondTarget) color = blend(top, second, eva, evb);
        else if (effect === 2) color = brightness(top, evy, true);
        else if (effect === 3) color = brightness(top, evy, false);
      }
      rgba[row + x] = lut[color & 0x7FFF];
    }
  }
}
function blend(a, b, ea, eb) {
  const r = Math.min(31, ((a & 31) * ea + (b & 31) * eb) >> 4), g = Math.min(31, ((a >> 5 & 31) * ea + (b >> 5 & 31) * eb) >> 4), bl = Math.min(31, ((a >> 10 & 31) * ea + (b >> 10 & 31) * eb) >> 4);
  return r | g << 5 | bl << 10;
}
function brightness(c, ey, up) {
  const r = c & 31, g = c >> 5 & 31, b = c >> 10 & 31;
  return up ? (r + ((31 - r) * ey >> 4)) | (g + ((31 - g) * ey >> 4)) << 5 | (b + ((31 - b) * ey >> 4)) << 10
    : (r - (r * ey >> 4)) | (g - (g * ey >> 4)) << 5 | (b - (b * ey >> 4)) << 10;
}
