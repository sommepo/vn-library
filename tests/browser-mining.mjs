// Real reader source composition and bridge; Anki collection writes are mocked.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import crypto from 'node:crypto';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),out=path.resolve(process.argv[2]),library=path.resolve(process.env.VNKIT_LIBRARY||'private/library'),game=process.env.VNKIT_GAME_ID||'original-synthetic';
await fs.mkdir(out,{recursive:false});
const processServer=spawn('python3',['tests/mining-servers.py',library,path.join(out,'state')],{cwd:root,stdio:['pipe','pipe','pipe']});
let err='';processServer.stderr.on('data',b=>err+=b);
const ports=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error(err||'server timeout')),15000);processServer.stdout.once('data',b=>{clearTimeout(t);resolve(JSON.parse(b));});processServer.on('exit',c=>{clearTimeout(t);reject(Error(`server ${c} ${err}`));});});
const origin=`http://127.0.0.1:${ports.reader}`,playwright=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs'))),browserType=process.env.VNKIT_BROWSER||'chromium';
let browser,page;const report={browser:browserType,game,checks:[],errors:[],ankiCollection:'mock transport; no real user collection touched'};
const pass=x=>{report.checks.push(x);console.log('PASS '+x);};
const post=async body=>{const r=await fetch(`http://127.0.0.1:${ports.bridge}/`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,...(ports.remoteKey?{key:ports.remoteKey}:{})})});return r.json();};
const records=()=>fetch(`http://127.0.0.1:${ports.anki}/`).then(r=>r.json());
const mineNote=url=>({deckName:'Test',modelName:'Vocabulary',fields:{Word:'道',Sentence:'Test sentence',Source:url,Picture:'',SentenceAudio:'',WordAudio:'[sound:dictionary.mp3]'}});
try{
 browser=await playwright[browserType].launch({headless:true});page=await browser.newPage({viewport:{width:1000,height:850}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('vnkit.settings',JSON.stringify({speed:0,ankiMedia:true,music:0,voice:0,sound:0})));
 let releasePreparation;
 const preparationGate=new Promise(resolve=>{releasePreparation=resolve;});
 await page.route('**/api/mining/contexts',async route=>{await preparationGate;await route.continue();});
 await page.goto(`${origin}/?game=${game}&fixture=1`);
 const ready=()=>page.waitForFunction(()=>/^#vnl=[a-f0-9]{64}$/.test(location.hash)&&!document.querySelector('#stage').hasAttribute('aria-busy'),null,{timeout:30000});
 const ctx=async url=>{const r=await fetch(origin+'/api/mining/context',{headers:{'X-VNKit-Mining-Context':new URL(url).hash.slice(5)}});assert.equal(r.status,200);return r.json();};
 await page.locator('#ankiMediaButton[data-state=pending]').waitFor();
 const pendingUrl=page.url();assert.equal(new URL(pendingUrl).hash,'#vnl=pending');
 let pendingReply=await post({action:'addNote',version:6,params:{note:mineNote(pendingUrl)}});
 assert.match(pendingReply.error,/before its media was ready/);assert.deepEqual(await records(),[]);
 releasePreparation();await ready();await page.unroute('**/api/mining/contexts');
 assert.equal(await page.locator('#ankiMediaButton').textContent(),'Anki: ready');
 pendingReply=await post({action:'addNote',version:6,params:{note:mineNote(pendingUrl)}});
 assert.match(pendingReply.error,/look up the word again/);assert.deepEqual(await records(),[]);
 pass('Delayed preparation is visible; an early lookup is rejected even after media becomes ready');
 if(process.env.VNKIT_CHECKPOINT){const old=page.url();await page.locator('#saveFile').setInputFiles(path.resolve(process.env.VNKIT_CHECKPOINT));await page.waitForFunction(old=>location.href!==old,old);await ready();}
 let firstUrl=page.url(),first=await ctx(firstUrl);
 if(game!=='original-synthetic'){
  for(let n=0;n<180&&!first.audio;n++){
   if(await page.locator('#choices button').count())await page.locator('#choices button').first().click();
   else {await page.waitForFunction(()=>!document.querySelector('#nextButton').disabled);await page.locator('#nextButton').click();}
   await page.waitForFunction(old=>location.href!==old,firstUrl);await ready();firstUrl=page.url();first=await ctx(firstUrl);
  }
  assert.ok(first.audio,'Expected a source-voiced scene within 180 pages');
  await fs.writeFile(path.join(out,'native-scene.png'),Buffer.from(first.image.data,'base64'));
  pass('Actual game reaches a voiced scene with original composited artwork');
 }

 if(game==='original-synthetic'){
  assert.ok(first.audio);assert.ok(first.image);assert.equal(first.image.filename.endsWith('.png'),true);
  const blob=Buffer.from(first.image.data,'base64');assert.equal(blob.readUInt32BE(16),640);assert.equal(blob.readUInt32BE(20),448);pass('Native-resolution scene and original voiced fixture asset published');
 }
 // Save a URL as Yomitan does when opening its lookup, then move the game on.
 await page.locator('#nextButton').click();await page.waitForFunction(old=>location.href!==old,firstUrl);await ready();
 const second=await ctx(page.url());assert.notEqual(second.occurrenceId,first.occurrenceId);assert.equal((await ctx(firstUrl)).image.filename,first.image.filename);
 const counts=()=>page.evaluate(async game=>{const{Store}=await import('/storage.mjs');const s=new Store();await s.open();const a=await s.get(game+':activity');s.db.close();return {seen:a.seen,occurrences:a.occurrences,characters:a.sessions.reduce((n,x)=>n+x.characters,0)};},game);const beforeAdd=await counts();
 let result;
 if(process.env.VNKIT_YOMITAN_CLIENT){
  const {AnkiConnect}=await import(pathToFileURL(path.resolve(process.env.VNKIT_YOMITAN_CLIENT)));const client=new AnkiConnect();client.enabled=true;client.server=`http://127.0.0.1:${ports.bridge}/`;if(ports.remoteKey)client.apiKey=ports.remoteKey;assert.equal(await client.addNote(mineNote(firstUrl)),123);pass('Unmodified upstream Yomitan AnkiConnect client adds a note through the bridge');
 }else{result=await post({action:'addNote',version:6,params:{note:mineNote(firstUrl)}});assert.equal(result.result,123);assert.equal(result.error,null);}
 assert.deepEqual(await counts(),beforeAdd);pass('Mining does not change read IDs, occurrences or character totals');
 let all=await records(),added=all.find(r=>r.action==='addNote').params.note;
 if(ports.remoteKey){assert.ok(!JSON.stringify(all).includes(ports.remoteKey));pass('Remote mode accepts Yomitan’s connection key without forwarding it to Anki');}
 assert.ok(added.fields.Picture.includes(first.image.filename));if(first.audio)assert.ok(added.fields.SentenceAudio.includes(first.audio.filename));assert.equal(added.fields.WordAudio,'[sound:dictionary.mp3]');assert.ok(!added.fields.Source.includes('#vnl='));
 assert.equal(all.find(r=>r.action==='storeMediaFile').sha256,crypto.createHash('sha256').update(Buffer.from(first.image.data,'base64')).digest('hex'));pass('Lookup stays pinned after advancing; original media arrives before note; word audio preserved');
 if(game==='original-synthetic'){
  assert.equal(second.audio,null);await post({action:'addNote',version:6,params:{note:mineNote(page.url())}});all=await records();assert.equal(all.filter(r=>r.action==='addNote').at(-1).params.note.fields.SentenceAudio,'');pass('Unvoiced narration never inherits the previous voice');
 }
 await page.locator('#backlogButton').click();assert.equal(new URL(page.url()).hash,'#vnl=unavailable');result=await post({action:'addNote',version:6,params:{note:mineNote(page.url())}});assert.ok(result.error);pass('Backlog refuses mismatched current-scene media');await page.keyboard.press('Escape');await ready();pass('Closing a panel with Escape restores mining availability');
 // HTTP authorization and malformed payload tests use real endpoints.
 let r=await fetch(origin+'/api/mining/contexts',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);
 r=await fetch(origin+'/api/mining/context',{headers:{'X-VNKit-Mining-Context':'f'.repeat(64)}});assert.equal(r.status,404);
 r=await fetch(`http://127.0.0.1:${ports.bridge}/`,{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(r.status,403);pass('Session auth, unknown capabilities and hostile web origins rejected');
 if(game==='original-synthetic'){await page.locator('#choiceButton').click();await page.locator('#choices button').first().waitFor();await ready();assert.equal((await ctx(page.url())).audio,null);pass('Next choice prepares only its visible destination for mining');}
 const beforeReload=(await ctx(page.url())).occurrenceId;await page.reload();await ready();assert.equal((await ctx(page.url())).occurrenceId,beforeReload);pass('Save restore creates a fresh media context for the same occurrence');
 const beforeRetry=await counts();
 await page.route('**/api/mining/contexts',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"test outage"}'}));
 await page.locator('#ankiMediaButton').click();await page.getByRole('button',{name:'Prepare current line again',exact:true}).click();
 await page.locator('#ankiMediaButton[data-state=error]').waitFor();await page.locator('#closePanel').click();
 assert.equal(new URL(page.url()).hash,'#vnl=error');assert.equal(await page.locator('#ankiMediaButton').textContent(),'Anki: retry');
 await page.unroute('**/api/mining/contexts');
 await page.locator('#ankiMediaButton').click();await page.getByRole('button',{name:'Prepare current line again',exact:true}).click();
 await page.locator('#ankiMediaButton[data-state=ready]').waitFor();await page.locator('#closePanel').click();await ready();
 assert.deepEqual(await counts(),beforeRetry);pass('Failed preparation stops showing pending; explicit retry recovers without study counts');
 await page.locator('#settingsButton').click();await page.getByRole('button',{name:'Anki media',exact:true}).click();await page.locator('#anki-media-enabled').uncheck();assert.equal(new URL(page.url()).hash,'');pass('Opt-out removes mining capability from the reading URL');
 assert.deepEqual(report.errors,[]);await page.screenshot({path:path.join(out,'settings.png')});
}catch(e){report.failure=e.stack;console.error(e.stack);process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')});}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser?.close();processServer.stdin.end();}
