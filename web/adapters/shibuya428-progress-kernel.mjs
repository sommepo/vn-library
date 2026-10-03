/* Exact-edition progress research bridge. Inputs come from the owner's private
 * recovery. No native bytes are bundled, and no OS/firmware calls are provided.
 * This is deliberately separate from reader admission and persistent saves. */
import {NativeProbe} from './shibuya428-native.mjs';
import {Shibuya428Progress} from './shibuya428-progress.mjs';
import {Shibuya428Context} from './shibuya428-context.mjs';
import {Shibuya428FlowState} from './shibuya428-flow-state.mjs';
import {decodeChoice,decodeSystem,decodeLink,evaluate} from './shibuya428-control.mjs';
const verifiedKernels=new WeakSet();
export const is428ProgressKernel=value=>verifiedKernels.has(value);
const E=0x10000000,SNS=0x11000000,FLOW=0x12000000,HEAP=0x13000000,STACK=0x14000000,FLOW_ROWS=0x15000000,TIMELINE=0x18000000;
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
 hooks.set(0x882056c,(p,[dst,size])=>memset(p,[dst,0,size]));
 // Choice selection's presentation reset is committed separately by the
 // consumer. No font, message object or GPU state is part of this graph bridge.
 for(const at of [0x886a708,0x886b758,0x887c808,0x889287c])hooks.set(at,()=>0);
 // Auto/skip are not enabled in this bridge. These indicator callbacks only
 // clear their presentation; the system's record and hour checks run below.
 for(const at of [0x887986c,0x8879a64])hooks.set(at,()=>0);
 // End-controller presentation is committed by the host before exposing its
 // save request. These callbacks have no authority to persist or select a path.
 const R=E+0x24000,V=E+0x24100,O=E+0x24200;
 let saveRequest=null,navigationRequest=null,menuCallbacks=null,menuFreeMovieChannel=1,timelineCreated=false,timelineSession=null,timelineTutorial=null,timelineLastTutorial=null,timelineConfirm=false,navigationTimelineOpening=false;
 const D=E+0x28000;
 let jumpSession=null,jumpKey=0,jumpTutorial=null,jumpOpening=false,jumpTimelineOpening=false;
 const TIP=E+0x25000;
 let tipSession=null,tipInput=false,tipKey=0;
 let hourSession=null;
 const HOUR=0x19000000;
 hooks.set(0x883dc88,()=>0);
 hooks.set(0x88b3c40,()=>0);
 hooks.set(0x8831924,()=>{if(hourSession?.phase!=='loading')throw Error('428 unowned intro archive');return HOUR;});
 hooks.set(0x883210c,(_probe,[archive,root,name,mode])=>{
  if(hourSession?.phase!=='loading'||archive!==HOUR||p.string(root)!=='disc0:/PSP_GAME/USRDIR'||p.string(name)!=='additioncontentschunk.cpk'||mode!==16)throw Error('428 intro archive request mismatch');return 0;
 });
 hooks.set(0x8845f60,(_probe,_args,registers)=>{
  const args=registers.integerArguments;
  if(hourSession?.phase!=='loading'||hourSession.movie||args[0]!==HOUR||args[1]!==0x4001||args[2]!==0||args[3]!==0||args[5]!==0||args[6]!==70||args[7]!==0)throw Error('428 unsupported intro movie request');
  hourSession.movie={resource:args[1],volumePercent:args[6]};return HOUR+0x400;
 });
 hooks.set(0x88468d0,(_probe,[movie])=>{if(hourSession?.phase!=='playing'||movie!==HOUR+0x400)throw Error('428 unowned intro playback');return Number(!hourSession.ended);});
 hooks.set(0x8847198,(_probe,[movie])=>{if(hourSession?.phase!=='playing'||!hourSession.ended||movie!==HOUR+0x400)throw Error('428 premature intro release');hourSession.released=true;return 0;});
 hooks.set(0x89a7cd8,(_probe,[value])=>{if(hourSession?.phase!=='playing'||value!==6)throw Error('428 unsupported intro callback');return 0;});
 hooks.set(0x88920a0,()=>R);
 for(const at of [0x8910840,0x89040dc])hooks.set(at,()=>R+0x3000);
 for(const at of [0x8910cec,0x8910da0,0x8910878,0x8905554,0x8905610,0x8904150,
  0x8892bb8,0x88ba428,0x8849938,0x883b708,0x883da68,0x884215c,0x883e4dc,0x8843b0c,0x8840efc,
  0x888c174,0x888a848,0x888b0d0,0x888c034,0x888a47c,0x888a424,0x888a4cc,
  0x887a7d0,0x88f5a48,0xf0000004])hooks.set(at,()=>0);
 hooks.set(0x891858c,()=>1);hooks.set(0xf0000000,()=>1);hooks.set(0xf0000008,()=>1);
 hooks.set(0x8842228,()=>0);hooks.set(0x88eba0c,()=>0);
 hooks.set(0x88eb938,(_p,args,registers)=>{if(saveRequest)throw Error('Duplicate ending save request');saveRequest=registers.integerArguments.slice(0,5);return 0;});
 hooks.set(0x88bba44,(_p,args,registers)=>{if(navigationRequest)throw Error('Duplicate navigation request');navigationRequest=registers.integerArguments.slice(0,6);return 0;});
 for(const at of [0x886a8c8,0x886a88c,0x886aa14,0x886ab60,0x886ab9c,0x886abe8,0x886abf8,0x8890d00,
  0x883e644,0x8843c74,0x8841f74,0x888e2fc,0x884860c,0x8841394,0x883d6dc])hooks.set(at,()=>0);
 for(const at of [0x883e644,0x8843c74,0x8848708])hooks.set(at,(_p,args)=>{
  if(menuCallbacks)menuCallbacks.push({address:at,args:args.slice(0,at===0x883e644?3:2)});return 0;
 });
 for(const at of [0x882fad0,0x88413e4,0x8916bf8])hooks.set(at,()=>0);
 for(const at of [0x886d090,0x885f4e0])hooks.set(at,()=>0);
 hooks.set(0x8845764,()=>3);hooks.set(0x883e8a8,()=>menuFreeMovieChannel>>>0);
 hooks.set(0x88ccad4,(_p,[mode,renderer])=>{
  if(mode!==(jumpTimelineOpening?3:navigationTimelineOpening?4:0)||renderer!==(navigationTimelineOpening||jumpTimelineOpening?0:R)||timelineCreated)throw Error('Unsupported timeline constructor');
  timelineCreated=true;return TIMELINE;
 });
 // CPU timeline initialization owns gates and cursor state. The host owns
 // graphics objects; these construction callbacks do not expose new rows.
 for(const at of [0x88d35dc,0x88d6160,0x88d354c,0x88d366c,0x88d3ca8,0x88d4c7c,
  0x88bf920,0x88dc358,0x88dcb80,0x88d490c,0x88d4a44,0x88d4870,0x88d4ae8,0x88d47d4,0x88d49a8,0x88d4b94,0x88dc3e0])hooks.set(at,()=>0);
 hooks.set(0x88dfc98,()=>TIMELINE+0x14800);hooks.set(0x89a506c,()=>TIMELINE+0x14900);
 hooks.set(0x88fe2b8,(_p,[code,parent])=>{
  if(jumpOpening){if(jumpTutorial!==null||parent!==0||![15,16].includes(code))throw Error('Unsupported JUMP tutorial request');jumpTutorial=code;return 0;}
  if(timelineTutorial!==null||parent!==0||![10,11,13].includes(code))throw Error('Unsupported timeline tutorial request');
  timelineTutorial=code;return 0;
 });
 hooks.set(0x88fe4a8,()=>Number(jumpOpening?jumpTutorial!==null:timelineTutorial!==null));hooks.set(0x88fe4b4,()=>timelineLastTutorial);
 // Timeline pointer confirmation uses the same source row gate and confirm
 // handler. Directional scrolling and native menu artwork remain host UI work.
 hooks.set(0x88688a4,()=>0);hooks.set(0x886832c,(_p,[key])=>Number(tipInput?key===tipKey:jumpOpening?key===jumpKey:timelineConfirm&&key===4));hooks.set(0x8868334,()=>0);
 hooks.set(0x8868324,()=>0);
 // Native link and dialog CPU logic retain all decisions and flags. Only font
 // measurements and graphics/thread objects are supplied by the host here.
 hooks.set(0x886ac74,()=>50);hooks.set(0x886a84c,()=>0);
 for(const at of [0x885faf8,0x886ace4,0x886acbc,0x8892c18,0x886cf30,
  0x882fa34,0x882fa6c,0x8820684,0x88300d4,0x885ae84,0xf000000c])hooks.set(at,()=>0);
 hooks.set(0x880ed64,(_p,_args,c)=>{c.setFloat32(0,Math.sin(c.float32(12)));return 0;});
 hooks.set(0x8816eb0,(p,[at,char])=>{const index=p.string(at).indexOf(String.fromCharCode(char));return index<0?0:at+index;});
 hooks.set(0x88103c8,(p,[at])=>{const value=Number.parseInt(p.string(at),10);if(!Number.isInteger(value))throw Error('428 source decimal conversion');return value;});
 hooks.set(0x88202fc,(_p,[size])=>{if(hourSession?.phase==='notice'&&size===0x7c)return HOUR+0x500;if(tipInput&&size===0x118)return TIP;if(!jumpOpening||size!==0xa0)throw Error('428 controller allocation bound');return D;});
 hooks.set(0x8900d40,()=>{p.write(D+0x3c,D+0x200);p.write(D+0x200,D+0x300);p.write(D+0x3d8,0xf000000c);p.write(D+0x40,D+0x400);return 0;});
 // The caller acknowledges the dialog's opening/closing transition before
 // invoking these CPU stages. Native artwork animation is not emulated here.
 hooks.set(0x8901df0,()=>1);hooks.set(0x8902ccc,()=>1);
 // TIP graphics are acknowledged separately by the presenter. These hooks
 // intercept only font/GPU visibility and overlay animation readiness.
 for(const at of [0x88f90d4,0x887c93c,0x887c8e8,0x887e5a4,0x887cfb0,0x887b038,0x88eba50,0x88ba41c])hooks.set(at,()=>0);
 hooks.set(0x88fa7bc,()=>1);hooks.set(0x88fa940,()=>1);
 for(const at of [0x883d470,0x883fb1c,0x8845e80,0x894b768])hooks.set(at,()=>0);
 for(const address of [0x88bb838,0x88bb9a8,0x88bb7b8])hooks.set(address,()=>{if(hourSession?.phase!=='notice')throw Error('428 unowned notification graphics');return 0;});
 const ranges=[
  [0x88bc9cc,0x88bcbc4],[0x88ccf60,0x88cd098],[0x88ca3e4,0x88ca550],[0x8955d34,0x8955d40],
  [0x887bc7c,0x887c6b8], [0x887ae44,0x887ae50],
  [0x887a1dc,0x887a450], [0x8882f54,0x88832e4], [0x8883394,0x8883474],
  [0x88850f4,0x88851b4], [0x88854e4,0x88857a4], [0x887483c,0x88752b4], [0x8882cd8,0x8882f1c], [0x88857a4,0x8886db8], [0x8882978,0x8882bfc],
  [0x8876034,0x8876338], [0x8874588,0x88745b8], [0x8876698,0x88766d0],
  [0x8898248,0x8898254], [0x88982c8,0x8898388], [0x8898398,0x88983f0],
  [0x88962ec,0x8896404], [0x8898748,0x8898a1c], [0x88ca590,0x88ca7a0], [0x88ca800,0x88caa4c], [0x88cae08,0x88cb114],
  [0x8955d64,0x8955d7c],
  [0x8870c58,0x8870db0],[0x88752b4,0x8876034],[0x88853b4,0x88854e4],
  [0x8883478,0x8883530],[0x8891ed8,0x8891f00],[0x888e2d4,0x888e2dc],
  [0x887cb38,0x887cba0],[0x8893440,0x8893448],
  [0x8877ec0,0x8877fd4],[0x8878264,0x887827c],[0x887852c,0x8878544],
  [0x8878544,0x8878b90],[0x8876f18,0x887702c],[0x8876338,0x8876678],
  [0x88745b8,0x887483c],[0x8877640,0x8877b48],[0x887b0d0,0x887b0f0],
  [0x88bb1b4,0x88bb284],[0x88bb32c,0x88bb5e4],[0x88b396c,0x88b3a20],
  [0x8899b34,0x8899c1c],[0x8872350,0x8872874],[0x88828f8,0x8882978],[0x8882bfc,0x8882cbc],
  [0x8877d10,0x8877ec0],[0x887f900,0x887fc80],[0x88814dc,0x8881550],[0x887a180,0x887a1dc],
  [0x8880964,0x88809a8],[0x88813a4,0x88814dc],[0x8892d6c,0x8892db8],
  [0x887ea90,0x887eae8],[0x887ed0c,0x887ed8c],[0x8873d14,0x8874098],
  [0x887711c,0x8877238],[0x88766c8,0x88766ec],
  [0x88be3b4,0x88be834],[0x8876bf0,0x8876f18],[0x887702c,0x887711c],[0x88c4388,0x88c4484],
  [0x887fcb0,0x887fcc0],[0x8874098,0x8874588],[0x8955d54,0x8955d64],
  [0x88961b0,0x8896230],[0x88960e4,0x8896154],[0x8897144,0x88971a0],[0x88971f4,0x8897250],
  [0x88972a4,0x8897300],[0x8897354,0x88973b0],[0x8897404,0x8897460],[0x88974b4,0x8897510],
  [0x889a1b4,0x889a2f4],[0x8892cf8,0x8892d08],
  [0x88718a8,0x8871bc4],[0x8879474,0x8879504],[0x88c4748,0x88c4754],
  [0x8892bdc,0x8892c18],[0x8893548,0x8893558],[0x8890ce8,0x8890cf0],
  [0x88711f0,0x8871294],[0x8871bc4,0x8871d90],[0x887cba0,0x887cd38],
  [0x887e064,0x887e0b0],[0x887dcd4,0x887dd04],[0x887dd74,0x887dde4],[0x887d09c,0x887d0d0],
  [0x8955fd4,0x8955ff4],[0x88767a0,0x8876aa4],[0x8882cbc,0x8882cd8],
  [0x88ccaa4,0x88ccad4],[0x88cd878,0x88cf0c4],[0x88d32a4,0x88d32ac],
  [0x88ca550,0x88ca590],[0x88ca7a0,0x88ca800],[0x8876678,0x8876698],
  [0x88d050c,0x88d0764],[0x88d2ab0,0x88d2c60],[0x88d2f20,0x88d2f4c],
  [0x88d0bac,0x88d0f0c],[0x88dc8ac,0x88dc8b8],[0x88d3414,0x88d354c],
  [0x887fe40,0x8880080],[0x8886db8,0x8886ecc],[0x8873bbc,0x8873d08],
  [0x88ca3cc,0x88ca3e4],[0x887c988,0x887cb38],
  [0x8871294,0x88717d8],[0x8955d40,0x8955d54],[0x8892c34,0x8892c84],
  [0x88cd37c,0x88cd878],[0x88d590c,0x88d5a98],[0x887fc80,0x887fcb0],
  [0x887970c,0x88797f8],[0x88cf97c,0x88cfec8],[0x88d4ae0,0x88d4ae8],[0x88dcc14,0x88dcc3c],
  [0x88cab24,0x88caba8],[0x88d60bc,0x88d6160],[0x88d62ac,0x88d6390],[0x88d5a98,0x88d5b84],
  [0x8881604,0x8882598],[0x88826f0,0x88828f8],[0x887e758,0x887e7a0],
  [0x8893594,0x88935a4],[0x8894798,0x8894a24],[0x8876710,0x88767a0],
  [0x8900900,0x8900af0],[0x8902f38,0x890374c],[0x8903fdc,0x8904074],[0x88766b8,0x88766c8],
  [0x88caae4,0x88cab24],[0x88d33d0,0x88d3414],[0x88733fc,0x88738b0],[0x88cf0c4,0x88cf6ac],
  [0x887cd38,0x887cde8],[0x887827c,0x887852c],
  [0x886f540,0x8870490],[0x8881550,0x8881604],[0x8882598,0x88826f0],
  [0x8879878,0x8879880],[0x887e7a0,0x887e800],[0x8878b90,0x8878bd4],
  [0x88832e4,0x8883478],[0x8883530,0x8884594],
  [0x8898bc0,0x8899984],[0x88850e4,0x88850f4],[0x8885374,0x88853b4],
  [0x889415c,0x889434c],[0x88f898c,0x88f8e6c],[0x88fb3d4,0x88fc224],
  [0x88f9058,0x88f9088],
  [0x8892b54,0x8892bb8],
  [0x8893850,0x88938e8],[0x8893910,0x8893948],
  // Timeline reconstruction can replay source flag writes after an earned
  // choice reversal. Keep their record-position updates and replay guards.
  [0x8895cdc,0x8895ebc],[0x8887964,0x88879e4],
 ];
 const loaded=elf.subarray(elfView.getUint32(56,true),elfView.getUint32(56,true)+elfView.getUint32(68,true)),loadAddress=elfView.getUint32(60,true),scratch=0x89bb334-loadAddress;
 const p=new NativeProbe({segments:[
  {address:loadAddress,bytes:loaded.subarray(0,scratch)},
  {address:0x89bb334,bytes:loaded.subarray(scratch,scratch+4),writable:true},
  {address:0x89bb338,bytes:loaded.subarray(scratch+4)},
  {address:0x9ef0000,bytes:new Uint8Array(0x10000),writable:true},
  {address:0x9f00000,bytes:new Uint8Array(0x10000),writable:true},
  {address:E,bytes:new Uint8Array(0x30000),writable:true},
  {address:SNS,bytes:sns,writable:true}, {address:FLOW,bytes:flo},
  {address:HEAP,bytes:new Uint8Array(0x100000),writable:true},
  {address:STACK,bytes:new Uint8Array(0x10000),writable:true},
  {address:FLOW_ROWS,bytes:rows,writable:true},
  {address:TIMELINE,bytes:new Uint8Array(0x15000),writable:true},
  {address:HOUR,bytes:new Uint8Array(0x800),writable:true}
 ],ranges,hooks,stackTop:STACK+0xfff0,float32:true});
 p.write(0x9ef1e30,E);p.write(0x9ef21cc,E+0x2ff00);p.write(0x9ef2f1c,rows.length/480);p.write(E+0x29ca8,SNS);p.write(0x9ef2f04,FLOW+floView.getUint32(8,true));p.write(0x9ef2f08,FLOW_ROWS);
 p.call(0x887bc7c,[E]);
 p.call(0x8882f54,[E+0x27a8]);
 p.call(0x88828f8,[E+0x1660]);
 p.write(R+0x3c,R+0x1000);p.write(0x9ef1cc0,R+0x2000);
 p.write(O,V);p.write(V+0x18,0xf0000000);p.write(V+0x1c,0xf0000004);p.write(V+0x28,0xf0000008);
 for(const offset of [0x1890,0x1894,0x1898,0x189c,0x18c0])p.write(0x9f00000+offset,O);
 p.write(E+0x10,0xffffffff);p.write(E+0xc,0xffffffff);
 const graph=new Shibuya428Progress(scripts),graphBase=p.read(E+0x27a8);
 const flow=new Shibuya428FlowState(identities.flo,rows.length/480);
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
 // 0x08876034 reads ten valid prefix pointers; its eleventh word is the
 // following string, not a pointer. All source restart checkpoints match ten.
 const contextData={prefixes:Array.from({length:10},(_,n)=>p.string(p.read(0x89bd89c+n*4),2)),
  labels:[...new Set(graph.labels.map(l=>l.label))],
  times:Array.from({length:rows.length/480-1},(_,n)=>{
   const row=FLOW_ROWS+(n+1)*480;return [p.string(row+34,34),p.read(row+0x19b,1),p.read(row+0x19c,1)];
  })};
 const mutable=()=>p.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]);
 const checkpoint=()=>({script:p.read(E+0xc),label:p.read(E+0x10),pc:p.read(E+0x14),character:p.read(E+0x29ccc),hour:p.read(E+0x29cd0)});
 const restoreMemory=backup=>{for(const[s,bytes]of backup)s.bytes.set(bytes);};
 const checkpoints=new WeakMap();
 function restoreFlow(snapshot){
  flow.restore(snapshot);
  for(let n=0;n<flow.count;n++)for(let w=0;w<8;w++)p.write(FLOW_ROWS+n*480+0x1c0+w*4,flow.words[n*8+w]);
  flow.globals.forEach((v,n)=>p.write(0x9ef2f24+n*4,v));
 }
 function collectFlow(){
  for(let n=0;n<flow.count;n++)for(let w=0;w<8;w++)flow.words[n*8+w]=p.read(FLOW_ROWS+n*480+0x1c0+w*4);
  flow.globals.forEach((_,n)=>flow.globals[n]=p.read(0x9ef2f24+n*4));
  return flow.snapshot();
 }
 function hydrate(state,progress,snapshot){
  const context=new Shibuya428Context(contextData);context.restore(snapshot);
  const current=context.current();
  if(!current||state.mode!=='story'||state.stack?.length||!boundaries.get(state.script)?.has(state.pc)||!pointers.has(state.label))throw Error('428 controller source context required');
  if(!Array.isArray(state.flags)||state.flags.length!==2048||Array.from(state.flags).some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('428 controller flag bank');
  graph.restore(progress);graph.bytes.forEach((v,n)=>p.write(graphBase+n,v,1));
  if(state.flow)restoreFlow(state.flow);
  state.flags.forEach((v,n)=>p.write(E+0x1660+n,v,1));
  p.write(E+0xc,state.script);p.write(E+0x10,graph.id(state.label));p.write(E+0x14,SNS+scripts[state.script].sns_offset+state.pc);
  p.write(E+0x29ccc,current.character);p.write(E+0x29cd0,current.hour);p.write(E+0x2804,0,1);
  p.write(E+0x27c4,0xffffffff);p.write(E+0x27cc,0,1);
  const saved=context.snapshot();
  for(let n=0;n<11;n++){
   const label=saved.restarts[n]||'';
   for(let i=0;i<32;i++)p.write(E+0x299e9+n*32+i,label.charCodeAt(i)||0,1);
   p.write(E+0x29bea+n*2,saved.clocks[n],2);
  }
  return context;
 }
 function endingSystemSource(state,phase){
  const event=state.pending,script=scripts[state.script],token=script?.tokens.find(t=>t.id===event?.id);
  if(event?.kind!==phase||token?.code!==0xc0||state.pc!==token.next||state.hintCaller||state.choicePreview||JSON.stringify(decodeSystem(token))!==JSON.stringify({type:1,code:255}))throw Error('428 system return requires its source event');
  const address=SNS+script.sns_offset+token.offset;
  if(p.read(address,1)!==0xc0||p.read(address+1,1)!==2||p.read(address+2,1)!==1||p.read(address+3,1)!==255)throw Error('428 ending system source mismatch');
  if(state.ending){
   const ending=state.ending,record=script.tokens.find(t=>t.id===ending.id);
   if(record?.code!==0x62||record.next!==token.offset||record.args.length!==3||record.args[0]!==1||ending.type!==1||ending.label!==state.label||ending.index!==((record.args[1]<<8)|record.args[2])-1||ending.index<0||ending.index>95||state.flags[400+ending.index]!==1)throw Error('428 system return requires its source ending record');
   const mark=SNS+script.sns_offset+record.offset;
   if(p.read(mark,1)!==0x62||p.read(mark+1,1)!==3||record.args.some((v,n)=>p.read(mark+2+n,1)!==v))throw Error('428 system ending record mismatch');
  }
 }
 function endingSource(state,phase){
  const event=state.pending,script=scripts[state.script],token=script?.tokens.find(t=>t.id===event?.id),ending=state.ending;
  const record=script?.tokens.find(t=>t.id===ending?.id);
  if(event?.kind!==phase||token?.code!==0xac||token.args.length||state.pc!==token.next||
   record?.code!==0x62||record.next>token.offset||record.args.length!==3||record.args[0]!==1||
   ending.type!==1||ending.label!==state.label||ending.index!==((record.args[1]<<8)|record.args[2])-1||
   ending.index<0||ending.index>95||state.flags[400+ending.index]!==1||state.hintCaller||state.choicePreview)
    throw Error('428 ending controller requires its source bad-ending record');
  const address=SNS+script.sns_offset+token.offset,mark=SNS+script.sns_offset+record.offset;
  if(p.read(address,1)!==0xac||p.read(address+1,1)!==0||p.read(mark,1)!==0x62||p.read(mark+1,1)!==3||record.args.some((v,n)=>p.read(mark+2+n,1)!==v))throw Error('428 ending controller source mismatch');
  return {event,token,address};
 }
 function collect(context){
  for(let n=0;n<graph.bytes.length;n++)graph.bytes[n]=p.read(graphBase+n,1);
  const progress=graph.snapshot();graph.restore(progress);
  context.restore({...context.snapshot(),character:p.read(E+0x29ccc),hour:p.read(E+0x29cd0),
   restarts:Array.from({length:11},(_,n)=>p.string(E+0x299e9+n*32,33)||null),clocks:Array.from({length:11},(_,n)=>p.read(E+0x29bea+n*2,2))});
  return {progress,flow:collectFlow(),context:context.snapshot(),flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1))};
 }
 function hourBinding(state,progress,context){return JSON.stringify({script:state.script,label:state.label,flags:state.flags,flow:state.flow,progress,context});}
 function navigation(state,progress,snapshot,tutorialsEnabled){
  const context=hydrate(state,progress,snapshot),current=context.current(),event=state.pending,N=E+0x26000;
  if(typeof tutorialsEnabled!=='boolean'||event?.kind!=='navigation'||state.endingController?.phase!=='navigation'||
   !(current.hour===0&&current.character<=1||current.hour===1&&current.character<=4&&state.endingController.source==='hour-intro')||event.character!==current.character||event.minutes!==snapshot.clocks[current.character])
    throw Error('428 verified source navigation context required');
  // Ordinary constructor inputs, excluding all movie/bonus-menu variants. The
  // actual menu builder and tutorial restrictions determine offered selections.
  for(let n=0;n<0x43c;n++)p.write(N+n,0,1);
  p.write(N+0x414,event.minutes);p.write(N+0x418,current.character);p.write(N+0x2a,Number(tutorialsEnabled),1);
  p.call(0x88be3b4,[N],200000);
  const options=[];
  for(let n=0;n<5;n++){
   const at=0x9ef2de0+n*32,sourceId=p.read(at);if(sourceId===255)continue;
   if(sourceId>9)throw Error('428 navigation character bound');
   const character=p.read(0x89ac918+sourceId*4),available=!!p.read(at+8,1);
   if(character>10)throw Error('428 navigation source mapping');
   options.push({index:n,sourceId,character,available,completed:!!p.read(at+9,1),
    selectable:available&&!!p.call(0x88c4388,[N,sourceId],20000).value});
  }
  return {context,options};
 }
 const tutorialRequests=new WeakMap();
 const jumpTutorialRequests=new WeakMap();
 function jumpBinding(state,progress,context){return JSON.stringify({script:state.script,pc:state.pc,label:state.label,id:state.pending?.id,flags:state.flags,flow:state.flow,tips:state.tips,readPosition:state.readPosition,progress,context});}
 function requireJump(state,progress,context){
  if(state.pending?.kind!=='jumpDialog'||!jumpSession||jumpSession.binding!==jumpBinding(state,progress,context))throw Error('428 JUMP transaction no longer matches its source');
 }
 function jumpResult(state,context){
  const result=collect(context),dialog={...jumpSession.view,tutorial:jumpTutorial,phase:p.read(D+0x6c)};
  jumpSession.view=dialog;jumpSession.binding=jumpBinding({...state,flags:result.flags,flow:result.flow},result.progress,result.context);
  return {...result,dialog};
 }
 function timelineBinding(state,progress,context){return JSON.stringify({script:state.script,pc:state.pc,label:state.label,id:state.pending?.id,flags:state.flags,flow:state.flow,progress,context});}
 function requireTimeline(state,progress,context){
  if(state.pending?.kind!=='timeline'||!timelineSession||timelineSession.binding!==timelineBinding(state,progress,context))throw Error('428 timeline transaction no longer matches its source');
 }
 function stepTimelineTutorials(){
  for(let n=0;n<8&&timelineTutorial===null&&p.read(TIMELINE+0x244)!==3;n++)p.call(0x88cf97c,[TIMELINE],200000);
  if(timelineTutorial===null&&p.read(TIMELINE+0x244)!==3)throw Error('428 timeline tutorial phase');
 }
 function timelineResult(state,context){
  const result=collect(context),timeline={...timelineSession.view,tutorial:timelineTutorial,target:p.read(TIMELINE+0x1447c)};
  timeline.selectable=[];
  if(timelineTutorial===null)for(const row of timeline.entries){
   if(!row.label.endsWith('_RESTART')||timeline.target&&row.id!==timeline.target)continue;
   const memory=mutable();
   try{
    if(!positionTimelineRow(row))continue;
    if(p.call(0x88d2c18,[TIMELINE]).value!==1)continue;
    timelineConfirm=true;p.call(0x88d0bac,[TIMELINE],20000);
    if(p.read(TIMELINE+0x244)===2&&p.read(TIMELINE+0x248)===7)timeline.selectable.push(row.id);
   }finally{timelineConfirm=false;restoreMemory(memory);}
  }
  timelineSession.view=timeline;
  timelineSession.binding=timelineBinding({...state,flags:result.flags,flow:result.flow},result.progress,result.context);
  return {...result,timeline};
 }
 function positionTimelineRow(row){
  const N=TIMELINE;p.write(N+0x14120,row.lane);p.write(N+0x14124,row.rank);p.call(0x88d0554,[N],20000);
  const count=p.read(N+0x140e8);if(count>6)throw Error('428 timeline cell bound');
  const index=Array.from({length:count},(_,n)=>p.read(N+0x140ec+n*4)).indexOf(row.id);
  // The original cell builder can collapse several source rows into one
  // selectable entry. A visible history row need not be an input target.
  if(index<0)return false;p.write(N+0x14138,index);return true;
 }
 function initializeTimeline(state,context,mode){
    const N=TIMELINE;
    p.segments.find(s=>s.address===N).bytes.fill(0);
    p.write(N+0x238,mode);p.call(0x88cd37c,[N],2000000);
    // The host completes its opening transition before presenting tutorials.
    // Native tutorial and input gates remain mandatory.
    p.write(N+0x244,2);
    const count=p.read(N+0x1228);if(count>=flow.count)throw Error('428 timeline row count');
    const entries=Array.from({length:count},(_,n)=>{
      const id=p.read(N+0x8a0+n*2,2);if(id<1||id>=flow.count)throw Error('428 timeline row identity');
      const at=FLOW_ROWS+id*480,label=p.string(at+34,34);
      if(p.read(at+0x1c3,1)!==1||!context.labels.has(label))throw Error('428 timeline exposes an unavailable row');
      return {id,label,lane:p.read(at+0x198,1),hour:p.read(at+0x19b,1),minute:p.read(at+0x19c,1),rank:p.read(at+0x1ca,2),order:p.read(at+0x1c4,2)};
    });
    const selected=p.read(N+0x14458);
    if(!entries.some(e=>e.id===selected))throw Error('428 timeline has no earned current row');
    timelineSession={mode,view:{entries,selected,mode}};timelineTutorial=null;timelineLastTutorial=null;
    stepTimelineTutorials();return timelineResult(state,context);
 }
 const api=Object.freeze({
  // Internal source metadata, not a UI list of available characters/scenes.
  contextData(){return structuredClone(contextData);},
  initialFlow(){return new Shibuya428FlowState(identities.flo,flow.count).snapshot();},
  jumpAvailable(state,progress,snapshot,id){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const source=scripts[state.script],token=source?.tokens.find(t=>t.id===id);
    if(token?.code!==0x70||token.next!==state.pc||state.pending||state.choicePreview||state.hintCaller)throw Error('428 JUMP requires its source span');
    const link=decodeLink(token),address=SNS+source.sns_offset+token.offset;
    if(link.mode!==0||link.clauses.some(c=>'constant'in c)||p.read(address,1)!==0x70||p.read(address+1,1)!==token.args.length||token.args.some((v,n)=>p.read(address+2+n,1)!==v))throw Error('Unsupported 428 JUMP operands');
    hydrate(state,progress,snapshot);
    const target=pointers.get(`${link.target.script}:${link.target.label}`);if(!target)throw Error('428 JUMP target mismatch');
    return evaluate(link.clauses,state.flags)&&!!p.call(0x8875cb4,[E,target],2000000).value;
   }finally{restoreMemory(backup);graph.bytes.set(previous);}
  },
  checkpointFlow(state){
   const backup=mutable();
   try{
    const script=scripts[state.script],token=script?.tokens.find(t=>t.next===state.pc),label=graph.labels[graph.id(state.label)];
    if(token?.code!==0x22||state.mode!=='story'||state.stack?.length||state.choicePreview||!state.flow||label.script!==state.script||label.offset!==token.offset)throw Error('428 flow requires an ordinary source checkpoint');
    const at=SNS+script.sns_offset+token.offset;
    if(p.read(at,1)!==0x22||p.read(at+1,1)!==token.args.length||token.args.some((v,n)=>p.read(at+2+n,1)!==v))throw Error('428 flow source checkpoint mismatch');
    restoreFlow(state.flow);p.call(0x8955d74,[pointers.get(state.label)],200000);
    return collectFlow();
   }catch(error){restoreMemory(backup);throw error;}
  },
  // Opaque in-memory transactions only. This is not a portable reader save.
  checkpoint(){const token=Object.freeze({});checkpoints.set(token,{memory:mutable(),graph:graph.bytes.slice(),timelineSession:structuredClone(timelineSession),timelineTutorial,timelineLastTutorial,jumpSession:structuredClone(jumpSession),jumpTutorial,tipSession:structuredClone(tipSession),hourSession:structuredClone(hourSession)});return token;},
  restore(token){const saved=checkpoints.get(token);if(!saved)throw Error('428 progress foreign checkpoint');restoreMemory(saved.memory);graph.bytes.set(saved.graph);timelineSession=structuredClone(saved.timelineSession);timelineTutorial=saved.timelineTutorial;timelineLastTutorial=saved.timelineLastTutorial;jumpSession=structuredClone(saved.jumpSession);jumpTutorial=saved.jumpTutorial;tipSession=structuredClone(saved.tipSession);hourSession=structuredClone(saved.hourSession);},
  openTip(state,progress,snapshot,index){
   const before=this.checkpoint();
   try{
    const source=scripts[state.script],boundary=source?.tokens.find(t=>t.next===state.pc),span=state.tips?.[index],token=source?.tokens.find(t=>t.id===span?.id);
    if(tipSession||state.pending?.kind!=='text'||boundary?.code!==0x1e||state.tipCaller||state.hintCaller||state.choicePreview||state.openTip||state.ruby||state.stack.length||!Number.isInteger(index)||!span||span.jump||span.hint||token?.code!==0x6c||state.tips.length>8||state.readPosition?.script!==state.script||state.readPosition.pc!==state.pc)throw Error('428 TIP requires an ordinary source text boundary');
    const link=decodeLink(token);
    if(link.mode!==0||link.field!==65535||link.target.script!==33||JSON.stringify(link.target)!==JSON.stringify(span.target)||span.start<0||span.end<=span.start||span.end>state.text.length||token.next>=state.pc)throw Error('428 TIP source span mismatch');
    for(const t of [boundary,token]){const at=SNS+source.sns_offset+t.offset;if(p.read(at,1)!==t.code||p.read(at+1,1)!==t.args.length||t.args.some((v,n)=>p.read(at+2+n,1)!==v))throw Error('428 TIP source bytes mismatch');}
    const context=hydrate(state,progress,snapshot),target=`${link.target.script}:${link.target.label}`;
    if(!pointers.has(target))throw Error('428 TIP target is outside source');
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff4c,100,2);
    p.write(E+0x130c,state.pc-source.content_offset);p.write(E+0x29cb0,9);p.write(E+0x29cb4,5);
    p.write(E+0x2ef4,1);p.write(E+0x2ef8,0);p.write(E+0x2efc,0);p.write(E+0x2f00,1,1);p.write(E+0x2f08,0);
    p.write(E+0x4e4,E+0x22000);p.write(E+0x4e8,E+0x22100);p.write(R+0x3c,V);
    p.write(E+0x29c60,state.systemController?.type??0);p.write(E+0x29c64,state.systemController?.code??0);p.write(E+0x29c68,Number(state.systemController?.active??false),1);
    // Pointer input selects this existing span. Native availability and entry
    // still run; these five values are selection highlight geometry only.
    const at=E+0x2840;p.write(at,pointers.get(target));p.write(at+4,link.target.script);[100,1180,450,700,450].forEach((v,n)=>p.write(at+8+n*4,v));p.write(at+28,1);
    tipInput=true;tipKey=12;p.call(0x886f540,[E],200000);
    if(p.read(E+0x29cb0)!==11||p.read(E+0x29cb4)!==9)throw Error('428 TIP source input was not admitted');
    tipKey=7;p.call(0x8881604,[E+0x2830],200000);
    if(p.read(E+0x29cb0)!==5||p.read(E+0x2f08)!==1||p.read(E+0x2efc)!==1)throw Error('428 TIP entry controller mismatch');
    // Original task-start callback resets the overlay phase on every open,
    // including reuse of this bounded host object after a previous close.
    p.call(0x88f9058,[TIP],200000);
    p.write(TIP+0x44,TIP+0x200);p.write(TIP+0x200,TIP+0x300);p.write(TIP+0x3f0,0xf000000c);
    tipKey=0;for(let n=0;n<2;n++)p.call(0x88fb3d4,[TIP],200000);
    if(p.read(TIP+0xd8)!==4)throw Error('428 TIP opening phase');
    const key=JSON.stringify({script:state.script,pc:state.pc,label:state.label,link:token.id});
    tipSession={key,caller:structuredClone(state),target,replay:1,phase:'body'};
    return {...collect(context),key,script:p.read(E+0xc),label:target,pc:p.read(E+0x14)-SNS-scripts[p.read(E+0xc)].sns_offset};
   }catch(error){this.restore(before);throw error;}finally{tipInput=false;tipKey=0;}
  },
  tipStep(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    const t=scripts[state.script]?.tokens.find(t=>t.id===state.pending?.id);
    if(!tipSession||state.tipCaller!==tipSession.key||tipSession.phase!=='body'||state.pending?.kind!=='tipControl'||state.label!==tipSession.target||state.pc!==t?.next||![0x22,0x1f,0x5a,0xbb,0x6f].includes(t.code))throw Error('428 TIP source controller mismatch');
    const at=SNS+scripts[state.script].sns_offset+t.offset;
    if(p.read(at,1)!==t.code||p.read(at+1,1)!==t.args.length||t.args.some((v,n)=>p.read(at+2+n,1)!==v)||t.code===0x22&&t.args[0]!==0)throw Error('428 TIP control operands');
    // Only this owned TIP transaction admits calls, each entered/returned by
    // original SNS handlers below. Ordinary progress replay still rejects them.
    if(state.stack.length!==p.read(E+0x271c)||state.stack.length>8)throw Error('428 TIP call stack mismatch');
    for(const [n,frame]of state.stack.entries()){
      const a=E+0x2698+n*16;
      if(frame.script!==p.read(a)||graph.id(frame.label)!==p.read(a+4)||frame.pc-scripts[frame.script].content_offset!==p.read(a+8))throw Error('428 TIP caller frame mismatch');
    }
    if(t.code===0x5a&&state.stack.length===8||t.code===0xbb&&!state.stack.length||[0x1f,0x6f].includes(t.code)&&state.stack.length)throw Error('428 TIP unsupported call boundary');
    const context=hydrate({...state,stack:[]},progress,snapshot);p.write(E+0x2804,tipSession.replay,1);p.write(E+0x14,at+1);p.write(E+0x2ff00,t.code);
    p.call(p.read(0x89c090c+t.code*8),[],2000000);tipSession.replay=p.read(E+0x2804,1);
    const result=collect(context);if(JSON.stringify(result.context)!==JSON.stringify(snapshot))throw Error('428 TIP changed story context');
    if([0x5a,0xbb].includes(t.code))return {...result,phase:t.code===0x5a?'call':'callReturn',script:p.read(E+0xc),pc:p.read(E+0x14)-SNS-scripts[p.read(E+0xc)].sns_offset};
    if(t.code===0x22){if(p.read(E+0x29cb0)!==5)throw Error('428 TIP checkpoint stop');return {...result,phase:state.stack.length?'callCheckpoint':'checkpoint'};}
    if(t.code===0x1f){if(p.read(E+0x29cb0)!==9||tipSession.replay!==0)throw Error('428 TIP boundary stop');tipSession.phase='wait';return {...result,phase:'wait'};}
    if(p.read(E+0x2efc)!==0||p.read(E+0x2f08)!==0||p.read(E+0x29cb0)!==5)throw Error('428 TIP return controller');
    const caller=tipSession.caller,pc=p.read(E+0x14)-SNS-scripts[caller.script].sns_offset;
    if(p.read(E+0xc)!==caller.script||graph.id(caller.label)!==p.read(E+0x10)||pc!==graph.labels[graph.id(caller.label)].offset||p.read(E+0x130c)!==caller.readPosition.pc-scripts[caller.script].content_offset)throw Error('428 TIP caller return mismatch');
    tipSession.phase='replay';return {...result,phase:'return',caller:structuredClone(caller),pc};
   }catch(error){this.restore(before);throw error;}
  },
  beginTipClose(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(!tipSession||state.tipCaller!==tipSession.key||tipSession.phase!=='wait'||state.pending?.kind!=='tip'||state.label!==tipSession.target)throw Error('428 TIP has no completed page');
    const context=hydrate(state,progress,snapshot);tipInput=true;tipKey=7;
    p.call(0x886f540,[E],200000);if(p.read(E+0x29cb0)!==47)throw Error('428 TIP close input was not admitted');
    tipKey=0;p.call(0x88fb3d4,[TIP],200000);if(p.read(TIP+0xd8)!==6)throw Error('428 TIP closing phase');
    tipSession.phase='closing';return collect(context);
   }catch(error){this.restore(before);throw error;}finally{tipInput=false;tipKey=0;}
  },
  finishTipClose(state){
   const before=this.checkpoint();
   try{
    if(!tipSession||state.tipCaller!==tipSession.key||tipSession.phase!=='closing'||state.pending?.kind!=='tipClose')throw Error('428 TIP close presentation must be acknowledged');
    for(let n=0;n<4&&p.read(E+0x29cb0)!==5;n++)p.call(0x88fb3d4,[TIP],200000);
    if(p.read(E+0x29cb0)!==5||p.read(TIP+0xd8)!==8)throw Error('428 TIP close completion');tipSession.phase='body';
   }catch(error){this.restore(before);throw error;}
  },
  finishTipReplay(state){
   if(!tipSession||tipSession.phase!=='replay'||state.pending?.kind!=='tipResume'||state.tipCaller!==tipSession.key||state.script!==tipSession.caller.script||state.pc!==tipSession.caller.pc||state.label!==tipSession.caller.label||state.text!==tipSession.caller.text)throw Error('428 TIP caller page was not rebuilt');
   const caller=structuredClone(tipSession.caller);tipSession=null;return caller.pending;
  },
  openJump(state,progress,snapshot,index,tutorialsEnabled){
   const before=this.checkpoint();
   try{
    const source=scripts[state.script],token=source?.tokens.find(t=>t.id===state.pending?.id);
    if(state.pending?.kind!=='linkSelection'||token?.code!==0xc0||state.pc!==token.next||JSON.stringify(decodeSystem(token))!==JSON.stringify({type:2,code:14})||!state.flags[0x44e]||state.hintCaller||state.choicePreview||state.openTip||state.ruby||!state.readPosition||state.readPosition.script!==state.script||state.readPosition.pc!==state.pc||typeof tutorialsEnabled!=='boolean'||!Number.isInteger(index)||!state.tips?.[index]?.jump||state.tips.length>8)throw Error('428 JUMP requires completed source link selection');
    const at=SNS+source.sns_offset+token.offset;
    if(p.read(at,1)!==0xc0||p.read(at+1,1)!==2||p.read(at+2,1)!==2||p.read(at+3,1)!==14)throw Error('428 JUMP source request mismatch');
    const links=state.tips.map(l=>{
     const t=source.tokens.find(t=>t.id===l.id),link=t&&decodeLink(t);
     if(![0x6c,0x70].includes(t?.code)||t.next>=state.pc||!!l.jump!==(t.code===0x70)||JSON.stringify(l.target)!==JSON.stringify(link.target)||!Number.isInteger(l.start)||!Number.isInteger(l.end)||l.start<0||l.end<=l.start||l.end>state.text.length)throw Error('428 JUMP source link mismatch');
     const at=SNS+source.sns_offset+t.offset;
     if(p.read(at,1)!==t.code||p.read(at+1,1)!==t.args.length||t.args.some((v,n)=>p.read(at+2+n,1)!==v))throw Error('428 JUMP source link bytes mismatch');
     if(l.jump&&(link.mode!==0||link.flag!==l.flag||link.field!==l.field||this.jumpAvailable({...state,pc:t.next,pending:null},progress,snapshot,t.id)!==l.available))throw Error('428 JUMP availability changed');
     return {...link,jump:!!l.jump,available:l.available};
    });
    const context=hydrate(state,progress,snapshot),link=links[index];
    if(context.current().character>6||link.target.script>=30)throw Error('428 bonus JUMP controller is not implemented');
    for(let n=0;n<0x500;n++)p.write(D+n,0,1);
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff50,Number(tutorialsEnabled),1);p.write(E+0x2ff4c,100,2);
    p.write(E+0x130c,state.readPosition.pc-source.content_offset);p.write(E+0x29cb0,11);p.write(E+0x29cb4,5);
    p.write(E+0x2ef4,links.length);p.write(E+0x2ef8,index);p.write(E+0x2efc,0);p.write(E+0x2f00,1,1);
    p.write(E+0x4e4,E+0x22000);p.write(E+0x4e8,E+0x22100);
    for(const [n,l]of links.entries()){
     const at=E+0x2840+n*52;p.write(at,pointers.get(`${l.target.script}:${l.target.label}`));p.write(at+4,l.target.script);
     // Layout affects only selection highlight geometry, never source targets.
     [100,1180,450,700,450].forEach((v,i)=>p.write(at+8+i*4,v));p.write(at+28,l.jump?2:1);
     if(l.jump){p.write(at+36,l.field);p.write(at+40,l.flag);p.write(at+48,Number(l.available),1);}
    }
    jumpOpening=true;jumpKey=7;jumpTutorial=null;
    p.call(0x8881604,[E+0x2830],200000);
    if(p.read(E+0x29cb0)!==31||p.read(E+0x2f08)!==2||p.read(D+0x98)>6)throw Error('Unsupported native JUMP selection');
    jumpKey=0;p.call(0x8902f38,[D],200000);
    if(![2,10].includes(p.read(D+0x6c)))throw Error('428 JUMP dialog opening mismatch');
    jumpSession={view:{index,available:!!p.read(D+0x68,1),fromCharacter:p.read(D+0x90),toCharacter:p.read(D+0x98),fromMinutes:p.read(D+0x7c)*60+p.read(D+0x80),toMinutes:p.read(D+0x84)*60+p.read(D+0x88)}};
    return jumpResult(state,context);
   }catch(error){this.restore(before);throw error;}
   finally{jumpOpening=false;jumpKey=0;}
  },
  jumpTutorialRequest(state,progress,snapshot){
   requireJump(state,progress,snapshot);if(jumpTutorial===null)throw Error('428 JUMP has no pending tutorial');
   const request=Object.freeze({kind:'jumpTutorial',code:jumpTutorial});jumpTutorialRequests.set(request,{binding:jumpSession.binding,code:jumpTutorial,flags:JSON.stringify(state.flags)});return request;
  },
  validateJumpTutorial(request,flags){
   const record=jumpTutorialRequests.get(request);
   if(!record||!jumpSession||record.binding!==jumpSession.binding||record.code!==jumpTutorial||record.flags!==JSON.stringify(flags))throw Error('428 foreign or stale JUMP tutorial');return record.code;
  },
  finishJumpTutorial(state,progress,snapshot,request,flags){
   const before=this.checkpoint();
   try{
    requireJump(state,progress,snapshot);const code=this.validateJumpTutorial(request,state.flags);
    if(!Array.isArray(flags)||flags.length!==2048||flags[0x400+code]!==1||flags.some((v,i)=>i!==0x400+code&&v!==state.flags[i]))throw Error('428 JUMP tutorial changed unexpected flags');
    flags.forEach((v,n)=>p.write(E+0x1660+n,v,1));jumpTutorial=null;jumpOpening=true;
    p.call(0x8902f38,[D],200000);if(p.read(D+0x6c)!==2||p.read(E+0x1660+0x440+code,1)!==1)throw Error('428 JUMP tutorial continuation mismatch');
    const context=new Shibuya428Context(contextData);context.restore(snapshot);return jumpResult(state,context);
   }catch(error){this.restore(before);throw error;}finally{jumpOpening=false;}
  },
  decideJump(state,progress,snapshot,confirm){
   const before=this.checkpoint();
   try{
    requireJump(state,progress,snapshot);
    if(typeof confirm!=='boolean'||jumpTutorial!==null||p.read(D+0x6c)!==2||confirm&&!p.read(D+0x68,1))throw Error('428 JUMP decision is unavailable');
    jumpOpening=true;jumpKey=confirm?4:5;p.call(0x8902f38,[D],200000);jumpKey=0;
    if(p.read(D+0x6c)!==(confirm?4:3))throw Error('428 JUMP decision phase mismatch');
    const context=new Shibuya428Context(contextData);context.restore(snapshot);const result=jumpResult(state,context);
    return {...result,transition:{confirm,frames:confirm?30:0}};
   }catch(error){this.restore(before);throw error;}finally{jumpOpening=false;jumpKey=0;}
  },
  finishJumpTransition(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(state.pending?.kind!=='jumpTransition'||!jumpSession||jumpSession.binding!==jumpBinding(state,progress,snapshot)||![3,4].includes(p.read(D+0x6c)))throw Error('428 JUMP requires acknowledged transition');
    const confirm=!!p.read(D+0x69,1),context=new Shibuya428Context(contextData);context.restore(snapshot);
    jumpOpening=true;jumpTimelineOpening=true;timelineCreated=false;
    let alive=1;
    for(let n=0;n<32&&alive&&!timelineCreated;n++)alive=p.call(0x8902f38,[D],200000).value;
    if(confirm){
     if(!timelineCreated||p.read(D+0x6c)!==5)throw Error('428 JUMP timeline request mismatch');
     jumpOpening=false;return initializeTimeline(state,context,3);
    }
    if(alive||p.read(E+0x29cb0)!==63||p.read(E+0x29c60)!==2||p.read(E+0x29c64)!==14)throw Error('428 JUMP cancel continuation is not implemented');
    jumpSession=null;return {...collect(context),cancelled:true};
   }catch(error){this.restore(before);throw error;}finally{jumpOpening=false;jumpTimelineOpening=false;timelineCreated=false;}
  },
  beginTimelinePause(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const event=state.pending,source=scripts[state.script],token=source?.tokens.find(t=>t.id===event?.id);
    if(event?.kind!=='menuRequest'||event.menu!==4||token?.code!==0xc0||state.pc!==token.next||
     JSON.stringify(decodeSystem(token))!==JSON.stringify({type:2,code:9})||state.flags[0x449]!==1||
     state.systemController?.type!==2||state.systemController.code!==9||state.systemController.active||state.hintCaller||state.choicePreview)
      throw Error('428 timeline requires the completed source tutorial request');
    const address=SNS+source.sns_offset+token.offset;
    if(p.read(address,1)!==0xc0||p.read(address+1,1)!==2||p.read(address+2,1)!==2||p.read(address+3,1)!==9)throw Error('428 timeline source mismatch');
    const context=hydrate(state,progress,snapshot);
    if(context.current().hour!==0||context.current().character!==1)throw Error('428 later timeline context is not implemented');
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff50,1,1);p.write(E+0x29cb0,5);
    p.write(E+0x29c60,2);p.write(E+0x29c64,9);p.write(E+0x29c70,E+0x2e000);
    // The prompt object is owned by the tutorial kernel; its thread deletion
    // and media pause requests are acknowledged by the presentation layer.
    p.write(E+0x29c19,0,1);p.write(E+0x163c,0,1);p.write(E+0x163d,0,1);p.write(0x9ef2ebd,0,1);
    menuCallbacks=[];p.call(0x88718a8,[E,4],200000);
    if(p.read(E+0x29cb0)!==18||p.read(E+8)!==4||p.read(E+0x29cb4)!==5||p.read(E+0x604)!==3||
     JSON.stringify(menuCallbacks)!==JSON.stringify([
      {address:0x883e644,args:[1,6,16]},{address:0x8843c74,args:[1,16]},{address:0x8848708,args:[1,16]}]))throw Error('428 timeline pause dispatch mismatch');
    return {...collect(context),pause:{frames:16,menu:4,returnController:5}};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
   finally{menuCallbacks=null;}
  },
  openTimeline(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const event=state.pending,menu=state.menuController;
    if(event?.kind!=='menuPaused'||event.menu!==4||menu?.menu!==4||menu.returnController!==5||menu.frames!==16||![0,1].includes(menu.freeMovieChannel)||!state.flow)
      throw Error('428 timeline requires acknowledged source media pause, free streaming channel and flow history');
    this.beginTimelinePause({...state,pending:{...event,kind:'menuRequest'}},progress,snapshot);
    const context=new Shibuya428Context(contextData);context.restore(snapshot);
    menuFreeMovieChannel=menu.freeMovieChannel;timelineCreated=false;
    p.call(0x88711f0,[E],20000);
    if(p.read(E+0x29cb0)!==29)throw Error('428 timeline media acknowledgement mismatch');
    p.call(0x8871bc4,[E],10000000);
    if(p.read(E+0x29cb0)!==30||!timelineCreated)throw Error('428 timeline entry mismatch');
    return initializeTimeline(state,context,0);
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);timelineSession=null;timelineTutorial=null;timelineLastTutorial=null;throw error;}
   finally{menuFreeMovieChannel=1;timelineCreated=false;}
  },
  openNavigationTimeline(state,progress,snapshot,tutorialsEnabled){
   const before=this.checkpoint();
   try{
    endingSystemSource(state,'navigationTimeline');
    if(state.endingController?.phase!=='navigation'||state.pending.timeline!==true||typeof tutorialsEnabled!=='boolean'||snapshot.hour!==0||snapshot.character>1||state.pending.character!==snapshot.character||state.pending.minutes!==snapshot.clocks[snapshot.character])throw Error('428 automatic timeline requires its source return');
    const context=hydrate(state,progress,snapshot),C=E+0x26000;
    for(let n=0;n<0x43c;n++)p.write(C+n,0,1);
    p.write(C+0x27,1,1);p.write(C+0x414,state.pending.minutes);p.write(C+0x418,snapshot.character);p.write(C+0x2a,Number(tutorialsEnabled),1);
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff50,Number(tutorialsEnabled),1);p.write(E+0x608,0xffffffff);
    navigationTimelineOpening=true;timelineCreated=false;
    p.call(0x88bc9cc,[C],200000);if(p.read(C+0x34)!==8)throw Error('428 automatic timeline opening phase');
    p.call(0x88bc9cc,[C],200000);if(!timelineCreated||p.read(C+0x34)!==9)throw Error('428 automatic timeline request mismatch');
    return initializeTimeline(state,context,4);
   }catch(error){this.restore(before);throw error;}
   finally{navigationTimelineOpening=false;timelineCreated=false;}
  },
  timelineTutorialRequest(state,progress,snapshot){
   requireTimeline(state,progress,snapshot);
   if(timelineTutorial===null)throw Error('428 timeline has no pending tutorial');
   const request=Object.freeze({kind:'timelineTutorial',code:timelineTutorial});
   tutorialRequests.set(request,{binding:timelineSession.binding,code:timelineTutorial,flags:JSON.stringify(state.flags)});return request;
  },
  validateTimelineTutorial(request,flags){
   const record=tutorialRequests.get(request);
   if(!record||!timelineSession||record.binding!==timelineSession.binding||record.code!==timelineTutorial||record.flags!==JSON.stringify(flags))throw Error('428 foreign or stale timeline tutorial');
   return record.code;
  },
  finishTimelineTutorial(state,progress,snapshot,request,flags){
   const before=this.checkpoint();
   try{
    requireTimeline(state,progress,snapshot);const code=this.validateTimelineTutorial(request,state.flags);
    if(!Array.isArray(flags)||flags.length!==2048||flags[0x400+code]!==1||flags.some((v,i)=>i!==0x400+code&&v!==state.flags[i]))throw Error('428 timeline tutorial changed unexpected flags');
    flags.forEach((v,n)=>p.write(E+0x1660+n,v,1));timelineLastTutorial=code;timelineTutorial=null;
    stepTimelineTutorials();const context=new Shibuya428Context(contextData);context.restore(snapshot);
    return timelineResult(state,context);
   }catch(error){this.restore(before);throw error;}
  },
  selectTimeline(state,progress,snapshot,id){
   const before=this.checkpoint();
   try{
    requireTimeline(state,progress,snapshot);
    const row=timelineSession.view.entries.find(r=>r.id===id),N=TIMELINE;
    if(timelineTutorial!==null||p.read(N+0x244)!==3||!Number.isInteger(id)||!row)throw Error('428 timeline selection is not available');
    // Tutorials still force their source target. Afterward only earned
    // restart rows admitted by the original confirmation gate are offered.
    const forced=p.read(N+0x1447c);
    if(forced&&id!==forced||!row.label.endsWith('_RESTART')||!timelineSession.view.selectable.includes(id))throw Error('428 timeline restart is not offered');
    if(!positionTimelineRow(row))throw Error('428 timeline row is not an input target');
    if(p.call(0x88d2c18,[N]).value!==1)throw Error('428 timeline native selection gate');
    timelineConfirm=true;p.call(0x88d0bac,[N],20000);timelineConfirm=false;
    if(p.read(N+0x244)!==2||p.read(N+0x248)!==7)throw Error('428 timeline requires an unsupported detail action');
    p.call(0x88d3414,[N,id],2000000);p.call(0x88d3478,[N,id],2000000);
    if(p.read(E+0x29cb0)!==19||p.read(E+0x29cd9,1)!==1)throw Error('428 timeline restart controller mismatch');
    const context=new Shibuya428Context(contextData);context.restore(snapshot);
    const result=collect(context),script=p.read(E+0xc),label=graph.labels[p.read(E+0x10)],pc=p.read(E+0x14)-SNS-scripts[script].sns_offset;
    if(!label||label.script!==script||label.offset!==pc||label.label!==row.label)throw Error('428 timeline restart source mismatch');
    const jump={script,pc,label:`${script}:${label.label}`};timelineSession.jump=jump;
    timelineSession.binding=timelineBinding({...state,...jump,flags:result.flags,flow:result.flow},result.progress,result.context);
    return {...result,...jump};
   }catch(error){this.restore(before);throw error;}
   finally{timelineConfirm=false;}
  },
  resumeTimeline(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(state.pending?.kind!=='timelineResume'||state.menuController?.phase!=='reset'||!timelineSession?.jump||timelineSession.binding!==timelineBinding(state,progress,snapshot))throw Error('428 timeline requires acknowledged presentation reset');
    if(timelineSession.mode===4){
     // Once the host has completed the transition, close the native timeline
     // and acknowledge its result to the character menu that opened it.
     p.call(0x88ccf60,[TIMELINE],20000);
     if(p.call(0x88bc9cc,[E+0x26000],20000).value!==1||p.read(0x9ef2dd8)!==2||p.string(p.read(0x9ef2ddc))!==timelineSession.jump.label.split(':').slice(1).join(':'))throw Error('428 automatic timeline return mismatch');
    }
    if(timelineSession.mode===3){
     if(!jumpSession||p.read(D+0x6c)!==5)throw Error('428 JUMP timeline lost its dialog');
     p.call(0x88ccf60,[TIMELINE],20000);
     let alive=1;for(let n=0;n<3&&alive;n++)alive=p.call(0x8902f38,[D],200000).value;
     if(alive)throw Error('428 JUMP dialog is still waiting for transition');jumpSession=null;
    }
    const dispatch={19:0x8871294,20:0x88713dc,21:0x8871590,22:0x8871608,23:0x8871664};
    let frames=0;
    // The host reset has completed, so backend readiness is acknowledged.
    // No source instructions execute during these bounded transition frames.
    while(p.read(E+0x29cb0)!==5&&frames<16){const fn=dispatch[p.read(E+0x29cb0)];if(!fn)throw Error('Unsupported timeline resume controller');p.call(fn,[E],200000);frames++;}
    if(p.read(E+0x29cb0)!==5||p.read(E+0x29cd9,1))throw Error('428 timeline resume did not finish');
    const context=new Shibuya428Context(contextData);context.restore(snapshot);const result=collect(context);
    timelineSession=null;return {...result,frames};
   }catch(error){this.restore(before);throw error;}
  },
  beginEnding(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const {address}=endingSource(state,'endingReturn'),context=hydrate(state,progress,snapshot);
    if(context.current().character>6)throw Error('428 extra-story ending controller is not implemented');
    saveRequest=null;
    p.write(E+0x608,state.ending.type);p.write(E+0x610,state.ending.index);
    p.write(E+0x14,address+1);p.write(E+0x29c19,0,1);p.write(E+0x2f28,0,1);
    p.call(0x8899b34,[],20000);
    if(p.read(E+0x29cb0)!==32)throw Error('428 ending dispatch mismatch');
    p.call(0x8872350,[E],200000);
    if(p.read(E+0x29cb0)!==33||p.read(E+0x29c18,1)!==0)throw Error('428 ending unlock/hour controller is not implemented');
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff40,1,1);
    p.call(0x8872600,[E]);
    if(p.read(E+0x29cb0)!==31||JSON.stringify(saveRequest)!==JSON.stringify([3,5,1,1,0]))throw Error('428 ending save request mismatch');
    return {...collect(context),save:{mode:'auto',reason:'ending'},reset:true};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  finishEndingSave(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const systemReturn=state.endingController?.source==='system',hourIntro=state.endingController?.source==='hour-intro';
    if(hourIntro){
     const token=scripts[state.script]?.tokens.find(token=>token.id===state.pending?.id);
     if(state.pending?.kind!=='endingSaved'||state.endingController.status!==8||snapshot.hour!==1||snapshot.character>1||token?.code!==0xac||token.args.length||state.pc!==token.next||state.stack.length||!state.flags[300]||!state.flags[301]||!pointers.has(state.label))throw Error('428 source hour-intro save completion required');
    }else if(systemReturn){endingSystemSource(state,'endingSaved');if(state.endingController.status!==16||snapshot.hour!==0||snapshot.character>1)throw Error('428 source hour-return save completion required');}
    else endingSource(state,'endingSaved');
    const context=hydrate(state,progress,snapshot);
    if(context.current().character>6||state.endingController?.phase!=='saved')throw Error('428 source ending save completion required');
    p.write(E+0x608,1);p.write(E+0x29c18,hourIntro?8:systemReturn?16:0,1);p.write(E+0x29c44,0,1);
    p.call(0x887ea90,[E,1],20000);
    if(p.read(E+0x29cb0)!==43)throw Error('428 post-save navigation mismatch');
    // The reached Achi first-hour return replays 2,197,597 original CPU
    // instructions before requesting its timeline. Keep a finite local bound.
    navigationRequest=null;p.call(0x8873d14,[E],hourIntro?5000000:4000000);
    if(p.read(E+0x29cb0)!==44||!navigationRequest||navigationRequest[2]!==Number(systemReturn)||navigationRequest.slice(3).some(v=>v!==0))throw Error('428 navigation variant is not implemented');
    const result=collect(context),[minutes,character]=navigationRequest;
    if(character!==result.context.character||minutes!==result.context.clocks[character])throw Error('428 navigation source context mismatch');
    return {...result,navigation:{minutes,character,...(systemReturn?{timeline:true}:{})}};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  navigationOptions(state,progress,snapshot,tutorialsEnabled){
   const backup=mutable(),previous=graph.bytes.slice();
   try{const {context,options}=navigation(state,progress,snapshot,tutorialsEnabled);return {...collect(context),options};}
   catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  selectCharacter(state,progress,snapshot,tutorialsEnabled,index){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const {context,options}=navigation(state,progress,snapshot,tutorialsEnabled),selected=options.find(o=>o.index===index);
    if(!Number.isInteger(index)||!selected?.selectable||!context.snapshot().restarts[selected.character])throw Error('428 character is not offered by the source menu');
    p.call(0x8874340,[E,selected.character],200000);
    // A completed host selection is the native menu's result zero. Readiness
    // callbacks correspond to the host's separately acknowledged media reset.
    p.write(0x9ef2dd5,1,1);p.write(0x9ef2dd8,0);
    p.call(0x8874098,[E],20000);if(p.read(E+0x29cb0)!==45)throw Error('428 selection return mismatch');
    p.call(0x88742ac,[E],20000);if(p.read(E+0x29cb0)!==46)throw Error('428 selection readiness mismatch');
    p.call(0x8874320,[E],20000);if(p.read(E+0x29cb0)!==5)throw Error('428 selection resume mismatch');
    const result=collect(context),script=p.read(E+0xc),label=graph.labels[p.read(E+0x10)],pc=p.read(E+0x14)-SNS-scripts[script].sns_offset;
    if(!label||label.script!==script||label.offset!==pc||label.label!==result.context.restarts[selected.character]||result.context.character!==selected.character)
      throw Error('428 character restart mismatch');
    return {...result,script,pc,label:`${script}:${label.label}`,character:selected.character};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  finishEndingSystem(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    endingSystemSource(state,'system');if(hourSession)throw Error('428 hour transition already prepared');
    if(state.pending.plan?.type!==1||state.pending.plan.code!==255||state.pending.plan.request!==62)throw Error('428 ending system selector required');
    const context=hydrate(state,progress,snapshot),before=checkpoint();
    p.write(0x9ef1ce4,E+0x2ff40);p.write(E+0x2ff50,1,1);
    p.write(E+0x608,state.ending?.type??0xffffffff);p.write(E+0x610,state.ending?.index??0);p.write(E+0x29c6a,0,1);
    p.call(0x8877ec0,[E,1,255],20000);
    if(p.read(E+0x29cb0)!==62)throw Error('428 ending system selector mismatch');
    p.call(0x8878544,[E],20000);
    if(p.read(E+0x29cb0)!==63)throw Error('428 ending system entry mismatch');
    p.call(0x887870c,[E],200000);
    if(JSON.stringify(checkpoint())!==JSON.stringify(before))throw Error('428 hour change is not implemented');
    if(p.read(E+0x29cb0)===32){
     if(context.current().hour!==0||context.current().character>1||state.endingController||p.read(E+0x29c6a,1)!==1)throw Error('Unsupported hour-return context');
     saveRequest=null;p.call(0x8872350,[E],200000);
     if(p.read(E+0x29cb0)!==33||p.read(E+0x29c18,1)!==16)throw Error('428 hour unlock controller is not implemented');
     p.write(E+0x2ff40,1,1);p.call(0x8872600,[E],10000000);
     if(p.read(E+0x29cb0)!==31||JSON.stringify(saveRequest)!==JSON.stringify([3,5,1,1,0])||JSON.stringify(checkpoint())!==JSON.stringify(before))throw Error('428 hour-return save mismatch');
     return {...collect(context),reset:{source:'system',status:16,fadeFrames:30,save:{mode:'auto',reason:'hour-return'}}};
    }
    if(p.read(E+0x29cb0)!==5)throw Error('428 hour-completion controller is not implemented');
    const prepared={...snapshot,restarts:Array.from({length:11},(_,n)=>p.string(E+0x299e9+n*32,33)||null),clocks:Array.from({length:11},(_,n)=>p.read(E+0x29bea+n*2,2))};
    if(JSON.stringify(prepared)!==JSON.stringify(snapshot)){
     // The original selector prepares next-hour restarts before changing the
     // current hour. Keep that intermediate state in a source-bound transaction.
     if(snapshot.hour!==0||snapshot.character>1||prepared.clocks[snapshot.character]!==660||state.ending||!state.flags[300]||!state.flags[301])throw Error('Unsupported source hour preparation');
     const tail=scripts[state.script].tokens.filter(t=>t.offset>=state.pc),end=tail.findIndex(t=>t.code===0xac);
     if(end<1||end>64||tail.slice(0,end).some(t=>![0x91,0x93,0x63,0x44,0x64,0x65,0x9d,0x2d].includes(t.code)))throw Error('Unsupported prepared-hour source continuation');
     for(let n=0;n<graph.bytes.length;n++)graph.bytes[n]=p.read(graphBase+n,1);
     const result={progress:graph.snapshot(),flow:collectFlow(),context:snapshot,flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1)),system:{type:p.read(E+0x29c60),code:p.read(E+0x29c64),active:!!p.read(E+0x29c68,1)},hourPrelude:{id:state.pending.id,script:state.script,endId:tail[end].id}};
     graph.restore(result.progress);hourSession={marker:result.hourPrelude,prepared,binding:hourBinding({...state,flags:result.flags,flow:result.flow},result.progress,snapshot)};return result;
    }
    for(let n=0;n<graph.bytes.length;n++)if(graph.bytes[n]!==p.read(graphBase+n,1))throw Error('428 ending system unexpectedly changed records');
    return {flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1)),context:context.snapshot(),system:{type:p.read(E+0x29c60),code:p.read(E+0x29c64),active:!!p.read(E+0x29c68,1)}};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  beginHourReturn(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    const t=scripts[state.script]?.tokens.find(t=>t.id===state.pending?.id);
    if(state.pending?.kind!=='hourReturn'||!hourSession||JSON.stringify(state.hourPrelude)!==JSON.stringify(hourSession.marker)||t?.id!==hourSession.marker.endId||t.code!==0xac||t.args.length||state.pc!==t.next||state.stack.length||hourSession.binding!==hourBinding(state,progress,snapshot))throw Error('428 prepared hour return requires its unchanged source transaction');
    const context=hydrate(state,progress,snapshot),prepared=hourSession.prepared;
    for(let n=0;n<11;n++){const label=prepared.restarts[n]||'';for(let i=0;i<32;i++)p.write(E+0x299e9+n*32+i,label.charCodeAt(i)||0,1);p.write(E+0x29bea+n*2,prepared.clocks[n],2);}
    p.write(E+0x608,0xffffffff);p.write(E+0x14,SNS+scripts[state.script].sns_offset+t.offset+1);p.write(E+0x29c19,0,1);p.write(E+0x2f28,0,1);
    p.call(0x8899b34,[],20000);if(p.read(E+0x29cb0)!==32)throw Error('428 prepared hour return dispatch');
    p.call(0x8872350,[E],200000);
    if(p.read(E+0x29cb0)!==49||p.read(E+0x29c18,1)!==8||p.read(E+0x29cd0)!==1||p.read(E+0x29c4c)!==3)throw Error('Unsupported hour intro controller');
    const result={...collect(context),intro:{hour:1,index:1,fadeFrames:30}};
    hourSession={phase:'fade',id:state.pending.id,binding:hourBinding({...state,flags:result.flags,flow:result.flow},result.progress,result.context)};return result;
   }catch(error){this.restore(before);throw error;}
  },
  startHourIntro(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(state.pending?.kind!=='hourIntro'||hourSession?.phase!=='fade'||hourSession.id!==state.pending.id||hourSession.binding!==hourBinding(state,progress,snapshot))throw Error('428 hour intro requires its unchanged source transaction');
    hourSession.phase='loading';
    p.call(0x88776f0,[E],20000);
    if(p.read(E+0x29cb0)!==50||p.read(E+0x29c58)!==60)throw Error('428 intro loading controller mismatch');
    p.write(HOUR+0x134,2);
    for(let frame=0;frame<61;frame++){
     p.call(0x8877818,[E],20000);
     if(p.read(E+0x29cb0)!==(frame===60?51:50))throw Error('428 intro delay mismatch');
    }
    if(!hourSession.movie)throw Error('428 missing intro movie');
    hourSession.phase='playing';
    return {frames:61,script:'intro',...hourSession.movie,layer:1};
   }catch(error){this.restore(before);throw error;}
  },
  finishHourIntro(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(state.pending?.kind!=='hourIntroPlaying'||hourSession?.phase!=='playing'||hourSession.id!==state.pending.id||hourSession.binding!==hourBinding(state,progress,snapshot))throw Error('428 hour intro completion requires its unchanged source transaction');
    hourSession.ended=true;p.call(0x8877994,[E],20000);
    if(p.read(E+0x29cb0)!==52||p.read(E+0x29c4c)!==4||!hourSession.released)throw Error('428 intro completion controller mismatch');
    hourSession.phase='notice';return {controller:52};
   }catch(error){this.restore(before);throw error;}
  },
  finishHourNotice(state,progress,snapshot){
   const before=this.checkpoint();
   try{
    if(state.pending?.kind!=='hourNotice'||hourSession?.phase!=='notice'||hourSession.id!==state.pending.id||hourSession.binding!==hourBinding(state,progress,snapshot))throw Error('428 hour notice requires its unchanged source transaction');
    const context=new Shibuya428Context(contextData);context.restore(snapshot);
    p.call(0x8877ac8,[E],20000);
    if(p.read(E+0x29cb0)!==62||p.read(E+0x29c60)!==3||p.read(E+0x29c64)!==1)throw Error('428 hour notice selector mismatch');
    p.call(0x8878544,[E],20000);p.call(0x88bb338,[],20000);
    p.call(0x887870c,[E],20000);if(p.read(E+0x29cb0)!==63)throw Error('428 notification was not awaited');
    p.call(0x88bb3b0,[HOUR+0x500],20000);
    if(p.read(HOUR+0x54c)!==0||p.read(HOUR+0x52c)!==3)throw Error('428 earned unlock notification presentation is not implemented');
    if(p.call(0x88bb374,[HOUR+0x500],20000).value!==0)throw Error('428 notification task has not finished');
    p.call(0x88bb348,[HOUR+0x500],20000);p.call(0x887870c,[E],20000);
    if(p.read(E+0x29cb0)!==33)throw Error('428 hour intro save transition mismatch');
    p.write(E+0x2ff40,1,1);saveRequest=null;p.call(0x8872600,[E],200000);
    if(p.read(E+0x29cb0)!==31||JSON.stringify(saveRequest)!==JSON.stringify([3,5,1,1,0]))throw Error('428 hour intro save request mismatch');
    const result={...collect(context),save:{mode:'auto',reason:'hour-intro'}};hourSession=null;return result;
   }catch(error){this.restore(before);throw error;}
  },
  selectChoice(state,progress,snapshot,index){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const context=new Shibuya428Context(contextData);context.restore(snapshot);
    const current=context.current(),preview=state.choicePreview,event=state.pending;
    const script=scripts[state.script],token=script?.tokens.find(t=>t.id===event?.id);
    if(!current||event?.kind!=='choice'||!event.nativePreview||!preview?.done||preview.id!==event.id||
       ![0x53,0x54].includes(token?.code)||state.pc!==token.next||state.label!==preview.label||state.stack?.length||!pointers.has(state.label))
      throw Error('428 choice requires its completed source preview and context');
    const choice=decodeChoice(token),selected=choice.options[index],address=SNS+script.sns_offset+token.offset;
    if(choice.timeoutFrames||!Number.isInteger(index)||!selected||
       p.read(address,1)!==token.code||p.read(address+1,1)!==token.args.length||token.args.some((v,n)=>p.read(address+2+n,1)!==v)||
       JSON.stringify(choice.options.map(o=>[o.index,o.script,o.label]))!==JSON.stringify(event.options.map(o=>[o.index,o.script,o.label])))
      throw Error('428 choice source operands or selection mismatch');
    if(!Array.isArray(state.flags)||state.flags.length!==2048||state.flags.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('428 choice flag bank');
    graph.restore(progress);if(state.flow)restoreFlow(state.flow);
    for(let n=0;n<graph.bytes.length;n++)p.write(graphBase+n,graph.bytes[n],1);
    state.flags.forEach((v,n)=>p.write(E+0x1660+n,v,1));
    p.write(E+0xc,state.script);p.write(E+0x10,graph.id(state.label));p.write(E+0x14,SNS+script.sns_offset+state.pc);
    p.write(E+0x29ccc,current.character);p.write(E+0x29cd0,current.hour);p.write(E+0x2804,0,1);
    p.write(E+0x27c4,0xffffffff);p.write(E+0x27cc,0,1);
    const saved=context.snapshot();
    for(let n=0;n<11;n++){
     const label=saved.restarts[n]||'';
     for(let i=0;i<32;i++)p.write(E+0x299e9+n*32+i,label.charCodeAt(i)||0,1);
     p.write(E+0x29bea+n*2,saved.clocks[n],2);
    }
    p.write(E+0x12f8,choice.options.length);p.write(E+0x15bc,index);
    p.write(E+0x1310,0,1);p.write(E+0x1654,Number(token.code===0x54),1);
    for(const o of choice.options){const pointer=pointers.get(`${o.script}:${o.label}`);if(!pointer)throw Error('428 choice target mismatch');p.write(E+0x1314+o.index*4,pointer);p.write(E+0x133c+o.index*4,o.script);}
    const run=p.call(0x8870c58,[E]);
    const label=`${selected.script}:${selected.label}`,pc=scripts[selected.script].labels[selected.label].offset;
    if(p.read(E+0xc)!==selected.script||p.read(E+0x10)!==graph.id(label)||p.read(E+0x14)!==SNS+scripts[selected.script].sns_offset+pc||p.read(E+0x29cb0)!==5)
      throw Error('428 choice changed its expected source target');
    for(let n=0;n<graph.bytes.length;n++)graph.bytes[n]=p.read(graphBase+n,1);
    const result=graph.snapshot();graph.restore(result);
    context.restore({...saved,restarts:Array.from({length:11},(_,n)=>p.string(E+0x299e9+n*32,33)||null),clocks:Array.from({length:11},(_,n)=>p.read(E+0x29bea+n*2,2))});
    return {script:selected.script,pc,label,progress:result,flow:collectFlow(),context:context.snapshot(),flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1)),steps:run.steps};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
  // Supply the compact context earned by source checkpoints instead of a
  // hand-selected character/hour pair. This still does not implement the
  // checkpoint's presentation, KEEP OUT controller or complete reader saves.
  recomputeWithContext(state,progress,snapshot){
   const backup=mutable(),previous=graph.bytes.slice();
   try{
    const context=new Shibuya428Context(contextData);context.restore(snapshot);
    const current=context.current();if(!current)throw Error('428 progress has no source checkpoint context');
    const saved=context.snapshot();
    for(let n=0;n<11;n++){
     const label=saved.restarts[n]||'';
     for(let at=0;at<32;at++)p.write(E+0x299e9+n*32+at,label.charCodeAt(at)||0,1);
     p.write(E+0x29bea+n*2,saved.clocks[n],2);
    }
    const result=this.recompute(state,progress,current);
    const next={...saved,restarts:result.restarts.map(label=>label||null),
     clocks:Array.from({length:11},(_,n)=>p.read(E+0x29bea+n*2,2))};
    context.restore(next);
    return {...result,context:context.snapshot()};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
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
    graph.restore(progress);if(state.flow)restoreFlow(state.flow);
    for(let n=0;n<graph.bytes.length;n++)p.write(graphBase+n,graph.bytes[n],1);
    for(let n=0;n<2048;n++)p.write(E+0x1660+n,state.flags[n],1);
    const s=scripts[state.script];
    p.write(E+0xc,state.script);p.write(E+0x10,graph.id(state.label));p.write(E+0x14,SNS+s.sns_offset+state.pc);
    if(restart)p.call(0x8876034,[E,pointers.get(state.label),1]);
    p.write(E+0x29ccc,character);p.write(E+0x29cd0,hour);
    // Earned histories scan substantially more source text than the earlier
    // unvisited-graph probes (the first two-character prefix takes 2.74M
    // instructions). Keep this one operation explicitly bounded; other native
    // calls retain their smaller default budget and rollback on failure.
    const before=checkpoint(),run=p.call(0x887483c,[E,0],10000000);
    if(JSON.stringify(checkpoint())!==JSON.stringify(before))throw Error('428 progress changed caller checkpoint');
    for(let n=0;n<graph.bytes.length;n++)graph.bytes[n]=p.read(graphBase+n,1);
    const result=graph.snapshot();graph.restore(result);
    return {flags:Array.from({length:2048},(_,n)=>p.read(E+0x1660+n,1)),progress:result,flow:collectFlow(),
      restarts:Array.from({length:11},(_,n)=>p.string(E+0x299e9+n*32,33)),steps:run.steps};
   }catch(error){restoreMemory(backup);graph.bytes.set(previous);throw error;}
  },
 });
 verifiedKernels.add(api);return api;
}
