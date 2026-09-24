// Actual Ever17 import in a temporary server/browser profile; no live bank.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),library=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),game='ever17-slpm65421-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>{serverError+=b.toString();});
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error('Server startup timeout '+serverError));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.on('exit',c=>{clearTimeout(t);reject(Error(`Server exited ${c}: ${serverError}`));});});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page;
const report={checks:[],errors:[],segments:0,choices:0,voiceSegments:0,movies:0,media:'Voice/BGM decode; movies seek near their end to test source resumption'};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850},permissions:['clipboard-read','clipboard-write']});page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await context.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0})));
 await context.addInitScript(()=>{window.testAudio=new Set();const original=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.testAudio.add(this);return original.call(this);};});
 const read=async key=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,key||'autosave']);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')||document.querySelector('video.script-media')),null,{timeout:45000});
 const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
 let last=null;
 for(let step=0;step<600&&(report.segments<150||report.choices<1);step++){
  await ready();if(await page.locator('video.script-media').count()){
   await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&v.videoWidth>0&&v.currentTime>0;},null,{timeout:30000});
   report.movies++;await page.locator('video.script-media').evaluate(v=>{v.currentTime=v.duration-.2;});await page.locator('video.script-media').waitFor({state:'detached',timeout:20000});pass('Original movie decodes and completion resumes source');
  }
  await ready();const saved=await read();if(saved?.state.pending?.kind==='text'&&saved.state.pending.occurrenceId!==last){last=saved.state.pending.occurrenceId;report.segments++;if(saved.state.pending.voice){report.voiceSegments++;if(report.voiceSegments===1){await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/VOICE.AFS/')&&a.readyState>=3&&!a.paused&&a.currentTime>0),null,{timeout:20000});pass('Original voice starts and decodes in Chromium');}}}
  if(report.segments===150)await page.screenshot({path:path.join(out,'actual-scene.png')});
  if(await page.locator('#choices button').count()){report.choices++;await page.locator('#choices button').first().click();}
  else await page.locator('#nextButton').click();
 }
 await ready();assert.ok(report.segments>=100);assert.ok(report.choices>=1);pass('100 successive source segments, choices and original scene artwork');
 assert.ok(report.voiceSegments>0);await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/audio/BGM.AFS/')&&a.readyState>=3&&!a.paused&&a.currentTime>0),null,{timeout:20000});pass('Original-bank BGM plays');
 await page.locator('#pauseButton').click();await page.waitForFunction(()=>document.body.classList.contains('global-paused'));
 const pausedTimes=await page.evaluate(()=>[...window.testAudio].map(a=>a.currentTime)),pausedActivity=await read('activity');await page.waitForTimeout(1200);
 assert.deepEqual(await page.evaluate(()=>[...window.testAudio].map(a=>a.currentTime)),pausedTimes);assert.equal((await read('activity')).sessions.reduce((n,s)=>n+s.activeMs,0),pausedActivity.sessions.reduce((n,s)=>n+s.activeMs,0));
 await page.locator('#pauseButton').click();await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/audio/BGM.AFS/')&&!a.paused));pass('Global pause freezes audio and activity, then resumes');
 assert.ok(await page.locator('#art img').evaluateAll(xs=>xs.length>0&&xs.every(x=>x.complete&&x.naturalWidth>0)));pass('Atomic scene images decoded');
 const before=await read();await page.locator('#sentence').evaluate(e=>{const range=document.createRange();range.selectNodeContents(e);getSelection().removeAllRanges();getSelection().addRange(range);});
 await page.locator('#art').click({position:{x:10,y:10}});assert.equal((await read()).state.pending.id,before.state.pending.id);await page.evaluate(()=>getSelection().removeAllRanges());pass('Selection does not advance');
 await page.locator('#copyButton').click();assert.ok((await page.evaluate(()=>navigator.clipboard.readText())).length>0);pass('Browser clipboard');
 const activity=await read('activity');await page.reload();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);assert.deepEqual((await read('activity')).sessions.map(s=>s.characters),activity.sessions.map(s=>s.characters));pass('Reload restores position without recounting');
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 15 ·/}).waitFor();assert.equal(await page.locator('.slot').filter({hasText:/^slot \d+ ·/}).count(),15);
 await page.locator('.slot').filter({hasText:/^slot 1 ·/}).getByRole('button',{name:'Save',exact:true}).click();await page.locator('#closePanel').click();await page.locator('#nextButton').click();await ready();
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 1 ·/}).getByRole('button',{name:'Load',exact:true}).click();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);pass('15 save slots and manual save/load');
 const chars=(await read('activity')).sessions.reduce((n,s)=>n+s.characters,0);await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#choices button')||document.querySelector('video.script-media'),null,{timeout:60000});assert.ok((await read('activity')).sessions.reduce((n,s)=>n+s.characters,0)<=chars+200);pass('Next choice executes source without counting skipped narrative');
 await page.setViewportSize({width:915,height:412});await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement);
 const bounds=await page.evaluate(()=>{const a=document.querySelector('#stage').getBoundingClientRect(),b=document.querySelector('#textbox').getBoundingClientRect();return{bottom:a.bottom,textBottom:b.bottom,width:a.width,height:a.height,w:innerWidth,h:innerHeight};});
 assert.ok(bounds.textBottom<=bounds.bottom+1&&bounds.bottom<=bounds.h+1);await page.screenshot({path:path.join(out,'fullscreen-mobile.png')});pass('Landscape fullscreen frame and textbox fit');
 if(process.env.VNKIT_MOVIE_CHECKPOINT){
  await page.evaluate(()=>document.exitFullscreen());await page.locator('#saveFile').setInputFiles(path.resolve(process.env.VNKIT_MOVIE_CHECKPOINT));
  await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&v.videoWidth>0&&v.currentTime>0;},null,{timeout:45000});
  const source=(await read()).state.pending.id;await page.locator('#pauseButton').click();const t=await page.locator('video.script-media').evaluate(v=>v.currentTime);await page.waitForTimeout(700);assert.equal(await page.locator('video.script-media').evaluate(v=>v.currentTime),t);await page.locator('#pauseButton').click();
  await page.locator('video.script-media').evaluate(v=>{v.currentTime=v.duration-.2;});await page.locator('video.script-media').waitFor({state:'detached',timeout:20000});await ready();assert.notEqual((await read()).state.pending.id,source);report.movies++;pass('Source-reached movie checkpoint decodes, pauses and resumes the story after completion');
 }
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-5000);await page.screenshot({path:path.join(out,'failure.png')});}console.error(error.stack,report.visibleText);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
