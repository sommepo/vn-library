// Real reached CLANNAD save, temporary server/bank, fresh device profiles only.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawn}from'node:child_process';
import{pollBrowser}from'./browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/import-ui'),game='clannad-slpm66302-1.01';
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
 const context=await browser.newContext({viewport:{width:1100,height:800}});a=await context.newPage();a.on('pageerror',e=>report.errors.push(e.message));
 await a.goto(base);await a.locator('.console-title').first().waitFor();await a.locator('#closePanel').click();
 assert.equal(await a.locator('#stage').evaluate(e=>getComputedStyle(e).visibility),'hidden');
 await a.locator('.idle-orbit').waitFor();assert.equal(await a.locator('.empty-art').count(),0);
 const light=await a.locator('body').evaluate(e=>getComputedStyle(e).background);await a.locator('#dimButton').click();const dark=await a.locator('body').evaluate(e=>getComputedStyle(e).background);assert.notEqual(light,dark);assert.equal(await a.locator('#dimButton').textContent(),'☀ Light');await a.locator('#dimButton').click();assert.equal(await a.locator('body').evaluate(e=>getComputedStyle(e).background),light);
 await a.screenshot({path:path.join(out,'idle-light.png')});pass('Empty reader shows orbit without splash/textbox; Light and Dim visibly differ');
 for(const id of ['settingsButton','crtButton']){await a.locator('#'+id).click();assert.doesNotMatch(await a.locator('#panelBody').textContent(),/selectable|reserved for selection|stays? clear/i);await a.locator('#closePanel').click();}pass('Settings and CRT copy omit text-selection explanations');
 await a.locator('#libraryButton').click();await a.getByRole('button',{name:'Add game / Import ISO',exact:true}).click();await a.locator('#isoFile').waitFor();
 await a.locator('#isoFile').setInputFiles({name:'original-test.iso',mimeType:'application/octet-stream',buffer:Buffer.alloc(65536,71)});
 await a.getByRole('button',{name:'Upload / resume',exact:true}).click();await a.waitForFunction(()=>[...document.querySelectorAll('.import-badge')].some(e=>e.textContent==='ISO uploaded'));
 let row=a.locator('.import-card').filter({hasText:'original-test.iso'});await row.getByRole('button',{name:'Inspect disc',exact:true}).click();await a.waitForFunction(()=>[...document.querySelectorAll('.import-card')].some(e=>e.textContent.includes('original-test.iso')&&/stopped|No playable|volume|ISO|descriptor/.test(e.textContent)));
 await a.reload();await a.locator('.console-title').first().waitFor();await a.getByRole('button',{name:'Add game / Import ISO',exact:true}).click();await a.locator('#isoFile').waitFor();await row.locator('.import-badge').waitFor();assert.equal(await row.locator('.import-badge').textContent(),'ISO uploaded');
 assert.equal(await row.getByRole('button',{name:'Import game',exact:true}).count(),0);pass('Real HTTP upload survives reload and invalid ISO never becomes importable');
 const source=a.locator('.import-card').filter({hasText:'Clannad (Japan).iso'});await source.getByRole('button',{name:'Use this ISO',exact:true}).click();
 const pending=a.locator('article.import-card').filter({hasText:'Clannad (Japan).iso'});await pending.getByRole('button',{name:'Inspect disc',exact:true}).click();
 const identified=a.locator('article.import-card').filter({hasText:'CLANNAD —'});await identified.getByRole('button',{name:'Open game',exact:true}).waitFor({timeout:120000});assert.equal(await identified.getByRole('button',{name:'Import game',exact:true}).count(),0);
 assert.equal(await identified.locator('.import-badge').textContent(),'ISO on server');
 await a.screenshot({path:path.join(out,'import-panel.png')});pass('Actual CLANNAD ISO identified by server path ID and fingerprint; existing library import protected');
 const response=await fetch(base+'/api/imports'),data=await response.json();
 const denied=await fetch(base+'/api/imports/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register',sourceId:data.sources[0].id})});assert.equal(denied.status,403);
 const cross=await fetch(base+'/api/imports/action',{method:'POST',headers:{'Content-Type':'application/json','X-VNKit-Import-Token':data.token,Origin:'https://evil.example'},body:JSON.stringify({action:'register',sourceId:data.sources[0].id})});assert.equal(cross.status,403);
 const traversal=await fetch(base+'/api/imports/action',{method:'POST',headers:{'Content-Type':'application/json','X-VNKit-Import-Token':data.token},body:JSON.stringify({action:'upload',name:'../bad.iso',size:65536,resumeKey:'a'.repeat(64)})});assert.equal(traversal.status,400);pass('Upload endpoints reject missing token, foreign origin and path traversal');
 await identified.getByRole('button',{name:'Open game',exact:true}).click();await ready(a);assert.equal(await a.locator('body').evaluate(e=>e.classList.contains('reader-idle')),false);pass('Open existing import restores the real game frame');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;report.status=await a?.locator('#status').textContent();console.error(error.stack,report.status);process.exitCode=1;}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();server.kill('SIGTERM');}
