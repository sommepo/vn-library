// Actual imported game; timing and media completion simulated explicitly.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';
const [root,out,limit='200']=process.argv.slice(2);await fs.mkdir(out,{recursive:true});
const content=JSON.parse(await fs.readFile(path.join(root,'content.json'))),program=JSON.parse(await fs.readFile(path.join(root,'program.json')));
const create=()=>HigurashiEngine.create(content,{loadJSON:async()=>program});
const e=await create();await e.run();let texts=0,choices=0,restores=0,ruby=0;const media=new Set();
for(let n=0;n<200000&&texts<+limit;n++){
 const p=e.current;
 for(const l of e.state.scene.layers)assert.ok(content.assets[l.asset]);
 if(p.voice)media.add(p.voice);if(e.state.scene.music)media.add(e.state.scene.music.asset);
 if(p.kind==='text'){
  texts++;if(p.text.some?.(r=>r.ruby))ruby++;
  if(texts===100)await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));
  if(texts%25===0){const saved=e.save(),b=await create();b.applyProgress(e.progressSnapshot());await b.restore(saved);assert.deepEqual(b.current,p);await b.advance();await e.advance();assert.deepEqual({...b.current,occurrenceId:null},{...e.current,occurrenceId:null});restores++;continue;}
 }
 if(p.kind==='choice'){choices++;await fs.writeFile(path.join(out,'choice.json'),JSON.stringify(e.save()));await e.advance(p.options[0].id);}
 else if(p.kind==='end')break;else await e.advance();
}
const report={texts,choices,restores,ruby,media:media.size,end:e.current.kind,simulation:'Timing and media completion simulated'};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(report);assert.ok(texts>=100);
