// Global statistics helpers: summaries across games and clearing that keeps reading history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Activity, summarizeActivity, addSummaries, hasStatistics, clearedActivity, validateActivity, readingDay, recentDays } from '../web/statistics.mjs';

function played(gameId, start, pages) {
  let now = start, n = 0;
  const a = new Activity(gameId, null, { now: () => now, makeId: () => `id-${n++}` });
  for (const [ms, text] of pages) { now += ms; a.tick({ inactivityMs: 1e9 }); a.present({ kind: 'text', id: `${gameId}:${text}`, occurrenceId: `o-${n++}`, text, speaker: '' }); }
  return a;
}

test('summaries total sessions, today and last activity; sums across games', () => {
  const at = Date.parse('2026-09-30T12:00:00');
  const a = played('a', at, [[4000, 'あいう'], [4000, 'えお']]), b = played('b', at + 60000, [[3000, 'かきくけこ']]);
  const sa = summarizeActivity(a.data, at + 10000), sb = summarizeActivity(b.data, at + 70000);
  assert.equal(sa.totals.characters, 5); assert.equal(sa.totals.activeMs, 8000); assert.equal(sa.today.characters, 5); assert.equal(sa.sessions, 1);
  const all = addSummaries([sa, sb]);
  assert.equal(all.totals.characters, 10); assert.equal(all.totals.activeMs, 11000); assert.equal(all.sessions, 2);
  assert.equal(all.lastActivityAt, b.session.lastActivityAt);
  assert.equal(summarizeActivity(undefined).totals.characters, 0); assert.equal(hasStatistics(summarizeActivity(undefined)), false);
  assert.equal(readingDay(at), '2026-09-30');
  assert.deepEqual(all.days['2026-09-30'], { characters: 10, activeMs: 11000 });
  const days = recentDays(30, at); assert.equal(days.length, 30); assert.equal(days.at(-1), '2026-09-30'); assert.equal(days[0], '2026-09-01');
  assert.equal(recentDays(2, Date.parse('2026-10-01T03:00:00')).join(), '2026-09-29,2026-09-30', 'before 04:01 belongs to the previous day');
});

test('clearing removes statistics but keeps read markers, occurrences, backlog and bookmarks', () => {
  const a = played('game', Date.parse('2026-09-30T12:00:00'), [[5000, 'テスト'], [5000, 'もう一行']]);
  a.data.bookmarks.push({ id: 'b1', label: 'x', save: { format: 'vnkit.save', gameId: 'game' } });
  const before = structuredClone(a.data), next = clearedActivity(before, 'game');
  assert.ok(validateActivity(next, 'game'));
  assert.deepEqual(next.sessions, []); assert.deepEqual(next.days, {});
  assert.deepEqual(next.seen, a.data.seen); assert.deepEqual(next.occurrences, a.data.occurrences);
  assert.equal(next.backlog.length, 2); assert.equal(next.bookmarks.length, 1);
  assert.equal(hasStatistics(summarizeActivity(next)), false);
  assert.deepEqual(before, a.data, 'the stored input is not modified');
  assert.throws(() => clearedActivity({ format: 'nope' }, 'game'), /malformed/);
});

test('a live reader clears in place and keeps counting afterwards', () => {
  let now = Date.parse('2026-09-30T12:00:00');
  const a = new Activity('g', null, { now: () => now });
  now += 3000; a.tick({ inactivityMs: 1e9 }); a.present({ kind: 'text', id: 'g:1', occurrenceId: 'o1', text: 'あいう', speaker: '' });
  a.clearStats();
  assert.equal(a.totals().characters, 0); assert.equal(a.data.sessions.length, 1); assert.ok(a.data.seen['g:1']);
  now += 2000; a.present({ kind: 'text', id: 'g:2', occurrenceId: 'o2', text: 'かき', speaker: '' });
  assert.equal(a.totals().characters, 2); assert.ok(validateActivity(a.data, 'g'));
});
