import {readFile,writeFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {validateClannadScripts} from '../web/adapters/clannad-validation.mjs';
export async function validateDirectory(directory){
 const root=await realpath(directory);
 const load=async url=>{
  if(typeof url!=='string'||isAbsolute(url)||url.split(/[\\/]/).includes('..'))throw new Error('Unsafe resource path');
  const path=await realpath(resolve(root,url)),within=relative(root,path);
  if(within==='..'||within.startsWith('..'+sep)||isAbsolute(within))throw new Error('Escaped import directory');
  return JSON.parse(await readFile(path,'utf8'));
 };
 return validateClannadScripts(await load('content.json'),load);
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){
 try{
  const report=await validateDirectory(process.argv[2]);
  if(process.argv[3])await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const {unsupported,references,...summary}=report;
  console.log(JSON.stringify({...summary,unsupportedCount:unsupported.length,unsupportedByOpcode:unsupported.reduce((a,i)=>(a[i.op]=(a[i.op]||0)+1,a),{}),references:{checked:references.checked,unavailable:references.unavailable.length}},null,2));
  process.exitCode=report.fullySupported?0:3;
 }catch(error){console.error(error.message);process.exitCode=2;}
}
