// Private census: parser support, resources and Unicode availability are separate.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {validateCartagraContent} from '../web/adapters/cartagra-engine.mjs';
import {glyphRuns,decodeGlyphText,validateGlyphMap} from '../web/adapters/cartagra-font.mjs';
const supported=new Set([0xfe,0,1,4,5,0x33,6,7,8,10,11,12,13,14,15,16,17,18,19,20,21,24,0x8018,26,27,0x21,0x22,0x23,0x24,0x25,0x26,0x102,0x113,0x110,0x111,0x114,0x115,0x11e,0x1001,0x1003,0x1005,0x1002,0x1006,0x1016,0x1007,0x1028,0x1029,0x1022,0x102a]);
export async function validateDirectory(root){
 const c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),errors=validateCartagraContent(c),unsupported=[],unresolved=[],auxiliaryUnsupported=[];let instructions=0,strings=0;
 let map=null;const glyphs=new Set();let rubyGroups=0;
 if(c.runtime.textMode==='reviewed-unicode')try{map=validateGlyphMap(JSON.parse(await fs.readFile(path.join(root,c.assets.glyphMap.url))),c.runtime.font_sha256);}catch(e){errors.push(e.message);}
 const literal=x=>Array.isArray(x)&&x.length===1&&Number.isInteger(x[0].value)?x[0].value:null;
 for(const [name,ref]of Object.entries(c.runtime.scripts)){
  const s=JSON.parse(await fs.readFile(path.join(root,ref.url))),aux=['Startup.scr','system.scr'].includes(name);
  if(s.source!==name||s.sha256!==ref.sha256||s.format!=='vnkit.cartagra-sc3')errors.push(`${name}: identity mismatch`);
  (aux?auxiliaryUnsupported:unsupported).push(...s.errors.map(e=>({script:name,...e})));
  for(const t of s.strings){strings++;try{glyphRuns(t.tokens);if(map)decodeGlyphText(t.tokens,map,`${name}:${t.offset}`);for(const token of t.tokens){if(token.glyph!=null)glyphs.add(token.glyph);if(token.control===9)rubyGroups++;}}catch(e){errors.push(`${name}:${t.offset}: ${e.message}`);}}
  for(const i of Object.values(s.instructions)){
   instructions++;
   if(!supported.has(i.op))(aux?auxiliaryUnsupported:unsupported).push({id:i.id,op:i.op});
   const refs=[];
   if(i.op===0x110&&i.args[0])refs.push(`voice:${i.args[1]}`);
   for(const [op,operand,kind]of [[0x21,0,'music'],[0x23,1,'sound'],[0x113,0,'video'],[0x1001,1,'bg'],[0x1005,1,'portrait']]){
    if(i.op===op){const v=literal(i.args[operand]);if(v!==null)refs.push(`${kind}:${v}`);}
   }
   for(const asset of refs)if(!c.assets[asset])(aux?auxiliaryUnsupported:unresolved).push({id:i.id,asset});
  }
 }
 for(const [id,a]of Object.entries(c.assets))try{await fs.access(path.join(root,a.url));}catch{errors.push(`Missing asset ${id}`);}
 return {scripts:Object.keys(c.runtime.scripts).length,instructions,strings,usedGlyphs:glyphs.size,rubyGroups,unsupported,auxiliaryUnsupported,unresolved,errors,fullySupported:false,unicodeVerified:!!map&&!errors.length,scope:'Static sites and direct resources only. Unicode checks font-bound review coverage, not independent proofreading. Dynamic references also checked at execution.'};
}
if(import.meta.url===pathToFileURL(process.argv[1]).href){const r=await validateDirectory(path.resolve(process.argv[2]));if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(r,null,2),{flag:'wx'});console.log(JSON.stringify(r,null,2));process.exitCode=r.errors.length||r.unsupported.length||r.unresolved.length?2:3;}
