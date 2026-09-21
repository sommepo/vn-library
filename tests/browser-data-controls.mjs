// Real reached CLANNAD save, temporary server/bank, fresh device profiles only.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawn}from'node:child_process';
import{pollBrowser}from'./browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/data-controls'),game='clannad-slpm66302-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',code=>reject(new Error(`Test server exited ${code}`)));});
const base=`http://127.0.0.1:${port}`;
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),browserName=process.env.VNKIT_BROWSER||'chromium';
const browser=await api[browserName].launch({headless:true}),report={browser:browserName,checks:[],errors:[],scope:'Fresh profiles and isolated save server; source-reached CLANNAD portrait. No user bank writes or new route-coverage claim.'};let a,b;
const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
const local=(p,k='autosave')=>p.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
const bank=async()=>await(await fetch(`${base}/api/saves/${game}`)).json();
const ready=p=>p.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:60000});
const slot=(p,n)=>p.locator('.slot').filter({hasText:new RegExp(`^${n} ·`)});
const confirm=async(p,action,accept=true)=>{let message;const answered=new Promise(resolve=>p.once('dialog',async d=>{message=d.message();if(accept)await d.accept();else await d.dismiss();resolve();}));await action();await answered;return message;};
const openLocation=async p=>{await p.locator('#savesButton').click();await p.getByRole('button',{name:'Save location',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#panelBody').textContent.includes('Checking shared saves'));};
const advance=async p=>{await p.locator('#nextButton').click();await ready(p);};
const metrics=['activeMs','characters','uniqueCharacters','rereadCharacters','segments','skippedSegments','choiceCharacters'];
try{
 const ca=await browser.newContext({viewport:{width:1000,height:800}}),cb=await browser.newContext();
 await ca.addInitScript(()=>{window.__textEvents=[];window.__textReceiver=new BroadcastChannel('vnkit-text-v1');window.__textReceiver.onmessage=e=>window.__textEvents.push(e.data);});
 a=await ca.newPage();b=await cb.newPage();for(const p of[a,b])p.on('pageerror',e=>report.errors.push(e.message));
 await a.goto(`${base}/?game=${game}`);await ready(a);
 const file=path.join(root,'private/clannad/menu-audit/checkpoints-final/source-portrait.json'),portrait=JSON.parse(await fs.readFile(file));await a.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await local(a))?.state.pending?.id===portrait.state.pending.id,'portrait restore');await ready(a);
 await advance(a);await advance(a);await a.evaluate(()=>dispatchEvent(new Event('pagehide')));await a.waitForTimeout(200);
 await a.evaluate(async g=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const d=await s.get(g+':activity');d.sessions.at(-1).lastActivityAt-=4*3600000+1000;await s.put(g+':activity',d);s.db.close();},game);
 await a.reload();await ready(a); // Simulate a four-hour break after real presented text.
 await advance(a);await advance(a);await a.waitForTimeout(1200);await a.locator('#statsButton').click();await a.getByRole('button',{name:'Pause activity timer',exact:true}).click();
 await a.evaluate(()=>dispatchEvent(new Event('pagehide')));let before=await local(a,'activity');const earlier=structuredClone(before.sessions.slice(0,-1));assert.ok(earlier.length>0);assert.ok(before.sessions.at(-1).characters>0);assert.ok(before.sessions.at(-1).activeMs>0);
 await confirm(a,()=>a.getByRole('button',{name:'Clear current session',exact:true}).click(),false);
 assert.equal((await local(a,'activity')).sessions.at(-1).characters,before.sessions.at(-1).characters);pass('Cancelling session reset leaves the current counters intact');
 // A denied IndexedDB write must roll the live counters back, not just show an error.
 await a.evaluate(async()=>{const{Store}=await import('/storage.mjs');const original=Store.prototype.put;Store.prototype.put=async function(k,v){if(k.endsWith(':activity'))throw Error('Test storage failure');return original.call(this,k,v);};window.__restoreStorage=()=>{Store.prototype.put=original;};});
 await confirm(a,()=>a.getByRole('button',{name:'Clear current session',exact:true}).click());await a.waitForFunction(()=>document.querySelector('#panelStatus').textContent.includes('Test storage failure'));
 await a.evaluate(()=>window.__restoreStorage());await a.locator('#statsButton').evaluate(e=>e.click());assert.equal(await a.locator('[data-statistics=session] .metric strong').nth(1).textContent(),String(before.sessions.at(-1).characters));pass('Storage failure reports an error and restores the session counters');
 const position=await local(a),progress=await local(a,'progress'),events=await a.evaluate(()=>window.__textEvents);before=await local(a,'activity');
 await confirm(a,()=>a.getByRole('button',{name:'Clear current session',exact:true}).click());await pollBrowser(async()=>(await local(a,'activity')).sessions.at(-1).characters===0,'cleared activity');
 let cleared=await local(a,'activity');for(const key of metrics)assert.equal(cleared.sessions.at(-1)[key],0);
 assert.deepEqual(cleared.sessions.slice(0,-1),earlier);for(const key of ['seen','occurrences','backlog','bookmarks'])assert.deepEqual(cleared[key],before[key]);
 for(const key of metrics){assert.equal(Object.values(cleared.days).reduce((n,d)=>n+d[key],0),cleared.sessions.reduce((n,s)=>n+s[key],0));}
 assert.match(await a.locator('.activity-note').innerText(),/manually paused/);assert.deepEqual(await local(a),position);assert.deepEqual(await local(a,'progress'),progress);
 assert.deepEqual(await a.evaluate(()=>window.__textEvents),events);
 assert.equal(await a.locator('[data-statistics=session] .metric strong').nth(1).textContent(),'0');await a.screenshot({path:path.join(out,'session-reset.png')});
 const downloadEvent=a.waitForEvent('download');await a.getByRole('button',{name:'Export activity JSON',exact:true}).click();const download=await downloadEvent,exportPath=path.join(out,'reset-activity.json');await download.saveAs(exportPath);
 assert.equal(JSON.parse(await fs.readFile(exportPath)).sessions.at(-1).characters,0);await a.reload();await ready(a);
 const reloaded=await local(a,'activity');assert.deepEqual(reloaded.seen,cleared.seen);assert.deepEqual(reloaded.occurrences,cleared.occurrences);assert.equal(reloaded.sessions.reduce((n,s)=>n+s.characters,0),cleared.sessions.reduce((n,s)=>n+s.characters,0));
 pass('Reset zeros the current session and corrects totals, preserves prior sessions/read history/state/pause, exports and survives reload without recount');
 assert.equal(reloaded.sessions.at(-1).id,cleared.sessions.at(-1).id);pass('Reload within four hours retains the current session ID');
 await a.locator('#statsButton').click();assert.equal(await a.locator('[data-statistics=today] .metric small').textContent(),'Today’s characters');
 const olderId=reloaded.sessions[0].id;
 const deleteOld=a.locator(`tr[data-session-id="${olderId}"]`).getByRole('button',{name:'Delete session',exact:true});
 await confirm(a,()=>deleteOld.click(),false);assert.ok((await local(a,'activity')).sessions.some(s=>s.id===olderId));
 await confirm(a,()=>deleteOld.click());await pollBrowser(async()=>!(await local(a,'activity')).sessions.some(s=>s.id===olderId),'delete earlier session');
 const afterDelete=await local(a,'activity');assert.deepEqual(afterDelete.seen,reloaded.seen);assert.deepEqual(afterDelete.backlog,reloaded.backlog);assert.deepEqual((await local(a)).state,position.state);
 assert.equal(afterDelete.sessions.reduce((n,s)=>n+s.characters,0),reloaded.sessions.reduce((n,s)=>n+s.characters,0)-reloaded.sessions[0].characters);
 pass('Today counter is visible; individual session deletion supports cancel, subtracts totals and preserves read history and saves');
 await a.locator('#closePanel').click();

 await a.locator('#savesButton').click();for(const name of ['slot 1','slot 15','quicksave']){await slot(a,name).getByRole('button',{name:'Save',exact:true}).click();await pollBrowser(async()=>!!await local(a,name),name);}
 const saved=await local(a,'slot 1');await confirm(a,()=>slot(a,'slot 1').getByRole('button',{name:'Delete',exact:true}).click(),false);assert.deepEqual(await local(a,'slot 1'),saved);
 await confirm(a,()=>slot(a,'slot 1').getByRole('button',{name:'Delete',exact:true}).click());await pollBrowser(async()=>!await local(a,'slot 1'),'local delete');await slot(a,'slot 1').getByText('slot 1 · Empty',{exact:true}).waitFor();
 assert.ok(await local(a,'slot 15'));assert.ok(await local(a,'quicksave'));assert.deepEqual(await local(a,'progress'),progress);
 await slot(a,'slot 1').getByRole('button',{name:'Save',exact:true}).click();await pollBrowser(async()=>!!await local(a,'slot 1'),'reuse slot');pass('Local save deletion can be cancelled, affects only the selected slot and leaves the slot reusable');
 const autoMessage=await confirm(a,()=>slot(a,'autosave').getByRole('button',{name:'Delete',exact:true}).click());assert.match(autoMessage,/created again/);await pollBrowser(async()=>!await local(a),'delete autosave');
 await a.evaluate(()=>dispatchEvent(new Event('pagehide')));await a.waitForTimeout(200);assert.equal(await local(a),undefined);
 await a.locator('#closePanel').click();await advance(a);await pollBrowser(async()=>!!await local(a),'new presentation autosave');pass('Deleted autosave stays absent through pagehide and returns on genuine story advancement');
 await openLocation(a);await Promise.all([a.waitForEvent('framenavigated',{predicate:f=>f===a.mainFrame()}),a.getByRole('button',{name:'Copy local saves to server & use shared',exact:true}).click()]);await a.waitForFunction(()=>document.querySelector('#saveLocationStatus').textContent.includes('Shared saves'));await ready(a);
 await a.locator('#savesButton').click();const localSlot=await local(a,'slot 15'),preDelete=await bank(),readHistory=await local(a,'activity');
 // The server commits a real deletion; simulate losing its HTTP acknowledgement.
 let deletionPosts=0;const bodies=[];await a.route(`**/api/saves/${game}`,async r=>{const req=r.request(),data=req.postDataJSON();if(req.method()==='POST'&&data?.changes?.['slot 15']===null){deletionPosts++;bodies.push(req.postData());const response=await r.fetch();if(deletionPosts===1){await r.abort();return;}await r.fulfill({response});return;}await r.continue();});
 const sharedMessage=await confirm(a,()=>slot(a,'slot 15').getByRole('button',{name:'Delete',exact:true}).click());assert.match(sharedMessage,/all devices/);
 await pollBrowser(async()=>deletionPosts===2&&!(await local(a,'shared-cache'))?.records?.['slot 15'],'acknowledged deletion');await a.unroute(`**/api/saves/${game}`);
 assert.equal(bodies[0],bodies[1]);const deleted=await bank();assert.equal(deleted.revision,preDelete.revision+1);assert.equal(deleted.records['slot 15'],undefined);assert.deepEqual(deleted.records.progress,preDelete.records.progress);assert.deepEqual(await local(a,'slot 15'),localSlot);assert.deepEqual((await local(a,'activity')).seen,readHistory.seen);
 pass('Shared deletion with lost HTTP reply commits once and preserves local-bank saves, route progress and read history');
 await cb.addInitScript(g=>localStorage.setItem(`vnkit.save-location:${g}`,'shared'),game);await b.goto(`${base}/?game=${game}`);await ready(b);await b.locator('#savesButton').click();await slot(b,'slot 15').getByText('slot 15 · Empty',{exact:true}).waitFor();pass('A second device sees the shared slot empty');await cb.close();
 // Refresh the first device to the newer shared revision before another deletion.
 await a.reload();await ready(a);await a.locator('#savesButton').click();await a.route(`**/api/saves/${game}`,r=>r.request().method()==='POST'?r.abort():r.continue());
 await confirm(a,()=>slot(a,'slot 1').getByRole('button',{name:'Delete',exact:true}).click());await a.waitForFunction(()=>document.querySelector('#panelStatus').textContent.includes('Shared saving is paused'),null,{timeout:20000});
 assert.ok((await bank()).records['slot 1']);assert.equal((await local(a,'shared-pending')).pending.changes['slot 1'],null);assert.ok(await local(a,'slot 1'));pass('Failed shared deletion reports a visible error and retains a recoverable operation without losing the server/local save');
 await a.unroute(`**/api/saves/${game}`);
 await a.setViewportSize({width:390,height:844});await a.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.querySelector('#panel').scrollWidth<=document.querySelector('#panel').clientWidth+1);await a.screenshot({path:path.join(out,'saves-mobile.png')});
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(a&&!a.isClosed())await a.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();server.kill('SIGTERM');}
