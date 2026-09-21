/* Original HuneX command interpreter for the supplied PS2 CLANNAD edition. */
import {validateReadPaths,inheritedRead} from './clannad-read-paths.mjs';
import {randomId,signature} from '../engine.mjs';
import {mountMotion,motionDuration,motionX,rotationDuration} from './clannad-motion.mjs';
import {mountEyecatch,eyecatchDuration} from './clannad-eyecatch.mjs';
import {mountSwing,swingFinishDuration} from './clannad-swing.mjs';
import {startBasicEvent,signalBasicEvent,validateBasicChannels,basicEventSupported,legacySupported} from './clannad-basic-events.mjs';
import {routeStatus,markComplete,recordEnding,validateReaderProgress} from './clannad-progress.mjs';
const clone=x=>structuredClone(x);
export const SUPPORTED = new Set('ZZ ZY ZM CALC IF__ IFJP ELS_ EIF_ GOTO FCAL FRET JUMP END_ LNIN LNST STTI DDAT WNTY STBG FADB FADF FADE CHCL MPLY MFAD MSTP VPLY WTKY WTK2 WTVT WTTM WTTK WAMS WATS WAMR WATR WCOF CLOS CLR_ PLD_ PLDB PLDS EVT1 EVT0 EVTN CALN MSIZ KEI0 KEI1 KEI2 KEI3 SHAK SPIA MNWL MSNL GCLS GMSA QK0_ SEPL SELP SESP SEFD'.split(' '));
// 0x10b4f0 reports elapsed voice ticks multiplied by 17; update is 60 Hz.
export const voiceCueTime = value => Math.ceil(value / 17) * 1000 / 60;
for(const op of ['NCK0','NCK1','NCK2','NSC0','NSC1'])SUPPORTED.add(op);
for(const op of 'EVWT EVTS MCOL MCON MCOF CLMW WASS WASR WAON WAOF RTMN RTM_ CLNV MJPS MJPE FAOA FAIA BXDK BXNG BXFL VIOL VIO1 VPL2 VCWT MPL1 MVOL legacy NCK3 FADZ ECTS ECTW MVPL'.split(' '))SUPPORTED.add(op);

export function validateClannadContent(c) {
  const errors=[];
  if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='clannad-ps2-hunex'||c.runtime.version!==1||c.nativeData?.format!=='vnkit.clannad-native'||c.nativeData.version!==1) errors.push('Unsupported CLANNAD content/runtime format');
  if(!c?.runtime?.scripts?.[c.runtime.entry])errors.push('Missing source entry script');
  for(const [id,a] of Object.entries(c?.assets||{})) {
    if(!['image','music','voice','sound','video','script'].includes(a.type))errors.push(`${id}: unknown media type`);
    if(typeof a.url!=='string'||/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(a.url)||a.url.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.')))errors.push(`${id}: unsafe URL`);
  }
  for(const [name,s] of Object.entries(c?.runtime?.scripts||{}))if(!/^SEEN\d{4}\.MZX$/.test(name)||!/^[a-f0-9]{64}$/.test(s.sha256)||c.assets?.[`script:${name}`]?.url!==s.url)errors.push(`${name}: invalid script resource`);
  return errors;
}

export function evaluate(node,banks) {
  if(Object.hasOwn(node,'number'))return node.number;
  if(node.bank)return banks[node.bank]?.[node.index]??0;
  if(node.unary){const n=evaluate(node.value,banks);return node.unary==='!'?Number(!n):node.unary==='-'?-n:n;}
  const a=evaluate(node.left,banks);
  if(node.operator==='&&')return Number(Boolean(a)&&Boolean(evaluate(node.right,banks)));
  if(node.operator==='||')return Number(Boolean(a)||Boolean(evaluate(node.right,banks)));
  const b=evaluate(node.right,banks);
  switch(node.operator){case '+':return a+b;case '-':return a-b;case '*':return a*b;case '/':if(!b)throw new Error('Division by zero');return Math.trunc(a/b);case '==':return Number(a===b);case '!=':return Number(a!==b);case '<':return Number(a<b);case '>':return Number(a>b);case '<=':return Number(a<=b);case '>=':return Number(a>=b);default:throw new Error('Unknown expression operator');}
}

export class ClannadEngine {
  static async create(content,options={}) {
    const errors=validateClannadContent(content);if(errors.length)throw new Error(errors.join('\n'));
    const engine=new ClannadEngine(content,options);await engine.loadScript(content.runtime.entry);return engine;
  }
  constructor(content,options={}) {
    this.content=content;this.makeId=options.makeId||randomId;this.scripts={};
    this.baseURL=options.baseURL;this.onInstruction=options.onInstruction;
    this.loadJSON=options.loadJSON||(async url=>{const r=await fetch(new URL(url,options.baseURL),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Script load failed: ${r.status}`);return r.json();});
    this.signature=signature({id:content.id,stateVersion:1,runtime:content.runtime,native:content.nativeData.evidence});
    this.state={script:content.runtime.entry,pc:0,vars:{F:clone(content.nativeData.initial_f||{}),G:{},Z:{}},stack:[],condition:1,
      names:clone(content.nativeData.default_names),title:'',date:null,window:0,messageVisible:true,textSize:24,buffer:[],presentedParts:0,lastMessage:null,voice:null,voiceInProgress:false,
      scene:{background:null,sprites:{},layers:[],music:null},nextBackground:null,pending:null,ended:false,warnings:[]};
  }
  progressSnapshot(){return {format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,globals:clone(this.state.vars.G),...(Object.keys(this.readerProgress||{}).length?{completions:clone(this.readerProgress)}:{})};}
  applyProgress(progress){
    if(!progress)return;
    if(progress.format!=='vnkit.progress'||progress.version!==1||progress.gameId!==this.content.id||progress.gameSignature!==this.signature||!progress.globals||Array.isArray(progress.globals)||Object.entries(progress.globals).some(([k,v])=>!/^\d+$/.test(k)||Number(k)>=2000||!Number.isInteger(v)||v<-32768||v>32767))throw new Error('Invalid or incompatible global progress');
    const marks=validateReaderProgress(progress.completions);
    this.state.vars.G=clone(progress.globals);this.readerProgress=marks;
  }
  async loadReadPaths(){
    try{this.readPaths=validateReadPaths(await this.loadJSON('read-paths.json'),this);this.readPathWarning='';}
    catch(error){this.readPaths={};this.readPathWarning=`Completed-route read paths unavailable: ${error.message}`;}
  }
  isInheritedRead(id){return inheritedRead(this,id);}
  routeProgress(){return routeStatus(this);}
  markRouteComplete(id){return markComplete(this,id);}
  finishEnding(){recordEnding(this);}
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').sort(([a],[b])=>Number(a.split(':')[1])-Number(b.split(':')[1])).map(([asset])=>({asset,label:Object.entries(this.content.nativeData.music).find(([,n])=>asset===`music:${n}`)?.[0]?.replace(/^＠/,'')||asset}));}
  sceneOverlays(){
    const asset=this.content.nativeData.calendar?.[this.state.date];
    if(!asset||!this.state.vars.F[1112]||['end','movie'].includes(this.current?.kind)||this.state.scene.task?.id==='clannad-eyecatch')return [];
    const a=this.content.assets[asset];
    // 0x14f010 feeds F1112 to the visibility setter; draw offset is 10 at
    // 0x12d7bc (float at 0x3bf0c8). Source transition animation is still omitted.
    return [{asset,x:10/640*100,y:10/448*100,width:a.width/640*100,height:a.height/448*100,role:'calendar'}];
  }
  titleGlobals(){
    const G=clone(this.state.vars.G),flags=[1,2,3,4,5,6,9,12,13,15];let stage=G[73]||0;
    // Native title initialization 0x144860, transition 0x14568c.
    if(stage>=3&&!G[45])stage=2;
    if(stage<1&&flags.some(k=>G[k]===1))stage=1;
    if(stage<2&&[...flags,30,31].every(k=>G[k]===1))stage=2;
    if(stage<3&&G[45]===1)stage=3;
    G[73]=stage;return G;
  }
  progressNotice(){return this.titleGlobals()[73]>=2?'AFTER STORY is unlocked.':'AFTER STORY remains locked. School Life completions and both additional light flags are required by this PS2 edition. Ryou’s ending is optional.';}
  newGameEntries(){return [{id:'start',label:'Start again'},...(this.titleGlobals()[73]>=2?[{id:'after-story',label:'AFTER STORY'}]:[])];}
  async startNew(progress,entry='start'){
    if(this.state.pc||this.state.pending)throw new Error('New game requires a fresh engine');
    this.applyProgress(progress);this.state.vars.G=this.titleGlobals();
    if(!this.newGameEntries().some(e=>e.id===entry))throw new Error('This entry has not been unlocked');
    if(entry==='after-story'){this.state.script='SEEN6800.MZX';await this.loadScript(this.state.script);}
    return this.run();
  }
  async loadScript(name) {
    if(this.scripts[name])return this.scripts[name];const ref=this.content.runtime.scripts[name];
    if(!ref)throw new Error(`Source script absent: ${name}`);
    const s=await this.loadJSON(ref.url);
    if(s.format!=='vnkit.clannad-script'||s.version!==1||s.source!==name||s.sha256!==ref.sha256||!Array.isArray(s.instructions))throw new Error(`Script identity mismatch: ${name}`);
    this.scripts[name]=s;return s;
  }
  get current(){return this.state.pending;}
  get presentationViewport(){
    const task=this.state.scene.task;
    if(task?.id==='clannad-eyecatch'){
      const v=this.content.nativeData.events[task.event].variants[task.variant],a=this.content.assets[v.background];
      return {width:a.width,height:a.height};
    }
    return this.content.viewport;
  }
  mountScene(art,mediaURL,playEffect){return mountMotion(art,this)||mountEyecatch(art,this)||mountSwing(art,this,mediaURL,playEffect);}
  fail(i,message){throw new Error(`${i.id}: ${message}`);}
  warn(i,message){const prior=this.state.warnings.find(w=>w.message===message);if(prior){prior.count++;prior.lastSource=i.id;}else this.state.warnings.push({source:i.id,message,count:1,lastSource:i.id});}
  asset(id,i){if(!this.content.assets[id])this.fail(i,`Original resource unavailable: ${id}`);return id;}
  format(text) {
    // 0x147178: percent-name substitutions use F[900..905], then player names.
    for(let pass=0;pass<3;pass++)text=text.replace(/％([Ａ-Ｆ])/g,(_,c)=>{
      const values=this.content.nativeData.name_substitutions[c];const index=this.state.vars.F[900+c.charCodeAt(0)-'Ａ'.charCodeAt(0)]??0;
      if(!values||values[index]==null)throw new Error('Name substitution index outside source table');return values[index];
    });
    return text.replaceAll('＊Ａ',this.state.names.family).replaceAll('＊Ｂ',this.state.names.first);
  }
  isMessageSource(i){return ['ZM','MNWL','MSNL'].includes(i?.op)||i?.op==='EVT0'&&typeof this.content.nativeData.basic_events?.[i.args[1]]?.buffer_text==='string';}
  message(parts=this.state.buffer) {
    const text=parts.map(part=>{const i=this.scripts[part.script].instructions[part.pc];return i.op==='MNWL'?'\n':i.op==='MSNL'?'\n'+this.format(i.args.slice(2).join(',')):this.format(i.op==='EVT0'?this.content.nativeData.basic_events?.[i.args[1]]?.buffer_text:i.text);}).join('');
    const speaker=/^【([^】]*)】/.exec(text);
    const result={speaker:speaker?.[1]||'',text:speaker?text.slice(speaker[0].length):text};
    if(parts.some(p=>this.scripts[p.script].instructions[p.pc].op==='MSNL')){
      const dialogue=[];let primary='';
      const split=t=>{const m=/^【([^】]*)】/.exec(t);return {speaker:m?.[1]||'',text:m?t.slice(m[0].length):t};};
      for(const part of parts){const i=this.scripts[part.script].instructions[part.pc];
        if(i.op==='MSNL'){if(primary){dialogue.push(split(primary));primary='';}dialogue.push(split(this.format(i.args.slice(2).join(','))));}
        else primary+=i.op==='MNWL'?'\n':this.format(i.op==='EVT0'?this.content.nativeData.basic_events?.[i.args[1]]?.buffer_text:i.text);
      }
      if(primary)dialogue.push(split(primary));result.dialogue=dialogue;
    }
    return result;
  }
  messagePresentation(i,continuation=true) {
    const s=this.state,parts=s.buffer.slice(s.presentedParts),full=this.message();
    if(!parts.length)return null;
    const ids=parts.map(p=>this.scripts[p.script].instructions[p.pc].id);
    s.messageVisible=true;s.lastMessage=full;
    return {kind:'text',id:ids.join('+'),occurrenceId:this.makeId(),...this.message(parts),speaker:full.speaker,voice:s.voice,
      ...(s.presentedParts?{displayText:full.text}:{}),...(s.voiceInProgress?{continueVoice:true}:{}),
      source:{script:s.script,offset:i.offset,segments:ids},boundary:i.id,continuation};
  }
  validateMessage(p,boundary) {
    const s=this.state,parts=s.buffer.slice(s.presentedParts),full=this.message(),msg=this.message(parts);
    if(s.buffer.some(b=>!this.isMessageSource(this.scripts[b.script].instructions[b.pc]))||typeof p.occurrenceId!=='string'||p.boundary!==boundary.id||p.kind!=='text')throw new Error('Invalid saved message sources');
    if(!parts.length||msg.text!==p.text||JSON.stringify(msg.dialogue)!==JSON.stringify(p.dialogue)||full.speaker!==p.speaker||p.id!==parts.map(b=>this.scripts[b.script].instructions[b.pc].id).join('+')||(p.displayText??null)!==(s.presentedParts?full.text:null)||p.voice!==s.voice||!!p.continueVoice!==s.voiceInProgress)throw new Error('Saved text/voice differs from source');
  }
  nativeChoiceOptions(event){if(event!==77)throw new Error('Unknown native choice');return [{id:'0',text:'はい',value:1},{id:'1',text:'いいえ',value:0}];}
  choiceOptions(i) {
    return i.selection.options.map((text,n)=>{
      if(i.selection.kind==='SEB'){
        const id=Number(text),levelIndex={1:100,2:101,3:103,4:104}[id],base={1:3,2:6,3:9,4:12,5:1,6:2}[id];
        if(base==null||!this.content.nativeData.special_choices)this.fail(i,'Unknown source SEB option');
        const level=levelIndex==null?0:this.state.vars.F[levelIndex]||0;
        if(level<0||level>2)this.fail(i,'Source SEB level outside native table');
        text=this.content.nativeData.special_choices[base+level].replace(/@c\(\d+,\d+,\d+\)/g,'');
      }else if(i.selection.kind!=='SEL')this.fail(i,'Unknown choice kind');
      return {id:String(n),text:this.format(text),value:n};
    });
  }
  assign(target,value) {
    if(!Number.isFinite(value)||!Number.isInteger(value)||value < -32768||value >32767)throw new Error('Source signed-16 variable overflow is not implemented');
    const bank=this.state.vars[target.bank];const old=bank[target.index]??0;
    const result=target.operator==='='?value:target.operator==='+='?old+value:old-value;
    if(result < -32768||result >32767)throw new Error('Source signed-16 variable overflow');bank[target.index]=result;
  }
  // IFJP starts two bytes inside the label, bypassing its condition reset.
  jump(label,i,conditional=false){const at=this.scripts[this.state.script].labels[label];if(at==null)this.fail(i,`Unresolved label ${label}`);this.state.pc=at+(conditional?1:0);}
  background(name,i) {
    const resource=this.content.nativeData.backgrounds[name.toLowerCase()];if(!resource)this.fail(i,`Unknown background ${name}`);
    this.state.nextBackground=this.asset(`image:${resource.archive_index}`,i);
  }
  compose(name,i,append=false,offset=0,opacity=1) {
    this.state.scene.background=this.state.nextBackground;
    if(!append)this.state.scene.layers=[];
    if(!name)return;
    const r=this.content.nativeData.sprites[name.toLowerCase()];if(!r)this.fail(i,`Unknown character composition ${name}`);
    const add=(index,x,y)=>{const asset=this.asset(`image:${index}`,i),a=this.content.assets[asset];this.state.scene.layers.push({asset,x:(x+offset)/640*100,y:y/448*100,width:a.width/640*100,height:a.height/448*100,...(opacity===1?{}:{opacity})});};
    add(r.body_index,0,0);if(r.face_index!=null)add(r.face_index,r.face_x,r.face_y);
  }
  async run() {
    if(this.current||this.state.ended)return {pending:this.current,effects:[]};const effects=[];
    for(let steps=0;steps<10000;steps++) {
      const script=await this.loadScript(this.state.script),pc=this.state.pc,i=script.instructions[pc];
      if(!i)throw new Error(`Execution left ${this.state.script}:${pc}`);
      this.onInstruction?.(i,this.state);
      const conditionOverride=this.content.nativeData.condition_overrides?.[i.id];
      if(i.unsupported&&!(conditionOverride&&conditionOverride.argument===i.argument)&&!(i.op==='legacy'&&legacySupported(i.argument)))this.fail(i,i.unsupported);
      if(!SUPPORTED.has(i.op))this.fail(i,`Unsupported CLANNAD instruction ${i.op}${i.op==='legacy'?': '+i.argument:''}`);
      const args=i.args||[];const integer=(n=0)=>{if(!/^-?\d+$/.test(args[n]??''))this.fail(i,'Expected decimal integer');return Number(args[n]);};
      const s=this.state;const wait=ms=>{if(ms<0||ms>3600000)this.fail(i,'Unsupported timing range');s.pending={kind:'wait',id:i.id,ms,remainingMs:ms,display:clone(s.lastMessage),...(s.messageVisible===false?{hideText:true}:{})};};
      // A failed command may have touched a stack, variable or scene: roll back
      // the entire instruction, so retry/save never passes an unresolved opcode.
      const before=clone(s);
      s.pc++;
      try {
      switch(i.op) {
        case 'legacy':if(!legacySupported(i.argument))this.fail(i,'Unresolved legacy command');if(i.argument.startsWith('_Xvib'))this.warn(i,'PS2 controller vibration omitted');break;
        case 'ZZ':break;
        case 'ZY':s.condition=1;break; // 0x14ab40..6c: a label reached by fallthrough closes a taken branch.
        case 'CALC':
          if(i.selection){
            s.messageVisible=true;
            s.pending={kind:'choice',id:i.id,occurrenceId:this.makeId(),assignment:i.assignment,options:this.choiceOptions(i),source:{script:script.source,offset:i.offset}};
          } else this.assign(i.assignment,evaluate(i.expression,s.vars));break;
        case 'IF__':s.condition=conditionOverride&&conditionOverride.argument===i.argument?conditionOverride.value:evaluate(i.expression,s.vars);break;
        case 'IFJP':if(s.condition<=0)this.jump(i.target,i,true);break;
        case 'ELS_':s.condition=Number(!s.condition);break;
        case 'EIF_':s.condition=s.condition===0?(conditionOverride&&conditionOverride.argument===i.argument?conditionOverride.value:evaluate(i.expression,s.vars)):-1;break;
        case 'GOTO':this.jump(i.target,i);break;
        case 'FCAL': {
          // Executable 0x14c12c..138 rejects calls outside [400,9000).
          // The shipped 9070/9077 callsites therefore do not load a scenario.
          if(integer()<400||integer()>=9000)break;
          if(s.stack.length>=4)break; // 0x14c14c skips an over-depth call.
          const name=`SEEN${String(integer()).padStart(4,'0')}.MZX`;await this.loadScript(name);
          s.stack.push({script:s.script,pc:s.pc});s.script=name;s.pc=0;if(args[1]!=null)this.jump('Z'+args[1],i);break;
        }
        case 'FRET': {const parent=s.stack.pop();if(!parent)break; // 0x14c0ac: empty native return is a no-op.
          s.script=parent.script;s.pc=parent.pc;break;}
        case 'JUMP':s.script=`SEEN${String(integer()).padStart(4,'0')}.MZX`;await this.loadScript(s.script);s.pc=0;if(args[1]!=null)this.jump('Z'+args[1],i);break;
        case 'LNIN':for(let j=900;j<906;j++)s.vars.F[j]=0;break;
        case 'LNST':this.assign({bank:'F',index:900+integer(),operator:'='},integer(1));break;
        case 'NCK0':case 'NCK1':case 'NCK2':case 'NSC0':case 'NSC1': {
          // 0x14cd10/ccb4/cea8: compare family/first/both and write F[index].
          // 0x147488 returns equality, 0x1474c8 tests substring membership.
          // Custom input and byte-truncated names require the original name UI.
          if(JSON.stringify(s.names)!==JSON.stringify(this.content.nativeData.default_names))this.fail(i,'Custom-name byte comparisons are not yet supported');
          const both=i.op==='NCK2',count=both?3:2;
          if(args.length!==count||! /^(?:\d+|F\[\d+\])$/.test(args[count-1])||Number(args[count-1].replace(/\D/g,''))>65535)this.fail(i,'Untested name-check parameters');
          const name=i.op.endsWith('0')?s.names.family:s.names.first;
          const value=both?s.names.family===args[0]&&s.names.first===args[1]:i.op.startsWith('NSC')?name.includes(args[0]):name===args[0];
          this.assign({bank:'F',index:Number(args[count-1].replace(/\D/g,'')),operator:'='},Number(value));break;
        }
        case 'NCK3': {
          const filter=this.content.nativeData.name_filter;if(!filter||args.length!==1)this.fail(i,'Missing native name-filter table');
          this.assign({bank:'F',index:integer(),operator:'='},Number(!filter.some(t=>s.names.family.includes(t)||s.names.first.includes(t))));break;
        }
        case 'STTI':s.title=args.join(',').replace(/^"|"$/g,'');break;
        case 'DDAT':s.date=args[0];break;
        case 'WNTY':s.window=integer();break;
        // W dispatcher 0x14d6fc -> 0x14d410 -> 0x12c1e8(0).
        // The flag at 0x1cfe14 drives window alpha in 0x12e460.
        case 'WCOF':s.messageVisible=false;this.warn(i,'Original message window fade rendered instantly; visibility target retained');break;
        case 'MSIZ':s.textSize=integer();break;
        case 'MCOL':if(args.length!==3||args.some((_,n)=>integer(n)<0||integer(n)>255))this.fail(i,'Invalid source text colour');s.textColour=args.map(Number);this.warn(i,'Source text colour retained in state; reader colour used for accessibility');break;
        case 'MJPS':case 'MJPE':case 'FAOA':case 'FAIA': // M and F dispatch have no such subcommands.
        case 'MCON':case 'MCOF':case 'CLMW':case 'WASS':case 'WASR':case 'WAON':case 'WAOF':break; // Absent from their complete native dispatcher branches.
        case 'STBG':this.background(args[0],i);break;
        case 'FADB':this.compose(args[1],i);if(integer())this.warn(i,'Fade is an immediate scene update; transition effect is not reproduced');break;
        case 'FADZ': {
          const count=integer(2);if(![1,2].includes(count)||args.length!==3+count*4)this.fail(i,'Untested multi-actor scene');
          this.background(args[0],i);s.scene.layers=[];
          for(let n=0;n<count;n++){const at=3+n*4,alpha=integer(at+3);if(integer(at+2)!==0||alpha<0||alpha>255)this.fail(i,'Untested actor placement/alpha');this.compose(args[at],i,true,integer(at+1),alpha/255);}
          this.warn(i,'Multi-actor placement/layering/alpha retained; transition rendered instantly');break;
        }
        case 'FADF':this.compose(null,i);if(integer())this.warn(i,'Fade is an immediate scene update; transition effect is not reproduced');break;
        case 'FADE':this.background(integer()===1?'siro':'kuro',i);this.compose(null,i);break;
        case 'CHCL':s.scene.layers=[];break;
        case 'KEI0':case 'KEI1':case 'KEI2':case 'KEI3':s.scene.layers=[];this.warn(i,'Native character-clear transition rendered instantly');break;
        case 'VIOL':s.vars.F[1130]=integer()<0?integer():integer()+30;this.warn(i,'Violin screen shake omitted; source F[1130] retained');break;
        case 'VIO1':s.vars.F[1130]=0;this.warn(i,'One-shot violin screen shake/timing omitted; source F[1130] retained');break;
        case 'BXDK':case 'BXNG':case 'BXFL':this.warn(i,'Source screen transition/flash omitted');break;
        case 'SHAK':integer();this.warn(i,'Native screen shake and its effect duration omitted (0x14d314 / 0x12cb10)');break;
        case 'SPIA':s.paletteMode=1;this.warn(i,'Source background palette mode 1 retained; colour effect is not yet rendered (0x14d420 / 0x12c368)');break;
        case 'MPL1':case 'MPLY': {const index=this.content.nativeData.music[args[0]];if(index==null)this.fail(i,'Unknown music label');s.scene.music={asset:this.asset(`music:${index}`,i),loop:i.op!=='MPL1'};if(i.op==='MPL1')this.warn(i,'One-shot source BGM retained; fade-in is immediate');break;}
        case 'MVOL':if(integer()<0||integer()>255)this.fail(i,'Invalid source music volume');s.scene.musicGain=integer()/255;this.warn(i,'Source music volume target retained; envelope immediate');break;
        case 'MFAD':s.scene.music=null;this.warn(i,'Music fade currently stops immediately');break;
        case 'MSTP':s.scene.music=null;break;
        case 'SEPL':case 'SELP': {
          if(args.length<1||args.length>3)this.fail(i,'Untested sound command parameters');
          const resource=this.content.nativeData.sound_lookup?.names[args[0].toUpperCase()];
          if(!resource)this.fail(i,'Unresolved original sound name '+args[0]);
          const asset=this.asset(resource.asset,i),channel='source-sound:'+(args.length>1?integer(1)&1:0),fade=args.length>2?integer(2):0;
          if(fade<0||fade>3600000)this.fail(i,'Untested sound fade duration');
          effects.push({op:'stopSound',channel},{op:'sound',asset,channel,loop:i.op==='SELP'});
          if(fade)this.warn(i,'Original sound fade-in rendered as immediate playback');break;
        }
        case 'SESP':case 'SEFD': {
          const channel=integer();if(i.op==='SESP'&&channel>=5)break;if(![0,1].includes(channel))this.fail(i,'Untested sound-stop channel');
          if(args.length!==(i.op==='SEFD'?2:1))this.fail(i,'Untested sound-stop parameters');
          if(i.op==='SEFD'){if(integer(1)<0||integer(1)>3600000)this.fail(i,'Untested sound fade duration');this.warn(i,'Original sound fade-out rendered as immediate stop');}
          effects.push({op:'stopSound',channel:'source-sound:'+channel});break;
        }
        case 'VPL2':case 'VPLY': {
          // 0x14d544..56c leaves the queued clip unchanged for an underscore.
          // The normal text boundary has already consumed/cleared that clip.
          if(/^[A-Z]_{5}$/.test(args[0]||''))break;
          const m=/^[A-Z]([0-9a-fA-F]+)$/.exec(args[0]||'');if(!m)this.fail(i,'Unknown voice selector');s.voice=this.asset(`voice:${parseInt(m[1],16)}`,i);s.voiceInProgress=false;
          if(i.op==='VPL2'){s.immediateVoice={asset:s.voice,source:i.id,elapsedMs:0};effects.push({op:'voice',asset:s.voice});s.voice=null;}break;
        }
        case 'VCWT': {const a=this.content.assets[s.immediateVoice?.asset];wait(a?Math.max(0,a.samples/a.sampleRate*1000-s.immediateVoice.elapsedMs):0);s.pending.voiceWait=true;break;}
        // 0x14c798 emits the native ^ line marker; 0x1205fc handles the newline.
        case 'ZM':case 'MNWL':s.buffer.push({script:s.script,pc});break;
        // 0x14c858: separate simultaneous text slot, inserts a newline in the
        // primary buffer; 0x147178 applies the same player-name substitutions.
        case 'MSNL':
          if(args.length<3||![1,2].includes(integer())||integer(1)<0||integer(1)>19)this.fail(i,'Untested simultaneous text parameters');
          s.buffer.push({script:s.script,pc});
          this.warn(i,'Simultaneous text retained on the same page; native slot positioning and speaker palette normalized');break;
        case 'WTKY':case 'WTK2':case 'WTVT': {
          if(i.op==='WTVT'&&(args.length!==1||integer()<=0||integer()>3600000))this.fail(i,'Untested voice cue timing');
          const parts=s.buffer.slice(s.presentedParts),full=this.message();
          if(!parts.length){if(i.op==='WTVT')this.fail(i,'Voice cue without new text is not implemented');s.pending={kind:'pause',id:i.id,display:clone(s.lastMessage),...(s.messageVisible===false?{hideText:true}:{})};break;}
          s.messageVisible=true; // Original text update calls 0x12c1e8(1) at 0x14f068.
          const message=this.message(parts),ids=parts.map(p=>this.scripts[p.script].instructions[p.pc].id);
          s.pending={kind:'text',id:ids.join('+'),occurrenceId:this.makeId(),...message,speaker:full.speaker,voice:s.voice,
            ...(s.presentedParts?{displayText:full.text}:{}),
            ...(s.voiceInProgress?{continueVoice:true}:{}),...(i.op==='WTVT'?{voiceUntilMs:voiceCueTime(integer())}:{}),
            source:{script:script.source,offset:i.offset,segments:ids},boundary:i.id,continuation:i.op!=='WTKY'};
          s.lastMessage=full;break;
        }
        case 'ECTS':if(args.length!==1||integer()!==4)this.fail(i,'Untested source clock');s.clocks??={};s.clocks[4]=0;break;
        case 'ECTW': {
          if(args.length!==2||integer(1)!==4||s.clocks?.[4]==null)this.fail(i,'Source clock not started');
          // 0x147590 returns signed16, then 0x14b860 converts to 60 Hz ticks.
          const target=Math.trunc((integer()<<16>>16)*60/1000)*1000/60;
          wait(Math.max(0,target-s.clocks[4]));s.pending.clockTarget=target;s.pending.clock=4;
          const p=this.messagePresentation(i);if(p){s.pending.presentation=p;s.pending.display=clone(s.lastMessage);}this.warn(i,'Timed text uses original signed16 targets; animation elapsed time is approximated');break;
        }
        case 'WTTM':case 'WTTK':{wait(integer());const p=this.messagePresentation(i);if(p){s.pending.presentation=p;s.pending.display=clone(s.lastMessage);}break;}
        case 'MVPL':if(args.length!==2||integer()!==0||![0,1].includes(integer(1)))this.fail(i,'Untested source movie');s.scene.music=null;s.pending={kind:'movie',id:i.id,asset:this.asset('video:opening',i),hideText:true};break;
        case 'WAMS':s.messageSpeed=integer();break;
        case 'WATS':s.messageDelay=integer();break;
        case 'WAMR':s.messageSpeed=null;break;
        case 'WATR':s.messageDelay=null;break;
        case 'CLNV':case 'CLR_': {
          // 0x14b568/5fc flush to message/backlog and reset the source buffer.
          const p=this.messagePresentation(i);
          if(p){wait(0);s.pending.flushText=true;s.pending.presentation=p;s.pending.display=clone(s.lastMessage);break;}
          s.buffer=[];s.presentedParts=0;s.voice=null;s.voiceInProgress=false;break;
        }
        case 'CLOS':s.buffer=[];s.presentedParts=0;s.lastMessage=null;s.voice=null;s.voiceInProgress=false;s.messageVisible=false;break;
        case 'PLD_':case 'PLDB':case 'PLDS':break; // P dispatch has no runtime handler in this executable.
        case 'GCLS':case 'GMSA':case 'QK0_':break; // 0x3c5704: Q has no handler; G at 0x14c310 accepts only GOTO.
        case 'EVT1':
          if(![2,3,4,5,6,7].includes(integer(1)))this.fail(i,'Unresolved native event '+args[1]);
          this.warn(i,'Opening staff-credit animation omitted (native 0x13ab38 family)');break;
        case 'EVTS':case 'EVTN': {
          const task=s.scene.task;
          if(task?.id==='clannad-swing'){
            if(args.length!==2||integer()!==0||![1,2,3].includes(integer(1)))this.fail(i,'Untested swing signal');
            const signal=integer(1);
            if(signal===3){s.scene.task=null;break;}
            if(signal===1&&task.phase!=='lowered'||signal===2&&task.phase!=='hold')this.fail(i,'Unexpected swing phase');
            task.phase=signal===1?'clear':'spin';task.elapsedMs=0;break;
          }
          signalBasicEvent(this,i);
          if(i.op==='EVTS'){wait(0);s.pending.basicNative=true;const p=this.messagePresentation(i);if(p){s.pending.presentation=p;s.pending.display=clone(s.lastMessage);}}break;
        }
        case 'EVWT': {
          const task=s.scene.task;
          if(args.length)this.fail(i,'Untested native event wait');
          if(!task){wait(0);s.pending.basicNative=true;break;}
          if(task.id!=='clannad-swing')this.fail(i,'Untested overlapping native event wait');
          if(task.phase==='clear')wait(1000/60);
          else if(task.phase==='spin'){
            const presentation=this.messagePresentation(i);
            s.pending={kind:'pause',id:i.id,display:clone(s.lastMessage),nativeInput:true,...(presentation?{presentation}:{})};
          }
          else this.fail(i,'Unexpected native event wait phase');break;
        }
        case 'EVT0': {
          const event=integer(1),motion=this.content.nativeData.events?.[event];
          if(startBasicEvent(this,i,effects)){if(s.pending)break;wait(0);s.pending.basicNative=true;const p=this.messagePresentation(i);if(p){s.pending.presentation=p;s.pending.display=clone(s.lastMessage);}break;}
          if(motion?.kind==='actor-swing'){
            if(args.length!==4||integer()!==0||integer(2)!==0||integer(3)!==0||s.scene.task)this.fail(i,'Untested swing parameters or overlapping event');
            this.asset(motion.asset,i);this.asset(motion.sound_asset,i);
            s.scene.task={id:'clannad-swing',source:i.id,event,phase:'lower',elapsedMs:0};wait((motion.lower_frames+1)*1000/60);break;
          }
          if(motion?.kind==='actor-x-motion'){
            if(args.length!==4||integer()!==0||integer(2)!==0||integer(3)!==0)this.fail(i,'Untested native motion parameters');
            s.scene.task={id:'clannad-motion',source:i.id,event};wait(motionDuration(motion));
            if(motion.present_buffer){const presentation=this.messagePresentation(i);if(presentation){s.pending.presentation=presentation;s.pending.display=clone(s.lastMessage);s.pending.hideText=false;}}
            break;
          }
          if(motion?.kind==='actor-rotation'){
            if(args.length!==4||integer()!==0||integer(2)!==0||integer(3)!==0)this.fail(i,'Untested native rotation parameters');
            const asset=this.asset(motion.asset,i),a=this.content.assets[asset];
            s.scene.layers=[{asset,x:(motion.pivot[0]-a.width)/640*100,y:(motion.pivot[1]-a.height)/448*100,width:a.width/640*100,height:a.height/448*100}];
            s.scene.task={id:'clannad-rotation',source:i.id,event};wait(rotationDuration(motion));break;
          }
          if(motion?.kind==='eyecatch'){
            const variant=integer(2),v=motion.variants[variant];
            if(args.length!==4||integer()!==0||integer(3)!==0||!v)this.fail(i,'Untested native interlude parameters');
            for(const id of [v.background,v.strip,v.final_background])this.asset(id,i);
            s.scene.task={id:'clannad-eyecatch',source:i.id,event,variant};wait(eyecatchDuration(motion));s.pending.hideText=true;break;
          }
          if(event!==8)this.fail(i,'Unresolved native event '+args[1]);this.warn(i,'Opening logo animation omitted (native 0x13af18 family)');break;
        }
        case 'CALN':this.warn(i,'Calendar transition animation omitted; original script date/title retained');break;
        case 'RTMN':case 'RTM_':case 'END_':s.ended=true;s.pending={kind:'end',id:i.id};break;
      }
      } catch(error){this.state=before;throw error;}
      if(this.current)return {pending:this.current,effects};
    }
    throw new Error('CLANNAD instruction budget exceeded');
  }
  async advance(optionId) {
    const p=this.current;if(p?.kind==='end')return {pending:p,effects:[]};
    if(this.state.scene.task?.id==='clannad-swing'){
      const task=this.state.scene.task,data=this.content.nativeData.events[task.event];
      if(p?.kind==='pause'&&p.nativeInput){
        if(p.presentation){this.state.presentedParts=this.state.buffer.length;this.state.voiceInProgress=!!this.state.voice;}
        task.phase='finish';task.finishStartMs=task.elapsedMs||0;
        const ms=swingFinishDuration(data,task.finishStartMs);
        this.state.pending={kind:'wait',id:p.id,ms,remainingMs:ms,display:clone(p.display)};
        return {pending:this.current,effects:[]};
      }
      if(p?.kind==='wait'&&task.phase==='lower'){
        for(const l of this.state.scene.layers)l.y+=data.lower_pixels*data.y_scale/448*100;
        task.phase='lowered';task.elapsedMs=0;
      }else if(p?.kind==='wait'&&task.phase==='clear'){this.state.scene.layers=[];task.phase='hold';task.elapsedMs=0;}
      else if(p?.kind==='wait'&&task.phase==='finish')this.state.scene.task=null;
    }
    if(p?.kind==='wait'&&this.state.clocks)for(const k of Object.keys(this.state.clocks))this.state.clocks[k]+=p.ms;
    if(p?.kind==='wait'&&this.state.immediateVoice){this.state.immediateVoice.elapsedMs+=p.ms;if(p.voiceWait)this.state.immediateVoice=null;}
    if(p?.kind==='wait'&&p.presentation){this.state.presentedParts=this.state.buffer.length;this.state.voiceInProgress=!!this.state.voice;}
    if(p?.flushText){this.state.buffer=[];this.state.presentedParts=0;this.state.voice=null;this.state.voiceInProgress=false;}
    if(p?.kind==='wait'&&this.state.scene.task?.id==='clannad-eyecatch'){
      const task=this.state.scene.task,variant=this.content.nativeData.events[task.event].variants[task.variant];
      this.state.scene.background=variant.final_background;this.state.nextBackground=variant.final_background;this.state.scene.task=null;
    }
    if(p?.kind==='wait'&&['clannad-motion','clannad-rotation'].includes(this.state.scene.task?.id)){
      const motion=this.content.nativeData.events[this.state.scene.task.event];
      if(motion.clear_actor_at_end)this.state.scene.layers=[];
      else {const x=motionX(motion,motionDuration(motion));for(const layer of this.state.scene.layers)layer.x+=x/640*100;}
      this.state.scene.task=null;
    }
    if(p?.kind==='choice'){const option=p.options.find(o=>o.id===optionId);if(!option)throw new Error('Choose an available source option');this.assign(p.assignment,option.value);}
    if(p?.kind==='text'){
      if(p.continuation)this.state.presentedParts=this.state.buffer.length;
      else {this.state.buffer=[];this.state.presentedParts=0;}
      if(p.voiceUntilMs!=null)this.state.voiceInProgress=!!this.state.voice;
      else {this.state.voice=null;this.state.voiceInProgress=false;}
    }
    // WTKY following a concurrent native presentation is still a key wait,
    // but clears its consumed buffer before the next page. No duplicate text.
    if(p?.kind==='pause'&&this.scripts[this.state.script].instructions[this.state.pc-1]?.op==='WTKY'){
      this.state.buffer=[];this.state.presentedParts=0;this.state.voice=null;this.state.voiceInProgress=false;
    }
    this.state.pending=null;return this.run();
  }
  save(media={}){return {format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,runtime:'clannad-ps2-hunex',savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  async restore(save) {
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature||save.runtime!=='clannad-ps2-hunex')throw new Error('Save is for another game, content revision or format');
    const s=clone(save.state);
    if(s&&s.messageVisible===undefined)s.messageVisible=true; // Prior format-v1 saves.
    if(s&&s.voiceInProgress===undefined)s.voiceInProgress=false;
    if(!s||!Array.isArray(s.stack)||s.stack.length>4||!Array.isArray(s.buffer)||s.buffer.length>100||!s.scene||!s.vars||!s.names||typeof s.names.family!=='string'||typeof s.names.first!=='string')throw new Error('Malformed saved execution state');
    if(!Number.isInteger(s.presentedParts)||s.presentedParts<0||s.presentedParts>s.buffer.length||!Number.isInteger(s.condition)||typeof s.ended!=='boolean'||typeof s.messageVisible!=='boolean'||typeof s.voiceInProgress!=='boolean'||s.names.family.length>24||s.names.first.length>24||!Array.isArray(s.scene.layers)||s.scene.layers.length>16||!Array.isArray(s.warnings))throw new Error('Invalid saved state fields');
    if(s.pending&&!['text','choice','wait','pause','end','movie'].includes(s.pending.kind))throw new Error('Unknown saved presentation kind');
    for(const frame of [{script:s.script,pc:s.pc},...s.stack,...s.buffer]){const script=await this.loadScript(frame.script);if(!Number.isInteger(frame.pc)||frame.pc<0||frame.pc>script.instructions.length)throw new Error('Invalid saved source position');}
    if(s.scene.task?.id==='clannad-swing')await this.loadScript(String(s.scene.task.source).split(':')[0]);
    if(s.immediateVoice)await this.loadScript(String(s.immediateVoice.source).split(':')[0]);
    for(const task of Object.values(s.nativeChannels||{}))await this.loadScript(String(task?.source).split(':')[0]);
    for(const bank of ['F','G','Z'])if(!s.vars[bank]||Object.entries(s.vars[bank]).some(([k,v])=>!/^\d+$/.test(k)||Number(k)>65535||!Number.isInteger(v)||v < -32768||v>32767))throw new Error('Invalid saved variables');
    // Earlier imports missed the native new-game F[500]=1 default. The supplied
    // scripts only assign this cell to 1; an absent cell can be repaired safely.
    if(this.content.nativeData.initial_f?.[500]===1&&!Object.hasOwn(s.vars.F,500))s.vars.F[500]=1;
    for(const [id,type] of [[s.scene.background,'image'],[s.nextBackground,'image'],[s.scene.music?.asset,'music'],...s.scene.layers.map(l=>[l.asset,'image']),[s.voice,'voice'],[s.immediateVoice?.asset,'voice']])if(id!=null&&this.content.assets[id]?.type!==type)throw new Error('Saved media unavailable');
    if(s.scene.layers.some(l=>['x','y','width','height'].some(k=>!Number.isFinite(l[k])||Math.abs(l[k])>2000)||l.opacity!=null&&(!Number.isFinite(l.opacity)||l.opacity<0||l.opacity>1)||l.width<=0||l.height<=0||Object.keys(l).some(k=>!['asset','x','y','width','height','opacity'].includes(k)))||Object.keys(s.scene.sprites||{}).length)throw new Error('Invalid saved image composition');
    if(s.clocks&&Object.entries(s.clocks).some(([k,v])=>k!=='4'||!Number.isFinite(v)||v<0||v>86400000))throw new Error('Invalid source clock');
    if(s.immediateVoice&&(!Number.isFinite(s.immediateVoice.elapsedMs)||s.immediateVoice.elapsedMs<0||s.immediateVoice.elapsedMs>86400000))throw new Error('Invalid immediate voice position');
    const boundary=this.scripts[s.script].instructions[s.pc-1];
    if(s.pending&&boundary?.id!==(s.pending.boundary||s.pending.id))throw new Error('Saved presentation/source boundary mismatch');
    const previous=this.state;this.state=s;
    try {
      validateBasicChannels(this);
      if(s.immediateVoice){const v=s.immediateVoice,i=this.scripts[v.source.split(':')[0]].instructions.find(i=>i.id===v.source);if(i?.op!=='VPL2'||! /^[A-Z][0-9a-f]+$/i.test(i.args[0])||v.asset!==`voice:${parseInt(i.args[0].slice(1),16)}`)throw new Error('Invalid immediate voice source');}
      if(s.scene.musicGain!=null&&(!Number.isFinite(s.scene.musicGain)||s.scene.musicGain<0||s.scene.musicGain>1))throw new Error('Invalid saved music volume');
      if(s.scene.task?.id==='clannad-swing')this.validateSwing(boundary);
      if(s.pending?.kind==='text'){
        if(s.buffer.some(p=>!this.isMessageSource(this.scripts[p.script].instructions[p.pc]))||typeof s.pending.occurrenceId!=='string')throw new Error('Invalid saved message sources');
        const parts=s.buffer.slice(s.presentedParts),full=this.message(),msg=this.message(parts);
        if(msg.text!==s.pending.text||JSON.stringify(msg.dialogue)!==JSON.stringify(s.pending.dialogue)||full.speaker!==s.pending.speaker||s.pending.id!==parts.map(p=>this.scripts[p.script].instructions[p.pc].id).join('+')||(s.pending.displayText??null)!==(s.presentedParts?full.text:null))throw new Error('Saved text differs from source');
        if(!['WTKY','WTK2','WTVT'].includes(boundary.op)||s.pending.continuation!==(boundary.op!=='WTKY')||s.pending.voice!==s.voice||!!s.pending.continueVoice!==s.voiceInProgress||(s.pending.voiceUntilMs??null)!==(boundary.op==='WTVT'?voiceCueTime(Number(boundary.args[0])):null))throw new Error('Saved message/voice boundary differs from source');
      } else if(s.pending?.kind==='choice') {
        const i=boundary;
        if(s.pending.nativeChoice===77){
          if(i.op!=='EVT0'||Number(i.args[1])!==77||!basicEventSupported(i.args)||typeof s.pending.occurrenceId!=='string'||s.pending.promptAsset!==this.content.nativeData.basic_events[77].prompt_asset||JSON.stringify(s.pending.options)!==JSON.stringify(this.nativeChoiceOptions(77))||JSON.stringify(s.pending.assignment)!==JSON.stringify({bank:'F',index:1090,operator:'='}))throw new Error('Invalid native data-transfer choice');return this.current;
        }
        if(i?.id!==s.pending.id||!['SEL','SEB'].includes(i?.selection?.kind)||typeof s.pending.occurrenceId!=='string'||JSON.stringify(s.pending.assignment)!==JSON.stringify(i.assignment)||JSON.stringify(s.pending.options)!==JSON.stringify(this.choiceOptions(i)))throw new Error('Saved choices differ from source');
      } else if(s.pending?.kind==='wait'){
        if(s.pending.flushText){
          if(!['CLR_','CLNV'].includes(boundary.op)||s.pending.ms!==0||s.pending.remainingMs!==0||!s.pending.presentation)throw new Error('Invalid saved flush boundary');this.validateMessage(s.pending.presentation,boundary);return this.current;
        }
        if(s.pending.clock===4){
          const target=Math.trunc((Number(boundary.args?.[0])<<16>>16)*60/1000)*1000/60;
          if(boundary.op!=='ECTW'||Number(boundary.args[1])!==4||s.clocks?.[4]==null||s.pending.clockTarget!==target||s.pending.ms!==Math.max(0,target-s.clocks[4])||!Number.isFinite(s.pending.remainingMs)||s.pending.remainingMs<0||s.pending.remainingMs>s.pending.ms)throw new Error('Invalid saved source clock wait');
          if(s.pending.presentation)this.validateMessage(s.pending.presentation,boundary);return this.current;
        }
        if(s.pending.voiceWait){
          const a=this.content.assets[s.immediateVoice?.asset];const duration=a?Math.max(0,a.samples/a.sampleRate*1000-s.immediateVoice.elapsedMs):0;
          if(boundary.op!=='VCWT'||s.pending.ms!==duration||!Number.isFinite(s.pending.remainingMs)||s.pending.remainingMs<0||s.pending.remainingMs>duration)throw new Error('Invalid saved voice completion wait');return this.current;
        }
        if(s.pending.basicNative){
          if(s.pending.ms!==0||s.pending.remainingMs!==0||!(boundary.op==='EVT0'&&basicEventSupported(boundary.args)||['EVTS','EVWT'].includes(boundary.op)))throw new Error('Invalid basic native boundary');
          if(s.pending.presentation){this.validateMessage(s.pending.presentation,boundary);if(JSON.stringify(s.pending.display)!==JSON.stringify(this.message()))throw new Error('Invalid native text display');}
          return this.current;
        }
        if(s.scene.task?.id==='clannad-swing'){
          this.validateSwing(boundary);
          const task=s.scene.task,data=this.content.nativeData.events[task.event];
          const duration=task.phase==='lower'?(data.lower_frames+1)*1000/60:task.phase==='clear'?1000/60:task.phase==='finish'?swingFinishDuration(data,task.finishStartMs):Number(boundary.args?.[0]);
          if(!Number.isFinite(duration)||s.pending.ms!==duration||!Number.isFinite(s.pending.remainingMs)||s.pending.remainingMs<0||s.pending.remainingMs>duration)throw new Error('Invalid saved swing wait');
          return this.current;
        }
        const task=s.scene.task,kinds={'clannad-motion':'actor-x-motion','clannad-rotation':'actor-rotation','clannad-eyecatch':'eyecatch'},motion=kinds[task?.id]&&this.content.nativeData.events?.[task.event];
        if(task&&(!motion||motion.kind!==kinds[task.id]))throw new Error('Invalid saved native animation');
        if(motion?.kind==='eyecatch'&&(!Number.isInteger(task.variant)||!motion.variants[task.variant]||task.variant!==Number(boundary.args[2])))throw new Error('Invalid saved interlude variant');
        const duration=motion?(motion.kind==='eyecatch'?eyecatchDuration(motion):motion.kind==='actor-rotation'?rotationDuration(motion):motionDuration(motion)):Number(boundary.args?.[0]);
        if(motion?(boundary.op!=='EVT0'||task.source!==boundary.id||Number(boundary.args[1])!==task.event):!['WTTM','WTTK'].includes(boundary.op))throw new Error('Invalid saved wait source');
        if(s.pending.ms!==duration||!Number.isFinite(s.pending.remainingMs)||s.pending.remainingMs<0||s.pending.remainingMs>s.pending.ms)throw new Error('Invalid saved timing');
        // Derive presentation visibility from the verified native task, including
        // old saves that predate this optional reader display hint.
        if(motion?.kind==='eyecatch'||!s.messageVisible)s.pending.hideText=true;else if(Object.hasOwn(s.pending,'hideText'))s.pending.hideText=false;
        if(s.pending.presentation){
          if(!(motion?.present_buffer||['WTTM','WTTK'].includes(boundary.op))||s.pending.presentation.continuation!==true||s.pending.presentation.voiceUntilMs!=null)throw new Error('Invalid saved concurrent native message');
          this.validateMessage(s.pending.presentation,boundary);
          if(JSON.stringify(s.pending.display)!==JSON.stringify(this.message()))throw new Error('Saved native display differs from source');
        } else if(motion?.present_buffer&&s.buffer.length>s.presentedParts)throw new Error('Saved native message is missing');
      }
      else if(s.pending?.kind==='pause'){
        if(s.pending.basicNative){
          const d=this.content.nativeData.basic_events?.[boundary.args?.[1]],text=d?.notices?.[Number(boundary.args?.[2])];
          if(boundary.op!=='EVT0'||!basicEventSupported(boundary.args)||!text||s.pending.display?.text!==text)throw new Error('Invalid native notice');return this.current;
        }
        if(s.pending.nativeInput){this.validateSwing(boundary);if(boundary.op!=='EVWT'||s.scene.task.phase!=='spin')throw new Error('Invalid saved swing input');}
        else if(!['WTKY','WTK2'].includes(boundary.op))throw new Error('Invalid saved key wait');
        if(s.pending.presentation){if(!s.pending.nativeInput)throw new Error('Invalid saved native message');this.validateMessage(s.pending.presentation,boundary);}
        else if(s.pending.nativeInput&&s.buffer.length>s.presentedParts)throw new Error('Saved native message is missing');
        if(JSON.stringify(s.pending.display)!==JSON.stringify(s.lastMessage))throw new Error('Invalid saved key wait text');
      }
      else if(s.pending?.kind==='movie'){if(boundary.op!=='MVPL'||Number(boundary.args[0])!==0||s.pending.asset!=='video:opening'||this.content.assets[s.pending.asset]?.type!=='video')throw new Error('Invalid saved source movie');}
      else if(s.pending?.kind==='end'&&(!s.ended||!['END_','RTMN','RTM_'].includes(boundary.op)))throw new Error('Invalid saved end state');
      return this.current;
    }catch(error){this.state=previous;throw error;}
  }
  validateSwing(boundary) {
    const t=this.state.scene.task,d=this.content.nativeData.events[t?.event];
    if(t?.id!=='clannad-swing'||d?.kind!=='actor-swing'||!['lower','lowered','clear','hold','spin','finish'].includes(t.phase)||!Number.isFinite(t.elapsedMs)||t.elapsedMs<0||t.elapsedMs>86400000)throw new Error('Invalid saved swing state');
    const source=this.scripts[t.source.split(':')[0]]?.instructions.find(i=>i.id===t.source);
    if(source?.op!=='EVT0'||Number(source.args[1])!==t.event||this.content.assets[d.asset]?.type!=='image'||this.content.assets[d.sound_asset]?.type!=='sound')throw new Error('Invalid saved swing origin/assets');
    if(t.phase==='lower'&&(boundary.op!=='EVT0'||t.source!==boundary.id)||['clear','spin','finish'].includes(t.phase)&&boundary.op!=='EVWT')throw new Error('Invalid saved swing source');
    if(t.phase==='finish'&&(!Number.isFinite(t.finishStartMs)||t.finishStartMs<0))throw new Error('Invalid saved swing retirement');
  }
}
