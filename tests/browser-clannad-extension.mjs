// Actual source-reached checkpoints, separate from consecutive entry coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const input=path.resolve(process.env.VNKIT_CHECKPOINTS||'private/clannad/route-audit-v3');
const out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-extension');await fs.mkdir(out,{recursive:true});
const report={coverage:'Source-reached checkpoint tests, not consecutive entry coverage',checks:[],errors:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const total=a=>a.sessions.reduce((n,s)=>n+s.characters,0);
const loadJSON=async url=>JSON.parse(await fs.readFile(path.join(root,'private/library/clannad-live',url)));
const ref=await ClannadEngine.create(await loadJSON('content.json'),{loadJSON});
const checkpoint=async name=>JSON.parse(await fs.readFile(path.join(input,name)));
const browser=await chromium.launch({headless:true});let page,ws;
async function stored(key='autosave'){
 return page.evaluate(async([game,key])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(game+':'+key);s.db.close();return v;},[game,key]);
}
async function restore(name){
 const save=await checkpoint(name);await page.locator('#saveFile').setInputFiles(path.join(input,name));
 await pollBrowser(async()=>{const s=await stored();return s?.state.pending?.id===save.state.pending.id;},'checkpoint restoration');return save;
}
async function next(){const id=(await stored()).state.pending.id;await page.locator('#nextButton').click();await pollBrowser(async()=>(await stored()).state.pending?.id!==id,'next source boundary');}
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(()=>{
  localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,websocket:true}));
  window.__audio=[];const Original=Audio;window.Audio=class extends Original{constructor(...a){super(...a);window.__audio.push(this);}};
 });
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const session=await (await fetch(base+'/api/session')).json(),events=[];
 ws=new WebSocket(session.structuredWsUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>events.push(JSON.parse(e.data));
 await page.goto(`${base}/?game=${game}`);await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 // Concurrent message must be visible during the motion, not first at WTKY.
 const before=await restore('event-30-before.json');await ref.restore(before);await ref.advance();
 const expected=ref.current.presentation;assert.ok(expected?.voice);
 const oldEvents=events.length,oldTotal=total(await stored('activity'));
 await page.evaluate(()=>{document.querySelector('#nextButton').click();setTimeout(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('#sentence'));getSelection().removeAllRanges();getSelection().addRange(r);},100);});
 await page.waitForFunction(()=>getSelection().toString().length>0);
 await sleep(350);assert.equal((await stored()).state.pending.kind,'wait');
 await page.locator('#settingsButton').click();
 await pollBrowser(async()=>(await stored()).state.pending.presentation?.id===expected.id,'concurrent native text');
 assert.equal(await page.locator('#sentence').textContent(),expected.text);
 assert.ok(await page.evaluate(()=>window.__audio[1].currentTime>0));
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);
 const during=await stored();assert.ok(during.state.pending.remainingMs>0&&during.state.pending.remainingMs<during.state.pending.ms);
 assert.equal(events.length,oldEvents+1);assert.equal(events.at(-1).segmentId,expected.id);
 const counted=total(await stored('activity'));assert.ok(counted>oldTotal);
 await page.screenshot({path:path.join(out,'concurrent-motion-paused.png')});
 await page.reload();await pollBrowser(async()=>(await stored())?.state.pending.kind==='pause','motion completion after reload');
 assert.equal(await page.locator('#sentence').textContent(),expected.text);assert.equal(events.length,oldEvents+1);assert.equal(total(await stored('activity')),counted);
 await page.locator('#copyButton').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),expected.text);
 await ref.advance();await ref.advance();await next();assert.equal((await stored()).state.pending.id,ref.current.id);
 assert.equal(await page.locator('#sentence').textContent(),ref.current.text);
 pass('Event 30 displays original text/voice during motion, restores partial timing, emits/counts once and clears the page at its original key wait');
 // New slot keys preserve the old keys, with automatic slots still separate.
 const choice=await restore('choice-17.json');await page.locator('#savesButton').click();
 await page.locator('.slot').nth(17).waitFor();
 assert.equal(await page.locator('.slot').count(),18);
 const slot15=()=>page.locator('.slot').filter({hasText:/^slot 15 ·/});
 await slot15().getByRole('button',{name:'Save',exact:true}).click();
 await pollBrowser(async()=>(await stored('slot 15'))?.state.pending.id===choice.state.pending.id,'slot 15 save');
 const download=page.waitForEvent('download');await slot15().getByRole('button',{name:'Export',exact:true}).click();
 const exported=path.join(out,'slot-15.json');await (await download).saveAs(exported);
 assert.deepEqual(JSON.parse(await fs.readFile(exported)).state,choice.state);
 await page.locator('#closePanel').click();
 const branches=[];
 for(const option of ['0','1']){
  await restore('choice-17.json');await ref.restore(choice);await ref.advance(option);
  while(ref.current.kind!=='choice')await ref.advance();
  await page.locator('#choices button').nth(Number(option)).click();
  await pollBrowser(async()=>(await stored()).state.pending.id!==choice.state.pending.id,'selected branch');
  await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#seekNotice').hidden&&!document.querySelector('#status').textContent.startsWith('Moving to'));
  const reached=await stored();assert.equal(reached.state.pending.id,ref.current.id);assert.deepEqual(reached.state.vars,ref.state.vars);
  branches.push(reached.state.vars.F[500]||0);
 }
 assert.deepEqual(branches,[1,0]);
 const history=total(await stored('activity')),emitted=events.length;
 await page.locator('#savesButton').click();await slot15().getByRole('button',{name:'Load',exact:true}).click();
 await pollBrowser(async()=>(await stored()).state.pending.id===choice.state.pending.id,'slot 15 load');
 assert.deepEqual((await stored()).state.vars,choice.state.vars);assert.equal(total(await stored('activity')),history);assert.equal(events.length,emitted);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('#choices button').length>0);
 assert.equal((await stored('slot 15')).state.pending.id,choice.state.pending.id);
 await page.locator('#saveFile').setInputFiles(exported);await sleep(100);assert.equal((await stored()).state.pending.id,choice.state.pending.id);
 pass('15 manual slots plus separate automatic saves; slot 15 exports, persists, loads and imports; both later choice branches preserve different story flags without rolling back history');
 // Separate simultaneous speakers stay selectable; exports omit their names
 // unless speaker inclusion is explicitly enabled.
 const simultaneous=await restore('simultaneous.json');assert.equal(simultaneous.state.pending.dialogue.length,2);
 await page.locator('#copyButton').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),simultaneous.state.pending.dialogue.map(p=>p.text).join('\n'));
 pass('Simultaneous dialogue preserves both original text sources and exports without duplicate speaker labels');
 await restore('event-10-before.json');await next();
 await pollBrowser(async()=>(await stored()).state.scene.task?.phase==='lowered','lowered native actor');
 const lower=await stored();assert.ok(lower.state.scene.layers.some(l=>l.y>0));
 await next();await next();await pollBrowser(async()=>(await stored()).state.pending.nativeInput===true,'native input wait');
 assert.equal(await page.locator('.native-swing').count(),1);
 assert.equal(await page.locator('#sentence').textContent(),(await stored()).state.pending.presentation.text);
 const spin=await stored();await sleep(650);
 assert.ok(await page.evaluate(()=>window.__audio.some(a=>a.vnChannel==='native-swing'&&a.currentTime>0)));
 await page.locator('#settingsButton').click();const angle=await page.locator('.native-swing').evaluate(e=>e.style.transform);await sleep(250);
 assert.equal(await page.locator('.native-swing').evaluate(e=>e.style.transform),angle);
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);const held=await stored();assert.ok(held.state.scene.task.elapsedMs>500);
 await page.screenshot({path:path.join(out,'native-input-paused.png')});
 const priorHistory=total(await stored('activity')),priorEvents=events.length;
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 assert.equal((await stored()).state.pending.id,spin.state.pending.id);assert.equal(total(await stored('activity')),priorHistory);assert.equal(events.length,priorEvents);
 await ref.restore(held);await ref.advance();await ref.advance();
 await page.locator('#nextButton').click();await pollBrowser(async()=>(await stored()).state.pending.id===ref.current.id,'native input retirement');
 assert.equal(await page.locator('.native-swing').count(),0);assert.deepEqual((await stored()).state.vars,ref.state.vars);
 pass('Event 10 lowers the original actor, changes source artwork, rotates with original sound, pauses/restores, waits for input and resumes at the original text');
 // Reproduce the precise stopped-save shape of an earlier adapter, without
 // removing support from the actual reader or touching a user's browser data.
 const oldContent=await loadJSON('content.json');delete oldContent.nativeData.events[30];
 const old=await ClannadEngine.create(oldContent,{loadJSON});await old.restore(await checkpoint('event-30-before.json'));
 await assert.rejects(old.advance(),/Unresolved native event 30/);const halted=old.save();assert.equal(halted.state.pending,null);
 await page.evaluate(async([game,save])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();await s.put(game+':autosave',save);s.db.close();},[game,halted]);
 const resumeEvents=events.length;await page.reload();await pollBrowser(async()=>(await stored()).state.pending?.kind==='pause','legacy stopped-save recovery');
 assert.equal(events.length,resumeEvents+1);assert.equal(events.at(-1).segmentId,expected.id);
 await next();assert.ok((await stored()).state.pending.kind==='text');
 pass('An older autosave halted at the former unsupported event resumes that source PC and presents only the newly reached line');
 const limit=await restore('before-stop.json'),limitHistory=total(await stored('activity')),limitEvents=events.length;
 await page.locator('#nextButton').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Unresolved native event 41'));
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);
 assert.deepEqual((await stored()).state,limit.state);assert.equal(total(await stored('activity')),limitHistory);assert.equal(events.length,limitEvents);
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 assert.equal((await stored()).state.pending.occurrenceId,limit.state.pending.occurrenceId);
 pass('Ordinary advancement at an unsupported event restores the last presentation; autosave/reload remain usable and do not change text history');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.errors.push(e.stack||e.message);report.passed=false;process.exitCode=3;if(page){await page.screenshot({path:path.join(out,'failure.png')});report.ui=await page.locator('#status').textContent();}}
finally{ws?.close();await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
