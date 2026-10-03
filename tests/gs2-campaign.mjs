// Headless Gyakuten Saiban 2 campaign over a private import. Timing/graphics are
// not executed. Cross-examination uses the game's own present table as the
// player's knowledge; wrong answers, presses and choices are still executed.
// Usage: node tests/gs2-campaign.mjs private/gs2/import-vN [runs] [report.json]
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {GS2Engine} from '../web/adapters/gs2-engine.mjs';
const [dir, runsArg = '1', reportPath] = process.argv.slice(2);
if (!dir) throw Error('Usage: node tests/gs2-campaign.mjs <import-dir> [runs] [report.json]');
const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json'), 'utf8'));
const loadJSON = async url => JSON.parse(await fs.readFile(path.join(dir, url), 'utf8'));
const runs = Number(runsArg), report = {runs: [], totals: {pages: 0, choices: 0, presses: 0, wrongPresents: 0, saves: 0}};
let id = 0;
for (let run = 0; run < runs; run++) {
  const engine = await GS2Engine.create(content, {loadJSON, makeId: () => `o${id++}`});
  const seen = new Map(), pressed = new Set(), stats = {pages: 0, choices: 0, presses: 0, wrongPresents: 0, segments: new Set(), sections: new Set(), end: null, stop: null, hpMin: 80};
  let result = await engine.startNew(null), steps = 0; const trace = [];
  const rand = (() => { let x = 0x9e3779b9 ^ run * 7919; return n => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % n; }; })();
  try {
    while (steps++ < 200000) {
      const p = result.pending, s = engine.state;
      stats.segments.add(s.scenario); stats.sections.add(`${s.script}:${s.section}`); stats.hpMin = Math.min(stats.hpMin, s.hp);
      if (!p) throw Error('No pending presentation');
      if (process.env.GS2_TRACE) { trace.push(`${p.kind} ${s.process} ${s.scenario}§${s.section.toString(16)} hp${s.hp} ${p.kind === 'text' ? p.text.replace(/\n/g, '⏎').slice(0, 30) : p.options.map(o => o.text).join('|')}`); if (trace.length > Number(process.env.GS2_TRACE_LINES || 80)) trace.shift(); }
      if (p.kind === 'end') { stats.end = p.reason; break; }
      if (steps % 97 === 0) { // save/restore round trip at arbitrary boundaries
        const save = JSON.parse(JSON.stringify(engine.save()));
        const other = await GS2Engine.create(content, {loadJSON, makeId: () => `o${id++}`}); await other.restore(save);
        assert.deepEqual(other.state, engine.state); report.totals.saves++;
      }
      if (p.kind === 'text') { assert.ok(p.text.length && typeof p.speaker === 'string'); stats.pages++; result = await engine.advance(); continue; }
      assert.equal(p.kind, 'choice');
      const key = p.source.native ? `${p.source.native}:${s.scenario}:${s.section}` : p.id, visits = seen.get(key) || 0; seen.set(key, visits + 1);
      let pick;
      if (p.source.native === 'questioning') {
        const answer = engine.case.courtPresent[s.scenario].find(r => r.statement === s.section && (r.flag === null || engine.flag(0, r.flag)) && [...s.record.evidence, ...s.record.profiles].includes(r.item));
        const pressKey = `${s.scenario}:${s.section}`;
        if (answer && (visits > 1 || rand(3) === 0)) pick = 'present';
        else if (p.options.some(o => o.id === 'press') && (!pressed.has(pressKey) || rand(3) === 0)) { pressed.add(pressKey); pick = 'press'; stats.presses++; }
        else pick = rand(8) === 0 && p.options.some(o => o.id === 'back') ? 'back' : 'next';
        engine.intent = answer;
      } else if (p.source.native === 'court-record') {
        const answer = engine.case.courtPresent[s.scenario].find(r => r.statement === s.section && (r.flag === null || engine.flag(0, r.flag)) && p.options.some(o => o.id === String(r.item)));
        if (answer && (visits > 1 || rand(4) !== 0)) pick = String(answer.item);
        else { const wrong = p.options.filter(o => o.id !== 'cancel' && o.id !== String(answer?.item)); pick = wrong.length ? wrong[rand(wrong.length)].id : p.options[0].id; stats.wrongPresents++; }
      } else { pick = p.options[(visits + rand(2)) % p.options.length].id; stats.choices++; }
      result = await engine.advance(pick);
    }
    if (!stats.end) throw Error('Step budget exhausted');
  } catch (error) { stats.stop = error.message; }
  if (process.env.GS2_TRACE && (stats.stop || !stats.end)) console.log(trace.join('\n'));
  const summary = {...stats, segments: [...stats.segments], sections: stats.sections.size, warnings: engine.state.warnings};
  report.runs.push(summary);
  for (const k of ['pages', 'choices', 'presses', 'wrongPresents']) report.totals[k] += stats[k];
  console.log(`run ${run}: end=${stats.end} stop=${stats.stop} pages=${stats.pages} choices=${stats.choices} presses=${stats.presses} wrong=${stats.wrongPresents} hpMin=${stats.hpMin} sections=${summary.sections}`);
}
report.ends = report.runs.reduce((a, r) => (a[r.end || 'stopped'] = (a[r.end || 'stopped'] || 0) + 1, a), {});
if (reportPath) await fs.writeFile(reportPath, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ends: report.ends, totals: report.totals}));
if (report.runs.some(r => r.stop)) process.exitCode = 1;
