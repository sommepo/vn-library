/* Original SLPM-65550 bytecode VM. See docs/remember11-runtime.md for evidence.
 * Offsets, operands and text come from the owner's import, never story guesses. */
import {randomId,signature} from '../engine.mjs';
const clone=structuredClone;
const s16=v=>(v<<16)>>16;
export function validateRemember11Content(c){
  const errors=[];
  if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='remember11-ps2-kid'||c.runtime.version!==1)errors.push('Unsupported Remember11 content');
  if(!c.runtime?.scripts?.[c.runtime.entry])errors.push('Missing source entry');
  for(const [id,a] of Object.entries(c.assets||{}))if(!['image','music','voice','sound','video','script'].includes(a.type)||typeof a.url!=='string'||/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(a.url)||a.url.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.')))errors.push(`${id}: invalid asset`);
  return errors;
}
export class Remember11Engine {
  static async create(content,options={}){const errors=validateRemember11Content(content);if(errors.length)throw new Error(errors.join('\n'));const e=new Remember11Engine(content,options);await e.loadScript(e.state.script);return e;}
  constructor(content,options={}){
    this.content=content;this.makeId=options.makeId||randomId;this.onInstruction=options.onInstruction;
    this.loadJSON=options.loadJSON||(async url=>{const r=await fetch(new URL(url,options.baseURL),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Scenario load failed: ${r.status}`);return r.json();});
    this.signature=signature({id:content.id,runtime:content.runtime});this.scripts={};
    this.state={script:content.runtime.entry,pc:0,vars:{global:{},local:{},globalBits:{},localBits:{}},stack:[],loaded:null,
      scene:{background:null,sprites:{},layers:[],music:null},graphics:{},pending:null,ended:false,warnings:[],catalog:{cg:{},scenes:{},tips:{},music:{},read:{}},manualCompletions:{},
      messageVisible:true,messageType:0,previousText:'',voice:null,sounds:{},music:null,date:null,random:1,locks:{},counter:0};
  }
  get current(){return this.state.pending;}
  async loadScript(name){
    if(this.scripts[name])return this.scripts[name];const ref=this.content.runtime.scripts[name];if(!ref)throw new Error(`Scenario absent: ${name}`);
    const data=await this.loadJSON(ref.url);
    if(data.format!=='vnkit.remember11-script'||data.version!==1||data.source!==name||data.sha256!==ref.sha256)throw new Error(`Scenario identity mismatch: ${name}`);
    this.scripts[name]=data;return data;
  }
  fail(i,message){throw new Error(`${i.id}: ${message}`);}
  warn(i,message){if(!this.state.warnings.some(w=>w.message===message))this.state.warnings.push({source:i.id,message});}
  bank(operand){return (operand&0xc000)===0x4000?((operand&0x2000)?'local':'global'):(operand&0xc000)===0x8000?((operand&0x2000)?'localBits':'globalBits'):null;}
  value(operand){const bank=this.bank(operand);return bank?(this.state.vars[bank][operand&0x1fff]||0):s16(operand);}
  assign(operand,value){const bank=this.bank(operand);if(!bank)return;this.state.vars[bank][operand&0x1fff]=bank.endsWith('Bits')?value&1:s16(value);}
  conditions(i){let result=0,join=7;for(const [a,b,op,next]of i.conditions){const x=this.value(a),y=this.value(b);const v=[Number(x===y),Number(x!==y),Number(x<=y),Number(x>=y),Number(x<y),Number(x>y),(x&y)&255,(x|y)&255][op];result=join===6?result&v:result|v;join=next;}return result;}
  async jumpScript(resource){const name=this.content.runtime.byResource[resource];if(!name)throw new Error(`Unresolved scenario resource ${resource}`);await this.loadScript(name);this.state.script=name;this.state.pc=0;}
  asset(resource,i,type='image'){
    const id=`${type}:${resource}`;if(!this.content.assets[id])this.fail(i,`Original ${type} resource unavailable: ${resource}`);return id;
  }
  text(raw,i){
    // Controls are parsed explicitly. Any unknown formatting remains a stop.
    let text=raw.replace(/%TS(\d{3})/g,(_,n)=>{this.state.catalog.tips[n]=true;return '';}).replace(/%TE/g,'')
      .replace(/%N/g,'\n').replace(/%(?:FS|FE|L[CLR]|C[0-9A-Fa-f]{4}|X\d{3}|T\d{2}|[KPpOV])/g,'');
    if(text.includes('%'))this.fail(i,`Unsupported source text control: ${text.match(/%.{0,12}/)?.[0]}`);
    // Native font's compact Latin space uses glyph 0x8753 (CP932 ⑳).
    // Preserve it until that glyph mapping has been verified from FONT data.
    const m=/^([^「『\n]{1,12})(「[\s\S]*)$/.exec(text);
    return {text:m?m[2]:text,speaker:m?m[1]:''};
  }
  compose(){
    const s=this.state;s.scene.background=null;
    s.scene.layers=Object.entries(s.graphics).filter(([,g])=>g.visible).sort(([a,x],[b,y])=>x.z-y.z||Number(a)-Number(b)).map(([,g])=>{
      const a=this.content.assets[g.asset],portrait=(Number(g.asset.split(':')[1])>>12)===3;
      // CHR draw 0x1303e0 uses the horizontal centre and subtracts native Y.
      // BG/EV handlers use their own full-screen origin. Keep source coordinates
      // in saves; convert only when composing the shared reader's top-left layers.
      return {asset:g.asset,x:(g.x-(portrait?a.width/2:0))/640*100,y:(portrait?-g.y:g.y)/448*100,width:a.width/640*100,height:a.height/448*100,...(g.opacity==null?{}:{opacity:g.opacity})};
    });
  }
  graph(i){
    const s=this.state;
    for(const raw of i.graphics){
      const view=new DataView(Uint8Array.from(raw).buffer),slot=raw[0],mode=raw[1],resource=view.getUint16(4,true);
      if(slot===0){for(const k of Object.keys(s.graphics))if(Number(k)>0)delete s.graphics[k];}
      if(resource===65535){delete s.graphics[slot];continue;}
      if(slot>17)this.fail(i,`Unknown graphics channel ${slot}`);
      // Background handler uses full replacement; character channels preserve
      // independently placed portraits. Transition motion is explicitly degraded.
      const old=s.graphics[slot],keep=mode===255&&old&&!raw[7];
      s.graphics[slot]={asset:this.asset(resource,i),x:keep?old.x:view.getInt16(8,true),y:keep?old.y:view.getInt16(10,true),z:raw[2]===255?(s.graphics[slot]?.z??slot):raw[2],visible:true};
      if(resource>>12===2)s.catalog.cg[resource&4095]=true;
    }
    this.warn(i,'Native graphical transitions are applied immediately');this.compose();
  }
  calculate(i){
    const s=this.state,[,a,b]=i.words,x=this.value(a),y=this.value(b);let v;
    switch(i.sub){
      case 0:v=y;break;case 1:case 13:v=x+y;break;case 2:v=x-y;break;case 3:v=x*y;break;
      case 4:if(!y)this.fail(i,'Division by zero');v=Math.trunc(x/y);break;
      case 5:if(!y)this.fail(i,'Modulo by zero');v=x%y;break;case 6:v=x&y;break;case 7:v=x|y;break;
      case 12:v=s16(b);break;
      case 15:if(y!==0)this.fail(i,`Unaudited dynamic jump-table index ${y}`);s.pc=i.jumpTable[0];return;
      case 16:if(y<=0)this.fail(i,'Invalid random range');s.random=String(BigInt.asUintN(64,BigInt(s.random)*0x5851f42d4c957f2dn+1n));v=Number((BigInt(s.random)>>32n)&0x7fffffffn)%y;break;
      case 17:v=Math.min(255,x+y);break;case 18:v=Math.max(0,x-y);break;case 19:v=x+Number(y!==0);break;
      case 20:if(a>>12===2)s.catalog.cg[a&4095]=Boolean(y);return;
      case 22:s.catalog.music[(a&4095)>>1]=Boolean(y);return;
      case 23:s.catalog.tips[a&4095]=Boolean(y);return;
      case 24:v=Object.values(s.catalog.read).reduce((sum,bits)=>{for(let n=bits>>>0;n;n=(n&(n-1))>>>0)sum++;return sum;},0);break;
      case 21:s.catalog.scenes[a&4095]=true;s.titleIndex=a&4095;return;
      default:this.fail(i,`Unsupported calculation ${i.sub}`);
    }
    this.assign(a,v);
  }
  async run(){const checkpoint=clone(this.state);try{return await this.runInternal();}catch(error){this.state=checkpoint;throw error;}}
  async runInternal(){
    if(this.current||this.state.ended)return {pending:this.current,effects:[]};const effects=[];
    for(let step=0;step<20000;step++){
      const s=this.state,script=await this.loadScript(s.script),i=script.instructions[s.pc];
      if(!i||i.unsupported)throw new Error(i?.unsupported||`${s.script}:${s.pc.toString(16)}: execution outside decoded instructions`);
      this.onInstruction?.(i,s);s.pc=i.next;
      const word=n=>i.words[n],wait=ms=>{if(ms<0||ms>3600000)this.fail(i,'Invalid wait');if(ms)s.pending={kind:'wait',id:i.id,ms,remainingMs:ms,display:s.lastMessage||null,source:{script:s.script,offset:i.offset}};};
      switch(i.op){
        case 0:break;
        case 1:s.ended=true;s.pending={kind:'end',id:i.id,source:{script:s.script,offset:i.offset}};break;
        case 2:{const yes=this.conditions(i);if(i.sub===0xfe||i.sub===0xff&&yes!==1||i.sub===0&&yes===1||i.sub===1&&yes===0)s.pc=i.target;break;}
        case 3:s.pc=i.target;break;
        case 4:if(s.stack.length>=16)this.fail(i,'Native call-stack limit');s.stack.push({script:s.script,pc:s.pc});s.pc=i.target;break;
        case 5:case 8:{const frame=s.stack.pop();if(!frame)this.fail(i,'Return with empty stack');await this.loadScript(frame.script);s.script=frame.script;s.pc=frame.pc;break;}
        case 6:await this.jumpScript(s.loaded);break;
        case 7:s.stack.push({script:s.script,pc:s.pc});await this.jumpScript(s.loaded);break;
        case 9:this.calculate(i);break;
        case 10:s.counter=0;break;
        case 11:case 12:wait(Math.max(0,this.value(word(1)))*1000/60);break;
        case 15:s.loaded=word(1);break;case 16:break;
        case 17:case 19:case 20:case 21:case 23:case 28:case 29:case 30:s.messageOptions={...s.messageOptions,[i.name]:i.words};break;
        case 18:s.messageVisible=![0,3].includes(i.sub);break;
        case 22:s.messageType=i.sub;break;
        case 25:break;
        case 26:s.previousText='';s.lastMessage=null;break;
        case 31:case 115:{
          const resource=Object.keys(this.content.runtime.byResource).find(k=>this.content.runtime.byResource[k]===s.script),readKey=`${resource}:${i.readId>>>5}`;
          s.catalog.read[readKey]=((s.catalog.read[readKey]||0)|(1<<(i.readId&31)))>>>0;const message=this.text(i.text,i);s.messageVisible=true;
          const voice=i.voice<65534?this.asset(i.voice,i,'voice'):null;
          const full=s.previousText+message.text;s.previousText=full;
          if(!message.text.trim()){s.lastMessage={...message,text:full};break;}
          s.pending={kind:'text',id:i.id,occurrenceId:this.makeId(),...message,displayText:full,clearAfter:/%[Pp]/.test(i.text),voice,source:{script:s.script,offset:i.offset,textOffset:i.textOffset}};
          s.lastMessage={...message,text:full};break;
        }
        case 37:case 116:{
          const options=i.options.map((o,n)=>({...o,...this.text(o.text,i),id:String(n),value:n})).filter(o=>this.value(o.condition)!==0);
          this.assign(i.destination,-1);
          if(!options.length){this.assign(i.destination,i.options.length);break;}
          if(options.length===1){this.assign(i.destination,options[0].value);if(options[0].target!==65535)s.pc=options[0].target;break;}
          s.pending={kind:'choice',id:i.id,options,occurrenceId:this.makeId(),destination:i.destination,source:{script:s.script,offset:i.offset}};break;
        }
        case 51:case 105:case 114:this.graph(i);break;
        case 44:{const g=s.graphics[i.sub];if(g){g.x=this.value(word(1));g.y=this.value(word(2));this.compose();}break;}
        case 46:if(s.graphics[i.sub]){s.graphics[i.sub].z=word(1);this.compose();}break;
        case 48:this.warn(i,'Native palette effects are not rendered');break;
        case 49:s.layerMode={...s.layerMode,[i.sub]:word(1)};break;
        case 50:break;
        case 55:s.music=this.asset(s.loaded,i,'music');break;
        case 56:s.music=null;s.scene.music=null;break;
        case 57:if([0,3].includes(i.sub))s.scene.music=null;else if(s.music)s.scene.music={asset:s.music,loop:true};break;
        case 58:break;
        case 59:s.musicFade=word(1);break;
        case 60:if(i.sub>128)this.fail(i,'Unaudited source BGM gain');s.musicVolume=i.sub;s.scene.musicGain=i.sub/128;this.warn(i,'Source music volume envelopes are immediate');break;
        case 61:s.sounds[i.sub]=this.asset(s.loaded&4095,i,'sound');break;
        case 62:delete s.sounds[i.sub];break;
        case 63:{const a=s.sounds[i.sub];effects.push({op:'stopSound',channel:`kid:${i.sub}`});if(a&&![0,3].includes(word(1)))effects.push({op:'sound',asset:a,channel:`kid:${i.sub}`,loop:Number.isFinite(this.content.assets[a].loopStart)});break;}
        case 64:break;
        case 65:case 66:s.soundSettings={...s.soundSettings,[`${i.op}:${i.sub}`]:word(1)};break;
        case 67:s.voice=this.asset(s.loaded,i,'voice');break;
        case 68:s.voice=null;break;
        case 69:if(s.voice&&!([0,3].includes(i.sub))){s.immediateVoice={asset:s.voice};effects.push({op:'voice',asset:s.voice});}else s.immediateVoice=null;break;
        case 70:if(s.immediateVoice)s.pending={kind:'wait',id:i.id,ms:0,remainingMs:0,voiceWait:true,source:{script:s.script,offset:i.offset}};break;
        case 71:case 72:s.voiceSettings={...s.voiceSettings,[i.name]:i.words};break;
        case 73:case 74:case 112:case 113:case 127:case 134:s.locks[i.name]=i.sub;break;
        case 75:this.fail(i,'Native save_check semantics not established');break;
        case 78:case 79:s.sourceSkip=i.op===78;break;
        case 83:this.warn(i,'Native chapter-title animation omitted');break;
        case 84:case 85:case 86:case 103:this.warn(i,'Controller vibration is omitted');break;
        case 96:case 130:{const m=this.content.runtime.movies?.[i.sub];if(!m)this.fail(i,'Movie table entry unavailable');s.catalog.cg[m.cg&4095]=true;s.pending={kind:'movie',id:i.id,asset:this.asset(i.sub,i,'video'),source:{script:s.script,offset:i.offset}};s.scene.music=null;break;}
        case 131:break;
        case 104:s.clock={hour:this.value(word(1)),minute:this.value(word(2))};this.warn(i,'Original clock artwork not rendered');break;
        case 110:s.trace=i.sub;break;
        case 97:{const g=s.graphics[i.sub];if(g){g.x=this.value(word(1));g.y=this.value(word(2));this.compose();}this.warn(i,'Native position motion is immediate');break;}
        case 98:break;
        case 99:case 100:case 129:this.warn(i,'Native texture/scale motion not yet rendered');break;
        case 101:case 52:case 53:case 54:this.warn(i,'Native screen effects omitted');break;
        case 102:case 132:s.fade={mode:i.sub,frames:this.value(word(1)),colour:word(2)};this.warn(i,'Native fade transitions are immediate');break;
        case 133:break;
        case 109:s.nativeQuicksave=i.sub;break;
        case 111:{const msg=this.text(i.text,i);s.pending={kind:'text',id:i.id,occurrenceId:this.makeId(),...msg,displayText:msg.text,clearAfter:true,voice:null,source:{script:s.script,offset:i.offset}};break;}
        default:this.fail(i,`Unsupported command ${i.name} (${i.op.toString(16)})`);
      }
      if(this.current)return {pending:this.current,effects};
    }
    throw new Error(`${this.state.script}:${this.state.pc.toString(16)}: instruction budget exhausted`);
  }
  async advance(choice){const checkpoint=clone(this.state);try{return await this.advanceInternal(choice);}catch(error){this.state=checkpoint;throw error;}}
  async advanceInternal(choice){
    const p=this.current;if(!p)return this.run();if(p.kind==='end')return {pending:p,effects:[]};
    if(p.kind==='choice'){
      const o=p.options.find(o=>o.id===String(choice));if(!o)throw new Error('Choose a visible option');
      this.assign(p.destination,o.value);if(o.target!==65535)this.state.pc=o.target;
    }
    if(p.clearAfter)this.state.previousText='';
    this.state.pending=null;return this.run();
  }
  save(media={}){return {format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  async restore(save){
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw new Error('Incompatible Remember11 save');
    const s=clone(save.state);
    if(!s||!Number.isInteger(s.pc)||!Array.isArray(s.stack)||s.stack.length>16||!s.vars||!s.scene||!s.graphics)throw new Error('Malformed Remember11 state');
    for(const bank of ['global','local','globalBits','localBits'])if(!s.vars[bank]||Object.entries(s.vars[bank]).some(([k,v])=>!/^\d+$/.test(k)||Number(k)>8191||!Number.isInteger(v)||v<-32768||v>32767||(bank.endsWith('Bits')&&v!==0&&v!==1)))throw new Error('Malformed Remember11 variables');
    s.catalog=this.normalizeCatalog(s.catalog);
    await this.loadScript(s.script);
    if(!this.scripts[s.script].instructions[s.pc]&&!s.ended)throw new Error('Saved program counter outside source');
    for(const f of s.stack){await this.loadScript(f.script);if(!this.scripts[f.script].instructions[f.pc])throw new Error('Saved return address outside source');}
    if(s.pending){const i=this.scripts[s.script].instructions[s.pending.source?.offset],kinds={text:[31,115,111],choice:[37,116],wait:[11,12,70],end:[1],movie:[96,130]};if(!i||s.pending.source.script!==s.script||s.pending.id!==i.id||!kinds[s.pending.kind]?.includes(i.op))throw new Error('Invalid saved presentation');}
    for(const g of Object.values(s.graphics))if(!this.content.assets[g.asset]||![g.x,g.y,g.z].every(Number.isFinite))throw new Error('Invalid saved artwork');
    if(s.pending?.kind==='text'){const i=this.scripts[s.script].instructions[s.pending.source.offset],old=this.state;try{this.state=clone(s);const expected=this.text(i.text,i);if(JSON.stringify(expected.text)!==JSON.stringify(s.pending.text)||expected.speaker!==s.pending.speaker||typeof s.pending.occurrenceId!=='string'||typeof s.pending.displayText!=='string'||!s.pending.displayText.endsWith(expected.text))throw new Error('Saved dialogue differs from source');}finally{this.state=old;}}
    if(s.pending?.kind==='wait'&&(!Number.isFinite(s.pending.remainingMs)||s.pending.remainingMs<0||s.pending.remainingMs>3600000))throw new Error('Invalid saved timer');
    if(s.pending?.kind==='choice'){
      const i=this.scripts[s.script].instructions[s.pending.source.offset],old=this.state;
      try{this.state=clone(s);const expected=i.options?.map((o,n)=>({...o,...this.text(o.text,i),id:String(n),value:n})).filter(o=>this.value(o.condition)!==0);
        if(!expected||JSON.stringify(expected)!==JSON.stringify(s.pending.options)||s.pending.destination!==i.destination||typeof s.pending.occurrenceId!=='string')throw new Error('Saved choices differ from source');
      }finally{this.state=old;}
    }
    if(s.pending?.kind==='movie'&&this.content.assets[s.pending.asset]?.type!=='video')throw new Error('Invalid saved movie');
    if(s.scene.music&&this.content.assets[s.scene.music.asset]?.type!=='music')throw new Error('Invalid saved music');
    this.state=s;this.compose();return {pending:this.current,effects:[],restored:true};
  }
  progressSnapshot(){return {format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,completions:clone(this.state.manualCompletions),globals:clone({global:this.state.vars.global,globalBits:this.state.vars.globalBits,catalog:this.state.catalog})};}
  normalizeCatalog(c){
    if(!c||Object.keys(c).sort().join(',')!=='cg,music,read,scenes,tips'||Object.values(c).some(b=>!b||Array.isArray(b)))throw Error('Invalid progress catalog');
    for(const k of ['cg','music','scenes','tips'])if(Object.values(c[k]).some(v=>typeof v!=='boolean'))throw Error('Invalid progress catalog');
    const read={};for(const [key,value]of Object.entries(c.read)){
      const [source,index]=key.split(':');
      if(!/^\d+$/.test(index||''))throw Error('Invalid native read index');
      if(typeof value==='boolean'){
        // Upgrade earlier verbose snapshots without touching learning history.
        const resource=Object.keys(this.content.runtime.byResource).find(k=>this.content.runtime.byResource[k]===source);
        if(resource===undefined||+index>65535)throw Error('Invalid legacy read marker');
        if(value){const k=`${resource}:${+index>>>5}`;read[k]=((read[k]||0)|(1<<(+index&31)))>>>0;}
      }else{
        if(!/^\d+$/.test(source)||!this.content.runtime.byResource[source]||+index>2047||!Number.isInteger(value)||value<0||value>0xffffffff)throw Error('Invalid native read word');
        read[key]=((read[key]||0)|value)>>>0;
      }
    }return {...clone(c),read};
  }
  async loadReadPaths(){
    this.readPaths={};
    try{
      const d=await this.loadJSON('read-paths.json');
      if(d?.format!=='vnkit.read-paths'||d.version!==1||d.gameId!==this.content.id||d.gameSignature!==this.signature||!d.paths||Array.isArray(d.paths))throw Error('Incompatible read-path sidecar');
      const paths={};for(const [route,p]of Object.entries(d.paths)){
        if(!['kokoro','satoru'].includes(route)||!Array.isArray(p.ids)||p.ids.length>100000||!p.ids.every(id=>typeof id==='string'&&/^[^:]+:[0-9a-f]{4,8}$/.test(id)&&this.content.runtime.scripts[id.split(':')[0]]))throw Error('Invalid source read path');
        paths[route]=new Set(p.ids);
      }this.readPaths=paths;this.readPathWarning='';
    }catch(error){this.readPathWarning=`Completed-route read paths unavailable: ${error.message}`;}
  }
  isInheritedRead(id){return this.routeProgress().some(r=>r.complete&&this.readPaths?.[r.id]?.has(id));}
  applyProgress(p){if(!p)return;if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw new Error('Incompatible Remember11 progress');for(const k of ['global','globalBits']){if(!p.globals?.[k]||Array.isArray(p.globals[k])||Object.entries(p.globals[k]).some(([n,v])=>!/^\d+$/.test(n)||+n>8191||!Number.isInteger(v)||v<-32768||v>32767||(k.endsWith('Bits')&&![0,1].includes(v))))throw new Error('Invalid progress banks');}const catalog=this.normalizeCatalog(p.globals.catalog);if(p.completions&&Object.entries(p.completions).some(([k,v])=>!['kokoro','satoru'].includes(k)||v!==true))throw new Error('Invalid completion provenance');for(const k of ['global','globalBits'])this.state.vars[k]=clone(p.globals[k]);this.state.catalog=catalog;this.state.manualCompletions=clone(p.completions||{});}
  routeProgress(){return [{id:'kokoro',label:'こころ編',complete:Boolean(this.state.vars.globalBits[84]),manual:Boolean(this.state.manualCompletions.kokoro)},{id:'satoru',label:'悟編',complete:Boolean(this.state.vars.globalBits[100]),manual:Boolean(this.state.manualCompletions.satoru)}];}
  markRouteComplete(id){const bit={kokoro:84,satoru:100}[id];if(!bit)throw new Error('Unknown route');this.state.vars.globalBits[bit]=1;this.state.manualCompletions[id]=true;}
  progressNotice(){return this.state.vars.globalBits[84]?'悟編 is unlocked.':'Complete こころ編 to unlock 悟編.';}
  newGameEntries(){return [{id:'start',label:'こころ編 · Start again'},...(this.state.vars.globalBits[84]?[{id:'satoru',label:'悟編'}]:[])];}
  async startNew(progress,entry='start'){if(this.state.pc||this.current)throw new Error('New game requires a fresh engine');this.applyProgress(progress);if(!this.newGameEntries().some(x=>x.id===entry))throw new Error('This chapter is not unlocked');this.assign(0x602a,entry==='satoru'?1:0);return this.run();}
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset,a])=>({asset,label:a.label||asset}));}
}
