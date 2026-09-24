// Private, sequential source replay. This does not run audio/video or prove all routes.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const [input, destination, count = '50'] = process.argv.slice(2);
const runs = Number(count);
if (!input || !destination || !Number.isInteger(runs) || runs < 1 || runs > 1000) {
  throw new Error('Usage: node tests/never7-campaign.mjs IMPORT NEW_OUTPUT [RUNS: 1..1000]');
}
const root = path.resolve(import.meta.dirname, '..');
const out = path.resolve(destination);
// A separate folder preserves previous evidence and its exact build/policy.
await fs.mkdir(out, {recursive: false});
const summary = {
  runs: 0, textPresentations: 0, choicePresentations: 0,
  restores: 0, branchComparisons: 0, endings: [], scripts: [], errors: [],
  policy: 'Seeded choices advance RNG only at choices; progress earned by preceding source run',
  timing: 'Simulated waits/movie completion; audio not played',
};
let progress;
for (let i = 0; i < runs; i++) {
  const run = path.join(out, `run-${i}`);
  const args = [path.join(root, 'tests/never7-real-smoke.mjs'), path.resolve(input), run, '24000', String(i)];
  if (progress) args.push(progress);
  const status = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {cwd: root, stdio: ['ignore', 'ignore', 'inherit']});
    child.once('error', reject);
    child.once('exit', code => resolve(code));
  });
  const result = JSON.parse(await fs.readFile(path.join(run, 'report.json')));
  summary.runs++;
  summary.textPresentations += result.segments;
  summary.choicePresentations += result.choices;
  summary.restores += result.restores;
  summary.branchComparisons += result.branchComparisons;
  summary.endings = [...new Set([...summary.endings, result.ending].filter(Boolean))].sort();
  summary.scripts = [...new Set([...summary.scripts, ...result.scripts])].sort();
  summary.errors.push(...result.errors.map(error => ({run: i, error})));
  await fs.writeFile(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
  if (status !== 0) { process.exitCode = 1; break; }
  progress = path.join(run, 'progress.json');
  if ((i + 1) % 10 === 0) console.log(`Completed ${i + 1}/${runs} runs`);
}
console.log(JSON.stringify({...summary, scripts: summary.scripts.length}, null, 2));
