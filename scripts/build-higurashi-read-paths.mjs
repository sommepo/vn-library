// Re-execute the earned sequential campaign. No manual or prefilled global flags.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {HigurashiCore} from '../web/adapters/higurashi-core.mjs';import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';import {ROUTES} from '../web/adapters/higurashi-progress.mjs';
const [root,recipePath,out]=process.argv.slice(2),c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),p=JSON.parse(await fs.readFile(path.join(root,'program.json'))),runs=JSON.parse(await fs.readFile(recipePath)),e=await HigurashiEngine.create(c,{loadJSON:async()=>p}),v=e.vm,fresh=structuredClone(v.state),paths={};let progress={};
for(const run of runs){v.state=structuredClone(fresh);v.state.system=structuredClone(progress);let at=0,ended=false;const ids=new Set();
 for(let step=0;step<2000000;step++){
  const b=v.step();if(b?.kind==='text')ids.add(`main.snr:${b.offset.toString(16).padStart(8,'0')}:${b.part}`);
  if(b?.kind==='choice'){const pick=run.recipe[at++];assert.equal(b.offset,pick?.offset);v.choose(pick.value);}
  if(b?.kind==='end'){assert.equal(v.state.title,run.ending);assert.equal(at,run.recipe.length);assert.deepEqual(v.state.system,run.system);ended=true;break;}
 }
 assert.ok(ended);progress=structuredClone(v.state.system);
 const route=ROUTES.find(r=>run.ending===r[1]+' 終劇');if(route&&!paths[route[0]]){paths[route[0]]={ids:[...ids],campaignRun:run.run,ending:run.ending};console.log(route[0],ids.size);}
 if(Object.keys(paths).length===ROUTES.length)break;
}
assert.equal(Object.keys(paths).length,10);await fs.writeFile(out,JSON.stringify({format:'vnkit.read-paths',version:1,gameId:c.id,gameSignature:e.signature,paths}),{flag:'wx'});
