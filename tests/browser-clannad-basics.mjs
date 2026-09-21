// Actual source-reached checkpoints; isolated browser profile, no user save edits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {ClannadEngine} from '../web/adapters/clannad-engine.mjs';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),base=process.env.VNKIT_URL||'http://127.0.0.1:8891',game='clannad-slpm66302-1.01';
const input=path.resolve(process.env.VNKIT_CHECKPOINTS||'private/clannad/basics-audit/campaign2'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/clannad-basics');await fs.mkdir(out,{recursive:true});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const browser=await chromium.launch({headless:true,args:process.env.VNKIT_CRT_PRESET?['--enable-unsafe-swiftshader']:[]}),report={coverage:'Real reached checkpoints and 100 consecutive text pages after the old event-41 boundary; distinct from entry coverage',checks:[],errors:[],pages:0};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const loadJSON=async u=>JSON.parse(await fs.readFile(path.join(root,'private/library/clannad-live',u)));
const ref=await ClannadEngine.create(await loadJSON('content.json'),{loadJSON});let page;
const get=async(k='autosave')=>page.evaluate(async([g,k])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
async function importSave(file){await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>!(await page.locator('#status').getAttribute('class'))?.includes('error'),'save import status');await sleep(100);}
async function comparable(e){while(['wait'].includes(e.current?.kind))await e.advance();return e.current;}
async function ready(){await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled||document.querySelector('#choices button'),{timeout:60000});}
try{
 const context=await browser.newContext({viewport:{width:1360,height:960},permissions:['clipboard-read','clipboard-write']});
 await context.addInitScript(()=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,websocket:false}));window.__audio=[];const Original=Audio;window.Audio=class extends Original{constructor(...a){super(...a);window.__audio.push(this);}};});
 if(process.env.VNKIT_CRT_PRESET){await context.addInitScript(p=>localStorage.setItem('vnkit.crt.v1',JSON.stringify({enabled:true,preset:p})),process.env.VNKIT_CRT_PRESET);report.crtEnabled=true;}
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(`${base}/?game=${game}`);await ready();
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Enable audio',exact:true}).click();await page.locator('#closePanel').click();
 const checkpoint=JSON.parse(await fs.readFile(path.join(input,'feature-native-41.json')));await ref.restore(checkpoint);await comparable(ref);await importSave(path.join(input,'feature-native-41.json'));await ready();
 let choices=0;for(let n=0;n<200&&report.pages<100;n++){
  const p=await comparable(ref);if(p.kind==='end')break;await ready();
  await pollBrowser(async()=>(await get())?.state.pending?.id===p.id,'matching source boundary',60000);
  if(p.kind==='text'){assert.equal(await page.locator('#sentence').textContent(),p.displayText??p.text);report.pages++;}
  if(p.kind==='choice'){choices++;await ref.advance(p.options[0].id);await page.locator('#choices button').first().click();}
  else{await ref.advance();await page.locator('#nextButton').click();}
 }
 if(process.env.VNKIT_CRT_PRESET){await page.waitForSelector('#art.crt-active');assert.equal(await page.locator('.crt-screen').count(),1);}
 assert.equal(report.pages,100);report.choices=choices;pass('100 successive actual text pages beyond the old native-41 boundary match VM execution');
 await ready();await page.locator('#savesButton').click();await page.locator('.slot').nth(17).waitFor();assert.equal(await page.locator('.slot').count(),18);const slot=page.locator('.slot').filter({hasText:/^slot 15 ·/});await slot.getByRole('button',{name:'Save',exact:true}).click();await pollBrowser(async()=>!!await get('slot 15'),'slot 15');await page.locator('#closePanel').click();pass('15 manual save slots remain available alongside automatic slots');
 // Choice navigation followed by both branches and save restoration.
 await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#choices button'));const choice=await get();assert.equal(choice.state.pending.kind,'choice');
 const choiceFile=path.join(out,'choice.json');await fs.writeFile(choiceFile,JSON.stringify(choice),{flag:'wx'});
 const branchStates=[];for(const option of choice.state.pending.options.slice(0,2)){
  await importSave(choiceFile);await ready();await ref.restore(choice);ref.applyProgress(await get('progress'));await ref.advance(option.id);await comparable(ref);
  await page.locator('#choices button').nth(Number(option.id)).click();await ready();await pollBrowser(async()=>(await get())?.state.pending?.id===ref.current.id,'branch text');const actual=await get();assert.deepEqual(actual.state.vars,ref.state.vars);branchStates.push(actual.state);
 }
 assert.equal(branchStates.length,2);assert.notEqual(JSON.stringify(branchStates[0]),JSON.stringify(branchStates[1]));pass('Next choice executes source state; both alternatives and restoring the choice match subsequent VM text/variables');
 // Source-linked movie plays, saves a real media position, then resumes script.
 await importSave(path.join(input,'feature-MVPL.json'));await page.locator('video.script-media').waitFor();await page.locator('video').evaluate(v=>v.play());await page.waitForFunction(()=>document.querySelector('video')?.currentTime>.5);
 await page.keyboard.press('Alt+s');await pollBrowser(async()=>(await get('quicksave'))?.media.scriptMedia?.time>.4,'movie quicksave');const movie=await get('quicksave');
 await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await pollBrowser(async()=>(await get())?.media.scriptMedia?.time>.4,'movie autosave');
 await page.reload();await page.locator('video.script-media').waitFor();assert.ok(await page.locator('video').evaluate(v=>v.currentTime>=.3));
 await page.locator('video').evaluate(async v=>{if(!Number.isFinite(v.duration))await new Promise(r=>v.addEventListener('loadedmetadata',r,{once:true}));v.currentTime=v.duration-.2;await v.play();});
 await page.waitForFunction(()=>!document.querySelector('video.script-media'),{timeout:20000});pass('Actual MVPL movie plays, resumes saved position and returns to its source script after seeking to the end');
 // Immediate source voice must finish before VCWT releases, without a second full-duration delay.
 const iv=JSON.parse(await fs.readFile(path.join(input,'feature-VCWT.json')));assert.ok(iv.state.immediateVoice);
 iv.media={voice:{asset:iv.state.immediateVoice.asset,time:iv.state.immediateVoice.elapsedMs/1000,paused:false}};
 const ivf=path.join(out,'immediate-voice.json');await fs.writeFile(ivf,JSON.stringify(iv),{flag:'wx'});await importSave(ivf);
 await page.waitForFunction(()=>window.__audio[1].currentTime>0&&!window.__audio[1].paused);
 assert.equal((await get()).state.pending.voiceWait,true);
 await page.locator('#settingsButton').click();const voiceTime=await page.evaluate(()=>window.__audio[1].currentTime);await sleep(200);assert.ok(Math.abs((await page.evaluate(()=>window.__audio[1].currentTime))-voiceTime)<.1);await page.locator('#closePanel').click();
 await page.evaluate(()=>{const a=window.__audio[1];a.currentTime=Math.max(0,a.duration-.15);});
 await pollBrowser(async()=>{await page.evaluate(()=>dispatchEvent(new Event('pagehide')));return (await get())?.state.pending.id!==iv.state.pending.id;},'immediate voice completion',2000);pass('VPL2 plays its actual clip; panels pause it and VCWT resumes promptly on audio completion');
 // Ending globals persist separately from old saves and seed new runs.
 const endFile=path.join(input,'end-4.json'),end=JSON.parse(await fs.readFile(endFile));
 const progress={format:'vnkit.progress',version:1,gameId:game,gameSignature:end.gameSignature,globals:end.state.vars.G};
 // Importing an actual earned progress backup is explicit, not fabricated unlock flags.
 const pf=path.join(out,'earned-progress.json');await fs.writeFile(pf,JSON.stringify(progress),{flag:'wx'});page.on('dialog',d=>d.accept());await page.locator('#progressFile').setInputFiles(pf);await pollBrowser(async()=>JSON.stringify((await get('progress'))?.globals)===JSON.stringify(progress.globals),'earned progress import');
 await importSave(choiceFile);assert.deepEqual((await get('progress')).globals,progress.globals);
 await page.locator('#libraryButton').click();await page.locator('.game-card').filter({hasText:'CLANNAD'}).getByRole('button',{name:'Start again',exact:true}).click();await ready();
 const newer=await get('progress');for(const[k,v]of Object.entries(progress.globals))if(k!=='73')assert.equal(newer.globals[k],v);pass('Earned global progress survives old-save restoration and Start again');
 await page.setViewportSize({width:412,height:915});await page.screenshot({path:path.join(out,'mobile.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));pass('Mobile layout retains the game and controls without horizontal overflow');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();}
