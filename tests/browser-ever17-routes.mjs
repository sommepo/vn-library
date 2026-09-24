// Source-earned ending checkpoints in an isolated browser and server bank.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';
import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),[library,input,out]=process.argv.slice(2).map(p=>path.resolve(p)),game='ever17-slpm65421-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let errors='';server.stderr.on('data',b=>errors+=b);
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error(errors||'Server startup timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.once('exit',c=>{clearTimeout(t);reject(Error(`Server ${c}: ${errors}`));});});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page;const report={checks:[],errors:[],scope:'Earned progress/checkpoints; no debug flags used to unlock the final route'};
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1100,height:850}});
 await page.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0})));
 page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 const read=(key='autosave')=>page.evaluate(async([g,k])=>{const {Store}=await import('/storage.mjs');const s=new Store();await s.open();const result=await s.get(g+':'+k);s.db.close();return result;},[game,key]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&!document.querySelector('#nextButton').disabled,null,{timeout:45000});
 const expand=async()=>{const d=page.locator('.game-card').filter({hasText:'Ever17'}).locator('.console-title');if(!await d.evaluate(e=>e.open))await d.locator('summary').first().click();};
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
 const opening=await read();await fs.writeFile(path.join(out,'opening.json'),JSON.stringify(opening));
 for(const id of ['tsugumi','sora','you','sara','coco-takeshi']){
  if(await page.locator('#panel').evaluate(e=>e.open))await page.locator('#closePanel').click();
  const progressFile=path.join(input,id+'-near-end-progress.json'),file=path.join(input,id+'-near-end.json');
  const p=JSON.parse(await fs.readFile(progressFile)),save=JSON.parse(await fs.readFile(file));
  await page.locator('#progressFile').setInputFiles(progressFile);
  await pollBrowser(async()=>JSON.stringify((await read('progress'))?.globals.globalBits)===JSON.stringify(p.globals.globalBits),'earned progress import');
  await page.locator('#saveFile').setInputFiles(file);
  await pollBrowser(async()=>(await read())?.state.pending?.id===save.state.pending.id,'near-ending restore');await ready();
  await page.locator('#choiceButton').click();
  await page.waitForFunction(()=>document.querySelector('#panel').open&&document.querySelector('#panelTitle').textContent==='Ending reached · Main menu'&&document.querySelector('#seekNotice').hidden,null,{timeout:45000});
  const ended=await read('progress');await fs.writeFile(path.join(out,id+'-browser-end.json'),JSON.stringify({progress:ended,save:await read()},null,2));assert.deepEqual(ended.completions,{});
  const bit={tsugumi:48,sora:49,you:53,sara:56,'coco-takeshi':58}[id];assert.equal(ended.globals.globalBits[bit],1);
  if(id==='sara')assert.equal(ended.globals.globalBits[59],1);
  pass(`${id}: source ending returns to menu and persists earned completion`);
 }
 await expand();const card=page.locator('.game-card').filter({hasText:'Ever17'});
 await card.getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 assert.equal(await page.locator('.route-progress').count(),5);assert.equal(await page.locator('.route-progress button:disabled').count(),5);
 await page.getByText('The final route is unlocked.',{exact:false}).waitFor();
 await page.screenshot({path:path.join(out,'earned-progress.png')});pass('Five earned route clears and final-route notice appear in the shared UI');
 const progress=await read('progress');await page.locator('#closePanel').click();
 await page.locator('#saveFile').setInputFiles(path.join(out,'opening.json'));await ready();
 assert.deepEqual((await read('progress')).globals.globalBits,progress.globals.globalBits);pass('Older save retains current route flags');
 await page.reload();await ready();assert.deepEqual((await read('progress')).globals.globalBits,progress.globals.globalBits);
 assert.equal(await page.locator('#sentence').evaluate(e=>e.classList.contains('read-text')),true);pass('Reload keeps progress; verified completed-route text is marked read');
 await page.locator('#libraryButton').click();await expand();
 await card.getByRole('button',{name:'Sound test',exact:true}).click();
 assert.equal(await page.locator('.sound-track').count(),54);pass('Original-bank music is available through sound test');
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();await expand();
 await card.getByRole('button',{name:'Start again',exact:true}).click();await ready();
 assert.deepEqual((await read('progress')).globals.globalBits,progress.globals.globalBits);pass('Start again preserves unlocks');assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-6000);await page.screenshot({path:path.join(out,'failure.png')});}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
