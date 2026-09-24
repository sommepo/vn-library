// Every source TIPS entry, including entries with no text. Media is simulated.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {HigurashiEngine} from '../web/adapters/higurashi-engine.mjs';
const [root,out]=process.argv.slice(2),c=JSON.parse(await fs.readFile(path.join(root,'content.json'))),p=JSON.parse(await fs.readFile(path.join(root,'program.json'))),e=await HigurashiEngine.create(c,{loadJSON:async()=>p}),fresh=structuredClone(e.state),report=[];
for(let id=0;id<p.tips.length;id++){
 e.state=structuredClone(fresh);e.state.tips[id]=1;await e.startNew(e.progressSnapshot(),'tip:'+id);let texts=0,ended=false;
 for(let n=0;n<10000;n++){const b=e.current;e.sceneOverlays();if(b.kind==='end'){ended=true;break;}if(b.kind==='text')texts++;if(b.kind==='choice')await e.advance(b.auxiliary?'continue':b.options[0].id);else await e.advance();}
 assert.ok(ended,'TIPS '+id);report.push({id,entry:p.tips[id].entry,texts});
}
await fs.writeFile(out,JSON.stringify({entries:report.length,textSegments:report.reduce((n,r)=>n+r.texts,0),report},null,2));console.log('PASS',report.length,'TIPS entries');
