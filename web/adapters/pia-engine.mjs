/* Reader facade for the supplied PS2 edition. Source execution lives in PiaVM. */
import { randomId, signature } from '../engine.mjs';
import { PiaVM } from './pia-vm.mjs';
import { PiaNatives } from './pia-natives.mjs';
import { mountScene } from './pia-task.mjs';
const clone = value => structuredClone(value);

export function validatePiaContent(content) {
  const errors = [];
  if (content?.format !== 'vnkit.content' || content.version !== 1 || content.adapter?.id !== 'pia-ps2' || content.runtime?.id !== 'pia-ps2-scrp' || content.runtime.version !== 1) errors.push('Incompatible Pia runtime format');
  if (!content?.runtime?.scripts?.[content.runtime.entry]) errors.push('Missing evidenced entry script');
  if (content.nativeData?.format !== 'vnkit.pia-native-data' || content.nativeData.version !== 1) errors.push('Missing source native lookup tables');
  for (const [id, asset] of Object.entries(content.assets || {})) {
    if (!['image', 'voice', 'music', 'sound', 'script', 'video'].includes(asset.type)) errors.push(`${id}: unsupported asset type`);
    if (typeof asset.url !== 'string' || /^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(asset.url) || asset.url.split(/[\\/]/).some(p => p === '..' || p.startsWith('.'))) errors.push(`${id}: unsafe resource URL`);
  }
  for (const [name, script] of Object.entries(content.runtime?.scripts || {})) {
    if (!/^[A-Z0-9_-]+\.SPC$/.test(name) || !/^[a-f0-9]{64}$/.test(script.sha256)) errors.push(`${name}: invalid script identity`);
    if (content.assets?.[`script:${name}`]?.url !== script.url) errors.push(`${name}: missing registered script resource`);
  }
  return errors;
}

export class PiaEngine {
  static async create(content, options = {}) {
    const errors = validatePiaContent(content);
    if (errors.length) throw new Error(errors.join('\n'));
    const engine = new PiaEngine(content, options);
    await engine.loadScript(content.runtime.entry);
    engine.vm = new PiaVM(engine.scripts, {entry: content.runtime.entry,
      native: (name, args, vm, instruction) => engine.natives.invoke(name, args, vm, instruction)});
    return engine;
  }
  constructor(content, options) {
    this.content = content;
    this.legacySignature = signature(content);
    // Media derivatives and UI changes do not change the source program/state ABI.
    this.signature = signature({id: content.id, runtime: {id: content.runtime.id, version: content.runtime.version,
      entry: content.runtime.entry, scripts: Object.fromEntries(Object.entries(content.runtime.scripts).map(([name, item]) => [name, item.sha256]))},
      nativeData: {version: content.nativeData.version, evidence: content.nativeData.evidence}, stateVersion: 1});
    this.makeId = options.makeId || randomId;
    this.loadJSON = options.loadJSON || (async url => {const response = await fetch(new URL(url, options.baseURL)); if (!response.ok) throw new Error(`Script load failed (${response.status}): ${url}`); return response.json();});
    this.scripts = {};
    this.natives = new PiaNatives(content);
    this.setupComplete = options.skipSetup === true;
    this.setup = clone(options.startup || content.startup);
    if (this.setup) this.content = {...content, startup: this.setup};
    this.natives = new PiaNatives(this.content);
  }
  async loadScript(name) {
    if (this.scripts[name]) return;
    const reference = this.content.runtime.scripts[name];
    if (!reference) throw new Error(`Referenced original scenario is absent: ${name}`);
    const parsed = await this.loadJSON(reference.url);
    if (parsed.source !== name || parsed.sha256 !== reference.sha256) throw new Error(`Scenario identity mismatch: ${name}`);
    this.scripts[name] = parsed;
    this.vm?.addScript(parsed, name);
  }
  get state() {
    const raw = this.vm.state.native.pia?.scene || {background: null, sprites: {}, music: null};
    const scene = {...raw, sprites: {}, music: typeof raw.music === 'string' ? {asset: raw.music, loop: true} : raw.music, layers: []};
    const appendLayer = (layer, left = 0, top = 0) => scene.layers.push({...layer,
      x: (left + layer.x) / 640 * 100, y: (top + layer.y) / 480 * 100,
      width: layer.width / 640 * 100, height: layer.height / 480 * 100});
    const background = Object.values(this.content.resources.cg).find(r => r.asset === raw.background);
    for (const layer of background?.layers || []) appendLayer(layer);
    for (const sprite of Object.values(raw.sprites)) {
      const data = this.content.resources.sprite[sprite.sourceName];
      if (!data) throw new Error(`Missing original sprite layout ${sprite.sourceName}`);
      const anchor = [0, 90, 200, 320, 440, 570][sprite.position] ?? 320;
      const left = anchor - (data.indent === -1 || data.indent == null ? Math.floor(data.width / 2) : data.indent);
      const top = 480 - data.height;
      // _NchrDecodeNonBlock enables GS alpha blending for the RGBA body;
      // source alpha 0x80 represents opacity1, not browser PNG opacity128/255.
      appendLayer({asset: data.asset, x: 0, y: 0, width: data.width, height: data.height, alphaScale: 255 / 128}, left, top);
      for (const layer of data.layers) appendLayer(layer, left, top);
    }
    return {pc: this.vm.state.frame?.pc, vars: this.vm.state.globals.number,
      stack: this.vm.state.parents, scene,
      pending: this.current, ended: this.vm.state.ended};
  }
  get current() {
    if (!this.setupComplete) return {kind: 'setup', id: 'native-startup', defaults: this.setup};
    if (this.leadSound) return {kind: 'sound', id: `${this.vm.current.id}:lead-sound`, asset: this.leadSound};
    if (this.taskSound) return {kind: 'sound', id: `${this.vm.current.id}:task-sound`, asset: this.taskSound};
    return this.vm.current;
  }
  async finish(result) {
    const effects = [...result.effects];
    for (let count = 0; result.pending?.kind === 'chain'; count++) {
      if (count >= 100) throw new Error('Excessive consecutive scenario loads');
      await this.loadScript(result.pending.script);
      this.vm.resume(); result = this.vm.run(); effects.push(...result.effects);
    }
    if (result.pending && ['text', 'choice'].includes(result.pending.kind) && !result.pending.occurrenceId) result.pending.occurrenceId = this.makeId();
    if (result.pending?.kind === 'task') {result.pending.kind = 'wait'; result.pending.nativeTask = true;}
    if (result.pending?.kind === 'wait' && result.pending.remainingMs == null) result.pending.remainingMs = result.pending.ms;
    if (result.pending?.kind === 'text' && result.pending.leadSound && !result.pending.leadSoundCompleted) this.leadSound = result.pending.leadSound;
    if (result.ended && !result.pending) this.vm.state.pending = {kind: 'end', id: `${this.vm.script}:exit`};
    return {pending: this.current, effects};
  }
  async run() {
    if (!this.setupComplete) return {pending: this.current, effects: []};
    return this.finish(this.vm.run());
  }
  async advance(value) {
    if (!this.setupComplete) {
      const setup = {...this.setup, ...value};
      if (![1, 2, 3].includes(Number(setup.uniformType)) || ![setup.familyName, setup.firstName].every(s => typeof s === 'string' && [...s].length > 0 && [...s].length <= 6)) throw new Error('Use a name of 1–6 characters and an available uniform.');
      setup.uniformType = Number(setup.uniformType);
      this.setup = setup;
      this.natives = new PiaNatives({...this.content, startup: setup});
      this.setupComplete = true;
      return this.run();
    }
    if (this.leadSound) {this.leadSound = null; this.vm.current.leadSoundCompleted = true; return {pending: this.vm.current, effects: []};}
    if (this.taskSound) {this.taskSound = null; this.vm.current.soundCompleted = true;}
    if (this.vm.current?.nativeTask) {
      if (this.vm.current.sound && !this.vm.current.soundCompleted) {this.taskSound = this.vm.current.sound; return {pending: this.current, effects: []};}
      this.natives.completeTask(this.vm);
    }
    if (this.current?.kind === 'choice') {
      const option = this.current.options.find(option => option.id === value);
      if (!option) throw new Error('Choose an available original option');
      value = option.value ?? option.result ?? Number(option.id);
      if (typeof this.natives.choose === 'function') this.natives.choose(this.vm, value);
    }
    return this.finish(this.vm.advance(value));
  }
  save(media = {}) {
    return {format: 'vnkit.save', version: 1, gameId: this.content.id, gameSignature: this.signature,
      runtime: 'pia-ps2-scrp', savedAt: new Date().toISOString(), state: this.vm.exportState(),
      setup: clone(this.setup), setupComplete: this.setupComplete, leadSound: this.leadSound || null,
      taskSound: this.taskSound || null, media: clone(media)};
  }
  async restore(save) {
    const accepted = [this.signature, this.legacySignature, ...(this.content.compatibleSaveSignatures || [])];
    if (save?.format !== 'vnkit.save' || save.version !== 1 || save.runtime !== 'pia-ps2-scrp' || save.gameId !== this.content.id || !accepted.includes(save.gameSignature)) throw new Error('Save is for a different game, content revision, or runtime');
    const names = new Set([save.state?.frame?.script, ...(save.state?.parents || []).map(frame => frame.script)]);
    // String pointers can refer to scripts previously loaded by exec/chain.
    const visit = value => {if (!value || typeof value !== 'object') return; if (value.kind === 'string' && value.script) names.add(value.script); for (const child of Object.values(value)) visit(child);};
    visit(save.state);
    for (const name of names) await this.loadScript(name);
    this.vm.restore(save.state);
    this.setup = clone(save.setup); this.setupComplete = save.setupComplete === true;
    this.leadSound = save.leadSound || null;
    this.taskSound = save.taskSound || null;
    return this.current;
  }
  mountScene(art, mediaURL) {return mountScene(this.vm.state.native.pia?.scene.task, art, mediaURL);}
}
