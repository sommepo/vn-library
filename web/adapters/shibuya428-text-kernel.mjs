/* Bounded horizontal text-layout bridge for the exact recovered edition.
 * Runs original line-breaking/spacing code; intercepts font drawing and its
 * renderer allocation only. No original bytes, fonts or tables are bundled.
 * Opaque transactions are for an in-memory presenter, never reader save data. */
import {NativeProbe} from './shibuya428-native.mjs';
import {source428TextDefaults} from './shibuya428-text.mjs';
import {decodeLink,decodeChoice,source428StoryText} from './shibuya428-control.mjs';
const E=0x10000000,SNS=0x11000000,HEAP=0x13000000,STACK=0x14000000,JIS=0x16000000;
const F=E+0x20000,D=F+0x300,G=F+0x800,R=E+0x25000,U=E+0x24000;
const identities={
 elf:'194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce',
 sns:'1a467441c56f57337c499541a781da9323551db542069c44d8f146f19e1d5968',
 jis:'d1c0f65ac91bc52cb58dcba7d5d7b21452301b18106ecb2e10f8c26e88f3bdfb',
 gsf:'a538255e47f4c8863849b1fad28d29da965716e244d8e917d7c97647b6026975',
 has:'0866d3eec1460d84b0b2e818bb7e3aae622846a70b22e9811ad39b09dd043fb3',
};
export async function create428TextKernel(inputs,scripts){
 const bytes={};
 for(const [name,expected]of Object.entries(identities)){
  const input=inputs[name];if(!(input instanceof Uint8Array)||input.length>4*1024*1024)throw Error('428 text input bound');
  bytes[name]=new Uint8Array(input);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes[name]));
  if([...digest].map(n=>n.toString(16).padStart(2,'0')).join('')!==expected)throw Error(`428 text ${name} identity mismatch`);
 }
 scripts=structuredClone(scripts);
 const ev=new DataView(bytes.elf.buffer),has=new DataView(bytes.has.buffer),gsf=new DataView(bytes.gsf.buffer);
 const hooks=new Map(),drawn=[];let allocated=0,tipVisited=null,jumpAvailable=null,choiceStatus=null;
 const allocate=(_,[size])=>{const at=HEAP+allocated;allocated=(allocated+size+15)&~15;if(allocated>0x100000)throw Error('428 text allocation bound');return at;};
 const memset=(p,[dst,value,size])=>{if(size>0x100000)throw Error('428 text memset bound');for(let n=0;n<size;n++)p.write(dst+n,value,1);return dst;};
 const memcpy=(p,[dst,src,size])=>{if(size>0x100000)throw Error('428 text memcpy bound');const b=Array.from({length:size},(_,n)=>p.read(src+n,1));b.forEach((v,n)=>p.write(dst+n,v,1));return dst;};
 hooks.set(0x882034c,allocate);hooks.set(0x88202fc,allocate);
 hooks.set(0x88204e8,memset);hooks.set(0x8813d00,memset);hooks.set(0x88138d4,memcpy);hooks.set(0x88203a4,memcpy);
 hooks.set(0x88170bc,(p,[a])=>p.string(a).length);
 hooks.set(0x88102e8,(_,[n])=>Math.abs(n|0));
 hooks.set(0x8816fb0,(p,[a,b])=>{const x=p.string(a),y=p.string(b);return x===y?0:x<y?-1:1;});
 const loaded=bytes.elf.subarray(ev.getUint32(56,true),ev.getUint32(56,true)+ev.getUint32(68,true)),loadAddress=ev.getUint32(60,true),scratch=0x89bb334-loadAddress;
 const p=new NativeProbe({segments:[
  {address:loadAddress,bytes:loaded.subarray(0,scratch)},
  {address:0x89bb334,bytes:loaded.subarray(scratch,scratch+4),writable:true},
  {address:0x89bb338,bytes:loaded.subarray(scratch+4)},
  {address:0x9ef0000,bytes:new Uint8Array(0x10000),writable:true},
  {address:0x9f00000,bytes:new Uint8Array(0x10000),writable:true},
  {address:0x9e20000,bytes:new Uint8Array(0x10000),writable:true},
  {address:E,bytes:new Uint8Array(0x30000),writable:true},
  {address:SNS,bytes:bytes.sns,writable:true},{address:JIS,bytes:bytes.jis},
  {address:HEAP,bytes:new Uint8Array(0x100000),writable:true},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true},
 ],hooks,stackTop:STACK+0xfff0,float32:true,ranges:[
  [0x887bc7c,0x887c808],[0x887ae44,0x887ae50],[0x887aff8,0x887b008],
  [0x886a708,0x886ae4c],[0x886af50,0x886d994],[0x89557a0,0x8955cb0],
  [0x884e58c,0x884e640],[0x8863308,0x8863380],
  [0x8892744,0x88927fc],[0x8892c58,0x8892c60],
  [0x89564f8,0x89565f0],[0x89561c0,0x895633c],[0x8955ff4,0x8956068],
  [0x8872a04,0x88733fc],[0x8898248,0x8898254],[0x88982c8,0x8898388],
  [0x8868030,0x8868080],[0x887e0b0,0x887e414],[0x887e7a0,0x887e7c4],
  [0x889a2f4,0x889a3bc],[0x886ebb4,0x886f07c],[0x8892bb0,0x8892bf0],[0x8892cf8,0x8892d50],
  [0x8893d10,0x8894108],
  [0x889434c,0x8894768],
  [0x8894b14,0x8895108],[0x8882b84,0x8882bfc],
  [0x88a0944,0x88a09f8],
  [0x88a0aa0,0x88a0d78],
  [0x88914cc,0x8892044],[0x8896efc,0x88970f0],
  [0x887efd0,0x887f900],[0x8892ac4,0x8892b54],
  [0x889a46c,0x889b03c],[0x88a050c,0x88a0644],
  [0x887cb38,0x887cba0],[0x887cd38,0x887cda8],[0x8893440,0x8893448],
  [0x887a420,0x887a428],
  [0x8898388,0x8898398],[0x8898bc0,0x8899448],[0x88850e4,0x88850f4],
  [0x8895fd4,0x8896040],[0x88961b0,0x8896274],
  [0x889588c,0x8895a88],[0x8892594,0x8892690],
  [0x8896efc,0x8897510],[0x88fc21c,0x88fc224],[0x884e65c,0x884e674],
 ]});
 const float=at=>{const v=new DataView(new ArrayBuffer(4));v.setUint32(0,p.read(at),true);return v.getFloat32(0,true);};
 // Native backend's mode is fixed to horizontal in this contract. Vertical
 // mode must have a separate audited entry rather than silently using this.
 hooks.set(0x8863fdc,()=>0);
 hooks.set(0x884e510,()=>{p.write(D+0x140,0);return 0;});hooks.set(0x884e640,()=>0);
 // Run the native choice newline notifier too: it retains option indentation.
 hooks.set(0x884f994,()=>0);
 hooks.set(0x888333c,(_,[,script,pointer])=>{
  if(choiceStatus){const index=choiceStatus.options.findIndex(o=>o.script===script&&o.label===p.string(pointer));if(index<0)throw Error('Unexpected choice read-status target');return Number(choiceStatus.visited[index]);}
  if(tipVisited===null)throw Error('Unexpected TIP read-status lookup');return Number(tipVisited);
 });
 // Choice graph writes are performed and independently checked by the VM.
 // This kernel owns geometry only, with no duplicated persistent graph.
 for(const at of [0x88833c8,0x888327c])hooks.set(at,()=>{if(!choiceStatus)throw Error('Unexpected choice graph write');return 0;});
 hooks.set(0x88834e4,()=>{if(!choiceStatus)throw Error('Unexpected choice selection lookup');return choiceStatus.previousChoice;});
 hooks.set(0x887e6a8,()=>0);
 hooks.set(0x887e60c,()=>0); // Inline primitive alpha; returned separately below.
 hooks.set(0x884fbf4,(_,[,start,end,alpha])=>{drawn.push({kind:'alphaRange',start,end,alpha});return 0;});
 hooks.set(0x884fa08,(_,[,start,end,r],call)=>{drawn.push({kind:'colorRange',start,end,color:[r,call.integerArguments[4],call.integerArguments[5]].map(v=>v/128)});return 0;});
 // External prefetch, movie and message objects are outside this font bridge.
 for(const at of [0x887b038,0x88eba50,0x88814dc,0x88ba41c,0x887d0a4])hooks.set(at,()=>0);
 hooks.set(0x886cf30,()=>0);
 // The consumer supplies link hit-testing; no native menu object is allocated.
 hooks.set(0x888250c,()=>1);
 // JUMP availability is owned by the verified control/progress bridge. This
 // font-only probe consumes that result for geometry; it cannot grant a jump.
 for(const at of [0x8882b20,0x8882b50,0x8875cb4])hooks.set(at,()=>{
  if(jumpAvailable===null)throw Error('Unexpected font JUMP predicate');return Number(jumpAvailable);
 });
 hooks.set(0x88920a0,()=>R);p.write(R+0x3c,R+0x100);
 // GPU object properties only. Original choice routines own positions, atlas
 // rectangles and colours. The native manager binds resident resource 2 at
 // 0x088891a4..9284; no artwork or UV table is reproduced here.
 const iconBase=E+0x2b100,iconTable=E+0x2bc00,iconHooks=E+0x2be00;
 const iconObject=address=>{if(address<iconBase||address>=iconBase+20*0x80||(address-iconBase)%0x80)throw Error('428 choice image object');return address;};
 const writeFloat=(address,value)=>{const b=new DataView(new ArrayBuffer(4));b.setFloat32(0,value,true);p.write(address,b.getUint32(0,true));};
 for(let i=0;i<20;i++){
  const at=iconBase+i*0x80;p.write(R+0x138+i*4,at);p.write(at,iconTable);
  for(let n=0;n<4;n++)writeFloat(at+0x30+n*4,1);writeFloat(at+0x40,1);
 }
 for(const [n,offset]of [0x24,0x2c,0x4c].entries())p.write(iconTable+offset,iconHooks+n*4);
 hooks.set(iconHooks,(_,[object,color])=>{const at=iconObject(object);for(let n=0;n<4;n++)p.write(at+0x30+n*4,p.read(color+n*4));return 0;});
 hooks.set(iconHooks+4,(_,[object],call)=>{writeFloat(iconObject(object)+0x40,call.float32(12));return 0;});
 hooks.set(iconHooks+8,(_,[object,x,y,right],call)=>{const at=iconObject(object);[x,y,right,call.integerArguments[4]].forEach((v,n)=>p.write(at+0x20+n*4,v));return 0;});
 // Execute original default display settings (offset 0, zoom 100), rather
 // than fabricating the external UI configuration consumed by inline rules.
 p.write(0x9ef1ce4,U);p.call(0x8868030,[]);
 function glyph(cp,draw){
  const size=p.read(D+0x274),style=p.read(G+0x22dc),bucket=(((cp&0xff00)>>>4)+(cp&255)+((size>>>4)<<8)+(size&15))&2047;
  let at=has.getUint16(bucket*2,false)*2,match=null;
  if(at)for(let n=0;n<1024;n++){
   const attr=has.getUint16(at,false),character=has.getUint16(at+2,false),index=has.getUint16(at+4,false);
   if((attr&0x7ff)===size&&((attr>>>11)&15)===style&&character===cp){
    const offset=(gsf.getUint32(index*4,true)&0xffffff)*32;
    match={index,width:gsf.getUint16(offset+36,false),height:gsf.getUint16(offset+38,false),bearing:gsf.getInt16(offset+4,true),advance:gsf.getInt16(offset,true)};break;
   }
   if(attr&0x8000)break;at+=6;
  }
  const space=cp===0x3000?size:cp===32?size>>1:null;
  if(draw){
   if(!match&&space===null)throw Error(`428 missing original glyph ${style}:${size}:${cp.toString(16)}`);
   const x=float(D+0x144),y=float(D+0x148);
   const nativeIndex=match?p.read(D+0x140):null;
   if(nativeIndex!==null&&nativeIndex>=256)throw Error('428 native text glyph capacity');
   if(match)p.write(D+0x140,nativeIndex+1);
   const color=[0x18,0x1c,0x20].map(n=>float(p.read(F+4)+n)/128);
   const outlineColor=[0x28,0x2c,0x30].map(n=>float(p.read(F+4)+n));
   drawn.push({codepoint:cp,size,style,nativeIndex,color,outlineColor,index:match?.index??null,width:match?.width??0,height:match?.height??0,
    x:Math.fround(Math.fround(Math.fround(480*x)/1280)+Math.fround(Math.fround(480*(match?.bearing??0))/1280)),
    y:Math.fround(Math.fround(272*y)/720),logicalX:x,logicalY:y});
  }
  // The original measuring backend falls back to the requested size for a
  // missing lookahead/control glyph. Actual missing drawings fail above.
  return space??match?.advance??size;
 }
 hooks.set(0x884f8ec,(_,[,cp])=>glyph(cp,false));hooks.set(0x884e674,(_,[,cp])=>glyph(cp,true));
 p.write(0x9ef1e30,E);p.write(0x9ef1d48,F);p.write(E+0x29ca8,SNS);
 // 0x08864440..50 binds the font style map inside the verified executable.
 p.write(0x9e2d90c,0x89ab274);
 p.write(0x9ef21cc,E+0x2ff00);
 p.write(0x9f02ed8,JIS);p.write(E+0x29cac,(p.read(SNS+0x10,1)&2)?2:0);
 p.call(0x887bc7c,[E]);
 const labelPointer=p.call(0x887c1dc,[E,0]).value,label=p.string(labelPointer),script=p.call(0x887be9c,[E,labelPointer]).value;
 const source=scripts[script],row=source?.labels[label];
 if(!row||labelPointer!==SNS+source.sns_offset+row.table_offset+8||row.offset-source.content_offset!==p.call(0x887c0b8,[E,0]).value)
  throw Error('428 text source initializer mismatch');
 const defaults=source428TextDefaults(scripts,{script,label});
 const tokens=new Map();
 for(const s of Object.values(scripts))for(const t of s.tokens)tokens.set(t.id,{...t,script:s.index,address:SNS+s.sns_offset+t.offset});
 for(const t of source.tokens.filter(t=>t.offset>=row.offset).slice(0,defaults.length+2)){
  const address=SNS+source.sns_offset+t.offset;
  if(p.read(address,1)!==t.code||!Array.isArray(t.args)||p.read(address+1,1)!==t.args.length||t.next!==t.offset+t.args.length+2||t.args.some((v,n)=>p.read(address+2+n,1)!==v))throw Error('428 text initializer operands mismatch');
 }
 p.call(0x886a714,[F]);p.write(F,D);p.write(D+0x14c,G);p.write(F+0x2d,1,1);
 // Run the source setters themselves: the default fields are also consumed
 // when a TIP restores the body margins, spacing and font after its title.
 function applyDefaults(){for(const t of source.tokens.filter(t=>t.offset>=row.offset).slice(0,defaults.length+2)){
  if(![0x29,0x30,0x32,0x34,0x36,0x38,0x3a].includes(t.code))continue;
  p.write(E+0xc,script);p.write(E+0x14,SNS+source.sns_offset+t.offset+1);
  p.call(p.read(0x89c090c+t.code*8),[],200000);
 }}
 applyDefaults();
 p.call(0x886ace4,[F]);
 p.call(0x88914cc,[E+0x12f8],200000);
 p.write(E+0x27c4,0xffffffff);
 p.segments.find(s=>s.address===SNS).writable=false;
 hooks.set(0x882034c,()=>{throw Error('428 text unexpected allocation');});hooks.set(0x88202fc,hooks.get(0x882034c));
 const snapshots=new WeakMap(),capture=()=>p.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]);
 const restore=backup=>{for(const[s,bytes]of backup)s.bytes.set(bytes);};
 function transaction(fn){const backup=capture();drawn.length=0;try{fn();return structuredClone(drawn);}catch(e){restore(backup);throw e;}finally{drawn.length=0;}}
 function token(event,code){
  const t=tokens.get(event.id);if(!t||t.script!==event.script||t.code!==code||p.read(t.address,1)!==code)throw Error('428 text source event mismatch');
  if([0x1c,0x1d].includes(code)){
   if(t.next!==t.offset+1||t.args?.length)throw Error('428 ruby framing mismatch');
  }else if(Array.isArray(t.args)&&(p.read(t.address+1,1)!==t.args.length||t.next!==t.offset+t.args.length+2||t.args.some((v,n)=>p.read(t.address+2+n,1)!==v)))throw Error('428 text source operands mismatch');
  return t;
 }
 function nativeChoiceStatus(){return {previousChoice:0,
  options:Array.from({length:p.read(E+0x12f8)},(_,i)=>({script:p.read(E+0x133c+i*4),label:p.string(p.read(E+0x1314+i*4))})),
  visited:Array.from({length:p.read(E+0x12f8)},(_,i)=>!!p.read(E+0x2b000+i,1))};}
 return Object.freeze({
  defaults:structuredClone(defaults),
  resetDefaults(){return transaction(()=>{applyDefaults();this.reset();});},
  checkpoint(){const t=Object.freeze({});snapshots.set(t,capture());return t;},
  restore(t){const backup=snapshots.get(t);if(!backup)throw Error('428 text foreign checkpoint');restore(backup);},
  choiceImages(){return Array.from({length:20},(_,index)=>{
   if(p.read(E+0x299cc+index,1)!==1)return null;const at=iconBase+index*0x80;
   return {kind:'choiceImage',index,choiceIndex:index%10,resource:2,x:Math.fround(float(at+4)*.375),y:Math.fround(Math.fround(float(at+8)*272)/720),
    uv:[0,4,8,12].map(n=>p.read(at+0x20+n)),color:[0,4,8].map(n=>float(at+0x30+n)),alpha:float(at+0x40)};
  }).filter(Boolean);},
  highlightChoice(index){
   if(p.read(E+0x1310,1)||!Number.isInteger(index)||index<0||index>=p.read(E+0x12f8))throw Error('428 choice highlight state');
   choiceStatus=nativeChoiceStatus();
   try{return transaction(()=>{
    p.call(0x88918f8,[E+0x12f8],200000);p.write(E+0x15bc,index);
    p.call(0x88917ec,[E+0x12f8,128,64,8],200000);p.call(0x887f444,[E,index,1],200000);
   });}finally{choiceStatus=null;}
  },
  choice(event){
   const c=event.command,code={choiceStart:tokens.get(event.id)?.code,choiceCheckpoint:0x22,choiceRecommended:0xbc,choiceEnd:0x5e}[c.type],t=token(event,code);
   if(![0x53,0x54,0x22,0xbc,0x5e].includes(code))throw Error('Unsupported choice layout command');
   const start=c.type==='choiceStart',source=start?t:tokens.get(c.choiceId);
   if(start||c.type==='choiceEnd'){
    if(!source||![0x53,0x54].includes(source.code))throw Error('428 choice source mismatch');
    const expected=decodeChoice(source);
    if(expected.timeoutFrames||!Array.isArray(c.visited)||c.visited.length!==expected.options.length||c.visited.some(v=>typeof v!=='boolean'))throw Error('428 choice layout state');
    choiceStatus={...expected,visited:c.visited,previousChoice:start?c.previousChoice:0};
    if(start){for(const key of ['presentation','options','restartLabel','timeoutFrames'])if(JSON.stringify(c[key])!==JSON.stringify(expected[key]))throw Error('428 choice source operands mismatch');}
   }
   try{return transaction(()=>{
    if(start){
     const split=c.label?.indexOf(':'),script=Number(c.label?.slice(0,split)),label=c.label?.slice(split+1),s=scripts[script],row=s?.labels[label];
     if(!row||!Number.isInteger(c.previousChoice)||c.previousChoice<0||c.previousChoice>choiceStatus.options.length)throw Error('428 choice caller state');
     const id=p.call(0x887c108,[E,script,SNS+s.sns_offset+row.table_offset+8]).value;
     p.write(E+0x10,id);p.write(E+0x2804,0,1);
     c.visited.forEach((v,i)=>p.write(E+0x2b000+i,Number(v),1));
    }
    p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.write(E+0x2ff00,code);
    const fn=p.read(0x89c090c+code*8);p.call(fn,[],300000);
    if(c.type==='choiceEnd'&&p.read(E+0x12fc)!==c.index+1)throw Error('428 choice layout index mismatch');
   });}finally{choiceStatus=null;}
  },
  callCheckpoint(event){return transaction(()=>{
   const t=token(event,0x22);if(t.args.length!==1||t.args[0]!==0)throw Error('Unsupported call font checkpoint');
   p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.write(E+0x2718,1,1);
   try{p.call(0x8898bc0,[],300000);}finally{p.write(E+0x2718,0,1);}
  });},
  reset(){return transaction(()=>{p.call(0x886ace4,[F]);p.call(0x886abf8,[F,p.read(E+0x6e4),p.read(E+0x6e8)]);p.write(D+0x140,0);p.write(E+0x6ac,0);p.write(E+0x12f4,0,1);p.write(E+0x6a1,0,1);p.write(E+0x2ef4,0);p.write(E+0x2efc,0);p.write(E+0x27c4,0xffffffff);p.write(E+0x12f8,0);p.write(E+0x1310,0,1);p.write(E+0x164c,0,1);for(let i=0;i<20;i++)p.write(E+0x299cc+i,0,1);});},
  newline(){return transaction(()=>p.call(0x886b5fc,[F]));},
  alignment(event){const mode=event.command.mode,t=token(event,mode===1?0x17:0x18);if(mode!==0&&mode!==1||p.read(t.address+1,1)!==0)throw Error('428 alignment mode');p.write(E+0x6ac,mode);},
  shift(event){const t=token(event,0x0f);if(event.command.pixels!==p.read(t.address+2,1))throw Error('428 text shift mismatch');return transaction(()=>p.call(0x886af50,[F,event.command.pixels,0]));},
  position(event){
   const t=token(event,0x11),c=event.command;
   if(c.axes>3||c.axes!==p.read(t.address+2,1)||c.x!==(p.read(t.address+3,1)*256+p.read(t.address+4,1))||c.y!==(p.read(t.address+5,1)*256+p.read(t.address+6,1)))throw Error('428 text position mismatch');
   return transaction(()=>{p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(0x88a0944,[],200000);if(p.read(E+0x14)!==t.address+t.next-t.offset)throw Error('428 text position consumption');});
  },
  font(event){
   const c=event.command,code={current:0x28,default:0x29,reset:0x2a}[c.mode],t=token(event,code);
   if(code!==0x2a&&(c.style!==p.read(t.address+2,1)||c.size!==p.read(t.address+3,1)*256+p.read(t.address+4,1)||c.style>4||c.size<1||c.size>2047))throw Error('428 source font setting mismatch');
   return transaction(()=>{p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(p.read(0x89c090c+code*8),[],200000);if(p.read(E+0x14)!==t.address+t.next-t.offset)throw Error('428 font setting consumption');});
  },
  color(event){
   const c=event.command,t=token(event,c.code);
   if(![0x13,0x14,0x15,0x16].includes(c.code)||JSON.stringify(c.rgb)!==JSON.stringify(c.code===0x15?[128,128,128]:t.args))throw Error('428 source text color mismatch');
   return transaction(()=>{p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(p.read(0x89c090c+c.code*8),[],200000);if(p.read(E+0x14)!==t.address+t.next-t.offset)throw Error('428 text color consumption');});
  },
  hintReset(){return transaction(()=>{this.reset();p.call(0x886b758,[F,128,128,128],200000);});},
  tipPage(event){
   const c=event.command,title=c.type==='tipTitle',t=token(event,title?0xb8:0xb9);
   if(!title&&c.type!=='tipBody'||title&&c.style!==(p.read(t.address+2,1)&3))throw Error('428 TIP page operands mismatch');
   return transaction(()=>{
    // This object holds only the original title-style field, not a renderer.
    p.write(E+0x29c10,R+0x500);p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);
    p.call(title?0x889588c:0x88959c4,[],200000);
    if(p.read(E+0x14)!==t.address+t.next-t.offset)throw Error('428 TIP page consumption');
   });
  },
  setting(event){
   const c=event.command,t=token(event,c.code);
   if(![0x33,0x35,0x37,0x39].includes(c.code)||c.value!==p.read(t.address+2,1)*0x1000000+p.read(t.address+3,1)*65536+p.read(t.address+4,1)*256+p.read(t.address+5,1))throw Error('428 text margin operands mismatch');
   return transaction(()=>{p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(p.read(0x89c090c+c.code*8),[],200000);});
  },
  ruby(event){
   const t=token(event,0x1c);if(p.read(E+0x6a1,1))throw Error('Unconsumed source ruby');
   return transaction(()=>{p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(0x889a2f4,[],200000);});
  },
  tip(event){
   const start=event.command.type==='tipStart',hint=!!event.command.hint,jump=!!event.command.jump,t=token(event,hint?(start?0x74:0x76):jump?(start?0x70:0x72):(start?0x6c:0x6e));
   if(start){const expected=decodeLink(t);for(const k of (jump?['mode','field','target','flag','clauses']:['mode','field','target']))if(JSON.stringify(expected[k])!==JSON.stringify(event.command[k]))throw Error('428 TIP source mismatch');
    if(typeof event.command.visited!=='boolean'||p.read(E+0x2ef4)>=8)throw Error('428 TIP state or capacity');}
   if(jump&&start&&typeof event.command.available!=='boolean')throw Error('428 JUMP availability required');
   tipVisited=start?event.command.visited:null;
   jumpAvailable=jump&&start?event.command.available:null;
   try{return transaction(()=>{if(jump&&start)p.write(E+0x1aac+event.command.flag,Number(tipVisited),1);p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);p.call(hint?(start?0x889434c:0x889455c):jump?(start?0x8894b14:0x8894efc):(start?0x8893d10:0x8893efc),[],200000);if(p.read(E+0x14)!==t.address+t.next-t.offset)throw Error('428 TIP source consumption');});}
   finally{tipVisited=null;jumpAvailable=null;}
  },
  fragment(event){
   const t=token(event,1),raw=t.raw_text;
   const text=source428StoryText(t.text);
   if(typeof raw!=='string'||raw.length%2||event.command.text!==text)throw Error('428 text fragment mismatch');
   for(let n=0;n<raw.length/2;n++)if(p.read(t.address+1+n,1)!==parseInt(raw.slice(n*2,n*2+2),16))throw Error('428 text fragment bytes mismatch');
   choiceStatus=p.read(E+0x1310,1)?nativeChoiceStatus():null;
   try{return transaction(()=>{
    if(choiceStatus&&p.read(E+0x164c,1)){
     // The original constructor creates a bounded 32-byte prefix script for
     // each option. Execute its spacing/style controls before the source text.
     const index=p.read(E+0x12fc),prefix=p.read(p.read(E+0x41c+index*4)+0x430);
     p.write(E+0xc,t.script);p.write(E+0x14,t.address+1);
     p.call(0x88a050c,[],200000);
     for(let n=0;n<20;n++){
      const at=p.read(E+0x14);if(at<prefix||at>=prefix+32)throw Error('428 choice prefix outside native buffer');
      const code=p.read(at,1);p.write(E+0x14,at+1);p.write(E+0x2ff00,code);
      if(code===1){let used;for(let glyphs=0;glyphs<8;glyphs++){const addr=p.read(E+0x14),byte=p.read(addr,1);if(byte===2){p.write(E+0x14,addr+1);break;}if(byte===0){p.write(E+0x14,addr+1);continue;}used=p.call(0x886bcfc,[F,addr],200000).value;if(!used||used>3)throw Error('428 choice prefix text bound');p.write(E+0x14,addr+used);if(glyphs===7)throw Error('428 choice prefix glyph budget');}}
      else if(code===0x2d){if(p.read(at+1,1)!==4||[2,3,4,5].some(n=>p.read(at+n,1)!==0))throw Error('428 choice prefix wait');p.write(E+0x14,at+6);}
      else if([0x0e,0x5f,0x4c].includes(code))p.call(p.read(0x89c090c+code*8),[],200000);
      else throw Error('Unsupported native choice prefix');
      if(code===0x4c)break;if(n===19)throw Error('428 choice prefix budget');
     }
     if(p.read(E+0x14)!==t.address)throw Error('428 choice prefix source return');
     drawn.length=0;
    }
    for(let at=t.address+1,end=at+raw.length/2;at<end;){
     if(p.read(E+0x6ac)&&p.call(0x886b830,[F]).value===p.read(E+0x6b4)){
      p.write(E+0xc,t.script);p.write(E+0x14,at);p.call(0x8872a04,[E,p.read(E+0x6ac),0],200000);
     }
     const old=drawn.length;let used;
     if(p.read(E+0x6a1,1)){
      p.write(E+0xc,t.script);p.write(E+0x14,at);p.write(E+0x6a2,1,1);p.write(E+0x64c,1);
      p.call(0x886ebb4,[E],200000);used=p.read(E+0x14)-at;
      if(drawn.length>old+1)drawn[old].ruby=drawn.splice(old+1);
     }else used=p.call(0x886bcfc,[F,at],200000).value;
     if(!used||at+used>end)throw Error('428 text source character boundary');at+=used;
     if(drawn.length===old&&t.text[old]==='\u4edd')drawn.push({codepoint:32,index:null,nativeIndex:null,size:0,style:0,width:0,height:0,x:float(D+0x144)*.375,y:float(D+0x148)*272/720,suppressed:true});
     if(drawn.length-old!==1)throw Error('428 text suppressed glyph is not implemented');
    }
    if(String.fromCodePoint(...drawn.map(g=>g.codepoint))!==text){
     const error=Error(`428 native Unicode differs from recovered text at ${t.id}`);
     error.nativeCodepoints=drawn.map(g=>g.codepoint);throw error;
    }
   });}finally{choiceStatus=null;}
  },
  ellipsis(event){
   const t=token(event,0x43),count=p.read(t.address+2,1);
   if(count!==event.command.count||p.read(t.address+3,1)!==event.command.cadence)throw Error('428 ellipsis source mismatch');
   return transaction(()=>{
    if(p.read(E+0x6ac)&&p.call(0x886b830,[F]).value===p.read(E+0x6b4)){
     p.write(E+0xc,t.script);p.write(E+0x14,t.address);p.call(0x8872a04,[E,p.read(E+0x6ac),1],200000);
    }
    for(let n=count*3;n>0;n--)p.call(0x886c15c,[F,n,t.address+t.next-t.offset],200000);
   });
  },
  rule(event){
   const t=token(event,0x2b),count=p.read(t.address+2,1);
   if(count!==event.command.count||p.read(t.address+1,1)!==1)throw Error('428 inline rule source mismatch');
   return transaction(()=>{
    const index=p.read(E+0x12f4,1);if(index>=16)throw Error('428 inline rule capacity');
    if(p.read(E+0x6ac)&&p.call(0x886b830,[F]).value===p.read(E+0x6b4)){
     p.write(E+0xc,t.script);p.write(E+0x14,t.address);p.call(0x8872a04,[E,p.read(E+0x6ac),1],200000);
    }
    p.call(0x887e0b0,[E,count],200000);
    const at=R+0x194+index*0x38;
    // The rectangle backend treats both endpoint coordinates as inclusive.
    drawn.push({kind:'rule',count,x:p.read(at+4)|0,y:p.read(at+12)|0,width:(p.read(at+20)|0)+1,height:(p.read(at+28)|0)+1,
     color:[float(at+36),float(at+40),float(at+44)],anchorIndex:p.read(at+52)});
   });
  },
 });
}
