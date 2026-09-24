// Real reached CLANNAD checkpoint; disposable profiles and database only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vnkit-copy-'));
const name=process.env.VNKIT_BROWSER||'chromium',out=path.join(root,'private/browser-tests/save-copy',name);
await fs.mkdir(out,{recursive:true});
const game='clannad-slpm66302-1.01',checkpoint=JSON.parse(await fs.readFile(path.join(root,'private/clannad/menu-audit/checkpoints-final/source-portrait.json'),'utf8'));
let server,browser;const checks=[],errors=[];
const pass=label=>{checks.push(label);console.log('PASS '+label);};
const local=(page,key)=>page.evaluate(async key=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();try{return await s.get(key);}finally{s.db.close();}},`${game}:${key}`);
const put=async(page,records)=>page.evaluate(async({game,records})=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();for(const[name,value]of Object.entries(records))await s.put(`${game}:${name}`,value);s.db.close();},{game,records});
try{
 server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(tmp,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',n=>reject(Error(`server ${n}`)));});
 const base=`http://127.0.0.1:${port}`,bank=async()=>await(await fetch(`${base}/api/saves/${game}`)).json();
 const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));browser=await api[name].launch({headless:true});
 const a=await browser.newPage({viewport:{width:1280,height:800}}),b=await browser.newPage();
 for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('.console-title').first().waitFor();}
 const titles=a.locator('.console-title > summary');assert.equal(await titles.count(),6);assert.equal(await a.locator('.console-title[open],.platform-navigation').count(),0);
 assert.doesNotMatch(await a.locator('.console-catalogue').textContent(),/VISUAL NOVEL|PC-98/);
 let boxes=await titles.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};}));
 assert.ok(boxes.at(-1).bottom-boxes[0].top<400);assert.ok(boxes.every(b=>b.height>=44));
 await a.screenshot({path:path.join(out,'library-desktop.png')});
 await titles.first().focus();await a.keyboard.press('ArrowDown');assert.equal(await titles.nth(1).evaluate(n=>n===document.activeElement),true);
 await a.setViewportSize({width:390,height:844});await a.screenshot({path:path.join(out,'library-mobile.png')});
 assert.equal(await a.locator('#panel').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
 pass('Six compact collapsed titles, keyboard navigation, mobile bounds, no PC-98 controls');
 await a.setViewportSize({width:1280,height:800});
 const openLocation=async page=>{const card=page.locator('.game-card').filter({hasText:'CLANNAD'});await card.locator('summary').first().click();await card.getByRole('button',{name:'Save location',exact:true}).click();await page.getByRole('button',{name:'Replace shared saves with local',exact:true}).waitFor();};
 await put(a,{'slot 1':checkpoint,autosave:checkpoint});
 await put(b,{'slot 15':checkpoint});
 await openLocation(a);
 const copy=async(page,destination,accept=true)=>{
  const answered=new Promise(resolve=>page.once('dialog',async d=>{assert.match(d.message(),/route progress/);if(accept)await d.accept();else await d.dismiss();resolve();}));
  await page.getByRole('button',{name:`Replace ${destination} saves with ${destination==='local'?'shared':'local'}`,exact:true}).click();await answered;
  if(accept)await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled&& !document.querySelector('#panel').open,null,{timeout:60000});
 };
 await copy(a,'shared',false);assert.equal((await bank()).revision,0);assert.equal(await local(a,'before-copy-shared'),undefined);
 await copy(a,'shared');assert.deepEqual((await bank()).records['slot 1'],checkpoint);assert.equal((await local(a,'slot 1')).state.pc,checkpoint.state.pc);
 const source=await bank();await a.goto(base);await a.locator('.console-title').first().waitFor();
 pass('Cancel makes no copy; local → shared copies an actual save and resumes it');
 await openLocation(b);await copy(b,'local');
 assert.deepEqual(await local(b,'slot 1'),checkpoint);assert.equal(await local(b,'slot 15'),undefined);
 assert.deepEqual((await local(b,'before-copy-local')).records['slot 15'],checkpoint);
 assert.deepEqual(await bank(),source);
 assert.equal((await local(b,'activity')).sessions.reduce((n,s)=>n+s.characters,0),0);
 pass('Shared → local removes absent slots, keeps a destination backup, preserves server and does not recount restored text');
 // Exercise real IndexedDB CAS and rollback independent of UI leases.
 await b.goto(base);await b.locator('.console-title').first().waitFor();
 const transaction=await b.evaluate(async game=>{
  const{Store}=await import('/storage.mjs');const s=new Store();await s.open();
  try{
   const key=game+':slot 1',old=await s.get(key);await s.put(game+':copy-test','keep');
   let conflict='';try{await s.replaceRecords([key],{[key]:undefined},{},game+':test-backup',{});}catch(e){conflict=e.message;}
   const unchanged=JSON.stringify(old)===JSON.stringify(await s.get(key));
   let quota='';try{await s.replaceRecords([key],{[key]:old},{},game+':test-backup',()=>{});}catch(e){quota=e.name;}
   return{conflict,unchanged,failedBackup:await s.get(game+':test-backup'),stillThere:!!await s.get(key),quota};
  }finally{s.db.close();}
 },game);
 assert.match(transaction.conflict,/changed/);assert.equal(transaction.unchanged,true);assert.equal(transaction.failedBackup,undefined);assert.equal(transaction.stillThere,true);assert.ok(transaction.quota);
 pass('IndexedDB rejects a stale destination and rolls back a failed backup transaction');
 // A second explicit copy must replace the existing shared bank, including
 // slots absent from the source, rather than merge it.
 await put(b,{'slot 15':checkpoint});
 await b.evaluate(async game=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();await s.delete(game+':slot 1');s.db.close();},game);
 const activity=await local(b,'activity');await openLocation(b);await copy(b,'shared');
 const replaced=await bank();assert.equal(replaced.records['slot 1'],undefined);assert.deepEqual(replaced.records['slot 15'],checkpoint);
 assert.deepEqual((await local(b,'before-copy-shared')).records,source.records);
 const after=await local(b,'activity');assert.equal(after.sessions.reduce((n,s)=>n+s.characters,0),activity.sessions.reduce((n,s)=>n+s.characters,0));
 pass('Replacing a nonempty shared bank removes old slots, preserves activity and records the previous server bank');
 assert.deepEqual(errors,[]);
}finally{
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({browser:name,checks,errors,scope:'Temporary profiles/database; real CLANNAD source checkpoint; not new route coverage'},null,2));
 await browser?.close();server?.kill('SIGTERM');await fs.rm(tmp,{recursive:true,force:true});
}
