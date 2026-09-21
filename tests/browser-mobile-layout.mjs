// Real reached CLANNAD scene, fresh profiles and isolated server state.
// Long-text/choice geometry probes are synthetic, not new game coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {pollBrowser} from './browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/mobile-layout'),game='clannad-slpm66302-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let data='';server.stdout.on('data',b=>{data+=b;if(data.includes('\n'))resolve(Number(data.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',c=>reject(new Error(`Test server exited ${c}`)));});
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const report={checks:[],browsers:{},scope:'Actual reached CLANNAD portrait; desktop Firefox/Chromium at phone viewports with touch. Firefox native fullscreen adopts its headless monitor size and exits on window resize; Chromium retains the emulated phone viewport. No physical Android, browser-extension or original-console comparison.'};
let browser,page;
const get=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const value=await s.get(g+':'+k);s.db.close();return value;},[game,k]);
const ready=async()=>page.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:60000});
const slider=async(name,value)=>page.locator('#setting-'+name).evaluate((i,v)=>{i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));},value);
const geometry=()=>page.evaluate(()=>{
 const box=id=>{const r=document.querySelector(id).getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
 return{viewport:{width:innerWidth,height:innerHeight},scroll:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},stage:box('#stage'),art:box('#art'),textbox:box('#textbox'),sentence:box('#sentence'),speaker:box('#speaker'),next:box('#nextButton'),font:parseFloat(getComputedStyle(document.querySelector('#sentence')).fontSize)};
});
const inside=(inner,outer,label)=>{assert.ok(inner.x>=outer.x-1&&inner.y>=outer.y-1&&inner.right<=outer.right+1&&inner.bottom<=outer.bottom+1,`${label}: ${JSON.stringify({inner,outer})}`);};
const checkFit=async()=>{
 await page.waitForTimeout(100);const g=await geometry(),viewport={x:0,y:0,right:g.viewport.width,bottom:g.viewport.height};
 inside(g.stage,viewport,'game fits viewport');inside(g.art,g.stage,'art fits frame');inside(g.textbox,g.art,'textbox overlays artwork');inside(g.sentence,g.textbox,'sentence fits textbox');inside(g.next,g.textbox,'Next fits textbox');if(g.speaker.width)inside(g.speaker,g.art,'speaker fits artwork');
 assert.ok(g.scroll.width<=g.viewport.width+1&&g.scroll.height<=g.viewport.height+1,'no page overflow');
 assert.ok(Math.abs(g.art.width/g.art.height-640/448)<.01,'source proportions');assert.ok(g.textbox.height<=g.art.height*.39,'compact dialogue');assert.ok(g.font>=12,'readable minimum');return g;
};
try{
 for(const name of (process.env.VNKIT_BROWSERS||'chromium,firefox').split(',')){
  browser=await api[name].launch({headless:true,...(name==='chromium'?{args:['--enable-unsafe-swiftshader']}:{} )});
  const context=await browser.newContext({viewport:{width:412,height:915},hasTouch:true,...(name==='chromium'?{isMobile:true}:{})}),result=report.browsers[name]={errors:[],geometry:[]};
  page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));
  const pass=label=>{report.checks.push(`${name}: ${label}`);console.log(`PASS ${name}: ${label}`);};
  await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
  const metrics=await page.evaluate(()=>{const c=document.createElement('canvas').getContext('2d');c.font='16px sans-serif';return [c.measureText('iiii').width,c.measureText('WWWW').width];});
  assert.ok(metrics[1]>metrics[0]*1.5,'Test browser can read the private fonts; do not accept tofu-only screenshots');
  const file=path.join(root,'private/clannad/menu-audit/checkpoints-final/source-portrait.json'),save=JSON.parse(await fs.readFile(file));
  await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>(await get())?.state.pending?.id===save.state.pending.id,'portrait restore');await ready();
  await page.waitForSelector('#art.native-active .native-screen');
  const initial=(await get()).state.pending.id;
  for(const size of [{width:412,height:915},{width:400,height:500},{width:490,height:345},{width:915,height:412},{width:360,height:640},{width:1360,height:960}]){
   await page.setViewportSize(size);result.geometry.push(await checkFit());await page.screenshot({path:path.join(out,`${name}-${size.width}x${size.height}.png`)});
  }
  assert.equal((await get()).state.pending.id,initial);pass('Whole source frame, nameplate and compact textbox fit six phone/desktop sizes without page scroll');
  await page.setViewportSize({width:412,height:915});
  await page.locator('#sentence').tap();await page.locator('#sentence').evaluate(e=>{const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  assert.ok(await page.evaluate(()=>getSelection().toString().length>0));await page.locator('#art').tap({position:{x:20,y:20}});assert.equal((await get()).state.pending.id,initial);await page.evaluate(()=>getSelection().removeAllRanges());
  pass('Touching/selecting dialogue and touching artwork with a selection does not advance');
  await page.locator('#settingsButton').click();await slider('uiOpacity',1);await slider('opacity',0);await page.locator('#closePanel').click();
  const transparent=await page.locator('#textbox').evaluate(e=>({fill:getComputedStyle(e).backgroundImage,alpha:getComputedStyle(e).backgroundColor,pane:getComputedStyle(e).getPropertyValue('--pane-opacity')}));
  assert.equal(Number(transparent.pane),0);assert.match(transparent.fill,/rgba\([^)]*, 0\)/);assert.equal(transparent.alpha,'rgba(0, 0, 0, 0)');
  const zero=await page.screenshot({path:path.join(out,`${name}-opacity-zero.png`)});
  await page.locator('#settingsButton').click();await slider('opacity',1);await page.locator('#closePanel').click();
  const opaque=await page.locator('#textbox').evaluate(e=>getComputedStyle(e).backgroundImage);assert.notEqual(opaque,transparent.fill);
  const one=await page.screenshot({path:path.join(out,`${name}-opacity-one.png`)});assert.notDeepEqual(zero,one);
  await page.locator('#settingsButton').click();await slider('uiOpacity',.5);await slider('opacity',.5);
  assert.equal(await page.locator('#textbox').evaluate(e=>Number(getComputedStyle(e).getPropertyValue('--pane-opacity'))),.25);
  await slider('opacity',.68);await slider('uiOpacity',1);await page.locator('#closePanel').click();
  pass('Opacity ranges from transparent to opaque; textbox/UI sliders multiply correctly with Firefox-compatible computed colour');
  await page.setViewportSize({width:915,height:412});await page.locator('#fullscreenButton').click();
  await page.waitForFunction(()=>document.fullscreenElement===document.documentElement&&document.body.classList.contains('reader-fullscreen'));
  assert.equal(await page.locator('.toolbar').isVisible(),false);assert.equal(await page.locator('.controls').isVisible(),false);assert.equal(await page.locator('#fullscreenMenu').isVisible(),true);
  const full=await checkFit();assert.ok(full.art.height>full.viewport.height-16);result.fullscreen=full;await page.screenshot({path:path.join(out,`${name}-fullscreen-landscape.png`),fullPage:true});
  await page.setViewportSize({width:400,height:500});await checkFit();
  // Desktop Firefox exits fullscreen on a Playwright window resize. Re-enter
  // through a real click; this is not evidence about Android OS rotation.
  result.fullscreenResizeExited=await page.evaluate(()=>!document.fullscreenElement);
  if(result.fullscreenResizeExited){await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement&&document.body.classList.contains('reader-fullscreen'));await checkFit();}
  result.fullscreenAfterResize=await geometry();await page.screenshot({path:path.join(out,`${name}-fullscreen-after-resize.png`),fullPage:true});
  await page.locator('#fullscreenMenu').click();await page.getByRole('button',{name:'Reading settings',exact:true}).click();assert.ok(await page.locator('#setting-opacity').isVisible());await slider('opacity',.25);await page.locator('#closePanel').click();
  assert.equal(await page.locator('#textbox').evaluate(e=>Number(getComputedStyle(e).getPropertyValue('--pane-opacity'))),.25);
  await page.locator('#fullscreenMenu').click();await page.getByRole('button',{name:'Backlog',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#panelTitle').textContent==='Encountered text');await page.locator('#closePanel').click();
  await page.locator('#fullscreenMenu').click();await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();await page.waitForFunction(()=>!document.fullscreenElement&&!document.body.classList.contains('reader-fullscreen'));
  assert.equal(await page.locator('.toolbar').isVisible(),true);assert.equal((await get()).state.pending.id,initial);await checkFit();
  pass('Actual fullscreen fits the reported screen, exposes settings/backlog/exit in a compact menu and preserves story position');
  // Synthetic overflow probe changes DOM only, never script or saves.
  const sentence=await page.locator('#sentence').innerHTML();await page.locator('#sentence').evaluate(e=>{e.textContent='長い文章の表示とスクロールを確認します。'.repeat(120);});
  await page.locator('#settingsButton').click();await slider('fontSize',42);await slider('lineHeight',2.5);await page.locator('#closePanel').click();
  await checkFit();assert.ok(await page.locator('#sentence').evaluate(e=>e.scrollHeight>e.clientHeight));
  await page.locator('#sentence').evaluate(e=>{e.scrollTop=100;e.dispatchEvent(new Event('scroll'));});await page.locator('#sentence').tap();assert.equal((await get()).state.pending.id,initial);await page.screenshot({path:path.join(out,`${name}-long-text-probe.png`)});
  await page.locator('#settingsButton').click();await slider('fontSize',26);await slider('lineHeight',1.9);await page.locator('#closePanel').click();
  await page.locator('#sentence').evaluate((e,html)=>{e.innerHTML=html;},sentence);pass('Synthetic long dialogue scrolls inside the frame without moving the Next button or advancing');
  // Real advance still works after fullscreen, menus and pointer selection.
  await page.locator('#nextButton').click();await ready();await pollBrowser(async()=>(await get()).state.pending.id!==initial,'normal advancement');pass('Normal dialogue advancement still works');
  await page.locator('#choiceButton').click();await page.waitForSelector('#choices button',{timeout:60000});
  for(const size of [{width:400,height:500},{width:490,height:345}]){
   await page.setViewportSize(size);await page.waitForTimeout(100);const g=await geometry();
   for(const b of await page.locator('#choices button').all()){const r=await b.boundingBox();inside({...r,right:r.x+r.width,bottom:r.y+r.height},g.art,'actual choices fit artwork');}
  }
  const choiceId=(await get()).state.pending.id;await page.locator('#choices button').first().tap();await ready();await pollBrowser(async()=>(await get()).state.pending.id!==choiceId,'touch choice');pass('Real next-choice navigation fits both compact orientations and touch selection continues its branch');
  assert.deepEqual(result.errors,[]);await browser.close();browser=null;
 }
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});if(browser)await browser.close();server.kill('SIGTERM');}
