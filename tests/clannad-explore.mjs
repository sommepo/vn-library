// Bounded, reproducible exploration of real source choices. Private reports only.
// Coverage is execution of the adapter with simulated media, not PS2 fidelity.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const [root,out]=process.argv.slice(2,4).map(x=>resolve(x));
const runs=Number(process.argv[4]||100),limit=Number(process.argv[5]||30000);
if(!Number.isInteger(runs)||runs<1||runs>10000||!Number.isInteger(limit)||limit<1||limit>200000)throw new Error('Invalid exploration bounds');
await mkdir(out,{recursive:true});
const cache={};const loadJSON=async url=>cache[url]??=JSON.parse(await readFile(join(root,url),'utf8'));
const content=process.env.VNKIT_CONTENT?JSON.parse(await readFile(process.env.VNKIT_CONTENT,'utf8')):await loadJSON('content.json'),sites=new Set(),texts=new Set(),scripts=new Set(),edges=new Map(),blockers=new Map(),endings=new Map();
const report={kind:'bounded-actual-source-route-exploration',browserCoverage:false,timing:'simulated',seed:66302,runs:[],limits:{runs,boundariesPerRun:limit}};
let seed=66302;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const emit=(name,value)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
for(let run=0;run<runs;run++){
 const trace=[],e=await ClannadEngine.create(content,{loadJSON,onInstruction(i){sites.add(i.id);scripts.add(i.id.split(':')[0]);}});
 const result={run,segments:0,choices:0,stop:null};let previous;
 try{
  await e.run();
  for(let n=0;n<limit;n++){
   const p=e.current;
   if(p?.kind==='end'){result.end=p.id;if(!endings.has(p.id)){endings.set(p.id,{run,vars:e.state.vars});await emit(`end-${run}.json`,e.save());}break;}
   if(!p)throw new Error('Missing presentation');
   const t=p.presentation||p;
   if(t.kind==='text'){texts.add(t.id);result.segments++;}
   let option;
   if(p.kind==='choice'){
    result.choices++;
    const counts=p.options.map(o=>edges.get(p.id+':'+o.id)||0),min=Math.min(...counts);
    // Prefer uncovered edges, with random restarts to vary combinations of flags.
    const candidates=run<2?[p.options[run%p.options.length]]:random()<.65?p.options.filter((_,i)=>counts[i]===min):p.options;
    option=candidates[Math.floor(random()*candidates.length)].id;
    edges.set(p.id+':'+option,(edges.get(p.id+':'+option)||0)+1);trace.push([p.id,option]);
   }
   previous=e.save();await e.advance(option);
   if(n===limit-1)result.boundaryLimit=true;
  }
 }catch(error){result.stop=error.message;
  if(!blockers.has(error.message)){
   blockers.set(error.message,{run,trace,checkpoint:`blocked-${run}.json`});
   await emit(`blocked-${run}.json`,previous||e.save());
  }
 }
 result.traceHash=hash(trace);result.trace=trace;report.runs.push(result);
 if((run+1)%10===0)console.log(JSON.stringify({runs:run+1,scripts:scripts.size,texts:texts.size,choiceEdges:edges.size,ends:endings.size,blockers:blockers.size}));
}
Object.assign(report,{uniqueInstructions:sites.size,uniqueTextSegments:texts.size,scripts:[...scripts].sort(),choiceEdges:[...edges],endings:[...endings],blockers:[...blockers]});
await emit('report.json',report);
console.log(JSON.stringify({runs,uniqueInstructions:sites.size,uniqueTextSegments:texts.size,scripts:scripts.size,choiceEdges:edges.size,endings:[...endings.keys()],blockers:[...blockers.keys()],output:out},null,2));
