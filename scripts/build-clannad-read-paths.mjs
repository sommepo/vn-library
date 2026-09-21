// Replay recorded choice traces from entry. No guessed script ordering or forced F/Z.
// Private output contains source IDs only; never package an imported game's index.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const [rootArg,reportArg,outArg]=process.argv.slice(2);
if(!outArg)throw Error('Usage: node scripts/build-clannad-read-paths.mjs IMPORT CAMPAIGN_REPORT OUTPUT');
const root=resolve(rootArg),report=JSON.parse(await readFile(reportArg)),cache={};
const loadJSON=async u=>cache[u]??=JSON.parse(await readFile(join(root,u),'utf8'));
const content=await loadJSON('content.json');
function trace(run,seen=new Set()) {
 if(seen.has(run))throw Error('Cyclic campaign ancestry');seen.add(run);
 const r=report.runs[run];if(!r||r.run!==run)throw Error('Missing campaign run');
 if(!r.parent)return r.trace;
 const prior=trace(r.parent.run,seen),i=prior.findIndex(([id])=>id===r.parent.choice);
 if(i<0)throw Error('Parent choice missing');
 return [...prior.slice(0,i),[r.parent.choice,r.parent.option],...r.trace];
}
const paths={},failures=[];let signature;
const candidates=report.runs.filter(r=>r.end).filter((r,i,a)=>a.findIndex(x=>x.end===r.end)===i);
for(const r of candidates){
 try{
 const choices=trace(r.run),e=await ClannadEngine.create(content,{loadJSON});signature=e.signature;
 await e.startNew(undefined,'start');let choice=0;const ids=new Set();
 for(let n=0;n<50000;n++){
  const p=e.current,t=p.presentation||p;if(t.kind==='text')ids.add(t.id);
  if(p.kind==='end')break;
  let option;
  if(p.kind==='choice'){const next=choices[choice++];if(!next||next[0]!==p.id)throw Error(`Choice divergence at ${p.id}`);option=next[1];}
  await e.advance(option);
 }
 if(e.current.kind!=='end'||e.current.id!==r.end||choice!==choices.length)throw Error('Ending/trace mismatch');
 e.finishEnding();
 for(const route of e.routeProgress().filter(r=>r.complete))if(!paths[route.id])paths[route.id]={ids:[...ids].sort(),ending:e.current.id,choices,provenance:{method:'vm-replayed-campaign',run:r.run,timing:'simulated'}};
 console.log(JSON.stringify({run:r.run,end:e.current.id,segments:ids.size,routes:e.routeProgress().filter(r=>r.complete).map(r=>r.id)}));
 }catch(error){failures.push({run:r.run,error:error.message});}
}
const output={format:'vnkit.read-paths',version:1,gameId:content.id,gameSignature:signature,paths,failures};
await writeFile(outArg,JSON.stringify(output)+'\n',{flag:'wx'});
console.log(JSON.stringify({routes:Object.keys(paths),failures,output:outArg}));
