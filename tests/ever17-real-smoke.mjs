// Owner-supplied game only. Timers, voices and movies are completed headlessly.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';

const dir=path.resolve(process.argv[2]),out=process.argv[3],limit=Number(process.argv[4]||20000),variant=Number(process.argv[5]||0);
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={};
const loadJSON=async url=>cache[url]??=JSON.parse(await fs.readFile(path.join(dir,url)));
const report={format:'vnkit.ever17-smoke',version:1,timing:'headless simulated',segments:0,choices:[],movies:0,restores:0,errors:[],ending:null};
const scripts=new Set(),sites=new Set();let id=0;
const e=await Ever17Engine.create(content,{loadJSON,makeId:()=>String(++id),onInstruction:(i,s)=>{scripts.add(s.script);sites.add(i.id);}});
try{
  await e.startNew();
  for(let n=0;n<100000&&report.segments<limit;n++){
    const p=e.current;
    if(p.kind==='end'){report.ending=p.id;break;}
    if(p.kind==='text')report.segments++;
    if(p.kind==='movie')report.movies++;
    if(p.kind==='choice'||p.kind==='text'&&report.segments%500===0){
      const saved=e.save(),r=await Ever17Engine.create(content,{loadJSON});await r.restore(saved);
      assert.deepEqual(r.state,e.state);report.restores++;
      if(out&&p.kind==='choice'&&!report.choices.length){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'first-choice.json'),JSON.stringify(saved));}
    }
    let choice;
    if(p.kind==='choice'){
      choice=p.options[variant%p.options.length].id;
      report.choices.push({source:p.id,options:p.options.map(o=>({id:o.id,text:o.text})),selected:choice});
    }
    await e.advance(choice);
  }
}catch(error){report.errors.push(error.stack);process.exitCode=1;}
Object.assign(report,{scripts:[...scripts],sites:sites.size,warnings:e.state.warnings,progress:e.routeProgress(),globals:e.state.vars.globalBits});
if(out){await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));}
console.log(JSON.stringify({segments:report.segments,choices:report.choices.length,ending:report.ending,restores:report.restores,errors:report.errors,progress:report.progress},null,2));
