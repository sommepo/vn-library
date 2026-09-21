// Private source-reached checkpoints only. No original text/assets in this harness.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const input=path.resolve(process.env.VNKIT_CHECKPOINTS||'private/clannad/menu-audit'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-menu');await fs.mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const browser=await chromium.launch({headless:true}),report={checks:[],errors:[],coverage:'Private source checkpoints plus explicit manual-progress tests; not natural After Story completion'};let page;
const pass=n=>{report.checks.push(n);console.log('PASS '+n);};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const get=async(k='autosave')=>page.evaluate(async([g,k])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
const ready=async()=>{await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled||document.querySelector('#choices button'),{timeout:60000});};
async function load(file){const saved=JSON.parse(await fs.readFile(file));await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await get())?.state.pending?.id===saved.state.pending?.id,'restore source save',60000);}
try{
 const context=await browser.newContext({viewport:{width:1360,height:960}});await context.addInitScript(()=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`${base}/?game=${game}`);await ready();
 const portrait=JSON.parse(await fs.readFile(path.join(input,'source-portrait.json'))),content=JSON.parse(await fs.readFile(path.join(root,'private/library/clannad-live/content.json')));
 const face=portrait.state.scene.layers.at(-1).asset,faceURL=content.assets[face].url;
 let release,requested=false;const gate=new Promise(r=>release=r);
 await page.route(`**/${faceURL}`,async r=>{requested=true;await gate;await r.continue();});
 const oldArt=await page.locator('#art').innerHTML();
 await page.locator('#saveFile').setInputFiles(path.join(input,'source-portrait.json'));
 await pollBrowser(async()=>requested,'delayed face request');await page.locator('#loadNotice').waitFor();
 assert.equal(await page.locator('#art').innerHTML(),oldArt);assert.equal(await page.locator('#nextButton').isDisabled(),true);
 release();await pollBrowser(async()=>(await get())?.state.pending?.id===portrait.state.pending.id,'portrait restore');await ready();
 assert.ok(await page.locator('#art img').evaluateAll(images=>images.length>=4&&images.every(i=>i.complete&&i.naturalWidth>0)));
 assert.ok((await page.locator('#art .calendar').getAttribute('src')).endsWith('/00258.png'));
 await page.screenshot({path:path.join(out,'date-portrait.png')});pass('Delayed face keeps old complete scene visible; new body, face and original date badge commit together');
 await page.unroute(`**/${faceURL}`);
 await page.locator('#libraryButton').click();await page.route('**/content.json',r=>r.fulfill({status:503,body:'test failure'}));
 await page.locator('.game-card').filter({hasText:'CLANNAD'}).getByRole('button',{name:'Start again',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#panelStatus').classList.contains('error'));
 assert.match(await page.locator('#panelStatus').innerText(),/503/);assert.equal((await get()).state.pending.id,portrait.state.pending.id);
 await page.unroute('**/content.json');await page.locator('.game-card').filter({hasText:'CLANNAD'}).getByRole('button',{name:'Read / resume',exact:true}).click();await ready();await page.waitForFunction(()=>!document.querySelector('#panel').open);pass('Failed Start again shows visible menu error and retains save; Read/resume succeeds on retry');
 const second=await context.newPage();await second.goto(`${base}/?game=${game}`);await second.waitForFunction(()=>document.querySelector('#panelStatus').classList.contains('error'));assert.match(await second.locator('#panelStatus').innerText(),/another reader tab/);await second.close();pass('Already-open reader reports ownership conflict inside the menu');
 await load(path.join(input,'source-before-end.json'));await ready();const statsBefore=await get('activity');
 await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#panel').open&&document.querySelector('#panelTitle').textContent.includes('Ending reached'),{timeout:60000});
 await pollBrowser(async()=>(await get('progress'))?.globals?.[13]===1,'earned Misae completion');
 await page.locator('.console-progress summary').click();assert.match(await page.locator('#panelBody').innerText(),/Completed:.*Misae/);const progress=await get('progress');assert.equal(progress.completions?.misae,undefined);
 const statsAfter=await get('activity');assert.deepEqual(statsAfter.seen,statsBefore.seen);pass('Next choice reaches actual Misae ending, opens main menu and preserves earned native completion without reading credit');
 await page.locator('.game-card').filter({hasText:'CLANNAD'}).getByRole('button',{name:'Start again',exact:true}).click();await ready();assert.equal((await get('progress')).globals[13],1);pass('Start again leaves ending, resets story and keeps earned completion');
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 for(const id of ['tomoyo','misae-light','yukine','ryou','kyou','kappei','sunoharas','kotomi','fuko','koumura','nagisa']){
  await page.locator(`.route-progress[data-route="${id}"] button`).click();await pollBrowser(async()=>(await get('progress'))?.completions?.[id]?.method==='manual','manual '+id);
 }
 const manual=await get('progress');assert.equal(manual.globals[0],8);assert.equal(manual.globals[73],2);assert.ok(await get('progress-before-debug'));
 const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Export global progress',exact:true}).click();const download=await exported;const backupPath=path.join(out,'manual-progress.json');await download.saveAs(backupPath);assert.deepEqual(JSON.parse(await fs.readFile(backupPath)),manual);
 await page.getByRole('button',{name:'AFTER STORY',exact:true}).click();await ready();assert.equal((await get('progress')).globals[73],2);pass('Each School Life route/light is manually markable; idempotent native flags unlock an executable AFTER STORY entry (manual test)');
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'Sound test',exact:true}).click();assert.equal(await page.locator('.sound-track').count(),53);
 await page.locator('.sound-track[data-asset="music:43"]').click();await page.waitForFunction(()=>document.querySelector('.sound-test-player').currentTime>.2);
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(150);const stateBefore=await get();await page.getByRole('button',{name:'Stop',exact:true}).click();assert.ok(await page.locator('.sound-test-player').evaluate(a=>a.paused));
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await sleep(150);assert.equal((await get()).state.pending.id,stateBefore.state.pending.id);await page.locator('#closePanel').click();pass('Sound test lists all 53 BGM assets, plays original vocal track, stops and leaves story position unchanged');
 await page.setViewportSize({width:412,height:915});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(out,'mobile.png')});pass('Mobile layout remains within viewport');
 await page.reload();await ready();assert.deepEqual((await get('progress')).completions,manual.completions);
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'Route progress / debug…',exact:true}).click();assert.ok(await page.locator('.route-progress[data-route="ryou"] button').isDisabled());
 const invalid={...manual,gameId:'different-game'},invalidPath=path.join(out,'wrong-game-progress.json');await fs.writeFile(invalidPath,JSON.stringify(invalid),{flag:'wx'});await page.locator('#progressFile').setInputFiles(invalidPath);await page.waitForFunction(()=>document.querySelector('#panelStatus').classList.contains('error'));assert.deepEqual((await get('progress')).completions,manual.completions);pass('Completion provenance exports and survives reload; wrong-game progress import reports an error without replacing progress');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();}
