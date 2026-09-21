// Generate private checkpoints by following real first-option choices from entry.
// Timing/media are simulated. This is not browser or all-route coverage.
import fs from 'node:fs/promises';import path from 'node:path';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const root=path.resolve(process.argv[2]||'private/library/clannad-live'),out=path.resolve(process.argv[3]||'private/clannad/menu-checkpoints');
await fs.mkdir(out,{recursive:true});const write=(name,value)=>fs.writeFile(path.join(out,name),JSON.stringify(value,null,2),{flag:'wx'});
const loadJSON=async u=>JSON.parse(await fs.readFile(path.join(root,u))),engine=await ClannadEngine.create(await loadJSON('content.json'),{loadJSON});
const report={kind:'source-reached-menu-checkpoints',timing:'simulated',segments:0,choices:0,portrait:null,end:null};let lastText;
await engine.run();
for(let n=0;n<100000;n++){
 const p=engine.current;
 if(p.kind==='end'){
  if(!lastText||!report.portrait)throw new Error('Required real checkpoints were not reached');
  await write('source-before-end.json',lastText);report.end={source:p.id,globals:engine.state.vars.G};break;
 }
 if(p.kind==='text'||p.presentation?.kind==='text')report.segments++;
 if(p.kind==='text'){
  lastText=engine.save();
  if(!report.portrait&&engine.state.scene.layers.length>=2&&engine.state.vars.F[1112]&&engine.state.date){
   report.portrait=p.id;await write('source-portrait.json',lastText);
  }
 }
 if(p.kind==='choice')report.choices++;
 await engine.advance(p.kind==='choice'?p.options[0].id:undefined);
}
if(!report.end)throw new Error('No ending reached within traversal limit');
await write('checkpoints.json',report);console.log(JSON.stringify(report));
