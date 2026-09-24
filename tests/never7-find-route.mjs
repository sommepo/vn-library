// Bounded private test-path search. Chooses displayed options; never writes flags.
// It is not used by the reader or a claim of exhaustive route coverage.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';
const [input,destination,affinityArg,flagArg,progressFile,budgetArg='1000',entry='start']=process.argv.slice(2);
const dir=path.resolve(input),out=path.resolve(destination),affinity=+affinityArg,flag=+flagArg,budget=+budgetArg;
const endingTarget=flagArg.startsWith('end:')?flagArg.slice(4):null;
if(!Number.isInteger(budget)||budget<1||budget>20000)throw Error('Invalid bounded search budget');
await fs.mkdir(out,{recursive:false});
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={};
const loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)));
let serial=0,expansions=0;
const e=await Never7Engine.create(content,{loadJSON,makeId:()=>String(++serial)});
const progress=progressFile&&progressFile!=='-'?JSON.parse(await fs.readFile(progressFile)):undefined;
await e.startNew(progress,entry);
const boundary=async()=>{for(let n=0;n<50000;n++){if(['choice','end'].includes(e.current.kind))return;await e.advance();}throw Error('No choice/end within boundary budget');};
await boundary();
const pending=[{save:e.save(),choices:[]}],seen=new Set(),endings=new Set(),errors=[];
let solution;
while(pending.length&&expansions<budget){
 const node=pending.pop();await e.restore(node.save);
 const key=JSON.stringify([e.state.script,e.state.pc,Object.entries(e.state.vars).sort(),Object.keys(e.state.globals).sort(),e.state.frame]);
 if(seen.has(key))continue;seen.add(key);expansions++;
 if(e.current.kind==='end'){
  endings.add(e.current.id);
  if(endingTarget?e.current.id===endingTarget:e.state.globals[flag]){solution={entry,choices:node.choices,earned:endingTarget?[]:[flag],ending:e.current.id};break;}
  continue;
 }
 const p=e.current,children=[];
 for(let option=0;option<p.options.length;option++){
  try{
   await e.restore(node.save);await e.advance(p.options[option].id);await boundary();
   const vars=e.state.vars;
   const score=(e.state.globals[flag]?100000:0)+(vars[affinity]||0)*10-[10,11,12,13,14].filter(v=>v!==affinity).reduce((n,v)=>n+(vars[v]||0),0);
   children.push({save:e.save(),choices:[...node.choices,{source:p.id,option}],score});
  }catch(error){errors.push({source:p.id,option,error:error.stack});}
 }
 children.sort((a,b)=>a.score-b.score);
 pending.push(...children);
 if(expansions%100===0)console.log(`Explored ${expansions}/${budget} choice states`);
}
const report={expansions,budget,remaining:pending.length,endings:[...endings],errors,solved:Boolean(solution)};
await fs.writeFile(path.join(out,'search.json'),JSON.stringify(report,null,2));
if(solution){await fs.writeFile(path.join(out,'recipe.json'),JSON.stringify({...solution,research:'Actual native-entry VM search; displayed choices only',progressFrom:progressFile||null},null,2));await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(e.progressSnapshot()));}
else process.exitCode=1;
console.log(JSON.stringify(report,null,2));
