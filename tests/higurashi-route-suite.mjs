// Real-source reader execution, with simulated waits/movie completion.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';
const [root,campaign,out]=process.argv.slice(2);await fs.mkdir(out,{recursive:true});
const c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),p=JSON.parse(await fs.readFile(path.join(root,'program.json'))),r=JSON.parse(await fs.readFile(path.join(campaign,'report.json')));
const e=await HigurashiEngine.create(c,{loadJSON:async()=>p});const fresh=structuredClone(e.state);const results=[];let restores=0;const checkpoints=new Set();
for(const [title,item]of Object.entries(r.endings)){
 const recipe=JSON.parse(await fs.readFile(path.join(campaign,item.recipe)));e.state=structuredClone(fresh);e.state.system=recipe.priorSystem;await e.run();let i=0,texts=0,tips=0;
 for(let n=0;n<100000;n++){
  const b=e.current;
  if(b.kind==='text')texts++;
  if(b.kind==='end'){assert.equal(e.state.title,title);assert.equal(i,recipe.recipe.length);results.push({title,texts,tips,choices:i});console.log('PASS',title,texts);break;}
  if(b.kind==='choice'){
   if(b.auxiliary){tips++;await e.advance('continue');continue;}
   if(e.state.boundary.kind==='fake-choice'){await e.advance(b.options[0].id);continue;}
   const pick=recipe.recipe[i++];assert.equal(pick.offset,b.source.offset);const save=e.save();await e.restore(JSON.parse(JSON.stringify(save)));assert.deepEqual(e.current,b);restores++;
   if(!checkpoints.has('choice')){checkpoints.add('choice');await fs.writeFile(path.join(out,'choice.json'),JSON.stringify(save));}
   await e.advance(String(pick.value));const after=e.save();await e.restore(JSON.parse(JSON.stringify(after)));restores++;
  }else {if(b.kind==='movie'&&!checkpoints.has('movie')){checkpoints.add('movie');await fs.writeFile(path.join(out,'movie.json'),JSON.stringify(e.save()));}await e.advance();}
  if(n===99999)throw Error('Route budget');
 }
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({results,restores,simulation:'Media/waits completed immediately'},null,2));
