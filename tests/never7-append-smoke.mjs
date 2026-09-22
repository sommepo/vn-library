// Exhaust displayed choices within each unlocked Append entry, with a per-entry
// state budget. Reads real private data; never fabricates progress or route flags.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';
const [input,destination,progressFile]=process.argv.slice(2),dir=path.resolve(input),out=path.resolve(destination);
await fs.mkdir(out,{recursive:false});
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),progress=JSON.parse(await fs.readFile(progressFile)),cache={};
const loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)));
let serial=0;const options={loadJSON,makeId:()=>String(++serial)},e=await Never7Engine.create(content,options);
e.applyProgress(progress);const entries=e.newGameEntries().filter(e=>e.id.startsWith('append-'));
assert.equal(entries.length,34,'Earned finale must unlock all 34 native Append entries');
const report={entries:[],errors:[],policy:'Fresh native menu entry for each story; displayed choices only; waits/media simulated'};
for(const entry of entries){
 const engine=await Never7Engine.create(content,options);await engine.startNew(progress,entry.id);
 const stats={entry:entry.id,label:entry.label,states:0,segments:0,restores:0,endings:[],earnedFlags:[],errors:[]};
 const text=new Set(),scripts=new Set(),seen=new Set(),endings=new Map(),pending=[{save:engine.save(),choices:[]}];
 while(pending.length&&stats.states<4000){
  const node=pending.pop();await engine.restore(node.save);stats.states++;
  try{
   for(let steps=0;steps<60000;steps++){
    const p=engine.current;scripts.add(engine.state.script);
    if(p.kind==='text'){text.add(p.id);stats.segments++;}
    if(p.kind==='choice'||p.kind==='text'&&stats.segments%100===0){
     const fresh=await Never7Engine.create(content,options);await fresh.restore(engine.save());assert.deepEqual(fresh.state,engine.state);stats.restores++;
    }
    if(p.kind==='end'){
     const earned=Object.keys(engine.state.globals).filter(k=>!progress.globals[k]).map(Number).sort((a,b)=>a-b),endingKey=JSON.stringify([p.id,earned]);
     if(!endings.has(endingKey)){
      endings.set(endingKey,{entry:entry.id,choices:node.choices,ending:p.id,earned});
      await fs.writeFile(path.join(out,`${entry.id}-end-${endings.size}.json`),JSON.stringify(engine.save()));
     }
     for(const [flag,v]of Object.entries(engine.state.globals))if(v&&!progress.globals[flag]&&!stats.earnedFlags.includes(+flag))stats.earnedFlags.push(+flag);
     break;
    }
    if(p.kind==='choice'){
     const key=JSON.stringify([engine.state.script,engine.state.pc,Object.entries(engine.state.vars).sort(),Object.keys(engine.state.globals).sort(),engine.state.frame]);
     if(seen.has(key))break;seen.add(key);
     const save=engine.save();
     for(let i=0;i<p.options.length;i++){
      await engine.restore(save);await engine.advance(p.options[i].id);
      const fresh=await Never7Engine.create(content,options);await fresh.restore(save);await fresh.advance(p.options[i].id);
      const normal=s=>{s=structuredClone(s);if(s.pending)delete s.pending.occurrenceId;return s;};assert.deepEqual(normal(engine.state),normal(fresh.state));stats.restores++;
      pending.push({save:engine.save(),choices:[...node.choices,{source:p.id,option:i}]});
     }
     break;
    }
    await engine.advance();
    if(steps===59999)throw Error('No end/choice within segment budget');
   }
  }catch(error){stats.errors.push({error:error.stack,choices:node.choices});}
 }
 stats.endings=[...new Set([...endings.values()].map(e=>e.ending))];stats.outcomes=[...endings.values()].map(({ending,earned})=>({ending,earned}));stats.uniqueSegments=text.size;stats.scripts=[...scripts];stats.unexploredStates=pending.length;
 for(const [n,recipe]of [...endings.values()].entries())await fs.writeFile(path.join(out,`${entry.id}-recipe-${n+1}.json`),JSON.stringify(recipe,null,2));
 if(!stats.endings.length||pending.length||stats.errors.length)report.errors.push({entry:entry.id,errors:stats.errors,remaining:pending.length});
 report.entries.push(stats);await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...stats,scripts:stats.scripts.length,errors:stats.errors.length}));
}
if(report.errors.length)process.exitCode=1;
