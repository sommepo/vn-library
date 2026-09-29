/* Offline source MML requests from the exact owner's executable. This is an
 * integer cue interpreter, not an SPU emulator: envelope/mixing and live cue
 * changes are reported separately by the original-bank renderer. */
import fs from 'node:fs';import crypto from 'node:crypto';
import {NativeProbe} from '../web/adapters/shibuya428-native.mjs';
import {EXE_HASH} from '../web/adapters/otogirisou-kernel.mjs';
export function decodeCue(exe,id){
 if(exe.length!==440320||!Number.isInteger(id)||id<0||id>=160)throw Error('Otogirisou cue identity');
 const state=new Uint8Array(0x14000);state.set(exe.subarray(2048+0x6a000));
 const hooks=new Map(),events=[],seen=new Map();let frame=0,loopStart=null,stop;
 hooks.set(0x80023e70,()=>0); // Live voice ramp is a documented synthesis approximation.
 hooks.set(0x8002d928,()=>0); // Diagnostic formatting has no cue effects.
 hooks.set(0x80054bf4,(p,[a])=>{let s='';for(let i=0;i<32;i++){const b=p.read(a+i,1);if(!b)break;s+=String.fromCharCode(b);}return parseInt(s,10)||0;});
 hooks.set(0x80024118,(p,[,channel])=>{
  const a=0x80087530+channel*60,flags=p.read(a+4);
  if(!(flags&0x80000000))events.push({frame,logical:p.read(a+2,1),part:Number(Boolean(flags&0x02000000)),pitch:p.read(a+0x28,2),volume:p.read(a+0x30,2),flags});
  p.write(a+20,0,1);return 0;
 });
 const p=new NativeProbe({globalPointer:0x8007a610,stackTop:0x801fff00,segments:[
  {address:0x80010000,bytes:exe.subarray(2048,2048+0x6a000)},{address:0x8007a000,bytes:state,writable:true},{address:0x801ff000,bytes:new Uint8Array(4096),writable:true}],
  ranges:[[0x80027960,0x80029e04],[0x8002d8a4,0x8002d928],[0x80023280,0x80023504]],hooks});
 for(let i=0;i<8;i++)p.write(0x80086b80+i*4,0xffffffff);
 if(id<23){for(let i=0;i<24;i++)p.write(0x8007b000+i,i<3?exe[2048+0x1b90+i]:0,1);p.write(0x8007b001,id,1);p.call(0x80029b00,[0x8007b000]);}else p.call(0x80029c74,[id]);
 const memory=p.segments.find(s=>s.address===0x8007a000).bytes;
 for(frame=1;frame<18000;frame++){
  const pc=p.read(0x80086b80),wait=p.read(0x8008753e,2)<<16>>16;
  if(pc===0xffffffff){stop='end';break;}
  if(wait<0){stop='sample-end';break;}
  const key=Buffer.from(memory.subarray(0xcb00,0xdb00)).toString('base64');
  if(seen.has(key)){loopStart=seen.get(key);stop='loop';break;}seen.set(key,frame);
  p.write(0x8008753e,wait-1,2);if(wait===1)p.call(0x80029954,[0,pc]);
 }
 if(!stop)throw Error('Otogirisou cue frame bound');
 return{id,frame,stop,loopStart,events};
}
if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 const [source,output]=process.argv.slice(2),exe=fs.readFileSync(source);
 if(crypto.createHash('sha256').update(exe).digest('hex')!==EXE_HASH)throw Error('Unsupported Otogirisou executable');
 const rows=[];for(let id=0;id<160;id++)if(exe[2048+0x51f9c+id]>=27){try{rows.push(decodeCue(exe,id));}catch(error){rows.push({id,error:error.message});}}
 fs.writeFileSync(output,JSON.stringify(rows),{flag:'wx'});console.log(JSON.stringify({cues:rows.length,errors:rows.filter(r=>r.error)}));
}
