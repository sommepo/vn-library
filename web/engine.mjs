/* Original MIT-licensed vnkit runtime. No game-specific rules belong here. */
export const FORMAT = 'vnkit.content';
export const VERSION = 1;
const OPS = new Set(['text', 'choice', 'jump', 'if', 'set', 'add', 'call', 'return', 'background', 'sprite', 'music', 'sound', 'wait', 'end']);
const clone = value => JSON.parse(JSON.stringify(value));
export function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) return [...globalThis.crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
  // IDs deduplicate local presentations; they are not authentication secrets.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
export function plainText(value, ruby = 'base') {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) throw new Error('Text must be a string or ruby run array');
  return value.map(run => {
    if (typeof run === 'string') return run;
    if (!run || typeof run.base !== 'string' || (run.reading != null && typeof run.reading !== 'string')) throw new Error('Malformed ruby run');
    return ruby === 'reading' ? (run.reading || run.base) : ruby === 'both' && run.reading ? `${run.base}（${run.reading}）` : run.base;
  }).join('');
}
export function characterCount(value) { return [...plainText(value)].filter(c => !/\s/u.test(c)).length; }
export function signature(content) {
  let hash = 2166136261;
  for (const char of JSON.stringify(content)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function validateContent(content) {
  const errors = [];
  if (content?.format !== FORMAT || content.version !== VERSION) errors.push('Unsupported content format/version');
  if (typeof content?.id !== 'string' || !content.id) errors.push('Missing game id');
  if (!Array.isArray(content?.instructions) || !content.instructions.length) return [...errors, 'Missing instructions'];
  const ids = new Set();
  const asset = (id, where) => { if (id != null && (!content.assets || !Object.hasOwn(content.assets, id))) errors.push(`${where}: missing asset ${id}`); };
  for (const i of content.instructions) {
    if (!i.id || ids.has(i.id)) errors.push(`Missing or duplicate instruction id ${i.id}`);
    ids.add(i.id);
    if (!OPS.has(i.op)) errors.push(`${i.id}: unsupported opcode ${i.op}${i.source ? ` at ${JSON.stringify(i.source)}` : ''}`);
    if (['text', 'choice'].includes(i.op)) {
      try {
        if (i.op === 'text') plainText(i.text);
        else if (!Array.isArray(i.options) || !i.options.length) errors.push(`${i.id}: empty choice`);
        else for (const o of i.options) { if (!o.id) errors.push(`${i.id}: option without id`); plainText(o.text); }
      } catch (e) { errors.push(`${i.id}: ${e.message}`); }
    }
    if (['background', 'sprite', 'music', 'sound'].includes(i.op)) asset(i.asset, i.id);
    if (i.voice) asset(i.voice, i.id);
    if (i.op === 'wait' && (!Number.isFinite(i.ms) || i.ms < 0 || i.ms > 3600000)) errors.push(`${i.id}: invalid wait`);
    if (['set', 'add'].includes(i.op) && (typeof i.name !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(i.name))) errors.push(`${i.id}: invalid variable`);
    if (i.op === 'set' && (i.value !== null && !['string', 'boolean', 'number'].includes(typeof i.value) || typeof i.value === 'number' && !Number.isFinite(i.value))) errors.push(`${i.id}: set requires a scalar value`);
    if (i.op === 'add' && !Number.isFinite(i.value)) errors.push(`${i.id}: add requires a finite number`);
    if (i.op === 'sprite' && (typeof i.slot !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(i.slot))) errors.push(`${i.id}: sprite requires a safe slot`);
    for (const c of [i.op === 'if' ? i.condition : null, ...(i.options || []).map(o => o.condition)].filter(Boolean)) {
      if (typeof c.var !== 'string' || !['eq', 'ne', 'lt', 'lte', 'gt', 'gte'].includes(c.operator)) errors.push(`${i.id}: invalid or unsupported condition`);
    }
    if (i.op === 'if' && !i.condition) errors.push(`${i.id}: missing condition`);
  }
  const target = (value, where) => { if (typeof value !== 'string' || !ids.has(value)) errors.push(`${where}: unresolved target ${value}`); };
  target(content.entry, 'entry');
  for (const i of content.instructions) {
    if (i.next) target(i.next, i.id);
    if (['jump', 'call'].includes(i.op)) target(i.target, i.id);
    if (i.op === 'if') { target(i.then, i.id); target(i.else, i.id); }
    if (i.op === 'choice') for (const o of i.options || []) target(o.target, i.id);
  }
  for (const [id, a] of Object.entries(content.assets || {})) {
    if (!['image', 'music', 'voice', 'sound', 'video'].includes(a.type)) errors.push(`${id}: unknown asset type`);
    if (typeof a.url !== 'string' || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(a.url) || a.url.split(/[\\/]/).includes('..')) errors.push(`${id}: unsafe asset URL`);
  }
  return errors;
}
function condition(c, vars) {
  if (!c || typeof c.var !== 'string') throw new Error('Invalid condition');
  const left = Object.hasOwn(vars, c.var) ? vars[c.var] : 0;
  switch (c.operator) {
    case 'eq': return left === c.value;
    case 'ne': return left !== c.value;
    case 'lt': return left < c.value;
    case 'lte': return left <= c.value;
    case 'gt': return left > c.value;
    case 'gte': return left >= c.value;
    default: throw new Error(`Unknown condition operator ${c.operator}`);
  }
}
export class Engine {
  constructor(content, options = {}) {
    const errors = validateContent(content);
    if (errors.length) throw new Error(errors.join('\n'));
    this.content = content;
    this.signature = signature(content);
    this.byId = new Map(content.instructions.map((i, index) => [i.id, index]));
    this.makeId = options.makeId || randomId;
    this.state = { pc: this.byId.get(content.entry), vars: {}, stack: [], scene: { background: null, sprites: {}, music: null }, pending: null, ended: false };
  }
  get current() { return this.state.pending; }
  run() {
    if (this.state.pending || this.state.ended) return { pending: this.state.pending, effects: [] };
    const effects = [];
    for (let step = 0; step < 10000; step++) {
      const i = this.content.instructions[this.state.pc];
      if (!i) throw new Error(`Execution left the instruction stream at ${this.state.pc}`);
      this.state.pc = i.next ? this.byId.get(i.next) : this.state.pc + 1;
      switch (i.op) {
        case 'set': this.state.vars[i.name] = clone(i.value); break;
        case 'add': {
          const previous = Object.hasOwn(this.state.vars, i.name) ? this.state.vars[i.name] : 0;
          if (!Number.isFinite(previous) || !Number.isFinite(previous + i.value)) throw new Error(`${i.id}: add requires finite numeric state`);
          this.state.vars[i.name] = previous + i.value; break;
        }
        case 'jump': this.state.pc = this.byId.get(i.target); break;
        case 'if': this.state.pc = this.byId.get(condition(i.condition, this.state.vars) ? i.then : i.else); break;
        case 'call': this.state.stack.push(this.state.pc); this.state.pc = this.byId.get(i.target); break;
        case 'return': if (!this.state.stack.length) throw new Error(`${i.id}: return with empty call stack`); this.state.pc = this.state.stack.pop(); break;
        case 'background': this.state.scene.background = i.asset; effects.push(i); break;
        case 'sprite':
          if (i.asset == null) delete this.state.scene.sprites[i.slot];
          else this.state.scene.sprites[i.slot] = { asset: i.asset, x: i.x ?? 50, y: i.y ?? 100, scale: i.scale ?? 1, z: i.z ?? 1 };
          effects.push(i); break;
        case 'music': this.state.scene.music = i.asset == null ? null : { asset: i.asset, loop: i.loop !== false }; effects.push(i); break;
        case 'sound': effects.push(i); break;
        case 'text': this.state.pending = { kind: 'text', id: i.id, occurrenceId: this.makeId(), speaker: i.speaker || '', text: clone(i.text), voice: i.voice || null, source: i.source || null }; break;
        case 'choice': {
          const options = i.options.filter(o => !o.condition || condition(o.condition, this.state.vars));
          if (!options.length) throw new Error(`${i.id}: choice has no available options`);
          this.state.pending = { kind: 'choice', id: i.id, occurrenceId: this.makeId(), options: clone(options) }; break;
        }
        case 'wait': this.state.pending = { kind: 'wait', id: i.id, ms: i.ms, remainingMs: i.ms }; break;
        case 'end': this.state.ended = true; this.state.pending = { kind: 'end', id: i.id }; break;
        default: throw new Error(`${i.id}: unsupported opcode ${i.op}`);
      }
      if (this.state.pending) return { pending: this.state.pending, effects };
    }
    throw new Error('Execution limit exceeded: probable control-flow loop (no instructions ignored)');
  }
  advance(optionId) {
    const p = this.current;
    if (p?.kind === 'end') return { pending: p, effects: [] };
    if (p?.kind === 'choice') {
      const option = p.options.find(o => o.id === optionId);
      if (!option) throw new Error('Choose an available option');
      this.state.pc = this.byId.get(option.target);
    }
    this.state.pending = null;
    return this.run();
  }
  save(media = {}) {
    return { format: 'vnkit.save', version: 1, gameId: this.content.id, gameSignature: this.signature, savedAt: new Date().toISOString(), state: clone(this.state), media: clone(media) };
  }
  restore(save) {
    if (save?.format !== 'vnkit.save' || save.version !== 1 || save.gameId !== this.content.id || save.gameSignature !== this.signature) throw new Error('Save is for a different game, content revision, or format');
    const s = save.state;
    if (!s || !Number.isInteger(s.pc) || s.pc < 0 || s.pc > this.content.instructions.length || !Array.isArray(s.stack) || s.stack.some(p => !Number.isInteger(p) || p < 0 || p >= this.content.instructions.length) || !s.scene || !s.vars || typeof s.vars !== 'object' || Array.isArray(s.vars)) throw new Error('Malformed execution state');
    if (s.pending) {
      const instruction = this.content.instructions[this.byId.get(s.pending.id)];
      if (!instruction || instruction.op !== s.pending.kind) throw new Error('Save references an invalid presentation');
      if (s.pending.kind === 'text' && (JSON.stringify(s.pending.text) !== JSON.stringify(instruction.text) || s.pending.speaker !== (instruction.speaker || '') || s.pending.voice !== (instruction.voice || null) || typeof s.pending.occurrenceId !== 'string')) throw new Error('Save text does not match source');
      if (s.pending.kind === 'choice' && (typeof s.pending.occurrenceId !== 'string' || JSON.stringify(s.pending.options) !== JSON.stringify(instruction.options.filter(o => !o.condition || condition(o.condition, s.vars))))) throw new Error('Save contains invalid choices');
      if (s.pending.kind === 'wait' && (s.pending.ms !== instruction.ms || !Number.isFinite(s.pending.remainingMs) || s.pending.remainingMs < 0 || s.pending.remainingMs > instruction.ms)) throw new Error('Save wait does not match source');
      const expectedPc = instruction.next ? this.byId.get(instruction.next) : this.byId.get(instruction.id) + 1;
      if (s.pc !== expectedPc) throw new Error('Save execution position does not match pending instruction');
    }
    const sceneAssets = [s.scene.background, s.scene.music?.asset, ...Object.values(s.scene.sprites || {}).map(sprite => sprite.asset)];
    if (sceneAssets.some(id => id != null && !Object.hasOwn(this.content.assets, id))) throw new Error('Save references unavailable media');
    if (!s.scene.sprites || Array.isArray(s.scene.sprites) || Object.values(s.scene.sprites).some(sprite => ['x', 'y', 'scale', 'z'].some(k => !Number.isFinite(sprite[k])))) throw new Error('Malformed saved scene composition');
    this.state = clone(s);
    return this.current;
  }
}
