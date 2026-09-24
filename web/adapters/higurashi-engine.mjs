import {randomId,signature,plainText} from '../engine.mjs';
import {routeProgress,markRouteComplete} from './higurashi-progress.mjs';
import {HigurashiCore} from './higurashi-core.mjs';
const clone=structuredClone;
export function validateHigurashiContent(c){
  const errors=[];
  if(c?.format!=='vnkit.content'||c.version!==1||c.id!=='higurashi-slpm66913-1.01'||c.runtime?.id!=='higurashi-ps2-shin'||c.runtime.version!==1)errors.push('Untested Higurashi content');
  if(!c?.runtime?.program||!c.assets?.program||!/^[a-f0-9]{64}$/.test(c.runtime?.sha256||''))errors.push('Missing Higurashi source program');
  for(const [id,a]of Object.entries(c?.assets||{}))if(!a.url||a.url.startsWith('/')||a.url.includes('..')||a.url.includes('://'))errors.push(`Unsafe asset ${id}`);
  return errors;
}
export class HigurashiEngine {
  static async create(content,options={}){
    const errors=validateHigurashiContent(content);if(errors.length)throw Error(errors.join('\n'));
    const e=new HigurashiEngine(content,options),p=await e.loadJSON(content.runtime.program);
    if(p.sha256!==content.runtime.sha256)throw Error('Higurashi source signature mismatch');
    e.vm=new HigurashiCore(p);e.initialize();return e;
  }
  constructor(content,options){this.content=content;this.makeId=options.makeId||randomId;this.onInstruction=options.onInstruction;this.signature=signature({id:content.id,runtime:content.runtime});this.loadJSON=options.loadJSON||(async u=>{const r=await fetch(new URL(u,options.baseURL),{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Cannot load Higurashi source');return r.json();});}
  get state(){return this.vm.state;}set state(s){this.vm.state=s;}
  get current(){return this.state.presentation;}
  initialize(){Object.assign(this.state,{scene:{background:null,sprites:{},layers:[],music:null},presentation:null,returnStack:[],completed:{},manual:{},read:{},display:null,immediateVoice:null});}
  asset(kind,index){const id=`${kind}:${index}`;if(!this.content.assets[id])this.vm.fail(`Missing resource ${id}`);return id;}
  voice(path){if(this.content.runtime.missingSourceVoices?.includes(path?.toLowerCase()))return null;return path?this.asset('voice',path.toLowerCase()):null;}
  compose(){
    const layers=[];
    for(const [slot,g]of Object.entries(this.state.layers))if(g){
      const asset=this.asset(g.kind,g.index),a=this.content.assets[asset];
      layers.push({asset,x:(320+g.x-a.anchor[0]*g.sx)/640*100,y:(448+g.y-a.anchor[1]*g.sy)/448*100,width:a.width*g.sx/640*100,height:a.height*g.sy/448*100,opacity:g.colour[0]/255,tint:g.colour.slice(1).map(n=>n/255),depth:g.z,slot:+slot});
    }
    layers.sort((a,b)=>a.depth-b.depth||a.slot-b.slot);
    const m=this.state.music;this.state.scene={background:null,sprites:{},layers,music:m?{asset:this.asset('music',m.index),loop:m.loop}:null,musicGain:m?.volume??1};
  }
  selectorLabel(event,value){
    // Read the next source chapter heading on a disposable state. It is a
    // label only: no text/media/progress from this probe is presented or saved.
    const probe=this.vm.fork();probe.state=clone(this.state);probe.choose(value);
    for(let n=0;n<10000;n++){const e=probe.step();if(e?.kind==='chapter')return e.title;if(['text','choice','end'].includes(e?.kind))break;}
    return `${this.state.title} ${value+1}`;
  }
  tipTitle(id){
    const tip=this.vm.program.tips?.[id];if(!tip)this.vm.fail(`Unknown TIPS ${id}`);
    const p=this.vm.fork(tip.entry);p.state.system=clone(this.state.system);
    for(let n=0;n<10000;n++){const e=p.step();if(e?.kind==='chapter')return e.title;if(e?.kind==='text')return plainText(e.text);if(e?.kind==='end')break;}
    return `TIPS ${id}`;
  }
  makePresentation(e,occurrenceId=this.makeId()){
    const base={id:`main.snr:${e.offset.toString(16).padStart(8,'0')}${e.part!=null?':'+e.part:''}`,occurrenceId,source:{script:'main.snr',offset:e.offset}};
    if(e.kind==='text')return {...base,kind:'text',speaker:e.speaker,text:e.text,displayText:e.displayText,voice:this.voice(e.voice)};
    if(e.kind==='choice')return {...base,kind:'choice',options:e.options.map(o=>({id:String(o.value),text:o.text??this.selectorLabel(e,o.value),...(e.selector!=null?{asset:this.asset('ui',`${e.selector===0?'chrsel':'galsel'}.lzs:${o.value}`)}:{})}))};
    if(e.kind==='tips')return {...base,kind:'choice',auxiliary:true,options:[...e.ids.map(id=>({id:String(id),text:this.tipTitle(id)})),{id:'continue',text:'Continue'}]};
    if(e.kind==='fake-choice')return {...base,kind:'choice',options:this.vm.program.fakeChoices.map((text,i)=>({id:String(i),text}))};
    if(e.kind==='movie')return {...base,kind:'movie',asset:this.asset('video',e.index)};
    if(e.kind==='end')return {...base,kind:'end'};
    if(e.kind==='voice-wait')return {...base,kind:'wait',remainingMs:0,voiceWait:true,display:this.state.display};
    if(e.kind==='wait')return {...base,kind:'wait',remainingMs:e.frames*1000/60,display:this.state.display};
    if(e.kind==='keywait')return {...base,kind:'pause',display:this.state.display};
    if(e.kind==='character-unlocked'||e.kind==='otsu-unlocked')return {...base,kind:'pause',hideText:true,notification:e.kind,notificationIndex:e.index};
    throw Error('Unhandled Higurashi boundary '+e.kind);
  }
  sceneOverlays(){
    const p=this.current;if(!p?.notification)return [];
    const n=p.notification==='character-unlocked'?`chrget${p.notificationIndex}.lzs:0`:`otsuget.lzs:${p.notificationIndex}`;
    const asset=this.asset('ui',n),a=this.content.assets[asset];
    return [{asset,x:(640-a.width)/1280*100,y:38,width:a.width/640*100,height:a.height/448*100}];
  }
  async run(){
    if(this.current)return {pending:this.current,effects:[]};
    const before=clone(this.state),effects=[];
    try{
      for(let n=0;n<100000;n++){
        let e=this.vm.step();this.onInstruction?.(this.vm.last);if(!e)continue;
        if(e.kind==='media-wait'&&e.opcode===0xba&&this.state.immediateVoice)e={...e,kind:'voice-wait'};
        if(e.kind==='end'&&this.state.returnStack.length){
          const progress=this.progressSnapshot(),previous=this.state.returnStack.pop();this.state=previous;this.applyProgress(progress);continue;
        }
        if(e.kind==='sound')effects.push({op:'stopSound',channel:`shin:${e.channel}`},{op:'sound',channel:`shin:${e.channel}`,asset:this.asset('sound',e.index),loop:e.loop});
        if(e.kind==='sound-stop')effects.push({op:'stopSound',channel:`shin:${e.channel}`});
        if(e.kind==='voice'){
          const asset=this.voice(e.path);this.state.immediateVoice=asset?{asset,serial:this.makeId()}:null;if(asset)effects.push({op:'voice',asset});
        }
        if(['text','choice','tips','fake-choice','movie','end','wait','voice-wait','keywait','character-unlocked','otsu-unlocked'].includes(e.kind)){
          if(e.kind==='wait'&&!e.frames)continue;
          if(e.kind==='end'&&/編 終劇/.test(this.state.title))this.state.completed[this.state.title]=true;
          this.state.boundary=e;this.state.presentation=this.makePresentation(e);if(e.kind==='text')this.state.display=clone(this.current);
          this.compose();return {pending:this.current,effects};
        }
        // Noninteractive source effects settle at their native destination.
        if(n%2048===2047)await new Promise(r=>setTimeout(r,0));
      }
      this.vm.fail('Execution budget exceeded');
    }catch(error){this.state=before;throw error;}
  }
  async advance(option){
    const before=clone(this.state);
    try{
      const e=this.state.boundary;
      if(e?.kind==='end')return {pending:this.current,effects:[]};
      if(this.current?.kind==='choice'){
        if(!this.current.options.some(o=>o.id===String(option)))throw Error('Choose an available option');
        if(e.kind==='choice')this.vm.choose(Number(option));
        if(e.kind==='tips'&&option!=='continue'){
          const tip=this.vm.program.tips[Number(option)],progress=this.progressSnapshot(),suspended=clone(this.state);
          suspended.presentation=null;
          const vm=this.vm.fork(tip.entry);this.state=vm.state;this.initialize();this.state.returnStack=[suspended];this.applyProgress(progress);
        }
      }
      this.state.presentation=null;return await this.run();
    }catch(error){this.state=before;throw error;}
  }
  save(media=null){return {format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  progressSnapshot(){const s=this.state;return {format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,globals:Object.fromEntries(['system','nativeRead','choiceRead','choiceHistory','tips','chart','characters','otsu','completed','manual','read'].map(k=>[k,clone(s[k])])),completions:clone(s.manual)};}
  applyProgress(p){
    if(!p)return;
    if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw Error('Incompatible Higurashi progress');
    if(JSON.stringify(p).length>1024*1024)throw Error('Oversized Higurashi progress');
    for(const k of ['system','nativeRead','choiceRead','choiceHistory','tips','chart','characters','otsu','completed','manual','read']){
      const b=p.globals?.[k];if(!b||typeof b!=='object'||Array.isArray(b))throw Error('Invalid progress bank '+k);
      for(const [n,v]of Object.entries(b)){
        if(k==='system'){if(!/^\d+$/.test(n)||+n>=64||!Number.isInteger(v)||v< -32768||v>32767)throw Error('Invalid system progress');}
        else if(['completed','manual'].includes(k)){if(typeof v!=='boolean'||n.length>256)throw Error('Invalid completion');}
        else if(!/^\d+$/.test(n)||+n>0x1ffffff||!Number.isInteger(v)||v<0||v>0xffffffff)throw Error('Invalid native/read catalog');
      }
      this.state[k]=clone(b);
    }
  }
  recordPresentation(p,{restoring=false,skipped=false}={}){
    if(restoring||skipped||p.kind!=='text')return;
    // Source instruction index plus part is collision-free, unlike dialogue equality.
    const row=this.vm.code.get(p.source.offset),index=this.vm.readOffsets.get(row[0]),part=Number(p.id.split(':').at(-1));
    const id=index+part;if(part>=16)throw Error('Text part catalog exceeds reserved span');const word=id>>>5;
    this.state.read[word]=((this.state.read[word]||0)|(1<<(id&31)))>>>0;
  }
  isInheritedRead(id){const parts=id.split(':'),row=this.vm.code.get(parseInt(parts[1],16));if(!row||parts.length!==3)return false;const n=this.vm.readOffsets.get(row[0])+Number(parts[2]);return !!((this.state.read[n>>>5]||0)&(1<<(n&31)))||this.routeProgress().some(r=>r.complete&&this.readPaths?.[r.id]?.has(id));}
  async loadReadPaths(){
    this.readPaths={};
    try{
      const p=await this.loadJSON('read-paths.json');
      if(p.format!=='vnkit.read-paths'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw Error('Incompatible paths');
      for(const [id,path]of Object.entries(p.paths)){
        if(!this.routeProgress().some(r=>r.id===id)||!Array.isArray(path.ids)||path.ids.length>130000)throw Error('Invalid route');
        for(const source of path.ids){const m=/^main\.snr:([0-9a-f]{8}):(\d+)$/.exec(source);if(!m||!this.vm.code.get(parseInt(m[1],16))?.[5]?.[+m[2]])throw Error('Invalid source text ID');}
        this.readPaths[id]=new Set(path.ids);
      }this.readPathWarning='';
    }catch(error){this.readPaths={};this.readPathWarning='Completed-route read paths unavailable: '+error.message;}
  }
  async restore(save){
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Higurashi save');
    if(JSON.stringify(save).length>4*1024*1024)throw Error('Oversized Higurashi save');
    const before=this.state,progress=this.progressSnapshot(),s=clone(save.state);
    try{
      if(!Array.isArray(s.regs)||s.regs.length!==1024||s.regs.some(x=>!Number.isInteger(x)||x< -32768||x>32767)||!Array.isArray(s.stack)||s.stack.length>4096||s.stack.some(x=>!Number.isInteger(x))||!this.vm.code.has(s.pc)||!Array.isArray(s.returnStack)||s.returnStack.length>1)throw Error('Invalid Higurashi execution state');
      if(!s.layers||!s.staged||!s.sounds||!this.vm.code.has(s.boundary?.offset))throw Error('Invalid Higurashi source boundary');
      const e=s.boundary,row=this.vm.code.get(e.offset);
      if(s.message){const m=s.message;if(!Number.isInteger(m.index)||m.index<0||!this.vm.code.get(m.offset)?.[5]?.[m.index])throw Error('Invalid buffered message');}
      for(const bank of [s.layers,s.staged]){
        if(typeof bank!=='object'||Array.isArray(bank))throw Error('Invalid graphics bank');
        for(const [slot,g]of Object.entries(bank))if(!/^\d+$/.test(slot)||+slot>=32||g&&(!['picture','portrait'].includes(g.kind)||!this.content.assets[`${g.kind}:${g.index}`]||!['x','y','z','sx','sy','rotation'].every(k=>Number.isFinite(g[k]))||!Array.isArray(g.colour)||g.colour.length!==4||g.colour.some(x=>!Number.isFinite(x)||x<0||x>255)))throw Error('Invalid source graphics');
      }
      if(e.kind!=='text'){
        const probe=this.vm.fork();probe.state=clone(s);probe.state.pc=e.offset;probe.state.pending=null;probe.state.message=null;
        const expected=probe.step();if(e.kind==='voice-wait'&&expected.kind==='media-wait'&&expected.opcode===0xba)expected.kind='voice-wait';
        if(JSON.stringify(expected)!==JSON.stringify(e))throw Error('Saved boundary differs from source');
        if(e.kind==='choice'&&JSON.stringify(s.pending)!==JSON.stringify(expected))throw Error('Saved choice differs from source');
      }

      if(e.kind==='text'&&(!Number.isInteger(e.part)||JSON.stringify(row[5]?.[e.part])!==JSON.stringify(Object.fromEntries(['speaker','text','displayText','voice','controls'].map(k=>[k,e[k]])))))throw Error('Saved text differs from source');
      if(typeof s.presentation?.occurrenceId!=='string'||s.presentation.occurrenceId.length>128)throw Error('Invalid occurrence ID');
      this.state=s;this.applyProgress(progress);s.presentation=this.makePresentation(e,s.presentation.occurrenceId);this.compose();
      return {pending:this.current,effects:[]};
    }catch(error){this.state=before;throw error;}
  }
  entryTitle(entry){const p=this.vm.fork(entry);for(let n=0;n<10000;n++){const e=p.step();if(e?.kind==='chapter')return e.title;if(e?.kind==='end')break;}throw Error('Entry has no source label');}
  newGameEntries(){return [{id:'start',label:'Start again'},...[[235,1],[236,8],[237,4],[238,16],[239,2],[240,32]].filter(([,bit])=>(this.state.system[21]||0)&bit).map(([entry])=>({id:'extra:'+entry,label:this.entryTitle(entry),group:'Unlocked extras'})),...Object.keys(this.state.tips).map(Number).filter(i=>this.vm.program.tips[i]).map(i=>({id:'tip:'+i,label:this.tipTitle(i),group:'Encountered TIPS'}))];}
  async startNew(progress,entry='start'){if(this.current)throw Error('Invalid Higurashi entry');this.applyProgress(progress);if(entry.startsWith('extra:')){if(!this.newGameEntries().some(e=>e.id===entry))throw Error('Extra is locked');this.state.regs[0]=Number(entry.slice(6));return this.run();}if(entry!=='start'){const id=Number(entry.slice(4));if(!entry.startsWith('tip:')||!this.state.tips[id]||!this.vm.program.tips[id])throw Error('TIPS is not unlocked');this.state.regs[0]=this.vm.program.tips[id].entry;}return this.run();}
  routeProgress(){return routeProgress(this.state);}
  markRouteComplete(id){markRouteComplete(this.state,id);}
  progressNotice(){return 'Manual completion sets the native ending flags. Character unlocks earned in the common story are kept separate. Verified completed-route paths affect Skip read only; activity totals stay unchanged.';}
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset,a])=>({asset,label:a.label}));}
}
