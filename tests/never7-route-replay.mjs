// Replay a private choice recipe from native entry; never set route variables.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';

const [input, recipeFile, destination, progressFile] = process.argv.slice(2);
if (!input || !recipeFile || !destination) throw Error('Usage: IMPORT PRIVATE_RECIPE NEW_OUTPUT [EARNED_PROGRESS]');
const dir=path.resolve(input),out=path.resolve(destination);
await fs.mkdir(out,{recursive:false});
const content=JSON.parse(await fs.readFile(path.join(dir,'content.json')));
const recipe=JSON.parse(await fs.readFile(recipeFile)),cache={};
const loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(dir,u)));
let serial=0;
const coveredScripts=new Set(),coveredText=new Set();
const options={loadJSON,makeId:()=>String(++serial),onInstruction:(i,s)=>{coveredScripts.add(s.script);if(i.code===undefined)coveredText.add(i.id);}};
const e=await Never7Engine.create(content,options);
const progress=progressFile?JSON.parse(await fs.readFile(progressFile)):undefined;
const report={recipe:path.resolve(recipeFile),entry:recipe.entry||'start',segments:0,choices:[],restores:0,ending:null,errors:[]};
const normalize=state=>{const s=structuredClone(state);if(s.pending)delete s.pending.occurrenceId;return s;};
let lastText,beforeClear;
try {
  if(recipe.entry&&recipe.entry!=='start') await e.startNew(progress,recipe.entry);
  else {e.applyProgress(progress);await e.run();}
  for(let steps=0;steps<120000;steps++){
    const p=e.current;
    if(p.kind==='end') {report.ending=p.id;break;}
    if(p.kind==='text'){report.segments++;lastText=e.save();}
    let choice,restored;
    if(p.kind==='choice') {
      const wanted=recipe.choices[report.choices.length];
      const selection=typeof wanted==='number'?wanted-1:wanted?.option;
      report.choices.push({source:p.id,options:p.options.map(x=>x.text),option:selection,vars:structuredClone(e.state.vars)});
      await fs.writeFile(path.join(out,`choice-${report.choices.length}.json`),JSON.stringify(e.save()));
      if(wanted?.source)assert.equal(p.id,wanted.source,'Recipe source changed');
      if(!Number.isInteger(selection)||!p.options[selection])throw Error(`Recipe missing/invalid at choice ${report.choices.length}: ${p.id}`);
      choice=p.options[selection].id;
    }
    if(p.kind==='choice'||p.kind==='text'&&report.segments%100===0){
      restored=await Never7Engine.create(content,options);await restored.restore(e.save());
      assert.deepEqual(restored.state,e.state);report.restores++;
    }
    const before=e.save();await e.advance(choice);
    if(!beforeClear&&[21,22,23,24,49,50,70,77,90,91].some(n=>e.state.globals[n]&&!before.state.globals[n]))beforeClear=before;
    if(restored){await restored.advance(choice);assert.deepEqual(normalize(restored.state),normalize(e.state));}
  }
  assert.ok(report.ending,'No ending reached within the replay budget');
  if(recipe.ending)assert.equal(report.ending,recipe.ending,'Unexpected ending');
  if(!recipe.allowExtra)assert.equal(report.choices.length,recipe.choices.length,'Unused recipe choices');
  for(const flag of recipe.earned||[])assert.equal(e.state.globals[flag],true,`Missing earned flag ${flag}`);
  for(const flag of recipe.absent||[])assert.ok(!e.state.globals[flag],`Unexpected completion flag ${flag}`);
}catch(error){report.errors.push(error.stack);process.exitCode=1;}
report.globals=e.state.globals;report.warnings=e.state.warnings;
report.scripts=[...coveredScripts].sort();report.uniqueSegments=coveredText.size;
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
await fs.writeFile(path.join(out,'checkpoint.json'),JSON.stringify(e.save()));
await fs.writeFile(path.join(out,'progress.json'),JSON.stringify(e.progressSnapshot()));
if(beforeClear)await fs.writeFile(path.join(out,'before-clear.json'),JSON.stringify(beforeClear));
if(lastText)await fs.writeFile(path.join(out,'before-end.json'),JSON.stringify(lastText));
console.log(JSON.stringify({...report,choices:report.choices.length,warnings:report.warnings.length},null,2));
