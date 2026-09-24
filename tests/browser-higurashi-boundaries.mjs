// Private actual-disc preview test. No synthetic text/Unicode claims.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {plainText,characterCount} from '../web/engine.mjs';
const unicode=true;
const root=path.resolve(import.meta.dirname,'..'),library=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),game='higurashi-slpm66913-1.01';
await fs.mkdir(out,{recursive:false});
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,path.join(out,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
let serverError='';server.stderr.on('data',b=>{serverError+=b;});
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error(serverError||'Server timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.on('exit',c=>{clearTimeout(t);reject(Error(`Server ${c}: ${serverError}`));});});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page,ws;const events=[],report={checks:[],errors:[],segments:0,choices:0,movies:0,movieSources:[],musicDecoded:false,voiceDecoded:false,unicode,rubySeen:false};
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1100,height:850},permissions:['clipboard-read','clipboard-write']});page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await context.addInitScript(unicode=>{localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,websocket:unicode}));window.testAudio=new Set();const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){window.testAudio.add(this);return play.call(this);};},unicode);
 if(unicode){const session=await(await fetch(`http://127.0.0.1:${port}/api/session`)).json();ws=new WebSocket(session.structuredWsUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});ws.onmessage=e=>events.push(JSON.parse(e.data));}
 const read=async(k='autosave')=>page.evaluate(async([g,k])=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const v=await s.get(g+':'+k);s.db.close();return v;},[game,k]);
 const ready=()=>page.waitForFunction(()=>!document.querySelector('#stage').hasAttribute('aria-busy')&&(!document.querySelector('#nextButton').disabled||document.querySelector('#choices button')||document.querySelector('video.script-media')),null,{timeout:45000});
 const pass=n=>{report.checks.push(n);console.log('PASS '+n);};
 await page.goto(`http://127.0.0.1:${port}/?game=${game}`);await ready();

 const fixture=path.resolve(process.argv[4]);
 const load=async name=>{await page.locator('#saveFile').setInputFiles(path.join(fixture,name));await ready();};
 await load('choice.json');await page.locator('#choices button').first().waitFor();
 const choice=await read();assert.equal(choice.state.presentation.kind,'choice');
 await page.locator('#choices button').first().click();await ready();const next=await read();
 await page.reload();await ready();assert.equal((await read()).state.pc,next.state.pc);pass('Source choice and its subsequent state survive reload');
 await load('movie.json');await page.locator('video.script-media').waitFor();
 await page.waitForFunction(()=>{const v=document.querySelector('video.script-media');return v?.readyState>=2&&v.videoWidth===640;},null,{timeout:30000});
 await page.locator('video.script-media').evaluate(v=>{v.play();});await page.waitForFunction(()=>document.querySelector('video.script-media')?.currentTime>.1);pass('Original PSS conversion plays video/audio in browser');
 await page.screenshot({path:path.join(out,'movie.png')});
 await page.locator('video.script-media').evaluate(v=>{v.currentTime=v.duration-.1;});await page.waitForFunction(()=>!document.querySelector('video.script-media'),null,{timeout:15000});pass('Movie completion resumes source execution');
 assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;if(page){report.visibleText=(await page.locator('body').innerText()).slice(-4000);await page.screenshot({path:path.join(out,'failure.png')});}console.error(error.stack,report.visibleText);process.exitCode=1;}
finally{ws?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();server.kill();}
