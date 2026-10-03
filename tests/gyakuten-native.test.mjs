// Series engine behaviour on a blank machine (no cartridge data): native state is written
// directly into RAM/OAM the way each edition's profile describes it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {GyakutenNativeEngine, KEY} from '../web/adapters/gyakuten-native.mjs';
import {GS1_PROFILE} from '../web/adapters/gs1-native.mjs';
import {GS2_PROFILE} from '../web/adapters/gs2-native.mjs';
import {GS3_PROFILE} from '../web/adapters/gs3-native.mjs';
import {pack, toBase64} from '../web/adapters/gba/pack.mjs';

const charset = ['　', 'あ', 'い', 'う'];
function engine(P) {
  const content = {format: 'vnkit.content', version: 1, id: `test-${P.key}`, runtime: {id: P.runtimeId, version: 1, rom_sha1: P.romSha1, rom: {url: 'rom.gba'}, case: {url: 'case.json'}, entries: []}};
  const e = new GyakutenNativeEngine(content, new Uint8Array(0x1000), {charset, nametags: [''], speakerNametags: [0]}, {}, P);
  e.machine.ppu = null; e.machine.apu = null; return e;
}
const setProcess = (e, process, state = 1) => { e.machine.write8(e.P.main + e.P.m.process, process); e.machine.write8(e.P.main + e.P.m.process + 1, state); };
// One finished page waiting for A: page-wait command, text active, one glyph in the box.
function finishedPage(e, delay) {
  const g = e.machine, S = e.P.script, s = e.P.s;
  g.write16(S + s.token, 0x02); g.write16(S + s.flags, 1); if (s.delay != null) g.write8(S + s.delay, delay);
  g.write16(e.P.text, 0x8000 | 2); g.write16(e.P.text + 4, 0); g.write16(e.P.text + 6, 0);
}
const sprite = (e, i, x, y, tile) => { const a = 0x07000000 + i * 8; e.machine.write16(a, y); e.machine.write16(a + 2, x | 1 << 14); e.machine.write16(a + 4, tile); };

test('the paragraph delay holds pages only where the game counts it down', () => {
  const e = engine(GS2_PROFILE); finishedPage(e, 8);
  for (const p of [3, 4, 5, 6, 7]) { setProcess(e, p); assert.equal(e.observe(), null, `process ${p}`); }
  setProcess(e, 8); // evidence added: the window waits for A while the delay stays frozen
  assert.deepEqual([e.observe()?.kind, e.observe()?.text], ['text', 'い']);
  finishedPage(e, 0); setProcess(e, 3); assert.equal(e.observe()?.text, 'い');
});

test('an edition without a delay counter reports a finished page at once', () => {
  const e = engine(GS3_PROFILE); finishedPage(e); setProcess(e, 3);
  assert.equal(e.observe()?.text, 'い');
});

test('choices write each edition\'s native cursor (GS3 counts from 1)', async () => {
  for (const [P, expected] of [[GS2_PROFILE, 2], [GS3_PROFILE, 3]]) {
    const e = engine(P); e.state.pending = {kind: 'choice', options: ['0', '1', '2'].map(id => ({id, text: id}))};
    await e.advance('2');
    assert.equal(e.machine.read8(P.script + P.s.cursor), expected, P.key); assert.equal(e.keys & KEY.A, KEY.A);
  }
});

test('court-record prompts drawn by one sprite run are told apart by tile', () => {
  const e = engine(GS1_PROFILE); setProcess(e, 7);
  // Present mode: A 決定 at 140/156, B もどる at 200/216 (sprites 45-48).
  sprite(e, 45, 140, 96, 0x1C0); sprite(e, 46, 156, 96, 0x1D0); sprite(e, 47, 200, 96, 0x1C4); sprite(e, 48, 216, 96, 0x1D8);
  e.touch(160, 100); assert.equal(e.keys, KEY.A); e.keys = 0;
  e.touch(220, 100); assert.equal(e.keys, KEY.B); e.keys = 0;
  assert.ok(!e.touchTabs().some(t => t.id === 'back'), 'the game draws its own back prompt');
  // Browse mode: the same sprites read R 人物ファイル; no B prompt, so the reader adds a back tab.
  sprite(e, 45, 160, 96, 0x1C8); sprite(e, 46, 176, 96, 0x1A8); sprite(e, 47, 208, 96, 0x1B0); e.machine.write16(0x07000000 + 48 * 8, 0x200);
  e.touch(180, 100); assert.equal(e.keys, KEY.R); e.keys = 0;
  assert.ok(e.touchTabs().some(t => t.id === 'back'));
});

test('a carousel episode select turns with left/right and chooses in the middle', () => {
  const e = engine(GS3_PROFILE); setProcess(e, 12, GS3_PROFILE.select.state); e.machine.write16(GS3_PROFILE.script + GS3_PROFILE.s.flags, 8);
  for (const [x, key] of [[20, KEY.LEFT], [220, KEY.RIGHT], [120, KEY.A]]) { e.keys = 0; e.touch(x, 80); assert.equal(e.keys, key, `x ${x}`); }
});

test('a detector minigame takes taps as moves and a tap on the detector as a check', () => {
  const e = engine(GS3_PROFILE), g = e.machine, P = GS3_PROFILE, I = P.investigation;
  setProcess(e, 4, 8);
  assert.equal(e.detecting(), false);
  g.write16(P.script + P.s.token, P.s.detector.token); g.write8(P.script + P.s.detector.flag, P.s.detector.value);
  // Sliding in or out: the game moves the detector itself, so a tap must not place it.
  g.write8(P.script + P.s.detector.phase, 1); g.write16(I, 300); g.write16(I + 2, 20);
  assert.equal(e.detecting(), false);
  e.touch(100, 90); assert.deepEqual([g.read16(I), g.read16(I + 2), e.keys], [300, 20, 0]);
  g.write8(P.script + P.s.detector.phase, P.s.detector.ready);
  assert.equal(e.detecting(), true);
  e.touch(100, 90); assert.deepEqual([g.read16(I), g.read16(I + 2), e.keys], [100, 90, 0]);
  e.touch(104, 92); assert.equal(e.keys, KEY.A);
});

test('the record tab is offered on every dialogue page where the game reads R', () => {
  for (const P of [GS1_PROFILE, GS2_PROFILE, GS3_PROFILE]) {
    const e = engine(P), g = e.machine, hasTab = () => e.touchTabs().some(t => t.id === 'record' && t.y === 2);
    g.write16(P.script + P.s.flags, 1); // a page of text is up
    // Court, investigation text (examine, talk), testimony, a press conversation.
    for (const [process, state] of [[3, 1], [4, 6], [4, 8], [5, 1], [6, 1]]) { setProcess(e, process, state); assert.ok(hasTab(), `${P.key} process ${process} state ${state}`); }
    // The game's own R prompt is the control where it is drawn: a statement's present prompt...
    setProcess(e, 6); sprite(e, P.oam.present[0], 176, 0, 0); assert.ok(!hasTab(), `${P.key} present prompt`);
    // ...which in investigation is another sprite's slot (the scroll prompt in GS2 and GS3).
    setProcess(e, 4, 6); assert.ok(hasTab(), `${P.key} investigation with sprite ${P.oam.present[0]} drawn`);
    if (P.oam.lockPresent) { setProcess(e, 4, 10); sprite(e, P.oam.lockPresent[0], 176, 0, 0); assert.ok(!hasTab(), `${P.key} lock prompt`); }
    // No tab while the game has its menu disabled, or outside dialogue pages.
    setProcess(e, 3); g.write32(P.main + P.m.gameState, 0x10); assert.ok(!hasTab(), `${P.key} menu disabled`);
    g.write32(P.main + P.m.gameState, 0); g.write16(P.script + P.s.flags, 0); assert.ok(!hasTab(), `${P.key} no page`);
  }
});

test('a save repacks only the memory that changed and restores every byte', async () => {
  const a = engine(GS2_PROFILE), b = engine(GS2_PROFILE), g = a.machine, blocks = ['ewram', 'iwram', 'io', 'pal', 'vram', 'oam', 'sram'];
  for (let k = 0; k < 9000; k++) g.ewram[k * 29 % g.ewram.length] = k; g.vram.fill(7, 0x4000, 0x4800); g.iwram[0x123] = 9; g.oam[5] = 3;
  for (let k = 0, x = 0x9E3779B9; k < 0x2000; k++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; g.vram[0x8000 + k] = x >>> 11; } // a segment that does not pack
  const same = async save => { await b.restore(save); for (const k of blocks) assert.ok(g[k].every((v, i) => v === b.machine[k][i]), k); };
  const first = a.save(); await same(first);
  assert.ok(first.state.machine.blocks.vram.parts.some(part => part[0] === 'r'), 'stored raw where packing does not help');
  g.ewram[0x2345] ^= 0xFF; g.vram[0x17FFF] = 1;
  const second = a.save(), changed = k => second.state.machine.blocks[k].parts.filter((part, i) => part !== first.state.machine.blocks[k].parts[i]).length;
  assert.deepEqual(blocks.map(changed), [1, 0, 0, 0, 1, 0, 0]); await same(second);
  // Saves from before segments (one packed or raw image per block) still load.
  const earlier = structuredClone(second);
  for (const k of blocks) { const z = pack(g[k]); earlier.state.machine.blocks[k] = z ? {z: toBase64(z), n: g[k].length} : {raw: toBase64(g[k])}; }
  b.machine.ewram.fill(0); await same(earlier);
  // A save with a missing or wrong-sized segment is refused.
  const short = structuredClone(second); short.state.machine.blocks.ewram.parts.pop(); await assert.rejects(b.restore(short), /memory image/);
  const wrong = structuredClone(second); wrong.state.machine.blocks.oam.parts[0] = 'r' + toBase64(new Uint8Array(8)); await assert.rejects(b.restore(wrong), /memory image/);
});

test('the court record owns input while it is open, and takes taps beside its small arrows', () => {
  const e = engine(GS3_PROFILE); setProcess(e, 3); assert.equal(e.nativeScreen(), false);
  setProcess(e, 7); assert.equal(e.nativeScreen(), true, 'opened from a page of dialogue, the page stays pending underneath');
  const cases = [[4, 52, KEY.LEFT], [24, 30, KEY.LEFT], [236, 60, KEY.RIGHT], [214, 84, KEY.RIGHT], [120, 56, 0], [24, 100, 0], [40, 56, 0]];
  for (const [x, y] of cases) { e.keys = 0; e.touch(x, y); assert.equal(e.keys, 0, `no arrows drawn: ${x},${y}`); }
  sprite(e, 0, 0, 48, 0x10); sprite(e, 1, 224, 48, 0x11); // ◀ ▶ as the games draw them: 16x16 at the panel's edges
  for (const [x, y, key] of cases) { e.keys = 0; e.touch(x, y); assert.equal(e.keys, key, `${x},${y}`); }
  // A prompt wins over an arrow strip, with a little slack above and below its label.
  sprite(e, GS3_PROFILE.oam.recordB[0], 200, 80, 0x20); e.keys = 0; e.touch(214, 76); assert.equal(e.keys, KEY.B);
});

test('a yes/no prompt is answered on its plates, not by a stray tap', () => {
  const e = engine(GS1_PROFILE), g = e.machine, P = GS1_PROFILE, selected = P.main + P.m.selected;
  setProcess(e, 10, 3); g.write16(P.script + P.s.flags, 8);
  // No plates drawn (a prompt of another shape): the half of the screen tapped answers.
  g.write8(selected, 9); e.touch(60, 40); assert.deepEqual([g.read8(selected), e.keys], [0, KEY.A]); e.keys = 0;
  e.touch(200, 40); assert.deepEqual([g.read8(selected), e.keys], [1, KEY.A]); e.keys = 0;
  // The games' save prompt: two 64x32 plates side by side.
  const big = (i, x, y) => { const a = 0x07000000 + i * 8; g.write16(a, y | 1 << 14); g.write16(a + 2, x | 3 << 14); g.write16(a + 4, 0x40); };
  big(P.oam.plates + 2, 48, 96); big(P.oam.plates + 3, 128, 96); g.write8(selected, 9);
  for (const [x, y] of [[120, 110], [60, 40], [200, 80], [20, 110]]) { e.touch(x, y); assert.deepEqual([g.read8(selected), e.keys], [9, 0], `stray tap ${x},${y}`); }
  e.touch(150, 110); assert.deepEqual([g.read8(selected), e.keys], [1, KEY.A]); e.keys = 0;
  e.touch(80, 100); assert.deepEqual([g.read8(selected), e.keys], [0, KEY.A]);
});

test('a tap that comes through the text box area only acts on a control drawn there', () => {
  const e = engine(GS2_PROFILE), g = e.machine, P = GS2_PROFILE;
  setProcess(e, 6); g.write16(P.script + P.s.flags, 8); // a cross-examination statement
  sprite(e, P.oam.arrows[0], 0, 128, 0x10); sprite(e, P.oam.arrows[1], 224, 128, 0x11); // its arrows, at the ends of the box
  e.touch(120, 132, true); assert.equal(e.keys, 0, 'the words are for reading');
  e.touch(232, 134, true); assert.equal(e.keys, KEY.RIGHT); e.keys = 0;
  e.touch(6, 130, true); assert.equal(e.keys, KEY.LEFT); e.keys = 0;
  e.touch(120, 60); assert.equal(e.keys, KEY.A, 'a tap on the picture moves on'); e.keys = 0;
  // Investigation menu, a lock, plain dialogue: nothing in the box area continues the game.
  for (const [process, state] of [[4, 1], [4, 10], [3, 1]]) { setProcess(e, process, state); g.write16(P.script + P.s.flags, 0); e.touch(120, 140, true); assert.equal(e.keys, 0, `process ${process} state ${state}`); }
});
