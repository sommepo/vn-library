/* Never7 SLPS-25256 oscr interpreter. Source data stays in the private import.
 * Native transitions currently settle immediately; missing media is reported.
 * Unknown story/state operations stop at their original source word. */
import {randomId,signature} from '../engine.mjs';
import {evaluateNever7Predicate} from './never7-predicate.mjs';
import {routeStatus,markComplete,validateManual} from './never7-progress.mjs';
import {validateReadPaths,inheritedRead} from './never7-read-paths.mjs';
const clone=structuredClone,s16=v=>v<<16>>16;
export function validateNever7Content(c){
  const errors=[];
  if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='never7-ps2-oscr'||c.runtime.version!==1)errors.push('Unsupported Never7 content');
  if(!c.runtime?.scripts?.[c.runtime.entry])errors.push('Missing Never7 entry');
  for(const [id,a]of Object.entries(c.assets||{}))if(!['image','script','music','voice','sound','video'].includes(a.type)||typeof a.url!=='string'||/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(a.url)||a.url.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.')))errors.push(`${id}: invalid asset`);
  return errors;
}
export class Never7Engine {
  static async create(content,options={}){
    const errors=validateNever7Content(content);if(errors.length)throw Error(errors.join('\n'));
    const e=new Never7Engine(content,options);e.native=await e.loadJSON(content.runtime.predicate);await e.loadScript(e.state.script);return e;
  }
  constructor(content,options={}){
    this.content=content;this.signature=signature({id:content.id,runtime:content.runtime});this.scripts={};
    this.makeId=options.makeId||randomId;this.onInstruction=options.onInstruction;
    this.loadJSON=options.loadJSON||(async url=>{const r=await fetch(new URL(url,options.baseURL),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Never7 data unavailable (${r.status})`);return r.json();});
    this.state={script:content.runtime.entry,pc:0,vars:{},globals:{},frame:null,choices:{},pending:null,
      scene:{background:null,sprites:{},layers:[],music:null},portraits:{},ended:false,
      warnings:[],chapter:0,date:null,previousText:'',voice:null,lastSound:null,window:true,nativeControls:{},manualCompletions:{}};
  }
  get current(){return this.state.pending;}
  fail(i,message){throw Error(`${i.id}: ${message}`);}
  warn(i,message){if(!this.state.warnings.some(w=>w.message===message))this.state.warnings.push({source:i.id,message});}
  async loadScript(name){
    if(this.scripts[name])return this.scripts[name];const ref=this.content.runtime.scripts[name];if(!ref)throw Error(`Never7 script absent: ${name}`);
    const d=await this.loadJSON(ref.url);if(d.format!=='vnkit.never7-script'||d.version!==1||d.source!==name||d.sha256!==ref.sha256)throw Error(`Never7 script identity mismatch: ${name}`);
    if(d.kind==='mend-credits')throw Error(`Credits presentation cannot be used as a story script: ${name}`);
    return this.scripts[name]=d;
  }
  async jump(address,overlay,i){
    const ref=Object.entries(this.content.runtime.scripts).find(([,r])=>r.address===address&&r.overlay===overlay);
    if(!ref)this.fail(i,`Unresolved script address ${overlay}:${address.toString(16)}`);
    await this.loadScript(ref[0]);this.state.script=ref[0];this.state.pc=0;
  }
  goto(script,label,from,i){
    const pc=script.labels[label]?.find(x=>x>=from+2);
    if(pc===undefined)this.fail(i,`Native label ${label} absent after word ${from}`);
    this.state.pc=pc;
  }
  calculate(i){
    const [,packed,op]=i.words,index=packed>>>16&0x7fff,raw=packed&65535,s=this.state;
    if(index>=768||(raw&0x8000)&&(raw&0x7fff)>=768)this.fail(i,'Variable outside native bank');
    // oscrGamedat2Sys(2) restores the persistent flags before the assignment;
    // mode 0 only latches a nonzero flag. Assigning zero cannot erase it.
    for(const n of this.native.persistentVariables)s.vars[n]=s.globals[n]?1:0;
    const a=s.vars[index]||0,b=raw&0x8000?(s.vars[raw&0x7fff]||0):s16(raw);let value;
    switch(op){case 0:value=b;break;case 1:value=a+1;break;case 2:value=a>0?a-1:a;break;
      case 3:value=a+b;break;case 4:value=a-b;break;
      case 5:value=s16(a*(raw&15));if(raw&0x8000)value&=b;break;
      case 6:value=raw&0x8000?a&b:a;break;
      default:this.fail(i,`Unaudited variable operation ${op}`);}
    s.vars[index]=s16(value);
    if(this.native.persistentVariables.includes(index)&&s.vars[index])s.globals[index]=true;
  }
  message(i,report=true){
    const raw=i.text;if(typeof raw!=='string')this.fail(i,'Missing Japanese source text');
    let text=raw.replace(/\\t\d+/g,'').replace(/\\[kp]/g,'');
    if(text.includes('\\'))this.fail(i,'Unsupported source text control');
    if(report&&/\\t\d+/.test(raw))this.warn(i,'In-line source pauses are displayed immediately');
    const speaker=i.code===0?'':(this.native?.speakerNames||[]).find(name=>text.startsWith(name)&&(this.native.speakerOpeners||[]).some(open=>text.startsWith(open,name.length)))||'';
    return {text:speaker?text.slice(speaker.length):text,speaker,clearAfter:raw.includes('\\p')};
  }
  image(kind,number,i){const id=`${kind}:${number}`;if(!this.content.assets[id])this.fail(i,`Original ${kind} resource unavailable: ${number}`);return id;}
  audio(kind,number,i){const id=`${kind}:${number}`;if(this.content.assets[id]?.type!==kind){this.warn(i,`Original audio unavailable: ${id}`);return null;}return id;}
  compose(){
    const s=this.state,bg=s.tallBackground;
    s.scene.layers=[...(bg?[{asset:bg.asset,x:bg.x/640*100,y:bg.y/480*100,width:this.content.assets[bg.asset].width/640*100,height:this.content.assets[bg.asset].height/480*100}]:[]),...Object.entries(s.portraits).sort(([a],[b])=>a-b).map(([,p])=>{
      const a=this.content.assets[p.asset];return{asset:p.asset,x:(p.x-a.width/2)/640*100,y:(514-a.height)/480*100,width:a.width/640*100,height:a.height/480*100};
    })];
  }
  portrait(slot,asset,x,i){this.state.portraits[slot]={asset:this.image('portrait',asset,i),x};this.compose();}
  async run(){const checkpoint=clone(this.state);try{return await this.runInternal();}catch(error){this.state=checkpoint;throw error;}}
  async runInternal(){
    if(this.current)return{pending:this.current,effects:[]};
    const effects=[];
    for(let step=0;step<20000;step++){
      const s=this.state,script=await this.loadScript(s.script),i=script.instructions[s.pc];
      if(!i||i.unsupported)throw Error(i?.unsupported||`${s.script}:${s.pc*4}: execution outside decoded instructions`);
      this.onInstruction?.(i,s);s.pc=i.next;
      const w=i.words,source={script:s.script,offset:i.offset};
      if(i.code===undefined){const msg=this.message(i);s.window=true;s.pending={kind:'text',id:i.id,occurrenceId:this.makeId(),...msg,displayText:s.previousText+msg.text,voice:s.voice,source};s.previousText=s.pending.displayText;s.voice=null;}
      else switch(i.code){
        case 0x00:if(w[1]<1||w[1]>16)this.fail(i,'Choice index out of bounds');s.choices[w[1]-1]={id:String(w[1]-1),...this.message(i),source:{...source,id:i.id}};break;
        case 0x01:{const count=w[2]>>>16;if(count<1||count>16)this.fail(i,'Invalid choice count');const options=Array.from({length:count},(_,n)=>s.choices[n]);if(options.some(x=>!x))this.fail(i,'Missing registered choice');s.pending={kind:'choice',id:i.id,occurrenceId:this.makeId(),options,source};break;}
        case 0x0d:break;
        case 0x0e:if(evaluateNever7Predicate(this.native,{overlay:script.overlay,address:script.address,selector:w[1],vars:s.vars}))this.goto(script,w[2],i.offset,i);break;
        case 0x0f:this.calculate(i);break;
        case 0x10:this.goto(script,w[1],0,i);break;
        case 0x33:this.goto(script,w[1],i.offset,i);break;
        case 0x17:s.frame={script:s.script,pc:s.pc};await this.jump(w[1],w[2],i);break;
        case 0x7b:s.frame={script:s.script,pc:s.pc};this.goto(script,w[1],i.offset,i);break;
        case 0x1e:if(!s.frame)this.fail(i,'Native return has no caller');s.script=s.frame.script;s.pc=s.frame.pc;await this.loadScript(s.script);break;
        case 0x7a:await this.jump(w[1],w[2],i);break;
        case 0x68:{const program=w[1]>>>16;if(program&&this.native.creditsPrograms&&!this.native.creditsPrograms[program])this.fail(i,`Unknown credits program ${program}`);s.ended=true;s.pending={kind:'end',id:i.id,source};s.scene.music=null;s.voice=null;s.lastSound=null;effects.push({op:'stopSound',channel:'never7:adx'});this.warn(i,'Native credits animation is omitted; earned progress returns to the library');break;}
        case 0x02:case 0x03:case 0x04:s.tallBackground=null;s.scene.background=this.image('background',w[1],i);s.portraits={};this.compose();break;
        case 0x05:case 0x06:case 0x7e:if(![0,1].includes(w[1]))this.fail(i,`Unverified fade colour ${w[1]}`);s.tallBackground=null;s.scene.background=this.image('background',185+w[1],i);s.portraits={};this.compose();this.warn(i,'Native fade transitions settle immediately');break;
        case 0x07:this.portrait(0,w[1],w[2],i);break;
        case 0x08:this.portrait(1,w[1],w[2],i);break;
        case 0x11:this.portrait(0,w[1],w[2],i);this.portrait(1,w[3],w[4],i);break;
        case 0x09:case 0x7c:delete s.portraits[0];this.compose();break;
        case 0x0a:case 0x7d:delete s.portraits[1];this.compose();break;
        case 0x32:s.portraits={};this.compose();break;
        case 0x15:{const asset=this.image('background',w[1],i),a=this.content.assets[asset];if(!(a.width===640&&a.height===960||a.width===1024&&a.height===480)||![2,3].includes(w[3]))this.fail(i,'Unverified native CG dimensions/position');s.tallBackground={asset,x:0,y:w[3]===2?0:-480};s.scene.background=null;s.portraits={};this.compose();this.warn(i,'Native CG pans settle immediately');break;}
        case 0x16:if(!s.tallBackground||![0,1].includes(w[1]))this.fail(i,'CG pan has no valid source');if(w[1]===0)s.tallBackground.y=0;else s.tallBackground.x=-384;this.compose();this.warn(i,'Native CG pans settle immediately');break;
        case 0x0c:s.window=Boolean(w[1]);break;
        case 0x18:s.chapter=w[1];break;
        case 0x14:s.date=w[1];this.warn(i,'Native calendar artwork not yet mapped');break;
        case 0x42:{const ms=w[1]*1000/60;if(ms>3600000)this.fail(i,'Wait outside bounds');if(ms)s.pending={kind:'wait',id:i.id,ms,remainingMs:ms,source};break;}
        case 0x3a:case 0x1c:s.previousText='';break;
        case 0x12:s.voice=this.audio('voice',w[2],i);break;
        case 0x58:s.voice=this.audio('voice',w[1],i);break;
        case 0x19:{const asset=this.audio('music',w[1],i);s.scene.music=asset?{asset,loop:true}:null;break;}
        case 0x1a:s.scene.music=null;this.warn(i,'Source audio fades settle immediately');break;
        case 0x2f:case 0x30:{
          // oscrSePlay waits for completion; oscrSeStart returns immediately.
          // These resources share the native on-memory ADX channel.
          const asset=this.audio(w[1]>>>16===0x982?'music':'sound',w[1],i);
          s.lastSound=asset;
          effects.push({op:'stopSound',channel:'never7:adx'});
          if(asset){
            const loop=i.code===0x30&&w[1]>>>16===0x981&&[0x12,0x13,0x14,0x15,0x16,0x18,0x19,0x2c,0x4f,0x58,0x5b].includes(w[1]&65535);
            effects.push({op:'sound',asset,channel:'never7:adx',loop});
            if(i.code===0x2f){s.pending={kind:'wait',id:i.id,ms:0,remainingMs:0,soundWait:{asset,channel:'never7:adx'},source};this.warn(i,'Native sound volume presets are not reproduced');}
          }break;
        }
        case 0x31:s.lastSound=null;effects.push({op:'stopSound',channel:'never7:adx'});this.warn(i,'Source audio fades settle immediately');break;
        case 0x99:if(s.lastSound)s.pending={kind:'wait',id:i.id,ms:0,remainingMs:0,soundWait:{asset:s.lastSound,channel:'never7:adx'},source};break;
        case 0x41:case 0x98:{
          const asset=`video:${w[1]}`;
          if(this.content.assets[asset]?.type!=='video'){this.warn(i,`Original movie unavailable: ${asset}`);break;}
          s.pending={kind:'movie',id:i.id,asset,source};s.scene.music=null;s.voice=null;s.lastSound=null;effects.push({op:'stopSound',channel:'never7:adx'});
          if(i.code===0x98)this.warn(i,'Native asynchronous movie is presented as a blocking movie');break;
        }
        case 0x13:this.warn(i,'Native prefetch is replaced by browser asset loading');break;
        case 0x1b:case 0x57:case 0x80:case 0x81:case 0x82:case 0x83:case 0x84:case 0x85:case 0x86:case 0x87:case 0x88:case 0x89:case 0x8a:case 0x8b:case 0x8c:case 0x8d:
          this.warn(i,'Native decorative effects, score/clock displays and vibration are not yet rendered');break;
        case 0x8e:case 0x8f:case 0x90:case 0x91:case 0x92:case 0x93:
          s.nativeControls[['menu','skip','save'][Math.floor((i.code-0x8e)/2)]]=Boolean(i.code&1);
          this.warn(i,'Native controller/menu locks are retained but browser controls stay available');break;
        case 0x94:case 0x96:case 0x97:break; // Dispatcher only increments PC.
        case 0x95:this.warn(i,'Movie-completion display reset has no movie in this build');break;
        default:this.fail(i,`Unsupported native command ${i.code.toString(16)}`);
      }
      if(this.current){if(this.current.kind==='wait')this.current.hideText=!s.window;return{pending:this.current,effects};}
    }
    throw Error(`${this.state.script}:${this.state.pc}: instruction budget exhausted`);
  }
  async advance(choice){const checkpoint=clone(this.state);try{
    const p=this.current;if(p?.kind==='end')return{pending:p,effects:[]};
    if(p?.kind==='choice'){const option=p.options.find(x=>x.id===String(choice));if(!option)throw Error('Choose a visible option');this.state.vars[16]=Number(option.id);this.state.choices={};}
    if(p?.clearAfter)this.state.previousText='';this.state.pending=null;return await this.runInternal();
  }catch(error){this.state=checkpoint;throw error;}}
  save(media={}){return{format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  async restore(save){
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Never7 save');
    const s=clone(save.state),before=this.state;
    if(s)s.manualCompletions=validateManual(s.manualCompletions);
    if(!s||!Number.isInteger(s.pc)||!s.vars||!s.globals||!s.scene||!s.portraits||!s.choices||!s.nativeControls||!Array.isArray(s.warnings)||s.warnings.length>100||Object.entries(s.vars).some(([k,v])=>!/^\d+$/.test(k)||+k>=768||!Number.isInteger(v)||v<-32768||v>32767)||Object.entries(s.globals).some(([k,v])=>!this.native.persistentVariables.includes(+k)||v!==true))throw Error('Invalid Never7 state');
    const script=await this.loadScript(s.script);
    if(s.pc!==script.word_count&&!script.instructions[s.pc])throw Error('Invalid saved instruction position');
    if(s.frame){const f=await this.loadScript(s.frame.script);if(!f.instructions[s.frame.pc])throw Error('Invalid saved caller');}
    if(s.pending){const p=s.pending,origin=await this.loadScript(p.source?.script),i=origin.instructions[p.source?.offset];if(!i||i.id!==p.id)throw Error('Invalid saved presentation');
      if(p.kind==='text'){const msg=this.message(i,false);if(i.code!==undefined||msg.text!==p.text||msg.speaker!==p.speaker||msg.clearAfter!==p.clearAfter||!p.displayText?.endsWith(msg.text)||typeof p.occurrenceId!=='string')throw Error('Saved text differs from source');}
      else if(p.kind==='choice'){
        if(i.code!==1||!Array.isArray(p.options)||p.options.length!==(i.words[2]>>>16)||p.options.some((x,n)=>x.id!==String(n)||JSON.stringify(x)!==JSON.stringify(s.choices[n])))throw Error('Invalid saved choices');
        for(const option of p.options){const origin=await this.loadScript(option.source?.script),command=origin.instructions[option.source?.offset];if(command?.code!==0||command.id!==option.source?.id||String(command.words[1]-1)!==option.id||option.text!==this.message(command,false).text)throw Error('Saved choices differ from source');}
      }
      else if(p.kind==='wait'){
        const maximum=i.code===0x42?i.words[1]*1000/60:[0x2f,0x99].includes(i.code)?0:NaN;
        if(!Number.isFinite(maximum)||!Number.isFinite(p.remainingMs)||p.remainingMs<0||p.remainingMs>maximum)throw Error('Invalid saved timer');
        if([0x2f,0x99].includes(i.code)&&(!p.soundWait||p.soundWait.asset!==s.lastSound||p.soundWait.channel!=='never7:adx'))throw Error('Invalid saved sound wait');
      }
      else if(p.kind==='end'){if(i.code!==0x68||!s.ended)throw Error('Invalid saved ending');}
      else if(p.kind==='movie'){if(![0x41,0x98].includes(i.code)||p.asset!==`video:${i.words[1]}`||this.content.assets[p.asset]?.type!=='video')throw Error('Invalid saved movie');}
      else if(!['wait','end'].includes(p.kind))throw Error('Invalid pending kind');
    }
    for(const p of Object.values(s.portraits))if(!this.content.assets[p.asset]||!Number.isFinite(p.x))throw Error('Invalid portrait in save');
    if(s.scene.background&&!this.content.assets[s.scene.background])throw Error('Invalid background in save');
    if(s.scene.music&&this.content.assets[s.scene.music.asset]?.type!=='music')throw Error('Invalid saved music');
    for(const asset of [s.voice,s.pending?.voice])if(asset&&this.content.assets[asset]?.type!=='voice')throw Error('Invalid saved voice');
    if(s.lastSound&&!['sound','music'].includes(this.content.assets[s.lastSound]?.type))throw Error('Invalid saved sound');
    if(s.tallBackground&&(!this.content.assets[s.tallBackground.asset]||!Number.isFinite(s.tallBackground.x)||!Number.isFinite(s.tallBackground.y)))throw Error('Invalid CG in save');
    try{this.state=s;this.compose();}catch(error){this.state=before;throw error;}
    return{pending:this.current,effects:[],restored:true};
  }
  progressSnapshot(){return{format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,globals:clone(this.state.globals),manualCompletions:clone(this.state.manualCompletions)};}
  applyProgress(p){if(!p)return;if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature||!p.globals||Object.entries(p.globals).some(([k,v])=>!this.native.persistentVariables.includes(+k)||v!==true))throw Error('Invalid Never7 progress');const manual=validateManual(p.manualCompletions);this.state.globals=clone(p.globals);this.state.manualCompletions=manual;for(const n of this.native.persistentVariables)this.state.vars[n]=p.globals[n]?1:0;}
  routeProgress(){return routeStatus(this);}
  async loadReadPaths(){
    this.readPaths={};this.readPathWarning='';
    try{this.readPaths=validateReadPaths(await this.loadJSON('read-paths.json'),this);}
    catch{this.readPathWarning='Completed-route read paths are unavailable for this import; normally encountered text still counts as read.';}
  }
  isInheritedRead(id){return inheritedRead(this,id);}
  markRouteComplete(id){return markComplete(this,id);}
  progressNotice(){return this.state.globals[70]?'Cure and Append stories are unlocked.':this.state.globals[57]?'Cure is unlocked. Continue from Start again to follow its route.':'Complete Yuka, Haruka, Saki and Kurumi to unlock Cure.';}
  newGameEntries(){return [{id:'start',label:'Start again'},...(this.native.appendEntries||[]).filter(e=>e.requires.every(n=>this.state.globals[n])).map(({id,label,group})=>({id,label,group}))];}
  async startNew(progress,entry='start'){
    if(this.state.pc||this.current)throw Error('New game requires a fresh engine');
    this.applyProgress(progress);
    if(!this.newGameEntries().some(e=>e.id===entry))throw Error('This story has not been unlocked');
    if(entry!=='start'){
      const target=this.native.appendEntries.find(e=>e.id===entry);
      await this.loadScript(target.script);this.state.script=target.script;
    }
    return this.run();
  }
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset,a])=>({asset,label:a.label||asset}));}
}
