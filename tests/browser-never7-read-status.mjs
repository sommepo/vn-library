// Private source checkpoints + replay sidecar, isolated server and profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..');
const [libraryArg,inputArg,outArg]=process.argv.slice(2),input=path.resolve(inputArg),out=path.resolve(outArg);
const game='never7-slps25256-1.01';await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.resolve(libraryArg),path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>serverError+=b.toString());
const port=await new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{server.kill();reject(Error('Server startup timeout '+serverError));},15000);
 server.stdout.once('data',b=>{clearTimeout(timer);resolve(+b.toString().trim());});
 server.once('exit',code=>{clearTimeout(timer);reject(Error(`Server ${code}: ${serverError}`));});
});
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const browserName=process.env.VNKIT_BROWSER||'chromium';
let browser,page;const report={browser:browserName,checks:[],errors:[],scope:'Completed-route read assumptions, not original-console or extra route coverage; isolated profile/server'};
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 browser=await api[browserName].launch({headless:true});const context=await browser.newContext();
 await context.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0})));
 page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 const read=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const r=await s.get(g+':'+k);s.db.close();return r;},[game,k]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&!document.querySelector('#panel').open&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')),null,{timeout:45000});
 const load=async file=>{const save=JSON.parse(await fs.readFile(file));await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await read())?.state.pending?.id===save.state.pending?.id,'source restore',45000);await ready();};
 const chars=data=>data.sessions.reduce((sum,s)=>sum+s.characters,0);
 const red=()=>page.locator('#sentence').evaluate(e=>e.classList.contains('read-text'));
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
 await load(path.join(input,'read-status-checkpoints-v1/early-text.json'));
 const baseline=await read('activity');assert.equal(await red(),false);
 await page.locator('#libraryButton').click();const card=page.locator('.game-card').filter({hasText:'Never7'});
 await card.locator('.console-title > summary').click();await card.getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 await page.locator('[data-route="yuka"]').getByRole('button',{name:'Mark complete',exact:true}).click();
 await page.locator('[data-route="yuka"]').getByText('Fixed read path available.',{exact:true}).waitFor();
 const marked=await read('activity');assert.equal(chars(marked),chars(baseline));assert.deepEqual(marked.seen,baseline.seen);
 await page.reload();await ready();assert.equal(await red(),true);
 assert.equal(await page.locator('#sentence').evaluate(e=>getComputedStyle(e).color),'rgb(255, 121, 121)');
 assert.deepEqual((await read('activity')).seen,baseline.seen);pass('Manual completion and reload enable red source text without study credit');
 await load(path.join(input,'routes-suite-v1/yuka/choice-1.json'));
 await page.locator('#choices button').nth(1).click();await ready();assert.equal(await red(),true);
 const first=await read();await fs.writeFile(path.join(out,'canonical-text.json'),JSON.stringify(first));
 const beforeSeek=await read('activity');await page.locator('#choiceButton').click();
 await page.waitForFunction(()=>document.querySelectorAll('#choices button').length>0,null,{timeout:45000});await ready();
 const destination=(await read()).state.pending.id,afterSeek=await read('activity');
 assert.equal(chars(afterSeek),chars(beforeSeek));assert.deepEqual(afterSeek.seen,beforeSeek.seen);pass('Next choice does not mark traversed dialogue normally read or add characters');
 await load(path.join(out,'canonical-text.json'));const beforeSkip=await read('activity');
 await page.locator('#skipButton').click();await page.waitForFunction(()=>document.querySelectorAll('#choices button').length>0,null,{timeout:45000});await ready();
 assert.equal((await read()).state.pending.id,destination);assert.equal(await page.locator('#skipButton').getAttribute('aria-pressed'),'false');
 const afterSkip=await read('activity');assert.equal(chars(afterSkip),chars(beforeSkip));assert.deepEqual(afterSkip.seen,beforeSkip.seen);
 assert.ok(afterSkip.sessions.reduce((n,s)=>n+s.skippedSegments,0)>beforeSkip.sessions.reduce((n,s)=>n+s.skippedSegments,0));pass('Skip read follows assumed path and stops at the next choice without reading credit');
 await load(path.join(input,'read-status-checkpoints-v1/alternate-unread.json'));const alternate=await read();assert.equal(await red(),false);
 await page.locator('#skipButton').click();await page.waitForTimeout(300);assert.equal(await page.locator('#skipButton').getAttribute('aria-pressed'),'false');assert.equal((await read()).state.pending.id,alternate.state.pending.id);
 pass('An unchosen branch stays unread and Skip read refuses it');
 await page.screenshot({path:path.join(out,'alternate-unread.png')});
 // Missing evidence is a supported fallback, not a story-loading failure.
 await page.route('**/read-paths.json',r=>r.fulfill({status:404,body:'unavailable'}));await page.reload();await ready();
 await load(path.join(input,'read-status-checkpoints-v1/early-text.json'));assert.equal(await red(),false);const before=(await read()).state.pending.id;
 await page.locator('#nextButton').click();await ready();assert.notEqual((await read()).state.pending.id,before);
 pass('Missing read-path evidence falls back to ordinary reading and does not block play');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page){report.visibleText=await page.locator('body').innerText();await page.screenshot({path:path.join(out,'failure.png')});}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
