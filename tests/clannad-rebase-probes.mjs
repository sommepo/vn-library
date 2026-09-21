// Rebase private development checkpoints only when their source and assets match.
// Reader save validation stays strict; this does not bypass incompatible imports.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
const [probeFile,root,input,out]=process.argv.slice(2);if(!out)throw new Error('Usage: node tests/clannad-rebase-probes.mjs PROBE_CONTENT IMPORT INPUT_CHECKPOINTS NEW_OUTPUT');
const probe=JSON.parse(await fs.readFile(probeFile)),content=JSON.parse(await fs.readFile(path.join(root,'content.json')));
assert.equal(probe.id,content.id);assert.deepEqual(probe.runtime,content.runtime);assert.deepEqual(probe.nativeData,content.nativeData);assert.deepEqual(probe.assets,content.assets);
const cache={},loadJSON=async u=>cache[u]??=JSON.parse(await fs.readFile(path.join(root,u)));
const old=await ClannadEngine.create(probe,{loadJSON}),next=await ClannadEngine.create(content,{loadJSON});await fs.mkdir(out,{recursive:true});const files=[];
for(const file of await fs.readdir(input)){if(!file.endsWith('.json'))continue;const save=JSON.parse(await fs.readFile(path.join(input,file)));if(save.format!=='vnkit.save')continue;
 await old.restore(save);save.gameSignature=next.signature;await next.restore(save);await fs.writeFile(path.join(out,file),JSON.stringify(save,null,2),{flag:'wx'});files.push(file);
}
await fs.writeFile(path.join(out,'rebase.json'),JSON.stringify({source:probeFile,oldSignature:old.signature,newSignature:next.signature,policy:'Strict deep equality of runtime, native metadata and all asset mappings; original checkpoints preserved',files},null,2),{flag:'wx'});console.log({files:files.length,oldSignature:old.signature,newSignature:next.signature});
