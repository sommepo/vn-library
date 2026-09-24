// Private actual-disc preview test. No synthetic text/Unicode claims.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {plainText,characterCount} from '../web/engine.mjs';
const unicode=true;
const root=path.resolve(import.meta.dirname,'..'),library=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),game='higurashi-slpm66913-1.01';
await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>{serverError+=b;});
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error(serverError||'Server timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.on('exit',c=>{clearTimeout(t);reject(Error(`Server ${c}: ${serverError}`));});});
const browsers=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page,ws;const events=[],report={checks:[],errors:[],segments:0,choices:0,movies:0,movieSources:[],musicDecoded:false,voiceDecoded:false,unicode,rubySeen:false};
try{
 const firefox=process.env.VNKIT_BROWSER==='firefox';browser=await browsers[firefox?'firefox':'chromium'].launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850},...(firefox?{}:{permissions:['clipboard-read','clipboard-write']})});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await context.addInitScript(unicode=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,websocket:unicode}));window.testAudio=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.testAudio.add(this);return play.call(this);};},unicode);
 if(unicode){const session=await(await fetch(`http://127.0.0.1:${port}/api/session`)).json();ws=new WebSocket(session.structuredWsUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>events.push(JSON.parse(e.data));}
 const read=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')||document.querySelector('video.script-media')),null,{timeout:45000});
 const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();
 for(let step=0;step<700&&(report.segments<150);step++){
  await ready();
  if(await page.locator('video.script-media').count()){
   await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&v.videoWidth>0;},null,{timeout:30000});
   // Seeking is explicit test simulation, not a full movie viewing claim.
   const src=await page.locator('video.script-media').evaluate(v=>{v.currentTime=v.duration-.15;v.play();return v.src;});
   await page.waitForFunction(src=>document.querySelector('video.script-media')?.src!==src,src,{timeout:15000});report.movies++;report.movieSources.push(new URL(src).pathname);continue;
  }
  const saved=await read();
  if(saved.state.scene.music&&!report.musicDecoded){await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/bgm/')&&a.readyState>=2&&!a.paused&&a.currentTime>0),null,{timeout:20000});report.musicDecoded=true;}
  if(saved.state.presentation.voice&&!report.voiceDecoded){await page.waitForFunction(()=>[...window.testAudio].some(a=>a.src.includes('/voice/')||a.src.includes('/groups/')&&a.readyState>=2&&!a.paused&&a.currentTime>0),null,{timeout:20000});report.voiceDecoded=true;await page.screenshot({path:path.join(out,'voiced-scene.png')});}
  if(saved.state.presentation.kind==='text'){
   if(unicode){
    assert.equal(await page.locator('#sentence canvas').count(),0);
    const text=await page.locator('#sentence').evaluate(el=>{const clone=el.cloneNode(true);clone.querySelectorAll('rt').forEach(r=>r.remove());return clone.textContent;});assert.equal(text,plainText(saved.state.presentation.displayText??saved.state.presentation.text));
    assert.equal(await page.locator('#speaker').textContent(),saved.state.presentation.speaker);
    if(await page.locator('#sentence ruby').count()){report.rubySeen=true;await page.screenshot({path:path.join(out,'ruby.png')});}
   }else{assert.ok(await page.locator('#sentence canvas').count());assert.equal(await page.locator('#sentence').innerText(),'');}report.segments++;
   if(report.segments===150)await page.screenshot({path:path.join(out,'original-font-scene.png')});
  }
  if(await page.locator('#choices button').count()){if(unicode)assert.deepEqual(await page.locator('#choices button').allTextContents(),saved.state.presentation.options.map(o=>plainText(o.text)));else assert.ok(await page.locator('#choices button canvas').count());report.choices++;await page.screenshot({path:path.join(out,'original-choices.png')});await page.locator('#choices button').first().click();}
  else await page.locator('#nextButton').click();
 }
 assert.ok(report.segments>=150);pass(unicode?'150 successive Unicode DOM segments and speaker names':'150+ original glyph segments, original choices and source movies');
 await ready();assert.ok(report.musicDecoded&&report.voiceDecoded);pass('Original Sony ADPCM voice and music decode');
 const activity=await read('activity'),before=await read();
 if(unicode){
  assert.ok(activity.backlog.length>=150);assert.ok(activity.sessions.reduce((n,s)=>n+s.characters,0)>0);
  await page.locator('#copyButton').click();if(!firefox){assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),plainText(before.state.presentation.text));pass('Clipboard and activity count source text, excluding ruby readings');}else pass('Copy requested; Firefox clipboard content needs device check');
  await page.locator('#sentence').evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);});await page.locator('#sentence').click();assert.equal((await read()).state.presentation.id,before.state.presentation.id);await page.evaluate(()=>getSelection().removeAllRanges());pass('Selecting/clicking Japanese does not advance');
  await page.locator('#backlogButton').click();await page.getByRole('heading',{name:'Encountered text'}).waitFor();await page.locator('#closePanel').click();pass('Searchable backlog opens');
  assert.ok(events.length>=150);assert.ok(events.every(e=>e.sentence&&e.segmentId&&e.occurrenceId&&e.gameId===game));assert.equal(new Set(events.map(e=>e.occurrenceId)).size,events.length);pass('External WebSocket receives complete unique occurrences');
 }else{assert.equal(activity.backlog.length,0);assert.ok(activity.sessions.every(s=>s.characters===0&&s.activeMs===0));pass('Bitmap preview never becomes fake text or study counts');await page.locator('#copyButton').click();await page.getByText('This preview uses original font images. Copying requires verified Unicode text.',{exact:true}).waitFor();pass('Copy explains Unicode limitation');}
 const eventCount=events.length;
 await page.reload();await ready();assert.equal((await read()).state.presentation.id,before.state.presentation.id);if(unicode){assert.equal((await read('activity')).sessions.reduce((n,s)=>n+s.characters,0),activity.sessions.reduce((n,s)=>n+s.characters,0));await page.waitForTimeout(300);assert.equal(events.length,eventCount);}pass('Reload restores position without recounting or publishing');
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 15 ·/}).waitFor();assert.equal(await page.locator('.slot').filter({hasText:/^slot \d+ ·/}).count(),15);
 await page.locator('.slot').filter({hasText:/^slot 1 ·/}).getByRole('button',{name:'Save',exact:true}).click();await page.locator('#closePanel').click();await page.locator('#nextButton').click();await ready();
 await page.locator('#savesButton').click();await page.locator('.slot').filter({hasText:/^slot 1 ·/}).getByRole('button',{name:'Load',exact:true}).click();await ready();assert.equal((await read()).state.presentation.id,before.state.presentation.id);pass('15 slots; source state restored after advancement');
 await page.locator('#nextButton').click();await ready();await page.locator('#previousButton').click();await ready();assert.equal((await read()).state.presentation.id,before.state.presentation.id);pass('Previous line restores source state');
 await page.locator('#pauseButton').click();await page.waitForFunction(()=>document.body.classList.contains('global-paused'));const times=await page.evaluate(()=>[...window.testAudio].map(a=>a.currentTime));await page.waitForTimeout(600);assert.deepEqual(await page.evaluate(()=>[...window.testAudio].map(a=>a.currentTime)),times);await page.locator('#pauseButton').click();pass('Global pause suspends media');
 await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#choices button')||document.querySelector('video.script-media'),null,{timeout:60000});pass('Next choice executes source');
 await page.setViewportSize({width:915,height:412});await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement);const b=await page.locator('#stage').boundingBox();assert.ok(b.y+b.height<=await page.evaluate(()=>innerHeight)+.5);await page.screenshot({path:path.join(out,'fullscreen.png')});pass('Landscape fullscreen fits');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-4000);await page.screenshot({path:path.join(out,'failure.png')});}console.error(error.stack,report.visibleText);process.exitCode=1;}
finally{ws?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
