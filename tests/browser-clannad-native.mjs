// Actual source-reached checkpoints. These are separate from contiguous coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-native');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],coverage:'Source-reached checkpoints; not contiguous opening coverage'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const check=name=>{report.checks.push(name);console.log('PASS '+name);};
const browser=await chromium.launch({headless:true});
async function pending(page){return page.evaluate(async game=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const p=(await s.get(game+':autosave'))?.state.pending;s.db.close();return p;},game);}
try{
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.addInitScript(()=>{
  localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,autoDelay:500}));
  window.__testAudio=[];const NativeAudio=window.Audio;
  window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.__testAudio.push(this);this.addEventListener('ended',()=>{this.__endedAt=performance.now();});}};
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/?game=${game}`);await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 const voiceSave=JSON.parse(await fs.readFile(path.join(root,'private/clannad/voice-checkpoint.json'))),voiceId=voiceSave.state.pending.id;
 await page.locator('#saveFile').setInputFiles(path.join(root,'private/clannad/voice-checkpoint.json'));
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('restored'));
 assert.equal((await pending(page)).id,voiceId);
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 await page.locator('#autoButton').click();await sleep(1600);
 const playing=await page.evaluate(()=>{const a=window.__testAudio[1];return {time:a.currentTime,duration:a.duration,ended:a.ended,paused:a.paused};});
 assert.ok(playing.time>1&&playing.time<playing.duration&&!playing.ended&&!playing.paused);assert.equal((await pending(page)).id,voiceId);
 await page.waitForFunction(()=>window.__testAudio[1].__endedAt>0);const endedAt=await page.evaluate(()=>window.__testAudio[1].__endedAt);
 await pollBrowser(async()=>(await pending(page))?.id!==voiceId,'dialogue after voice completion');
 assert.ok(await page.evaluate(()=>performance.now())>=endedAt);await page.locator('#autoButton').click();
 report.voice={source:voiceId,asset:voiceSave.state.pending.voice,duration:playing.duration};check('Auto waits for the original Japanese voice to finish before advancing');
 await page.locator('#saveFile').setInputFiles(path.join(root,'private/clannad/rotation-checkpoint.json'));
 await page.waitForFunction(()=>document.querySelector('.scene-layer')?.style.transform.startsWith('rotate('));
 await sleep(700);await page.locator('#settingsButton').click();
 const angle=await page.locator('.scene-layer').first().evaluate(e=>parseFloat(e.style.transform.slice(7)));assert.ok(angle<0);
 const held=await page.locator('.scene-layer').first().evaluate(e=>e.style.transform);await sleep(400);
 assert.equal(await page.locator('.scene-layer').first().evaluate(e=>e.style.transform),held);
 await page.screenshot({path:path.join(out,'rotation-paused.png')});
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);
 const remaining=(await pending(page)).remainingMs;assert.ok(remaining>0&&remaining<500);
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 assert.equal(await page.locator('.scene-layer').count(),0);
 const after=await pending(page);assert.equal(after.boundary,'SEEN0415.MZX:0000d68e');
 check('Native rotation uses original artwork, pauses, restores remaining time and resumes the original text boundary');
 await page.locator('#saveFile').setInputFiles(path.join(root,'private/clannad/eyecatch-checkpoint.json'));
 await page.waitForFunction(()=>document.querySelector('.clannad-eyecatch'));
 assert.equal(await page.locator('#textbox').isHidden(),true);
 assert.equal(await page.locator('#stage').evaluate(e=>e.style.getPropertyValue('--game-aspect')),'640/480');
 await page.locator('.clannad-eyecatch img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 await sleep(2500);await page.screenshot({path:path.join(out,'eyecatch-visible.png')});await page.locator('#settingsButton').click();
 const strip=page.locator('.clannad-eyecatch img').nth(1),row=await strip.evaluate(e=>e.style.top);assert.ok(parseFloat(row)<0);
 await sleep(300);assert.equal(await strip.evaluate(e=>e.style.top),row);await page.screenshot({path:path.join(out,'eyecatch-paused.png')});
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(100);
 const rest=(await pending(page)).remainingMs;assert.ok(rest>4000&&rest<6000);
 await page.reload();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 assert.equal(await page.locator('.clannad-eyecatch').count(),0);assert.equal((await pending(page)).id,'SEEN6900.MZX:000004fd');
 assert.equal(await page.locator('#stage').evaluate(e=>e.style.getPropertyValue('--game-aspect')),'640/448');
 const finalBackground=await page.evaluate(async game=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const state=(await s.get(game+':autosave')).state;s.db.close();return [state.scene.background,state.nextBackground];},game);
 assert.deepEqual(finalBackground,['image:628','image:628']);
 check('Original interlude background/title strip animate, pause and restore before the correct final scene and script text');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.errors.push(e.stack||e.message);report.passed=false;process.exitCode=3;}
finally{await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
