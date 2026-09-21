// Bounded source-VM DFS; source text/choices/checkpoints are private outputs.
import fs from'node:fs/promises';import path from'node:path';import{Remember11Engine}from'../web/adapters/remember11-engine.mjs';
const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),max=Number(process.argv[4]||100000),chapter=process.argv[5]||'kokoro';await fs.mkdir(out,{recursive:true});
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},opts={loadJSON:async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)))},e=await Remember11Engine.create(c,opts),stack=[],endings={},scripts=new Set();let pages=0,edges=0,result,success=false;
if(chapter==='satoru'){e.markRouteComplete('kokoro');e.assign(0x602a,1);}
try{result=await e.run();while(pages<max){scripts.add(e.state.script);const p=result.pending;
 if(p.kind==='end'){
  endings[p.id]=(endings[p.id]||0)+1;console.log('ending',pages,edges,p.id,flush());
  if(e.state.vars.globalBits[chapter==='kokoro'?84:100]){success=true;break;}
  while(stack.length&&stack.at(-1).next>=stack.at(-1).options.length)stack.pop();
  if(!stack.length)break;const f=stack.at(-1);await e.restore(f.save);const choice=f.options[f.next++];edges++;result=await e.advance(choice);continue;
 }
 if(p.kind==='choice'){stack.push({save:e.save(),options:p.options.map(o=>o.id),next:1});edges++;result=await e.advance(p.options[0].id);continue;}
 if(p.kind==='text')pages++;
 result=await e.advance();
}}catch(error){await fs.writeFile(path.join(out,'error.txt'),error.stack);console.log(error.stack);process.exitCode=1;}
const report={chapter,pages,edges,endings,scripts:[...scripts],success,manualEntry:chapter==='satoru',choices:stack.map(f=>({id:f.save.state.pending.id,option:f.options[f.next-1]}))};await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));console.log(JSON.stringify(report));
function flush(){return `depth ${stack.length}`;}
