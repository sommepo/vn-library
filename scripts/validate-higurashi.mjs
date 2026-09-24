import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {validateHigurashiContent} from '../web/adapters/higurashi-engine.mjs';
const implemented=new Set([0x41,0x46,0x47,0x48,0x49,0x4a,0x4d,0x4e,0x80,0x81,0x82,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8a,0x8b,0x8c,0x8d,0x8e,0x8f,0x90,0x91,0x93,0x94,0x95,0x97,0x98,0x9b,0x9c,0x9d,0x9f,0xa0,0xa1,0xa4,0xa8,0xac,0xad,0xae,0xaf,0xb0,0xb1,0xb3,0xb4,0xb5,0xb6,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xc0]);
export async function validateDirectory(root){
 const c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),p=JSON.parse(await fs.readFile(path.join(root,'program.json'))),errors=validateHigurashiContent(c),unsupported=[],unresolved=[];
 const locations=new Set(p.instructions.map(r=>r[0]));let textSegments=0,voiceReferences=0,ruby=0;
 const ref=(id,offset)=>{if(!c.assets[id]&&!c.runtime.missingSourceVoices?.some(v=>id==='voice:'+v))unresolved.push({offset,id});};
 for(const [offset,next,op,a,strings,parts]of p.instructions){
  if(!implemented.has(op))unsupported.push({offset,op});
  const targets=op===0x46?[a[3]]:[0x47,0x48].includes(op)?[a[0]]:op===0x4a?a.slice(2):[];
  for(const t of targets)if(!locations.has(t))errors.push(`Invalid target ${offset} -> ${t}`);
  for(const part of parts||[]){textSegments++;ruby+=part.text.filter(t=>t?.reading).length;if(part.voice){voiceReferences++;ref('voice:'+part.voice.toLowerCase(),offset);}}
  if(op===0xb9)ref('voice:'+strings[0].replace(/\0$/,'').toLowerCase(),offset);
  const i=[0x90,0x91].includes(op)?a[2]:op===0xa0?a[1]:a[0];
  const kind={144:'picture',145:'portrait',156:'music',160:'sound',177:'video'}[op];
  if(kind&&i<0x8000)ref(`${kind}:${i}`,offset);
 }
 // Checking every referenced file also catches interrupted installation.
 for(const [id,a]of Object.entries(c.assets))try{const file=path.resolve(root,a.url);if(!file.startsWith(path.resolve(root)+path.sep))throw Error('unsafe');await fs.access(file);}catch{errors.push('Missing/unsafe file '+id);}
 return {scripts:1,instructions:p.instructions.length,textSegments,voiceReferences,ruby,assets:Object.keys(c.assets).length,missingOnDisc:c.runtime.missingSourceVoices,unsupported,unresolved,errors,fullySupported:false,scope:'All parsed instructions and direct resources; native animations/timing remain incomplete.'};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const r=await validateDirectory(path.resolve(process.argv[2]));if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(r,null,2));console.log(JSON.stringify(r,null,2));process.exitCode=r.errors.length||r.unsupported.length||r.unresolved.length?2:3;}
