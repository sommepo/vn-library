// Private original-game evidence. Not a synthetic reader or route test.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const [reference,moduleFile,out]=process.argv.slice(2);
if(!reference||!moduleFile||!out)throw Error('Usage: yuno-runtime-probe.mjs PRIVATE_REFERENCE PRIVATE_MODULE NEW_OUTPUT');
await fs.mkdir(out,{recursive:false});
const module64=(await fs.readFile(moduleFile)).toString('base64');
const observer=await fs.readFile('web/adapters/yuno-pc98-observer.mjs','utf8');
let server,browser;
try{
 server=spawn('python3',['-u','-c','import http.server,sys,functools\ns=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=sys.argv[1]))\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.resolve(reference)],{stdio:['ignore','pipe','ignore']});
 const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(Number(b.toString().trim())));server.on('error',reject);server.on('exit',n=>reject(Error('Reference server exited '+n)));});
 const api=await import(pathToFileURL(path.resolve('private/tooling/playwright/package/index.mjs')));
 browser=await api.chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto(`http://127.0.0.1:${port}/`);await page.waitForFunction(()=>window.ready);
 await page.evaluate(async ({observer,module64})=>{
  const url=URL.createObjectURL(new Blob([observer],{type:'text/javascript'}));
  const {NativeObserver}=await import(url);URL.revokeObjectURL(url);
  window.nativeProbe={events:[],error:null};const agent=new NativeObserver(Uint8Array.from(atob(module64),c=>c.charCodeAt(0)));
  nativeProbe.timer=setInterval(()=>{try{const p=Module._webnp2_mem_ptr();nativeProbe.events.push(...agent.drain(HEAPU8.subarray(p,p+0x110000)));nativeProbe.installed=agent.base!==null;if(nativeProbe.events.length>100000)throw Error('Observation limit reached');}catch(e){nativeProbe.error=e.message;Module._webnp2_dbg_set_paused(1);clearInterval(nativeProbe.timer);}},10);
 },{observer,module64});
 const check=async label=>{const result=await page.evaluate(()=>({installed:nativeProbe.installed,count:nativeProbe.events.length,error:nativeProbe.error}));console.log(label,result);if(result.error)throw Error(result.error);await page.screenshot({path:path.join(out,label+'.png')});};
 const enter=async()=>{await page.locator('canvas').focus();await page.keyboard.down('Enter');await page.waitForTimeout(150);await page.keyboard.up('Enter');};
 const click=async(x,y)=>{
  await page.evaluate(async([x,y])=>{
   const move=async(dx,dy)=>{while(dx||dy){const a=Math.max(-32,Math.min(32,dx)),b=Math.max(-32,Math.min(32,dy));Module._webnp2_mouse_move(a,b);dx-=a;dy-=b;const until=performance.now()+1000;while(Module._webnp2_mouse_pending()){if(performance.now()>until)throw Error('Mouse did not consume movement');await new Promise(r=>setTimeout(r,10));}}};
   await move(-800,-500);await move(x,y);
  },[x,y]);
  await page.evaluate(()=>Module._webnp2_mouse_button(0,1));await page.waitForTimeout(150);await page.evaluate(()=>Module._webnp2_mouse_button(0,0));
 };
 await page.waitForTimeout(23000);await check('colour');await enter();await page.waitForTimeout(10000);
 await page.evaluate(()=>Module._webnp2_mouse_button(0,1));await page.waitForTimeout(150);await page.evaluate(()=>Module._webnp2_mouse_button(0,0));await page.waitForTimeout(16000);await check('menu');
 await click(170,84);await page.waitForTimeout(2500);await check('area');await click(265,122);await page.waitForTimeout(8000);await check('name');
 if(!await page.evaluate(()=>nativeProbe.events.some(e=>e.filename==='NAME.MES')))throw Error('Original name entry was not reached');
 await click(535,345);
 await page.waitForTimeout(18000);await check('dialogue');
 for(let i=0;i<10;i++){await enter();await page.waitForTimeout(900);}
 await check('advanced');
 const result=await page.evaluate(()=>{Module._webnp2_dbg_set_paused(1);return nativeProbe;});
 await fs.writeFile(path.join(out,'observations.json'),JSON.stringify(result),{flag:'wx'});
 const state=await page.evaluate(()=>{const code=ccall('webnp2_statsave','number',['string'],['/observed.state']);const bytes=FS.readFile('/observed.state');let b64='';for(let i=0;i<bytes.length;i+=32768)b64+=String.fromCharCode(...bytes.subarray(i,i+32768));return {code,b64:btoa(b64)};});
 await fs.writeFile(path.join(out,'observed.state'),Buffer.from(state.b64,'base64'),{flag:'wx'});
 console.log('Complete',result.events.length,'native observations; save result',state.code);
}finally{await browser?.close();server?.kill('SIGTERM');}
