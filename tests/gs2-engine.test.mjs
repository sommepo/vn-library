// Synthetic GS2 engine tests. All words, names and text are original test data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GS2Engine, LENGTHS} from '../web/adapters/gs2-engine.mjs';

const glyphs = 'ABCGMNPSWXY12', g = ch => 0x80 + glyphs.indexOf(ch);
const text = s => [...s].map(g);
function script(sections, base) {
  const count = sections.length, header = 4 * (count + 1), words = [], offsets = [];
  for (const section of sections) { offsets.push(header + words.length * 2); words.push(...section); }
  const bytes = new Uint8Array(header + words.length * 2), view = new DataView(bytes.buffer);
  view.setUint32(0, count, true); offsets.forEach((o, i) => view.setUint32(4 + 4 * i, o, true));
  words.forEach((w, i) => view.setUint16(header + 2 * i, w, true));
  return {format: 'vnkit.gs2-script', version: 1, id: base, sha256: base.padEnd(64, '0').replace(/[^0-9a-f]/g, '0'), words: Buffer.from(bytes).toString('base64')};
}
const std = script(Array.from({length: 0x24}, (_, i) => i >= 0x1F && i <= 0x22 ? [0x00, ...text('M'), 0x02, 0x0D] : [0x00, 0x15]), 'std');
const scenario = script([
  /*80*/ [0x00, 0x0E, 3 << 8, ...text('A'), 0x02, 0x07, ...text('Y'), 0x01, ...text('N'), 0x08, 0x81, 0x85, 0x0D],
  /*81*/ [0x00, 0x29, 1, ...text('C'), 0x02, 0x0D],
  /*82*/ [0x00, 0x0F, 0x84, 0, ...text('S1'), 0x15],
  /*83*/ [0x00, ...text('S2'), 0x20, 0x82, 0x15],
  /*84*/ [0x00, ...text('P'), 0x02, 0x20, 0x82, 0x0D],
  /*85*/ [0x00, 0x54, 2, 80, 0x54, 0, 3, ...text('X'), 0x02, 0x0D],
  /*86*/ [0x00, ...text('W'), 0x02, 0x16],
  /*87*/ [0x00, ...text('G'), 0x02, 0x24],
  /*88*/ [0x00, 0x6C],
], '0_0');
const charset = Array.from({length: 1416}, (_, i) => glyphs[i] ?? '・');
const caseData = {format: 'vnkit.gs2-case', version: 1, rom_sha1: 'synthetic', charset,
  nametags: Array.from({length: 0x2F}, (_, i) => i === 2 ? 'Naruhodo' : ''), speakerNametags: Array.from({length: 56}, (_, i) => i === 3 ? 2 : 0),
  records: {0: 'Profile Zero', 5: 'Item Five', 6: 'Item Six'}, startProcess: Array(22).fill(3), gameoverSections: [0x87, ...Array(22).fill(0)],
  initialRecord: Array.from({length: 22}, () => ({profiles: [0], evidence: [5, 6]})),
  courtPresent: [[{statement: 0x83, item: 5, target: 0x86, flag: null, objection: true}], ...Array(21).fill([])]};
const files = {'case.json': caseData, 'scripts/std.json': std, 'scripts/0_0.json': scenario};
const content = {format: 'vnkit.content', version: 1, id: 'gs2-synthetic', title: 'synthetic',
  runtime: {id: 'gs2-gba', version: 1, rom_sha1: 'synthetic', episodes: [{id: '1', scenarios: [0]}],
    case: {url: 'case.json', sha256: '0'.repeat(64)},
    scripts: {std: {url: 'scripts/std.json', sha256: std.sha256}, '0_0': {url: 'scripts/0_0.json', sha256: scenario.sha256}}}};
let n = 0;
const make = () => GS2Engine.create(content, {loadJSON: async url => structuredClone(files[url]), makeId: () => `o${n++}`});
const menu = r => r.pending.options.map(o => o.id);

test('length table covers every native command', () => { assert.equal(LENGTHS.length, 0x72); assert.ok(LENGTHS.every(x => x >= 1 && x <= 8)); });

test('pages, choices, cross-examination, press, presents and episode clear', async () => {
  const e = await make(); let r = await e.startNew(null);
  assert.deepEqual([r.pending.kind, r.pending.text, r.pending.speaker], ['text', 'A', 'Naruhodo']);
  r = await e.advance(); assert.equal(r.pending.kind, 'choice'); assert.deepEqual(r.pending.options.map(o => o.text), ['Y', 'N']);
  assert.equal(r.pending.prompt, 'A');
  r = await e.advance('0'); assert.equal(r.pending.text, 'C');
  r = await e.advance(); assert.equal(r.pending.text, 'S1');
  r = await e.advance(); assert.deepEqual(menu(r), ['next', 'press', 'present'], 'no previous statement at the start');
  assert.equal(r.pending.prompt, 'S1');
  r = await e.advance('press'); assert.equal(r.pending.text, 'P');
  r = await e.advance(); assert.equal(r.pending.text, 'S1');
  r = await e.advance(); r = await e.advance('next'); assert.equal(r.pending.text, 'S2');
  r = await e.advance(); assert.deepEqual(menu(r), ['next', 'back', 'present']);
  const saved = JSON.parse(JSON.stringify(e.save())), copy = await make(); await copy.restore(saved); assert.deepEqual(copy.state, e.state);
  r = await e.advance('present'); assert.deepEqual(menu(r), ['5', '6', '0', 'cancel']);
  assert.deepEqual(r.pending.options.map(o => o.text).slice(0, 3), ['Item Five', 'Item Six', 'Profile Zero']);
  r = await e.advance('cancel'); assert.deepEqual(menu(r), ['next', 'back', 'present']);
  r = await e.advance('present'); r = await e.advance('6');
  assert.equal(r.pending.text, 'M', 'wrong evidence runs a shared objection section'); assert.equal(e.state.process, 'questioning');
  r = await e.advance(); assert.equal(r.pending.text, 'S2', 'then returns to the same statement');
  r = await e.advance(); r = await e.advance('present'); r = await e.advance('5');
  assert.equal(r.pending.text, 'W'); assert.equal(e.state.process, 'court');
  r = await e.advance(); assert.deepEqual([r.pending.kind, r.pending.reason], ['end', 'episode-clear']);
});

test('an empty penalty bar runs the segment game-over section', async () => {
  const e = await make(); let r = await e.startNew(null);
  r = await e.advance(); r = await e.advance('1'); assert.equal(e.state.hp, 0);
  assert.equal(r.pending.text, 'G', 'native HP check switches before further script text');
  r = await e.advance(); assert.deepEqual([r.pending.kind, r.pending.reason], ['end', 'game-over']);
});

test('unimplemented native commands fail closed with a source location and roll back', async () => {
  const e = await make(); await e.startNew(null);
  e.state.pending = null; e.state.section = 0x88; e.initSection(); e.state.ptr++;
  const before = structuredClone(e.state);
  await assert.rejects(e.run(), /0_0:§88:[0-9a-f]+: Native command 0x6c is not implemented/);
  assert.deepEqual(e.state, before);
});

test('saves are bound to the game and reject unreviewed court-record items', async () => {
  const e = await make(); await e.startNew(null); const save = e.save();
  await assert.rejects((await make()).restore({...save, gameId: 'other'}), /Incompatible/);
  const bad = structuredClone(save); bad.state.record.evidence.push(99);
  await assert.rejects((await make()).restore(bad), /unreviewed/);
});
