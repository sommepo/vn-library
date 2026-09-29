// Static source control audit. Successful parsing is not reader admission.
import fs from 'node:fs/promises';
import path from 'node:path';
import {validateControl} from '../web/adapters/shibuya428-control.mjs';
const root=process.argv[2];
if(!root)throw Error('Usage: node scripts/audit-428-control.mjs PRIVATE_RECOVERY');
const recovery=JSON.parse(await fs.readFile(path.join(root,'recovery.json'),'utf8'));
const count=recovery.scenario?.scripts;
if(recovery.adapter!=='428-psp'||!Number.isInteger(count)||count<1||count>=255)throw Error('Expected bounded 428 recovery');
const scripts={};
for(let n=0;n<count;n++){
  const s=JSON.parse(await fs.readFile(path.join(root,'scripts',`${String(n).padStart(2,'0')}.json`),'utf8'));
  if(s.index!==n||!Array.isArray(s.tokens)||s.tokens.length>500000)throw Error('Invalid recovered script');
  scripts[n]=s;
}
const result={...validateControl(scripts),playable:false};
console.log(JSON.stringify(result,null,2));
process.exitCode=3; // Runtime is incomplete even if all statically checked targets resolve.
