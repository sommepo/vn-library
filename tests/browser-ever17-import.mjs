// Actual GUI -> dependency preflight -> CLI resume -> validation -> install.
// Deliberately reuses a verified private conversion cache, not a clean import.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),[iso,work,out]=process.argv.slice(2).map(p=>path.resolve(p));
await fs.mkdir(out);const library=path.join(out,'library'),state=path.join(out,'state');
const jobId=execFileSync('python3',['-c',`import os,shutil,sys
from pathlib import Path
from vnkit.import_jobs import ImportJobs
j=ImportJobs(sys.argv[1],sys.argv[2],lambda:([],{}),Path(sys.argv[3]).parent)
key=next(k for k,p in j.sources().items() if p==Path(sys.argv[3]))
job=j.register(key)
shutil.copytree(sys.argv[4],j.root/job['id']/'work',copy_function=os.link)
print(job['id'])`,state,library,iso,work],{cwd:root,encoding:'utf8'}).trim();
const server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',library,state],{cwd:root,env:{...process.env,VNKIT_IMPORT_SOURCE_DIR:path.dirname(iso)},detached:true,stdio:['ignore','pipe','pipe']});
let stderr='';server.stderr.on('data',b=>stderr+=b);
const port=await new Promise((resolve,reject)=>{const t=setTimeout(()=>{server.kill();reject(Error(stderr||'Server timeout'));},15000);server.stdout.once('data',b=>{clearTimeout(t);resolve(+b.toString().trim());});server.once('exit',c=>{clearTimeout(t);reject(Error(`Server ${c}: ${stderr}`));});});
const {chromium}=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
let browser,page;const report={checks:[],errors:[],jobId,scope:'Actual server ISO and cached media, Linux Chromium; no upload or fresh-cache conversion claim'};
const pass=s=>{report.checks.push(s);console.log('PASS '+s);};
try{
 browser=await chromium.launch({headless:true});page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/`);await page.getByRole('button',{name:'Add game / Import media',exact:true}).click();
 await page.getByText('PS2 Ever17 Premium Edition SLPM-65421 v1.01',{exact:true}).waitFor();
 await page.locator(`article[data-job="${jobId}"]`).getByRole('button',{name:'Continue',exact:true}).click();
 let job,closed=false,last,deadline=Date.now()+20*60*1000;
 while(Date.now()<deadline){
  job=(await(await fetch(`http://127.0.0.1:${port}/api/imports`)).json()).jobs.find(j=>j.id===jobId);
  if(job.status!==last){console.log('Stage '+job.status);last=job.status;}
  if(['failed','unsupported'].includes(job.status))throw Error(job.message);
  if(job.status==='converting'&&!closed){await page.locator('#closePanel').click();await page.reload();await page.getByRole('button',{name:'Add game / Import media',exact:true}).click();closed=true;pass('Preparation survives panel close and reload');}
  if(job.status==='complete')break;
  await new Promise(r=>setTimeout(r,1500));
 }
 assert.equal(job.status,'complete');assert.equal(job.gameId,'ever17-slpm65421-1.01');
 const validation=JSON.parse(await fs.readFile(path.join(state,'imports',jobId,'validation.json')));
 assert.equal(validation.scriptValidation.unsupported,0);assert.equal(validation.scriptValidation.unresolvedReferences,0);
 report.validation=validation;report.import=path.join(library,'import-'+jobId);pass('Real CLI resume validates and atomically installs the exact edition');
 await page.locator(`article[data-job="${jobId}"]`).getByRole('button',{name:'Open game',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled,null,{timeout:45000});
 assert.ok((await page.locator('#sentence').textContent()).trim());pass('Open game starts the newly installed original story');assert.deepEqual(report.errors,[]);
 await page.screenshot({path:path.join(out,'installed-opening.png')});
}catch(error){report.failure=error.stack;console.error(error.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
