// Private actual-disc execution. Timers/movie completion are simulated here.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import{Remember11Engine}from'../web/adapters/remember11-engine.mjs';
const dir=path.resolve(process.argv[2]),limit=Number(process.argv[3]||150),out=process.argv[4],variant=Number(process.argv[5]||0);
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},loader=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)));
const report={format:'vnkit.remember11-smoke',version:1,timing:'headless simulated',segments:0,choices:0,movies:0,restores:0,scripts:[],ending:null,errors:[]},scripts=new Set();
let id=0;const options={loadJSON:loader,makeId:()=>String(++id),onInstruction:(_,s)=>scripts.add(s.script)},e=await Remember11Engine.create(content,options);
if(process.env.VNKIT_R11_CHAPTER==='satoru'){e.state.vars.globalBits[84]=1;e.assign(0x602a,1);report.entry='manually unlocked Satoru; not natural gate coverage';}
try{
 let result=await e.run();for(let n=0;n<100000&&report.segments<limit;n++){
  const p=result.pending;if(p.kind==='end'){report.ending=p.id;break;}if(p.kind==='text')report.segments++;if(p.kind==='movie')report.movies++;
  if(p.kind==='choice'||report.segments%100===0){const saved=e.save(),r=await Remember11Engine.create(content,{loadJSON:loader,makeId:()=>String(++id)});await r.restore(saved);assert.deepEqual(r.state,e.state);report.restores++;
   if(p.kind==='choice'){for(const o of p.options){const a=await Remember11Engine.create(content,{loadJSON:loader,makeId:()=> 'compare'}),b=await Remember11Engine.create(content,{loadJSON:loader,makeId:()=> 'compare'});await a.restore(saved);await b.restore(saved);await a.advance(o.id);await b.advance(o.id);assert.deepEqual(a.state,b.state);}if(out){await fs.mkdir(out,{recursive:true});if(report.choices===0)await fs.writeFile(path.join(out,'first-choice.json'),JSON.stringify(saved));}report.choices++;}}
  result=await e.advance(p.kind==='choice'?p.options[variant%p.options.length].id:undefined);
 }
}catch(error){report.errors.push(error.stack);process.exitCode=1;}
report.scripts=[...scripts];report.warnings=e.state.warnings;
if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));}
console.log(JSON.stringify(report,null,2));
