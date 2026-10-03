// Original synthetic content only. Temporary library, save bank and browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {enterLibrary} from './browser-library.mjs';
const root=path.resolve(import.meta.dirname,'..'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vnkit-platforms-'));
const out=path.resolve(process.env.VNKIT_REPORT_DIR||path.join(root,'private/browser-tests/platforms'));await fs.mkdir(out,{recursive:true});
let server,browser,page,serverLog='';
try{
 const library=path.join(tmp,'library');await fs.mkdir(library);
 for(const platform of ['ps2','pc98','psp','ps1','gba']){
  const folder=path.join(library,platform);await fs.cp(path.join(root,'fixtures/synthetic'),folder,{recursive:true});
  const content=JSON.parse(await fs.readFile(path.join(folder,'content.json'),'utf8'));
  content.id=`platform-test-${platform}`;content.title=`${platform.toUpperCase()} synthetic test`;content.platform={id:platform,name:platform};content.viewport=platform==='gba'?{width:240,height:160}:{width:640,height:platform==='pc98'?400:448};
  await fs.writeFile(path.join(folder,'content.json'),JSON.stringify(content));
 }
 server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(tmp,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
 server.stderr.on('data',bytes=>{serverLog=(serverLog+bytes).slice(-8000);});
 const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',n=>reject(Error('server '+n)));});
 const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),name=process.env.VNKIT_BROWSER||'chromium';browser=await api[name].launch({headless:true});
 page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});const base=`http://127.0.0.1:${port}`;
 await page.goto(base);await enterLibrary(page);await page.locator('.console-title').waitFor();
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
 await page.route('**/api/library',oldCatalogue);await page.reload();await enterLibrary(page,'ps2');
 await page.waitForFunction(()=>document.querySelectorAll('.console-title').length===3);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue clannad/);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue remember11/);
 assert.match(await page.locator('.console-catalogue').textContent(),/Legacy catalogue never7/);
 await page.unroute('**/api/library',oldCatalogue);await page.reload();await enterLibrary(page,'ps2');await page.locator('.console-title').waitFor();
 await page.evaluate(()=>localStorage.setItem('vnkit.platform.v1','pc98'));
 await page.reload();await enterLibrary(page,'ps2');await page.locator('.console-title').waitFor();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'ps2');
 assert.equal(await page.locator('.platform-navigation').count(),1);
 assert.equal(await page.locator('.pc98-desktop').count(),0);
 assert.doesNotMatch(await page.locator('#panelBody').textContent(),/PC-98|PC98|VISUAL NOVEL/);
 await page.getByRole('button',{name:'Add game / Import media',exact:true}).click();
 await page.locator('#isoFile').waitFor();assert.doesNotMatch(await page.locator('#panelBody').textContent(),/CUE sheet|PC-98/);
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();
 for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);await page.waitForTimeout(150);
  const box=await page.locator('#panel').boundingBox();assert.ok(box.width<=size.width&&box.height<=size.height);
 }
 await page.screenshot({path:path.join(out,name+'-library.png')});
 await page.setViewportSize({width:1440,height:1050});
 // Keep the selector mounted while repeated changes interrupt a running fade.
 await page.locator('.platform-navigation').evaluate(el=>el.dataset.testIdentity='persistent');
 await page.getByRole('button',{name:'one',exact:true}).click();
 await page.getByRole('button',{name:'portable',exact:true}).click();
 await page.getByRole('button',{name:'two',exact:true}).click();
 await page.waitForFunction(()=>document.body.dataset.platform==='ps2'&&!document.querySelector('.platform-transition-surface')&&!document.querySelector('#panelBody').getAnimations().some(a=>a.playState==='running'));
 assert.equal(await page.locator('.platform-navigation').getAttribute('data-test-identity'),'persistent');
 assert.equal(await page.getByRole('button',{name:'two',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#panelBody').evaluate(el=>getComputedStyle(el).opacity),'1');
 await page.locator('.platform-navigation').evaluate(el=>el.querySelector('[data-platform=ps1]').click());
 await page.waitForTimeout(40);
 const sliding=await page.locator('.platform-navigation').evaluate(el=>{const glass=el.querySelector('.platform-glass'),target=el.querySelector('[aria-pressed=true]');return Math.abs(glass.getBoundingClientRect().left-target.getBoundingClientRect().left)>1;});
 assert.equal(sliding,true,'Highlight travels between buttons instead of jumping');
 await page.waitForFunction(()=>document.body.dataset.platform==='ps1'&&!document.querySelector('.platform-transition-surface'));
 await page.waitForTimeout(150);
 const aligned=await page.locator('.platform-navigation').evaluate(el=>Math.abs(el.querySelector('.platform-glass').getBoundingClientRect().left-el.querySelector('[aria-pressed=true]').getBoundingClientRect().left));assert.ok(aligned<1);
 await page.getByRole('button',{name:'two',exact:true}).click();
 await page.locator('#closePanel').click();await page.waitForTimeout(450);
 assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);
 assert.equal(await page.locator('.platform-transition-surface').count(),0);
 await page.locator('#libraryButton').click();
 await page.getByRole('button',{name:'portable',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(450);
 assert.equal(await page.locator('#panel').evaluate(el=>el.open),false);
 assert.equal(await page.locator('.platform-transition-surface').count(),0);
 await page.locator('#libraryButton').click();
 await page.getByRole('button',{name:'portable',exact:true}).click();await page.locator('.xmb').waitFor();
 await page.getByRole('button',{name:'portable',exact:true}).focus();await page.keyboard.press('ArrowLeft');
 await page.waitForFunction(()=>document.activeElement?.dataset.platform==='ps2');
 await page.keyboard.press('ArrowRight');
 await page.waitForFunction(()=>document.activeElement?.dataset.platform==='psp');
 assert.match(await page.locator('.xmb-content').textContent(),/PSP synthetic/);
 assert.doesNotMatch(await page.locator('.xmb-content').textContent(),/PS2 synthetic|PC98 synthetic/);
 await page.reload();await enterLibrary(page,'psp');await page.locator('.xmb').waitFor();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'psp');
 await page.getByRole('tab',{name:'Games',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Add game',exact:true}).getAttribute('aria-selected'),'true');
 assert.match(await page.locator('.xmb-content').textContent(),/PSP imports aren’t supported yet/);
 assert.equal(await page.locator('#isoFile').count(),0);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('.xmb-game > summary').evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Enter');await page.getByRole('button',{name:'Read / resume',exact:true}).waitFor();
 await page.getByRole('button',{name:'Read / resume',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 const sentence=await page.locator('#sentence').textContent();assert.ok(sentence.length);
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'two',exact:true}).click();
 await page.locator('.console-title').waitFor();await page.locator('#closePanel').click();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'psp');
 assert.equal(await page.locator('#sentence').textContent(),sentence);
 await page.locator('#libraryButton').click();await page.getByRole('tab',{name:'Settings',exact:true}).click();
 await page.getByRole('button',{name:'Reading',exact:true}).click();await page.locator('#panelTitle').filter({hasText:'Reading settings'}).waitFor();
 assert.equal(await page.locator('.platform-navigation').count(),0);
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();
 await page.locator('.xmb-game summary').click();
 await page.screenshot({path:path.join(out,name+'-psp-game.png')});
 // Empty PSP library is the actual initial UI, with no fake game tiles.
 await page.route('**/api/library',async route=>{const response=await route.fetch(),data=await response.json();data.games=data.games.filter(g=>g.platform?.id!=='psp');await route.fulfill({response,json:data});});
 await page.reload();await enterLibrary(page,'psp');await page.locator('.xmb-empty').waitFor();
 assert.match(await page.locator('.xmb-content').textContent(),/No games yet/);
 await page.screenshot({path:path.join(out,name+'-psp-empty.png')});
 await page.locator('#panel').screenshot({path:path.join(out,name+'-psp-preview.png')});
 for(const size of [{width:390,height:844},{width:360,height:640},{width:844,height:390},{width:1280,height:720}]){
  await page.setViewportSize(size);
  for(const category of ['Games','Add game','Settings']){
   await page.getByRole('tab',{name:category,exact:true}).click();
   const bounds=await page.locator('.xmb-content').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:el.clientWidth,scrollWidth:el.scrollWidth,height:el.clientHeight};});
   assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.right<=size.width&&bounds.bottom<=size.height&&bounds.height>40,JSON.stringify({size,category,bounds}));
   assert.ok(bounds.scrollWidth<=bounds.width+1,JSON.stringify({size,category,bounds}));
  }
  await page.getByRole('tab',{name:'Games',exact:true}).click();
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,`${name}-psp-${size.width}.png`)});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.xmb-waves svg').evaluate(el=>getComputedStyle(el).animationName),'none');
 assert.equal(await page.locator('.platform-glass').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
 await page.setViewportSize({width:1280,height:900});
 await page.getByRole('button',{name:'one',exact:true}).click();await page.locator('.one-shell').waitFor();
 assert.match(await page.locator('.one-content').textContent(),/PS1 synthetic/);
 assert.doesNotMatch(await page.locator('.one-content').textContent(),/PS2 synthetic|PSP synthetic|PC98 synthetic/);
 await page.reload();await enterLibrary(page,'ps1');await page.locator('.one-shell').waitFor();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'ps1');
 await page.getByRole('tab',{name:'Games',exact:true}).focus();await page.keyboard.press('ArrowLeft');
 assert.equal(await page.getByRole('tab',{name:'Settings',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('button',{name:'Reading',exact:true}).click();await page.locator('#panelTitle').filter({hasText:'Reading settings'}).waitFor();
 await page.locator('#closePanel').click();await page.locator('#libraryButton').click();
 await page.getByRole('tab',{name:'Games',exact:true}).focus();await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('.one-game summary').evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Enter');await page.getByRole('button',{name:'Read / resume',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 const oneSentence=await page.locator('#sentence').textContent();assert.ok(oneSentence.length);
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'portable',exact:true}).click();await page.locator('#closePanel').click();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'ps1');assert.equal(await page.locator('#sentence').textContent(),oneSentence);
 await page.route('**/api/library',async route=>{const response=await route.fetch(),data=await response.json();data.games=data.games.filter(g=>g.platform?.id!=='ps1');await route.fulfill({response,json:data});});
 await page.reload();await enterLibrary(page,'ps1');await page.locator('.one-empty').waitFor();
 await page.locator('#panel').screenshot({path:path.join(out,name+'-one-preview.png')});
 await page.getByRole('button',{name:'Add game',exact:true}).click();assert.match(await page.locator('.one-availability').textContent(),/CUE\/BIN imports use the local importer/);
 assert.equal(await page.locator('#isoFile').count(),0);
 for(const size of [{width:360,height:640},{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  for(const category of ['Settings','Games']){
   await page.getByRole('tab',{name:category,exact:true}).click();
   const bounds=await page.locator('.one-content').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:el.clientWidth,scroll:el.scrollWidth,height:el.clientHeight};});
   assert.ok(bounds.left>=0&&bounds.right<=size.width&&bounds.bottom<=size.height&&bounds.height>40&&bounds.scroll<=bounds.width+1,JSON.stringify({size,category,bounds}));
  }
  await page.screenshot({path:path.join(out,`${name}-one-${size.width}.png`)});
 }
 // advance (GBA): a native 240×160 menu frame, magnified with hard pixels; no logo or console art.
 await page.unrouteAll({behavior:'wait'});await page.setViewportSize({width:1280,height:900});await page.reload();await enterLibrary(page,'ps1');await page.locator('.one-shell').waitFor();
 await page.getByRole('button',{name:'advance',exact:true}).click();await page.locator('.advance-screen').waitFor();
 assert.match(await page.locator('.advance-content').textContent(),/GBA synthetic/);
 assert.doesNotMatch(await page.locator('.advance-content').textContent(),/PS2 synthetic|PSP synthetic|PS1 synthetic|PC98 synthetic/);
 assert.equal(await page.locator('#panel .platform-logo').count(),0,'No platform logo on advance');
 const screen=await page.locator('.advance-screen canvas').evaluate(el=>({w:el.width,h:el.height,cw:el.getBoundingClientRect().width,ch:el.getBoundingClientRect().height,render:getComputedStyle(el).imageRendering}));
 assert.equal(screen.w,240);assert.equal(screen.h,160);assert.ok(/pixelated|crisp-edges/.test(screen.render),screen.render);
 assert.ok(screen.cw>=480&&Math.abs(screen.cw/240-Math.round(screen.cw/240))<1e-6&&Math.abs(screen.cw/screen.ch-1.5)<1e-6,JSON.stringify(screen));
 const palette=await page.locator('.advance-screen canvas').evaluate(el=>{const d=el.getContext('2d').getImageData(0,0,240,160).data;const bad=new Set();for(let i=0;i<d.length;i+=4){if(d[i+3]!==255||d[i]%8||d[i+1]%8||d[i+2]%8)bad.add(d.slice(i,i+4).join());}return [...bad].slice(0,5);});
 assert.deepEqual(palette,[],'Frame uses opaque 15-bit colours only (no anti-aliasing)');
 await page.reload();await enterLibrary(page,'gba');await page.locator('.advance-screen').waitFor();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'gba');
 await page.locator('#panel').screenshot({path:path.join(out,name+'-advance-preview.png')});
 await page.getByRole('tab',{name:'Games',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'Settings',exact:true}).getAttribute('aria-selected'),'true');
 assert.match(await page.locator('.advance-content').textContent(),/Display.*Reading.*Music/);
 await page.keyboard.press('ArrowRight');await page.getByRole('button',{name:'Add game',exact:true}).click();
 assert.match(await page.locator('.advance-note').textContent(),/local importer/);assert.equal(await page.locator('#isoFile').count(),0);
 await page.getByRole('tab',{name:'Add game',exact:true}).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
 assert.equal(await page.locator('.advance-game').first().evaluate(el=>el===document.activeElement),true);
 await page.keyboard.press('Enter');await page.getByRole('button',{name:'Read / resume',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);
 const lcd=await page.locator('.stage').evaluate(el=>parseFloat(getComputedStyle(el).getPropertyValue('--fit-width'))-(parseFloat(getComputedStyle(el).borderLeftWidth)+parseFloat(getComputedStyle(el).borderRightWidth)));
 assert.ok(lcd>=240&&Math.abs(lcd/240-Math.round(lcd/240))<1e-6,`integer GBA scale ${lcd}`);
 const gbaSentence=await page.locator('#sentence').textContent();assert.ok(gbaSentence.length);
 await page.locator('#libraryButton').click();await page.getByRole('button',{name:'two',exact:true}).click();await page.locator('.console-title').waitFor();
 assert.equal(await page.locator('#panel .platform-logo').count(),1,'Other platforms keep the logo');
 await page.locator('#closePanel').click();
 assert.equal(await page.locator('body').getAttribute('data-platform'),'gba');assert.equal(await page.locator('#sentence').textContent(),gbaSentence);
 await page.locator('#libraryButton').click();
 await page.route('**/api/library',async route=>{const response=await route.fetch(),data=await response.json();data.games=data.games.filter(g=>g.platform?.id!=='gba');await route.fulfill({response,json:data});});
 await page.reload();await enterLibrary(page,'gba');await page.locator('.advance-screen').waitFor();
 assert.match(await page.locator('.advance-content').textContent(),/No games yet/);
 for(const size of [{width:360,height:640},{width:390,height:844},{width:844,height:390},{width:1280,height:720}]){
  await page.setViewportSize(size);await page.waitForTimeout(120);
  const bounds=await page.locator('.advance-screen').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width};});
  assert.ok(bounds.left>=0&&bounds.top>=0&&bounds.right<=size.width&&bounds.bottom<=size.height&&bounds.width>=240,JSON.stringify({size,bounds}));
  for(const category of ['Games','Settings','Add game'])await page.getByRole('tab',{name:category,exact:true}).click();
  await page.screenshot({path:path.join(out,`${name}-advance-${size.width}.png`)});
 }
 console.log(`${name}: advance 240×160 pixel frame, no logo, filtering, persistence, keyboard, integer scaling, synthetic resume, import boundary and mobile bounds passed`);
 console.log(`${name}: one filtering, persistence, keyboard, settings, synthetic resume, import boundary and mobile bounds passed`);
 assert.deepEqual(errors,[]);console.log(`${name}: PS2 legacy/parked PC-98, PSP filtering and persistence, keyboard, synthetic resume, settings, honest import boundary, reduced motion and mobile bounds passed`);
}catch(error){
 if(page){await page.screenshot({path:path.join(out,'failure.png')});console.error(await page.locator('body').innerText());}
 console.error(serverLog);throw error;
}finally{await browser?.close();server?.kill('SIGTERM');await fs.rm(tmp,{recursive:true,force:true});}
