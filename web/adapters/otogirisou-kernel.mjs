/* Exact SLPS-01645 bounded integer story/layout kernel. No BIOS, SDK, disc
 * boot or host execution. Original control, choice admission, name substitution
 * and glyph placement run only within audited code and mapped state bounds.
 * Media callbacks expose source requests; they are not fidelity evidence. */
import {NativeProbe} from './shibuya428-native.mjs';
export const EXE_HASH='4692c8dc46f56794fd1e62bf0bf431ae503eaddc308b7ff6b99f7c03e45541b2';
export const CD_HASH='c419140ef3ba0ecc18ce8ec421cac3b4cb43462d55ae67bdd6bf8519a2cf6bb5';
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const GP=0x8007a610,SPR=0x80082458;
export class OtogirisouKernel {
 static async create(exe,cd,font){
  const digest=async bytes=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)));
  if(await digest(exe)!==EXE_HASH||await digest(cd)!==CD_HASH)throw Error('Otogirisou native source identity mismatch');
  return new OtogirisouKernel(exe,cd,font);
 }
 constructor(exe,cd,font){
  if(exe.length!==440320||cd.length!==11282432||font.width!==1024||font.height!==512)throw Error('Invalid Otogirisou kernel resources');
  this.font=font;
  this.events=[];const hooks=new Map();
  // External presentation services are emitted as events. The reader must handle
  // every event explicitly. These callbacks do not provide disc or host access.
  for(const a of [0x80014f9c,0x80014a9c,0x8001f2d8,0x8002a6f0,0x8002ab00,0x8002c37c,0x8002b68c,0x8002b7b4,0x8002c39c,0x8002c4c8,0x8002b1bc,0x8002ad54,0x8002c550,0x8002b4f4,0x8002b8ec,0x8002bb90,0x800583e8,0x80051214,0x80051090,0x8001e060,0x8003f898])hooks.set(a,(p,args)=>{this.events.push({address:a,args});return 0;});
  hooks.set(0x80030a98,(p,args)=>{this.events.push({moviePrepare:args[0]});p.write(0x8007a8a4,p.read(0x8007a8a4,2)|1,2);p.write(0x8007a87b,0,1);return 0;});
  hooks.set(0x8002fbd8,(p,args)=>{this.events.push({effect:args[0]});if(args[0]>=168&&args[0]<224)p.write(0x8007a8cc,1);return 1;});
  hooks.set(0x8001d6ec,(p,args)=>{if(args[0]>=205)throw Error('Auxiliary scene '+args[0]);this.events.push({scene:args[0]});return 0;});
  hooks.set(0x80016c28,p=>{if(p.read(GP+0x394)||p.read(GP+0x370)||(p.read(0x8007a898)&0x844))throw Error('Native history requested');return 0;});
  const data=new Uint8Array(0x14000);data.set(exe.subarray(2048+0x6a000));
  this.p=new NativeProbe({segments:[
   {address:0x80010000,bytes:exe.subarray(2048,2048+0x6a000)},
   {address:0x8007a000,bytes:data,writable:true},
   {address:0x8008e000,bytes:cd.subarray(88*2048,390*2048)},
   {address:0x801ff000,bytes:new Uint8Array(4096),writable:true}],
   ranges:[[0x800159d8,0x80015bc4],[0x80015bd4,0x80016258],[0x80016258,0x8001671c],[0x80016ff4,0x80017b4c],[0x800180d4,0x8001d24c],[0x8001ed30,0x8001ed74],[0x8001f340,0x8001fd80],[0x800151d4,0x80015270],[0x80014e84,0x80014eac],[0x8003587c,0x80035994],[0x80030228,0x8003049c]],hooks,
   observers:new Map([[0x8001b2cc,()=>this.events.push({clearText:true})]]),
   stackTop:0x801fff00,globalPointer:GP});
  const p=this.p;p.call(0x8001ed30);p.call(0x8003587c);p.write(0x8007ad98,0x44c,2);p.write(0x8007ad9a,0x229,2);p.write(0x8007a8dd,44,1);p.write(0x8007a872,65535,2);p.write(0x8007a8b6,65535,2);p.call(0x80015bd4);
 }
 transaction(fn){const segment=this.p.segments.find(s=>s.address===0x8007a000),before=segment.bytes.slice(),n=this.events.length;try{return fn();}catch(error){segment.bytes.set(before);this.events.length=n;throw error;}}
 choose(index){if(!Number.isInteger(index)||this.info().mode!==2||index<0||index>=this.p.read(GP+0x324))throw Error('Invalid native choice');return this.transaction(()=>{this.p.write(GP+0x338,index);this.input();});}
 input(){return this.transaction(()=>{const p=this.p;p.write(0x8007a894,1);p.write(0x8007a898,1);try{this.frame();}finally{p.write(0x8007a894,0);p.write(0x8007a898,0);}});}
 frame(){const n=this.events.length;try{return this.p.call(0x8001c790,[],1000000);}catch(error){this.events.length=n;throw error;}}
 snapshot(){return {version:1,memory:hex(this.p.segments.find(s=>s.address===0x8007a000).bytes)};}
 restore(s){
  if(s?.version!==1||typeof s.memory!=='string'||s.memory.length!==0x28000||!/^[0-9a-f]+$/.test(s.memory))throw Error('Invalid Otogirisou kernel snapshot');
  const data=Uint8Array.from(s.memory.match(/../g),b=>parseInt(b,16)),v=new DataView(data.buffer);
  const u=(a,n=4)=>n===1?v.getUint8(a-0x8007a000):n===2?v.getUint16(a-0x8007a000,true):v.getUint32(a-0x8007a000,true);
  const bank=u(0x8007a8dd,1),pc=u(0x8007a8b0),mode=u(GP+0x31c);
  if(bank>=45||![0,1,2,3,4,5,6,8,99].includes(mode)||u(GP+0x318)>200||u(GP+0x324)>10||u(GP+0x320)>2)throw Error('Invalid Otogirisou saved controller');
  for(let i=0;i<46;i++)if(u(0x8007aec8+i*4)!==0x8008e000+this.p.read(0x8006203c+i*4))throw Error('Otogirisou saved bank map differs from source');
  const start=u(GP+0x3dc),starts=Array.from({length:45},(_,i)=>u(0x8007aec8+i*4));
  // The native PC may fall through a bank boundary without updating its base
  // selector. Bound the address to the complete immutable story allocation.
  // Option preview restores the PC/base pair independently of the selector.
  if(!starts.includes(start)||pc>=0x80125000-start)throw Error('Invalid Otogirisou source position');
  const segment=this.p.segments.find(s=>s.address===0x8007a000),before=segment.bytes.slice();
  try{segment.bytes.set(data);this.glyphs();}catch(error){segment.bytes.set(before);throw error;}
  this.events=[];
 }
 choiceRanges(){const p=this.p,n=p.read(GP+0x324);if(n>10)throw Error('Native choice count');return Array.from({length:n},(_,i)=>({start:p.read(0x80085ce8+i*4),end:p.read(0x80085d18+i*4)}));}
 info(){const p=this.p;return{bank:p.read(0x8007a8dd,1),pc:p.read(0x8007a8b0),mode:p.read(GP+0x31c),preview:p.read(GP+0x320),glyphs:p.read(GP+0x318),x:p.read(GP+0x3d4),y:p.read(GP+0x3d8)};}
 glyphs(){const p=this.p,result=[];for(let i=80;i<80+p.read(GP+0x318);i++){const a=SPR+i*24,id=p.read(a+12,2)-256,flags=p.read(a+4,2);if(!flags||id<0)continue;const g=this.font.metrics[id];if(!g||typeof g.text!=='string'||[...g.text].length!==1)throw Error('Unknown sprite '+id);result.push({id,text:g.text,x:Math.trunc((p.read(a+6,2)<<16>>16)/16)-Math.floor(g.width/2),y:Math.trunc((p.read(a+8,2)<<16>>16)/16)+g.bearing-8,width:g.width,height:g.height-g.bearing,u:g.u,v:g.v,slot:i,baseline:Math.trunc((p.read(a+8,2)<<16>>16)/16),flags,colour:p.read(a+22,2)});}return result;}
}


/** Bind selectable text to the native retained page and original option ranges. */
export function otogirisouPage(kernel,options=null){
 const ranges=options?kernel.choiceRanges():[],groups=new Map();
 for(const original of kernel.glyphs()){
  // The original GPU clips punctuation at the viewport edge (a native glyph
  // can extend one pixel beyond x=320). Keep its selectable character while
  // clipping the source mask, without moving or reflowing the paragraph.
  const dx=Math.max(0,-original.x),dy=Math.max(0,-original.y);
  const g={...original,x:Math.max(0,original.x),y:Math.max(0,original.y),
   u:original.u+dx,v:original.v+dy,
   width:Math.min(320,original.x+original.width)-Math.max(0,original.x),
   height:Math.min(240,original.y+original.height)-Math.max(0,original.y)};
  if(g.width<=0||g.height<=0)throw Error('Native text lies outside the visible page');
  const index=ranges.findIndex(r=>g.slot>=r.start&&g.slot<r.end);
  const key=index<0?`line:${g.baseline}`:`choice:${index}`;
  if(!groups.has(key))groups.set(key,{index,glyphs:[]});groups.get(key).glyphs.push(g);
 }
 const blocks=[];
 for(const {index,glyphs:gs}of groups.values()){
  const x=Math.min(...gs.map(g=>g.x)),y=Math.min(...gs.map(g=>g.y));
  const width=Math.max(...gs.map(g=>g.x+g.width))-x,height=Math.max(...gs.map(g=>g.y+g.height))-y;
  const text=gs.map(g=>g.text).join('');
  const block={x,y,width,height,text,glyphs:gs.map(g=>({text:g.text,x:g.x-x,y:g.y-y,width:g.width,height:g.height,u:g.u,v:g.v}))};
  if(index>=0){if(!options[index])throw Error('Native option range exceeds source count');block.choiceId=String(index);options[index].text=text;}
  blocks.push(block);
 }
 return{width:320,height:240,fontSize:16,lineHeight:22,colour:'#ffffff',choiceColour:'#ee8888',font:{asset:'font:native',width:kernel.font.width,height:kernel.font.height},blocks};
}
