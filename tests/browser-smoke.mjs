// Optional real-browser acceptance checks. Uses only the original synthetic game.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const {chromium} = await import(pathToFileURL(process.env.VNKIT_PLAYWRIGHT_MODULE || path.join(root, 'private/tooling/playwright/package/index.mjs')));
const base = process.env.VNKIT_URL || 'http://127.0.0.1:8891';
const output = path.join(root, 'private/browser-tests');
await fs.mkdir(output, {recursive:true});
const browser = await chromium.launch({headless:true});
const checks = [], errors = [];
const context = await browser.newContext({viewport:{width:1280,height:900}, permissions:['clipboard-read','clipboard-write']});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
const pass = name => {checks.push(name); console.log(`PASS ${name}`);};
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const stored = (key='activity') => page.evaluate(async key => {
  const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); const result=await s.get(`original-synthetic:${key}`);s.db.close();return result;
}, key);
const total = data => data.sessions.reduce((n,s)=>n+s.characters,0);
const close = () => page.locator('#closePanel').click();
async function next() {
  const before = (await stored('autosave')).state.pending;
  await page.locator('#nextButton').click();
  await page.waitForFunction(async before => {
    const {Store} = await import('/storage.mjs');const s=new Store();await s.open();const p=(await s.get('original-synthetic:autosave'))?.state.pending;s.db.close();
    return p && (p.id!==before.id || p.occurrenceId!==before.occurrenceId);
  }, before);
}
try {
  await page.goto(base + '/?fixture=1');
  await page.getByRole('button',{name:'Read / resume',exact:true}).first().waitFor();
  const fixtureCard = page.locator('.game-card').filter({hasText:'小さな読書の道'});
  await fixtureCard.getByRole('button',{name:'Read / resume',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#sentence').textContent.includes('これは'));
  await page.waitForFunction(async()=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();return Boolean(await s.get('original-synthetic:autosave'));});
  assert.match(await page.locator('#gameBadge').textContent(),/SYNTHETIC/);
  assert.equal(await page.locator('#sentence ruby rt').textContent(),'どくしょ');
  assert.equal(await page.locator('#sentence span').count(),0);
  await page.locator('.background').evaluate(img=>img.decode());
  pass('Original fixture explicitly labelled; DOM Japanese/ruby and original media render');

  const opening = await stored('autosave'); const firstCount = total(await stored());
  await page.locator('#copyButton').click();
  const clipboard = await page.evaluate(()=>navigator.clipboard.readText());
  assert.equal(clipboard,'これは読書機能を試すための、オリジナルの短い物語です。');
  pass('Browser-device clipboard succeeds; ruby reading excluded from default export');

  await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#sentence'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);});
  await page.keyboard.press('Space');
  assert.equal((await stored('autosave')).state.pending.id,'opening');
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.locator('#sentence').click();
  assert.equal((await stored('autosave')).state.pending.id,'opening');
  await page.locator('#textbox').dispatchEvent('touchstart');
  await page.locator('#textbox').dispatchEvent('touchmove');
  assert.equal((await stored('autosave')).state.pending.id,'opening');
  pass('Selection, textbox clicks and synthetic touch events do not advance');

  await page.locator('#quickSaveButton').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Quicksave'));
  await next(); await next();
  assert.equal((await stored('autosave')).state.pending.id,'repeat-b');
  assert.equal((await stored()).backlog.filter(p=>p.text==='風が、静かに吹いている。').length,2);
  pass('Identical sentences at different source locations are retained');
  const beforeRestore = total(await stored());
  await page.locator('#quickLoadButton').click();
  await page.waitForFunction(()=>document.querySelector('#sentence').textContent.includes('これは'));
  assert.equal(total(await stored()),beforeRestore);
  assert.deepEqual((await stored('autosave')).state, opening.state);
  pass('Quicksave/load restores full state and current occurrence without rolling back activity');

  await page.locator('#skipButton').click();
  await page.waitForFunction(()=>document.querySelectorAll('#choices button').length===2);
  assert.equal(total(await stored()),beforeRestore);
  assert.equal(await page.locator('#skipButton').getAttribute('aria-pressed'),'false');
  const choiceSave = await stored('autosave');
  pass('Skip-read contributes zero characters and stops at a choice');

  await page.locator('#quickSaveButton').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Quicksave'));
  await page.locator('#choices button').first().click();
  await page.waitForFunction(()=>document.querySelector('#sentence').textContent.includes('木々'));
  const forestSave = await stored('autosave');
  assert.equal(forestSave.state.vars.route,1);
  assert.equal(forestSave.state.scene.background,'forest');
  await next(); assert.equal((await stored('autosave')).state.stack.length,1);
  await next(); assert.match(await page.locator('#sentence').textContent(),/森を選んだ/);
  await page.locator('#quickLoadButton').click();
  await page.waitForFunction(()=>document.querySelectorAll('#choices button').length===2);
  assert.deepEqual((await stored('autosave')).state,choiceSave.state);
  await page.locator('#choices button').last().click();
  await page.waitForFunction(()=>document.querySelector('#sentence').textContent.includes('波の音'));
  assert.equal((await stored('autosave')).state.vars.route,2);
  assert.equal((await stored('autosave')).state.scene.background,'shore');
  await next();await next();assert.match(await page.locator('#sentence').textContent(),/海を選んだ/);
  pass('Both choice paths, conditions, call/return and scene composition match restored state');

  const activityBeforeReload = total(await stored()); const stateBeforeReload=(await stored('autosave')).state;
  await page.reload(); await page.locator('.game-card').filter({hasText:'小さな読書の道'}).getByRole('button',{name:'Read / resume',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Resumed'));
  assert.equal(total(await stored()),activityBeforeReload);
  assert.deepEqual((await stored('autosave')).state,stateBeforeReload);
  pass('Reload/resume preserves current segment and study history without recounting');

  const session = await (await fetch(base+'/api/session')).json();
  const messages=[];const ws=new WebSocket(session.structuredWsUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=message=>messages.push(JSON.parse(message.data));
  await page.locator('#settingsButton').click();
  await page.getByLabel('Publish newly presented text to the local WebSocket relay').check();
  await close();
  const companion=await context.newPage();await companion.goto(base+'/live.html');await page.bringToFront();
  await next(); await wait(150);
  assert.equal(messages.length,1);assert.equal(messages[0].format,'vnkit.text-event');assert.equal(typeof messages[0].sentence,'string');
  await companion.waitForFunction(()=>document.querySelectorAll('#liveEntries .entry').length===1);
  await page.locator('#quickSaveButton').click();await wait(100);await page.locator('#quickLoadButton').click();await wait(200);
  assert.equal(messages.length,1);
  pass('External native WebSocket and live page receive one logical event; restoration does not republish');
  ws.close(); await companion.close();

  let successive=0;
  while ((await stored('autosave')).state.pending.kind!=='choice') {
    await next();successive++;
    if(successive>130)throw new Error('Fixture did not reach final choice');
  }
  assert.ok(successive>=115);
  assert.equal((await stored('autosave')).state.vars.pages,115);
  assert.equal((await stored('autosave')).state.scene.background,'night');
  assert.equal(Object.keys((await stored('autosave')).state.scene.sprites).length,0);
  pass(`Read ${successive} successive fixture segments through media/timing changes (not real-game coverage)`);

  await page.locator('#backlogButton').click();await page.getByRole('textbox',{name:'Search backlog'}).fill('記録115');
  assert.equal(await page.locator('#panelBody .entry').count(),1);
  await close();
  await page.locator('#savesButton').click();
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export current state',exact:true}).click();
  const download=await downloadEvent; const saveText=await fs.readFile(await download.path(),'utf8');assert.equal(JSON.parse(saveText).format,'vnkit.save');
  await close();await page.locator('#status').evaluate(e=>e.textContent='');
  await page.locator('#saveFile').setInputFiles({name:'save.json',mimeType:'application/json',buffer:Buffer.from(saveText)});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Execution restored'));
  await page.waitForFunction(()=>!document.querySelector('#saveFile').value);
  await page.locator('#saveFile').setInputFiles({name:'wrong.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...JSON.parse(saveText),gameId:'wrong'}))});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('different game'));
  pass('Backlog searches only encountered content; save export/import works and rejects wrong game');

  await page.locator('#statsButton').click();
  const exportActivity=page.waitForEvent('download');await page.getByRole('button',{name:'Export activity JSON'}).click();
  const data=JSON.parse(await fs.readFile(await (await exportActivity).path(),'utf8'));
  assert.ok(data.backlog.length>=120);assert.ok(total(data)>firstCount);
  await page.getByRole('button',{name:'Pause activity timer'}).click();await close();
  pass('Persistent statistics/history export and manual pause control work');

  await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
  await page.setViewportSize({width:820,height:1180});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  pass('Desktop, tablet and mobile viewport layouts fit without horizontal overflow');

  const failureContext=await browser.newContext();const failurePage=await failureContext.newPage();
  await failurePage.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:()=>Promise.reject(new DOMException('Denied','NotAllowedError'))},configurable:true});document.execCommand=()=>false;localStorage.setItem('vnkit.settings',JSON.stringify({autoCopy:true}));});
  await failurePage.goto(base);await failurePage.locator('.game-card').filter({hasText:'小さな読書の道'}).getByRole('button',{name:'Read / resume',exact:true}).click();
  await failurePage.waitForFunction(()=>document.querySelector('#sentence').textContent.includes('これは'));
  await failurePage.locator('#nextButton').click();
  await failurePage.waitForFunction(()=>document.querySelector('#status').textContent.includes('Automatic copy unavailable'));
  await failurePage.locator('#copyButton').click();
  await failurePage.waitForFunction(()=>document.querySelector('#status').textContent.includes('Browser denied clipboard'));
  pass('Injected clipboard permission denial keeps understandable status and explicit alternatives');
  await failureContext.close();
  assert.deepEqual(errors,[]);pass('No uncaught browser JavaScript errors');
} finally {
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,errors,commercialGameExecutionTested:false,browser:'Playwright 1.55.0 Chromium 140',timestamp:new Date().toISOString()},null,2));
  await browser.close();
}
