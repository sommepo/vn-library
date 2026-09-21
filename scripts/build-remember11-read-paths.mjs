// Replay owner-local recorded choices; never infer read IDs from filenames.
import fs from 'node:fs/promises';import path from 'node:path';
import {Remember11Engine} from '../web/adapters/remember11-engine.mjs';
const dir=path.resolve(process.argv[2]),source=JSON.parse(await fs.readFile(process.argv[3])),out=path.resolve(process.argv[4]);
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},options={loadJSON:async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)))},paths={};let progress,signature;
for(const chapter of ['kokoro','satoru']){
 const route=source[chapter];if(!route)continue;
 const e=await Remember11Engine.create(c,options),ids=new Set();signature=e.signature;let choice=0;
 await e.startNew(progress,chapter==='kokoro'?'start':'satoru');
 for(let n=0;n<100000&&e.current.kind!=='end';n++){
  const p=e.current;if(p.kind==='text')ids.add(p.id);
  if(p.kind==='choice'){const expected=route.choices[choice++];if(expected?.id!==p.id||!p.options.some(o=>o.id===expected.option))throw Error(`Recorded choice diverged at ${p.id}`);await e.advance(expected.option);}
  else await e.advance();
 }
 if(e.current.kind!=='end'||e.current.id!==route.ending||!e.routeProgress().find(r=>r.id===chapter).complete||choice!==route.choices.length)throw Error(`Unverified ending for ${chapter}`);
 paths[chapter]={ids:[...ids],ending:e.current.id,choices:route.choices.length};progress=e.progressSnapshot();console.log(chapter,ids.size,e.current.id);
}
if(!Object.keys(paths).length)throw Error('No recorded route paths supplied');
const result=JSON.stringify({format:'vnkit.read-paths',version:1,gameId:c.id,gameSignature:signature,paths},null,2)+'\n';
await fs.mkdir(path.dirname(out),{recursive:true});try{if(await fs.readFile(out,'utf8')!==result)throw Error('Refusing to overwrite different read paths; choose a new output');}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(out,result,{flag:'wx'});}
