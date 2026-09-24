/* Exact-edition SC3 reader preview. Shares the tested control VM with the route
 * harness; original glyphs remain separate from all Unicode learning output. */
import {randomId,signature} from '../engine.mjs';
import {CartagraTrace} from './cartagra-trace.mjs';
import {glyphRuns,drawGlyphRuns,decodeGlyphText,validateGlyphMap} from './cartagra-font.mjs';
import {validateRemember11Content} from './remember11-engine.mjs';
const clone=structuredClone;
const clearFlags=[432,433,434,435,436,437,438,439,440,441,450,451,452,453,454,455];
const persistent=n=>n>=432&&n<=464;
export function validateCartagraContent(c){
  const errors=validateRemember11Content({...c,runtime:{...c?.runtime,entry:'Startup.scr'}},'cartagra-ps2-sc3');
  if(!['original-glyphs','reviewed-unicode'].includes(c?.runtime?.textMode)||!c.assets?.font||!c.assets?.native)errors.push('Missing source font data');
  if(c?.runtime?.textMode==='reviewed-unicode'&&!c.assets?.glyphMap)errors.push('Missing reviewed glyph map');
  return errors;
}
export class CartagraEngine {
  static async create(content,options={}){
    const errors=validateCartagraContent(content);if(errors.length)throw Error(errors.join('\n'));
    const e=new CartagraEngine(content,options);
    const native=await e.loadJSON(content.runtime.native);
    if(content.runtime.textMode==='reviewed-unicode')e.glyphMap=validateGlyphMap(await e.loadJSON(content.assets.glyphMap.url),content.runtime.font_sha256);
    if(native.format!=='vnkit.cartagra-native'||native.executable_sha256!==content.runtime.executable_sha256||native.byteTable?.length!==2243||native.glyphWidths?.length!==351)throw Error('Wrong Cartagra native tables');
    e.vm=new CartagraTrace(Object.fromEntries(Object.entries(content.runtime.scripts).map(([source,r])=>[source,{source,resource_index:r.resource_index}])),native);
    e.state={...e.vm.state,scene:{background:null,sprites:{},layers:[],music:null},pending:null,read:{},manualCompletions:{}};
    // Native 10:00 at 0x125c98..0x125f74 precedes the selected New Game
    // branch. Preserve its graphics object IDs and neutral tint defaults.
    for(let n=0;n<3;n++){e.state.work[420+n]=n;e.state.work[713+9*n]=65535;}
    for(let n=0;n<8;n++){e.state.work[429+3*n]=4+n;e.state.work[747+10*n]=256;e.state.work[748+10*n]=0x808080;e.state.work[749+10*n]=65535;}
    await e.loadBuffers();
    if(!e.glyphMap&&globalThis.Image){e.atlas=new Image();e.atlas.src=new URL(content.assets.font.url,options.baseURL).href;await e.atlas.decode();}
    return e;
  }
  constructor(content,options){
    this.content=content;this.makeId=options.makeId||randomId;this.onInstruction=options.onInstruction;
    // Text is a presentation upgrade, not a new execution ABI. Keep exact
    // source-script/native identities and the original preview save signature.
    this.signature=signature({id:content.id,runtime:{...content.runtime,textMode:'original-glyphs'}});
    this.loadJSON=options.loadJSON||(async url=>{const r=await fetch(new URL(url,options.baseURL),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Source load failed (${r.status})`);return r.json();});
    this.previewNotice=content.runtime.textMode==='original-glyphs'?'Original-font preview · dictionary lookup, copying, text streams and reading statistics await verified Unicode text.':'';
  }
  get state(){return this.vm.state;}set state(v){this.vm.state=v;}
  get current(){return this.state.pending;}
  async loadScript(name){
    if(this.vm.scripts[name]?.instructions)return;
    const ref=this.content.runtime.scripts[name];if(!ref)throw Error('Unknown source script');
    const s=await this.loadJSON(ref.url);
    if(s.format!=='vnkit.cartagra-sc3'||s.version!==1||s.source!==name||s.sha256!==ref.sha256||s.resource_index!==ref.resource_index)throw Error('Cartagra script identity mismatch');
    if(this.glyphMap)for(const t of s.strings)decodeGlyphText(t.tokens,this.glyphMap,`${name}:${t.offset}`);
    this.vm.scripts[name]=s;this.vm.bytes[name]=Uint8Array.from(atob(s.raw_base64),c=>c.charCodeAt(0));
  }
  async loadBuffers(){for(const name of new Set([this.state.script,...Object.values(this.state.buffers)]))await this.loadScript(name);}
  asset(kind,index){const id=`${kind}:${index}`;if(!this.content.assets[id])throw Error(`${this.state.script}:${this.state.pc.toString(16)}: Missing ${id}`);return id;}
  compose(){
    const s=this.state,w=n=>this.vm.read(40,n),layers=[];
    // 0x12a898: packed work[820] orders portrait slots at depths 3..10.
    const order={};for(let n=0;n<8;n++){const slot=((w(820)>>>n*4)&15)-1;if(slot>=0&&slot<8)order[slot]=3+n;}
    for(const [slotString,g]of Object.entries(s.portraits)){
      const slot=+slotString,b=740+slot*10;if(!g||!this.vm.read(41,475+slot)||order[slot]==null)continue;
      const asset=this.asset('portrait',g.image),a=this.content.assets[asset],sx=(w(b+5)||1000)/1000,sy=(w(b+6)||1000)/1000;
      layers.push({asset,x:(w(b)-320*sx)/640*100,y:(w(b+1)-224*sy)/448*100,width:100*sx,height:100*sy,atlasFrames:a.height/448,opacity:Math.max(0,Math.min(1,w(b+7)/256)),depth:order[slot],order:slot});
    }
    for(const [slotString,g]of Object.entries(s.bg)){
      const slot=+slotString,b=706+slot*9;if(!g||!this.vm.read(41,472+slot))continue;
      const scale=(w(b+4)||1000)/1000;
      // Modes 2+ use this field as wipe progress, not alpha (mode 5's
      // striped wipe finishes at 56). The preview settles these effects.
      const opacity=w(426+slot)<=1?Math.max(0,Math.min(1,w(423+slot)/256)):Number(w(423+slot)>0);
      const common={x:-w(b)*scale/640*100,y:-w(b+1)*scale/448*100,width:100*scale,height:100*scale,opacity,depth:w(b+8),order:8+slot};
      // 10:03 unpacks the colour as RGB from the low 24 bits.
      layers.push({...common,...(g.colour!=null?{colour:`#${(g.colour&0xffffff).toString(16).padStart(6,'0')}`}:{asset:this.asset('bg',g.image)})});
    }
    // Native submits depths 14..0, but 0x141b00 PREPENDS GIF packets to
    // their ordering-table chain. Raster order is the reverse, including ties.
    layers.sort((a,b)=>a.depth-b.depth||b.order-a.order);
    s.scene={background:null,sprites:{},layers,music:s.music?{asset:this.asset('music',s.music.index),loop:true}:null};
  }
  sourceText(source){
    const t=this.vm.scripts[source.script]?.strings?.[source.index];
    if(!t||t.offset!==source.offset)throw Error('Invalid source text reference');
    glyphRuns(t.tokens);return {script:source.script,index:source.index,offset:t.offset};
  }
  presentation(event,occurrenceId=this.makeId()){
    const common={id:event.id,occurrenceId,source:{script:this.state.boundary.script,offset:this.state.boundary.offset}};
    const text=ref=>{
      const source=this.sourceText(ref);
      return this.glyphMap?{...decodeGlyphText(this.vm.scripts[source.script].strings[source.index].tokens,this.glyphMap,`${source.script}:${source.offset}`),sourceText:source}:{text:'',speaker:'',sourceGlyphs:source};
    };
    if(event.kind==='glyph-text')return {...common,kind:'text',...text(event),voice:event.voice==null?null:this.asset('voice',event.voice)};
    if(event.kind==='choice')return {...common,kind:'choice',...(!this.glyphMap?{sourceGlyphs:true}:{}),options:event.options.map(o=>({id:String(o.value),...text(o.source)}))};
    if(event.kind==='movie')return {...common,kind:'movie',asset:this.asset('video',event.index)};
    if(event.kind==='end')return {...common,kind:'end'};
    throw Error('Unexpected source boundary');
  }
  async run(){
    if(this.current)return {pending:this.current,effects:[]};
    const before=clone(this.state),effects=[];
    try{
      for(let n=0;n<250000;n++){
        await this.loadBuffers();
        const s=this.state,script=s.script,offset=s.pc,i=this.vm.scripts[script].instructions[offset];
        const event=this.vm.step();this.onInstruction?.(i);
        if(i.op===0x23){const q=s.sound,channel=`sc3:${q.channel}`;effects.push({op:'stopSound',channel},{op:'sound',channel,asset:this.asset('sound',q.index),loop:q.mode!==0});}
        if(i.op===0x24)effects.push({op:'stopSound',channel:`sc3:${i.args[0]}`});
        if(event&&event.kind!=='wait'){
          s.boundary={script,offset};s.sourceEvent=event;s.pending=this.presentation(event);this.compose();return {pending:s.pending,effects};
        }
        // Execute transition loops without their frame delays; don't freeze the
        // browser while a source script performs a long transition.
        if(n%2048===2047)await new Promise(resolve=>setTimeout(resolve,0));
      }
      throw Error('Cartagra source execution exceeded the per-presentation budget');
    }catch(error){this.state=before;throw error;}
  }
  async advance(option){
    const before=clone(this.state);
    try{
      if(this.current?.kind==='end')return {pending:this.current,effects:[]};
      if(this.current?.kind==='choice'){
        if(!this.current.options.some(o=>o.id===String(option)))throw Error('Choose an available source option');
        this.vm.choose(Number(option));
      }
      this.state.pending=null;return await this.run();
    }catch(error){this.state=before;throw error;}
  }
  renderSourceText(container,p,part='body'){
    const ref=p.sourceGlyphs,t=this.vm.scripts[ref.script].strings[ref.index];
    drawGlyphRuns(container,glyphRuns(t.tokens)[part],this.atlas,this.vm.native.glyphWidths,{width:part==='speaker'?240:576});
  }
  recordPresentation(p,{restoring=false,skipped=false}={}){
    if(restoring||skipped||p.kind!=='text')return;
    const [name,hex]=p.id.split(':'),word=(parseInt(hex,16)>>>1)>>>5,bit=(parseInt(hex,16)>>>1)&31;
    const bank=this.state.read[name]??={};bank[word]=((bank[word]||0)|(1<<bit))>>>0;
  }
  isInheritedRead(id){const [name,hex]=id.split(':'),n=parseInt(hex,16)>>>1;return Boolean((this.state.read[name]?.[n>>>5]||0)&(1<<(n&31)));}
  save(media=null){return {format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  validateBank(bank,max,bits=false){
    if(!bank||Array.isArray(bank)||typeof bank!=='object'||Object.entries(bank).some(([k,v])=>!/^\d+$/.test(k)||+k>=max||!Number.isInteger(v)||(bits?![0,1].includes(v):v< -2147483648||v>2147483647)))throw Error('Invalid SC3 state bank');
  }
  validateRead(read){
    if(!read||Array.isArray(read)||typeof read!=='object')throw Error('Invalid read catalog');
    for(const [name,words]of Object.entries(read)){
      if(!this.content.runtime.scripts[name]||!words||typeof words!=='object'||Array.isArray(words)||Object.entries(words).some(([n,v])=>!/^\d+$/.test(n)||+n>65535||!Number.isInteger(v)||v<0||v>0xffffffff))throw Error('Invalid read catalog words');
    }
  }
  progressSnapshot(){return {format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,globals:{flags:Object.fromEntries(Object.entries(this.state.flags).filter(([k])=>persistent(+k))),read:clone(this.state.read)},completions:clone(this.state.manualCompletions)};}
  applyProgress(p){
    if(!p)return;
    if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw Error('Incompatible Cartagra progress');
    this.validateBank(p.globals?.flags,465,true);this.validateRead(p.globals.read);
    if(Object.keys(p.globals.flags).some(n=>!persistent(+n))||Object.entries(p.completions||{}).some(([n,v])=>!clearFlags.includes(+n)||v!==true))throw Error('Invalid persistent progress');
    for(const n of Object.keys(this.state.flags))if(persistent(+n))delete this.state.flags[n];
    Object.assign(this.state.flags,clone(p.globals.flags));
    this.state.read=clone(p.globals.read);this.state.manualCompletions=clone(p.completions||{});
  }
  async restore(save){
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Cartagra save');
    if(JSON.stringify(save).length>4*1024*1024)throw Error('Oversized Cartagra save');
    const before=this.state,progress=this.progressSnapshot(),s=clone(save.state);
    try{
      this.validateBank(s.work,1280);this.validateBank(s.flags,16384,true);this.validateBank(s.thread,64);this.validateRead(s.read);
      if(typeof s.ended!=='boolean'||!Number.isInteger(s.visits)||s.visits<0||!s.manualCompletions||Object.entries(s.manualCompletions).some(([n,v])=>!clearFlags.includes(+n)||v!==true))throw Error('Invalid saved progress');
      if(!s.buffers||Array.isArray(s.buffers)||Object.entries(s.buffers).some(([k,v])=>!/^\d+$/.test(k)||+k>15||!this.content.runtime.scripts[v])||!Array.isArray(s.stack)||s.stack.length>8||!Array.isArray(s.choice)||s.choice.length>32)throw Error('Invalid SC3 buffers or stack');
      this.state=s;await this.loadBuffers();
      const check=async f=>{await this.loadScript(f.script);if(!Number.isInteger(f.buffer)||s.buffers[f.buffer]!==f.script||!this.vm.scripts[f.script].instructions[f.pc])throw Error('Invalid source program counter');};
      for(const f of s.stack)await check(f);
      if(!s.pending){await check(s);}
      else{
        const b=s.boundary;await this.loadScript(b.script);
        const i=this.vm.scripts[b.script].instructions[b.offset];
        if(!i||i.next!==s.pc||b.script!==s.script||!['text','choice','movie','end'].includes(s.pending.kind)||typeof s.pending.occurrenceId!=='string'||s.pending.occurrenceId.length>128)throw Error('Invalid saved source boundary');
        const ops={text:[0x111],choice:[0x115],movie:[0x113],end:[0,6]};
        if(!ops[s.pending.kind].includes(i.op))throw Error('Saved presentation does not match source');
        const e=s.sourceEvent;
        if(!e||({text:'glyph-text',choice:'choice',movie:'movie',end:'end'})[s.pending.kind]!==e.kind||s.pending.id!==e.id||Boolean(s.ended)!==(s.pending.kind==='end'))throw Error('Invalid saved presentation event');
        if(s.pending.kind==='text'){
          await this.loadScript(e.script);const message=this.vm.scripts[e.script].instructions[parseInt(e.id.split(':')[1],16)];
          if(!message||message.id!==e.id||message.op!==0x110||message.args.at(-1)!==e.index||e.voice!==(message.args[0]?message.args[1]:null))throw Error('Invalid saved message association');
        }
        if(s.pending.kind==='movie'&&(e.id!==i.id||!Number.isInteger(e.index)||e.index<0||e.index>4))throw Error('Invalid saved movie');
        if(s.pending.kind==='choice'){
          if(!Number.isInteger(s.destination)||s.destination<0||s.destination>=1280)throw Error('Invalid choice destination');
          for(const o of s.choice){await this.loadScript(o.source.script);this.sourceText(o.source);}
          if(e.id!==i.id||s.choice.some((o,n)=>o.value!==n||typeof o.enabled!=='boolean')||!e.options?.length||JSON.stringify(e.options)!==JSON.stringify(s.choice.filter(o=>o.enabled)))throw Error('Saved choices differ from source state');
        }
        s.pending=this.presentation(e,s.pending.occurrenceId);
      }
      // Position loads retain progress from both the slot and the active bank.
      // applyProgress itself replaces it so failed debug writes can roll back.
      const combined=this.progressSnapshot();
      for(const [n,v]of Object.entries(progress.globals.flags))if(v)combined.globals.flags[n]=1;
      for(const [name,words]of Object.entries(progress.globals.read))for(const [n,v]of Object.entries(words)){const b=combined.globals.read[name]??={};b[n]=((b[n]||0)|v)>>>0;}
      Object.assign(combined.completions,progress.completions);
      this.applyProgress(combined);this.compose();
    }catch(error){this.state=before;throw error;}
    return {pending:this.current,effects:[]};
  }
  async startNew(progress,entry='start'){if(entry!=='start'||this.current||this.state.visits)throw Error('Invalid new-game entry');this.applyProgress(progress);return this.run();}
  newGameEntries(){return [{id:'start',label:'Start again'}];}
  routeProgress(){return clearFlags.map((n,i)=>({id:String(n),label:`Ending ${i+1}`,complete:!!this.state.flags[n],manual:!!this.state.manualCompletions[n]}));}
  progressNotice(){return 'Endings use numbered labels. Route flags come from the original scripts.';}
  markRouteComplete(id){const n=Number(id);if(!clearFlags.includes(n))throw Error('Unknown ending');this.state.flags[n]=1;this.state.manualCompletions[n]=true;if(n===440||n===452)this.state.flags[460]=1;if(n===455){this.state.flags[461]=1;this.state.flags[462]=1;}}
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset,a])=>({asset,label:a.label}));}
}
