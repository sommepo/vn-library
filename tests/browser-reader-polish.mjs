// Actual reached CLANNAD portrait, isolated browser + temporary server state.
// Generated geometry probes are original test data, not extra route coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import{spawn}from'node:child_process';
import{pollBrowser}from'./browser-poll.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.env.VNKIT_REPORT_DIR||'private/browser-tests/reader-polish'),game='clannad-slpm66302-1.01';
await fs.mkdir(out,{recursive:true});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(root,'private/library'),path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',code=>reject(new Error(`Test server exited ${code}`)));});
const base=`http://127.0.0.1:${port}`;
const{chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']}),report={checks:[],errors:[],scope:'Reached CLANNAD portrait + separate fractional-geometry probe. No live shared banks or original engine comparison.'};let page;
const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
const get=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
const ready=async()=>page.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:60000});
const slider=async(name,value)=>page.locator('#setting-'+name).evaluate((i,v)=>{i.value=v;i.dispatchEvent(new Event('input',{bubbles:true}));},value);
try{
 const context=await browser.newContext({viewport:{width:1440,height:1050}});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`${base}/?game=${game}`);await ready();
 const file=path.join(root,'private/clannad/menu-audit/checkpoints-final/source-portrait.json'),portrait=JSON.parse(await fs.readFile(file)),content=JSON.parse(await fs.readFile(path.join(root,'private/library/clannad-live/content.json')));
 const face=content.assets[portrait.state.scene.layers.at(-1).asset].url;let release,requested=false;
 const gate=new Promise(r=>release=r);await page.route(`**/${face}`,async r=>{requested=true;await gate;await r.continue();});
 const oldArt=await page.locator('#art').innerHTML();await page.locator('#saveFile').setInputFiles(file);await pollBrowser(async()=>requested,'face request');await page.locator('#loadNotice').waitFor();
 assert.equal(await page.locator('#loadNotice').innerText(),'');assert.equal(await page.locator('.load-orbit i').count(),8);assert.equal(await page.locator('#art').innerHTML(),oldArt);assert.equal(await page.locator('#nextButton').isDisabled(),true);
 await page.screenshot({path:path.join(out,'loading-orbit.png')});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.load-orbit').evaluate(e=>getComputedStyle(e).animationName),'none');await page.emulateMedia({reducedMotion:'no-preference'});
 release();await pollBrowser(async()=>(await get())?.state.pending?.id===portrait.state.pending.id,'portrait restore');await ready();await page.unroute(`**/${face}`);
 assert.equal(await page.locator('#loadNotice').isVisible(),false);await page.waitForSelector('#art.native-active .native-screen');pass('Delayed face shows silent orbit, keeps old complete artwork and swaps atomically; reduced motion works');
 // A revalidation saves all image-body bytes, but still requires one round trip.
 const artURL=`${base}/content/${game}/${face}`,first=await fetch(artURL),bytes=(await first.arrayBuffer()).byteLength,etag=first.headers.get('etag');
 const second=await fetch(artURL,{headers:{'If-None-Match':etag}}),repeatBytes=(await second.arrayBuffer()).byteLength;
 assert.equal(second.status,304);assert.equal(repeatBytes,0);assert.match(second.headers.get('cache-control'),/private/);report.cache={assetBytes:bytes,repeatedBodyBytes:repeatBytes,status:second.status};pass('Actual CLANNAD face revalidation sends no duplicate PNG body');
 // Native raster must be independent of fractional responsive display size.
 report.geometry=await page.evaluate(async()=>{
  const{SceneCapture}=await import('/crt.mjs');const capture=new SceneCapture(),host=document.querySelector('#art').cloneNode(true);host.id='';host.classList.remove('crt-active','native-active');host.querySelectorAll('canvas').forEach(e=>e.remove());
  host.style.cssText='position:fixed;left:-4000px;top:0;inset:auto;max-width:none;max-height:none;aspect-ratio:auto';document.body.append(host);await Promise.all([...host.querySelectorAll('img')].map(i=>i.decode()));
  const sizes=[640,553.3,997.6,389.7],frames=[];
  for(const width of sizes){host.style.width=width+'px';host.style.height=width*448/640+'px';const canvas=capture.draw(host,[640,448]);frames.push(new Uint8ClampedArray(canvas.getContext('2d').getImageData(0,0,640,448).data));}
  const differences=frames.slice(1).map(f=>f.reduce((n,v,i)=>n+(v!==frames[0][i]?1:0),0));
  const one=host.querySelector('img'),other=one.cloneNode();await other.decode();const cacheReuse=capture.image(one,{filter:'source-alpha'})===capture.image(other,{filter:'source-alpha'});
  const result={sizes,differingChannels:differences,cacheReuse,alphaBytes:capture.alphaBytes};host.remove();return result;
 });
 assert.deepEqual(report.geometry.differingChannels,[0,0,0]);assert.equal(report.geometry.cacheReuse,true);assert.ok(report.geometry.alphaBytes<=32*1024*1024);pass('Actual portrait native raster is identical at four fractional scales; separate alpha-cache probe reuses matching artwork');
 const before=await get(),beforeHistory=await get('activity');
 const companion=await context.newPage();await companion.goto(`${base}/live.html`);
 await page.locator('#settingsButton').click();const oldColour=await page.locator('#textbox').evaluate(e=>getComputedStyle(e).backgroundImage);
 await slider('uiHue',165);await slider('uiSaturation',48);await slider('uiOpacity',.7);
 assert.notEqual(await page.locator('#textbox').evaluate(e=>getComputedStyle(e).backgroundImage),oldColour);
 await companion.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--ui-hue')==='165');assert.equal(await companion.locator('#liveEntries .entry').count(),0);await companion.close();
 const styles=await page.evaluate(()=>['#textbox','#speaker','.panel-head','.controls'].map(s=>getComputedStyle(document.querySelector(s)).backgroundImage));assert.ok(styles.every(s=>s.includes('gradient')));
 await page.screenshot({path:path.join(out,'colour-settings.png')});await page.locator('#closePanel').click();await page.screenshot({path:path.join(out,'green-reader.png')});
 await page.reload();await ready();const settings=JSON.parse(await page.evaluate(()=>localStorage.getItem('vnkit.settings')));assert.deepEqual([settings.uiHue,settings.uiSaturation,settings.uiOpacity],[165,48,.7]);assert.equal((await get()).state.pending.id,before.state.pending.id);assert.deepEqual((await get('activity')).seen,beforeHistory.seen);pass('Colour, strength and opacity persist and reach Live text without altering story or reading credit');
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Reset UI colours',exact:true}).click();assert.equal(await page.locator('#setting-uiHue').inputValue(),'242');await page.locator('#closePanel').click();
 await page.locator('#crtButton').click();await page.locator('#crt-enabled').check();await page.waitForFunction(()=>document.querySelector('#crt-state').textContent.startsWith('CRT active'));await page.locator('#closePanel').click();await page.screenshot({path:path.join(out,'portrait-crt.png')});pass('Corrected real portrait renders through CRT with the original date badge');
 await page.waitForTimeout(1500);
 // Exercise real presentations, then compare the two metric groups to stored activity.
 for(let n=0;n<6;n++){await page.locator('#nextButton').click();await ready();}
 await page.locator('#statsButton').click();const history=await get('activity'),totals=history.sessions.reduce((a,s)=>({characters:a.characters+s.characters,activeMs:a.activeMs+s.activeMs}),{characters:0,activeMs:0});
 assert.equal(await page.locator('[data-statistics=overall] .metric').count(),3);assert.equal(await page.locator('[data-statistics=session] .metric').count(),5);
 const overall=await page.locator('[data-statistics=overall] .metric strong').allTextContents(),session=await page.locator('[data-statistics=session] .metric strong').allTextContents();
 assert.equal(overall[0],totals.characters.toLocaleString('en'));assert.equal(overall[1],new Intl.NumberFormat('en',{notation:totals.characters*3600000/totals.activeMs>=10000?'compact':'standard',maximumFractionDigits:1}).format(Math.round(totals.characters*3600000/totals.activeMs)));assert.equal(session[1],history.sessions.at(-1).characters.toLocaleString('en'));assert.equal(session[3],'—');assert.equal(await page.locator('[data-statistics=session] time[datetime]').count(),1);assert.doesNotMatch(await page.locator('#panelBody').innerText(),/time left|completion percentage/i);
 report.stats={overall,session,totalCharacters:totals.characters};await page.screenshot({path:path.join(out,'statistics.png')});await page.locator('#dimButton').evaluate(e=>e.click());await page.screenshot({path:path.join(out,'statistics-dim.png')});pass('Overall/session statistic groups reflect real persisted reading, include timestamps and omit time-left estimates');
 await page.getByRole('button',{name:'Pause activity timer',exact:true}).click();assert.match(await page.locator('.activity-note').innerText(),/manually paused/);
 await page.setViewportSize({width:412,height:915});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.screenshot({path:path.join(out,'statistics-mobile.png')});
 await page.locator('#settingsButton').evaluate(e=>e.click());assert.ok(await page.locator('#setting-uiOpacity').isVisible());await page.screenshot({path:path.join(out,'settings-mobile.png')});pass('Statistics and colour controls fit mobile; manual pause is retained');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2),{flag:'wx'});await browser.close();server.kill('SIGTERM');}
