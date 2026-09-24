// Private test exploration: evaluate real choices, never assign story flags.
// Targets/choice preferences live in an owner-local configuration, not the reader.
import fs from 'node:fs/promises';
import path from 'node:path';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';
const dir=path.resolve(process.argv[2]),config=JSON.parse(await fs.readFile(process.argv[3])),out=path.resolve(process.argv[4]);
await fs.mkdir(out,{recursive:true});
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={};let id=0;
const loadJSON=async url=>cache[url]??=JSON.parse(await fs.readFile(path.join(dir,url)));
const options={loadJSON,makeId:()=>String(++id)};
const progress=config.progress?JSON.parse(await fs.readFile(config.progress)):undefined;
const e=await Ever17Engine.create(c,options),choices=[],readIds=new Set();let segments=0,ending,error;
const score=engine=>(engine.value(config.target)*100-engine.value(config.avoid||0)*30)+(engine.routeProgress().find(r=>r.id===config.id)?.complete?100000:0);
try{
  await e.startNew(progress);
  for(let n=0;n<150000;n++){
    const p=e.current;if(p.kind==='end'){ending=p.id;break;}
    if(p.kind==='text'){readIds.add(p.id);segments++;}
    let choice;
    if(p.kind==='choice'){
      const saved=e.save(),scores=[];
      for(const option of p.options){
        const trial=await Ever17Engine.create(c,options);await trial.restore(saved);await trial.advance(option.id);
        let steps=0;
        while(!['choice','end'].includes(trial.current.kind)&&steps++<30000)await trial.advance();
        if(steps>=30000)throw Error('Choice probe budget exceeded');
        scores.push({id:option.id,score:score(trial),target:trial.value(config.target),avoid:trial.value(config.avoid||0),destination:trial.current.id});
      }
      const preferred=config.choices?.[p.id];
      choice=preferred??scores.reduce((best,v)=>v.score>best.score?v:best).id;
      if(!p.options.some(o=>o.id===choice))throw Error('Configured choice is unavailable');
      choices.push({source:p.id,selected:choice,scores});console.log(JSON.stringify(choices.at(-1)));
    }
    await e.advance(choice);
  }
  if(!ending)throw Error('No ending within run budget');
}catch(e){error=e.stack;process.exitCode=1;}
const report={id:config.id,gameSignature:e.signature,progress,choices,readIds:[...readIds],segments,ending,error,cleared:e.routeProgress(),locals:e.state.vars.local,globals:e.state.vars.globalBits};
await fs.writeFile(path.join(out,'recipe.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(e.progressSnapshot(),null,2));
await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));
console.log(JSON.stringify({segments,ending,error,cleared:e.routeProgress(),target:e.value(config.target)},null,2));
