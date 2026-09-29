/* Exact-edition progress research bridge. Inputs come from the owner's private
 * recovery. No native bytes are bundled, and no OS/firmware calls are provided.
 * This is deliberately separate from reader admission and persistent saves. */
import {NativeProbe} from './shibuya428-native.mjs';
import {Shibuya428Progress} from './shibuya428-progress.mjs';
const E=0x10000000,SNS=0x11000000,FLOW=0x12000000,HEAP=0x13000000,STACK=0x14000000,FLOW_ROWS=0x15000000;
const identities={
 elf:'194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce',
 sns:'1a467441c56f57337c499541a781da9323551db542069c44d8f146f19e1d5968',
 flo:'849607be8d9e5e10fefdeb21d0836b785ad951a754672bb506df458859c04c8d',
};
export async function create428ProgressKernel(inputs,scripts){
 scripts=structuredClone(scripts);
 const verified={};
 for(const [name,expected]of Object.entries(identities)){
  const value=inputs[name];
  if(!(value instanceof Uint8Array)||value.length>4*1024*1024)throw Error('428 progress input bound');
  const bytes=new Uint8Array(value),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!==expected)throw Error(`428 progress ${name} identity mismatch`);
  verified[name]=bytes;
 }
 const {elf,sns,flo}=verified,elfView=new DataView(elf.buffer),floView=new DataView(flo.buffer);
 const rows=new Uint8Array((floView.getUint32(12,true)+1)*480),body=floView.getUint32(16,true);
 for(let n=0;n<rows.length/480;n++){
  const r=flo.subarray(body+n*460,body+(n+1)*460);rows.set(r.subarray(0,442),n*480);
  rows.set(r.subarray(444,448),n*480+442);
 }
 const hooks=new Map(); let allocated=0;
 const memset=(p,[dst,value,size])=>{if(size>0x100000)throw Error('memset bound');for(let n=0;n<size;n++)p.write(dst+n,value,1);return dst;};
 const memcpy=(p,[dst,src,size])=>{if(size>0x100000)throw Error('memcpy bound');const b=Array.from({length:size},(_,n)=>p.read(src+n,1));b.forEach((x,n)=>p.write(dst+n,x,1));return dst;};
 hooks.set(0x88204e8,memset);hooks.set(0x8813d00,memset);hooks.set(0x88203a4,memcpy);hooks.set(0x88138d4,memcpy);
 hooks.set(0x882034c,(p,[size])=>{const at=HEAP+allocated;allocated=(allocated+size+15)&~15;if(allocated>0x100000)throw Error('allocation bound');return at;});
 hooks.set(0x8816fb0,(p,[a,b])=>{const x=p.string(a),y=p.string(b);return x===y?0:x<y?-1:1;});
 hooks.set(0x88171b0,(p,[a,b,n])=>{if(n>1024)throw Error('strncmp bound');for(let i=0;i<n;i++){const x=p.read(a+i,1),y=p.read(b+i,1);if(x!==y)return x-y;if(!x)return 0;}return 0;});
 hooks.set(0x8813850,(p,[a,b,n])=>{if(n>0x100000)throw Error('memcmp bound');for(let i=0;i<n;i++){const d=p.read(a+i,1)-p.read(b+i,1);if(d)return d;}return 0;});
 hooks.set(0x88170bc,(p,[a])=>p.string(a).length);
 hooks.set(0x8817024,(p,[a,b])=>{const s=p.string(b);for(let n=0;n<=s.length;n++)p.write(a+n,s.charCodeAt(n)||0,1);return a;});
 hooks.set(0x88102e8,(p,[x])=>Math.abs(x|0));
 const ranges=[
  [0x887bc7c,0x887c6b8], [0x887ae44,0x887ae50],
  [0x887a1dc,0x887a450], [0x8882f54,0x88832e4], [0x8883394,0x8883474],
  [0x88850f4,0x88851b4], [0x88854e4,0x88857a4], [0x887483c,0x88752b4], [0x8882cd8,0x8882f1c], [0x88857a4,0x8886db8], [0x8882978,0x8882bfc],
  [0x8876034,0x8876338], [0x8874588,0x88745b8], [0x8876698,0x88766d0],
  [0x8898248,0x8898254], [0x88982c8,0x8898388], [0x8898398,0x88983f0],
  [0x88962ec,0x8896404], [0x8898748,0x8898a1c], [0x88ca590,0x88ca7a0], [0x88ca800,0x88caa4c], [0x88cae08,0x88cb114],
  [0x8955d64,0x8955d7c],
 ];
 const p=new NativeProbe({segments:[
  {address:elfView.getUint32(60,true),bytes:elf.subarray(elfView.getUint32(56,true),elfView.getUint32(56,true)+elfView.getUint32(68,true))},
  {address:0x9ef0000,bytes:new Uint8Array(0x10000),writable:true},
  {address:E,bytes:new Uint8Array(0x30000),writable:true},
  {address:SNS,bytes:sns,writable:true}, {address:FLOW,bytes:flo},
  {address:HEAP,bytes:new Uint8Array(0x100000),writable:true},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true},
  {address:FLOW_ROWS,bytes:rows,writable:true}
 ],ranges,hooks,stackTop:STACK+0xfff0});
 p.write(0x9ef1e30,E);p.write(0x9ef21cc,E+0x2ff00);p.write(0x9ef2f1c,rows.length/480);p.write(E+0x29ca8,SNS);p.write(0x9ef2f04,FLOW+floView.getUint32(8,true));p.write(0x9ef2f08,FLOW_ROWS);
 p.call(0x887bc7c,[E]);
 p.call(0x8882f54,[E+0x27a8]);
 p.write(E+0x10,0xffffffff);p.write(E+0xc,0xffffffff);
 const graph=new Shibuya428Progress(scripts),graphBase=p.read(E+0x27a8);
 if(graph.labels.length!==p.read(E+0x4c8))throw Error('428 progress label census mismatch');
 const pointers=new Map(),boundaries=new Map();
 for(const s of Object.values(scripts))boundaries.set(s.index,new Set(s.tokens.map(i=>i.offset)));
 for(const [id,label]of graph.labels.entries()){
  const s=scripts[label.script],row=s.labels[label.label],pointer=SNS+s.sns_offset+row.table_offset+8;
  if(p.string(pointer)!==label.label||p.call(0x887c108,[E,label.script,pointer]).value!==id||
     p.call(0x887c0b8,[E,id]).value!==label.offset-s.content_offset)
    throw Error('428 progress recovered label mismatch');
  pointers.set(`${label.script}:${label.label}`,pointer);
 }
 // Loader relocation is over. Replay may never modify scripts or allocate.
 p.segments.find(s=>s.address===SNS).writable=false;
 hooks.set(0x882034c,()=>{throw Error('428 progress unexpected allocation');});
 const mutable=()=>p.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]);
 const checkpoint=()=>({script:p.read(E+0xc),label:p.read(E+0x10),pc:p.read(E+0x14),character:p.read(E+0x29ccc),hour:p.read(E+0x29cd0)});
 const restoreMemory=backup=>{for(const[s,bytes]of backup)s.bytes.set(bytes);};
 const checkpoints=new WeakMap();
 return Object.freeze({
  // Opaque in-memory transactions only. This is not a portable reader save.
  checkpoint(){const token=Object.freeze({});checkpoints.set(token,{memory:mutable(),graph:graph.bytes.slice()});return token;},
  restore(token){const saved=checkpoints.get(token);if(!saved)throw Error('428 progress foreign checkpoint');restoreMemory(saved.memory);graph.bytes.set(saved.graph);},
  // Call only with source-earned state in a future reader. Diagnostic harnesses
  // must distinguish hypothetical flag banks and records from earned histories.
  recompute(state,progress,{character,hour,restart=false}={}){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    if(!Number.isInteger(character)||character<0||character>10||!Number.isInteger(hour)||hour<0||hour>9)
      throw Error('428 progress character/hour bound');
    if(!Array.isArray(state.flags)||state.flags.length!==2048||Array.from(state.flags).some(n=>!Number.isInteger(n)||n<0||n>255))
      throw Error('428 progress flag bank');
    if(!boundaries.get(state.script)?.has(state.pc)||!pointers.has(state.label)||(state.stack?.length??0)!==0)
      throw Error('428 progress checkpoint/call stack is not supported');
    graph.restore(progress);
    for(let n=0;n<graph.bytes.length;n++)p.write(graphBase+n,graph.bytes[n],1);
    for(let n=0;n<2048;n++)p.write(E+0x1660+n,state.flags[n],1);
    const s=scripts[state.script];
    p.write(E+0xc,state.script);p.write(E+0x10,graph.id(state.label));p.write(E+0x14,SNS+s.sns_offset+state.pc);
    if(restart)p.call(0x8876034,[E,pointers.get(state.label),1]);
    p.write(E+0x29ccc,character);p.write(E+0x29cd0,hour);
    const before=checkpoint(),run=p.call(0x887483c,[E,0]);
    if(JSON.stringify(checkpoint())!==JSON.stringify(before))throw Error('428 progress changed caller checkpoint');
    for(let n=0;n<graph.bytes.length;n++)graph.bytes[n]=p.read(graphBase+n,1);
    const result=graph.snapshot();graph.restore(result);
    return {flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1)),progress:result,
      restarts:Array.from({length:11},(_,n)=>p.string(E+0x299e9+n*32,33)),steps:run.steps};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
 });
}
