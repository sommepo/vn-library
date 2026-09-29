/* Exact SLPS-01794 story VM. Source-owned page layout runs in KamaitachiText.
 * Unknown native state/control operations stop at their original source site. */
import {randomId,signature} from '../engine.mjs';
import {KamaitachiText,kamaitachiPage,KAMA_EXE_HASH} from './kamaitachi-text.mjs';
import {mountKamaitachiShadows,shadowPalette} from './kamaitachi-scene.mjs';
import {validateSoundPage} from '../sound-novel.mjs';
const clone=structuredClone,word=(a,n=0)=>a[n]+256*a[n+1];
const local=p=>typeof p==='string'&&p.length>0&&!/^(?:[a-z][a-z0-9+.-]*:|\/|\\)/i.test(p)&&!p.split(/[\\/]/).some(x=>!x||x.startsWith('.'));
const bytes=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(x=>Number.isInteger(x)&&x>=0&&x<=255);
export function validateKamaitachiContent(c){
 const errors=[];
 if(c?.format!=='vnkit.content'||c.version!==1||c.runtime?.id!=='kamaitachi-ps1'||c.runtime.version!==1||c.runtime.executable_sha256!==KAMA_EXE_HASH)errors.push('Unsupported Kamaitachi edition');
 if(c.presentation?.textLayout!=='full-scene'||c.viewport?.width!==320||c.viewport?.height!==240)errors.push('Kamaitachi requires its native full-scene page');
 for(const p of [c.runtime?.executable,c.runtime?.font])if(!local(p))errors.push('Invalid native resource path');
 for(const [id,r]of Object.entries(c.runtime?.scripts||{}))if(!/^\d+$/.test(id)||!local(r.url)||!/^[a-f0-9]{64}$/.test(r.sha256))errors.push('Invalid source script '+id);
 for(const [id,a]of Object.entries(c.assets||{}))if(!['image','music','sound','movie','script'].includes(a.type)||!local(a.url))errors.push('Invalid asset '+id);
 if(Object.keys(c.runtime?.scripts||{}).length!==42)errors.push('Incomplete Kamaitachi script table');
 return errors;
}
export class KamaitachiEngine{
 static async create(content,options={}){
  const errors=validateKamaitachiContent(content);if(errors.length)throw Error(errors.join('\n'));
  const json=options.loadJSON||(async p=>{const r=await fetch(new URL(p,options.baseURL));if(!r.ok)throw Error('Kamaitachi data unavailable');return r.json();});
  const binary=options.loadBytes||(async p=>{const r=await fetch(new URL(p,options.baseURL));if(!r.ok)throw Error('Kamaitachi source unavailable');return new Uint8Array(await r.arrayBuffer());});
  const [exe,font]=await Promise.all([binary(content.runtime.executable),json(content.runtime.font)]);
  const text=await KamaitachiText.create(exe,font);
  const engine=new KamaitachiEngine(content,options,text,json,exe);await engine.jump(31001);return engine;
 }
 constructor(content,options,text,json,exe){
  this.content=content;this.signature=signature({id:content.id,runtime:content.runtime});this.makeId=options.makeId||randomId;this.loadJSON=json;this.pages=text;this.scripts={};
  const view=new DataView(exe.buffer,exe.byteOffset,exe.byteLength);this.musicStops=new Set(Array.from({length:88},(_,i)=>i).filter(i=>view.getUint32(2048+0x19e0+i*4,true)===0x80029360));this.audioPairs=Array.from({length:256},(_,i)=>[view.getUint8(2048+0x5b1cc+i*2),view.getUint8(2048+0x5b1cc+i*2+1)]);this.audioKinds=Array.from({length:256},(_,i)=>view.getUint8(2048+0x5b04c+i*2));this.nativeNoops=new Set(Array.from({length:108},(_,i)=>i).filter(i=>view.getUint32(2048+0x29dc+i*4,true)===0x80044850));
  this.state={script:0,pc:0,stack:[],flags:Array(80).fill(0),vars:Array(8).fill(0),ending:0,chosen:Array(256).fill(0),choice:null,autoChoice:false,answer:0,read:[],chapters:[],bg:-1,
   pending:null,textActive:false,textWaiting:false,textSource:null,textPart:0,backgrounds:{},shadows:{},shadowSlot:0,shadowVisible:true,shadowColours:[[5,0,15],[0,0,0]],variant:0,scene:{background:null,sprites:{},layers:[],music:null},soundChannels:{},soundVariants:{},display:null,ended:false,warnings:[]};
 }
 get current(){return this.state.pending;}
 fail(c,msg){throw Error(`kama:${this.state.script}:${(c?.offset??this.state.pc).toString(16)}: ${msg}`);}
 warn(c,message){if(!this.state.warnings.some(w=>w.message===message))this.state.warnings.push({source:c.id,message});}
 async loadScript(id){if(this.scripts[id])return this.scripts[id];const ref=this.content.runtime.scripts[id];if(!ref)throw Error('Unknown Kamaitachi script '+id);const d=await this.loadJSON(ref.url);if(d.format!=='vnkit.kamaitachi-script'||d.version!==1||d.id!==Number(id)||d.sha256!==ref.sha256||!Array.isArray(d.commands))throw Error('Kamaitachi script identity mismatch');return this.scripts[id]={...d,commands:Object.fromEntries(d.commands.map(c=>[c.offset,c]))};}
 async jump(label,local=false){const id=local?this.state.script:Math.floor(label/1000),entry=label%1000,script=await this.loadScript(id),pc=script.entries[entry];if(!script.commands[pc])this.fail(null,'Invalid source entry '+label);this.state.script=id;this.state.pc=pc;}
 async offset(pc){const script=await this.loadScript(this.state.script);if(!script.commands[pc])this.fail(null,'Invalid source offset');this.state.pc=pc;}
 ret(c){const frame=this.state.stack.pop();if(!frame)this.fail(c,'Return without caller');this.state.script=frame.script;this.state.pc=frame.pc;}
 mark(id){if(!this.state.read.includes(id))this.state.read.push(id);}
 asset(id,type,c){if(this.content.assets[id]?.type!==type)this.fail(c,'Original resource unavailable: '+id);return id;}
 playAudio(id,c,effects){
  const s=this.state;if([9999,65535].includes(id))return;
  if(id<1000){if(id>=88){s.scene.music=null;return;}
   // The native music dispatch table has deliberate stop entries.
   if(this.musicStops.has(id)){s.scene.music=null;return;}
   const asset=this.asset(`music:${id}`,'music',c);if(s.scene.music?.asset!==asset)s.scene.music={asset,loop:true};return;
  }
  const index=id-1000,key=index%1000,pair=this.audioPairs[key];
  const rows=pair?.[0]===1?[[key,`sound:${100000+index*2}`],[pair[1],`sound:${100001+index*2}`]]:[[key,`sound:${index}`]];
  for(const [logical,resource]of rows){const variant=this.audioKinds[key]===0?(s.soundVariants[key]||0):0,asset=this.asset(resource+(variant?`:v${variant}`:''),'sound',c),channel=`kama:sound:${logical}`;s.soundChannels[channel]=asset;effects.push({op:'stopSound',channel},{op:'sound',asset,channel,loop:this.content.assets[asset].loopEnd!=null});}
 }
 stopAudio(id,c,effects){if(id===65535)return;const s=this.state;if(id<1000){s.scene.music=null;return;}
  const key=(id-1000)%1000,pair=this.audioPairs[key];for(const logical of pair?.[0]===1?[key,pair[1]]:[key]){const channel=`kama:sound:${logical}`;effects.push({op:'stopSound',channel});delete s.soundChannels[channel];}
 }

 compose(){const s=this.state;s.scene.layers=Object.entries(s.backgrounds).sort(([a],[b])=>[14,12,13,11][Number(b)]-[14,12,13,11][Number(a)]).filter(([,r])=>r.visible).map(([,r])=>({asset:r.asset,x:0,y:-4/240*100,width:100,height:100,opacity:r.opacity??1}));
  s.scene.task={id:'kamaitachi-shadows',source:JSON.stringify([s.shadows,s.shadowColours,s.shadowVisible])};
 }
 mountScene(root,url){return mountKamaitachiShadows(root,url,this.state,this.content.assets);}

 page(options=null){return kamaitachiPage(this.pages.page,this.pages.font,options);}
 presentText(r){const s=this.state,page=this.page(),source={...s.textSource,part:s.textPart++},text=r.glyphs.map(g=>g.text).join('');
  const p={kind:'text',id:`kama:${source.script}:${source.offset.toString(16)}:${source.part}`,source,occurrenceId:this.makeId(),speaker:'',text,displayText:page.blocks.map(b=>b.text).join('\n'),page};validateSoundPage(p);s.display=clone(p);s.pending=p;
 }
 choicePending(c){const options=this.state.choice.options.map((o,i)=>({id:String(i),text:''})),page=this.page(options);if(options.some(o=>!o.text))this.fail(c,'Native choice page omits an option');const source=this.state.choice.source,p={kind:'choice',id:`kama:${source.script}:${source.offset.toString(16)}`,source,occurrenceId:this.makeId(),options,page};validateSoundPage(p);this.state.pending=p;}
 wait(c,ms,extra={}){if(!Number.isFinite(ms)||ms<0||ms>600000)this.fail(c,'Source wait outside bounds');this.state.pending={kind:'wait',id:c.id,source:{script:this.state.script,offset:c.offset},ms,remainingMs:ms,display:clone(this.state.display),...extra};}
 end(c){this.state.ended=true;this.state.pending={kind:'end',id:c.id,source:{script:this.state.script,offset:c.offset}};this.state.scene.music=null;}
 async run(){const state=clone(this.state),text=this.pages.snapshot();try{return await this.execute();}catch(error){this.state=state;this.pages.loadSnapshot(text);throw error;}}
 async execute(){if(this.current)return{pending:this.current,effects:[]};const effects=[];
  for(let step=0;step<100000;step++){
   const s=this.state,p=this.pages.p;
   if(s.textActive){const r=s.textWaiting?this.pages.advance():this.pages.boundary();s.textWaiting=r.kind==='text';if(r.kind==='done')s.textActive=false;
    if(!s.choice&&(r.glyphs.length||r.kind==='text')){this.presentText(r);return{pending:this.current,effects};}continue;}
   const script=await this.loadScript(s.script),c=script.commands[s.pc];if(!c)this.fail(null,'Execution outside decoded source');s.pc=c.next;const a=c.args;
   const visual=()=>this.warn(c,'Native animation, silhouette blending and fades remain approximate');
   switch(c.op){
    case 0:s.textSource={script:s.script,offset:c.offset};s.textPart=0;this.pages.start(a,s.textSource);s.textActive=true;s.textWaiting=false;break;
    case 1:case 0x56:await this.jump(word(a));if(c.op===0x56)this.mark(word(a,2));break;
    case 2:if(s.stack.length>=8)this.fail(c,'Native call stack bound');s.stack.push({script:s.script,pc:s.pc});await this.jump(word(a));break;
    case 3:this.ret(c);break;
    case 0xd:case 0x1a:if(!s.choice)s.flags[Math.min(79,a[0])]=c.op===0xd?1:0;break;
    case 0xe:case 0xf:case 0x54:case 0x55:if(!s.choice&&Boolean(s.flags[a[0]])===Boolean(c.op&1)){await this.jump(word(a,1));if(c.op>=0x54)this.mark(word(a,3));}break;
    case 0x10:case 0x11:if(a[0]>=8)this.fail(c,'Variable index');s.vars[a[0]]=(s.vars[a[0]]+(c.op===0x10?1:-1)*a[1])&255;break;
    case 0x12:this.end(c);break;
    case 0x13:case 0x57:{if(s.choice)this.fail(c,'Nested choice');const stride=c.op===0x57?4:2;s.choice={var:a[1],options:Array.from({length:a[0]+1},(_,i)=>({target:word(a,2+i*stride),read:stride===4?word(a,4+i*stride):null})),source:{script:s.script,offset:c.offset}};this.pages.choice(true);break;}
    case 0x14:this.pages.indent(a[0]+8);break;
    case 0x15:if(s.choice)this.ret(c);break;
    case 0x16:if(!s.choice)this.fail(c,'Choice without source options');if(s.autoChoice){await this.select(s.answer);s.autoChoice=false;}else this.choicePending(c);break;
    case 0x17:if(!s.choice){ // The native label body ends at its first 0x15, at character boundaries.
      let n=0;for(;n<100;n++){const body=script.commands[s.pc];if(!body)this.fail(c,'Unparsed inline label');s.pc=body.next;if(body.op===0x15)break;if(body.op!==0)this.fail(c,'Unexpected inline label control');}if(n===100)this.fail(c,'Inline label bound');
     }break;
    case 0x18:if(!s.choice)this.pages.indent(word(a)+(word(a)>>2));break;
    case 0x19:if(!s.choice)this.pages.y(word(a));break;
    case 0x1d:if(!s.choice)await this.native(c,a[0]);break;
    case 0x1e:if(s.autoChoice)await this.offset(word(a));break;
    case 0x21:case 0x22:if(!s.choice){const bit=1<<((a[0]-1)&31);s.ending=(c.op===0x21?s.ending|bit:s.ending&~bit)&65535;}break;
    case 0x24:case 0x25:case 0x5d:case 0x5e:if(!s.choice&&Boolean(s.ending&(1<<((a[0]-1)&31)))===[0x25,0x5e].includes(c.op)){await this.jump(word(a,1));if(c.op>=0x5d)this.mark(word(a,3));}break;
    case 0x40:if(s.vars[a[0]]===a[1])await this.jump(word(a,2));break;
    case 0x41:if(a[0]>=8)this.fail(c,'Variable index');s.vars[a[0]]=a[1];break;
    case 0x45:if(!s.choice&&s.bg===word(a))await this.offset(word(a,2));break;
    case 0x53:case 0x5f:if(!s.choice&&!s.chapters.includes(word(a)))s.chapters.push(word(a));break;
    case 0x58:if(!s.choice)this.mark(word(a));break;
    case 0x1b:case 0x50:case 0x5c:case 0x33:case 0x37:case 0x38:break; // Native consumed operands / no operation.
    case 4:case 5:case 6:case 7:if(!s.choice){const slot=c.op-4,id=word(a)+s.variant*1000;s.backgrounds[slot]={asset:this.asset(`bgd:${id}`,'image',c),visible:slot===0};if(slot===0){s.bg=word(a);s.vars[2]=s.bg&255;}this.compose();}break;
    case 8:case 9:if(!s.choice){if(a[2]===5)s.shadowVisible=c.op===9;const layer=s.backgrounds[a[2]-1];if(layer)layer.visible=c.op===9;this.compose();visual();}break;
    case 0xa:if(!s.choice){delete s.backgrounds[a[0]];this.compose();}break;
    case 0xb:if(!s.choice){visual();}break;
    case 0xc:if(!s.choice)this.wait(c,word(a)*1000/60);break;
    case 0x1c:if(!s.choice)visual();break;
    case 0x23:if(!s.choice){s.variant=(31-a[0])>>3;visual();}break;
    case 0x26:case 0x27:case 0x28:case 0x46:case 0x47:case 0x48:if(!s.choice){const index=(c.op&15)-6;s.shadowColours[c.op<0x40?0:1][[1,0,2][index]]=a[0];this.compose();}break;
    case 0x5b:if(!s.choice)visual();break;
    case 0x29:if(!s.choice){const id=(a[0]<<8)+word(a,1),slot=s.shadowSlot++;s.shadows[slot]={asset:this.asset(`sdw-index:${id}`,'image',c),visible:true};this.compose();visual();}break;
    case 0x2a:case 0x2c:if(!s.choice){s.shadows={};s.shadowSlot=0;if(c.op===0x2c)s.shadowColours[0]=[5,0,15];this.compose();}break;
    case 0x2d:case 0x2e:if(!s.choice){for(const shadow of Object.values(s.shadows))shadow.visible=c.op===0x2e;this.compose();visual();}break;
    case 0x2b:if(!s.choice)visual();break;
    case 0x30:case 0x32:if(!s.choice){let id=word(a,c.op===0x32?2:0);if(id>=1000&&![9999,65535].includes(id)){const key=id%1000,variant=Math.trunc((id-1000)/1000);s.soundVariants[key]=variant;if(this.audioKinds[key]===0)id=1000+key;}this.playAudio(id,c,effects);}break;
    case 0x31:if(!s.choice){this.stopAudio(word(a,2),c,effects);visual();}break;
    case 0x2f:if(!s.choice)this.stopAudio(word(a),c,effects);break;
    case 0x34:if(!s.choice){const id=word(a);if(id>=1000){const channel=`kama:sound:${id%1000}`,asset=s.soundChannels[channel];if(asset){const cue=this.content.assets[asset].cue,untilSeconds=(cue?.completionFrame??600)/60;this.wait(c,10000,{soundWait:{asset,channel,untilSeconds,timeoutMs:10000}});}}}break;
    case 0x35:case 0x36:if(!s.choice){const id=word(a,1);if(id===65535)break;
      if(id<1000){this.warn(c,'Original out-of-range sound-selector commands are omitted');break;}
      const key=(id-1000)%1000,kind=this.audioKinds[key];if(![0,1].includes(kind))this.fail(c,'Unaudited sound selector');s.soundVariants[key]=a[0];
      if(kind===1)this.playAudio(id+1000*a[0],c,effects);else if(c.op===0x36)this.playAudio(id,c,effects);
     }break;
    case 0x59:if(!s.choice)visual();break; // Wait for the previously scheduled native visual effect.
    case 0x3e:break; // Native history/checkpoint recording; the reader owns its independent save/history bank.
    case 0x42:s.context=a[0];break;
    case 0x4b:s.chapterContext=Math.floor(word(a)/1000);break;
    case 0x43:if(!s.choice)this.wait(c,word(a)*1000/60);break;
    case 0x39:case 0x3a:case 0x3b:case 0x4d:case 0x4f:case 0x51:case 0x52:case 0x4c:case 0x49:if(!s.choice)visual();break;
    case 0x60:case 0x61:case 0x62:case 0x63:case 0x64:if(!s.choice)visual();break;
    default:this.fail(c,`Unaudited source operation 0x${c.op.toString(16)}`);
   }
   if(this.current)return{pending:this.current,effects};
  }this.fail(null,'Control instruction budget');
 }
 async native(c,n){const s=this.state,p=this.pages.p;
  if(this.nativeNoops.has(n))return;
  switch(n){
   case 0:this.end(c);return;
   case 3:case 4:s.pending={kind:'input',id:c.id,source:{script:s.script,offset:c.offset},slots:n===3?[1,2]:[0],fields:(n===3?[1,2]:[0]).map(slot=>({id:String(slot),label:n===3?'名前':'',maxLength:6})),display:clone(s.display)};return;
   case 7:p.write(0x800792a8,1,1);return;
   case 0x1c:s.autoChoice=true;return;
   case 0x20:case 0x21:case 0x22:s.answer=this.pages.matchName(n);return;
   case 1:case 0x12:case 0x23:case 0x27:this.warn(c,'Native auxiliary graphics and cursor animation remain approximate');return;
   case 0x28:p.write(0x800792aa,1,1);return;
   case 0x29:p.write(0x800792aa,0,1);return;
   case 0x24:{const f=s.flags;if([1,2,3,4].some(i=>f[i]))f[51]=1;if([...Array.from({length:20},(_,i)=>i+1),43].every(i=>f[i]))f[52]=1;if(f[24])f[53]=1;if([...Array.from({length:43},(_,i)=>i+1),46,47].every(i=>f[i]===1))f[54]=1;return;}
   case 0x66:p.write(0x801eef40,0);return;
   case 0x67:this.pages.clear();s.display=null;return;
   case 0x68:case 0x69:case 0x6a:case 0x6b:return; // Original auto/input preferences; shared reader owns these controls.
   default:this.fail(c,`Unaudited native 0x${n.toString(16)}`);
  }
 }
 async select(index){const s=this.state,c=s.choice,o=c?.options[index];if(!Number.isInteger(index)||!o)throw Error('Choose a visible original option');s.chosen[c.var]=index;if(o.read!==null)this.mark(o.read);s.choice=null;this.pages.choice(false);this.pages.p.call(0x8003a5c4);await this.jump(o.target);}
 async advance(value){const state=clone(this.state),text=this.pages.snapshot();try{const p=this.current;if(p?.kind==='end')return{pending:p,effects:[]};if(p?.kind==='choice'){if(!p.options.some(o=>o.id===String(value)))throw Error('Choose a visible option');await this.select(Number(value));}else if(p?.kind==='input'){if(!value||typeof value!=='object')throw Error('Enter the original name');for(const slot of p.slots)this.pages.setName(slot,value[String(slot)]);if(p.slots[0]===0)this.state.autoChoice=true;}this.state.pending=null;return await this.execute();}catch(error){this.state=state;this.pages.loadSnapshot(text);throw error;}}
 save(media={}){return{format:'vnkit.save',version:1,gameId:this.content.id,gameSignature:this.signature,savedAt:new Date().toISOString(),state:clone(this.state),kernel:this.pages.snapshot(),media:clone(media)};}
 async restore(save){
  if(save?.format!=='vnkit.save'||save.version!==1||save.gameId!==this.content.id||save.gameSignature!==this.signature)throw Error('Incompatible Kamaitachi save');
  const s=clone(save.state),before=clone(this.state),text=this.pages.snapshot(),progress=this.progressSnapshot();
  try{
   if(!s||!bytes(s.flags,80)||!bytes(s.vars,8)||!bytes(s.chosen,256)||!Number.isInteger(s.ending)||s.ending<0||s.ending>65535||!Array.isArray(s.stack)||s.stack.length>8||!Array.isArray(s.read)||s.read.length>65536||s.read.some(x=>!Number.isInteger(x)||x<0||x>65535)||!Array.isArray(s.chapters)||s.chapters.length>65536||!s.scene||!s.backgrounds||!s.shadows||!Array.isArray(s.warnings)||s.warnings.length>64)throw Error('Invalid Kamaitachi state');
   const script=await this.loadScript(s.script);if(!Number.isInteger(s.pc)||s.pc<0||s.pc>script.size)throw Error('Invalid saved program position');
   for(const f of s.stack)if(!(await this.loadScript(f.script)).commands[f.pc])throw Error('Invalid saved caller');
   if(s.textActive){const c=(await this.loadScript(s.textSource?.script)).commands[s.textSource?.offset];if(c?.op!==0||JSON.stringify(c.args)!==JSON.stringify(save.kernel?.input))throw Error('Saved text input differs from source');}
   if(s.choice){const c=(await this.loadScript(s.choice.source?.script)).commands[s.choice.source?.offset],stride=c?.op===0x57?4:2;if(![0x13,0x57].includes(c?.op)||s.choice.var!==c.args[1]||JSON.stringify(s.choice.options)!==JSON.stringify(Array.from({length:c.args[0]+1},(_,i)=>({target:word(c.args,2+i*stride),read:stride===4?word(c.args,4+i*stride):null}))))throw Error('Saved choices differ from source');}
   if(s.pending){const p=s.pending,c=(await this.loadScript(p.source?.script)).commands[p.source?.offset];if(!c||!['text','choice','input','wait','end'].includes(p.kind))throw Error('Invalid saved presentation');if(['text','choice'].includes(p.kind))validateSoundPage(p);if(p.kind==='text'&&c.op!==0||p.kind==='choice'&&!s.choice||p.kind==='input'&&!(c.op===0x1d&&[3,4].includes(c.args[0])))throw Error('Saved boundary differs from source');}
   for(const r of [...Object.values(s.backgrounds),...Object.values(s.shadows)])if(this.content.assets[r.asset]?.type!=='image'||typeof r.visible!=='boolean')throw Error('Invalid saved scene resource');
   shadowPalette(s.shadowColours);
   if(typeof s.shadowVisible!=='boolean'||Object.keys(s.shadows).length>1024||!Number.isInteger(s.shadowSlot)||s.shadowSlot<0||s.shadowSlot>1000000)throw Error('Invalid saved silhouette state');
   if(!s.soundChannels||Object.entries(s.soundChannels).some(([k,v])=>!/^kama:sound:\d{1,3}$/.test(k)||this.content.assets[v]?.type!=='sound')||!s.soundVariants||Object.entries(s.soundVariants).some(([k,v])=>!/^\d{1,3}$/.test(k)||!Number.isInteger(v)||v<0||v>255))throw Error('Invalid saved sound controller');
   if(s.scene.music&&this.content.assets[s.scene.music.asset]?.type!=='music')throw Error('Invalid saved music');
   this.pages.loadSnapshot(save.kernel);this.state=s;if(['text','choice'].includes(s.pending?.kind)){const options=s.pending.kind==='choice'?s.pending.options.map(o=>({...o})):null;if(JSON.stringify(this.page(options))!==JSON.stringify(s.pending.page))throw Error('Saved page differs from native glyphs');}
   this.applyProgress(progress);this.compose();return{pending:this.current,effects:[],restored:true};
  }catch(error){this.state=before;this.pages.loadSnapshot(text);throw error;}
 }
 progressSnapshot(){return{format:'vnkit.progress',version:1,gameId:this.content.id,gameSignature:this.signature,flags:[...this.state.flags]};}
 applyProgress(p){if(!p)return;if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature||!bytes(p.flags,80))throw Error('Invalid Kamaitachi progress');this.state.flags=[...p.flags];}
 newGameEntries(){return[{id:'start',label:'Start again'}];}
 async startNew(progress,entry='start'){if(this.current||entry!=='start')throw Error('New game requires a fresh engine');this.applyProgress(progress);return this.run();}
 soundtrack(){return Object.entries(this.content.assets).filter(([,a])=>a.type==='music').map(([asset])=>({asset,label:asset.split(':')[1]}));}
}
