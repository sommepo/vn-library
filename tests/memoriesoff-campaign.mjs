// Actual owner-supplied import; timing/media simulated. Private reports only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {MemoriesOffEngine} from '../web/adapters/memoriesoff-engine.mjs';
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),runs=Number(process.argv[4]||100);
await fs.mkdir(out,{recursive:false});
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache=new Map();
const loadJSON=async url=>{if(!cache.has(url))cache.set(url,JSON.parse(await fs.readFile(path.join(dir,url))));return cache.get(url);};
const visited=new Set(),textSites=new Set(),choiceEdges=new Set(),scripts=new Set();
const report={runs:0,text:0,choices:0,restores:0,ends:0,stops:[],earnedFlags:[],scope:'Source execution; media and timing simulated; no exhaustive or original-console claim'};
let progress=null,rng=93758;
const random=n=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return(rng>>>0)%n;};
const options={loadJSON,onInstruction:(i,s)=>{visited.add(i.id);scripts.add(s.script);},makeId:()=> 'campaign-occurrence'};
try{
 for(let run=0;run<runs;run++){
  const e=await MemoriesOffEngine.create(content,{...options,seed:93758+run});let r=await e.startNew(progress),boundaries=0;
  try{
   while(r.pending.kind!=='end'){
    if(++boundaries>30000)throw Error('Presentation budget exceeded');const p=r.pending;
    if(p.kind==='text'){report.text++;textSites.add(p.id);}
    let choice;
    if(p.kind==='choice'){
     choice=String(run===0?0:random(p.options.length));report.choices++;choiceEdges.add(`${p.id}:${choice}`);
     if(run<5||run%50===0){
      const save=e.save(),copy=await MemoriesOffEngine.create(content,options);await copy.restore(save);copy.applyProgress(e.progressSnapshot());
      const next=await copy.advance(choice),actual=await e.advance(choice);
      assert.deepEqual(next,actual);assert.deepEqual(copy.state,e.state);report.restores++;r=actual;continue;
     }
    }
    if(run===0&&p.kind==='text'&&boundaries===150)await fs.writeFile(path.join(out,'browser-checkpoint.json'),JSON.stringify(e.save()));
    r=await e.advance(choice);
   }
   report.ends++;progress=e.progressSnapshot();
   const restored=await MemoriesOffEngine.create(content,options);await restored.restore(e.save());assert.equal(restored.current.kind,'end');report.restores++;
  }catch(error){report.stops.push({run,error:error.message,script:e.state.script,pc:e.state.pc});await fs.writeFile(path.join(out,`stop-${run}.json`),JSON.stringify(e.save()));}
  report.runs++;if((run+1)%25===0)console.log(`Completed ${run+1}/${runs}`);
 }
 report.earnedFlags=progress?.globals.flatMap((v,n)=>v?[n]:[])||[];
}finally{
 Object.assign(report,{instructions:visited.size,textSites:textSites.size,choiceEdges:choiceEdges.size,scripts:[...scripts].sort()});
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
assert.equal(report.stops.length,0);assert.equal(report.ends,runs);
