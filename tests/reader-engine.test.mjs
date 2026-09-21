import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Engine, validateContent, plainText, characterCount } from '../web/engine.mjs';
import { Activity, validateActivity } from '../web/statistics.mjs';
const content = JSON.parse(readFileSync(new URL('../fixtures/synthetic/content.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
let sequence = 0;
const create = value => new Engine(value || content, { makeId: () => `occurrence-${++sequence}` });
function reachChoice(engine) { engine.run(); while (engine.current.kind !== 'choice') engine.advance(); return engine.current; }
function traverse(engine, route = 'forest') {
  const text = [], choices = [], effects = [];
  let result = engine.run();
  for (let n = 0; n < 1000; n++) {
    effects.push(...result.effects);
    const p = result.pending;
    if (p.kind === 'end') return { text, choices, effects };
    if (p.kind === 'text') text.push({ id: p.id, text: plainText(p.text), vars: clone(engine.state.vars), scene: clone(engine.state.scene) });
    if (p.kind === 'choice') { choices.push(p.id); result = engine.advance(p.id === 'route-choice' ? route : 'finish'); }
    else result = engine.advance();
  }
  throw new Error('Fixture did not terminate');
}
test('entire original fixture validates; every media reference exists', () => {
  assert.deepEqual(validateContent(content), []);
  for (const asset of Object.values(content.assets)) assert.ok(existsSync(new URL(`../fixtures/synthetic/${asset.url}`, import.meta.url)));
  assert.equal(content.synthetic, true);
});
test('both branches execute over 100 segments, shared calls return, media changes and conditions differ', () => {
  const forest = create(), shore = create();
  const a = traverse(forest), b = traverse(shore, 'shore');
  assert.ok(a.text.length > 120); assert.ok(b.text.length > 120);
  assert.deepEqual(a.choices, ['route-choice', 'finish-choice']);
  assert.equal(forest.state.vars.route, 1); assert.equal(shore.state.vars.route, 2);
  assert.equal(forest.state.vars.pages, 115); assert.deepEqual(forest.state.stack, []);
  assert.ok(a.text.some(p => p.id === 'forest-result')); assert.ok(!a.text.some(p => p.id === 'shore-result'));
  assert.ok(b.text.some(p => p.id === 'shore-result')); assert.ok(!b.text.some(p => p.id === 'forest-result'));
  assert.equal(a.text.find(p => p.id === 'page-060').scene.background, 'night');
  assert.deepEqual(a.text.find(p => p.id === 'page-060').scene.sprites, {});
  assert.equal(forest.state.scene.music, null);
  assert.ok(a.effects.some(e => e.op === 'sound'));
});
test('save immediately before choice preserves both available routes and full later state', () => {
  const initial = create(); reachChoice(initial); const before = initial.save({ music: { asset: 'music', time: 2.25 } });
  for (const route of ['forest', 'shore']) {
    const a = create(), b = create(); a.restore(before); b.restore(clone(before));
    a.advance(route); b.advance(route);
    assert.deepEqual(traverse(a, route), traverse(b, route));
    assert.deepEqual(a.state.vars, b.state.vars); assert.deepEqual(a.state.scene, b.state.scene);
  }
  assert.equal(before.media.music.time, 2.25);
});
test('save after choice and inside a shared subroutine restores call stack and subsequent story', () => {
  const original = create(); reachChoice(original); original.advance('shore'); original.advance();
  assert.equal(original.current.id, 'memory'); assert.equal(original.state.stack.length, 1);
  const save = original.save({ voice: { asset: 'voice-test', time: .4, paused: false } });
  const restored = create(); restored.restore(save);
  assert.equal(restored.current.occurrenceId, original.current.occurrenceId);
  assert.deepEqual(restored.state, original.state);
  assert.deepEqual(traverse(restored, 'shore'), traverse(original, 'shore'));
});
test('fail closed on unknown instructions, conditions, unresolved targets/media and unsafe assets', () => {
  for (const change of [
    c => c.instructions.push({ id: 'unreachable-unknown', op: 'custom-flow', source: { file: 'test', offset: 22 } }),
    c => c.instructions.find(i => i.op === 'jump').target = 'missing',
    c => c.instructions.find(i => i.op === 'if').condition.operator = 'mystery',
    c => c.instructions.find(i => i.op === 'background').asset = 'missing',
    c => c.assets.dawn.url = '../private/secret',
    c => c.assets.dawn.url = 'https://example.invalid/asset',
    c => c.instructions.find(i => i.op === 'text').text = [{ reading: 'bad' }],
  ]) { const broken = clone(content); change(broken); assert.throws(() => create(broken)); }
  const looping = { format: 'vnkit.content', version: 1, id: 'loop', entry: 'a', assets: {}, instructions: [{ id: 'a', op: 'jump', target: 'a' }] };
  assert.throws(() => create(looping).run(), /Execution limit/);
  looping.instructions[0] = { id: 'a', op: 'return' };
  assert.throws(() => create(looping).run(), /empty call stack/);
});
test('save import rejects wrong game/revision, corrupt pc/call stack, modified text and unavailable media', () => {
  const engine = create(); engine.run(); const saved = engine.save();
  for (const modify of [s => s.gameId = 'wrong', s => s.gameSignature = 'wrong', s => s.version = 2, s => s.state.pc = -1, s => s.state.pc++, s => s.state.stack.push(99999), s => s.state.pending.text = '改変', s => s.state.scene.background = 'absent', s => s.state.scene.sprites.guide.x = 'bad']) {
    const bad = clone(saved); modify(bad); assert.throws(() => create().restore(bad));
  }
  reachChoice(engine); const choice = engine.save(); choice.state.pending.options[0].text = 'invented'; assert.throws(() => create().restore(choice), /invalid choices/);
});
test('Japanese ruby output and counting preserve spelling and omit duplicate readings', () => {
  const text = ['「', { base: '日本語', reading: 'にほんご' }, '」、\n　読む。'];
  assert.equal(plainText(text), '「日本語」、\n　読む。');
  assert.equal(plainText(text, 'reading'), '「にほんご」、\n　読む。');
  assert.equal(plainText(text, 'both'), '「日本語（にほんご）」、\n　読む。');
  assert.equal(characterCount(text), 9); // Punctuation included, all whitespace excluded.
  assert.equal(characterCount('𠮷😀'), 2);
});
function newActivity() { let time = Date.UTC(2026, 8, 7, 12); return { activity: new Activity('test', null, { now: () => time, makeId: () => `session-${++sequence}` }), elapse: ms => { time += ms; } }; }
const pending = (id, occurrenceId, text = '同じ言葉。') => ({ kind: 'text', id, occurrenceId, speaker: '', text, voice: null });
test('statistics use source identity and occurrence identity, preserve legitimate repeats, and ignore skip/restoration', () => {
  const { activity } = newActivity();
  activity.present(pending('a', '1')); activity.present(pending('b', '2')); activity.present(pending('a', '3'));
  assert.equal(activity.totals().characters, 15); assert.equal(activity.totals().uniqueCharacters, 10); assert.equal(activity.totals().rereadCharacters, 5);
  assert.equal(activity.present(pending('a', '3')), null);
  activity.present(pending('a', '4'), { skip: true }); assert.equal(activity.totals().characters, 15); assert.equal(activity.totals().skippedSegments, 1);
  const backup = clone(activity.data), restored = new Activity('test', backup);
  assert.equal(restored.present(pending('a', '3')), null); assert.equal(restored.totals().characters, 15);
  activity.present({ ...pending('choice', 'c', '森の道\n海の道'), kind: 'choice' });
  assert.equal(activity.totals().characters, 15); activity.choice('森の道'); assert.equal(activity.totals().choiceCharacters, 3);
  assert.equal(activity.data.backlog.length, 5);
});
test('timer handles manual pause, hidden tabs, panels, inactivity and long suspended heartbeat gaps', () => {
  const { activity, elapse } = newActivity();
  elapse(1000); assert.equal(activity.tick(), true);
  activity.paused = true; elapse(1000); activity.tick();
  activity.paused = false; elapse(1000); activity.tick({ visible: false });
  elapse(1000); activity.tick({ reading: false });
  assert.equal(activity.totals().activeMs, 1000);
  elapse(300001); assert.equal(activity.tick(), false);
  activity.interact(); elapse(1000); activity.tick(); assert.equal(activity.totals().activeMs, 2000);
  elapse(120000); activity.tick(); assert.equal(activity.totals().activeMs, 7000);
});
test('clearing the current session removes only its daily contributions, including across the 04:01 reading-day boundary', () => {
  let time=new Date(2026,8,7,23,59,57).getTime();
  const options={now:()=>time,makeId:()=>`reset-test-${++sequence}`};
  const previous=new Activity('test',null,options);previous.present(pending('old','old-occ'));time+=1000;previous.tick();
  time=new Date(2026,8,8,4,0,58).getTime();
  const days=clone(previous.data.days);
  const activity=new Activity('test',clone(previous.data),options),id=activity.session.id;
  const earlier=clone(activity.data.sessions[0]);
  activity.present(pending('new','new-occ'));activity.choice('はい');time+=1000;activity.tick();
  time+=2000;activity.tick();activity.present(pending('new','repeat-occ'));activity.present(pending('skipped','skip-occ'),{skip:true});activity.skipUnpresented(12);
  assert.equal(Object.keys(activity.sessionDays).length,2);assert.ok(activity.session.characters>0);assert.ok(activity.session.rereadCharacters>0);
  const encountered=clone({seen:activity.data.seen,occurrences:activity.data.occurrences,backlog:activity.data.backlog});
  activity.paused=true;activity.resetSession();
  for(const key of ['activeMs','characters','uniqueCharacters','rereadCharacters','segments','skippedSegments','choiceCharacters']){
    assert.equal(activity.session[key],0);assert.equal(activity.totals()[key],earlier[key]);
    assert.equal(Object.values(activity.data.days).reduce((n,d)=>n+d[key],0),Object.values(days).reduce((n,d)=>n+d[key],0));
  }
  assert.deepEqual(activity.data.sessions[0],earlier);assert.equal(activity.session.id,id);assert.equal(activity.paused,true);assert.equal(Date.parse(activity.session.startedAt),time);
  assert.deepEqual({seen:activity.data.seen,occurrences:activity.data.occurrences,backlog:activity.data.backlog},encountered);
  assert.equal(activity.present(pending('new','repeat-occ')),null);assert.equal(validateActivity(activity.data,'test'),true);
  time+=1000;activity.tick();assert.equal(activity.session.activeMs,0);activity.paused=false;time+=1000;activity.tick();assert.equal(activity.session.activeMs,1000);
  activity.present(pending('new','legitimate-reread'));assert.equal(activity.session.rereadCharacters,5);assert.equal(activity.session.uniqueCharacters,0);
  activity.resetSession();activity.resetSession();assert.equal(activity.totals().characters,earlier.characters);assert.equal(activity.totals().activeMs,earlier.activeMs);
  const restored=new Activity('test',clone(activity.data),options);assert.equal(restored.present(pending('new','legitimate-reread')),null);assert.equal(restored.totals().characters,earlier.characters);
});
test('activity export roundtrip validates nested fields and rejects malformed backups', () => {
  const { activity } = newActivity(); activity.present(pending('a', '1'));
  assert.equal(validateActivity(clone(activity.data), 'test'), true);
  assert.match(activity.exportCSV(), /uniqueCharacters,rereadCharacters/);
  for (const change of [d => d.gameId = 'wrong', d => d.sessions[0].characters = -1, d => d.sessions[0].activeMs = 'bad', d => d.backlog[0].text = [{ reading: 'bad' }], d => d.days = [], d => d.occurrences['1'].at = 'bad']) {
    const bad = clone(activity.data); change(bad); assert.equal(validateActivity(bad, 'test'), false); assert.throws(() => new Activity('test', bad));
  }
});
test('large original in-memory script keeps execution saves bounded and text IDs distinct', () => {
  const large = { format: 'vnkit.content', version: 1, id: 'large-original-test', entry: 'p0', assets: {}, instructions: [] };
  for (let n = 0; n < 30000; n++) large.instructions.push({ id: `p${n}`, op: 'text', text: 'これは規模を確認するための、オリジナルの試験文です。' });
  large.instructions.push({ id: 'end', op: 'end' });
  const engine = create(large); engine.run();
  for (let n = 0; n < 30000; n++) { assert.equal(engine.current.id, `p${n}`); engine.advance(); }
  assert.equal(engine.current.kind, 'end');
  assert.ok(JSON.stringify(engine.save()).length < 2000, 'Saves must not embed the script or accumulated story history');
  const { activity } = newActivity();
  activity.present(pending('__proto__', 'one')); activity.present(pending('__proto__', 'two')); activity.present(pending('constructor', 'three'));
  assert.equal(activity.totals().uniqueCharacters, 10);
  assert.equal(activity.totals().rereadCharacters, 5);
});
