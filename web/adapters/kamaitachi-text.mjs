/* Exact SLPS-01794 text/layout kernel. This executes only the bounded integer
 * text routines from the owner's verified executable, with GPU/input/history
 * services replaced by explicit reader hooks. It cannot boot a disc or BIOS. */
import {NativeProbe} from './shibuya428-native.mjs';

export const KAMA_EXE_HASH='38f6248c7dc0cc409fcecab51ba0c03d4ca541af71c8227e0de22eefe9f0d31a';
const STATE=0x80079000,INPUT=0x81000000,NAMES=0x80011cac,NAMES_END=0x80011d1c;
const bytesHex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=s=>{
  if(typeof s!=='string'||s.length%2||!/^[0-9a-f]*$/.test(s))throw Error('Invalid native text state bytes');
  return Uint8Array.from(s.match(/../g)||[],b=>parseInt(b,16));
};
export class KamaitachiText {
  static async create(exe,font){
    const digest=bytesHex(new Uint8Array(await crypto.subtle.digest('SHA-256',exe)));
    if(digest!==KAMA_EXE_HASH)throw Error('Kamaitachi text executable identity mismatch');
    return new KamaitachiText(exe,font);
  }
  constructor(exe,font){
    if(exe.length!==434176||font.width!==1024||font.height!==4064||!font.metrics)throw Error('Invalid native text resources');
    this.font=font;this.page=[];this.latest=[];this.source=null;this.input=[];
    const state=new Uint8Array(0x1000);state.set(exe.subarray(2048+STATE-0x80010000));
    const hooks=new Map();
    hooks.set(0x800380ec,(p,[x,y,code])=>{
      const g=font.metrics[code];if(!g)throw Error(`Unmapped Kamaitachi glyph ${code.toString(16)}`);
      p.write(0x800792da,g.width,1);
      if(code===0x8483||code===0x8484)return 0; // Native input cursor, never reading text.
      if(x>320||y>240||!Number.isInteger(g.width)||!Number.isInteger(g.height))throw Error('Native glyph outside text frame');
      const glyph={x,y,code,text:g.text,width:g.width,height:g.height,u:g.u,v:g.v,colour:p.read(0x800792dc,1)};
      this.latest.push(glyph);this.page.push(glyph);
      if(this.page.length>4096)throw Error('Native page glyph budget');
      return 0;
    });
    hooks.set(0x80049438,()=>{this.page=[];}); // ClearImage: source page clear.
    // DrawSync, input cursor erasure, confirmation sound, reader menu input,
    // native history/checkpoint storage. Story flags are owned by the control VM.
    for(const a of [0x800492b4,0x80037604,0x80028c74,0x80024fd0,0x8003276c,0x800325b0])hooks.set(a,()=>0);
    this.p=new NativeProbe({segments:[
      {address:0x80010000,bytes:exe.subarray(2048,2048+NAMES-0x80010000)},
      {address:NAMES,bytes:exe.subarray(2048+NAMES-0x80010000,2048+NAMES_END-0x80010000),writable:true},
      {address:NAMES_END,bytes:exe.subarray(2048+NAMES_END-0x80010000,2048+STATE-0x80010000)},
      {address:STATE,bytes:state,writable:true},
      {address:0x801eef00,bytes:new Uint8Array(256),writable:true},
      {address:0x801f6600,bytes:new Uint8Array(256)},
      {address:0x801fec00,bytes:new Uint8Array(512),writable:true},
      {address:0x801ff000,bytes:new Uint8Array(4096),writable:true},
      {address:INPUT,bytes:new Uint8Array(65536),writable:true}],
      ranges:[[0x80038f80,0x8003a89c],[0x8003a8d0,0x8003a90c],
        [0x800432ec,0x80043ee0],[0x80044d88,0x80044dd0]],
      hooks,globalPointer:0x8007913c,stackTop:0x801fff00});
    const p=this.p;
    for(let ch=0;ch<2;ch++){
      for(const a of [0x800794b0,0x800794b8])p.write(a+ch*2,8,2);
      for(const a of [0x800794b4,0x800794bc])p.write(a+ch*2,17,2);
      for(const a of [0x80079560,0x80079590])p.write(a+ch*2,1,2);
    }
    for(let n=1;n<=2;n++){
      const dst=p.read(0x8006b030+n*4),src=p.read(0x8006b74c+(n-1)*4);
      let i=0;for(;i<16;i++){const b=p.read(src+i,1);p.write(dst+i,b,1);if(!b)break;}
      if(i===16)throw Error('Native default-name bound');
    }
  }
  transaction(fn){
    const before=this.snapshot();try{return fn();}catch(error){this.loadSnapshot(before);throw error;}
  }
  start(bytes,source){
    if(!Array.isArray(bytes)||!bytes.length||bytes.length>=65536||bytes.at(-1)!==0||bytes.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Invalid native source text');
    return this.transaction(()=>{
      this.input=[...bytes];this.source=structuredClone(source);
      const seg=this.p.segments.find(s=>s.address===INPUT);seg.bytes.fill(0);seg.bytes.set(bytes);
      this.p.call(0x800390ec,[INPUT]);
    });
  }
  boundary(){return this.transaction(()=>{
    this.latest=[];const p=this.p;
    for(let frame=0;frame<100000;frame++){
      if(p.read(0x8007943a,1))return{kind:'text',glyphs:structuredClone(this.latest),page:structuredClone(this.page)};
      if(p.call(0x8003a560).value)return{kind:'done',glyphs:structuredClone(this.latest),page:structuredClone(this.page)};
      p.call(0x80039288,[],100000);
    }
    throw Error('Native text frame budget');
  });}
  advance(){return this.transaction(()=>{
    this.p.write(0x801eef40,1);this.p.call(0x80039288,[],100000);this.p.write(0x801eef40,0);return this.boundary();
  });}
  clear(){return this.transaction(()=>{this.p.call(0x800390ac);this.p.call(0x8003a5c4);this.page=[];});}
  indent(x){if(!Number.isInteger(x)||x<0||x>320)throw Error('Native indent bound');this.p.call(0x8003a6e4,[x]);}
  y(y){if(!Number.isInteger(y)||y<0||y>240)throw Error('Native text Y bound');this.p.call(0x8003a714,[y]);}
  choice(enabled){this.p.write(0x80079295,enabled?1:0,1);}
  setName(slot,text){
    if(!Number.isInteger(slot)||slot<0||slot>6||typeof text!=='string'||![...text].length||[...text].length>6)throw Error('Native name requires one to six characters');
    const bytes=[];
    for(const char of text){
      const entry=Object.entries(this.font.metrics).find(([code,g])=>Number(code)>=0x8000&&g.text===char);
      if(!entry)throw Error('Character is unavailable in the original name keyboard');
      const code=Number(entry[0]);bytes.push(code>>8,code&255);
    }
    const p=this.p,dst=p.read(0x8006b030+slot*4);
    if(dst<NAMES||dst+16>NAMES_END)throw Error('Native name buffer extent');
    for(let i=0;i<16;i++)p.write(dst+i,bytes[i]??0,1);
  }
  matchName(mode){
    if(![0x20,0x21,0x22].includes(mode))throw Error('Unknown source name predicate');
    return this.transaction(()=>this.p.call(0x80043b90,[mode],100000).value);
  }
  snapshot(){return {version:1,memory:bytesHex(this.p.segments.find(s=>s.address===STATE).bytes),names:bytesHex(this.p.segments.find(s=>s.address===NAMES).bytes),aux:[0x801eef00,0x801fec00].map(a=>bytesHex(this.p.segments.find(s=>s.address===a).bytes)),input:[...this.input],source:structuredClone(this.source),page:structuredClone(this.page)};}
  loadSnapshot(s){
    if(s?.version!==1||typeof s.memory!=='string'||s.memory.length!==8192||typeof s.names!=='string'||s.names.length!==(NAMES_END-NAMES)*2||!Array.isArray(s.page)||s.page.length>4096||!Array.isArray(s.input)||s.input.length>=65536||s.input.some(b=>!Number.isInteger(b)||b<0||b>255))throw Error('Invalid native text snapshot');
    for(const g of s.page){const m=this.font.metrics[g.code];if(!m||g.text!==m.text||g.width!==m.width||g.height!==m.height||g.u!==m.u||g.v!==m.v||![g.x,g.y,g.colour].every(Number.isInteger)||g.x<0||g.y<0||g.x+g.width>320||g.y+g.height>240||g.colour<0||g.colour>15)throw Error('Native saved glyph differs from source font');}
    const data=fromHex(s.memory),v=new DataView(data.buffer);
    if(!Array.isArray(s.aux)||s.aux.length!==2||s.aux[0]?.length!==512||s.aux[1]?.length!==1024)throw Error('Invalid native text auxiliary state');
    const aux=s.aux.map(fromHex),names=fromHex(s.names);
    // Text pointers can address the immutable executable (native names), the
    // narrow text state, or the current source run. Every subsequent access is
    // additionally checked by the kernel's mapped-memory and code bounds.
    for(const a of [0x800794c0,0x800794c4]){
      const at=v.getUint32(a-STATE,true);
      if(at!==0&&!(at>=INPUT&&at<=INPUT+s.input.length)&&!(at>=0x80079000&&at<0x80079800)&&!(at>=NAMES&&at<NAMES_END))throw Error('Invalid saved native text pointer');
    }
    this.p.segments.find(s=>s.address===STATE).bytes.set(data);
    this.p.segments.find(s=>s.address===NAMES).bytes.set(names);
    [0x801eef00,0x801fec00].forEach((a,i)=>this.p.segments.find(s=>s.address===a).bytes.set(aux[i]));
    const input=this.p.segments.find(s=>s.address===INPUT);input.bytes.fill(0);input.bytes.set(s.input);
    this.input=[...s.input];this.source=structuredClone(s.source);this.page=structuredClone(s.page);this.latest=[];
    this.p.write(0x801eef40,0);
  }
}

export function kamaitachiPage(glyphs,font,options=null){
  const groups=new Map();
  for(const g of glyphs){
    const choice=options&&g.colour>=1&&g.colour<=options.length?g.colour-1:null;
    const key=choice===null?`line:${g.y}`:`choice:${choice}`;
    if(!groups.has(key))groups.set(key,{choice,glyphs:[]});groups.get(key).glyphs.push(g);
  }
  const blocks=[];
  for(const {choice,glyphs:gs}of groups.values()){
    const x=Math.min(...gs.map(g=>g.x)),y=Math.min(...gs.map(g=>g.y));
    const width=Math.max(...gs.map(g=>g.x+g.width))-x,height=Math.max(...gs.map(g=>g.y+g.height))-y;
    const text=gs.map(g=>g.text).join('');
    const b={x,y,width,height,text,glyphs:gs.map(g=>({text:g.text,x:g.x-x,y:g.y-y,width:g.width,height:g.height,u:g.u,v:g.v}))};
    if(choice!==null){b.choiceId=String(choice);options[choice].text=text;}
    blocks.push(b);
  }
  return {width:320,height:240,fontSize:16,lineHeight:22,colour:'#ffffff',choiceColour:'#ee8888',
    font:{asset:'font:native',width:font.width,height:font.height},blocks};
}
