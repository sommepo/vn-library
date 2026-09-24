// Private read-path, progress and restore checks; never writes a live save bank.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';
const [root,checkpoint]=process.argv.slice(2),cache={},loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(root,u))),c=await loadJSON('content.json'),e=await HigurashiEngine.create(c,{loadJSON});await e.loadReadPaths();assert.equal(Object.keys(e.readPaths).length,10);
const source=[...e.readPaths.oni][0];assert.equal(e.isInheritedRead(source),false);e.markRouteComplete('oni');assert.equal(e.isInheritedRead(source),true);assert.equal(Object.keys(e.state.read).length,0);assert.equal(e.state.system[21],1);assert.equal(e.state.manual.oni,true);assert.equal(e.newGameEntries().filter(x=>x.id.startsWith('extra:')).length,1);
await e.run();const save=e.save(),bad=structuredClone(save);bad.state.boundary.text=['fabricated'];await assert.rejects(e.restore(bad),/source/);assert.deepEqual(e.current,save.state.presentation);
const choice=JSON.parse(await fs.readFile(checkpoint));await e.restore(choice);const corrupt=e.save();corrupt.state.pending.options[0].value=999;await assert.rejects(e.restore(corrupt),/choice|source/);assert.ok(e.state.manual.oni);assert.ok(e.state.completed['鬼隠し編 終劇']);
const before=e.progressSnapshot();await e.advance(e.current.options[0].id);const after=e.save();await e.restore(after);assert.ok(e.state.manual.oni);
console.log('PASS: ten source-verified read paths, manual flags, earned-extra gate, rejected fabricated text/choice, retained progress through source save restore');
