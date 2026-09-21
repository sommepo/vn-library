// Real reached CLANNAD save, temporary server/bank, fresh device profiles only.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawn}from'node:child_process';
import{pollBrowser}from'./browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/read-status'),game='clannad-slpm66302-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',code=>reject(new Error(`Test server exited ${code}`)));});
const base=`http://127.0.0.1:${port}`;
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),browserName=process.env.VNKIT_BROWSER||'chromium';
const browser=await api[browserName].launch({headless:true}),report={browser:browserName,checks:[],errors:[],scope:'Fresh profiles and isolated save server; source-reached CLANNAD portrait. No user bank writes or new route-coverage claim.'};let a,b;
const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
const local=(p,k='autosave')=>p.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
const bank=async()=>await(await fetch(`${base}/api/saves/${game}`)).json();
const ready=p=>p.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:60000});
const slot=(p,n)=>p.locator('.slot').filter({hasText:new RegExp(`^${n} ·`)});
const confirm=async(p,action,accept=true)=>{let message;const answered=new Promise(resolve=>p.once('dialog',async d=>{message=d.message();if(accept)await d.accept();else await d.dismiss();resolve();}));await action();await answered;return message;};
const openLocation=async p=>{await p.locator('#savesButton').click();await p.getByRole('button',{name:'Save location',exact:true}).click();await p.waitForFunction(()=>!document.querySelector('#panelBody').textContent.includes('Checking shared saves'));};
const advance=async p=>{await p.locator('#nextButton').click();await ready(p);};
const metrics=['activeMs','characters','uniqueCharacters','rereadCharacters','segments','skippedSegments','choiceCharacters'];
try{
 const context=await browser.newContext({viewport:{width:900,height:700},hasTouch:true});a=await context.newPage();a.on('pageerror',e=>report.errors.push(e.message));
 await a.goto(`${base}/?game=${game}`);await ready(a);
 assert.equal((await a.locator('#nextButton').innerText()).trim(),'▸');
 assert.equal(await a.locator('#sentence').evaluate(e=>e.classList.contains('read-text')),false);
 const initial=await local(a,'activity');
 await a.locator('#libraryButton').click();await a.getByRole('button',{name:'Route progress / debug…',exact:true}).click();
 for(const route of ['misae','yukine']){
  await a.locator(`[data-route="${route}"]`).getByRole('button',{name:'Mark complete',exact:true}).click();
  await a.locator(`[data-route="${route}"]`).getByText('Fixed read path available.',{exact:true}).waitFor();
 }
 const marked=await local(a,'activity');assert.equal(marked.sessions.reduce((n,s)=>n+s.characters,0),initial.sessions.reduce((n,s)=>n+s.characters,0));assert.deepEqual(marked.seen,initial.seen);pass('Manual Misae/Yukine completion enables verified paths without study credit');
 await a.reload();await ready(a);assert.equal(await a.locator('#sentence').evaluate(e=>getComputedStyle(e).color),'rgb(255, 121, 121)');
 await a.locator('#choiceButton').click();await a.waitForFunction(()=>document.querySelectorAll('#choices button').length>0,null,{timeout:60000});
 const after=await local(a,'activity');assert.deepEqual(after.seen,initial.seen);assert.equal(after.sessions.reduce((n,s)=>n+s.characters,0),initial.sessions.reduce((n,s)=>n+s.characters,0));pass('Next choice does not inflate read history or characters; inherited text displays red');
 await a.locator('#settingsButton').click();await a.locator('#setting-readColour').evaluate(e=>{e.value='#ff0000';e.dispatchEvent(new Event('input'));});await a.locator('#closePanel').click();
 const paths=await(await fetch(`${base}/content/${game}/read-paths.json`)).json(),choice=(await local(a)).state.pending;
 const option=paths.paths.misae.choices.find(([id])=>id===choice.id)[1],index=choice.options.findIndex(o=>o.id===option);assert.ok(index>=0);
 await a.locator('#choices button').nth(index).click();await ready(a);assert.equal(await a.locator('#sentence').evaluate(e=>getComputedStyle(e).color),'rgb(255, 0, 0)');
 await a.locator('#skipButton').click();await a.waitForTimeout(400);assert.equal(await a.locator('#skipButton').getAttribute('aria-pressed'),'true');await a.locator('#skipButton').click();
 await a.setViewportSize({width:740,height:412});await a.locator('#fullscreenButton').click();await a.waitForFunction(()=>document.fullscreenElement&&document.body.classList.contains('reader-fullscreen')&&getComputedStyle(document.querySelector('#stage')).borderTopWidth==='0px');
 assert.equal(await a.locator('#stage').evaluate(e=>getComputedStyle(e).borderTopWidth),'0px');pass('Configurable read colour, arrow-only advancement and borderless touch fullscreen');
 await a.screenshot({path:path.join(out,'read-fullscreen.png')});assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();server.kill('SIGTERM');}
