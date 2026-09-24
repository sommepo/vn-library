// Private, bounded source execution. Media/timing are simulated, not browser evidence.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';

const dir=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),runs=Number(process.argv[4]||20);
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={};
const loadJSON=async url=>cache[url]??=JSON.parse(await fs.readFile(path.join(dir,url)));
await fs.mkdir(out,{recursive:true});
const report={format:'vnkit.ever17-campaign',version:1,timing:'simulated',runs:[],routes:{},errors:[]};
const visited=new Set(),scripts=new Set(),edges=new Set();let progress,id=0;
for(let run=0;run<runs;run++){
  let random=run+1307;
  const randomIndex=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return Math.floor(random/4294967296*n);};
  const before=progress,choices=[],texts=new Set();let segments=0,ending;
  const e=await Ever17Engine.create(content,{loadJSON,makeId:()=>String(++id),onInstruction:(i,s)=>{visited.add(i.id);scripts.add(s.script);}});
  try{
    await e.startNew(progress);
    for(let n=0;n<150000;n++){
      const p=e.current;
      if(p.kind==='end'){ending=p.id;break;}
      if(p.kind==='text'){segments++;texts.add(p.id);}
      let choice;
      if(p.kind==='choice'){
        choice=p.options[randomIndex(p.options.length)].id;
        choices.push({source:p.id,selected:choice});edges.add(p.id+':'+choice);
      }
      await e.advance(choice);
    }
    if(!ending)throw Error('Run budget reached without ending');
    for(const r of e.routeProgress())if(r.complete&&!report.routes[r.id]){
      report.routes[r.id]={run,ending,segments};
      await fs.writeFile(path.join(out,r.id+'.json'),JSON.stringify({gameSignature:e.signature,progress:before,choices,ending,readIds:[...texts]},null,2));
    }
    progress=e.progressSnapshot();
    const result={run,segments,choices:choices.length,ending,cleared:e.routeProgress().filter(r=>r.complete).map(r=>r.id),gate:e.value(0x803b)};
    report.runs.push(result);console.log(JSON.stringify(result));
  }catch(error){
    report.errors.push({run,segments,error:error.stack});
    await fs.writeFile(path.join(out,'error-'+run+'.json'),JSON.stringify({choices,save:e.save()},null,2));
    console.log(JSON.stringify(report.errors.at(-1)));break;
  }
  await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(progress));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,instructions:visited.size,scripts:[...scripts],choiceEdges:edges.size},null,2));
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,instructions:visited.size,scripts:[...scripts],choiceEdges:edges.size},null,2));
if(report.errors.length)process.exitCode=1;
