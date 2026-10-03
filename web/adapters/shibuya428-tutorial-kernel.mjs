/* Exact-edition tutorial controller. Original paging, reveal, scroll and close
 * routines run in the bounded probe. Thread scheduling, input and GPU drawing
 * are host callbacks. No executable, strings or artwork are bundled here.
 * Ordinary tutorials 3/4/5/6/8/12/14/17/41, source-context-selected tutorial 20,
 * menu tutorials 10/11/13/15/16, tutorial 9's timeline request, and source
 * system-text entry. A timeline request is a separate controller boundary;
 * completing its tutorial never resumes the story by itself.
 * Checkpoints are opaque, in-memory transactions, never reader save data. */
import {NativeProbe} from './shibuya428-native.mjs';
import {FLAG_COUNT, decodeSystem, decodeLink} from './shibuya428-control.mjs';
import {is428ProgressKernel} from './shibuya428-progress-kernel.mjs';
import {Shibuya428Context} from './shibuya428-context.mjs';
import {plan428System} from './shibuya428-system.mjs';
const E=0x10000000,T=E+0x24000,U=E+0x2ff40,STACK=0x14000000,JIS=0x16000000;
const identities={elf:'194a2dcb010c86f40302fd7f83e6be1f0cd446294716b0fbd05d7f2acafc3dce',
 sns:'1a467441c56f57337c499541a781da9323551db542069c44d8f146f19e1d5968',
 jis:'d1c0f65ac91bc52cb58dcba7d5d7b21452301b18106ecb2e10f8c26e88f3bdfb'};
const verified=new WeakSet();
export const is428TutorialKernel=kernel=>verified.has(kernel);
const validFlags=flags=>Array.isArray(flags)&&flags.length===FLAG_COUNT&&Array.from(flags).every(n=>Number.isInteger(n)&&n>=0&&n<=255);

export async function create428TutorialKernel(inputs,scripts){
 const bytes={};
 for(const [name,expected]of Object.entries(identities)){
  if(!(inputs[name] instanceof Uint8Array)||inputs[name].length>4*1024*1024)throw Error('428 tutorial input bound');
  bytes[name]=new Uint8Array(inputs[name]);
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes[name]));
  if([...hash].map(n=>n.toString(16).padStart(2,'0')).join('')!==expected)throw Error(`428 tutorial ${name} identity mismatch`);
 }
 const tokens=new Map();
 const linkTokens=new Map();
 for(const s of Object.values(scripts))for(const t of s.tokens)if([0x6c,0x70].includes(t.code)){
  const at=s.sns_offset+t.offset,link=decodeLink(t),target=scripts[link.target.script]?.labels[link.target.label];
  if(!target||bytes.sns[at]!==t.code||bytes.sns[at+1]!==t.args.length||t.args.some((v,n)=>bytes.sns[at+2+n]!==v))throw Error('428 tutorial link source mismatch');
  linkTokens.set(t.id,{...link,script:s.index,pc:t.next,code:t.code,pointer:0x11000000+scripts[link.target.script].sns_offset+target.table_offset+8});
 }
 for(const s of Object.values(scripts))for(const t of s.tokens)if(t.code===0xc0){
  const at=s.sns_offset+t.offset,c=decodeSystem(t);
  if(bytes.sns[at]!==0xc0||bytes.sns[at+1]!==2||bytes.sns[at+2]!==c.type||bytes.sns[at+3]!==c.code||t.next!==t.offset+4)
   throw Error('428 tutorial source mismatch');
  tokens.set(t.id,{...c,script:s.index,pc:t.next,position:0x11000000+s.sns_offset+t.next});
 }
 const ev=new DataView(bytes.elf.buffer),hooks=new Map(),draws=[];
 let input={},active=null,controller=0;
 const p=new NativeProbe({segments:[
  {address:ev.getUint32(60,true),bytes:bytes.elf.subarray(ev.getUint32(56,true),ev.getUint32(56,true)+ev.getUint32(68,true))},
  {address:0x9ef0000,bytes:new Uint8Array(0x10000),writable:true},
  {address:0x9f00000,bytes:new Uint8Array(0x10000),writable:true},
  {address:E,bytes:new Uint8Array(0x30000),writable:true},
  {address:JIS,bytes:bytes.jis},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true},
 ],hooks,stackTop:STACK+0xfff0,float32:true,ranges:[
  [0x88fe2b8,0x88fe3c4],[0x88fe4a8,0x88ff528],[0x88ff940,0x8900038],
  [0x89005f8,0x8900900],[0x887fc80,0x887fcc0],[0x8868030,0x8868080],
  [0x887ae44,0x887ae50],
  [0x8878544,0x8878b90],[0x882f808,0x882f8c8],
  [0x8877ec0,0x8878544],[0x887986c,0x8879878],
  [0x8879a64,0x8879b04],[0x8879c08,0x8879c94],[0x8879cdc,0x8879d20],
  [0x89564f8,0x89565f0],[0x89561c0,0x895633c],[0x8955ff4,0x8956068],
  [0x88ba428,0x88ba438],[0x88dfc98,0x88dfdc0],
  [0x888155c,0x8881604],[0x8882598,0x88826f0],[0x8878b90,0x8878bd4],[0x887d09c,0x887d0d0],
 ]});
 const buffer=new DataView(new ArrayBuffer(4));
 const float=at=>{buffer.setUint32(0,p.read(at),true);return buffer.getFloat32(0,true);};
 // External thread/GPU objects are not part of the script or tutorial state.
 hooks.set(0x88202fc,(_,[size])=>{if(size===0x8c&&active?.event.plan.code===9)return E+0x2e000;if(size!==0x1e04)throw Error('428 tutorial allocation bound');return T;});
 hooks.set(0x8813d00,(_,[dst,value,size])=>{if(size>0x2000)throw Error('428 tutorial clear bound');for(let n=0;n<size;n++)p.write(dst+n,value,1);return dst;});
 for(const at of [0x882fa34,0x882fa6c,0x8820684,0x88300d4,0x882fad0,0x88ff528,0x884e510,0x885f49c,0x89003f0])hooks.set(at,()=>0);
 hooks.set(0x88688a4,()=>0);
 // Only the auto/skip indicator objects used by system-text entry. The
 // native selector clears their visibility; it does not clear story text.
 const renderer=E+0x2f000,controls=renderer+0x100;
 p.write(renderer+0x3c,controls);hooks.set(0x88920a0,()=>renderer);
 p.write(controls,renderer+0x280);
 for(let i=0;i<7;i++)p.write(controls+0x1c+i*4,renderer+0x200+i*0x10);
 hooks.set(0x8849938,(_,[object,visible])=>{
  if(object===renderer+0x280&&visible===0&&active?.event.plan.code===14){draws.push({kind:'controlVisibility',index:'text',visible:false});return 0;}
  const index=(object-renderer-0x200)/0x10;
  if(!Number.isInteger(index)||index<0||index>=7||visible!==0)throw Error('Unsupported system control visibility');
  draws.push({kind:'controlVisibility',index,visible:false});return 0;
 });
 hooks.set(0x886832c,(_,[key])=>Number(key===4?input.confirm:key===5?input.back:key===15?input.timeline:key===12?input.links:false));
 hooks.set(0x888333c,(_,[owner,script,pointer])=>{
  const link=active?.links?.find(l=>l.source.target.script===script&&l.source.pointer===pointer&&!l.jump);
  if(owner!==E+0x27a8||!link)throw Error('Unsupported tutorial TIP lookup');return Number(link.visited);
 });
 hooks.set(0x8868324,(_,[key])=>Number(key===0?input.up:key===1?input.down:false));
 hooks.set(0x886833c,()=>Number(Object.values(input).some(Boolean)));
 // The original tutorial controller chooses this action. Its full story
 // context is owned by the progress bridge, which must acknowledge it next.
 hooks.set(0x88718a8,(_,[owner,menu])=>{
  if(owner!==E||menu!==4||active?.event.plan.code!==9||!active.tutorialDone)throw Error('Unsupported tutorial menu request');
  active.menuRequest=menu;return 0;
 });
 // UI sound requests are exposed separately; no script audio is suppressed.
 hooks.set(0x88413e4,()=>{draws.push({kind:'sound'});return 0;});
 hooks.set(0x887cb38,(_,[owner,next])=>{if(owner!==E||!([5,63].includes(next)||next===11&&active?.event.plan.code===14&&active.tutorialDone))throw Error('Unsupported tutorial continuation');controller=next;p.write(E+0x29cb0,next);return 0;});
 hooks.set(0x88ff818,(_,[owner,x,y,color],call)=>{
  if(owner!==T)throw Error('Unexpected tutorial font owner');
  const [, , , ,size,address]=call.integerArguments;
  draws.push({kind:'text',x:x|0,y:y|0,color,size,style:2,alpha:Math.min(float(T+0xe0),call.float32(12)),
   bytes:Array.from(p.string(address),c=>c.charCodeAt(0))});return 0;
 });
 hooks.set(0x8900460,(_,[owner,group,index,x],call)=>{
  if(owner!==T||group>4||index>=34)throw Error('Unexpected tutorial picture');
  const uv=Array.from({length:4},(_,n)=>p.read(0x89ca254+index*16+n*4));
  draws.push({kind:'image',group,index,resource:[2,2,1,1,2][group],uv,x:x|0,y:call.integerArguments[4]|0,alpha:call.float32(12)});return 0;
 });
 p.write(0x9ef1e30,E);p.write(0x9ef1ce4,U);p.write(0x9f02ed8,JIS);p.call(0x8868030,[]);p.write(U+0x10,1,1);
 const capture=()=>({memory:p.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]),active:structuredClone(active),controller});
 const restore=s=>{for(const [segment,b]of s.memory)segment.bytes.set(b);active=structuredClone(s.active);controller=s.controller;draws.length=0;input={};};
 const clean=capture(),snapshots=new WeakMap();
 const atomic=fn=>{const before=capture();try{return fn();}catch(error){restore(before);throw error;}};
 function view(){
  if(active.begin)return {kind:'systemBegin',done:active.done,code:active.event.plan.code,controller,
   position:p.read(E+0x29c6c),systemActive:!!p.read(E+0x29c68,1),alpha:0,draws:structuredClone(draws)};
  const result={done:active.done,code:active.event.plan.code,phase:p.read(T+0xb0),stage:p.read(T+0xb4),
   row:p.read(T+0x104),rows:p.read(T+0xf0),scroll:float(T+0x1ddc),alpha:float(T+0xe0),controller,
   clip:{x:p.read(T+0x1df4),y:p.read(T+0x1df8),width:p.read(T+0x1dfc),height:p.read(T+0x1e00)},draws:structuredClone(draws)};
  if(active.tutorialDone&&active.event.plan.code===9)result.prompt={kind:'timeline',sourceMode:p.read(E+0x2e03c),requested:active.menuRequest===4};
  if(active.tutorialDone&&active.event.plan.code===14)result.prompt={kind:'links',requested:controller===11};
  for(const d of result.draws)if(d.kind==='text'){
   if(d.bytes.length>=256)throw Error('428 tutorial string bound');
   d.bytes.forEach((n,i)=>p.write(T+0x2200+i,n,1));p.write(T+0x2200+d.bytes.length,0,1);
   const count=p.call(0x882f808,[T+0x2400,T+0x2200],100000).value;
   d.text=String.fromCharCode(...Array.from({length:count},(_,i)=>p.read(T+0x2400+i*2,2)));delete d.bytes;
  }
  return result;
 }
 const api=Object.freeze({
  checkpoint(){const token=Object.freeze({});snapshots.set(token,capture());return token;},
  restore(token){const backup=snapshots.get(token);if(!backup)throw Error('428 tutorial foreign checkpoint');restore(backup);},
  systemState(){
   if(!active?.done)throw Error('428 system state requires completed presentation');
   return {type:p.read(E+0x29c60),code:p.read(E+0x29c64),active:!!p.read(E+0x29c68,1)};
  },
  continuation(){
   if(!active?.done)throw Error('428 tutorial continuation requires completed input');
   return active.menuRequest===4?{kind:'menuRequest',menu:4}:controller===11?{kind:'linkSelection',selected:p.read(E+0x2ef8)}:null;
  },
  startMenu(request,flags,owner){return atomic(()=>{
   if(active||!is428ProgressKernel(owner)||!validFlags(flags))throw Error('428 verified menu tutorial request required');
   const code=request?.kind==='jumpTutorial'?owner.validateJumpTutorial(request,flags):owner.validateTimelineTutorial(request,flags);
   if(![10,11,13,15,16].includes(code))throw Error('Unsupported menu tutorial');
   restore(clean);active={event:{kind:'menuTutorial',plan:{code}},flags:[...flags],menu:true,done:false,frames:0};
   flags.forEach((n,i)=>p.write(E+0x1660+i,n,1));
   p.call(0x88fe2b8,[code,0],200000);p.call(0x88fe4d0,[T],200000);
   if(!p.call(0x88fe4a8).value)throw Error('428 menu tutorial failed to start');
   return view();
  });},
  finishMenu(request,flags,owner){return atomic(()=>{
   if(!active?.menu||!active.done||!is428ProgressKernel(owner)||JSON.stringify(flags)!==JSON.stringify(active.flags))throw Error('428 menu tutorial completion requires its unchanged flags');
   const code=request?.kind==='jumpTutorial'?owner.validateJumpTutorial(request,flags):owner.validateTimelineTutorial(request,flags);
   if(code!==active.event.plan.code)throw Error('428 menu tutorial identity');
   const result=Array.from({length:FLAG_COUNT},(_,i)=>p.read(E+0x1660+i,1));
   if(result[0x400+code]!==1||result.some((v,i)=>i!==0x400+code&&v!==flags[i]))throw Error('428 menu tutorial unexpected flag mutation');
   active=null;return result;
  });},
  start(event,flags,systemPosition=null,tutorialsEnabled=true,links=[],sourceContext=null){return atomic(()=>{
   if(active)throw Error('428 tutorial already active');
   const source=tokens.get(event?.id),plan=event?.plan;
   if(typeof tutorialsEnabled!=='boolean')throw Error('428 tutorial preference required');
   if(event?.kind==='system'&&source?.type===2&&source.code===6&&plan?.type===0){
    if(!validFlags(flags)||tutorialsEnabled&&!flags[0x446]||plan.code!==1||!plan.active||plan.request!==null||!plan.yield||plan.callbacks?.length)throw Error('428 seen/disabled ending tutorial mismatch');
    const origin=[...tokens.values()].find(t=>t.type===0&&t.script===systemPosition?.script&&t.pc===systemPosition?.pc);
    if(!origin)throw Error('428 ending tutorial requires its source system position');
    restore(clean);active={event:structuredClone(event),flags:[...flags],done:false,frames:0,begin:true};controller=5;
    flags.forEach((n,i)=>p.write(E+0x1660+i,n,1));p.write(U+0x10,Number(tutorialsEnabled),1);p.write(E+0x29c6c,origin.position);
    if(p.call(0x8877ec0,[E,2,6],200000).value!==1||p.read(E+0x29c60)!==0||p.read(E+0x29c64)!==1||p.read(E+0x29c68,1)!==1||controller!==5)throw Error('428 ending tutorial shortcut result');
    return view();
   }
   if(event?.kind==='system'&&source?.type===0){
    if(!validFlags(flags)||plan?.type!==0||plan.code!==source.code||!plan.active||plan.request!==null||!plan.yield||JSON.stringify(plan.callbacks)!==JSON.stringify(['resetPresentation']))throw Error('428 system-text entry mismatch');
    restore(clean);active={event:structuredClone(event),flags:[...flags],done:false,frames:0,begin:true};controller=5;
    flags.forEach((n,i)=>p.write(E+0x1660+i,n,1));p.write(E+0x14,source.position);
    if(p.call(0x8877ec0,[E,0,source.code],200000).value!==1||p.read(E+0x29c68,1)!==1||p.read(E+0x29c6c)!==source.position||controller!==5)throw Error('428 system-text entry result');
    return view();
   }
   if(source?.type===2&&source.code===20){
    if(!is428ProgressKernel(sourceContext?.owner))throw Error('428 contextual tutorial requires verified source context');
    const context=new Shibuya428Context(sourceContext.owner.contextData());context.restore(sourceContext.snapshot);
    const expected=plan428System({type:source.type,code:source.code},{flags,character:context.current()?.character,tutorialsEnabled});
    if(JSON.stringify(plan)!==JSON.stringify(expected))throw Error('428 contextual tutorial selection mismatch');
   }
   const repeatLinks=source?.type===2&&source.code===14&&plan?.request===63&&JSON.stringify(plan.callbacks)===JSON.stringify(['resetMessage'])&&flags[0x44e]===1&&!flags[0x451];
   if(event?.kind!=='system'||source?.type!==2||![3,4,5,6,8,9,12,14,17,20,41].includes(source.code)||source.code!==20&&plan?.code!==source.code||plan.type!==2||!repeatLinks&&(plan.request!==62||plan.callbacks?.length)||plan.active||!plan.yield)
    throw Error('Unsupported source tutorial controller');
   if(!validFlags(flags)||!repeatLinks&&flags[0x440+plan.code])throw Error('428 tutorial source flags');
   restore(clean);active={event:structuredClone(event),flags:[...flags],done:false,frames:0};
   if(source.code===6){
    const origin=[...tokens.values()].find(t=>t.type===0&&t.script===systemPosition?.script&&t.pc===systemPosition?.pc);
    if(!origin)throw Error('428 bad-ending tutorial requires its source system position');p.write(E+0x29c6c,origin.position);
   }
   flags.forEach((n,i)=>p.write(E+0x1660+i,n,1));p.write(E+0x29c60,2);p.write(E+0x29c64,plan.code);
   if(source.code===14){
    if(!Array.isArray(links)||!links.length||links.length>8||!links.some(l=>l.jump))throw Error('428 JUMP tutorial requires source links');
    active.links=links.map(l=>{const t=linkTokens.get(l.id);if(!t||t.script!==source.script||t.pc>=source.pc||JSON.stringify(l.target)!==JSON.stringify(t.target)||!!l.jump!==(t.code===0x70)||!l.jump&&typeof l.visited!=='boolean')throw Error('428 tutorial link mismatch');return {...structuredClone(l),source:t};});
    p.write(E+0x2ef4,links.length);p.write(E+0x2efc,0);p.write(E+0x2ef8,0);
    active.links.forEach((l,n)=>{const at=E+0x2840+n*52;p.write(at,l.source.pointer);p.write(at+4,l.source.target.script);p.write(at+28,l.jump?2:1);if(l.jump)p.write(at+40,l.source.flag);});
   }
   if(repeatLinks){
    active.tutorialDone=true;p.call(0x8877ec0,[E,2,14],200000);
    if(controller!==63)throw Error('428 repeated link prompt mismatch');return view();
   }
   p.call(0x8878544,[E],200000);p.call(0x88fe4d0,[T],200000);
   if(controller!==63||!p.call(0x88fe4a8).value)throw Error('428 tutorial failed to start');
   return view();
  });},
  tick(keys={}){return atomic(()=>{
   if(!active||active.done)throw Error('428 tutorial is not running');
   if(Object.keys(keys).some(k=>!['confirm','back','up','down','timeline','links'].includes(k))||Object.values(keys).some(v=>typeof v!=='boolean'))throw Error('428 tutorial input');
   if(++active.frames>216000)throw Error('428 tutorial frame budget');
   input=keys;draws.length=0;
   if(active.begin){active.done=true;return view();}
   if(!active.tutorialDone&&!p.call(0x88fe500,[T],200000).value){p.call(0x88fe4f0,[T]);active.tutorialDone=true;}
   if(active.menu){active.done=!!active.tutorialDone;return view();}
   p.call(0x887870c,[E],200000);
   active.done=active.tutorialDone&&(active.event.plan.code!==9||active.menuRequest===4)&&(active.event.plan.code!==14||controller===11);
   if(controller!==(active.done?(active.event.plan.code===14?11:5):63))throw Error('428 tutorial controller mismatch');
   return view();
  });},
  finish(event,flags){return atomic(()=>{
   if(!active?.done||JSON.stringify(event)!==JSON.stringify(active.event)||JSON.stringify(flags)!==JSON.stringify(active.flags))throw Error('428 tutorial completion requires its unchanged source event and flags');
   const result=Array.from({length:FLAG_COUNT},(_,i)=>p.read(E+0x1660+i,1)),code=active.event.plan.code;
   if(active.begin){if(result.some((v,i)=>v!==flags[i]))throw Error('428 system-text entry changed flags');active=null;return result;}
   if(result[0x440+code]!==1||result.some((v,i)=>i!==0x400+code&&i!==0x440+code&&v!==flags[i]))throw Error('428 tutorial unexpected flag mutation');
   active=null;return result;
  });},
 });
 verified.add(api);return api;
}
