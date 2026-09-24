// Private choice recipes are replayed through the real VM, never copied as text.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';
import {routes} from '../web/adapters/never7-progress.mjs';
import {validateReadPaths} from '../web/adapters/never7-read-paths.mjs';

export async function buildReadPaths(content, plan, loadRecipe, options, onRoute = () => {}) {
  if (!Array.isArray(plan.routes) || !plan.routes.length || plan.routes.length > routes.length) throw Error('Expected a nonempty routes plan');
  const progress = {}, paths = {};
  let signature;
  for (const item of plan.routes) {
    if (!routes.some(r => r.id === item.id) || Object.hasOwn(paths, item.id)) throw Error('Unknown or duplicate route');
    if (item.progressFrom && !Object.hasOwn(progress, item.progressFrom)) throw Error('Progress must come from an earlier verified replay');
    const recipe = await loadRecipe(item.recipe);
    if (!Array.isArray(recipe.choices) || typeof recipe.ending !== 'string') throw Error(`Missing source choices or ending for ${item.id}`);
    const engine = await Never7Engine.create(content, options), ids = new Set();
    signature = engine.signature;
    await engine.startNew(progress[item.progressFrom], recipe.entry || 'start');
    const completed = () => engine.routeProgress().find(r => r.id === item.id).complete;
    if (completed()) throw Error(`Route ${item.id} was already complete before this replay`);
    let choice = 0, segments = 0;
    for (let step = 0; step < 120000 && engine.current.kind !== 'end'; step++) {
      const p = engine.current;
      if (p.kind === 'text') { ids.add(p.id); segments++; }
      if (p.kind === 'choice') {
        const wanted = recipe.choices[choice++];
        if (wanted?.source !== p.id || !Number.isInteger(wanted.option) || !p.options[wanted.option]) {
          throw Error(`${item.id}: recorded choice diverged at ${p.id}`);
        }
        await engine.advance(p.options[wanted.option].id);
      } else await engine.advance(); // Headless timing/media completion is simulated.
    }
    if (engine.current.kind !== 'end' || engine.current.id !== recipe.ending ||
        choice !== recipe.choices.length || !completed() || !ids.size) {
      throw Error(`Unverified route ending: ${item.id}`);
    }
    for (const n of recipe.earned || []) if (!engine.state.globals[n]) throw Error(`Missing earned flag ${n}: ${item.id}`);
    for (const n of recipe.absent || []) if (engine.state.globals[n]) throw Error(`Unexpected flag ${n}: ${item.id}`);
    progress[item.id] = engine.progressSnapshot();
    // Only this route receives this path. Prior clears used as prerequisites
    // must not gain unrelated later-route text.
    paths[item.id] = {ids: [...ids], ending: engine.current.id, entry: recipe.entry || 'start',
      choices: choice, segments, progressFrom: item.progressFrom || null};
    onRoute(item.id, paths[item.id]);
  }
  const result = {format: 'vnkit.read-paths', version: 1, gameId: content.id, gameSignature: signature,
    policy: 'One native-entry replay per earned main outcome; simulated timing/media; no study credit', paths};
  validateReadPaths(result, {content, signature});
  return result;
}

async function main() {
  const [input, source, destination] = process.argv.slice(2);
  if (!input || !source || !destination) throw Error('Usage: node scripts/build-never7-read-paths.mjs IMPORT PRIVATE_PLAN OUTPUT');
  const dir = path.resolve(input), base = path.dirname(path.resolve(source)), cache = new Map();
  const content = JSON.parse(await fs.readFile(path.join(dir, 'content.json')));
  const options = {loadJSON: async url => {
    if (!cache.has(url)) cache.set(url, JSON.parse(await fs.readFile(path.join(dir, url))));
    return cache.get(url);
  }};
  const result = await buildReadPaths(content, JSON.parse(await fs.readFile(source)),
    async file => JSON.parse(await fs.readFile(path.resolve(base, file))), options,
    (id, p) => console.log(`${id}: ${p.ids.length} distinct source segments, ${p.choices} choices, ${p.ending}`));
  const serialized = JSON.stringify(result) + '\n', out = path.resolve(destination);
  await fs.mkdir(path.dirname(out), {recursive: true});
  // An existing identical file is resumable; changed output is never clobbered.
  try {
    if (await fs.readFile(out, 'utf8') !== serialized) throw Error('Refusing to overwrite different read paths; choose a new output');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const temporary = await fs.mkdtemp(path.join(path.dirname(out), '.read-paths-'));
    try {
      const file = path.join(temporary, 'read-paths.json');
      await fs.writeFile(file, serialized, {flag: 'wx'});
      await fs.link(file, out); // Atomic install, refusing an existing destination.
    } finally { await fs.rm(temporary, {recursive: true, force: true}); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
