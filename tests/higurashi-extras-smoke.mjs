// Source-earned campaign flags unlock the original six after-party entries.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';
const [root,campaign,out]=process.argv.slice(2),c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),p=JSON.parse(await fs.readFile(path.join(root,'program.json'))),earned=JSON.parse(await fs.readFile(campaign)).system,e=await HigurashiEngine.create(c,{loadJSON:async()=>p}),fresh=structuredClone(e.state),results=[];
e.state.system=structuredClone(earned);const entries=e.newGameEntries().filter(x=>x.id.startsWith('extra:'));assert.equal(entries.length,6);
for(const item of entries){e.state=structuredClone(fresh);e.state.system=structuredClone(earned);await e.startNew(e.progressSnapshot(),item.id);let texts=0;
 for(let n=0;n<5000&&e.current.kind!=='end';n++){if(e.current.kind==='text')texts++;e.sceneOverlays();await e.advance(e.current.kind==='choice'?e.current.options[0].id:undefined);}
 assert.equal(e.current.kind,'end');results.push({entry:item.id,texts,title:e.state.title});
}
await fs.writeFile(out,JSON.stringify(results,null,2));console.log('PASS six earned extras',results.reduce((n,r)=>n+r.texts,0),'segments');
