// Real private disc import; every server, profile and save bank is disposable.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {installWordScanner,checkWordScanning} from './sound-word-lookup.mjs';
const root=path.resolve(import.meta.dirname,'..'),library=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),game=process.argv[4];
await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'server-state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',b=>stderr+=b);
const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(stderr||'Server timeout')),15000);server.stdout.once('data',b=>{clearTimeout(timer);resolve(+b.toString().trim());});server.on('exit',c=>{clearTimeout(timer);reject(Error(`Server ${c}: ${stderr}`));});});
const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),name=process.env.VNKIT_BROWSER||'chromium';
const report={browser:name,game,segments:0,checks:[],errors:[]};let browser,page;
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
try{
 browser=await api[name].launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850}});
 await context.addInitScript(()=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0}));window.testAudio=new Set();window.testMovies=[];document.addEventListener('ended',e=>{if(e.target instanceof HTMLVideoElement)window.testMovies.push(e.target.currentSrc);},true);const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.testAudio.add(this);return play.call(this);};});
 page=await context.newPage();if(process.env.VNKIT_YOMITAN_TEST_ROOT)await installWordScanner(page,process.env.VNKIT_YOMITAN_TEST_ROOT);page.on('pageerror',e=>report.errors.push(e.message));
 const read=(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button.sound-page-block')),null,{timeout:60000});
 await page.goto(`http://127.0.0.1:${port}`);await page.getByRole('button',{name:'one',exact:true}).click();
 const row=page.locator('.one-game').filter({hasText:game.startsWith('kamaitachi')?'かまいたち':'弟切草'});await row.locator('summary').click();await row.getByRole('button',{name:'Read / resume',exact:true}).click();await ready();pass('Library launch');
 let music=false,sound=false,choices=0;
 for(let steps=0;steps<600&&report.segments<100;steps++){
  await ready();const save=await read(),p=save.state.pending;
  if(p.kind==='text'){
   const text=await page.locator('#sentence .sound-page-block').allTextContents();assert.equal(text.join('\n'),p.displayText);
   assert.equal(await page.locator('#sentence canvas').count(),0);assert.equal(await page.locator('#stage').getAttribute('data-text-layout'),'full-scene');report.segments++;
  }
  const played=await page.evaluate(()=>[...window.testAudio].filter(a=>a.currentTime>0&&a.readyState>=2).map(a=>a.src));music ||= played.some(s=>s.includes('/music/'));sound ||= played.some(s=>s.includes('/sound/'));
  if(p.kind==='choice'){choices++;await page.locator('#choices button.sound-page-block').first().click();}else await page.locator('#nextButton').click();
  for(let poll=0;poll<300;poll++){const now=await read();if(now?.state.pending?.occurrenceId!==p.occurrenceId||now?.state.pending?.id!==p.id)break;if(poll===299)throw Error('Autosave did not reach the displayed boundary');await page.waitForTimeout(50);}
 }
 report.moviesCompleted=await page.evaluate(()=>window.testMovies.length);if(game.startsWith('otogirisou'))assert.ok(report.moviesCompleted>0,'Original movie completes before returning to text');
 assert.equal(report.segments,100);assert.ok(music&&sound);pass(`100 real segments, original music; effects played: ${sound}; choices: ${choices}`);
 await ready();await page.screenshot({path:path.join(out,'reader.png')});const before=await read(),activity=await read('activity');
 await page.locator('#sentence').evaluate(el=>{const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});assert.ok(await page.evaluate(()=>getSelection().toString()));await page.evaluate(()=>getSelection().removeAllRanges());pass('Selectable original-font Unicode');
 if(process.env.VNKIT_YOMITAN_TEST_ROOT){report.wordScanning=await checkWordScanning(page,'#sentence .sound-page-block');pass('Yomitan reads contiguous words and selects multi-glyph ranges');}
 await page.reload();await row.locator('summary').click();await row.getByRole('button',{name:'Read / resume',exact:true}).click();await ready();assert.equal((await read()).state.pending.id,before.state.pending.id);assert.equal((await read('activity')).sessions.reduce((n,s)=>n+s.characters,0),activity.sessions.reduce((n,s)=>n+s.characters,0));pass('Resume without recounting');
 await page.locator('#choiceButton').click();await page.waitForFunction(()=>document.querySelector('#choices button.sound-page-block'),null,{timeout:60000});await ready();const choice=await read();assert.deepEqual(await page.locator('#choices button.sound-page-block').allTextContents(),choice.state.pending.options.map(o=>o.text));await page.screenshot({path:path.join(out,'choices.png')});pass('Next choice and original inline options');if(process.env.VNKIT_YOMITAN_TEST_ROOT){report.choiceScanning=await checkWordScanning(page,'#choices .sound-page-block');pass('Yomitan reads original inline choice words');}
 for(const [width,height]of [[390,844],[844,390]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);const boxes=await page.locator('.sound-source-glyph').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return b.x>=s.x-.5&&b.y>=s.y-.5&&b.right<=s.right+.5&&b.bottom<=s.bottom+.5;}));assert.ok(boxes.length&&boxes.every(Boolean));await page.screenshot({path:path.join(out,`page-${width}.png`)});}pass('Portrait and landscape page bounds');
 await page.locator('#choices button.sound-page-block').last().click();await ready();pass('Inline choice advances source');assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-1800);await page.screenshot({path:path.join(out,'failure.png')});}}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
