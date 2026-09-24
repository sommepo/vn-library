// Opt-in private test: real ISO upload -> clean conversion -> library launch.
// No pre-existing conversion cache, game data or user save bank is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

const root=path.resolve(import.meta.dirname,'..');
if(process.argv.length!==4&&!(process.argv.length===5&&process.argv[4]==='--verify-finished'))throw Error('Usage: browser-never7-clean-import.mjs ISO NEW_PRIVATE_OUTPUT [--verify-finished]');
const iso=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const verifyFinished=process.argv[4]==='--verify-finished';
if(!verifyFinished)await fs.mkdir(out); // Refuse a reused cache for a clean import.
const library=path.join(out,'library'),state=path.join(out,'state');
const report={checks:[],errors:[],verificationOnly:verifyFinished,scope:verifyFinished?'Checks an already completed import after a harness interruption; does not repeat upload/conversion':'Linux Chromium, real ISO upload and fresh conversion; native Windows execution is not tested',started:new Date().toISOString()};
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,state],{cwd:root,env:{...process.env,PYTHONUTF8:'1'},detached:true,stdio:['ignore','pipe','pipe']});
let errorText='',browser,page;
server.stderr.on('data',b=>{errorText+=b;});
const pass=label=>{report.checks.push(label);console.log('PASS '+label);};
try{
 const port=await new Promise((resolve,reject)=>{let data='';const t=setTimeout(()=>reject(Error('Server startup timeout: '+errorText)),15000);server.stdout.on('data',b=>{data+=b;if(data.includes('\n')){clearTimeout(t);resolve(Number(data.split('\n')[0]));}});server.on('error',reject);server.on('exit',code=>{clearTimeout(t);reject(Error('Server exited '+code+': '+errorText));});});
 const base=`http://127.0.0.1:${port}`;
 const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
 browser=await chromium.launch({headless:true});page=await browser.newPage({viewport:{width:1100,height:850}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'Add game / Import ISO',exact:true}).click();
 await page.getByText('PS2 Never7 SLPS-25256 v1.01',{exact:true}).waitFor();
 if(!verifyFinished){
  await page.locator('#isoFile').setInputFiles(iso);
  await page.getByRole('button',{name:'Add game',exact:true}).first().click();
 }
 let job,lastStatus='',deadline=Date.now()+2*60*60*1000,closed=false;
 while(Date.now()<deadline){
  const response=await fetch(base+'/api/imports');assert.ok(response.ok);
  const data=await response.json();job=data.jobs.find(j=>j.origin==='upload');
  if(verifyFinished)assert.equal(job?.status,'complete','Verification requires an already completed upload job');
  if(job?.status!==lastStatus){lastStatus=job?.status;console.log('Import stage: '+lastStatus);}
  if(job?.status==='failed'||job?.status==='unsupported')throw Error(job.message);
  if(job?.status==='converting'&&!closed){
   pass('One Add game action uploads and identifies the exact edition');
   await page.locator('#closePanel').click();await page.reload();
   await page.getByRole('button',{name:'Add game / Import ISO',exact:true}).click();
   await page.locator(`article[data-job="${job.id}"]`).waitFor();
   pass('Preparation continues after closing the panel and reloading');closed=true;
  }
  if(job?.status==='complete')break;
  await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({...report,stage:job?.status,jobId:job?.id},null,2));
  await new Promise(r=>setTimeout(r,2000));
 }
 assert.equal(job?.status,'complete','Import did not complete within the bounded test time');
 assert.equal(job.gameId,'never7-slps25256-1.01');
 report.jobId=job.id;report.gameId=job.gameId;report.import=path.join(library,'import-'+job.id);
 const validation=JSON.parse(await fs.readFile(path.join(state,'imports',job.id,'validation.json'),'utf8'));
 assert.equal(validation.scriptValidation.unsupported,0);assert.equal(validation.scriptValidation.unresolvedReferences,0);
 report.validation=validation.scriptValidation;
 pass('Fresh conversion validates with zero unsupported story sites or unresolved direct references');
 const uploaded=await fs.stat(path.join(state,'imports',job.id,'source.iso'));
 assert.equal(uploaded.size,(await fs.stat(iso)).size);
 const hash=async file=>{const h=createHash('sha256');for await(const bytes of createReadStream(file))h.update(bytes);return h.digest('hex');};
 const originalHash=await hash(iso),copyHash=await hash(path.join(state,'imports',job.id,'source.iso'));
 assert.equal(copyHash,originalHash);assert.equal(copyHash,job.sha256);report.sourceSha256=originalHash;
 pass('Uploaded copy matches the unchanged original ISO and recorded fingerprint');
 const card=page.locator(`article[data-job="${job.id}"]`);
 await card.getByRole('button',{name:'Open game',exact:true}).click({timeout:15000});
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:45000});
 assert.ok((await page.locator('#sentence').textContent()).trim());
 await page.screenshot({path:path.join(out,'fresh-import-opening.png')});
 pass('Open game starts the newly imported original story');assert.deepEqual(report.errors,[]);
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{
 report.finished=new Date().toISOString();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}
}
