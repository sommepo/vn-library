/* Private source-earned unlock and late-choice alternatives. No UI/media claim. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {CartagraTrace} from '../web/adapters/cartagra-trace.mjs';
const [root,fresh,earned,out,baseFlag='441',lastArg='all']=process.argv.slice(2);
if(!out||fs.existsSync(out))throw Error('Usage: AUDIT FRESH_REPORT EARNED_REPORT NEW_OUTPUT');
const dir=path.join(root,'scripts'),scripts=Object.fromEntries(fs.readdirSync(dir).map(n=>{const s=JSON.parse(fs.readFileSync(path.join(dir,n)));return[s.source,s];}));
const native=JSON.parse(fs.readFileSync(path.join(root,'native.json'))),freshReport=JSON.parse(fs.readFileSync(fresh)),earnedReport=JSON.parse(fs.readFileSync(earned));
const report={kind:'headless-source-control-research',playable:false,unicodeVerified:false,prerequisite:null,endings:{},stops:[],restoreChecks:0};
function replay(vm,recipe,{capture=false,diverge=false,tail=0}={}){
 let at=0,count=0,snapshots=[],choices=[],random=tail+1;
 for(let n=0;n<350000;n++){
  const event=vm.run();if(event.kind==='glyph-text')count++;
  if(event.kind==='end')return{end:event,text:count,snapshots,choices};
  if(event.kind!=='choice')continue;
  const row=recipe[at];let value=row?.id===event.id&&event.options.some(o=>o.value===row.value)?row.value:undefined;
  if(value===undefined){if(!diverge)throw Error(`Recipe differs at ${at}: ${event.id}`);random^=random<<13;random^=random>>>17;random^=random<<5;value=event.options[Math.floor((random>>>0)/4294967296*event.options.length)].value;}
  if(capture)snapshots.push({state:structuredClone(vm.state),event:structuredClone(event),index:at});
  choices.push({id:event.id,value});at++;vm.choose(value);
 }
 throw Error('Bounded replay exhausted');
}
const prerequisite=new CartagraTrace(scripts,native);
const first=replay(prerequisite,freshReport.endings['452'].choices);
assert.equal(first.end.clearFlag,452);assert.equal(prerequisite.state.flags[460],1);
report.prerequisite={...first,snapshots:undefined};
const vm=new CartagraTrace(scripts,native);
for(const[k,v]of Object.entries(prerequisite.state.flags))if(+k>=432&&+k<=464&&v)vm.state.flags[k]=1;
const recipe=earnedReport.endings[baseFlag].choices,base=replay(vm,recipe,{capture:true});
assert.equal(base.end.clearFlag,+baseFlag);report.endings[baseFlag]={choices:base.choices,text:base.text};
const snapshots=lastArg==='all'?base.snapshots:base.snapshots.slice(-Number(lastArg));
if(lastArg!=='all'&&(!Number.isInteger(+lastArg)||+lastArg<1||+lastArg>100))throw Error('Invalid snapshot count');
for(const cp of snapshots)for(const option of cp.event.options)for(let tail=0;tail<3;tail++){
 if(option.value===recipe[cp.index].value)continue;
 const trial=new CartagraTrace(scripts,native);trial.state=structuredClone(cp.state);trial.choose(option.value);
 try{
  const suffix=recipe.slice(cp.index+1),result=replay(trial,suffix,{diverge:true,tail});
  const check=new CartagraTrace(scripts,native);check.state=structuredClone(cp.state);check.choose(option.value);
  const again=replay(check,result.choices);assert.deepEqual(again.end,result.end);assert.deepEqual(check.state,trial.state);report.restoreChecks++;
  if(!report.endings[result.end.clearFlag])report.endings[result.end.clearFlag]={choices:[...recipe.slice(0,cp.index),{id:cp.event.id,value:option.value},...result.choices],text:result.text};
 }catch(e){if(!report.stops.includes(e.message))report.stops.push(e.message);}
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({endings:Object.keys(report.endings),restoreChecks:report.restoreChecks,stops:report.stops}));if(report.stops.length)process.exitCode=3;
