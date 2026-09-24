// Replays private source-ID recipes with earned progress between complete runs.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';
const dir=path.resolve(process.argv[2]),plan=JSON.parse(await fs.readFile(process.argv[3])),out=path.resolve(process.argv[4]);
await fs.mkdir(out,{recursive:true});
const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),cache={},allSites=new Set(),allTexts=new Set(),allScripts=new Set();
const loadJSON=async url=>cache[url]??=JSON.parse(await fs.readFile(path.join(dir,url)));
const report={format:'vnkit.ever17-route-suite',version:1,timing:'simulated',routes:[],errors:[]};
let progress=plan.progress?JSON.parse(await fs.readFile(plan.progress)):undefined,id=0;
const opts={loadJSON,makeId:()=>String(++id)};
for(const route of plan.routes){
  const recipe=JSON.parse(await fs.readFile(route.recipe)),before=structuredClone(progress),texts=new Set(),sites=new Set(),scripts=new Set(),choices=[];
  const e=await Ever17Engine.create(c,{...opts,onInstruction:(i,s)=>{sites.add(i.id);scripts.add(s.script);}});
  let segments=0,index=0,restores=0,movies=0,ending;
  try{
    await e.startNew(progress);
    for(let n=0;n<150000;n++){
      const p=e.current;
      if(p.kind==='end'){ending=p.id;break;}
      if(p.kind==='text'){segments++;texts.add(p.id);}
      if(p.kind==='text'&&segments===recipe.segments-2){
        await fs.writeFile(path.join(out,`${route.id}-near-end.json`),JSON.stringify(e.save()));
        await fs.writeFile(path.join(out,`${route.id}-near-end-progress.json`),JSON.stringify(e.progressSnapshot()));
      }
      if(p.kind==='movie'){
        movies++;await fs.writeFile(path.join(out,`${route.id}-movie-${movies}.json`),JSON.stringify(e.save()));
      }
      let choice;
      if(p.kind==='choice'){
        const expected=recipe.choices[index++];assert.equal(p.id,expected?.source,'Recipe diverged at choice');choice=expected.selected;
        choices.push({source:p.id,selected:choice});
      }
      if(p.kind==='choice'||p.kind==='text'&&segments%1000===0){
        const saved=e.save(),r=await Ever17Engine.create(c,opts);await r.restore(saved);assert.deepEqual(r.state,e.state);
        await r.advance(choice);await e.advance(choice);
        const a=structuredClone(e.state),b=structuredClone(r.state);if(a.pending)delete a.pending.occurrenceId;if(b.pending)delete b.pending.occurrenceId;
        assert.deepEqual(a,b,'Subsequent execution differs after restore');restores++;
        const after=await Ever17Engine.create(c,opts);await after.restore(e.save());assert.deepEqual(after.state,e.state);restores++;
      }else await e.advance(choice);
    }
    assert.ok(ending,'No ending within run budget');assert.equal(index,recipe.choices.length);
    for(const bit of route.requiredBits||[])assert.equal(e.value(0x8000+bit),1,`Missing earned flag ${bit}`);
    for(const bit of route.absentBits||[])assert.equal(e.value(0x8000+bit),0,`Unexpected flag ${bit}`);
    progress=e.progressSnapshot();
    for(const x of sites)allSites.add(x);for(const x of texts)allTexts.add(x);for(const x of scripts)allScripts.add(x);
    const result={id:route.id,segments,choices:index,ending,restores,movies,sourceSites:sites.size,scripts:[...scripts],cleared:e.routeProgress(),gate:e.value(0x803b)};
    report.routes.push(result);console.log(JSON.stringify(result));
    await fs.writeFile(path.join(out,route.id+'-progress.json'),JSON.stringify(progress,null,2));
    await fs.writeFile(path.join(out,route.id+'-recipe.json'),JSON.stringify({gameSignature:e.signature,progress:before,choices,readIds:[...texts],ending},null,2));
    await fs.writeFile(path.join(out,route.id+'-end.json'),JSON.stringify(e.save()));
  }catch(error){report.errors.push({route:route.id,segments,error:error.stack});console.error(error.stack);process.exitCode=1;break;}
}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,sourceSites:allSites.size,textSegments:allTexts.size,scripts:[...allScripts]},null,2));
