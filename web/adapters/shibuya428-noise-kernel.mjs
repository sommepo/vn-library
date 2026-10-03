/* Exact-edition smooth camera noise. The bounded original controller owns its
 * five oscillators, software sine and independent random generator. Only 37
 * numeric state words and one seed cross the boundary; never native memory.
 * The host seed is presentation-only, not a reproduced PSP-session seed. */
import {NativeProbe} from './shibuya428-native.mjs';
const E=0x10000000,S=E+0x100,STACK=0x14000000,RNG=0x9f02e98;
const verified=new WeakSet(),word=n=>Number.isInteger(n)&&n>=0&&n<=0xffffffff;
export const is428NoiseKernel=kernel=>verified.has(kernel);
export async function create428NoiseKernel(elf){
 if(!(elf instanceof Uint8Array)||elf.length>4*1024*1024)throw Error('428 camera noise input bound');
 const bytes=new Uint8Array(elf),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
 if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!=='194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce')throw Error('428 camera noise ELF identity mismatch');
 const ev=new DataView(bytes.buffer),hooks=new Map();let parameters,offset;
 const p=new NativeProbe({segments:[
  {address:ev.getUint32(60,true),bytes:bytes.subarray(ev.getUint32(56,true),ev.getUint32(56,true)+ev.getUint32(68,true))},
  {address:E,bytes:new Uint8Array(0x200),writable:true},
  {address:RNG,bytes:new Uint8Array(4),writable:true},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true}
 ],stackTop:STACK+0xfff0,float32:true,hooks,ranges:[
  [0x8905c88,0x8906514],[0x8955cb0,0x8955d04],
  [0x881e0a4,0x881f834],[0x880e830,0x880e93c],
  [0x8809fb4,0x880a680],[0x880e200,0x880e220],[0x880bd30,0x880c098],[0x880cd70,0x880d03c]
 ]});
 hooks.set(0x89040dc,()=>E);hooks.set(0x8904ec8,()=>S);
 hooks.set(0x8904e54,(_,[manager,size])=>{if(manager!==E||size!==0x94)throw Error('Unverified noise allocation');for(let n=0;n<37;n++)p.write(S+n*4,0);return S;});
 hooks.set(0x8904f10,(_,[manager,index])=>{if(manager!==E||index>2)throw Error('Unverified noise operand');return parameters[index];});
 hooks.set(0x8904eec,(_,[manager,status])=>{if(manager!==E||status!==1)throw Error('Unverified noise status');return 0;});
 hooks.set(0x8905708,(_,args,ctx)=>{offset.x=ctx.float32(12)||0;return 0;});
 hooks.set(0x890572c,(_,args,ctx)=>{offset.y=ctx.float32(12)||0;return 0;});
 const result=()=>({state:Array.from({length:37},(_,n)=>p.read(S+n*4)),seed:p.read(RNG),offset:{...offset}});
 const kernel={
  start(input,seed){
   if(!Array.isArray(input)||input.length!==3||input.some(n=>!Number.isInteger(n))||input[0]<0||input[0]>255||input[1]<2||input[1]>32767||input[2]<4||input[2]>32767||!word(seed))throw Error('Invalid camera noise operands');
   parameters=[...input];offset={x:0,y:0};p.write(RNG,seed);p.call(0x8905c88,[],100000);return result();
  },
  step(state,seed){
   if(!Array.isArray(state)||state.length!==37||state.some(n=>!word(n))||!word(seed))throw Error('Invalid compact camera noise state');
   state.forEach((n,i)=>p.write(S+i*4,n));p.write(RNG,seed);offset={x:0,y:0};p.call(0x8905ea4,[],200000);return result();
  }
 };verified.add(kernel);return kernel;
}
