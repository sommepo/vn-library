/* Exact SLPS-02296 bytecode interpreter. Native sources stay in private imports.
 * Decorative transitions settle immediately; unknown control flow fails closed. */
import {randomId, signature} from '../engine.mjs';
const clone=structuredClone, word=(a,n=0)=>a[n]+256*a[n+1];
const byteBank=b=>Array.isArray(b)&&b.length===256&&b.every(v=>Number.isInteger(v)&&v>=0&&v<=255);
const bitBank=b=>byteBank(b)&&b.every(v=>v<=1);
const localURL=url=>typeof url==='string'&&url.length>0&&!/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(url)&&!url.split(/[\\/]/).some(x=>!x||x.startsWith('.'));
export function validateMemoriesOffContent(c){
  const errors=[];
  if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='memoriesoff-ps1'||c.runtime.version!==1)errors.push('Unsupported Memories Off content');
  if(!c.runtime?.scripts?.[c.runtime.entry])errors.push('Missing Memories Off entry');
  for(const [id,a] of Object.entries(c.assets||{}))if(!['image','music','voice','sound','script'].includes(a.type)||!localURL(a.url))errors.push(`${id}: invalid asset`);
  for(const [id,r] of Object.entries(c.runtime?.scripts||{}))if(!/^\d+$/.test(id)||!localURL(r.url)||!/^[0-9a-f]{64}$/.test(r.sha256))errors.push(`${id}: invalid script`);
  return errors;
}
export class MemoriesOffEngine {
  static async create(content,options={}){
    const errors=validateMemoriesOffContent(content);if(errors.length)throw Error(errors.join('\n'));
    const engine=new MemoriesOffEngine(content,options);await engine.loadScript(engine.state.script);return engine;
  }
  constructor(content,options={}){
    this.content=content;this.signature=signature({id:content.id,runtime:content.runtime});this.scripts={};
    this.makeId=options.makeId||randomId;this.onInstruction=options.onInstruction;
    this.loadJSON=options.loadJSON||(async url=>{const r=await fetch(new URL(url,options.baseURL),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Memories Off data unavailable (${r.status})`);return r.json();});
    this.state={script:content.runtime.entry,pc:0,vars:Array(256).fill(0),flags:Array(256).fill(0),globals:Array(256).fill(0),
      stack:[],seed:(options.seed??Date.now())>>>0,pending:null,choices:null,previousText:'',voice:null,lastSound:null,
      background:null,portraits:{},scene:{background:null,sprites:{},layers:[],music:null},ended:false,warnings:[]};
  }
  get current(){return this.state.pending;}
  fail(i,message){throw Error(`${i?.id||`${this.state.script}:${this.state.pc}`}: ${message}`);}
  warn(i,message){if(!this.state.warnings.some(w=>w.message===message))this.state.warnings.push({source:i.id,message});}
  async loadScript(id){
    if(this.scripts[id])return this.scripts[id];const ref=this.content.runtime.scripts[id];if(!ref)throw Error(`Memories Off script absent: ${id}`);
    const data=await this.loadJSON(ref.url);
    if(data.format!=='vnkit.memoriesoff-script'||data.version!==1||data.id!==id||data.sha256!==ref.sha256||!Array.isArray(data.instructions))throw Error(`Memories Off script identity mismatch: ${id}`);
    const instructions=Object.fromEntries(data.instructions.map(i=>[i.offset,i]));
    return this.scripts[id]={...data,instructions};
  }
  async jump(script,pc,i){const target=await this.loadScript(String(script));if(!target.instructions[pc])this.fail(i,`Unresolved source target ${script}:${pc.toString(16)}`);this.state.script=String(script);this.state.pc=pc;}
  asset(kind,index,i){const id=`${kind}:${index}`;if(this.content.assets[id]?.type!==(kind==='background'||kind==='portrait'?'image':kind))this.fail(i,`Original resource unavailable: ${id}`);return id;}
  compose(){
    const s=this.state,b=s.background;
    s.scene.layers=[...(b?[{asset:b.asset,x:0,y:b.y/240*100,width:100,height:this.content.assets[b.asset].height/240*100}]:[]),
      ...Object.entries(s.portraits).sort(([a],[b])=>a-b).map(([,p])=>{
        const a=this.content.assets[p.asset];return{asset:p.asset,x:(a.crop_x+(p.position-1)*128)/512*100,y:0,width:a.width/512*100,height:100};
      })];
  }
  async run(){const before=clone(this.state);try{return await this.execute();}catch(error){this.state=before;throw error;}}
  async execute(){
    if(this.current)return{pending:this.current,effects:[]};const effects=[];
    for(let step=0;step<20000;step++){
      const s=this.state,script=await this.loadScript(s.script),i=script.instructions[s.pc];
      if(!i)this.fail(null,'Execution outside decoded source');
      this.onInstruction?.(i,s);s.pc=i.next;
      const a=i.args,source={script:s.script,offset:i.offset};
      switch(i.code){
        case 0:s.ended=true;s.pending={kind:'end',id:i.id,source};s.scene.music=null;s.voice=null;s.lastSound=null;effects.push({op:'stopSound',channel:'memoriesoff:sound'});break;
        case 5:{const ms=a[0]*1000/60;s.pending={kind:'wait',id:i.id,ms,remainingMs:ms,source};break;}
        case 0x10:{
          if(typeof i.text!=='string')this.fail(i,'Missing reviewed source text');
          s.pending={kind:'text',id:i.id,occurrenceId:this.makeId(),text:i.text,speaker:'',displayText:s.previousText+i.text,voice:s.voice,source};
          s.previousText=s.pending.displayText;s.appendBreak=i.continuation===0;s.voice=null;break;
        }
        case 0x11:if(!Array.isArray(i.options)||!i.options.length)this.fail(i,'Missing source choices');s.choices={source,options:i.options};break;
        case 0x16:if(s.appendBreak)s.previousText+='\n';break; // Input is handled by the shared text boundary.
        case 0x17:s.previousText='';break;
        case 0x20:{
          if(!s.choices||s.choices.options.length!==a[1])this.fail(i,'Choice count differs from source strings');
          s.pending={kind:'choice',id:i.id,occurrenceId:this.makeId(),source,options:s.choices.options.map((text,n)=>({id:String(n),text}))};break;
        }
        case 0x28:
          if(![0,3,5].includes(a[0]))this.fail(i,`Unaudited native visual effect ${a[0]}`);
          this.warn(i,'Native particle and decorative overlays are omitted');break;
        case 0x29:break; // Completion of the preceding visual effect; no source state operation.
        case 0x30:if(a[0]>1||a[1]>2)this.fail(i,'Portrait slot/position outside native range');s.portraits[a[0]]={asset:this.asset('portrait',word(a,2),i),position:a[1]};this.compose();break;
        case 0x31:case 0x32:s.background={asset:this.asset('background',word(a),i),y:i.code===0x32?(word(a,4)<<16>>16):0};s.portraits={};this.compose();this.warn(i,'Native image fades settle immediately');break;
        case 0x38:if(a[0]>2)this.fail(i,'Unknown portrait removal');if(a[0]===2)s.portraits={};else delete s.portraits[a[0]];this.compose();break;
        case 0x39:s.background=null;s.portraits={};this.compose();this.warn(i,'Native screen fades settle immediately');break;
        case 0x50:await this.jump(s.script,i.target,i);break;
        case 0x52:{
          let result=false,join=0;
          for(const c of i.clauses){const v=(c.variable&0x8000?s.vars:s.flags)[c.variable&255],test=[null,v===c.value,v<c.value,v>c.value,v<=c.value,v>=c.value][c.compare];if(test===undefined)this.fail(i,'Unknown condition');result=join===1?result&&test:result||test;join=c.join;}
          if(!result)await this.jump(s.script,i.target,i);break;
        }
        case 0x5d:if(s.stack.length>=11)this.fail(i,'Native call stack exceeded');s.stack.push({script:s.script,pc:s.pc});await this.jump(a[0],0,i);break;
        case 0x5e:{const frame=s.stack.pop();if(!frame)this.fail(i,'Return without source caller');await this.jump(frame.script,frame.pc,i);break;}
        case 0x5f:await this.jump(a[0],0,i);break;
        case 0x60:s.vars[a[0]]=a[1];break;
        case 0x61:s.vars[a[0]]=(s.vars[a[0]]+a[1])&255;break;
        case 0x62:s.vars[a[0]]=(s.vars[a[0]]-a[1])&255;break;
        case 0x68:s.flags[a[0]]=a[1]===1?1:0;break;
        case 0x6a:s.globals[a[0]]=a[1];break;
        case 0x6b:s.flags[a[0]]|=s.globals[a[1]]&1;break;
        case 0x6f:{const max=a[1]+1;s.seed=(Math.imul(s.seed,0x41c64e6d)+0x3039)>>>0;s.vars[a[0]]=(Math.trunc((s.seed|0)/(2*max))>>>0)%max;break;}
        case 0x80:s.scene.music={asset:this.asset('music',a[0],i),loop:true};break;
        case 0x81:s.scene.music=null;break;
        case 0x82:s.lastSound=this.asset('sound',a[0],i);effects.push({op:'stopSound',channel:'memoriesoff:sound'},{op:'sound',asset:s.lastSound,channel:'memoriesoff:sound',loop:this.content.assets[s.lastSound].loopEnd!==undefined});break;
        case 0x83:s.lastSound=null;effects.push({op:'stopSound',channel:'memoriesoff:sound'});break;
        case 0x85:s.voice=this.asset('voice',word(a,1),i);break;
        case 0x90:this.warn(i,'Native calendar presentation is omitted');break;
        default:this.fail(i,`Unsupported native command 0x${i.code.toString(16)}`);
      }
      if(this.current)return{pending:this.current,effects};
    }
    this.fail(null,'Instruction budget exhausted');
  }
  async advance(choice){const before=clone(this.state);try{
    const p=this.current;if(p?.kind==='end')return{pending:p,effects:[]};
    if(p?.kind==='choice'){
      const option=p.options.find(x=>x.id===String(choice));if(!option)throw Error('Choose a visible option');
      const script=await this.loadScript(p.source.script),i=script.instructions[p.source.offset];
      this.state.vars[i.args[0]]=Number(option.id)+1;this.state.choices=null;this.state.previousText='';
    }
    this.state.pending=null;return await this.execute();
  }catch(error){this.state=before;throw error;}}
  save(media={}){return{format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),media:clone(media)};}
  async restore(save){
    if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Memories Off save');
    const s=clone(save.state);
    if(!s||!byteBank(s.vars)||!byteBank(s.globals)||!bitBank(s.flags)||!Number.isInteger(s.seed)||s.seed<0||s.seed>0xffffffff||!Array.isArray(s.stack)||s.stack.length>11||!s.scene||!s.portraits||!Array.isArray(s.warnings)||s.warnings.length>32||typeof s.previousText!=='string'||s.previousText.length>32768)throw Error('Invalid Memories Off state');
    const script=await this.loadScript(s.script);
    if(!Number.isInteger(s.pc)||!script.instructions[s.pc]&&!(s.ended&&s.pc===script.size))throw Error('Invalid saved instruction position');
    for(const f of s.stack)if(!(await this.loadScript(f.script)).instructions[f.pc])throw Error('Invalid saved caller');
    if(s.choices){const c=(await this.loadScript(s.choices.source?.script)).instructions[s.choices.source?.offset];if(c?.code!==0x11||JSON.stringify(s.choices.options)!==JSON.stringify(c.options))throw Error('Saved choices differ from source');}
    if(s.pending){const p=s.pending,i=(await this.loadScript(p.source?.script)).instructions[p.source?.offset];if(!i||i.id!==p.id||s.script!==p.source.script||s.pc!==i.next)throw Error('Invalid saved presentation');
      if(p.kind==='text'){if(i.code!==0x10||p.text!==i.text||p.speaker!==''||p.displayText!==s.previousText||!p.displayText.endsWith(i.text)||typeof p.occurrenceId!=='string')throw Error('Saved text differs from source');}
      else if(p.kind==='choice'){const expected=s.choices?.options.map((text,n)=>({id:String(n),text}));if(i.code!==0x20||expected?.length!==i.args[1]||JSON.stringify(p.options)!==JSON.stringify(expected))throw Error('Invalid saved choice');}
      else if(p.kind==='wait'){const ms=i.args[0]*1000/60;if(i.code!==5||p.ms!==ms||!Number.isFinite(p.remainingMs)||p.remainingMs<0||p.remainingMs>ms)throw Error('Invalid saved timer');}
      else if(p.kind!=='end'||i.code!==0||!s.ended)throw Error('Invalid saved ending');
    }
    const valid=(id,type)=>!id||this.content.assets[id]?.type===type;
    if(s.background&&(!valid(s.background.asset,'image')||!Number.isInteger(s.background.y)||Math.abs(s.background.y)>480))throw Error('Invalid saved background');
    for(const [slot,p]of Object.entries(s.portraits))if(!['0','1'].includes(slot)||!valid(p.asset,'image')||![0,1,2].includes(p.position))throw Error('Invalid saved portrait');
    if(!valid(s.voice,'voice')||!valid(s.pending?.voice,'voice')||!valid(s.lastSound,'sound')||!valid(s.scene.music?.asset,'music'))throw Error('Invalid saved audio');
    this.state=s;this.compose();return{pending:this.current,effects:[],restored:true};
  }
  progressSnapshot(){return{format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,globals:clone(this.state.globals)};}
  applyProgress(p){if(!p)return;if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature||!byteBank(p.globals))throw Error('Invalid Memories Off progress');this.state.globals=clone(p.globals);}
  newGameEntries(){return[{id:'start',label:'Start again'}];}
  async startNew(progress,entry='start'){if(this.state.pc||this.current||entry!=='start')throw Error('New game requires a fresh engine');this.applyProgress(progress);return this.run();}
  soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').sort(([a],[b])=>Number(a.split(':')[1])-Number(b.split(':')[1])).map(([asset,a])=>({asset,label:a.label}));}
}
