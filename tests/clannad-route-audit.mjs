// Private source-only audit. It probes actual choices/conditions; it does not
// establish full route fidelity or render/play media. No game text is printed.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);await mkdir(out,{recursive:true});
const loadJSON=async url=>JSON.parse(await readFile(join(root,url),'utf8'));
const content=await loadJSON('content.json');
const make=()=>ClannadEngine.create(content,{loadJSON});
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const e=await make();await e.run();
const report={kind:'actual-source-choice-state-audit',timing:'simulated',textSegments:0,choices:[],checkpoints:[],stop:null};
const seenEvents=new Set();let previous=e.save();
const emit=async(name,value)=>writeFile(join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
async function probe(save,option){
 const a=await make();await a.restore(save);const trace=[];let stop=null;
 try{await a.advance(option);for(let n=0;n<800;n++){
  const p=a.current;if(!p||p.kind==='end'||p.kind==='choice')break;
  if(p.kind==='text'||p.presentation)trace.push((p.presentation||p).id);
  await a.advance();
 }}catch(error){stop=error.message;}
 return {option,segments:trace.length,textTraceHash:hash(trace),nextBoundary:a.current?.id||null,script:a.state.script,vars:a.state.vars,stop};
}
try{for(let n=0;n<100000&&report.textSegments<20000;n++){
 const p=e.current;if(!p||p.kind==='end'){report.ended=true;break;}
 if(p.kind==='text'||p.presentation)report.textSegments++;
 if(p.kind==='wait'&&e.state.scene.task){
  const id=e.state.scene.task.event;
  if(!seenEvents.has(id)){seenEvents.add(id);await emit(`event-${id}-before.json`,previous);await emit(`event-${id}-during.json`,e.save());report.checkpoints.push(id);}
 }
 if(p.kind==='pause'&&p.nativeInput&&!report.nativeInput){await emit('native-input.json',e.save());report.nativeInput=p.id;}
 if(p.kind==='text'&&p.source?.segments.some(id=>{
  const [name,offset]=id.split(':');return e.scripts[name]?.instructions.find(i=>i.offset===parseInt(offset,16))?.op==='MSNL';
 })&&!report.simultaneous){await emit('simultaneous.json',e.save());report.simultaneous=p.id;}
 if(p.kind==='choice'){
  const save=e.save(),branches=[];for(const option of p.options)branches.push(await probe(save,option.id));
  const delta=[];const first=branches[0];
  for(const b of branches.slice(1))for(const bank of ['F','G'])for(const key of new Set([...Object.keys(first.vars[bank]),...Object.keys(b.vars[bank])]))if((first.vars[bank][key]||0)!==(b.vars[bank][key]||0))delta.push({option:b.option,bank,index:Number(key),first:first.vars[bank][key]||0,value:b.vars[bank][key]||0});
  report.choices.push({source:p.id,assignment:p.assignment,distinctTextTraces:new Set(branches.map(b=>b.textTraceHash)).size,persistentDifferences:delta,branches});
  await emit(`choice-${report.choices.length}.json`,save);
 }
 previous=e.save();await e.advance(p.kind==='choice'?p.options[0].id:undefined);
}}
catch(error){report.stop=error.message;await emit('before-stop.json',previous);}
await emit('report.json',report);
console.log(JSON.stringify({textSegments:report.textSegments,choices:report.choices.length,choicesWithDistinctText:report.choices.filter(c=>c.distinctTextTraces>1).length,choicesWithLaterFlagDifferences:report.choices.filter(c=>c.persistentDifferences.some(d=>d.bank!==c.assignment.bank||d.index!==c.assignment.index)).length,checkpoints:report.checkpoints,stop:report.stop,output:out},null,2));
