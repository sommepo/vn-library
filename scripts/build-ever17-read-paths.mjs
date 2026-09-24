// Replay private recipes against the actual source; publish no recipe or text.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';
const [importArg,planArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: build-ever17-read-paths.mjs IMPORT PRIVATE_PLAN NEW_OUTPUT');
const dir=path.resolve(importArg),plan=JSON.parse(await fs.readFile(planArg)),out=path.resolve(outArg);
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},paths={};
const options={loadJSON:async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)))};
let progress,signature;
for(const route of plan.routes){
 const id=route.routeId||route.id,recipe=JSON.parse(await fs.readFile(route.recipe)),ids=new Set();
 const e=await Ever17Engine.create(content,options);signature=e.signature;
 assert.ok(e.routeProgress().some(r=>r.id===id),'Unknown main route');assert.ok(!paths[id],'Repeated route');
 await e.startNew(progress);let choice=0;
 for(let step=0;step<150000&&e.current.kind!=='end';step++){
  const p=e.current;if(p.kind==='text')ids.add(p.id);
  if(p.kind==='choice'){
   const expected=recipe.choices[choice++];assert.equal(p.id,expected?.source,'Source recipe diverged');
   await e.advance(expected.selected);
  }else await e.advance();
 }
 assert.equal(e.current.kind,'end');assert.equal(e.current.id,recipe.ending);
 assert.equal(choice,recipe.choices.length);assert.equal(e.routeProgress().find(r=>r.id===id)?.complete,true);
 assert.ok(e.routeProgress().every(r=>!r.manual),'Manual unlocks are not earned replay evidence');
 paths[id]={ids:[...ids],ending:e.current.id,choices:choice};progress=e.progressSnapshot();
 console.log(`${id}: ${ids.size} source segments`);
}
assert.equal(Object.keys(paths).length,5,'Supply all five routes in earned prerequisite order');
const result=JSON.stringify({format:'vnkit.read-paths',version:1,gameId:content.id,gameSignature:signature,paths},null,2)+'\n';
await fs.mkdir(path.dirname(out),{recursive:true});
try{assert.equal(await fs.readFile(out,'utf8'),result,'Refusing to overwrite different read paths');}
catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(out,result,{flag:'wx'});}
