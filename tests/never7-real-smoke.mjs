// Private source replay; timers are simulated. This is not audiovisual parity.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),limit=Number(process.argv[4]||10000),variant=Number(process.argv[5]||0);
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)));
let occurrence=0,seed=variant+1;const scripts=new Set(),sites=new Set(),makeId=()=>String(++occurrence),report={format:'vnkit.never7-smoke',version:3,timing:'headless, simulated waits/movie completion; audio not played',variant,segments:0,choices:0,choicePath:[],restores:0,branchComparisons:0,ending:null,errors:[]};
const normal=s=>{const n=structuredClone(s);if(n.pending)delete n.pending.occurrenceId;return n;};
const e=await Never7Engine.create(c,{loadJSON,makeId,onInstruction:(i,s)=>{scripts.add(s.script);sites.add(i.id);}});
if(process.argv[6]){e.applyProgress(JSON.parse(await fs.readFile(process.argv[6])));report.progressFrom=process.argv[6];}
try{
 let r=await e.run();for(let n=0;n<100000&&report.segments<limit;n++){
  const p=r.pending;if(p.kind==='end'){report.ending=p.id;break;}
  if(p.kind==='text')report.segments++;
  let restored;
  if(p.kind==='choice'||p.kind==='text'&&report.segments%100===0){
   const saved=e.save();restored=await Never7Engine.create(c,{loadJSON,makeId});await restored.restore(saved);assert.deepEqual(restored.state,e.state);report.restores++;
  }
  if(p.kind==='choice')report.choices++;
  if(p.kind==='choice')seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const choice=p.kind==='choice'?p.options[(variant<2?variant:seed>>>16)%p.options.length].id:undefined;
  if(p.kind==='choice')report.choicePath.push({source:p.id,choice});
  r=await e.advance(choice);
  // Compare continuing the live interpreter with restoring into a fresh one.
  if(restored){await restored.advance(choice);assert.deepEqual(normal(restored.state),normal(e.state));if(p.kind==='choice')report.branchComparisons++;}
 }
}catch(error){report.errors.push(error.stack);process.exitCode=1;}
report.scripts=[...scripts];report.instructionSites=sites.size;report.warnings=e.state.warnings;
await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));
await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(e.progressSnapshot()));
console.log(JSON.stringify({...report,choicePath:report.choicePath.length,warnings:report.warnings.length},null,2));
