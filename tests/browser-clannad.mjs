// Private actual-game browser evidence. Fresh profile, real script waits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL||'http://127.0.0.1:8891';
const game='clannad-slpm66302-1.01';
const target=Number(process.env.VNKIT_SEGMENTS||310);if(!Number.isInteger(target)||target<310||target>10000)throw new Error('VNKIT_SEGMENTS must be 310..10000');
const out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad');await fs.mkdir(out,{recursive:true});
const report={game,realScriptWaits:true,mainPathTextSegments:0,choices:0,checks:[],errors:[],limitations:['Original PS2 execution comparison unavailable','Physical Z13/Android, Firefox and Yomitan untested','Native visual degradations documented separately']};
const browser=await chromium.launch({headless:true});let ws;
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function stored(page,key='autosave') {return page.evaluate(async([game,key])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const value=await s.get(`${game}:${key}`);s.db.close();return value;},[game,key]);}
const total=a=>a.sessions.reduce((n,s)=>n+s.characters,0);
async function ready(page) {
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')||/Unresolved|Unsupported|Invalid|(?:Original resource|Background|Sprite) unavailable:|differs from source/.test(document.querySelector('#status').textContent),{},{timeout:25000});
 const error=await page.locator('#status').textContent();if(/Unresolved|Unsupported|Invalid|(?:Original resource|Background|Sprite) unavailable:|differs from source/.test(error))throw new Error(error);
 await pause(50);
}
try {
 const session=await (await fetch(base+'/api/session')).json(),events=[];
 ws=new WebSocket(session.structuredWsUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
 ws.onmessage=m=>events.push(JSON.parse(m.data));
 const context=await browser.newContext({viewport:{width:1280,height:900},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(()=>{
  localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,websocket:true}));
  const OriginalAudio=Audio;window.__vnAudio=[];window.Audio=class extends OriginalAudio{constructor(...a){super(...a);window.__vnAudio.push(this);}};
 });
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/?game=${game}`);await ready(page);
 const first=await page.locator('#sentence').textContent();assert.ok(first.length>5);
 const initial=await stored(page);assert.equal(initial.state.script,'SEEN6900.MZX');
 await page.locator('#sentence').evaluate(node=>{const range=document.createRange();range.selectNodeContents(node);getSelection().removeAllRanges();getSelection().addRange(range);});
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#sentence').textContent(),first);
 await page.locator('#sentence').click();assert.equal(await page.locator('#sentence').textContent(),first);
 await page.evaluate(()=>getSelection().removeAllRanges());
 await page.locator('#copyButton').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),first);
 pass('Actual Japanese is selectable DOM; selection/textbox interaction does not advance; device clipboard succeeds');
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 await page.waitForFunction(()=>window.__vnAudio[0]?.currentTime>0);
 pass('Source music plays in Chromium');
 await page.screenshot({path:path.join(out,'opening.png')});
 let checkedChoice=false,seenVoice=false;const mainOccurrences=new Set();
 while(report.mainPathTextSegments<target){
  await ready(page);const current=(await stored(page)).state.pending;
  if(current.kind==='text'){
   if(!mainOccurrences.has(current.occurrenceId)){mainOccurrences.add(current.occurrenceId);report.mainPathTextSegments++;if(report.mainPathTextSegments%100===0)console.log(`Actual Chromium pages: ${report.mainPathTextSegments}`);}
   if(current.voice&&!seenVoice){
    await page.waitForFunction(()=>window.__vnAudio[1]?.readyState>=2&&window.__vnAudio[1].currentTime>0);
    assert.equal(await page.evaluate(()=>window.__vnAudio[1].error),null);seenVoice=true;
    pass('Script-associated original voice decodes and plays');
   }
   if(report.mainPathTextSegments===80){await page.locator('#art img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));await page.screenshot({path:path.join(out,'scene.png')});}
  }
  if(current.kind==='choice'){
   report.choices++;
   if(!checkedChoice){
    await page.locator('#quickSaveButton').click();await pause(80);const before=await stored(page,'quicksave');
    await page.locator('#choices button').first().click();await ready(page);const a=await stored(page);
    await page.locator('#quickLoadButton').click();await pause(80);assert.equal((await stored(page)).state.pending.id,before.state.pending.id);
    await page.locator('#choices button').first().click();await ready(page);const b=await stored(page);
    assert.equal(a.state.pending.id,b.state.pending.id);assert.equal(a.state.pending.text,b.state.pending.text);assert.deepEqual(a.state.vars,b.state.vars);
    await page.locator('#quickLoadButton').click();await pause(80);await page.locator('#choices button').nth(1).click();await ready(page);const other=await stored(page);assert.notEqual(other.state.pending.id,a.state.pending.id);
    await page.locator('#quickLoadButton').click();await pause(80);checkedChoice=true;
    pass('Both first-choice branches execute in browser; choice quicksave reproduces text and variables');
   }
   await page.locator('#choices button').first().click();
  }else await page.locator('#nextButton').click();
  await pause(35);
 }
 assert.ok(checkedChoice&&seenVoice);await ready(page);
 const beforeSave=(await stored(page)).state.pending;
 await page.locator('#quickSaveButton').click();await pause(80);
 await page.locator('#nextButton').click();await ready(page);const afterSave=(await stored(page)).state.pending;
 const historyBefore=await stored(page,'activity'),eventCount=events.length;
 await page.locator('#quickLoadButton').click();await pause(150);
 assert.equal((await stored(page)).state.pending.id,beforeSave.id);assert.equal(total(await stored(page,'activity')),total(historyBefore));assert.equal(events.length,eventCount);
 await page.locator('#nextButton').click();await ready(page);assert.equal((await stored(page)).state.pending.id,afterSave.id);
 pass('Text quicksave/load preserves subsequent source text; restored text is not recounted or emitted');
 const beforeReload=await stored(page,'activity'),reloadEvents=events.length;await page.reload();await ready(page);
 assert.equal(total(await stored(page,'activity')),total(beforeReload));assert.equal(events.length,reloadEvents);
 pass('Reload resumes source state without duplicate statistics or WebSocket events');
 assert.ok(events.length>=target&&events.every(e=>e.gameId===game&&typeof e.sentence==='string'&&e.segmentId&&e.occurrenceId));assert.equal(new Set(events.map(e=>e.occurrenceId)).size,events.length);
 report.structuredEvents=events.length;pass('Independent Node WebSocket consumer receives only presented complete segments, with unique occurrence IDs');
 await page.locator('#backlogButton').click();await page.locator('input[aria-label="Search backlog"]').fill(first.slice(0,6));assert.ok(await page.locator('.entry-text').count());
 await page.locator('#closePanel').click();pass('Backlog searches encountered original text');
 await page.locator('#savesButton').click();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export current state',exact:true}).click();const file=await download;const savePath=path.join(out,'browser-save.json');await file.saveAs(savePath);
 await page.locator('#closePanel').click();await page.locator('#nextButton').click();await ready(page);
 await page.locator('#saveFile').setInputFiles(savePath);await pause(100);
 assert.equal((await stored(page)).state.pending.id,JSON.parse(await fs.readFile(savePath,'utf8')).state.pending.id);pass('Exported actual-game save imports and restores');
 await page.locator('#settingsButton').click();await page.getByLabel('Automatically copy new narrative text on this device').check();await page.locator('#closePanel').click();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new DOMException('Test denial','NotAllowedError');}}}));
 await page.locator('#nextButton').click();await ready(page);await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Automatic copy unavailable'));
 pass('Automatic clipboard denial produces an actionable local-browser status without blocking reading');
 await page.setViewportSize({width:412,height:915});await page.screenshot({path:path.join(out,'mobile.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await page.locator('#sentence').isVisible());
 await page.setViewportSize({width:1024,height:768});await page.screenshot({path:path.join(out,'tablet.png')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 pass('Desktop, tablet and mobile viewports retain Japanese text without horizontal overflow');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.errors.push(error.message);report.passed=false;process.exitCode=3;}
finally{ws?.close();await browser.close();await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
