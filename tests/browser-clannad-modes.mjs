// Further actual-import checks; restored motion checkpoint is NOT contiguous browser coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-modes');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],motion:'Restored headless-reached source checkpoint; separate from opening browser coverage'};
const browser=await chromium.launch({headless:true});let socket;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
async function saved(page,key='autosave'){return page.evaluate(async([game,key])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const r=await s.get(game+':'+key);s.db.close();return r;},[game,key]);}
const count=a=>a.sessions.reduce((n,s)=>n+s.characters,0),time=a=>a.sessions.reduce((n,s)=>n+s.activeMs,0);
const pending=async p=>(await saved(p))?.state.pending;
async function changed(page,id){await pollBrowser(async()=>{const p=await pending(page);return p?.id&&p.id!==id;},'a new CLANNAD source segment');await sleep(60);}
async function flush(page){await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);}
try{
 const context=await browser.newContext({viewport:{width:1100,height:850},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,autoDelay:500,websocket:true,autoCopy:true})));
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const session=await(await fetch(base+'/api/session')).json(),url=new URL(session.wsUrl);url.searchParams.set('format','plain');
 const messages=[];socket=new WebSocket(url);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});socket.onmessage=e=>messages.push(e.data);
 await page.goto(`${base}/?game=${game}`);await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);await sleep(150);
 const first=await pending(page);assert.equal(messages.at(-1),first.text);check('Plain-text WebSocket receives original logical text without status/control frames');
 await page.locator('#quickSaveButton').click();await sleep(100);
 await page.locator('#nextButton').click();await changed(page,first.id);const second=await pending(page);
 assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),second.text);check('Opt-in automatic clipboard succeeds in the reading browser');
 await page.locator('#nextButton').click();await changed(page,second.id);const third=await pending(page),prior=count(await saved(page,'activity'));
 await page.locator('#quickLoadButton').click();await sleep(100);await page.locator('#skipButton').click();
 await page.waitForFunction(()=>document.querySelector('#skipButton').getAttribute('aria-pressed')==='false');await sleep(100);
 const skipData=await saved(page,'activity'),unread=await pending(page);assert.notEqual(unread.id,third.id);assert.equal(count(skipData)-prior,[...unread.text].filter(c=>! /\s/u.test(c)).length);assert.ok(skipData.sessions.some(s=>s.skippedSegments>=2));
 check('Skip read stops on unread source text; skipping contributes zero narrative characters');
 await page.locator('#autoButton').click();await changed(page,unread.id);await page.locator('#autoButton').click();check('Auto mode advances actual source text');
 const live=await context.newPage();await live.goto(base+'/live.html');await page.bringToFront();
 const beforeLive=await pending(page);await page.locator('#nextButton').click();await changed(page,beforeLive.id);const afterLive=await pending(page);
 await live.waitForFunction(text=>[...document.querySelectorAll('.entry-text')].some(n=>n.textContent===text),afterLive.text);assert.equal((await saved(page,'activity')).sessions.length,1);check('Live companion receives new text and does not create a second activity session');await live.close();
 await page.locator('#statsButton').click();await page.getByRole('button',{name:'Pause activity timer',exact:true}).click();await page.locator('#closePanel').click();await flush(page);const paused=time(await saved(page,'activity'));await sleep(2100);await flush(page);assert.equal(time(await saved(page,'activity')),paused);
 await page.locator('#statsButton').click();await page.getByRole('button',{name:'Resume activity timer',exact:true}).click();await page.locator('#closePanel').click();await sleep(2100);await flush(page);assert.ok(time(await saved(page,'activity'))>paused);check('Manual activity pause/resume persists history and controls active time');
 await page.locator('#settingsButton').click();await page.getByLabel('Automatically copy new narrative text on this device').uncheck();await page.locator('#closePanel').click();
 await page.locator('#saveFile').setInputFiles(path.join(root,'private/clannad/motion-checkpoint.json'));
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);await sleep(100);
 await page.locator('#nextButton').click();await sleep(180);
 assert.equal(await page.locator('#nextButton').isDisabled(),true);
 const shifted=await page.locator('.scene-layer').first().evaluate(e=>parseFloat(e.style.marginLeft));assert.ok(shifted>0);
 await page.locator('#settingsButton').click();const held=await page.locator('.scene-layer').first().evaluate(e=>e.style.marginLeft);await sleep(500);assert.equal(await page.locator('.scene-layer').first().evaluate(e=>e.style.marginLeft),held);
 await page.screenshot({path:path.join(out,'motion-paused.png')});await page.locator('#closePanel').click();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);assert.equal(await page.locator('.scene-layer').count(),0);
 check('Original motion table shifts actor, pauses with panel, then removes actor at native event completion');
 const movie=await page.evaluate(async game=>{
  const content=await(await fetch(`/content/${game}/content.json`)).json(),asset=content.assets['video:opening'];
  const v=document.createElement('video');v.muted=true;v.src=`/content/${game}/${asset.url}`;document.body.append(v);
  await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(new Error('Movie metadata failed'));});await v.play();await new Promise(r=>setTimeout(r,250));
  const result={width:v.videoWidth,height:v.videoHeight,duration:v.duration,playing:v.currentTime>0};v.pause();v.remove();return result;
 },game);assert.equal(movie.width,640);assert.equal(movie.height,448);assert.ok(movie.duration>152&&movie.duration<153&&movie.playing);report.movie=movie;check('Actual converted PSS plays at native dimensions; source MVPL story integration remains unverified');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.errors.push(e.message);report.passed=false;process.exitCode=3;}
finally{socket?.close();await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
