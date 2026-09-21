// Private source-reached exploration. Never force story variables or script PCs.
// Each branch starts at entry or a choice reached by a recorded parent run.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const root=resolve(process.argv[2]||'private/library/clannad-live'),out=resolve(process.argv[3]||'private/clannad/campaign');
const runs=Number(process.argv[4]||300);if(!Number.isInteger(runs)||runs<1||runs>10000)throw new Error('Run bound must be 1..10000');
await mkdir(out,{recursive:true});
const cache={},loadJSON=async u=>cache[u]??=JSON.parse(await readFile(join(root,u),'utf8'));
const content=process.env.VNKIT_CONTENT?JSON.parse(await readFile(process.env.VNKIT_CONTENT,'utf8')):await loadJSON('content.json');
let progress,seed=66302;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sites=new Set(),texts=new Set(),scripts=new Set(),edges=new Map(),endings=new Set(),blockers=new Map(),queue=[],queued=new Set(),features=new Set(),dropped=new Map();
const report={kind:'source-reached-branch-campaign',browserCoverage:false,timing:'simulated',seed:66302,runs:[],checkpoints:[],limits:{runs,boundariesPerRun:40000,queuedBranches:1500}};
const emit=(name,value)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
for(let run=0;run<runs;run++){
 let previous;const record={run,segments:0,choices:0,trace:[]},startSites=sites.size;
 const e=await ClannadEngine.create(content,{loadJSON,onInstruction(i,state){sites.add(i.id);scripts.add(i.id.split(':')[0]);
  if(['CLOS','END_','RTMN','RTM_'].includes(i.op)&&state.buffer.length>state.presentedParts)dropped.set(i.id,state.buffer.slice(state.presentedParts));
 }});
 try{
  if(queue.length&&run%5!==0){
   // Prefer rarely exercised choice edges; preserve source-reached F/Z/stack.
   queue.sort((a,b)=>(edges.get(a.edge)||0)-(edges.get(b.edge)||0));
   const index=Math.floor(random()*Math.min(queue.length,Math.max(1,Math.floor(queue.length*.1))));
   const item=queue.splice(index,1)[0];record.parent={run:item.run,choice:item.save.state.pending.id,option:item.option};
   await e.restore(item.save);e.applyProgress(progress);await e.advance(item.option);
  }else{
   e.applyProgress(progress);const entries=e.newGameEntries(),entry=entries.length>1&&run%10===0?'after-story':'start';record.entry=entry;
   await e.startNew(progress,entry);
  }
  for(let n=0;n<40000;n++){
   const p=e.current;if(!p)throw new Error('Missing source boundary');
   if(p.kind==='end'){
    record.end=p.id;if(!endings.has(p.id)){endings.add(p.id);await emit(`end-${run}.json`,e.save());}
    progress=e.progressSnapshot();break;
   }
   const t=p.presentation||p;if(t.kind==='text'){texts.add(t.id);record.segments++;}
   const instruction=e.scripts[e.state.script].instructions[e.state.pc-1];
   const feature=instruction.op==='EVT0'?'native-'+instruction.args[1]:instruction.op;
   if(['FADZ','SEB','MVPL','ECTW','VCWT','NCK3','native-74','native-77','native-53','native-41','native-19','native-0'].includes(feature)&&!features.has(feature)){
    features.add(feature);const file=`feature-${feature}.json`;await emit(file,e.save());report.checkpoints.push({feature,file,run,source:p.id});
   }
   let option;
   if(p.kind==='choice'){
    record.choices++;const counts=p.options.map(o=>edges.get(p.id+':'+o.id)||0),min=Math.min(...counts);
    const options=random()<.75?p.options.filter((_,i)=>counts[i]===min):p.options;
    option=options[Math.floor(random()*options.length)].id;
    const save=e.save();
    for(const o of p.options){const edge=p.id+':'+o.id,key=hash([p.id,o.id,e.state.vars.F,e.state.vars.Z,e.state.stack]);
     if(o.id!==option&&!queued.has(key)&&queue.length<1500){queue.push({run,edge,option:o.id,save});queued.add(key);}
    }
    edges.set(p.id+':'+option,(edges.get(p.id+':'+option)||0)+1);record.trace.push([p.id,option]);
   }
   // Exercise restoration throughout every real path, not just the opening.
   if(n%173===0){const save=e.save();await e.restore(save);if(hash(e.state)!==hash(save.state))throw new Error('Save/restore changed execution state');}
   previous=e.save();await e.advance(option);if(n===39999)record.boundaryLimit=true;
  }
 }catch(error){record.error=error.message;if(!blockers.has(error.message)){blockers.set(error.message,run);await emit(`blocked-${run}.json`,previous||e.save());}}
 record.newInstructions=sites.size-startSites;report.runs.push(record);
 if((run+1)%10===0)console.log(JSON.stringify({runs:run+1,scripts:scripts.size,texts:texts.size,edges:edges.size,endings:endings.size,blockers:[...blockers.keys()],queue:queue.length,globalProgress:progress?.globals}));
}
Object.assign(report,{uniqueInstructions:sites.size,uniqueTextSegments:texts.size,scripts:[...scripts].sort(),choiceEdges:[...edges],endings:[...endings],blockers:[...blockers],globalProgress:progress,unpresentedAtClear:[...dropped]});
await emit('report.json',report);console.log(JSON.stringify({runs,scripts:scripts.size,texts:texts.size,edges:edges.size,endings:[...endings],blockers:[...blockers],unpresentedAtClear:dropped.size,output:out},null,2));
