// Actual PS1 content, isolated HTTP/save server and disposable browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {plainText} from '../web/engine.mjs';
const root=path.resolve(import.meta.dirname,'..'),library=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),game='memoriesoff-slps02296';
await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',b=>stderr+=b);
const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{server.kill();reject(Error(stderr||'Server timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(timer);resolve(+b.toString().trim());});server.on('exit',c=>{clearTimeout(timer);reject(Error(`Server ${c}: ${stderr}`));});});
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),name=process.env.VNKIT_BROWSER||'chromium';
const report={browser:name,segments:0,checks:[],errors:[]};let browser,page;
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 browser=await api[name].launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850},...(name==='chromium'?{permissions:['clipboard-read','clipboard-write']}:{})});
 await context.addInitScript(()=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));window.testAudio=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.testAudio.add(this);return play.call(this);};});
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')),null,{timeout:45000});
 const read=(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'one',exact:true}).click();
 const row=page.locator('.one-game').filter({hasText:'Memories Off'});await row.locator('summary').click();
 await row.getByRole('button',{name:'Sound test',exact:true}).click();await page.locator('.sound-track').first().waitFor();
 assert.deepEqual(await page.locator('.sound-track').evaluateAll(nodes=>nodes.map(n=>n.dataset.asset)),Array.from({length:16},(_,n)=>`music:${n}`));
 assert.equal(await page.locator('.sound-track').first().textContent(),'Track 01');
 for(let n=0;n<16;n++){
  await page.locator('.sound-track').nth(n).click();
  await page.waitForFunction(()=>{const p=document.querySelector('.sound-test-player');return p&&!p.paused&&p.readyState>=2&&p.currentTime>0;},null,{timeout:30000});
 }
 await page.getByRole('button',{name:'Stop',exact:true}).click();
 assert.ok(await page.locator('.sound-test-player').evaluate(p=>p.paused&&p.currentTime===0));
 await page.locator('.sound-track').first().click();await page.waitForFunction(()=>!document.querySelector('.sound-test-player').paused);
 await page.evaluate(()=>{window.testSoundPlayer=document.querySelector('.sound-test-player');});
 await page.getByRole('button',{name:'Main menu',exact:true}).click();
 assert.ok(await page.evaluate(()=>window.testSoundPlayer.paused&&!window.testSoundPlayer.hasAttribute('src')));
 for(const key of ['autosave','progress','activity'])assert.equal(await read(key),undefined);
 pass('Inactive sound test plays all 16 tracks in source order; stop/close release audio without saves, progress or activity');
 await row.locator('summary').click();await row.getByRole('button',{name:'Read / resume',exact:true}).click();await ready();pass('one library launches the exact PS1 import');
 let music=false,voice=false;
 for(let step=0;step<500&&report.segments<150;step++){
  await ready();const save=await read(),p=save.state.pending;
  if(save.state.scene.music&&!music){await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/music/')&&a.readyState>=2&&!a.paused&&a.currentTime>0));music=true;}
  if(p.voice&&!voice){await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/voice/')&&a.readyState>=2&&!a.paused&&a.currentTime>0));voice=true;}
  if(p.kind==='text'){assert.equal(await page.locator('#sentence').textContent(),plainText(p.displayText));assert.equal(await page.locator('#sentence canvas').count(),0);report.segments++;}
  if(p.kind==='choice')await page.locator('#choices button').first().click();else await page.locator('#nextButton').click();
 }
 assert.equal(report.segments,150);assert.ok(music&&voice);pass('150 source text segments; original music and XA voice play');
 await ready();await page.screenshot({path:path.join(out,'reader.png')});const before=await read(),activity=await read('activity');
 await page.locator('#sentence').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});assert.ok(await page.evaluate(()=>getSelection().toString()));await page.evaluate(()=>getSelection().removeAllRanges());
 await page.locator('#copyButton').click();if(name==='chromium')assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),plainText(before.state.pending.text));pass('Selectable Japanese and Copy');
 await page.reload();await row.locator('summary').click();await row.getByRole('button',{name:'Read / resume',exact:true}).click();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);assert.equal((await read('activity')).sessions.reduce((n,s)=>n+s.characters,0),activity.sessions.reduce((n,s)=>n+s.characters,0));pass('Reload and resume restore source position without recounting');
 const slot=()=>page.locator('.slot').filter({hasText:/^slot 1 ·/});
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 15 ·/}).waitFor();assert.equal(await page.locator('.slot').filter({hasText:/^slot \d+ ·/}).count(),15);await slot().getByRole('button',{name:'Save',exact:true}).click();await page.locator('#closePanel').click();await page.locator('#nextButton').click();await ready();
 await page.locator('#savesButton').click();await slot().getByRole('button',{name:'Load',exact:true}).click();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);pass('15 save slots and source-state loading');
 await page.locator('#nextButton').click();await ready();await page.locator('#previousButton').click();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);pass('Previous line');
 await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#choices button'),null,{timeout:60000});await ready();const choice=await read();assert.deepEqual(await page.locator('#choices button').allTextContents(),choice.state.pending.options.map(x=>plainText(x.text)));await page.screenshot({path:path.join(out,'choices.png')});await page.locator('#choices button').last().click();await ready();pass('Next choice executes the VM and accepts an original option');
 await page.setViewportSize({width:915,height:412});await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement);const b=await page.locator('#stage').boundingBox();assert.ok(b.y+b.height<=await page.evaluate(()=>innerHeight)+.5);await page.screenshot({path:path.join(out,'fullscreen.png')});pass('Landscape fullscreen geometry');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-2000);await page.screenshot({path:path.join(out,'failure.png')});}console.error(error.stack);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
