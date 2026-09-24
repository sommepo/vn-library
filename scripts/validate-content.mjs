import fs from 'node:fs';
import path from 'node:path';
import {validateReaderContent} from '../web/runtime.mjs';
try {
  const content = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const errors = await validateReaderContent(content);
  let scriptValidation;
  if(content.runtime?.id==='higurashi-ps2-shin'){
    const {validateDirectory}=await import('./validate-higurashi.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    errors.push(`Higurashi native presentation remains incomplete: ${scriptValidation.unsupported.length} unsupported story sites; ${scriptValidation.unresolved.length} unresolved references. See its runtime report.`);
  }
  if(content.runtime?.id==='cartagra-ps2-sc3'){
    const {validateDirectory}=await import('./validate-cartagra.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    if(!scriptValidation.unicodeVerified)errors.push('Cartagra requires the font-bound reviewed Unicode map.');
    for(const site of scriptValidation.unsupported){
      if(site.id!=='macrosys.scr:00004a35'||site.op!==0x120)errors.push(`Cartagra unexpected unsupported story site: ${JSON.stringify(site)}`);
    }
    errors.push(`Cartagra native presentation remains incomplete: ${scriptValidation.unsupported.length} unsupported story sites, ${scriptValidation.unresolved.length} unresolved direct resources, ${scriptValidation.auxiliaryUnsupported.length} unsupported auxiliary sites. The known framebuffer capture and native menus remain fail-closed. See its runtime report.`);
  }
  if(content.runtime?.id==='ever17-ps2-kid'){
    const {validateDirectory}=await import('./validate-ever17.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    errors.push(`Ever17 native presentation remains incomplete: ${scriptValidation.unsupported.length} unsupported story sites; ${scriptValidation.unresolved.length} unresolved references. See its runtime report.`);
  }
  if(content.runtime?.id==='never7-ps2-oscr'){
    const {validateDirectory}=await import('./validate-never7.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    errors.push(`Never7 experimental runtime remains incomplete: ${scriptValidation.unsupported.length} unparsed table sites; ${scriptValidation.unresolved.length} unresolved references. See its runtime report.`);
  }
  if(content.runtime?.id==='clannad-ps2-hunex'){
    const {validateDirectory}=await import('./validate-clannad.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    if(!scriptValidation.fullySupported)errors.push(`CLANNAD import is incomplete: ${scriptValidation.unsupported.length} unsupported command sites, ${scriptValidation.references.unavailable.length} unresolved direct references; presentation degradations remain. See scripts/validate-clannad.mjs for the full private census.`);
  }
  if(content.runtime?.id==='remember11-ps2-kid'){
    const {validateDirectory}=await import('./validate-remember11.mjs');
    scriptValidation=await validateDirectory(path.dirname(path.resolve(process.argv[2])));
    errors.push(...scriptValidation.errors);
    errors.push(`Remember11 basic runtime remains incomplete: ${scriptValidation.unsupported.length} unsupported auxiliary/debug command sites; ${scriptValidation.unresolved.length} unresolved direct assets. See its runtime report.`);
  }
  console.log(JSON.stringify({errors,...(scriptValidation?{scriptValidation:{scripts:scriptValidation.scripts,instructions:scriptValidation.instructions,parsed:scriptValidation.parsed,fullySupported:scriptValidation.fullySupported,unsupported:scriptValidation.unsupported.length,unresolvedReferences:scriptValidation.references?.unavailable.length??scriptValidation.unresolved?.length}}:{})}));
  process.exitCode = errors.length ? 3 : 0;
} catch (error) {
  console.log(JSON.stringify({errors: [error.message]}));
  process.exitCode = 2;
}
