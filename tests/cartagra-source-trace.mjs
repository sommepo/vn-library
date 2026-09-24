/* Private real-disc control-flow experiment. Not browser/Unicode evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {CartagraTrace} from '../web/adapters/cartagra-trace.mjs';
const [root,out,runsArg='32',mode='fresh']=process.argv.slice(2),runs=Number(runsArg);
if(!root||!out||!Number.isInteger(runs)||runs<1||runs>512)throw Error('Usage: node tests/cartagra-source-trace.mjs AUDIT OUTPUT RUNS(1..512)');
if(fs.existsSync(out))throw Error('Output already exists');
if(!['fresh','earned'].includes(mode))throw Error('Mode must be fresh or earned');
const dir=path.join(root,'scripts');
const scripts=Object.fromEntries(fs.readdirSync(dir).map(n=>{const s=JSON.parse(fs.readFileSync(path.join(dir,n)));return[s.source,s];}));
const native=JSON.parse(fs.readFileSync(path.join(root,'native.json')));
const report={kind:'headless-source-control-research',playable:false,unicodeVerified:false,nativeTimingSimulated:true,runs:[],uniqueTextSites:[],choiceSites:[],endings:{},stops:[]};
const seen=new Set(),choiceSites=new Set(),earnedFlags={};report.mode=mode;
for(let seed=1;seed<=runs;seed++){
  const vm=new CartagraTrace(scripts,native);let random=Math.imul(seed,0x9e3779b1)>>>0,text=0,choices=[],end=null,stop=null;
  if(mode==='earned')Object.assign(vm.state.flags,earnedFlags);
  try{
    for(let n=0;n<300000;n++){
      const event=vm.run();
      if(event.kind==='glyph-text'){seen.add(event.id);text++;}
      if(event.kind==='choice'){
        choiceSites.add(event.id);random^=random<<13;random^=random>>>17;random^=random<<5;
        const option=event.options[Math.floor((random>>>0)/4294967296*event.options.length)];
        choices.push({id:event.id,value:option.value});vm.choose(option.value);
      }
      if(event.kind==='end'){end=event;break;}
    }
    if(!end)stop='Bounded experiment exhausted; no ending claim';
  }catch(e){stop=e.message;}
  const row={seed,text,choices:choices.length,instructions:vm.state.visits,end,stop};
  report.runs.push(row);
  if(stop&&!report.stops.includes(stop))report.stops.push(stop);
  if(end&&!report.endings[end.clearFlag])report.endings[end.clearFlag]={seed,choices,flags:vm.state.flags};
  if(end&&mode==='earned')for(const[k,v]of Object.entries(vm.state.flags))if(+k>=432&&+k<=464&&v)earnedFlags[k]=1;
  if(seed%16===0)console.log(`Traced ${seed}/${runs}; ${Object.keys(report.endings).length} ending flags; ${report.stops.length} distinct stops`);
}
report.uniqueTextSites=[...seen];report.choiceSites=[...choiceSites];
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify({runs,endings:Object.keys(report.endings),uniqueTextSites:seen.size,choiceSites:choiceSites.size,stops:report.stops}));
if(report.stops.length)process.exitCode=3;
