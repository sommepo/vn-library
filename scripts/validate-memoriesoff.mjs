import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateMemoriesOffContent} from '../web/adapters/memoriesoff-engine.mjs';
const supported=new Set([0,5,0x10,0x11,0x16,0x17,0x20,0x28,0x29,0x30,0x31,0x32,0x38,0x39,0x50,0x52,0x5d,0x5e,0x5f,0x60,0x61,0x62,0x68,0x6a,0x6b,0x6f,0x80,0x81,0x82,0x83,0x85,0x90]);
export async function validateDirectory(directory){
 const dir=path.resolve(directory),c=JSON.parse(await fs.readFile(path.join(dir,'content.json'))),errors=validateMemoriesOffContent(c),unsupported=[],unresolved=[],sourceTargets=[];
 let instructions=0,text=0,choices=0;
 for(const [id,a]of Object.entries(c.assets)){
  const target=path.resolve(dir,a.url);if(!target.startsWith(dir+path.sep)){errors.push(`Unsafe asset: ${id}`);continue;}
  try{const stat=await fs.lstat(target);if(!stat.isFile()||stat.isSymbolicLink())throw Error('not a regular file');const sha=createHash('sha256').update(await fs.readFile(target)).digest('hex');if(sha!==a.sha256)errors.push(`Asset hash mismatch: ${id}`);}catch(error){errors.push(`${id}: ${error.message}`);}
 }
 for(const [id,ref]of Object.entries(c.runtime.scripts)){
  const s=JSON.parse(await fs.readFile(path.join(dir,ref.url))),map=new Map(s.instructions.map(i=>[i.offset,i]));
  if(s.id!==id||s.sha256!==ref.sha256||map.size!==s.instructions.length)errors.push(`Invalid script identity/boundaries: ${id}`);
  let position=0;
  for(const i of s.instructions){
   instructions++;
   if(i.offset!==position||i.next<=i.offset||i.next>s.size||i.id!==`mo1:${id}:${i.offset.toString(16).padStart(4,'0')}`)errors.push(`Invalid instruction boundary: ${i.id}`);position=i.next;
   if(!supported.has(i.code))unsupported.push(i.id);
   if(i.code===0x10){text++;if(typeof i.text!=='string')errors.push(`Missing source text: ${i.id}`);}
   if(i.code===0x11){choices++;if(!i.options?.length||i.options.some(x=>typeof x!=='string'))errors.push(`Missing choices: ${i.id}`);}
   if([0x50,0x52].includes(i.code)&&!map.has(i.target))sourceTargets.push({id:i.id,target:i.target,eof:i.target===s.size});
   if([0x5d,0x5f].includes(i.code)&&!c.runtime.scripts[String(i.args[0])])unresolved.push({id:i.id,script:i.args[0]});
   const a=i.args;let asset;
   if([0x31,0x32].includes(i.code))asset=`background:${a[0]+a[1]*256}`;
   if(i.code===0x30)asset=`portrait:${a[2]+a[3]*256}`;
   if(i.code===0x85)asset=`voice:${a[1]+a[2]*256}`;
   if(i.code===0x80)asset=`music:${a[0]}`;
   if(i.code===0x82)asset=`sound:${a[0]}`;
   if(asset&&!c.assets[asset])unresolved.push({id:i.id,asset});
  }
  if(position!==s.size)errors.push(`Incomplete source script: ${id}`);
 }
 if(unsupported.length||unresolved.length)errors.push('Unsupported instructions or unresolved direct resources');
 return{scripts:Object.keys(c.runtime.scripts).length,instructions,text,choices,unsupported,unresolved,sourceTargets,errors,fullySupported:false};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const r=await validateDirectory(process.argv[2]);console.log(JSON.stringify(r,null,2));process.exitCode=r.errors.length?2:3;}
