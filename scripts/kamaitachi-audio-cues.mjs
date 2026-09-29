/* Offline exact-edition sound cue timing probe. Audited integer routines only;
 * SDK/SPU calls become a timeline for the external original-bank renderer.
 * The repeated state is a cue-controller loop, not proof of a waveform loop.
 * Rumble has no audio output. SPU envelope/interpolation remain approximate. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import {NativeProbe} from '../web/adapters/shibuya428-native.mjs';
import {KAMA_EXE_HASH} from '../web/adapters/kamaitachi-text.mjs';
export function decodeCue(exe,cue,logical=0,variant=0){
 if(!Number.isInteger(logical)||logical<0||logical>255||!Number.isInteger(variant)||variant<0||variant>255)throw Error('Cue selector bound');
 const GP=0x8007913c,CH=0x801d6240,CUE=0x801f6720;
 if(exe.length!==434176||!(cue instanceof Uint8Array)||!cue.length||cue.length>400)throw Error('Invalid native sound cue resources');
 let frame=0,events=[],note=null;const hooks=new Map();
 hooks.set(0x8005a188,(p,args,{stackPointer:sp})=>{const more=[0,1,2,3].map(i=>p.read(sp+16+i*4));events.push({frame,op:'on',args:[...args,...more]});note={program:args[2],key:more[0]};return 18;});
 hooks.set(0x8005a4e8,(p,args)=>{events.push({frame,op:'off',args});note=null;return 0;});
 hooks.set(0x80059848,(p,args,{stackPointer:sp})=>{events.push({frame,op:'pitch',args:[...args,...[0,1,2].map(i=>p.read(sp+16+i*4))]});return 0;});
 hooks.set(0x8005a974,(p,args)=>{events.push({frame,op:'volume',args:args.slice(0,3)});return 0;});
 hooks.set(0x80061368,()=>note?1:0);
 hooks.set(0x8002678c,p=>{p.write(0x80079548,0,1);return 0;});
 const state=new Uint8Array(4096);state.set(exe.subarray(2048+0x69000));
 const p=new NativeProbe({globalPointer:GP,stackTop:0x801fff00,
  segments:[{address:0x80010000,bytes:exe.subarray(2048,2048+0x69000)},
   {address:0x80079000,bytes:state,writable:true},{address:CH,bytes:new Uint8Array(624),writable:true},
   {address:CUE,bytes:new Uint8Array(2400),writable:true},{address:0x801f7300,bytes:new Uint8Array(256),writable:true},
   {address:0x801eef50,bytes:new Uint8Array(64),writable:true},{address:0x801fc400,bytes:new Uint8Array(1024),writable:true},{address:0x801fd000,bytes:new Uint8Array(4096),writable:true},
   {address:0x801ff000,bytes:new Uint8Array(4096),writable:true}],
  ranges:[[0x80026f90,0x800281d8],[0x80044dd0,0x80044de8]],hooks});
 const segment=p.segments.find(s=>s.address===CUE);if(cue.length>400)throw Error('cue size');segment.bytes.set(cue);
 p.write(0x80079548,1,1);p.write(GP+0x7d,0,1);p.write(CH+0x10,CUE);p.write(CH+0x24,0x7f00);p.write(CH+0x30,0x7f00);
 for(const o of [0x28,0x2c,0x34,0x38])p.write(CH+o,0x10000);
 p.write(CH+6,logical,2);p.write(0x801fc460+logical,variant,1);p.write(CH+4,65535,2);p.write(CH+0xe,0x3000,2);p.write(CH+0x58,0x4000);p.write(CH+0x5c,0x4000);
 for(let i=0;i<6;i++)p.write(0x801fd370+i*4,65535);
 const seen=new Map();let stop,loopStart=null,completionFrame=null;
 for(frame=0;frame<18000;frame++){
  p.call(0x80027490,[],100000);
  if(completionFrame===null&&p.read(0x801fd388+logical,1)===1)completionFrame=frame;
  if(!p.read(0x80079548,1)||!p.read(CH+0x10)){stop='end';break;}
  const pc=p.read(CH+0x10);if(pc<CUE||pc>CUE+cue.length)throw Error('Native audio cue pointer outside source');
  const bytes=p.segments.find(s=>s.address===CH).bytes.subarray(0,104),key=Buffer.from(bytes).toString('hex');
  if(seen.has(key)){loopStart=seen.get(key);stop='loop';break;}seen.set(key,frame);
 }
 if(!stop)throw Error('Audio cue frame bound');
 events=events.filter((e,i,all)=>e.op!=='volume'||i===0||all[i-1].op!=='volume'||JSON.stringify(all[i-1].args)!==JSON.stringify(e.args));
 return {frame,stop,loopStart,completionFrame,events};
}

if(process.argv[1]&&import.meta.url===new URL(process.argv[1],'file:').href){
 const [exePath,inputPath,outPath]=process.argv.slice(2),exe=fs.readFileSync(exePath);
 if(crypto.createHash('sha256').update(exe).digest('hex')!==KAMA_EXE_HASH)throw Error('Unsupported Kamaitachi cue executable');
 const rows=JSON.parse(fs.readFileSync(inputPath));if(!Array.isArray(rows)||rows.length>512)throw Error('Cue input bound');
 const result=rows.map(row=>{if(typeof row.cue!=='string'||row.cue.length>800||row.cue.length%2||!/^[a-f0-9]+$/.test(row.cue))throw Error('Invalid cue bytes');return {id:row.id,...decodeCue(exe,new Uint8Array(Buffer.from(row.cue,'hex')),row.logical??0,row.variant??0)};});
 fs.writeFileSync(outPath,JSON.stringify(result),{flag:'wx'});
}
