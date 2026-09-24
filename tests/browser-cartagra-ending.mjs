// Original-source earned checkpoint in an isolated save bank/profile.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import{spawn}from'node:child_process';import{pathToFileURL}from'node:url';
const root=path.resolve(import.meta.dirname,'..'),[library,checkpoints,out]=process.argv.slice(2),game='cartagra-slpm66231-1.01';await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.resolve(library),path.resolve(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',b=>stderr+=b);const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{server.kill();reject(Error(stderr||'Server timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(timer);resolve(+String(b).trim());});server.on('exit',()=>{clearTimeout(timer);reject(Error(stderr));});});
const{chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));let browser,page;const report={checks:[],errors:[],scope:'Continues a source-earned checkpoint through its ending; does not claim a complete browser route replay'};
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1100,height:850}});page.on('pageerror',e=>report.errors.push(e.message));page.on('dialog',d=>d.accept());
 const opening=JSON.parse(await fs.readFile(path.join(checkpoints,'before-ending-save.json')));
 await page.addInitScript(save=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));window.seed=save;},opening);
 await page.goto(`http://127.0.0.1:${port}/`);
 await page.evaluate(async g=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();await s.put(g+':autosave',window.seed);s.db.close();},game);
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);
 const read=k=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
 const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
 if(opening.state.pending.kind==='movie'){
  const video=page.locator('video.script-media');await video.waitFor();
  await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&Number.isFinite(v.duration);});
  await video.evaluate(v=>{v.currentTime=v.duration-.05;return v.play();});
 }else{await page.locator('#sentence canvas').waitFor();await page.locator('#nextButton').click();}
 await page.getByText('Ending reached · Main menu',{exact:true}).waitFor();
 assert.equal((await read('progress')).globals.flags[452],1);assert.equal((await read('progress')).globals.flags[460],1);pass('Earned ending returns to library and retains hidden-branch unlock');
 const card=page.locator('.game-card').filter({hasText:'Cartagra'});await card.locator('.console-title > summary').click();
 await card.getByRole('button',{name:'Route progress / debug…'}).click();await page.locator('[data-route="452"]').getByText('Ending 13 · Complete',{exact:true}).waitFor();pass('Completed ending shown in progress');
 await page.locator('[data-route="455"]').getByRole('button',{name:'Mark complete'}).click();await page.locator('[data-route="455"]').getByText('Ending 16 · Complete (manual)',{exact:true}).waitFor();assert.ok(await read('progress-before-debug'));pass('Manual completion is labelled and backed up');
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();await card.locator('.console-title > summary').click();await card.getByRole('button',{name:'Start again',exact:true}).click();await page.locator('video.script-media').waitFor();assert.equal((await read('progress')).globals.flags[460],1);pass('New game starts with retained progress');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;process.exitCode=1;console.error(error.stack);if(page)await page.screenshot({path:path.resolve(out,'failure.png')});}
finally{await fs.writeFile(path.resolve(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
