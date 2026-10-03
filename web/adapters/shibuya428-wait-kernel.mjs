/* Exact-edition interruptible source waits in ordinary story mode. Native
 * input/timer logic runs with auto/skip and thread execution disabled. The
 * separate hint activation and timeline controllers remain explicit stops.
 * No original bytes are bundled; transactions are opaque and in-memory. */
import {NativeProbe} from './shibuya428-native.mjs';
const E=0x10000000,SNS=0x11000000,HEAP=0x13000000,STACK=0x14000000,PROMPT=E+0x24000;
const identities={elf:'194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce',sns:'1a467441c56f57337c499541a781da9323551db542069c44d8f146f19e1d5968'};
const verified=new WeakSet();export const is428WaitKernel=k=>verified.has(k);
export async function create428WaitKernel(inputs,scripts){
 const bytes={};for(const[name,expected]of Object.entries(identities)){
  if(!(inputs[name] instanceof Uint8Array)||inputs[name].length>4*1024*1024)throw Error('428 wait input bound');bytes[name]=new Uint8Array(inputs[name]);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes[name]));if([...hash].map(n=>n.toString(16).padStart(2,'0')).join('')!==expected)throw Error(`428 wait ${name} identity mismatch`);
 }
 const tokens=new Map();for(const s of Object.values(scripts))for(const t of s.tokens)if(t.code===0x2e){
  const at=s.sns_offset+t.offset;if(bytes.sns[at]!==0x2e||bytes.sns[at+1]!==4||t.args?.length!==4||t.next!==t.offset+6||t.args.some((v,n)=>bytes.sns[at+2+n]!==v))throw Error('428 source wait mismatch');
  tokens.set(t.id,{script:s.index,address:SNS+at,frames:((t.args[0]<<24)|(t.args[1]<<16)|(t.args[2]<<8)|t.args[3])});
 }
 const ev=new DataView(bytes.elf.buffer),hooks=new Map();let active=null,input={};
 let allocated=0;
 hooks.set(0x882034c,(_,[size])=>{const at=HEAP+allocated;allocated=(allocated+size+15)&~15;if(allocated>0x100000)throw Error('428 wait allocation bound');return at;});
 for(const at of [0x88204e8,0x8813d00])hooks.set(at,(p,[dst,value,size])=>{if(size>0x100000)throw Error('428 wait clear bound');for(let n=0;n<size;n++)p.write(dst+n,value,1);return dst;});
 const p=new NativeProbe({segments:[
  {address:ev.getUint32(60,true),bytes:bytes.elf.subarray(ev.getUint32(56,true),ev.getUint32(56,true)+ev.getUint32(68,true))},
  {address:0x9ef0000,bytes:new Uint8Array(0x10000),writable:true},{address:E,bytes:new Uint8Array(0x30000),writable:true},
  {address:SNS,bytes:bytes.sns,writable:true},{address:HEAP,bytes:new Uint8Array(0x100000),writable:true},{address:STACK,bytes:new Uint8Array(0x10000),writable:true},
 ],hooks,stackTop:STACK+0xfff0,ranges:[
  [0x887ae44,0x887ae50],[0x887bc7c,0x887c6b8],[0x8879878,0x8879880],[0x8879a44,0x8879a4c],
  [0x8893440,0x8893448],[0x8893594,0x8893850],[0x88a2074,0x88a21f8],
  [0x887cda8,0x887cde8],[0x887cb38,0x887cba0],[0x887d09c,0x887d0a4],
 ]});
 p.write(0x9ef1e30,E);
 p.write(E+0x29ca8,SNS);p.call(0x887bc7c,[E]);
 for(const s of Object.values(scripts))if(p.read(E+0x1c+s.index*4)!==SNS+s.sns_offset)throw Error('428 wait script directory mismatch');
 for(const address of [SNS,HEAP])p.segments.find(s=>s.address===address).writable=false;
 hooks.set(0x882034c,()=>{throw Error('428 wait unexpected allocation');});
 hooks.set(0x886832c,(_,[key])=>Number(key===7?input.confirm:key===5?input.back:key===12?input.hint:false));
 // Hide the host message indicator. The native request and saved controller
 // are retained; choosing the source hint is a separate VM transaction.
 hooks.set(0x887d0a4,()=>0);
 hooks.set(0x88dfc98,(_,[kind,parameter])=>{if(kind!==19||parameter!==0)throw Error('Unsupported wait prompt');return PROMPT;});
 const snapshots=new WeakMap(),capture=()=>({memory:p.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]),active:structuredClone(active)});
 const restore=s=>{for(const[segment,b]of s.memory)segment.bytes.set(b);active=structuredClone(s.active);input={};};
 const clean=capture(),atomic=fn=>{const before=capture();try{return fn();}catch(e){restore(before);throw e;}};
 const system=()=>({type:p.read(E+0x29c60),code:p.read(E+0x29c64),active:!!p.read(E+0x29c68,1)});
 const view=()=>({kind:'inputWait',done:active.done,...(active.hint?{hint:true}:{}),frames:active.frames,remaining:p.read(E+0x165c)|0,system:system(),hintPrompt:p.read(E+0x2f2c)!==0&&p.read(PROMPT+0x34)===1});
 const api=Object.freeze({
  checkpoint(){const t=Object.freeze({});snapshots.set(t,capture());return t;},
  restore(t){const s=snapshots.get(t);if(!s)throw Error('428 wait foreign checkpoint');restore(s);},
  start(event){return atomic(()=>{
   if(active)throw Error('428 wait already active');const t=tokens.get(event?.id),s=event?.system;
   if(event?.kind!=='inputWait'||!t||t.script!==event.script||t.frames!==event.frames||event.frames< -1||event.frames>60000)throw Error('428 wait source event mismatch');
   if(!s||![0,1,2].includes(s.type)||!Number.isInteger(s.code)||s.code<0||s.code>255||typeof s.active!=='boolean'||s.active&&s.type!==0)throw Error('Unsupported wait system state');
   if(event.hints!==undefined&&event.hints!==1)throw Error('Unsupported wait hint count');
   restore(clean);active={event:structuredClone(event),done:false,frames:0};p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);
   p.write(E+0x29c60,s.type);p.write(E+0x29c64,s.code);p.write(E+0x29c68,Number(s.active),1);
   p.write(E+0x2ef4,event.hints??0);p.write(E+0x29cb0,5);
   if(p.call(0x88a2074,[],20000).value!==1||p.read(E+0x14)!==t.address+6||(p.read(E+0x165c)|0)!==event.frames||p.read(E+0x1658,1)!==1)throw Error('428 wait setup result');
   return view();
  });},
  tick(keys={}){return atomic(()=>{
   if(!active||active.done)throw Error('428 wait not active');
   if(Object.keys(keys).some(k=>!['confirm','back','hint'].includes(k))||Object.values(keys).some(v=>typeof v!=='boolean'))throw Error('Unsupported wait input');
   input=keys;active.frames++;p.call(0x88935a4,[E+0x1658],20000);
   active.hint=p.read(E+0x29cb0)===11;active.done=active.hint||p.read(E+0x165c)===0;return view();
  });},
  finish(event){return atomic(()=>{if(!active?.done||JSON.stringify(active.event)!==JSON.stringify(event))throw Error('428 wait requires native completion');const result={...system(),...(active.hint?{hint:true}:{})};active=null;return result;});},
 });verified.add(api);return api;
}
