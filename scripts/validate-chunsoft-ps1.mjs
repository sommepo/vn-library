/* Private exact-edition admission report; never exports story text or recipes. */
import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {createEngine,validateReaderContent} from '../web/runtime.mjs';
export async function validateDirectory(directory){
 const root=path.resolve(directory),content=JSON.parse(await fs.readFile(path.join(root,'content.json'))),errors=await validateReaderContent(content),report={runtime:content.runtime?.id,assets:0,instructions:0,unsupported:[],textBoundaries:0,fullySupported:false,scripts:content.runtime?.id==='kamaitachi-ps1'?42:45};
 const read=async relative=>{const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep))throw Error('Resource outside import');return fs.readFile(file);};
 if(errors.length)return{errors,scriptValidation:report};
 for(const [id,a]of Object.entries(content.assets)){const bytes=await read(a.url);if(crypto.createHash('sha256').update(bytes).digest('hex')!==a.sha256)errors.push('Resource hash mismatch: '+id);report.assets++;}
 if(errors.length)return{errors,scriptValidation:report};
 const engine=await createEngine(content,{loadJSON:async p=>JSON.parse(await read(p)),loadBytes:async p=>new Uint8Array(await read(p))});
 if(content.runtime.id==='kamaitachi-ps1'){
  const control=new Set([0x3c,0x3d,0x3f,0x44,0x4e,0x5a]);const natives=new Set([0,1,3,4,7,0x12,0x1c,0x20,0x21,0x22,0x23,0x24,0x27,0x28,0x29,0x66,0x67,0x68,0x69,0x6a,0x6b,...engine.nativeNoops]);
  for(const ref of Object.values(content.runtime.scripts)){const script=JSON.parse(await read(ref.url));report.instructions+=script.commands.length;for(const c of script.commands)if(control.has(c.op)||(c.op===0x1d&&!natives.has(c.args[0])))report.unsupported.push({source:c.id,operation:c.op,native:c.op===0x1d?c.args[0]:undefined});}
 }
 let choices=0,movies=0;
 try{
  await engine.run();for(let steps=0;steps<4000&&report.textBoundaries<150;steps++){
   const p=engine.current;if(p.kind==='end')break;if(p.kind==='text')report.textBoundaries++;if(p.kind==='choice')choices++;if(p.kind==='movie')movies++;
   await engine.advance(p.kind==='choice'?'0':p.kind==='input'?Object.fromEntries(p.slots.map(s=>[s,'ああ'])):undefined);
  }
  if(report.textBoundaries!==150)errors.push('Opening replay did not reach 150 text boundaries');
 }catch(error){errors.push(error.message);}
 report.opening={text:report.textBoundaries,choices,movies,timing:'simulated',media:'asset resolution only'};
 errors.push('Chunsoft PS1 native presentation remains incomplete: animation, auxiliary menus and SPU synthesis; see docs/chunsoft-ps1-runtime.md');
 if(report.unsupported.length)errors.push(`${report.unsupported.length} auxiliary Kamaitachi control sites remain fail-closed`);
 return{errors,scriptValidation:report};
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){try{const r=await validateDirectory(process.argv[2]);console.log(JSON.stringify(r,null,2));process.exitCode=r.errors.length?3:0;}catch(error){console.log(JSON.stringify({errors:[error.message]}));process.exitCode=3;}}
