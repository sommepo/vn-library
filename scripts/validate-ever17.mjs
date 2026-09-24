// Full private source census. Route replay and browser coverage are separate.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateEver17Content} from '../web/adapters/ever17-engine.mjs';
const basic=new Set([0,1,2,3,4,5,6,7,8,9,10,11,12,15,16,17,18,19,20,21,22,23,25,26,28,29,30,31,37,44,46,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,78,79,83,84,85,86,96,97,98,99,100,101,102,103,104,105,109,110,111,112,113,114,115,116,127,129,130,131,132,133,134]);
const variant=new Set([1,13,59,63,64,65,66,71,76,107,108,109]);
export async function validateDirectory(dir){
  const c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),errors=validateEver17Content(c);
  const unsupported=[],auxiliaryUnsupported=[],unresolved=[],ops={};let instructions=0,storyInstructions=0;
  for(const [name,ref] of Object.entries(c.runtime.scripts)){
    const s=JSON.parse(await fs.readFile(path.join(dir,ref.url))),resource=Number(name.slice(0,5));
    const story=resource<82&&![39,40].includes(resource);
    if(s.format!=='vnkit.ever17-script'||s.source!==name||s.sha256!==ref.sha256)errors.push(`${name}: script identity mismatch`);
    if(story)errors.push(...s.errors);
    for(const i of Object.values(s.instructions)){
      instructions++;if(story)storyInstructions++;
      ops[i.name||'unparsed']=(ops[i.name||'unparsed']||0)+1;
      if(i.unsupported||!variant.has(i.sourceOp)&&!basic.has(i.op)||i.op===9&&![0,1,2,3,4,5,6,7,12,13,15,16,17,18,19,20].includes(i.sub))
        (story?unsupported:auxiliaryUnsupported).push({id:i.id,command:i.name,sub:i.sub,reason:i.unsupported});
      const refs=[];
      if([31,115].includes(i.op)&&i.voice<65534)refs.push(`voice:${i.voice}`);
      for(const raw of i.graphics||[]){const id=raw[4]+raw[5]*256;if(id!==65535)refs.push(`image:${id}`);}
      if([96,130].includes(i.op))refs.push(`video:${i.sub}`);
      if(i.op===15){
        const resource=i.words[1],category=resource>>12;
        if(i.sub===1)refs.push(`voice:${resource}`);
        else if(category===4)refs.push(`music:${resource}`);
        else if(category===5)refs.push(`sound:${resource&4095}`);
        else if(category===0&&story&&!c.runtime.byResource[resource])unresolved.push({source:i.id,script:resource});
      }
      for(const id of refs)if(!c.assets[id])unresolved.push({source:i.id,asset:id,story});
      for(const target of i.targets||[])if(!s.instructions[target]||s.instructions[target].unsupported){
        if(story)errors.push(`${i.id}: unresolved source branch ${target}`);
      }
    }
  }
  for(const [id,a]of Object.entries(c.assets))try{await fs.access(path.join(dir,a.url));}catch{errors.push(`Missing asset ${id}`);}
  return {scripts:Object.keys(c.runtime.scripts).length,instructions,storyInstructions,ops,unsupported,auxiliaryUnsupported,unresolved,errors,fullySupported:false,
    scope:'All discovered script sites and direct resources. Native credits/animation, extras and original-console comparison remain separate.'};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const r=await validateDirectory(path.resolve(process.argv[2]));
  if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(r,null,2));
  console.log(JSON.stringify(r,null,2));process.exitCode=r.errors.length||r.unsupported.length||r.unresolved.length?2:3;
}
