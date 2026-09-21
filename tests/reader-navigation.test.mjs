import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../web/engine.mjs';
import { Activity, validateActivity } from '../web/statistics.mjs';
import { seekNextChoice, NavigationCancelled, retainLoops } from '../web/navigation.mjs';
const content = JSON.parse(readFileSync(new URL('../fixtures/synthetic/content.json', import.meta.url)));
const create = () => { let n = 0; const e = new Engine(content, { makeId: () => String(++n) }); e.run(); return e; };
const immediate = { yieldControl: async () => {} };
test('next choice follows both real fixture branches, calls, variables and media identically to ordinary execution', async () => {
  for (const option of ['forest', 'shore']) {
    const normal = create(), fast = create();
    while (normal.current.kind !== 'choice') normal.advance();
    const first = await seekNextChoice(fast, immediate);
    assert.deepEqual(fast.state, normal.state); assert.equal(first.pending.id, 'route-choice');
    normal.advance(option); fast.advance(option);
    let skipped = -1;
    while (normal.current.kind !== 'choice') { if (normal.current.kind === 'text') skipped++; normal.advance(); }
    const next = await seekNextChoice(fast, immediate);
    assert.equal(next.skippedSegments, skipped); assert.deepEqual(fast.state, normal.state);
    assert.equal(next.pending.id, 'finish-choice');
    const saved = fast.save(); const restored = create(); restored.restore(saved);
    assert.deepEqual(restored.state, normal.state);
  }
});
test('existing choices and movie/setup/end boundaries never advance automatically', async () => {
  for (const kind of ['choice', 'movie', 'sound', 'setup', 'end']) {
    const engine = { current: { kind, id: 'boundary' }, advance() { throw new Error('Must not advance'); } };
    const r = await seekNextChoice(engine); assert.equal(r.pending.kind, kind); assert.equal(r.steps, 0);
  }
});
test('cancellation yields control; caller can restore the exact initial snapshot', async () => {
  const e = create(), before = e.save(); let cancelled = false;
  await assert.rejects(seekNextChoice(e, { yieldEvery: 1, cancelled: () => cancelled, yieldControl: async () => { cancelled = true; } }), NavigationCancelled);
  e.restore(before); assert.deepEqual(e.state, before.state);
});
test('unknown controls propagate source errors and unbounded routes have a limit', async () => {
  await assert.rejects(seekNextChoice({ current: { kind: 'text' }, advance() { throw new Error('synthetic:42: Unknown control'); } }), /synthetic:42: Unknown control/);
  await assert.rejects(seekNextChoice({ current: { kind: 'new-native-ui', id: 'synthetic:43' } }), /synthetic:43: cannot seek/);
  await assert.rejects(seekNextChoice({ current: { kind: 'text' }, advance() { return { effects: [] }; } }, { ...immediate, maxSteps: 10 }), /within 10/);
});
test('only persistent ambient loops survive; ordered stop/channel replacement is applied', () => {
  const loops = [{ asset: 'old', channel: 'a', loop: true }, { asset: 'other', channel: 'b', loop: true }];
  const result = retainLoops(loops, [
    { op: 'stopSound', channel: 'a' }, { op: 'sound', asset: 'new', channel: 'a', loop: true },
    { op: 'sound', asset: 'one-shot', channel: 'c' }, { op: 'stopSound', asset: 'other' },
  ]);
  assert.deepEqual(result, [{ asset: 'new', channel: 'a', time: 0, paused: false, loop: true }]);
  assert.deepEqual(retainLoops(result, [{ op: 'stopSound', channel: 'effects' }]), []);
});
test('unpresented skipped text gets no reading credit, backlog, occurrence, or seen entry', () => {
  const a = new Activity('fixture'); a.skipUnpresented(130);
  assert.equal(a.totals().skippedSegments, 130); assert.equal(a.totals().characters, 0);
  assert.deepEqual(a.data.backlog, []); assert.deepEqual(a.data.seen, {}); assert.deepEqual(a.data.occurrences, {});
  assert.equal(validateActivity(a.data, 'fixture'), true);
  assert.throws(() => a.skipUnpresented(-1), /Invalid/);
});
