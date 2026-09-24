// Private diagnostic: observe the original renderer; not reader/playability proof.
// Requires a reference harness boot disk containing the original diagnostic TSR.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const [reference,modulePath,output,resume]=process.argv.slice(2);
if(!reference||!modulePath||!output)throw Error('Usage: yuno-native-probe.mjs PRIVATE_REFERENCE_FOLDER PRIVATE_MODULE OUTPUT_FOLDER');
await fs.access(path.join(reference,'files.json'));
const server=spawn('python3',['-u','-c','import http.server,sys,functools\ns=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(http.server.SimpleHTTPRequestHandler,directory=sys.argv[1]))\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.resolve(reference)],{stdio:['ignore','pipe','ignore']});
const port=await new Promise((resolve,reject)=>{server.stdout.once('data',b=>resolve(Number(b.toString().trim())));server.on('error',reject);server.on('exit',n=>reject(Error('Reference server exited '+n)));});
const url=`http://127.0.0.1:${port}/`;
await fs.mkdir(output,{recursive:true});
const native=await fs.readFile(modulePath),signature=Array.from(native.subarray(0x4f7b,0x4f7b+32));
const api=await import(pathToFileURL(path.resolve('private/tooling/playwright/package/index.mjs')));
let browser;
try{
 browser=await api.chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:800,height:600}});await page.goto(url);await page.waitForFunction(()=>window.ready);
 if(resume){
  await page.waitForTimeout(1500);
  const saved=(await fs.readFile(resume)).toString('base64');
  console.log('restore',await page.evaluate(bytes=>{Module._webnp2_dbg_set_paused(1);FS.writeFile('/resume.state',Uint8Array.from(atob(bytes),c=>c.charCodeAt(0)));return ccall('webnp2_statload','number',['string'],['/resume.state']);},saved));
 }
 await page.evaluate(signature=>{
  window.probe={glyphs:[],installed:false,error:null};
  const magic=new TextEncoder().encode('VNKIT-PC98-TEXT-PROBE-1'),decode=new TextDecoder('shift-jis',{fatal:true});
  let traceBase=null,consumed=0;
  const find=(mem,bytes)=>{const results=[];for(let p=0x1000;p<0xa0000-bytes.length;p++){if(mem[p]!==bytes[0])continue;let i=1;for(;i<bytes.length&&mem[p+i]===bytes[i];i++);if(i===bytes.length)results.push(p);}return results;};
  const tick=()=>{try{
   const ptr=Module._webnp2_mem_ptr(),mem=HEAPU8.subarray(ptr,ptr+0x110000),view=new DataView(mem.buffer,mem.byteOffset,mem.byteLength);
   if(!probe.installed){
    const tsr=find(mem,magic),code=find(mem,signature);if(!tsr.length)return;
    // The original TSR's segment is paragraph-aligned and owned by DOS.
    const address=tsr.find(p=>(p-0x120)%16===0);if(address===undefined)return;
    traceBase=address-0x120;const hook=code.find(p=>(p-0x4f7b)%16===0);
    let segment;
    if(hook===undefined){
     segment=view.getUint16(traceBase+0x379,true);
     if(view.getUint16(traceBase+0x377,true)!==0x4f81||mem[segment*16+0x4f7b]!==0xea)return;
     consumed=view.getUint16(traceBase+0x200,true);
    }else{
     segment=(hook-0x4f7b)/16;
     mem.set(mem.slice(hook,hook+6),traceBase+0x370);
     view.setUint16(traceBase+0x377,0x4f81,true);view.setUint16(traceBase+0x379,segment,true);
     mem.set([0xea,0x00,0x03,(traceBase/16)&255,(traceBase/16)>>8,0x90],hook);
    }
    probe.installed=true;probe.segment=segment;probe.traceBase=traceBase;
   }
   const produced=view.getUint16(traceBase+0x200,true),count=(produced-consumed)&65535;
   if(count>64)throw Error('Glyph probe ring overflow; no text may be inferred');
   while(consumed!==produced){
    const pos=traceBase+0x800+(consumed&63)*32,record=[];for(let i=0;i<8;i++)record.push(view.getUint16(pos+i*2,true));
    probe.glyphs.push({record,text:decode.decode(Uint8Array.of(record[1]>>8,record[1]&255)),time:performance.now()});consumed=(consumed+1)&65535;
    if(probe.glyphs.length>10000)throw Error('Probe output limit reached');
   }
  }catch(e){probe.error=e.message;clearInterval(probe.timer);Module._webnp2_dbg_set_paused(1);}};
  tick();probe.timer=setInterval(tick,16);Module._webnp2_dbg_set_paused(0);
 },signature);
 if(!resume){
 await page.waitForTimeout(23000);
 console.log('boot',await page.evaluate(()=>({installed:probe.installed,glyphs:probe.glyphs.length,error:probe.error})));
 await page.locator('canvas').focus();await page.keyboard.down('Enter');await page.waitForTimeout(150);await page.keyboard.up('Enter');
 await page.waitForTimeout(12000);
 await page.evaluate(()=>Module._webnp2_mouse_button(0,1));await page.waitForTimeout(150);await page.evaluate(()=>Module._webnp2_mouse_button(0,0));
 await page.waitForTimeout(16000);
 }else{
  await page.locator('canvas').focus();
  if(process.env.VNKIT_NATIVE_CLICK){const [x,y]=process.env.VNKIT_NATIVE_CLICK.split(',').map(Number);await page.evaluate(async ([x,y])=>{const move=async(dx,dy)=>{while(dx||dy){const a=Math.max(-32,Math.min(32,dx)),b=Math.max(-32,Math.min(32,dy));Module._webnp2_mouse_move(a,b);dx-=a;dy-=b;const deadline=performance.now()+1000;while(Module._webnp2_mouse_pending()){if(performance.now()>deadline)throw Error('Native mouse did not consume movement');await new Promise(r=>setTimeout(r,10));}}};await move(-800,-500);await move(x,y);},[x,y]);await page.evaluate(()=>Module._webnp2_mouse_button(0,1));await page.waitForTimeout(150);await page.evaluate(()=>Module._webnp2_mouse_button(0,0));}
  else{await page.keyboard.down('Enter');await page.waitForTimeout(150);await page.keyboard.up('Enter');}
  await page.waitForTimeout(18000);
 }
 const report=await page.evaluate(()=>({installed:probe.installed,segment:probe.segment,traceBase:probe.traceBase,glyphs:probe.glyphs,error:probe.error}));
 await fs.writeFile(path.join(output,'glyphs.json'),JSON.stringify(report,null,2),{flag:'wx'});await page.screenshot({path:path.join(output,'screen.png')});
 const state=await page.evaluate(()=>{const code=ccall('webnp2_statsave','number',['string'],['/probe.state']);return {code,bytes:Array.from(FS.readFile('/probe.state'))};});
 await fs.writeFile(path.join(output,'probe.state'),Buffer.from(state.bytes),{flag:'wx'});
 const memory=await page.evaluate(()=>{Module._webnp2_dbg_set_paused(1);const p=Module._webnp2_mem_ptr();return Array.from(HEAPU8.subarray(p,p+0x110000));});
 await fs.writeFile(path.join(output,'memory.bin'),Buffer.from(memory),{flag:'wx'});
 console.log('result',report.installed,report.glyphs.length,report.error,'save',state.code);
 if(report.error||!report.glyphs.length)process.exitCode=1;
}finally{await browser?.close();server.kill('SIGTERM');}
