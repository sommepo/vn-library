// Original synthetic content only. Temporary library, save bank and browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vnkit-platforms-'));
const out=path.join(root,'private/browser-tests/platforms');await fs.mkdir(out,{recursive:true});
let server,browser;
try{
 const library=path.join(tmp,'library');await fs.mkdir(library);
 for(const platform of ['ps2','pc98']){
  const folder=path.join(library,platform);await fs.cp(path.join(root,'fixtures/synthetic'),folder,{recursive:true});
  const content=JSON.parse(await fs.readFile(path.join(folder,'content.json'),'utf8'));
  content.id=`platform-test-${platform}`;content.title=`${platform.toUpperCase()} synthetic test`;content.platform={id:platform,name:platform};content.viewport={width:640,height:platform==='pc98'?400:448};
  await fs.writeFile(path.join(folder,'content.json'),JSON.stringify(content));
 }
 server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(tmp,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',n=>reject(Error('server '+n)));});
 const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),name=process.env.VNKIT_BROWSER||'chromium';browser=await api[name].launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=`http://127.0.0.1:${port}`;
 await page.goto(base);await page.locator('.console-title').waitFor();
 assert.match(await page.locator('.console-catalogue').textContent(),/PS2 synthetic/);assert.doesNotMatch(await page.locator('.console-catalogue').textContent(),/PC98 synthetic/);
 // A stale backend can serve the old catalogue shape alongside new JS. Use
 // synthetic cards with known legacy IDs; no commercial assets or story runs.
 const oldCatalogue=async route=>{
  const response=await route.fetch(),data=await response.json();
  const template=data.games.find(g=>g.id==='platform-test-ps2');
  data.games=['clannad-slpm66302-1.01','remember11-slpm65550-1.02','never7-slps25256-1.01'].map(id=>{
   const item={...template,id,title:`Legacy catalogue ${id}`};delete item.platform;return item;
  });
  await route.fulfill({response,json:data});
 };
 await page.route('**/api/library',oldCatalogue);await page.reload();
 await page.waitForFunction(()=>document.querySelectorAll('.console-title').length===3);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue clannad/);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue remember11/);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue never7/);
 await page.unroute('**/api/library',oldCatalogue);await page.reload();await page.locator('.console-title').waitFor();
 await page.evaluate(()=>localStorage.setItem('vnkit.platform.v1','pc98'));
 await page.reload();await page.locator('.console-title').waitFor();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'ps2');
 assert.equal(await page.locator('.platform-navigation,.pc98-desktop').count(),0);
 assert.doesNotMatch(await page.locator('#panelBody').textContent(),/PC-98|PC98|VISUAL NOVEL/);
 await page.getByRole('button',{name:'Add game / Import media',exact:true}).click();
 await page.locator('#isoFile').waitFor();assert.doesNotMatch(await page.locator('#panelBody').textContent(),/CUE sheet|PC-98/);
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await page.waitForTimeout(150);
  const box=await page.locator('#panel').boundingBox();assert.ok(box.width<=size.width&&box.height<=size.height);
 }
 await page.screenshot({path:path.join(out,name+'-library.png')});
 assert.deepEqual(errors,[]);console.log(`${name}: PS2 library, legacy metadata, parked PC-98 preference and import UI, mobile bounds passed`);
}finally{await browser?.close();server?.kill('SIGTERM');await fs.rm(tmp,{recursive:true,force:true});}
