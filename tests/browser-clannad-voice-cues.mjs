// Private source-reached voiced continuation, separate from opening-run coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-voice-cues');await fs.mkdir(out,{recursive:true});
const report={checks:[],errors:[],coverage:'One source-reached WTVT sequence; not contiguous opening coverage'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await chromium.launch({headless:true});
async function state(page){return page.evaluate(async game=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const result={save:await s.get(game+':autosave'),activity:await s.get(game+':activity')};s.db.close();return result;},game);}
async function untilBoundary(page,boundary){await pollBrowser(async()=>(await state(page)).save?.state.pending?.boundary===boundary,boundary);}
try{
 const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.addInitScript(()=>{
  localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));
  window.__testAudio=[];const NativeAudio=window.Audio;
  window.Audio=class extends NativeAudio{constructor(...args){super(...args);window.__testAudio.push(this);this.__loads=0;this.addEventListener('loadstart',()=>this.__loads++);}};
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/?game=${game}`);await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 const source=path.join(root,'private/clannad/voice-cue-checkpoint.json');
 await page.locator('#saveFile').setInputFiles(source);await untilBoundary(page,'SEEN3417.MZX:000035fb');
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 await sleep(1000);const before=await state(page);const first=before.save.state.pending;
 const getAudio=()=>page.evaluate(()=>{const a=window.__testAudio[1];return {time:a.currentTime,paused:a.paused,loads:a.__loads,src:a.src};});
 const playing=await getAudio();assert.ok(playing.time>.6&&playing.time<first.voiceUntilMs/1000);assert.equal(playing.paused,false);
 await page.locator('#settingsButton').click();const paused=await getAudio();await sleep(500);assert.equal((await getAudio()).time,paused.time);
 await page.locator('#closePanel').click();await untilBoundary(page,'SEEN3417.MZX:00003642');
 const second=(await state(page)).save.state.pending,secondAudio=await getAudio();
 report.observed={first:{boundary:first.boundary,voice:first.voice,cue:first.voiceUntilMs},second:{boundary:second.boundary,voice:second.voice,cue:second.voiceUntilMs,continueVoice:second.continueVoice},playing,secondAudio};
 assert.equal(second.voice,first.voice);assert.equal(second.continueVoice,true);assert.equal(secondAudio.loads,playing.loads);assert.equal(secondAudio.src,playing.src);assert.ok(secondAudio.time>=first.voiceUntilMs/1000);
 assert.equal(await page.locator('#sentence').innerText(),second.displayText);assert.ok(second.displayText.startsWith(first.text));
 report.checks.push('First source cue appends selectable Japanese text without restarting voice; dictionary panel pauses voice and cue');
 // Persist a mid-clip state while audio is playing, then reload. Restore must
 // seek the same clip and must not count or publish the existing passage again.
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(150);
 const saved=await state(page),savedTime=saved.save.media.voice.time;assert.ok(savedTime>2&&savedTime<6);
 await fs.writeFile(path.join(out,'private-mid-voice-save.json'),JSON.stringify(saved.save,null,2));
 await page.reload();await untilBoundary(page,'SEEN3417.MZX:00003642');
 const restored=await state(page);assert.deepEqual(restored.activity.seen,saved.activity.seen);
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 await page.waitForFunction(t=>window.__testAudio[1].currentTime>=t,savedTime);
 await untilBoundary(page,'SEEN3417.MZX:0000365f');
 const final=(await state(page)).save.state.pending,finalAudio=await getAudio();
 assert.equal(final.continueVoice,true);assert.equal(final.voice,first.voice);assert.equal(final.voiceUntilMs,undefined);assert.ok(finalAudio.time>=second.voiceUntilMs/1000);
 assert.equal(await page.locator('#sentence').innerText(),final.displayText);
 await sleep(1500);assert.equal((await state(page)).save.state.pending.boundary,final.boundary);
 report.checks.push('Reload resumes the same voice position, preserves reading history and stops at the final manual text boundary');
 report.source=first.boundary;report.voice=first.voice;report.cues=[first.voiceUntilMs,second.voiceUntilMs];
 await page.screenshot({path:path.join(out,'complete-voiced-page.png')});
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.errors.push(e.stack||e.message);report.passed=false;process.exitCode=3;}
finally{await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
