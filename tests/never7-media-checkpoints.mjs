// Derive a real movie checkpoint by executing the normal first-choice path.
import fs from 'node:fs/promises';import path from 'node:path';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),cache={};
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),loadJSON=async p=>cache[p]??=JSON.parse(await fs.readFile(path.join(dir,p)));
const e=await Never7Engine.create(content,{loadJSON});let r=await e.run(),before,segments=0;
for(let step=0;step<40000;step++){
 if(r.pending.kind==='end')break;
 if(r.pending.kind==='movie'){
  await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'movie-before.json'),JSON.stringify(before));await fs.writeFile(path.join(out,'movie-at.json'),JSON.stringify(e.save()));
  await fs.writeFile(path.join(out,'provenance.json'),JSON.stringify({entry:content.runtime.entry,segments,source:r.pending.id,asset:r.pending.asset,policy:'First visible choice; timers simulated'},null,2));
  console.log(`Reached ${r.pending.id} after ${segments} text segments`);process.exit(0);
 }
 if(r.pending.kind==='text')segments++;before=e.save();r=await e.advance(r.pending.options?.[0].id);
}
throw Error('No movie reached on this bounded source path');
