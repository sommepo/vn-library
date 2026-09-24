// Browser ending/unlock checks using source-reached private checkpoints.
// Own ephemeral server and profile; never use the user's live save bank.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),[libraryArg,inputArg,outArg]=process.argv.slice(2),library=path.resolve(libraryArg),input=path.resolve(inputArg),out=path.resolve(outArg),game='never7-slps25256-1.01';
await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>serverError+=b.toString());
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error('Server startup timeout '+serverError));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.once('exit',code=>{clearTimeout(t);reject(Error(`Server ${code}: ${serverError}`));});});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page;const report={checks:[],errors:[],scope:'Source-earned checkpoints, UI import of earned progress, ending/menu entry; no manual flags used to unlock test routes'};
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0})));
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 const read=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const r=await s.get(g+':'+k);s.db.close();return r;},[game,k]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&!document.querySelector('#panel').open&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')),null,{timeout:45000});
 const expand=async()=>{const d=page.locator('.game-card').filter({hasText:'Never7'}).locator('.console-title');if(!await d.evaluate(e=>e.open))await d.locator('summary').first().click();};
 const load=async file=>{const save=JSON.parse(await fs.readFile(file));await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await read())?.state.pending?.id===save.state.pending?.id,'source checkpoint restore',45000);};
 const finish=async()=>{
  for(let n=0;n<20;n++){
   if(await page.locator('#panelTitle').textContent()==='Ending reached · Main menu')return;
   if(await page.locator('video.script-media').count()){
    await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&Number.isFinite(v.duration);},null,{timeout:45000});
    await page.locator('video.script-media').evaluate(v=>{v.currentTime=v.duration-.1;});await page.locator('video.script-media').waitFor({state:'detached',timeout:15000});
   }else if(await page.locator('#choiceButton').isEnabled())await page.locator('#choiceButton').click();
   await page.waitForTimeout(250);
  }
  throw Error('Ending did not return to menu');
 };
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
 const initial=await read();await fs.writeFile(path.join(out,'old-opening.json'),JSON.stringify(initial));
 await load(path.join(input,'browser-yuka-route-v1/before-clear.json'));await finish();
 assert.equal((await read('progress')).globals[21],true);assert.deepEqual((await read('progress')).manualCompletions,{});pass('Source Yuka completion returns to menu and persists without manual marking');
 await expand();await page.locator('.game-card').filter({hasText:'Never7'}).getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 assert.equal(await page.locator('.route-progress').count(),10);assert.ok(await page.locator('[data-route="yuka"] button').isDisabled());
 const manifest=await(await fetch(`http://127.0.0.1:${port}/content/${game}/predicate.json`)).json(),entry=manifest.appendEntries[0];
 await page.getByRole('button',{name:entry.label,exact:true}).click();await ready();assert.equal((await read()).state.script,entry.script);pass('Earned Yuka clear opens the native Yuka Cure entry');
 await page.locator('#progressFile').setInputFiles(path.join(input,'routes-suite-v1/izumi-cure-a/progress.json'));
 await pollBrowser(async()=>(await read('progress'))?.globals?.[49]===true,'restore source-earned Cure A progress');
 await load(path.join(input,'browser-finale-route-v1/before-clear.json'));await finish();
 assert.equal((await read('progress')).globals[70],true);const finale=await read('progress');pass('Source finale earns the Append unlock and returns to menu');
 await expand();const extras=page.locator('.console-extra-stories');assert.equal(await extras.count(),1);assert.equal(await extras.evaluate(e=>e.open),false);assert.equal(await extras.locator('button').count(),33);
 await extras.locator('summary').click();await extras.getByRole('button',{name:manifest.appendEntries[1].label,exact:true}).click();await ready();assert.equal((await read()).state.script,manifest.appendEntries[1].script);pass('All 33 unlocked Append stories are grouped; a native entry starts from the menu');
 await load(path.join(out,'old-opening.json'));await ready();assert.deepEqual((await read('progress')).globals,finale.globals);pass('Loading an older position retains independent earned route progress');
 await page.reload();await ready();assert.deepEqual((await read('progress')).globals,finale.globals);pass('Progress and current position survive reload');
 await page.locator('#libraryButton').click();await expand();await page.locator('.game-card').filter({hasText:'Never7'}).getByRole('button',{name:'Start again',exact:true}).click();await ready();assert.deepEqual((await read('progress')).globals,finale.globals);pass('Start again resets story while preserving earned unlocks');
 await page.locator('#libraryButton').click();await expand();await page.locator('.game-card').filter({hasText:'Never7'}).getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 await page.screenshot({path:path.join(out,'earned-routes.png')});assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page){report.visibleText=await page.locator('body').innerText();await page.screenshot({path:path.join(out,'failure.png')});}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
