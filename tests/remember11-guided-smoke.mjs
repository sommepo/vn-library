// Optional private choice list; source VM decides every branch and ending.
// No route text or walkthrough is bundled with this harness.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {Remember11Engine} from '../web/adapters/remember11-engine.mjs';
const dir=path.resolve(process.argv[2]),guide=JSON.parse(await fs.readFile(process.argv[3])),out=path.resolve(process.argv[4]);await fs.mkdir(out,{recursive:true});
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},options={loadJSON:async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)))},e=await Remember11Engine.create(c,options);
const normal=s=>s.normalize('NFKC').replace(/[\s「」『』]/g,''),seen=new Set(),scripts=new Set(),choices=[];let pages=0,movies=0,restores=0,error;
try{
 if(guide.resume){
  const previous=JSON.parse(await fs.readFile(path.join(guide.resume,'report.json')));pages=previous.pages;movies=previous.movies;restores=previous.restores;choices.push(...previous.choices);previous.scripts.forEach(s=>scripts.add(s));JSON.parse(await fs.readFile(path.join(guide.resume,'read-ids.json'))).forEach(id=>seen.add(id));await e.restore(JSON.parse(await fs.readFile(path.join(guide.resume,'checkpoint.json'))));
 }else{const progress=guide.progress?JSON.parse(await fs.readFile(guide.progress)):null;await e.startNew(progress,guide.chapter==='satoru'?'satoru':'start');}
 for(let n=0;n<100000;n++){
  scripts.add(e.state.script);const p=e.current;if(p.kind==='end')break;
  if(p.kind==='movie')movies++;
  if(p.kind==='text'){pages++;seen.add(p.id);}
  if(p.kind==='choice'){
   const wanted=guide.choices[choices.length],o=typeof wanted==='object'&&wanted?.id===p.id?p.options.find(o=>o.id===wanted.option):typeof wanted==='string'?p.options.find(o=>normal(o.text)===normal(wanted)):null;
   if(!o)throw Error(`Choice ${choices.length}: expected ${wanted}; source ${p.id}: ${p.options.map(o=>o.text).join(' / ')}`);
   const saved=e.save(),r=await Remember11Engine.create(c,options);await r.restore(saved);assert.deepEqual(r.state,e.state);restores++;
   choices.push({id:p.id,option:o.id});console.log(choices.length,p.id);await e.advance(o.id);
  }else await e.advance();
 }
 assert.equal(e.current.kind,'end','Reached source ending');assert.ok(e.routeProgress().find(r=>r.id===(guide.chapter||'kokoro')).complete,'Source earned chapter clear');
}catch(e){error=e.stack;process.exitCode=1;console.error(error);}
const report={pages,movies,restores,scripts:[...scripts],choices,ending:e.current?.id,progress:e.routeProgress(),errors:error?[error]:[]};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(e.progressSnapshot()));await fs.writeFile(path.join(out,'read-ids.json'),JSON.stringify([...seen]));console.log(JSON.stringify({...report,choices:choices.length,scripts:scripts.size}));
