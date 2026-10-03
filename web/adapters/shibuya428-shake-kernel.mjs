/* Exact-edition picture shake. The original controller, PRNG and software
 * trigonometry run in a bounded probe. The host supplies the presentation-only
 * PRNG state; no claim is made that it matches a PSP session's random seed.
 * Only compact counters/offsets/RNG words cross this boundary, never probe RAM. */
import {NativeProbe} from './shibuya428-native.mjs';
const E=0x10000000,S=E+0x100,R=E+0x200,STACK=0x14000000;
const verified=new WeakSet();
export const is428ShakeKernel=kernel=>verified.has(kernel);
export async function create428ShakeKernel(elf){
 if(!(elf instanceof Uint8Array)||elf.length>4*1024*1024)throw Error('428 shake input bound');
 const bytes=new Uint8Array(elf),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!=='194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce')throw Error('428 shake ELF identity mismatch');
 const ev=new DataView(bytes.buffer),hooks=new Map();let state,active;
 const p=new NativeProbe({segments:[
  {address:ev.getUint32(60,true),bytes:bytes.subarray(ev.getUint32(56,true),ev.getUint32(56,true)+ev.getUint32(68,true))},
  {address:E,bytes:new Uint8Array(0x1000),writable:true},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true}
 ],stackTop:STACK+0xfff0,float32:true,hooks,ranges:[
  [0x8909c08,0x8909d90],[0x8815afc,0x8815b88],
  [0x880b8bc,0x880c934],[0x880d720,0x880e200],[0x880e9e8,0x880ee50]
 ]});
 const bits=new DataView(new ArrayBuffer(4));
 const writeFloat=(at,n)=>{bits.setFloat32(0,n,true);p.write(at,bits.getUint32(0,true));};
 const readFloat=at=>{bits.setUint32(0,p.read(at),true);return bits.getFloat32(0,true);};
 hooks.set(0x89040dc,()=>E);hooks.set(0x8904ec8,()=>S);
 hooks.set(0x8904f10,(_,[manager,index])=>{if(manager!==E||index!==0)throw Error('Unverified shake operand');return state.interval;});
 hooks.set(0x890569c,()=>state.amplitudeY===undefined?21:22);hooks.set(0x8812b54,()=>R);
 hooks.set(0x8905708,(_,args,ctx)=>{writeFloat(E+0x10,ctx.float32(12));return 0;});
 hooks.set(0x890572c,(_,args,ctx)=>{writeFloat(E+0x14,ctx.float32(12));return 0;});
 hooks.set(0x8904eec,(_,[manager,status])=>{if(manager!==E||status!==2)throw Error('Unverified shake status');active=false;return 0;});
 const kernel={step(input,rng){
  if(!input||input.amplitudeY!==undefined&&(!Number.isInteger(input.amplitudeY)||input.amplitudeY<0||input.amplitudeY>32767)||![input.interval,input.countdown,input.remaining,input.amplitude].every(Number.isInteger)||input.interval<0||input.interval>60000||input.countdown<0||input.countdown>input.interval||input.remaining< -1||input.remaining>60000||input.amplitude<0||input.amplitude>32767||![input.x,input.y].every(Number.isFinite)||typeof input.active!=='boolean'||!Array.isArray(rng)||rng.length!==2||rng.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw Error('Invalid compact shake state');
  if(!input.active)return {state:{...input},rng:[...rng]};
  state={...input};active=true;
  p.write(S,input.countdown);p.write(S+4,input.remaining);p.write(S+8,input.amplitude);p.write(S+12,input.amplitudeY??0);p.write(R+0xa8,rng[0]);p.write(R+0xac,rng[1]);writeFloat(E+0x10,input.x);writeFloat(E+0x14,input.y);
  p.call(0x8909c08,[],100000);
  return {state:{...input,countdown:p.read(S)|0,remaining:p.read(S+4)|0,x:readFloat(E+0x10),y:readFloat(E+0x14),active},rng:[p.read(R+0xa8),p.read(R+0xac)]};
 }};verified.add(kernel);return kernel;
}
