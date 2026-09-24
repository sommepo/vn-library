/* Actual owner-supplied import, headless reader VM. Media and timing are
 * simulated. Private route recipes are inputs, never public fixtures. */
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import{CartagraEngine}from '../web/adapters/cartagra-engine.mjs';
const [root,reports,out]=process.argv.slice(2);if(!out)throw Error('Usage: IMPORT RESEARCH_REPORTS NEW_REPORT_DIRECTORY');
await fs.mkdir(out,{recursive:false});
const content=JSON.parse(await fs.readFile(path.join(root,'content.json'))),cache=new Map();
const loadJSON=async p=>{if(!cache.has(p))cache.set(p,JSON.parse(await fs.readFile(path.join(root,p))));return cache.get(p);};
const fresh=JSON.parse(await fs.readFile(path.join(reports,'trace-v2.json'))),late=JSON.parse(await fs.readFile(path.join(reports,'late-endings-v2.json'))),final=JSON.parse(await fs.readFile(path.join(reports,'final-endings-v1.json')));
const report={format:'vnkit.cartagra-reader-campaign',version:1,unicode:content.runtime.textMode==='reviewed-unicode',mediaTimingSimulated:true,routes:[],stops:[],restoreChecks:0,uniqueTextSites:0,choiceEdges:0};
const sites=new Set(),edges=new Set();let earned=null;
async function run(flag,recipe,progress=null){
 const e=await CartagraEngine.create(content,{loadJSON,makeId:()=> 'test-occurrence'});e.applyProgress(progress);let p=(await e.run()).pending,at=0,text=0;
 const replayCheck=async option=>{
  const save=e.save();await e.advance(option);const expected=e.save();
  await e.restore(save);await e.advance(option);assert.deepEqual(e.save().state,expected.state);report.restoreChecks++;return e.current;
 };
 for(let n=0;n<40000;n++){
  const beforeEnding=flag==='452'?e.save():null;
  if(p.kind==='end'){assert.equal(e.state.sourceEvent.clearFlag,+flag);assert.equal(e.state.flags[flag],1);assert.equal(at,recipe.length);report.routes.push({flag:+flag,text,choices:at,visits:e.state.visits});console.log(`PASS ending ${flag}, ${text} glyph segments, ${at} choices`);return e;}
  if(p.kind==='choice'){
   const row=recipe[at++];assert.equal(row?.id,p.id);assert.ok(p.options.some(o=>o.id===String(row.value)));
   edges.add(p.id+':'+row.value);p=await replayCheck(String(row.value));
   // Check both the position before the choice and the first resulting boundary.
   if(p.kind!=='choice'&&p.kind!=='end'){if(p.kind==='text'){sites.add(p.id);text++;}p=await replayCheck();}
  }else{
   if(p.kind==='text'){sites.add(p.id);text++;}
   if(text===100&&flag==='452')await fs.writeFile(path.join(out,'dialogue-save.json'),JSON.stringify(e.save()));
   if(text%997===0&&p.kind==='text')p=await replayCheck();else p=(await e.advance()).pending;
  }
  if(p.kind==='end'&&flag==='452'){
   await fs.writeFile(path.join(out,'ending-save.json'),JSON.stringify(e.save()));
   await fs.writeFile(path.join(out,'before-ending-save.json'),JSON.stringify(beforeEnding));
  }
 }
 throw Error('Presentation limit exhausted');
}
try{
 // Earn the hidden branch through a real first playthrough, not debug flags.
 const first=await run('452',fresh.endings['452'].choices);earned=first.progressSnapshot();assert.equal(earned.globals.flags[460],1);
 for(const [flag,route]of Object.entries(fresh.endings))if(flag!=='452')await run(flag,route.choices);
 for(const flag of ['439','441'])await run(flag,late.endings[flag].choices,earned);
 for(const flag of ['454','455'])await run(flag,final.endings[flag].choices,earned);
 assert.equal(report.routes.length,16);
}catch(error){report.stops.push(error.stack);console.error(error.stack);process.exitCode=1;}
finally{report.uniqueTextSites=sites.size;report.choiceEdges=edges.size;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
