// Runs only the user's private import. Timing is simulated; no browser/media claim.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const root=resolve(process.argv[2]||'private/library/clannad-live');
const limit=Number(process.argv[3]||150),output=process.argv[4];
if(!Number.isInteger(limit)||limit<1||limit>200000)throw new Error('Invalid segment limit');
const loadJSON=async url=>{if(!/^(?:content\.json|scripts\/SEEN\d{4}\.MZX\.json)$/.test(url))throw new Error('Unsafe import URL');const path=process.env.VNKIT_SCRIPT_DIR&&url.startsWith('scripts/')?resolve(process.env.VNKIT_SCRIPT_DIR,url.slice(8)):resolve(root,url);return JSON.parse(await readFile(path,'utf8'));};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report={kind:'private-source-control-smoke',timing:'simulated',browserCoverage:false,textSegments:0,choices:0,waits:0,branches:[],checks:[],failures:[],scripts:[]};
if(process.env.VNKIT_SCRIPT_DIR)report.parserDevelopmentOverride=process.env.VNKIT_SCRIPT_DIR;
let engine;
const snapshot=()=>{const s=engine.save().state;if(s.pending)delete s.pending.occurrenceId;return hash(s);};
async function forward(n=8){const result=[];for(let i=0;i<n*30&&result.length<n;i++){
  const p=engine.current;if(p?.kind==='end')break;
  if(p?.kind==='text'||p?.kind==='choice')result.push(snapshot());
  await engine.advance(p?.kind==='choice'?p.options[0].id:undefined);
}return result;}
try{
 const content=await loadJSON('content.json');report.game=content.id;
 engine=await ClannadEngine.create(content,{loadJSON});await engine.run();
 for(let i=0;i<limit*30&&report.textSegments<limit;i++){
  const p=engine.current;if(!p||p.kind==='end')break;
  if(!report.scripts.includes(engine.state.script))report.scripts.push(engine.state.script);
  if(p.kind==='text'||p.presentation?.kind==='text'){report.textSegments++;report.lastSource=(p.presentation||p).id;}
  if(p.kind==='text'&&p.voiceUntilMs!=null&&process.env.VNKIT_VOICE_CUE_SAVE&&!report.voiceCueCheckpoint){await writeFile(process.env.VNKIT_VOICE_CUE_SAVE,JSON.stringify(engine.save(),null,2),{flag:'wx'});report.voiceCueCheckpoint=p.boundary;}
  if(p.kind==='text'&&p.voice&&process.env.VNKIT_VOICE_SAVE&&!report.voiceCheckpoint){
   const asset=content.assets[p.voice],duration=asset.samples/asset.sampleRate;
   if(duration>Math.max(.5,[...p.text].length*.065)+1){await writeFile(process.env.VNKIT_VOICE_SAVE,JSON.stringify(engine.save(),null,2),{flag:'wx'});report.voiceCheckpoint={source:p.id,asset:p.voice,duration};}
  }
  if(p.kind==='wait')report.waits++;
  if(p.kind==='wait'&&engine.state.scene.task?.id==='clannad-motion'&&process.env.VNKIT_MOTION_SAVE&&!report.motionCheckpoint){await writeFile(process.env.VNKIT_MOTION_SAVE,JSON.stringify(engine.save(),null,2),{flag:'wx'});report.motionCheckpoint=engine.current.id;}
  if(p.kind==='wait'&&engine.state.scene.task?.id==='clannad-rotation'&&process.env.VNKIT_ROTATION_SAVE&&!report.rotationCheckpoint){await writeFile(process.env.VNKIT_ROTATION_SAVE,JSON.stringify(engine.save(),null,2),{flag:'wx'});report.rotationCheckpoint=engine.current.id;}
  if(p.kind==='wait'&&engine.state.scene.task?.id==='clannad-eyecatch'&&process.env.VNKIT_EYECATCH_SAVE&&!report.eyecatchCheckpoint){await writeFile(process.env.VNKIT_EYECATCH_SAVE,JSON.stringify(engine.save(),null,2),{flag:'wx'});report.eyecatchCheckpoint=engine.current.id;}
  if(p.kind==='choice'){
   report.choices++;
   if(report.branches.length===0){
    const before=engine.save();const initial=snapshot();await engine.restore(before);await engine.run();
    report.checks.push({name:'Choice restore/rerender preserves state',passed:initial===snapshot()});
    for(const option of p.options){
     await engine.restore(before);await engine.advance(option.id);const after=engine.save();const a=await forward();
     await engine.restore(before);await engine.advance(option.id);const b=await forward();
     await engine.restore(after);const c=await forward();
     const passed=hash(a)===hash(b)&&hash(a)===hash(c);
     report.branches.push({source:p.id,option:option.id,pages:a.length,passed});
     if(!passed)throw new Error('Choice save/load state divergence');
    }
    await engine.restore(before);
   }
  }
  await engine.advance(p.kind==='choice'?p.options[0].id:undefined);
 }
 report.requestedLimitReached=report.textSegments===limit;
}catch(error){report.failures.push(error.message);}
if(engine){report.warnings=engine.state.warnings;report.stoppedAt={script:engine.state.script,pc:engine.state.pc};}
report.passed=!report.failures.length&&report.checks.every(c=>c.passed);
if(output)await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));process.exitCode=report.passed?0:3;
