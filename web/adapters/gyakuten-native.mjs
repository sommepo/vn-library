/* Gyakuten Saiban (GBA) native reader engine, shared by the series.
 * The owner-supplied cartridge runs on the original-code GBA machine in ./gba/.
 * All game logic, graphics, animation and sound are the game's own. The reader
 * observes native state to present each completed text page as selectable Unicode
 * (ROM-bound reviewed glyph map) and each two/three-way choice as reader options.
 * Every other interaction (investigation, court record, cross-examination, menus)
 * is the game's own interface, driven by GBA buttons and touch on the game screen.
 * Each edition supplies a profile of native RAM, sprite and script facts; no game
 * data is in this file. */
import {randomId, signature} from '../engine.mjs';
import {GBA, KEY} from './gba/machine.mjs';
import {PPU} from './gba/ppu.mjs';
import {APU} from './gba/apu.mjs';
import {pack, unpack, toBase64, fromBase64} from './gba/pack.mjs';

export const FRAME_HZ = 16777216 / (1232 * 228);
// Script commands shared by the series (same handler per opcode in every edition).
export const PAGE_WAIT = new Set([0x02, 0x07, 0x0A, 0x2D]), CHOICE = new Set([0x08, 0x09]), TIMED_WAIT = new Set([0x0C, 0x4E]), PAGE_END = new Set([0x00, 0x0D, 0x2C, 0x2E, 0x15, 0x16, 0x24, 0x45]);
const clone = structuredClone;
// Saved memory: the machine's blocks, each cut into segments that are packed on their own.
const BLOCK_SIZES = {ewram: 0x40000, iwram: 0x8000, io: 0x400, pal: 0x400, vram: 0x18000, oam: 0x400, sram: 0x8000}, SEGMENT = 0x2000;
const localURL = url => typeof url === 'string' && url.length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(url) && !url.split(/[\\/]/).some(x => !x || x.startsWith('.'));

export function validateNativeContent(profile, c) {
  const errors = [], r = c?.runtime;
  if (c?.format !== 'vnkit.content' || c.version !== 1 || r?.id !== profile.runtimeId || r.version !== 1) errors.push(`Unsupported ${profile.name} content`);
  if (r?.rom_sha1 !== profile.romSha1 || !localURL(r?.rom?.url) || !localURL(r?.case?.url)) errors.push(`Missing ${profile.name} cartridge data`);
  return errors;
}
async function sha1(bytes) {
  if (globalThis.crypto?.subtle) { const d = await crypto.subtle.digest('SHA-1', bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  const {createHash} = await import('node:crypto'); return createHash('sha1').update(bytes).digest('hex');
}
const range = (start, count) => Array.from({length: count}, (_, k) => start + k);

export class GyakutenNativeEngine {
  static async createWith(P, content, options = {}, Engine = GyakutenNativeEngine) {
    const errors = validateNativeContent(P, content); if (errors.length) throw Error(errors.join('\n'));
    const loadBytes = options.loadBytes || (async url => { const r = await fetch(new URL(url, options.baseURL)); if (!r.ok) throw Error(`Cartridge data unavailable (${r.status})`); return new Uint8Array(await r.arrayBuffer()); });
    const loadJSON = options.loadJSON || (async url => { const r = await fetch(new URL(url, options.baseURL)); if (!r.ok) throw Error(`${P.name} data unavailable (${r.status})`); return r.json(); });
    const rom = await loadBytes(content.runtime.rom.url);
    if (await sha1(rom) !== P.romSha1) throw Error('Cartridge identity mismatch');
    const data = await loadJSON(content.runtime.case.url);
    if (data.format !== P.caseFormat || data.rom_sha1 !== P.romSha1 || data.charset?.length !== P.glyphs) throw Error(`${P.name} review data mismatch`);
    return new Engine(content, rom, data, options, P);
  }
  constructor(content, rom, data, options = {}, profile) {
    this.P = profile; this.content = content; this.case = data; this.rom = rom; // Starting points are presentation metadata: adding them must not invalidate saves.
    const {entries, ...runtime} = content.runtime; this.signature = signature({id: content.id, runtime});
    this.makeId = options.makeId || randomId; this.audioRate = options.audioRate || 48000;
    this.machine = new GBA(rom); this.ppu = new PPU(this.machine); this.machine.ppu = this.ppu;
    this.apu = new APU(this.machine, this.audioRate); this.machine.apu = this.apu;
    this.state = {pending: null, started: false, lastBoundary: null, lastTimed: null, scene: {background: null, sprites: {}, layers: [], music: null}, warnings: []};
    this.keys = 0; this.held = 0; this.pressFrames = 0; this.host = null; this.onPending = null; this.onFrame = null; this.presentationViewport = {width: 240, height: 160};    this.packed = {}; // per block: the bytes last saved and their packed segments (see packBlock)
  }
  get current() { return this.state.pending; }
  get live() { return true; }
  get frameRate() { return FRAME_HZ; }
  setAudioRate(rate) { this.apu.rate = rate; this.apu.cyclesPerSample = 16777216 / rate; this.apu.out = new Float32Array(rate); this.apu.outLen = 0; }
  mountScene(art) { return this.host ? this.host.mount(this, art) : null; }
  // Re-render the current frame with the game's own glyphs (live view hides them for DOM text).
  renderWithNativeText() {
    const ppu = this.ppu, saved = ppu.frame.slice(), hide = ppu.hideObj, rx = ppu.refX.slice(), ry = ppu.refY.slice();
    try { ppu.hideObj = null; ppu.affineRefWrite(); for (let y = 0; y < 160; y++) ppu.renderLine(y); return new Uint8ClampedArray(ppu.frame); }
    finally { ppu.frame.set(saved); ppu.hideObj = hide; ppu.refX.set(rx); ppu.refY.set(ry); }
  }
  // Current game frame for card images, as the game shows it: 3x nearest-neighbour (720x480).
  captureFrame(scale = 3) {
    if (typeof document === 'undefined') return null;
    const src = document.createElement('canvas'); src.width = 240; src.height = 160;
    src.getContext('2d').putImageData(new ImageData(this.renderWithNativeText(), 240, 160), 0, 0);
    const out = document.createElement('canvas'); out.width = 240 * scale; out.height = 160 * scale;
    const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false; ctx.drawImage(src, 0, 0, out.width, out.height);
    return out;
  }
  // --- native text as DOM ---------------------------------------------------------
  // Visible text glyph sprites: normal box entries 0-31 use the profile's text OAM run,
  // choice text entries 32-62 its full-screen run. Positions come from hardware OAM, so
  // the DOM text follows the box exactly (including slides); ink is palette 3 + colour*3.
  textOam(entry) { return entry < 32 ? this.P.oam.text + entry : this.P.oam.choiceText + entry - 32; }
  textLayer() {
    const g = this.machine, P = this.P, cells = [];
    for (let k = 0; k < P.textCount; k++) {
      const a = P.text + k * P.textStride, state = g.read16(a); if (!(state & 0x8000)) continue;
      const oam = this.textOam(k), a0 = g.read16(0x07000000 + oam * 8), a1 = g.read16(0x07000002 + oam * 8), a2 = g.read16(0x07000004 + oam * 8);
      if ((a0 & 0x300) === 0x200 || (a2 & 0x3FF) >= 0x100) continue;
      let y = a0 & 255, x = a1 & 511; if (y >= 160) y -= 256; if (x >= 240) x -= 512;
      const ch = this.case.charset[state & 0x7FFF]; if (ch === undefined) continue;
      const color = g.read8(a + 8), c = g.read16(0x05000200 + (3 + color * 3) * 2);
      cells.push({ch, x, y, rgb: `rgb(${(c & 31) * 8},${(c >> 5 & 31) * 8},${(c >> 10 & 31) * 8})`});
    }
    return cells;
  }
  // Screen area of the game's text box while it shows text: the frame (with the
  // name tag above it) from the first text row down to the bottom of the screen.
  textBox() {
    const cells = this.textLayer(); if (!cells.length) return null;
    const top = Math.max(0, Math.min(...cells.map(c => c.y)) - 16);
    return {top, height: 160 - top};
  }
  hideNativeText(on) {
    const P = this.P, text = new Map(range(0, P.textCount).map(k => [this.textOam(k), k]));
    this.ppu.hideObj = on ? (i, a0, a1, a2) => text.has(i) && (a2 & 0x3FF) < 0x100 && this.machine.read16(P.text + text.get(i) * P.textStride) & 0x8000 : null;
  }
  // Which native choice line (0-based) sits at a screen y coordinate.
  choiceAt(y) {
    const rows = [...new Set(this.textLayer().map(c => c.y))].sort((a, b) => a - b);
    const lines = this.characters(true); if (!lines.length) return -1;
    let best = -1; rows.forEach((r, k) => { if (y >= r - 2 && y < r + 18) best = k; }); return best;
  }
  // --- touch --------------------------------------------------------------------
  // Visible hardware sprites, used as the game's own touch targets.
  sprites() {
    const g = this.machine, list = [], SIZE = [[[8, 8], [16, 16], [32, 32], [64, 64]], [[16, 8], [32, 8], [32, 16], [64, 32]], [[8, 16], [8, 32], [16, 32], [32, 64]]];
    for (let i = 0; i < 128; i++) {
      const a0 = g.read16(0x07000000 + i * 8), a1 = g.read16(0x07000002 + i * 8), a2 = g.read16(0x07000004 + i * 8);
      if ((a0 & 0x300) === 0x200 || (!a0 && !a1) || a0 >> 14 === 3) continue;
      let y = a0 & 255, x = a1 & 511; if (y >= 160) y -= 256; if (x >= 240) x -= 512;
      const [w, h] = SIZE[a0 >> 14][a1 >> 14]; if (y + h <= 0 || y >= 160 || x + w <= 0 || x >= 240) continue;
      list.push({i, x, y, w, h, tile: a2 & 0x3FF});
    }
    return list;
  }
  view() {
    const g = this.machine, P = this.P, s = this.scriptState(), M = P.main, I = P.investigation;
    return {...s, state: g.read8(M + P.m.process + 1), var1: g.read8(M + P.m.process + 2), var2: g.read8(M + P.m.process + 3), gameState: g.read32(M + P.m.gameState), episodes: g.read8(M + P.m.episodes),
      action: g.read8(I + P.inv.action), actionState: g.read8(I + P.inv.actionState), options: [0, 1, 2, 3].map(k => g.read8(I + P.inv.options + k))};
  }
  // Detector minigame taking input: GS2 keeps a state byte in gMain (2); GS3 waits on its
  // detector command with the script's operation flag set and the command in its input phase
  // (the game slides the detector in and out itself in the other phase).
  detecting() {
    const g = this.machine, F = this.P;
    if (F.m.detector != null) return g.read8(F.main + F.m.detector) === 2;
    const d = F.s.detector; return d != null && g.read8(F.script + d.flag) === d.value && g.read8(F.script + d.phase) === d.ready && g.read16(F.script + F.s.token) === d.token;
  }
  hit(x, y, indexes) { return this.sprites().find(s => indexes.includes(s.i) && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h); }
  // A court-record prompt (R / A / B) the game draws, optionally one passing a test. Editions
  // that redraw one sprite run for different prompts name each prompt by its tiles.
  recordPrompt(role, test = () => true) {
    const O = this.P.oam, tiles = O.recordTiles?.[role];
    return this.sprites().find(s => (tiles ? O.recordR.includes(s.i) && tiles.includes(s.tile) : O[`record${role}`].includes(s.i)) && test(s));
  }
  // Place the pointing hand so the game's own hit box is centred on the tap. Examine tests a
  // 4x16 box at the pointer (left half) or pointer+12 (right half); spot selection a 4x4 box
  // at pointer+12.
  pointAt(x, y, spot = false) {
    const g = this.machine, I = this.P.investigation, clampX = v => Math.max(0, Math.min(224, v)), clampY = v => Math.max(0, Math.min(144, v));
    let px, py;
    if (spot) { px = x - 14; py = y - 2; }
    else {
      const left = Math.min(119, x - 2), right = Math.max(120, x - 14);
      px = Math.abs(left + 2 - x) <= Math.abs(right + 14 - x) ? left : right; py = y - 8;
    }
    g.write16(I, clampX(px)); g.write16(I + 2, clampY(py));
  }
  choose(address, value) { this.machine.write8(address, value); this.press(KEY.A); }
  // Resolve a tap on the 240x160 screen to the native input it stands for. `strict` is for a
  // tap that came through the text box area, which is for reading and looking words up: there
  // only a control the game itself draws at that spot acts, and nothing counts as "continue".
  touch(x, y, strict = false) {
    const v = this.view(), P = v.process, F = this.P, O = F.oam, M = F.main, I = F.investigation, g = this.machine;
    const plate = () => { for (let k = 0; k < 4; k++) if (this.hit(x, y, [O.plates + 2 * k, O.plates + 1 + 2 * k])) return k; return -1; };
    if (P === 12 && F.select?.carousel) { if (!strict && v.state === F.select.state && v.flags & 8) this.press(x < 72 ? KEY.LEFT : x >= 168 ? KEY.RIGHT : KEY.A); return; }
    if (P === 12 && v.state === 6) { const k = plate(); if (k >= 0 && v.episodes >> k & 1) this.choose(M + F.m.selected, k); return; }
    if ((P === 10 || P === 13 || P === 14) && v.flags & 8) {
      // A yes/no prompt: the game's two plates are the targets (a stray tap must not answer).
      // A prompt that draws no plates is answered by the half of the screen tapped.
      const yes = this.hit(x, y, [O.plates + 2]), no = this.hit(x, y, [O.plates + 3]);
      if (yes || no) this.choose(M + F.m.selected, yes ? 0 : 1);
      else if (!strict && !this.sprites().some(s => s.i === O.plates + 2 || s.i === O.plates + 3)) this.choose(M + F.m.selected, x < 120 ? 0 : 1);
      return;
    }
    if (v.flags & 0x100) { if (!strict) { this.pointAt(x, y, true); this.press(KEY.A); } return; } // spot selection in the script
    if (P === 6 && v.flags & 8) {
      // The statement arrows sit at the ends of the text box: the box's edge strips count.
      const arrow = k => { const s = this.sprites().find(s => s.i === O.arrows[k]); return s && y >= s.y - 12 && y < s.y + s.h + 12 && (k ? x >= s.x - 8 : x < s.x + s.w + 8); };
      if (arrow(0)) return this.press(KEY.LEFT);
      if (arrow(1)) return this.press(KEY.RIGHT);
      if (this.hit(x, y, O.press)) return this.press(KEY.L);
      if (this.hit(x, y, O.present)) return this.press(KEY.R);
      if (!strict) this.press(KEY.A);
      return;
    }
    if (P === 7) { // the record draws ◀ ▶ and its R / A / B prompts itself
      for (const role of ['R', 'A', 'B']) if (this.recordPrompt(role, s => x >= s.x && x < s.x + s.w && y >= s.y - 6 && y < s.y + s.h + 6)) return this.press(KEY[role]);
      // The arrows are small targets for a finger: the strip of the panel beside each one counts.
      const strip = k => { const s = this.sprites().find(s => s.i === O.arrows[k]); return s && Math.abs(y - (s.y + s.h / 2)) <= 32 && (k ? x >= s.x - 12 : x < s.x + s.w + 12); };
      if (strip(0)) return this.press(KEY.LEFT);
      if (strip(1)) return this.press(KEY.RIGHT);
      return;
    }
    if (P === 4) {
      // A detector minigame (GS2's signal detector, GS3's metal detector): the game moves the
      // detector with the d-pad and confirms with A. A tap moves it to the tap; a tap on the
      // detector confirms; the game's scroll arrow switches halves (L).
      if (this.detecting()) {
        if (this.hit(x, y, [O.scroll])) return this.press(KEY.L);
        if (strict) return;
        const px = g.read16(I), py = g.read16(I + 2);
        if (Math.abs(x - px) <= 10 && Math.abs(y - py) <= 10) return this.press(KEY.A);
        g.write16(I, Math.max(3, Math.min(238, x))); g.write16(I + 2, Math.max(3, Math.min(158, y))); return;
      }
      if (v.state === 10 && O.lockStop) { if (this.hit(x, y, O.lockStop)) return this.press(KEY.L); if (this.hit(x, y, O.lockPresent)) return this.press(KEY.R); if (!strict) this.press(KEY.A); return; }
      if (v.state === 1) {
        for (let k = 0; k < 4; k++) if (this.hit(x, y, [O.actions + k])) return this.choose(I + F.inv.action, k);
        if (this.hit(x, y, [O.scroll])) return this.press(KEY.L);
        if (!strict) this.press(KEY.A);
        return;
      }
      if (v.state === 6) { if (!strict) { this.pointAt(x, y); this.press(KEY.A); } return; }
      if (v.state === 7 || v.state === 8) { const k = plate(); if (k >= 0 && v.options[k]) this.choose(I + F.inv.option, k); return; }
    }
    if (!strict) this.press(KEY.A);
  }
  swipe(direction) { this.press(direction < 0 ? KEY.RIGHT : KEY.LEFT); }
  // True while the game has a screen of its own over the page being read: the court record,
  // opened from a page of dialogue, keeps that page pending underneath. Taps and keys then
  // belong to the game, not to the page.
  nativeScreen() { return this.view().process === 7; }
  // On-screen tabs for native inputs the game shows no prompt for (240x160 coordinates).
  touchTabs() {
    const v = this.view(), P = v.process, O = this.P.oam, tabs = [];
    const back = {id: 'back', label: 'もどる', mask: KEY.B, x: 2, y: 142, w: 46, h: 16};
    const record = {id: 'record', label: '法廷記録', mask: KEY.R, x: 186, y: 142, w: 52, h: 16};
    const noMenu = !(v.gameState & 0x10);
    if (P === 7) {
      const drawn = new Set(this.sprites().map(s => s.i));
      if (!this.recordPrompt('B') && !(v.gameState & 0x100)) tabs.push(back);
      if (!drawn.has(O.arrows[0])) tabs.push({id: 'prev', label: '‹', mask: KEY.LEFT, x: 0, y: 40, w: 18, h: 40});
      if (!drawn.has(O.arrows[1])) tabs.push({id: 'next', label: '›', mask: KEY.RIGHT, x: 222, y: 40, w: 18, h: 40});
    }
    // Only where the native state machine reads B/R (investigation input sub-states).
    const invInput = P === 4 && (v.state === 1 && this.sprites().some(s => s.i === O.actions && s.y < 160) || v.state === 6 && v.var1 === 1 && !this.machine.read8(this.P.investigation + this.P.inv.paused) || (v.state === 7 || v.state === 8) && v.var1 === 3);
    if (invInput && v.state !== 1) tabs.push(back);
    else if (P === 12 && v.state === (this.P.select?.state ?? 6)) tabs.push(back);
    // The game reads R for the court record on every dialogue page while its menu is enabled:
    // court, investigation text, a press conversation, a lock's dialogue. The text sits at the
    // bottom, so the tab goes top-right; where the game draws its own R prompt there (a lock's
    // or a statement's present prompt), that prompt is the control.
    const drawn = list => this.sprites().some(s => list.includes(s.i));
    const ownPrompt = P === 4 ? !!O.lockPresent && drawn(O.lockPresent) : P === 6 && drawn(O.present);
    if (noMenu && P >= 3 && P <= 6 && v.flags & 1 && !(v.flags & 4) && !ownPrompt) tabs.push({...record, y: 2});
    else if (noMenu && invInput) tabs.push(record);
    return tabs;
  }
  m() { return this.machine; }
  // --- native observation ---------------------------------------------------------
  scriptState() {
    const g = this.machine, F = this.P, S = F.script, s = F.s;
    return {flags: g.read16(S + s.flags), token: g.read16(S + s.token), section: g.read16(S + s.section), ptr: g.read32(S + s.ptr),
      speaker: g.read8(S + s.speaker) & 0x7F, paragraphDelay: s.delay == null ? 0 : g.read8(S + s.delay), fullscreenDelay: s.fullDelay == null ? 0 : g.read8(S + s.fullDelay), process: g.read8(F.main + F.m.process), scenario: g.read8(F.main + F.m.scenario)};
  }
  characters(fullscreen) {
    const g = this.machine, P = this.P, rows = new Map();
    for (let i = fullscreen ? 32 : 0; i < (fullscreen ? P.textCount : 32); i++) {
      const a = P.text + i * P.textStride, state = g.read16(a); if (!(state & 0x8000)) continue;
      const glyph = state & 0x7FFF, ch = this.case.charset[glyph]; if (ch === undefined) throw Error(`Glyph outside reviewed font: ${glyph}`);
      const x = g.read16(a + 4), y = g.read16(a + 6); if (!rows.has(y)) rows.set(y, []); rows.get(y).push([x, ch]);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, cells]) => cells.sort((a, b) => a[0] - b[0]).map(c => c[1]).join(''));
  }
  endsPageWithoutInput(ptr) {
    const g = this.machine, {lengths, presentation} = this.P; let p = ptr, first = true;
    for (let n = 0; n < 64; n++) {
      const w = g.read16(p);
      if (w >= 0x80) return false;
      if (!first && PAGE_END.has(w)) return true;
      if (!first && (PAGE_WAIT.has(w) || CHOICE.has(w))) return false;
      if (!first && !presentation.has(w) && !TIMED_WAIT.has(w) && w !== 0x0E && w !== 0x01) return false;
      p += (lengths[w] || 1) * 2; first = false;
    }
    return false;
  }
  speakerName(id) { return id ? this.case.nametags[this.case.speakerNametags[id]] || '' : ''; }
  observe() {
    const s = this.scriptState(), key = `${s.scenario}:${s.section}:${s.ptr.toString(16)}`, tag = this.P.key;
    // The game counts the paragraph delay down only in court and investigation (processes
    // 3-6; the court record, 7, opens over a paused page). Elsewhere (evidence added) the
    // finished page waits for that process's own A.
    const delayed = s.paragraphDelay && s.process >= 3 && s.process <= 7;
    if (PAGE_WAIT.has(s.token) && s.flags & 1 && !(s.flags & 0x26) && !delayed) {
      const lines = this.characters(false), text = lines.join('\n').replace(/\s+$/u, '');
      // An input wait on an empty box (or on a page just read as timed text) needs only A.
      if (!text || (this.state.lastTimed && this.state.lastTimed === `${s.scenario}:${s.section}:${text}`)) return {kind: 'auto-a', key};
      return {kind: 'text', key, id: `${tag}:${key}`, text, displayText: text, speaker: this.speakerName(s.speaker), voice: null, hideText: true, source: {scenario: s.scenario, section: s.section, pointer: s.ptr}};
    }
    // A timed page: the script is waiting frames and will clear the box without input.
    if (TIMED_WAIT.has(s.token) && this.endsPageWithoutInput(s.ptr)) {
      const text = this.characters(false).join('\n').replace(/\s+$/u, '');
      // Consecutive timed waits over an unchanged box are one page, not two.
      if (text && this.state.lastTimed === `${s.scenario}:${s.section}:${text}`) return null;
      if (text) return {kind: 'text', key: `${key}:timed`, id: `${tag}:${key}:timed`, text, displayText: text, speaker: this.speakerName(s.speaker), voice: null, hideText: true, timed: true, source: {scenario: s.scenario, section: s.section, pointer: s.ptr}};
    }
    if (CHOICE.has(s.token) && s.flags & 4 && !s.fullscreenDelay && !(s.flags & 0x20)) {
      const options = this.characters(true).map(x => x.trim()).filter(Boolean);
      if (options.length !== (s.token === 8 ? 2 : 3)) return null;
      return {kind: 'choice', key: `${key}:choice`, id: `${tag}:${key}:choice`, hideText: true, nativeOptions: true, options: options.map((text, i) => ({id: String(i), text})), source: {scenario: s.scenario, section: s.section, pointer: s.ptr}};
    }
    return null;
  }
  // --- running --------------------------------------------------------------------
  press(mask, frames = 3) { this.keys |= mask; this.pressFrames = Math.max(this.pressFrames, frames); }
  hold(mask, down) { this.held = down ? (this.held | mask) : (this.held & ~mask); }
  frame(observe = true) {
    this.machine.keyInput(this.keys | (this.held || 0));
    this.machine.runFrame();
    if (this.pressFrames && --this.pressFrames === 0) this.keys = 0;
    this.onFrame?.(this.ppu.frame);
    // Timed pages keep running natively; the next boundary replaces them.
    if (!observe || !(this.state.pending?.kind === 'native' || this.state.pending?.timed) || this.pressFrames) return null;
    const found = this.observe();
    if (found && found.key !== this.state.lastBoundary) {
      this.state.lastBoundary = found.key;
      if (found.kind === 'auto-a') { this.state.lastTimed = null; this.press(KEY.A); return null; }
      this.state.lastTimed = found.timed ? `${found.source.scenario}:${found.source.section}:${found.text}` : null;
      return this.boundary(found);
    }
    return null;
  }
  boundary(found) {
    const {key, ...rest} = found; this.state.pending = {...rest, occurrenceId: this.makeId()};
    return {pending: this.state.pending, effects: []};
  }
  native() { this.state.pending = {kind: 'native', id: `${this.P.key}:native`, hideText: true, live: true}; return {pending: this.state.pending, effects: []}; }
  // Headless: run until the next reader boundary or a frame budget (used by tests and fast-forward).
  runUntilBoundary(maxFrames = 36000, input = null) {
    for (let f = 0; f < maxFrames; f++) { input?.(this, f); const r = this.frame(); if (r) return r; }
    return {pending: this.state.pending, effects: [], timeout: true};
  }
  async startNew(progress, entry = 'start') {
    const episode = (this.content.runtime.entries || []).find(x => x.id === entry);
    if (this.state.started || (entry !== 'start' && !episode)) throw Error('New game requires a fresh engine');
    this.applyProgress(progress); this.state.started = true; this.machine.cpu.reset(0x08000000);
    if (episode) this.bootEpisode(entry);
    return this.native();
  }
  // Start any episode independently: pass the title screen and choose it on the
  // game's own episode select, with every episode made available there. A list select
  // keeps one enable bit per episode; a carousel keeps the episode count in the high
  // nibble and is turned with left/right like a player would.
  bootEpisode(entry) {
    const list = this.content.runtime.entries, index = list.findIndex(x => x.id === entry), target = list[index].scenario, g = this.machine, M = this.P.main, F = this.P;
    const all = (1 << F.episodes) - 1, select = F.select || {state: 6};
    for (let f = 0; f < 6000; f++) {
      const v = this.view();
      if (v.process === 1 && v.state === 2 && !this.pressFrames) { g.write8(M + F.m.selected, 0); this.press(KEY.A); }
      if (v.process === 12 && select.carousel && v.state >= 1 && v.state <= select.state) g.write8(M + F.m.episodes, (g.read8(M + F.m.episodes) & 0x0F) | F.episodes << 4);
      if (v.process === 12 && v.state === select.state && v.flags & 8 && !this.pressFrames) {
        if (select.carousel) { const at = g.read8(M + F.m.selected) - 1; this.press(at < index ? KEY.RIGHT : at > index ? KEY.LEFT : KEY.A); }
        else { g.write8(M + F.m.episodes, g.read8(M + F.m.episodes) | all); this.choose(M + F.m.selected, index); }
      }
      if ((v.process === 3 || v.process === 4) && v.scenario === target) return;
      g.keyInput(this.keys | this.held); g.runFrame(); if (this.pressFrames && --this.pressFrames === 0) this.keys = 0;
    }
    throw Error(`Could not reach ${list[index].label}`);
  }
  async run() { return {pending: this.state.pending || this.native().pending, effects: []}; }
  async advance(choice) {
    const p = this.state.pending;
    if (p?.kind === 'native') { this.press(KEY.A); return {pending: p, effects: []}; }
    if (p?.kind === 'text') { if (!p.timed) this.press(KEY.A); return this.native(); }
    if (p?.kind === 'choice') {
      const option = p.options.find(o => o.id === String(choice)); if (!option) throw Error('Choose a visible option');
      this.machine.write8(this.P.script + this.P.s.cursor, Number(option.id) + (this.P.s.cursorBase || 0)); this.press(KEY.A); return this.native();
    }
    return {pending: p, effects: []};
  }
  // --- persistence ----------------------------------------------------------------
  // A save happens at every page, so it has to be quick. Most of RAM and VRAM is the same from
  // one page to the next: each block is saved as segments packed on their own, and a segment
  // whose bytes have not changed since the previous save keeps its packed text.
  packBlock(name, data) {
    const count = Math.ceil(data.length / SEGMENT), cache = this.packed[name] ||= {last: new Uint8Array(data.length), parts: new Array(count)};
    const now = new Uint32Array(data.buffer, data.byteOffset, data.length >> 2), was = new Uint32Array(cache.last.buffer);
    for (let p = 0; p < count; p++) {
      const from = p * SEGMENT, to = Math.min(data.length, from + SEGMENT);
      let same = cache.parts[p] !== undefined;
      for (let i = from >> 2, end = to >> 2; same && i < end; i++) same = now[i] === was[i];
      if (same) continue;
      const piece = data.subarray(from, to), z = pack(piece);
      cache.parts[p] = z && z.length < piece.length ? 'z' + toBase64(z) : 'r' + toBase64(piece); cache.last.set(piece, from);
    }
    return {seg: SEGMENT, parts: cache.parts.slice(), n: data.length};
  }
  save(media = {}) {
    const snap = this.machine.snapshot(), blocks = {};
    for (const k of Object.keys(BLOCK_SIZES)) { blocks[k] = this.packBlock(k, snap[k]); delete snap[k]; }
    return {format: 'vnkit.save', version: 1, gameId: this.content.id, gameSignature: this.signature, savedAt: new Date().toISOString(),
      state: {machine: {...snap, blocks}, pending: clone(this.state.pending), lastBoundary: this.state.lastBoundary, started: this.state.started, scene: this.state.scene, warnings: []}, media: clone(media)};
  }
  async restore(save) {
    const name = this.P.name;
    if (save?.format !== 'vnkit.save' || save.version !== 1 || save.gameId !== this.content.id || save.gameSignature !== this.signature) throw Error(`Incompatible ${name} save`);
    const m = save.state?.machine; if (!m?.blocks || !m.cpu) throw Error(`Invalid ${name} state`);
    const snap = {...m};
    // A block is segments (current saves), or one packed or raw image (earlier saves).
    const segments = b => {
      if (!Number.isInteger(b.seg) || b.seg <= 0 || !Number.isInteger(b.n) || !Array.isArray(b.parts) || b.parts.length !== Math.ceil(b.n / b.seg)) throw Error(`Invalid ${name} memory image`);
      const out = new Uint8Array(b.n);
      b.parts.forEach((part, p) => {
        const size = Math.min(b.seg, b.n - p * b.seg), bytes = fromBase64(String(part).slice(1)), piece = part[0] === 'z' ? unpack(bytes, size) : bytes;
        if ((part[0] !== 'z' && part[0] !== 'r') || piece.length !== size) throw Error(`Invalid ${name} memory image`);
        out.set(piece, p * b.seg);
      });
      return out;
    };
    for (const [k, b] of Object.entries(m.blocks)) snap[k] = b.parts ? segments(b) : b.z ? unpack(fromBase64(b.z), b.n) : fromBase64(b.raw);
    for (const [k, n] of Object.entries(BLOCK_SIZES)) if (snap[k]?.length !== n) throw Error(`Invalid ${name} memory image`);
    this.machine.restore(snap);
    this.state = {...this.state, pending: save.state.pending?.kind === 'native' || !save.state.pending ? null : save.state.pending, lastBoundary: save.state.lastBoundary, started: true};
    if (!this.state.pending) return {...this.native(), restored: true};
    return {pending: this.state.pending, effects: [], restored: true};
  }
  // Persistent progress is the cartridge's own save memory (episode unlocks, native saves).
  progressSnapshot() { return {format: 'vnkit.progress', version: 1, gameId: this.content.id, gameSignature: this.signature, sram: toBase64(this.machine.sram)}; }
  applyProgress(p) {
    if (!p) return;
    if (p.format !== 'vnkit.progress' || p.version !== 1 || p.gameId !== this.content.id || p.gameSignature !== this.signature) throw Error(`Invalid ${this.P.name} progress`);
    if (p.sram) { const s = fromBase64(p.sram); if (s.length !== 0x8000) throw Error('Invalid cartridge save memory'); this.machine.sram.set(s); }
  }
  newGameEntries() { return [{id: 'start', label: 'Start again'}, ...(this.content.runtime.entries || []).map(({id, label}) => ({id, label}))]; }
  soundtrack() { return []; }
}
export {KEY};
