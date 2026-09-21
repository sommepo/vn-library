// Two separate browser profiles against an isolated server/database. Actual
// CLANNAD reached saves are private; this never writes the live server's bank.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawn}from'node:child_process';
import{pollBrowser}from'./browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/shared-saves'),game=process.env.VNKIT_GAME_ID||'clannad-slpm66302-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',code=>reject(new Error(`Test server exited ${code}`)));});
const base=`http://127.0.0.1:${port}`;
const{chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));const browser=await chromium.launch({headless:true});
const report={checks:[],errors:[],scope:'Two isolated device profiles and an actual source-reached game checkpoint. No live shared saves or user profiles modified.'};let a,b;
const route=process.env.VNKIT_ROUTE_ID||'misae';
const clearFlag=p=>game.startsWith('remember11-')?p?.globals?.globalBits?.[84]:p?.globals?.[13];
const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
const local=(p,k='autosave')=>p.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
const bank=async()=>await(await fetch(`${base}/api/saves/${game}`)).json();
const ready=p=>p.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:60000});
const navigate=async(p,name)=>Promise.all([p.waitForEvent('framenavigated',{predicate:f=>f===p.mainFrame()}),p.getByRole('button',{name,exact:true}).click()]);
const openLocation=async p=>{await p.locator('#savesButton').click();await p.getByRole('button',{name:'Save location',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#panelBody').textContent.includes('Checking shared saves'));};
try{
 const ca=await browser.newContext(),cb=await browser.newContext();a=await ca.newPage();b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>report.errors.push(e.message));
 await a.goto(`${base}/?game=${game}`);await ready(a);
 const file=path.resolve(process.env.VNKIT_CHECKPOINT||path.join(root,'private/clannad/menu-audit/checkpoints-final/source-portrait.json')),portrait=JSON.parse(await fs.readFile(file));await a.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await local(a))?.state.pending?.id===portrait.state.pending.id,'local portrait restore');
 await a.locator('#savesButton').click();await a.locator('.slot').filter({hasText:/^slot 15 ·/}).getByRole('button',{name:'Save',exact:true}).click();await pollBrowser(async()=>!!await local(a,'slot 15'),'slot 15');await a.locator('#closePanel').click();
 await a.locator('#libraryButton').click();await a.getByRole('button',{name:'Route progress / debug…',exact:true}).click();await a.locator(`.route-progress[data-route="${route}"] button`).click();await pollBrowser(async()=>clearFlag(await local(a,'progress'))===1,'local manual-progress fixture');await a.locator('#closePanel').click();
 const localSlot=await local(a,'slot 15'),localProgress=await local(a,'progress');assert.equal((await bank()).revision,0);pass('Local reading, slot 15 and progress cause no server save writes');
 await openLocation(a);await navigate(a,'Copy local saves to server & use shared');await a.waitForURL(url=>url.searchParams.get('game')===game);await ready(a);await a.waitForFunction(()=>document.querySelector('#saveLocationStatus').textContent.includes('Shared saves'));
 await pollBrowser(async()=>(await bank()).records?.['slot 15']?.state.pending.id===localSlot.state.pending.id,'seeded shared slots');assert.deepEqual(await local(a,'slot 15'),localSlot);assert.deepEqual((await bank()).records.progress,localProgress);pass('Opt-in migration copies local slots and route unlocks; local originals remain intact');
 if(game.startsWith('remember11-')){await a.locator('#pauseButton').click();await a.waitForFunction(()=>document.querySelector('#pauseButton').getAttribute('aria-pressed')==='true');}
 await a.locator('#savesButton').click();
 await b.goto(`${base}/?game=${game}`);await ready(b);const bLocal=await local(b),bHistory=await local(b,'activity');await openLocation(b);await navigate(b,'Use shared saves');await b.waitForFunction(()=>document.querySelector('#saveLocationStatus').textContent.includes('Shared saves'));await ready(b);
 await pollBrowser(async()=>(await local(b,'shared-cache'))?.records?.autosave?.state.pending.id===portrait.state.pending.id,'other-device resume');assert.deepEqual((await local(b,'activity')).seen,bHistory.seen);assert.equal((await local(b)).state.pending.id,bLocal.state.pending.id);assert.equal(clearFlag((await local(b,'shared-cache')).records.progress),1);pass('Second profile resumes the exact shared occurrence and unlock flags without importing history or recounting restored text');
 await b.locator('#savesButton').click();const slot=b.locator('.slot').filter({hasText:/^slot 15 ·/});assert.equal(await slot.getByRole('button',{name:'Load',exact:true}).count(),1);await slot.getByRole('button',{name:'Load',exact:true}).click();await ready(b);assert.equal(clearFlag((await bank()).records.progress),1);pass('Shared manual slot loads with current persistent progress retained');
 await b.locator('#nextButton').click();await ready(b);await pollBrowser(async()=>(await bank()).records.autosave.state.pending.id!==portrait.state.pending.id,'new shared position');const newer=(await bank()).records.autosave;
 await a.locator('#closePanel').click();await a.locator('#quickSaveButton').click();await a.waitForFunction(()=>document.querySelector('#saveLocationStatus').classList.contains('error'));assert.equal(await a.locator('#nextButton').isDisabled(),true);assert.equal((await bank()).records.autosave.state.pending.id,newer.state.pending.id);assert.ok(await local(a,'shared-recovery'));pass('Stale first profile is paused before overwriting newer shared progress and retains a recovery copy');
 await openLocation(a);await navigate(a,'Use local saves');await a.waitForFunction(()=>document.querySelector('#saveLocationStatus').textContent==='Local saves');await ready(a);assert.deepEqual(await local(a,'slot 15'),localSlot);assert.equal((await local(a)).state.pending.id,portrait.state.pending.id);pass('Switching back resumes the untouched local bank');
 await b.route('**/api/saves/**',r=>r.abort());await b.locator('#nextButton').click();await b.waitForFunction(()=>document.querySelector('#saveLocationStatus').classList.contains('error'));assert.equal(await b.locator('#nextButton').isDisabled(),true);const recovery=await local(b,'shared-recovery');assert.ok(recovery);assert.equal((await bank()).records.autosave.state.pending.id,newer.state.pending.id);pass('Network failure pauses reading, leaves server saves intact and keeps an explicit device recovery');
 await b.unroute('**/api/saves/**');await openLocation(b);await navigate(b,'Reload shared saves');await b.waitForFunction(()=>document.querySelector('#saveLocationStatus').textContent.includes('Shared saves'));await ready(b);assert.equal((await local(b,'shared-cache')).records.autosave.state.pending.id,newer.state.pending.id);pass('Reconnect/reload resumes the acknowledged server position without publishing the failed write');
 await openLocation(b);const dl=b.waitForEvent('download');await b.getByRole('button',{name:'Export shared save bank',exact:true}).click();await(await dl).saveAs(path.join(out,'shared-bank-export.json'));const exported=JSON.parse(await fs.readFile(path.join(out,'shared-bank-export.json')));assert.equal(exported.gameId,game);assert.ok(exported.records['slot 15']);await b.screenshot({path:path.join(out,'save-location.png')});pass('Shared bank export includes compatible saves and independent route progress');
 await b.setViewportSize({width:412,height:915});await b.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);await b.screenshot({path:path.join(out,'save-location-mobile.png')});pass('Save-location controls fit the mobile viewport');

 // Actual HTTP commit followed by a lost browser response must not be mistaken
 // for another device, nor create a second server revision.
 await b.locator('#closePanel').click();await ready(b);
 const bPreserved=await local(b);const startRevision=(await bank()).revision;let dropped=false;const retriedBodies=[];
 await b.route(`**/api/saves/${game}`,async r=>{
  if(r.request().method()==='POST'){
   retriedBodies.push(r.request().postData());
   if(!dropped){dropped=true;await r.fetch();await r.abort('failed');return;}
  }
  await r.continue();
 });
 await b.locator('#nextButton').click();await ready(b);await pollBrowser(async()=>retriedBodies.length>=2,'lost reply retry');
 assert.equal(retriedBodies[0],retriedBodies[1]);assert.equal((await bank()).revision,startRevision+1);assert.equal(await b.locator('#saveLocationStatus').getAttribute('class'),'save-location-status');
 await b.unroute(`**/api/saves/${game}`);pass('Lost HTTP reply after actual commit retries the identical operation and increments the bank only once');
 // Persistently failed write survives a page reload and remains explicit.
 await b.route('**/api/saves/**',r=>r.abort());await b.locator('#nextButton').click();await b.waitForFunction(()=>document.querySelector('#saveLocationStatus').classList.contains('error'));
 const readingBeforeRecovery=await local(b,'activity');const pendingRecovery=await local(b,'shared-pending');assert.ok(pendingRecovery.pending.operationId);const recoverId=pendingRecovery.records.autosave.state.pending.id;
 await b.unroute('**/api/saves/**');await b.reload();await b.waitForFunction(()=>document.querySelector('#panelStatus').textContent.includes('unsynced save'));
 await b.locator('.game-card').filter({hasText:game.startsWith('remember11-')?'Remember11':'CLANNAD'}).getByRole('button',{name:'Save location',exact:true}).click();await navigate(b,'Retry unsynced save');await ready(b);
 await pollBrowser(async()=>(await bank()).records.autosave.state.pending.id===recoverId,'recovered unsynced position');
 assert.equal(await local(b,'shared-pending'),null);assert.equal((await local(b,'shared-recovery')).resolved,true);assert.deepEqual(await local(b),bPreserved);assert.deepEqual((await local(b,'activity')).seen,readingBeforeRecovery.seen);assert.equal((await local(b,'activity')).sessions.reduce((n,s)=>n+s.characters,0),readingBeforeRecovery.sessions.reduce((n,s)=>n+s.characters,0));
 pass('Unsent real save survives reload, offers explicit retry and resumes its exact source occurrence without changing the local bank');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(a)await a.screenshot({path:path.join(out,'failure-a.png')});if(b)await b.screenshot({path:path.join(out,'failure-b.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();server.kill('SIGTERM');}
