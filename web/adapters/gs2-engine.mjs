/* Gyakuten Saiban 2 (AGB-A3GJ) source-word interpreter for the shared reader.
 * Scripts are the exact decompressed 16-bit words; this mirrors the native
 * section/pointer model. Court testimony, cross-examination, evidence presentation,
 * penalties and segment changes are native processes reproduced here. Presentation
 * (graphics, animation, sound, timing) settles immediately. Anything else fails
 * closed with its source position. No game data is contained in this file. */
import {randomId, signature} from '../engine.mjs';
const clone = structuredClone;
// Words per command, including the opcode (see docs/gs2-gba-investigation.md).
export const LENGTHS = [1,1,1,2,2,3,2,1,3,4,2,2,2,1,2,3,2,1,4,2,1,1,1,2,2,3,5,2,2,2,4,1,2,1,3,3,1,2,2,3,2,2,4,1,2,1,1,3,2,3,3,6,2,3,2,3,2,2,5,5,2,2,2,1,1,1,2,2,2,1,2,3,3,1,2,2,1,3,2,8,2,3,2,1,3,1,1,2,1,2,2,3,4,1,2,4,5,4,1,1,2,3,4,1,1,1,2,2,1,2,2,2,4,4];
// Commands that only affect graphics, animation, sound or timing.
const PRESENTATION = new Set([0x03,0x05,0x06,0x0B,0x0C,0x12,0x13,0x14,0x1A,0x1B,0x1C,0x1D,0x1E,0x1F,0x22,0x23,0x26,0x27,0x2F,0x30,0x31,0x38,0x42,0x43,0x46,0x47,0x48,0x4C,0x4D,0x4E,0x5C,0x5F,0x65,0x6A,0x6E,0x70,0x2B]);
// Native scenario table order: episode index and part.
const SCENARIOS = ['0_0','0_1','1_0','1_1','1_2','1_3','1_4','1_5','2_0','2_1','2_2','2_3','2_4','2_5','3_0','3_1','3_2','3_3','3_4','3_5','3_6','3_7'];
// Control commands with native semantics implemented by execute()/advance().
export const HANDLED = new Set([0x00,0x01,0x02,0x04,0x07,0x08,0x09,0x0A,0x0D,0x0E,0x0F,0x10,0x11,0x15,0x16,0x17,0x18,0x19,0x20,0x21,0x24,0x25,0x28,0x29,0x2A,0x2C,0x2D,0x2E,0x35,0x36,0x44,0x45,0x49,0x4A,0x54,0x69,0x6F]);
export {PRESENTATION, decodeWords, headerOf};
const MAX_HP = 80, STEP_BUDGET = 200000, PROCESS = {court: 3, investigation: 4};
const bank = n => Array(n).fill(0);
const bits = (a, n) => Array.isArray(a) && a.length === n && a.every(v => v === 0 || v === 1);
const localURL = url => typeof url === 'string' && url.length > 0 && !/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(url) && !url.split(/[\\/]/).some(x => !x || x.startsWith('.'));

export function validateGS2Content(c) {
  const errors = [], r = c?.runtime;
  if (c?.format !== 'vnkit.content' || c.version !== 1 || r?.id !== 'gs2-gba' || r.version !== 1) errors.push('Unsupported Gyakuten Saiban 2 content');
  if (!r?.scripts?.std || !localURL(r?.case?.url) || !/^[0-9a-f]{64}$/.test(r?.case?.sha256 || '')) errors.push('Missing Gyakuten Saiban 2 runtime data');
  for (const [id, s] of Object.entries(r?.scripts || {})) if (!/^(std|\d_\d)$/.test(id) || !localURL(s.url) || !/^[0-9a-f]{64}$/.test(s.sha256)) errors.push(`${id}: invalid script`);
  if (!Array.isArray(r?.episodes) || !r.episodes.length || r.episodes.some(e => !Array.isArray(e.scenarios) || !e.scenarios.length || e.scenarios.some(s => !Number.isInteger(s))))
    errors.push('Invalid episode list');
  return errors;
}

function decodeWords(base64) {
  const binary = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  if (binary.length % 2) throw Error('Odd script length');
  const words = new Uint16Array(binary.length / 2);
  for (let i = 0; i < words.length; i++) words[i] = binary.charCodeAt(2 * i) | binary.charCodeAt(2 * i + 1) << 8;
  return words;
}
// Header: u32 count, then ascending section byte offsets and packed jump labels.
function headerOf(words) {
  const u32 = i => words[2 * i] | words[2 * i + 1] << 16, count = u32(0), entries = [];
  for (let i = 1; i <= count; i++) entries.push(u32(i) >>> 0);
  let sections = 0;
  while (sections < entries.length && entries[sections] <= words.length * 2 && !(entries[sections] & 1) && (!sections || entries[sections] >= entries[sections - 1])) sections++;
  return {entries, sections};
}

export class GS2Engine {
  static async create(content, options = {}) {
    const errors = validateGS2Content(content); if (errors.length) throw Error(errors.join('\n'));
    const engine = new GS2Engine(content, options); await engine.load(); return engine;
  }
  constructor(content, options = {}) {
    this.content = content; this.signature = signature({id: content.id, runtime: content.runtime}); this.scripts = {};
    this.makeId = options.makeId || randomId; this.onStep = options.onStep;
    this.loadJSON = options.loadJSON || (async url => { const r = await fetch(new URL(url, options.baseURL), {signal: AbortSignal.timeout(30000)}); if (!r.ok) throw Error(`Gyakuten Saiban 2 data unavailable (${r.status})`); return r.json(); });
    const episode = content.runtime.episodes[0];
    this.state = {episode: episode.id, scenario: episode.scenarios[0], script: null, section: 0xFFFF, ptr: 0,
      ctx: this.freshContext(0xFFFF), process: 'court', backup: null, record: {profiles: [], evidence: [], mode: null},
      testimonyBegin: 0, loopBridge: 0, flags: bank(256), talkEnd: bank(256), gameState: 0, hp: MAX_HP, hpState: 0, damage: 0,
      rng: 3383, page: [], lastPage: null, choice: null, scene: {background: null, sprites: {}, layers: [], music: null}, pending: null, presented: false, started: false, ended: false, warnings: []};
  }
  freshContext(section) { return {flags: 0, nextSection: section + 1, previousSection: 0, holdItSection: 0, holdItFlag: 0, speaker: 0, fullscreen: false}; }
  async load() {
    const ref = this.content.runtime.case, data = await this.loadJSON(ref.url);
    if (data.format !== 'vnkit.gs2-case' || data.version !== 1 || data.rom_sha1 !== this.content.runtime.rom_sha1 || !Array.isArray(data.charset) || data.charset.length !== 1416)
      throw Error('Gyakuten Saiban 2 case data identity mismatch');
    this.case = data; await this.script('std');
  }
  async script(id) {
    if (this.scripts[id]) return this.scripts[id];
    const ref = this.content.runtime.scripts[id]; if (!ref) throw Error(`Gyakuten Saiban 2 script not admitted: ${id}`);
    const data = await this.loadJSON(ref.url);
    if (data.format !== 'vnkit.gs2-script' || data.version !== 1 || data.id !== id || data.sha256 !== ref.sha256) throw Error(`Gyakuten Saiban 2 script identity mismatch: ${id}`);
    const words = decodeWords(data.words);
    return this.scripts[id] = {id, words, header: headerOf(words)};
  }
  get current() { return this.state.pending; }
  label() { const s = this.state; return `${s.script}:§${s.section.toString(16)}:${(s.ptr * 2).toString(16)}`; }
  fail(message) { throw Error(`${this.label()}: ${message}`); }
  warn(message) { if (!this.state.warnings.includes(message)) this.state.warnings.push(message); }
  scenarioId(index = this.state.scenario) { const id = SCENARIOS[index]; if (!id) this.fail(`Scenario outside native table: ${index}`); return id; }
  words() { return this.scripts[this.state.script].words; }
  // InitScriptSection: sections >= 0x80 are in the scenario script, others in std.
  initSection() {
    const s = this.state, id = s.section >= 0x80 ? this.scenarioId() : 'std', script = this.scripts[id];
    if (!script) this.fail(`Script not loaded: ${id}`);
    const index = s.section >= 0x80 ? s.section - 0x80 : s.section;
    if (index >= script.header.sections) this.fail(`Section outside script: ${s.section.toString(16)}`);
    s.script = id; s.ptr = script.header.entries[index] / 2; s.ctx = this.freshContext(s.section); s.page = []; s.presented = false;
  }
  changeSection(section) { const s = this.state; s.ctx.previousSection = s.section; s.section = section; this.initSection(); s.ptr++; }
  flag(bankId, id, value) {
    const s = this.state;
    if (bankId === 0 || bankId === 2) { const b = bankId ? s.talkEnd : s.flags; if (id > 255) this.fail('Flag outside bank'); if (value === undefined) return b[id]; b[id] = value ? 1 : 0; return; }
    if (bankId === 1) { if (id > 31) this.fail('Game-state flag outside bank'); if (value === undefined) return s.gameState >>> id & 1; s.gameState = value ? (s.gameState | 1 << id) >>> 0 : (s.gameState & ~(1 << id)) >>> 0; return; }
    this.fail(`Unknown flag bank ${bankId}`);
  }
  random() { // Native u8 Random(); per-frame effect callers are not modelled.
    const s = this.state, low = s.rng & 0xFFFF, triple = (low << 16 >> 16) * 3 & 0xFFFF;
    const high = triple >> 8 & 0xFF, next = (high << 8 | (low + high) & 0xFF) & 0xFFFF;
    s.rng = next; return next & 0xFF;
  }
  speakerName() { const id = this.state.ctx.speaker; return id ? this.case.nametags[this.case.speakerNametags[id]] || '' : ''; }
  pageText() { return this.state.page.join('\n').replace(/\s+$/u, ''); }
  presentPage() {
    const s = this.state, text = this.pageText();
    if (!text || s.presented) return false;
    s.presented = true; s.lastPage = {text, speaker: this.speakerName()};
    s.pending = {kind: 'text', id: `${this.label()}`, occurrenceId: this.makeId(), text, speaker: this.speakerName(), displayText: text, voice: null,
      source: {script: s.script, section: s.section, word: s.ptr}};
    return true;
  }
  clearPage() { this.state.page = []; this.state.presented = false; }
  recordItems() {
    const r = this.state.record, name = id => this.case.records[String(id)];
    return [...r.evidence, ...r.profiles].map(id => { const text = name(id); if (!text) this.fail(`Court-record item without reviewed name: ${id}`); return {id: String(id), text}; });
  }
  findRecord(profile, id) { const list = profile ? this.state.record.profiles : this.state.record.evidence; return list.indexOf(id); }
  startScenario(index) {
    const s = this.state, kind = this.case.startProcess[index];
    if (kind !== PROCESS.court) this.fail(`Scenario ${this.scenarioId(index)} starts the investigation process, which is not implemented`);
    s.scenario = index; const init = this.case.initialRecord[index];
    s.record = {profiles: [...init.profiles], evidence: [...init.evidence], mode: null};
    s.flags = bank(256); s.gameState = 0; s.process = 'court'; s.backup = null; s.hpState = 0; s.damage = 0;
    s.section = 0xFFFF; this.changeSection(0x80);
  }
  async startNew(progress, entry = 'start') {
    if (this.state.started || entry !== 'start') throw Error('New game requires a fresh engine');
    const s = this.state; for (const i of this.content.runtime.episodes[0].scenarios) await this.script(this.scenarioId(i));
    s.started = true; s.hp = MAX_HP; this.startScenario(s.scenario); return this.run();
  }
  async run() { const before = clone(this.state); try { return await this.execute(); } catch (error) { this.state = before; throw error; } }
  // Menu shown while the native loop waits at a cross-examination statement.
  statementMenu() {
    const s = this.state, options = [{id: 'next', text: '次へ'}];
    if (s.section - 1 !== s.testimonyBegin) options.push({id: 'back', text: '前へ'});
    if (s.ctx.holdItSection) options.push({id: 'press', text: 'ゆさぶる'});
    options.push({id: 'present', text: 'つきつける'});
    return {kind: 'choice', id: `${this.label()}:statement`, occurrenceId: this.makeId(), options, ...this.prompt(), source: {script: s.script, section: s.section, word: s.ptr, native: 'questioning'}};
  }
  prompt() { const last = this.state.lastPage; return last ? {prompt: last.text, promptSpeaker: last.speaker} : {}; }
  recordMenu() {
    const s = this.state, options = this.recordItems();
    if (!s.record.mode.forced) options.push({id: 'cancel', text: 'もどる'});
    return {kind: 'choice', id: `${this.label()}:record`, occurrenceId: this.makeId(), options, ...this.prompt(), source: {script: s.script, section: s.section, word: s.ptr, native: 'court-record'}};
  }
  async execute() {
    const s = this.state;
    if (s.pending) return {pending: s.pending, effects: []};
    for (let step = 0; step < STEP_BUDGET; step++) {
      // ProcessHPBar: an empty bar in a court process runs the segment's game-over section.
      if (s.hp <= 0 && s.hpState === 0 && ['court', 'testimony', 'questioning'].includes(s.process)) {
        const section = this.case.gameoverSections[s.scenario]; if (!section) this.fail('Penalty exhausted without a game-over section');
        this.changeSection(section); s.hpState = 4;
      }
      const words = this.words();
      if (s.ptr >= words.length) this.fail('Execution outside decoded source');
      const word = words[s.ptr]; this.onStep?.(s, word);
      if (word >= 0x80) {
        const ch = this.case.charset[word - 0x80]; if (ch === undefined) this.fail(`Glyph outside reviewed font: ${word - 0x80}`);
        if (s.ctx.fullscreen) { const c = s.choice; c.lines[c.lines.length - 1] += ch; }
        else { if (!s.page.length) s.page.push(''); s.page[s.page.length - 1] += ch; }
        s.ptr++; continue;
      }
      const op = word, n = LENGTHS[op], args = Array.from(words.subarray(s.ptr + 1, s.ptr + n));
      if (n === undefined) this.fail(`Unknown command ${op.toString(16)}`);
      if (PRESENTATION.has(op)) { s.ptr += n; continue; }
      switch (op) {
        case 0x00: this.initSection(); s.ptr++; break;
        case 0x01:
          if (s.ctx.fullscreen) s.choice.lines.push(''); else { if (!s.page.length) s.page.push(''); s.page.push(''); }
          s.ptr++; break;
        case 0x02: case 0x2D: case 0x04: case 0x0A: case 0x2E: case 0x07: {
          // Command02 family: wait for A on the current page, then clear it.
          if (this.presentPage()) return {pending: s.pending, effects: []};
          // The court-record process owns input: the page stays up until an item is presented.
          if (s.process === 'record') { s.pending = this.recordMenu(); return {pending: s.pending, effects: []}; }
          this.clearPage();
          if (op === 0x0A) { if (s.hp > 0) s.ctx.nextSection = args[0]; }
          if (op === 0x07) { s.ctx.fullscreen = true; s.choice = {lines: ['']}; }
          s.ptr += n; break;
        }
        case 0x08: case 0x09: {
          const lines = s.choice?.lines.map(x => x.trim()).filter(Boolean) || [];
          if (!s.ctx.fullscreen || lines.length !== n - 1) this.fail(`Choice has ${lines.length} source lines for ${n - 1} targets`);
          s.pending = {kind: 'choice', id: this.label(), occurrenceId: this.makeId(), ...this.prompt(), source: {script: s.script, section: s.section, word: s.ptr},
            options: lines.map((text, i) => ({id: String(i), text}))};
          return {pending: s.pending, effects: []};
        }
        case 0x0D: s.ctx.previousSection = s.section; s.section = s.ctx.nextSection; s.ptr++; break; // next word is the section's 0x00
        case 0x0E: s.ctx.speaker = args[0] >> 8 & 0x7F; if (s.ctx.speaker >= this.case.speakerNametags.length) this.fail('Speaker outside nametag map'); s.ptr += n; break;
        case 0x0F: s.ctx.holdItSection = args[0]; s.ctx.holdItFlag = args[1]; s.ptr += n; break;
        case 0x10: this.flag(args[0] >> 8 & 0x7F, args[0] & 0xFF, args[0] >> 15); s.ptr += n; break;
        case 0x11: case 0x21: // Present from the court record; 0x21 is the "take that" variant.
          s.ctx.flags |= 0x10; s.gameState |= op === 0x11 ? 0x100 : 0x300; s.backup = s.process; s.process = 'record';
          s.record.mode = {forced: true, takeThat: op === 0x21}; s.ptr += n; break;
        case 0x15: case 0x45: {
          s.ctx.flags |= 0x08; // SCRIPT_LOOP: native input decides what happens next.
          if (this.presentPage()) return {pending: s.pending, effects: []};
          if (s.process === 'questioning') { s.pending = this.statementMenu(); return {pending: s.pending, effects: []}; }
          if (s.process === 'record') { s.pending = this.recordMenu(); return {pending: s.pending, effects: []}; }
          this.fail(`Script stopped in the ${s.process} process without an implemented native handler`);
        }
        case 0x16: { // End of segment: the next scenario, or the end of the episode.
          const episode = this.content.runtime.episodes.find(e => e.id === s.episode), next = s.scenario + 1;
          if (!episode.scenarios.includes(next)) {
            s.ended = true; s.pending = {kind: 'end', id: this.label(), source: {script: s.script, section: s.section, word: s.ptr}, reason: 'episode-clear'};
            return {pending: s.pending, effects: []};
          }
          await this.script(this.scenarioId(next)); this.startScenario(next); break;
        }
        case 0x17: case 0x18: case 0x19: {
          const profile = !!(args[0] & 0x8000), id = args[0] & 0x3FFF, list = profile ? s.record.profiles : s.record.evidence, at = this.findRecord(profile, id);
          if (op === 0x17 && at < 0) { if (list.length >= 32) this.fail('Court record full'); list.push(id); }
          if (op === 0x18 && at >= 0) list.splice(at, 1);
          if (op === 0x19 && at >= 0) list[at] = args[1] & 0x3FFF;
          s.ptr += n; break;
        }
        case 0x20: case 0x2C: s.ctx.nextSection = args[0]; if (op === 0x2C) this.clearPage(); s.ptr += n; break;
        case 0x24: case 0x49:
          s.ended = true; s.pending = {kind: 'end', id: this.label(), source: {script: s.script, section: s.section, word: s.ptr}, reason: s.hp <= 0 ? 'game-over' : 'title'};
          return {pending: s.pending, effects: []};
        case 0x25: s.ctx.previousSection = args[0]; s.ptr += n; break;
        case 0x28: if (args[0]) { s.backup = s.process; s.process = 'testimony'; } s.ptr += n; break;
        case 0x29: {
          const v = args[0];
          if (v === 0) s.process = 'court';
          else if (v === 4) s.process = 'questioning';
          else if (v !== 2 && v !== 3) { s.backup = s.process; s.process = 'questioning'; s.testimonyBegin = s.section; }
          s.ptr += n; break;
        }
        case 0x2A: s.ctx.nextSection = this.flag(0, args[0]) ? args[1] : args[2]; s.ptr += n; break;
        case 0x35: {
          const want = args[0] & 1, value = this.flag(0, args[0] >> 8);
          if (value !== want) { s.ptr += 3; break; }
          if (args[0] & 0x80) this.jumpLabel(args[1]); else s.ptr = this.sectionStart() + args[1] / 2;
          break;
        }
        case 0x36: this.jumpLabel(args[0]); break;
        case 0x44: case 0x4A: case 0x69: s.ptr += n; break; // verdict and zoom presentation
        case 0x54: {
          if (args[0] === 0) { if (args[1] === 3) { s.hp = Math.max(0, Math.min(MAX_HP, s.hp - (s.damage << 16 >> 16))); s.damage = 0; } }
          else if (args[0] === 2) s.damage = args[1];
          s.ptr += n; break;
        }
        case 0x6F: s.loopBridge = args[0]; s.ptr += n; break;
        default: this.fail(`Native command 0x${op.toString(16)} is not implemented for this process`);
      }
    }
    this.fail('Instruction budget exhausted');
  }
  sectionStart() { const s = this.state, script = this.scripts[s.script], i = s.section >= 0x80 ? s.section - 0x80 : s.section; return script.header.entries[i] / 2; }
  jumpLabel(entry) { // Packed (byte offset, section index) label in the scenario header.
    const s = this.state, script = this.scripts[this.scenarioId()], value = script.header.entries[entry];
    if (entry < script.header.sections || value === undefined) this.fail(`Jump label outside header: ${entry}`);
    s.ctx.previousSection = s.section; s.section = (value >>> 16) + 0x80; s.script = script.id;
    s.ptr = script.header.entries[value >>> 16] / 2 + (value & 0xFFFF) / 2; s.ctx.fullscreen = false;
  }
  presentResult(item) {
    const s = this.state, rows = this.case.courtPresent[s.scenario] || [], mode = s.record.mode;
    const hit = rows.find(r => (r.flag === null || this.flag(0, r.flag)) && r.statement === s.section && r.item === item);
    const backup = s.backup, section = s.section;
    s.record.mode = null; s.gameState &= ~0x300;
    if (hit) { this.changeSection(hit.target); s.process = mode.takeThat || mode.forced ? backup : 'court'; return; }
    if (s.ctx.flags & 0x10) this.changeSection(section + 1);
    else { this.changeSection(0x1F + (this.random() & 3)); s.ctx.nextSection = section; }
    s.ctx.flags &= ~0x10;
    s.process = mode.takeThat ? backup : 'questioning';
  }
  async advance(choice) {
    const before = clone(this.state);
    try {
      const s = this.state, p = s.pending;
      if (!p) return await this.execute();
      if (p.kind === 'end') return {pending: p, effects: []};
      if (p.kind === 'choice') {
        const option = p.options.find(x => x.id === String(choice)); if (!option) throw Error('Choose a visible option');
        s.pending = null;
        if (p.source.native === 'questioning') {
          if (option.id === 'next') this.changeSection(s.ctx.nextSection);
          else if (option.id === 'back') this.changeSection(s.section - 1);
          else if (option.id === 'press') this.changeSection(s.ctx.holdItSection);
          else { s.backup = 'questioning'; s.process = 'record'; s.record.mode = {forced: false, takeThat: false}; s.pending = this.recordMenu(); return {pending: s.pending, effects: []}; }
        } else if (p.source.native === 'court-record') {
          if (option.id === 'cancel') { s.record.mode = null; s.process = 'questioning'; s.pending = this.statementMenu(); return {pending: s.pending, effects: []}; }
          this.presentResult(Number(option.id));
        } else {
          const words = this.words(), op = words[s.ptr];
          s.ctx.nextSection = words[s.ptr + 1 + Number(option.id)]; s.ctx.fullscreen = false; s.choice = null; s.ptr += LENGTHS[op];
        }
      } else s.pending = null;
      return await this.execute();
    } catch (error) { this.state = before; throw error; }
  }
  save(media = {}) { return {format: 'vnkit.save', version: 1, gameId: this.content.id, gameSignature: this.signature, savedAt: new Date().toISOString(), state: clone(this.state), media: clone(media)}; }
  async restore(save) {
    if (save?.format !== 'vnkit.save' || save.version !== 1 || save.gameId !== this.content.id || save.gameSignature !== this.signature) throw Error('Incompatible Gyakuten Saiban 2 save');
    const s = clone(save.state);
    if (!s || !bits(s.flags, 256) || !bits(s.talkEnd, 256) || !Number.isInteger(s.hp) || s.hp < 0 || s.hp > MAX_HP || !Number.isInteger(s.rng) || s.rng < 0 || s.rng > 0xFFFF
      || !s.scene || s.scene.background !== null || s.scene.music !== null || !['court', 'testimony', 'questioning', 'record'].includes(s.process) || !Array.isArray(s.page) || !s.record || !Array.isArray(s.record.evidence) || !Array.isArray(s.record.profiles))
      throw Error('Invalid Gyakuten Saiban 2 state');
    const episode = this.content.runtime.episodes.find(e => e.id === s.episode);
    if (!episode?.scenarios.includes(s.scenario)) throw Error('Saved scenario is not admitted');
    const script = await this.script(s.script);
    if (!Number.isInteger(s.ptr) || s.ptr < 0 || s.ptr >= script.words.length) throw Error('Invalid saved position');
    for (const id of [...s.record.evidence, ...s.record.profiles]) if (!this.case.records[String(id)]) throw Error('Saved court record has an unreviewed item');
    this.state = s; return {pending: this.current, effects: [], restored: true};
  }
  progressSnapshot() { return {format: 'vnkit.progress', version: 1, gameId: this.content.id, gameSignature: this.signature, globals: []}; }
  applyProgress(p) { if (!p) return; if (p.format !== 'vnkit.progress' || p.version !== 1 || p.gameId !== this.content.id || p.gameSignature !== this.signature) throw Error('Invalid Gyakuten Saiban 2 progress'); }
  newGameEntries() { return [{id: 'start', label: 'Start again'}]; }
  soundtrack() { return []; }
}
