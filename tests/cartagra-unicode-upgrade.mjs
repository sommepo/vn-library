// Private real-disc save migration comparison. No original saves are bundled.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CartagraEngine} from '../web/adapters/cartagra-engine.mjs';
import {plainText} from '../web/engine.mjs';
const [oldRoot,newRoot,checkpoints,out]=process.argv.slice(2);
const load=async root=>{
 const c=JSON.parse(await fs.readFile(path.join(root,'content.json')));
 return CartagraEngine.create(c,{loadJSON:async p=>JSON.parse(await fs.readFile(path.join(root,p))),makeId:()=> 'comparison-occurrence'});
};
const report={checkpoints:[],checks:0,mediaTimingSimulated:true};
for(const name of ['dialogue-save.json','before-ending-save.json']){
 const save=JSON.parse(await fs.readFile(path.join(checkpoints,name)));
 const old=await load(oldRoot),updated=await load(newRoot);
 assert.equal(updated.signature,old.signature);
 await old.restore(save);await updated.restore(save);
 const clean=s=>{const c=structuredClone(s);if(c.pending)c.pending={kind:c.pending.kind,id:c.pending.id,occurrenceId:c.pending.occurrenceId};return c;};
 for(let n=0;n<100;n++){
  assert.deepEqual(clean(updated.state),clean(old.state));report.checks++;
  if(updated.current.kind==='text'){assert.ok(plainText(updated.current.text));assert.equal(updated.current.sourceGlyphs,undefined);}
  if(updated.current.kind==='end')break;
  const choice=updated.current.kind==='choice'?updated.current.options[0].id:undefined;
  await old.advance(choice);await updated.advance(choice);
 }
 report.checkpoints.push(name);
}
await fs.writeFile(out,JSON.stringify(report,null,2),{flag:'wx'});
console.log(JSON.stringify(report));
