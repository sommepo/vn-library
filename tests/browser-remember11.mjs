// Actual Remember11 import; isolated browser and save server, no live-bank writes.
import {pollBrowser} from './browser-poll.mjs';
import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL}from'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/remember11-v1'),game='remember11-slpm65550-1.02';await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(+b.toString().trim()));server.on('exit',c=>reject(Error('Server exited '+c)));});
const base=`http://127.0.0.1:${port}`,{chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1100,height:850},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
const report={checks:[],errors:[],segments:0,movies:0,choices:0};page.on('pageerror',e=>report.errors.push(e.message));const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
await context.addInitScript(()=>{const Original=window.Audio;window.__media=[];window.Audio=function(...args){const a=new Original(...args);window.__media.push(a);return a;};localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));});
const read=async(key='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,key]);
const ready=()=>page.waitForFunction(()=>!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')||document.querySelector('video.script-media'),null,{timeout:60000});
const settled=()=>page.waitForFunction(()=>document.querySelector('#pauseButton').disabled===false&&!document.querySelector('#stage').hasAttribute('aria-busy'),null,{timeout:60000});
try{
 await page.goto(`${base}/?game=${game}`);await ready();await settled();let previous=null;
 for(let n=0;n<150;n++){
  await ready();await settled();const video=page.locator('video.script-media');
  if(await video.count()){report.movies++;await video.evaluate(v=>v.play());await page.waitForFunction(()=>!document.querySelector('video.script-media'),null,{timeout:90000});continue;}
  if(await page.locator('#choices button').count()){report.choices++;await page.locator('#choices button').first().click();continue;}
  const saved=await read();if(saved.state.pending.id!==previous){report.segments++;previous=saved.state.pending.id;}
  if(report.segments===80)await page.screenshot({path:path.join(out,'actual-scene.png')});
  await page.locator('#nextButton').click();
 }
 assert.ok(report.segments>=100);assert.ok(report.movies>=1);assert.ok(report.choices>=1);pass('100+ successive real dialogue segments, natural movie completion, first choice and artwork');
 await ready();await settled();const before=await read();await page.locator('#sentence').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(r);});await page.locator('#art').click({position:{x:5,y:5}});assert.equal((await read()).state.pending.id,before.state.pending.id);await page.evaluate(()=>getSelection().removeAllRanges());pass('DOM text selection protects story position');
 await page.locator('#copyButton').click();const clip=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(clip.length>0);pass('Explicit clipboard copies dialogue in the reading browser');
 await page.locator('#quickSaveButton').click();await page.waitForTimeout(200);const q=await read('quicksave');assert.ok(q);await page.locator('#nextButton').click();await ready();await page.locator('#quickLoadButton').click();await ready();await pollBrowser(async()=> (await read()).state.pending.id===q.state.pending.id,'quicksave restoration');assert.equal((await read()).state.pending.id,q.state.pending.id);pass('Quicksave/load restores actual execution state');
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 15 ·/}).waitFor();assert.equal(await page.locator('.slot').filter({hasText:/^slot \d+ ·/}).count(),15);await page.locator('#closePanel').click();pass('15 manual slots use the shared reader');
 await page.locator('#pauseButton').click();assert.ok(await page.evaluate(()=>window.__media.every(a=>a.paused)));await page.locator('#pauseButton').click();pass('Global pause suspends Remember11 media');
 const activity=await read('activity');await page.reload();await ready();assert.equal((await read()).state.pending.id,q.state.pending.id);assert.equal((await read('activity')).sessions.reduce((x,s)=>x+s.characters,0),activity.sessions.reduce((x,s)=>x+s.characters,0));pass('Reload resumes without recounting dialogue');
 await page.setViewportSize({width:915,height:412});await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement);const rects=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,bottom:r.bottom,right:r.right};};return{stage:box(document.querySelector('#stage')),text:box(document.querySelector('#textbox')),w:innerWidth,h:innerHeight};});assert.ok(rects.text.bottom<=rects.stage.bottom+1&&rects.stage.bottom<=rects.h+1);await page.screenshot({path:path.join(out,'fullscreen-mobile.png')});await page.evaluate(()=>document.exitFullscreen());pass('Landscape fullscreen keeps selectable textbox inside game frame');
 assert.deepEqual(report.errors,[]);
}catch(e){report.failure=e.stack;report.status=await page.locator('#status').textContent();console.error(e.stack,report.status);process.exitCode=1;await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));await browser.close();server.kill();}
