// Whole-import census. Actual story execution is measured separately.
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {validateNever7Content,Never7Engine} from '../web/adapters/never7-engine.mjs';
import {evaluateNever7Predicate} from '../web/adapters/never7-predicate.mjs';
import {validateReadPaths} from '../web/adapters/never7-read-paths.mjs';
export async function validateDirectory(directory){
 const root=path.resolve(directory),read=async file=>JSON.parse(await fs.readFile(path.join(root,file))),c=await read('content.json'),native=await read(c.runtime.predicate);
 const report={scripts:0,parsed:0,storyScripts:0,creditsScripts:0,creditsInstructions:0,instructions:0,textSegments:0,conditions:0,conditionEvaluations:0,fullySupported:false,unsupported:[],unresolved:[],errors:[],assets:Object.keys(c.assets).length};
 report.errors.push(...validateNever7Content(c));const trace={instructions:new Set(),variables:new Set()},refs=Object.values(c.runtime.scripts);
 const parser=new Never7Engine(c),textIds=new Set(),endingIds=new Set();
 const resource=(i,id)=>{if(!c.assets[id])report.unresolved.push({source:i.id,asset:id});};
 for(const [name,ref]of Object.entries(c.runtime.scripts)){
  const s=await read(ref.url);report.scripts++;if(!s.errors.length)report.parsed++;
  if(s.sha256!==ref.sha256||s.address!==ref.address||s.overlay!==ref.overlay)report.errors.push(`${name}: reference identity differs`);
  if(s.kind==='mend-credits'){
   report.creditsScripts++;report.creditsInstructions+=Object.keys(s.instructions).length;
   report.unsupported.push(...s.errors);
   if(!Object.values(native.creditsPrograms||{}).includes(name))report.errors.push(`${name}: credits program not selected by native mendInit`);
   continue;
  }
  report.storyScripts++;
  for(const i of Object.values(s.instructions)){
   report.instructions++;if(i.unsupported){report.unsupported.push(i.unsupported);continue;}
   const w=i.words;
   if(typeof i.text==='string')try{parser.message(i,false);}catch(error){report.errors.push(error.message);}
   if(i.code===undefined){report.textSegments++;textIds.add(i.id);continue;}
   if(i.code===0x68)endingIds.add(i.id);
   if([2,3,4,0x15].includes(i.code))resource(i,`background:${w[1]}`);
   if([7,8,0x11].includes(i.code))resource(i,`portrait:${w[1]}`);
   if(i.code===0x11)resource(i,`portrait:${w[3]}`);
   if(i.code===0x12)resource(i,`voice:${w[2]}`);
   if(i.code===0x19)resource(i,`music:${w[1]}`);
   if([0x2f,0x30].includes(i.code))resource(i,`${w[1]>>>16===0x982?'music':'sound'}:${w[1]}`);
   if([0x41,0x98].includes(i.code))resource(i,`video:${w[1]}`);
   if(i.code===0x68&&w[1]>>>16&&!native.creditsPrograms?.[w[1]>>>16])report.unresolved.push({source:i.id,creditsProgram:w[1]>>>16});
   if([0x17,0x7a].includes(i.code)&&!refs.some(r=>r.address===w[1]&&r.overlay===w[2]))report.unresolved.push({source:i.id,scriptAddress:w[1],overlay:w[2]});
   if([0x0e,0x10,0x33,0x7b].includes(i.code)){
    const label=w[i.code===0x0e?2:1],from=i.code===0x10?0:i.offset;
    if(!s.labels[label]?.some(pc=>pc>=from+2))report.unresolved.push({source:i.id,label});
   }
   if(i.code===0x0e){report.conditions++;
    for(const value of [-32768,-1,0,1,2,3,7,15,32767]){
     const vars=Object.fromEntries(Array.from({length:768},(_,n)=>[n,value]));
     try{evaluateNever7Predicate(native,{overlay:s.overlay,address:s.address,selector:w[1],vars},trace);report.conditionEvaluations++;}
     catch(error){report.errors.push(`${i.id}: ${error.message}`);}
    }
   }
  }
 }
 for(const entry of native.appendEntries||[]){
  if(!c.runtime.scripts[entry.script]||!entry.requires.every(n=>native.persistentVariables.includes(n)))report.errors.push(`Invalid Append entry ${entry.id}`);
 }
 report.appendEntries=native.appendEntries?.length||0;
 report.readPaths={present:false};
 try{
  const data=await read('read-paths.json'),paths=validateReadPaths(data,parser),union=new Set();
  for(const [route,ids]of Object.entries(paths)){
   if(!endingIds.has(data.paths[route].ending))report.errors.push(`Read path ${route}: absent source ending`);
   for(const id of ids){union.add(id);if(!textIds.has(id))report.errors.push(`Read path ${route}: not a source text site: ${id}`);}
  }
  report.readPaths={present:true,routes:Object.fromEntries(Object.entries(paths).map(([id,ids])=>[id,ids.size])),uniqueSegments:union.size};
 }catch(error){if(error.code!=='ENOENT')report.errors.push(`Completed-route read paths: ${error.message}`);}
 for(const [id,a]of Object.entries(c.assets)){
  const file=path.resolve(root,a.url);if(!file.startsWith(root+path.sep)){report.errors.push(`Unsafe asset ${id}`);continue;}
  try{if(!(await fs.stat(file)).isFile())throw Error();}catch{report.errors.push(`Missing asset file ${id}`);}
 }
 report.nativeConditionInstructionSites=trace.instructions.size;report.nativeConditionVariables=[...trace.variables].sort((a,b)=>a-b);
 const parsed=await read('parse-report.json');
 if(parsed.native_entries){const failed=new Set(report.unsupported.map(e=>e.split(':')[0]));report.nativeEntries=parsed.native_entries.length;report.nativeEntryParseFailures=parsed.native_entries.filter(e=>failed.has(e.symbol));report.unmappedNativeIndexEntries=parsed.native_entries.filter(e=>!e.symbol);}
 report.warnings=(await read('compatibility.json')).warnings;
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 try{const report=await validateDirectory(process.argv[2]);if(process.argv[3])await fs.writeFile(process.argv[3],JSON.stringify(report,null,2));console.log(JSON.stringify({...report,unsupported:report.unsupported.length,unresolved:report.unresolved.length,errors:report.errors.slice(0,10)},null,2));process.exitCode=3;}
 catch(error){console.error(error.stack);process.exitCode=2;}
}
