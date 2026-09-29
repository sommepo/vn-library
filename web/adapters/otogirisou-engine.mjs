/* SLPS-01645 full-scene reader. Original bounded code owns story branches,
 * choice previews, retained text and geometry. The host owns media and saves. */
import {randomId,signature} from '../engine.mjs';
import {OtogirisouKernel,otogirisouPage,EXE_HASH,CD_HASH} from './otogirisou-kernel.mjs';
import {validateSoundPage} from '../sound-novel.mjs';
const clone=structuredClone,GP=0x8007a610;
const local=p=>typeof p==='string'&&p.length>0&&!/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(p)&&!p.split(/[\\/]/).some(x=>!x||x.startsWith('.'));
const bytes=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
const persistent=[0,1,...Array.from({length:32},(_,i)=>i+19)];
export function validateOtogirisouContent(c){
 const e=[];if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='otogirisou-ps1'||c.runtime.version!==1||c.runtime.executable_sha256!==EXE_HASH||c.runtime.cdimg_sha256!==CD_HASH)e.push('Unsupported Otogirisou edition');
 if(c.presentation?.textLayout!=='full-scene'||c.viewport?.width!==320||c.viewport?.height!==240)e.push('Otogirisou requires its native full-scene page');
 for(const p of [c.runtime?.executable,c.runtime?.cdimg,c.runtime?.font])if(!local(p))e.push('Invalid native resource path');
 for(const [id,a]of Object.entries(c.assets||{}))if(!['image','music','sound','movie','script'].includes(a.type)||!local(a.url))e.push('Invalid asset '+id);
 return e;
}
export class OtogirisouEngine {
 static async create(content,options={}){
  const errors=validateOtogirisouContent(content);if(errors.length)throw Error(errors.join('\n'));
  const json=options.loadJSON||(async p=>{const r=await fetch(new URL(p,options.baseURL));if(!r.ok)throw Error('Otogirisou data unavailable');return r.json();});
  const binary=options.loadBytes||(async p=>{const r=await fetch(new URL(p,options.baseURL));if(!r.ok)throw Error('Otogirisou source unavailable');return new Uint8Array(await r.arrayBuffer());});
  const [exe,cd,font]=await Promise.all([binary(content.runtime.executable),binary(content.runtime.cdimg),json(content.runtime.font)]);
  return new OtogirisouEngine(content,options,await OtogirisouKernel.create(exe,cd,font),exe);
 }
 constructor(content,options,kernel,exe){
  this.content=content;this.signature=signature({id:content.id,runtime:content.runtime});this.makeId=options.makeId||randomId;this.kernel=kernel;
  this.audioMap=Array.from(exe.subarray(2048+0x51f9c,2048+0x51f9c+160));
  this.state={pending:null,display:null,scene:{background:null,sprites:{},layers:[],music:null},sounds:{},glyphs:[],newGlyphs:[],source:null,deferred:null,ended:false,warnings:[],frames:0};
 }
 get current(){return this.state.pending;}
 source(){return {address:this.kernel.p.read(GP+0x3dc)+this.kernel.info().pc};}
 fail(message){throw Error(`otogi:${this.source().address.toString(16)}: ${message}`);}
 warn(message){if(!this.state.warnings.includes(message))this.state.warnings.push(message);}
 asset(id,type){if(this.content.assets[id]?.type!==type)this.fail('Original resource unavailable: '+id);return id;}
 play(id,effects,volume=127){
  if(!Number.isInteger(id)||id<0||id>=this.audioMap.length)this.fail('Audio selector outside native table');
  const bank=this.audioMap[id],s=this.state;
  if(bank<27){const asset=this.asset(`music:${bank}`,'music');s.scene.music={asset,loop:true};s.scene.musicGain=Math.max(0,Math.min(1,volume/127));}
  else {const asset=this.asset(`sound:${id}`,'sound'),channel=`otogi:${id}`;s.sounds[channel]=asset;effects.push({op:'stopSound',channel},{op:'sound',asset,channel,volume:Math.min(1,volume/127),loop:this.content.assets[asset].loopEnd!=null});}
 }
 stop(id,effects){const channel=`otogi:${id}`;if(this.audioMap[id]<27)this.state.scene.music=null;else{effects.push({op:'stopSound',channel});delete this.state.sounds[channel];}}
 events(effects){for(const event of this.kernel.events.splice(0)){
  if(event.clearText){this.state.glyphs=[];continue;}
  if(event.scene!==undefined){const id=event.scene,key=[3,168].includes(id)?`scene:${id}:0`:`scene:${id}`;this.state.scene.background=this.asset(key,'image');if([3,168].includes(id))this.warn('Paired textures currently use their first native image');continue;}
  if(event.moviePrepare!==undefined)continue; // Preload; the effect request owns playback.
  if(event.effect!==undefined){if(event.effect>=168&&event.effect<222){const id=event.effect-168;this.state.deferred={kind:'movie',id:`otogi:movie:${id}`,source:this.source(),asset:this.asset(`movie:${id}`,'movie'),display:clone(this.state.display)};}else this.warn('Native transitions and animated overlays remain approximate');continue;}
  const a=event.args;
  switch(event.address){
   case 0x8001f2d8:case 0x80014f9c:case 0x80014a9c:case 0x80051214:case 0x80051090:case 0x800583e8:break; // Cache/GPU/CD services, handled by media loading.
   case 0x8002c37c:this.play(a[0]&255,effects);break;
   case 0x8002a6f0:this.play(a[1]&255,effects,a[0]);break;
   case 0x8002c4c8:this.play(a[2]&255,effects,a[0]);this.warn('Native dynamic audio pitch and pan remain approximate');break;
   case 0x8002ab00:this.stop(a[0]&255,effects);break;
   case 0x8002b7b4:this.state.scene.music=null;effects.push({op:'stopSound',channel:'effects'});this.state.sounds={};break;
   case 0x8002b68c:case 0x8002c39c:case 0x8002b1bc:case 0x8002ad54:case 0x8002c550:case 0x8002b4f4:case 0x8002b8ec:case 0x8002bb90:this.warn('Native audio envelopes and channel controls remain approximate');break;
   case 0x8001e060:case 0x8003f898:this.warn('Native transitions and animated overlays remain approximate');break;
   default:this.fail('Unresolved native service '+event.address.toString(16));
  }
 }}
 step(effects,action=null){
  const before=this.kernel.info(),source=this.source();
  if(action==='input')this.kernel.input();else if(Number.isInteger(action))this.kernel.choose(action);else this.kernel.frame();
  this.state.frames++;this.events(effects);
  const after=this.kernel.info(),glyphs=this.kernel.glyphs(),old=new Map(this.state.glyphs.map(g=>[g.slot,g]));
  // Previewed options are displayed, but never published as narrative reading.
  if(!before.preview&&!after.preview&&before.mode!==2&&after.mode!==2){
   const fresh=glyphs.filter(g=>{const o=old.get(g.slot);return!o||o.id!==g.id||o.x!==g.x||o.y!==g.y;});
   if(fresh.length&&!this.state.source)this.state.source=source;
   this.state.newGlyphs.push(...fresh.map(g=>g.text));
  }
  this.state.glyphs=glyphs;
 }
 text(){const s=this.state,page=otogirisouPage(this.kernel),source=s.source||this.source(),text=s.newGlyphs.join('');
  const p={kind:'text',id:`otogi:${source.address.toString(16)}`,source,occurrenceId:this.makeId(),speaker:'',text,displayText:page.blocks.map(b=>b.text).join('\n'),page};
  validateSoundPage(p);s.display=clone(p);s.pending=p;s.newGlyphs=[];s.source=null;return p;
 }
 choice(){const options=this.kernel.choiceRanges().map((_,i)=>({id:String(i),text:''})),page=otogirisouPage(this.kernel,options),source=this.source();
  if(options.some(o=>!o.text))this.fail('Native choice page omits an option');
  const p={kind:'choice',id:`otogi:${source.address.toString(16)}`,source,occurrenceId:this.makeId(),options,page};validateSoundPage(p);this.state.pending=p;
 }
 execute(effects=[]){
  if(this.current)return{pending:this.current,effects};
  for(let frames=0;frames<120000;frames++){
   if(this.state.deferred){this.state.pending=this.state.deferred;this.state.deferred=null;return{pending:this.current,effects};}
   const mode=this.kernel.info().mode;
   if(mode===2){if(this.state.newGlyphs.length)this.text();else this.choice();return{pending:this.current,effects};}
   if(mode===99){
    if(this.state.newGlyphs.length){this.text();return{pending:this.current,effects};}
    // Native mode 99 commits cycle/ending state after its bounded 180-frame hold.
    for(let n=0;this.kernel.p.read(0x8007a8ba,2)!==12&&n<182;n++)this.step(effects);
    if(this.kernel.p.read(0x8007a8ba,2)!==12)this.fail('Native ending did not commit');
    this.state.ended=true;this.state.scene.music=null;this.state.pending={kind:'end',id:`otogi:${this.source().address.toString(16)}`,source:this.source()};return{pending:this.current,effects};
   }
   if([3,6].includes(mode)){this.text();return{pending:this.current,effects};}
   this.step(effects);
  }this.fail('Native frame budget');
 }
 async transaction(fn){const state=clone(this.state),memory=this.kernel.snapshot(),events=clone(this.kernel.events);try{return await fn();}catch(error){this.state=state;this.kernel.restore(memory);this.kernel.events=events;throw error;}}
 async run(){return this.transaction(()=>this.execute());}
 async advance(value){return this.transaction(()=>{
  const p=this.current,effects=[];if(p?.kind==='end')return{pending:p,effects};this.state.pending=null;
  if(p?.kind==='choice'){if(!p.options.some(o=>o.id===String(value)))throw Error('Choose a visible original option');this.step(effects,Number(value));}
  else if(p?.kind==='text'&&[3,6].includes(this.kernel.info().mode))this.step(effects,'input');
  return this.execute(effects);
 });}
 save(media={}){return{format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),kernel:this.kernel.snapshot(),media:clone(media)};}
 async restore(save){return this.transaction(()=>{
  if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Otogirisou save');
  const s=clone(save.state),progress=this.progressSnapshot();
  if(!s||!s.scene||!Array.isArray(s.glyphs)||s.glyphs.length>200||!Array.isArray(s.newGlyphs)||s.newGlyphs.length>1000||s.newGlyphs.some(x=>typeof x!=='string'||[...x].length!==1)||!Number.isInteger(s.frames)||s.frames<0||!Array.isArray(s.warnings)||s.warnings.length>32)throw Error('Invalid Otogirisou reader state');
  this.kernel.restore(save.kernel);
  if(s.pending){const p=s.pending;if(!['text','choice','movie','end'].includes(p.kind)||!Number.isInteger(p.source?.address)||p.source.address<0x8008e000||p.source.address>=0x80125000)throw Error('Invalid saved source boundary');
   if(['text','choice'].includes(p.kind)){validateSoundPage(p);const options=p.kind==='choice'?p.options.map(o=>({...o})):null;if(JSON.stringify(otogirisouPage(this.kernel,options))!==JSON.stringify(p.page))throw Error('Saved page differs from native glyphs');}
   if(p.kind==='choice'&&this.kernel.info().mode!==2||p.kind==='end'&&!s.ended)throw Error('Saved controller differs from presentation');
   if(p.kind==='movie')this.asset(p.asset,'movie');
  }
  if(s.scene.background)this.asset(s.scene.background,'image');if(s.scene.music)this.asset(s.scene.music.asset,'music');
  if(s.scene.musicGain!==undefined&&(!Number.isFinite(s.scene.musicGain)||s.scene.musicGain<0||s.scene.musicGain>1))throw Error('Invalid saved music gain');
  if(!s.sounds||Object.entries(s.sounds).some(([k,v])=>!/^otogi:\d{1,3}$/.test(k)||this.content.assets[v]?.type!=='sound'))throw Error('Invalid saved effect controller');
  if(JSON.stringify(this.kernel.glyphs())!==JSON.stringify(s.glyphs))throw Error('Saved retained page differs from native state');
  this.state=s;this.applyProgress(progress,{restore:true});return{pending:this.current,effects:[],restored:true};
 });}
 progressSnapshot(){const p=this.kernel.p;return{format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,flags:Array.from({length:900},(_,i)=>p.read(0x8007c2a8+i,1)),cycles:p.read(0x8007a8a2,1)};}
 applyProgress(progress,{restore=false}={}){
  if(!progress)return;if(progress.format!=='vnkit.progress'||progress.version!==1||progress.gameId!==this.content.id||progress.gameSignature!==this.signature||!bytes(progress.flags,900)||!Number.isInteger(progress.cycles)||progress.cycles<0||progress.cycles>255)throw Error('Invalid Otogirisou progress');
  const p=this.kernel.p;for(const i of restore?persistent:progress.flags.keys())p.write(0x8007c2a8+i,progress.flags[i],1);p.write(0x8007a8a2,progress.cycles,1);
 }
 newGameEntries(){return[{id:'start',label:'Start again'}];}
 async startNew(progress,entry='start'){if(this.current||this.state.frames||entry!=='start')throw Error('New game requires a fresh engine');this.applyProgress(progress);return this.run();}
 soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset])=>({asset,label:asset.split(':')[1]}));}
}
