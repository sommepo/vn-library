import fs from 'node:fs';
import path from 'node:path';
import {validateReaderContent} from '../web/runtime.mjs';
try {
  const content = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const errors = await validateReaderContent(content);
  let scriptValidation;
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
