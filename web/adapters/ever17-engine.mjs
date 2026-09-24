/* SLPM-65421 v1.01 MAC variant. Shared primitives retain R11's defaults. */
import {Remember11Engine,validateRemember11Content} from './remember11-engine.mjs';
const clone=structuredClone;
const routes=[['tsugumi','つぐみ',48],['sora','空',49],['you','優',53],['sara','沙羅',56],['coco','ココ',58]];
export const validateEver17Content=c=>validateRemember11Content(c,'ever17-ps2-kid');

export class Ever17Engine extends Remember11Engine {
  static async create(content,options={}){
    const errors=validateEver17Content(content);if(errors.length)throw Error(errors.join('\n'));
    const engine=new Ever17Engine(content,options);await engine.loadScript(engine.state.script);return engine;
  }
  get scriptFormat(){return 'vnkit.ever17-script';}
  get pendingOperations(){return {...super.pendingOperations,pause:[13],wait:[11,12,64,70]};}
  calculate(i){
    if(i.sub===15){
      const index=this.value(i.words[2]),target=i.jumpTable?.[index];
      if(!Number.isInteger(target))this.fail(i,`Unestablished external entry selector ${index}`);
      this.state.pc=target;return;
    }
    // Native switch at 0x2259f0: Ever17 inserts CG registration before
    // saturating add/subtract/conditional increment. Preserve R11 numbering.
    if(i.sub===17){if(i.words[1]>>12===2)this.state.catalog.cg[i.words[1]&4095]=true;return;}
    if(i.sub>=18&&i.sub<=20)return super.calculate({...i,sub:i.sub-1});
    return super.calculate(i);
  }
  text(raw,i){
    // 0x126a40: two decimal digits following % select native font state.
    // They are formatting, never narrative. Keep all other controls strict.
    return super.text(raw.replace(/%\d{2}/g,''),i);
  }
  compose(){
    const s=this.state;s.scene.background=null;
    s.scene.layers=Object.entries(s.graphics).filter(([,g])=>g.visible).sort(([a,x],[b,y])=>x.z-y.z||+a-+b).map(([,g])=>{
      const a=this.content.assets[g.asset],portrait=(Number(g.asset.split(':')[1])>>12)===3;
      return {asset:g.asset,x:(g.x-(portrait?a.width/2:0))/640*100,y:(portrait?-g.y:g.y)/480*100,
        width:a.width/640*100,height:a.height/480*100,...(g.opacity==null?{}:{opacity:g.opacity})};
    });
  }
  executeVariant(i,effects){
    const s=this.state,source={script:s.script,offset:i.offset};
    switch(i.sourceOp){
      case 1:
        if(i.sub===2){
          s.credits={variant:this.value(0x6000),source:i.id};
          this.warn(i,'Native animated credits are omitted; the original post-credits scenario continues');
          return true;
        }
        if(i.sub!==1)this.fail(i,`Unknown end mode ${i.sub}`);
        return false;
      case 0x0d:s.pending={kind:'pause',id:i.id,source,display:s.lastMessage||null};return true;
      case 0x3b:s.musicFade=i.sub;return true;
      case 0x3f:{
        const channel='kid:0',asset=s.sounds[0];effects.push({op:'stopSound',channel});
        if(asset&&![0,3].includes(i.sub))effects.push({op:'sound',asset,channel,loop:Number.isFinite(this.content.assets[asset].loopStart)});
        s.activeSound=asset&&![0,3].includes(i.sub)?{asset,channel}:null;return true;
      }
      case 0x40:
        if(i.sub===2&&s.activeSound&&!Number.isFinite(this.content.assets[s.activeSound.asset].loopStart))
          s.pending={kind:'wait',id:i.id,source,ms:0,remainingMs:0,soundWait:clone(s.activeSound)};
        return true;
      case 0x41:case 0x42:s.soundSettings={...s.soundSettings,[i.name]:i.sub};this.warn(i,'Native sound envelopes are approximated by the reader volume controls');return true;
      case 0x47:s.voiceSettings={...s.voiceSettings,[i.name]:i.sub};return true;
      case 0x4c:s.titleIndex=i.titleIndex;s.catalog.scenes[i.titleIndex]=true;return true;
      case 0x6b:s.map={...s.map,visible:i.sub===0};this.warn(i,'Native map overlay presentation is incomplete');return true;
      case 0x6c:s.map={...s.map,point:{slot:i.sub,id:i.words[1],x:(i.words[2]<<16)>>16,y:(i.words[3]<<16)>>16}};return true;
      case 0x6d:s.map={...s.map,route:{slot:i.sub,table:i.words[1]}};this.warn(i,'Native map travel animation is omitted');return true;
      default:return false;
    }
  }
  routeProgress(){return routes.map(([id,label,bit])=>({id,label,complete:Boolean(this.state.vars.globalBits[bit]),manual:Boolean(this.state.manualCompletions[id])}));}
  markRouteComplete(id){
    const route=routes.find(r=>r[0]===id);if(!route)throw Error('Unknown route');
    // Native source clear + epilogue cells, Y_ED/SYEP/SSEP/YCEP. Manual
    // completion is explicit user intent, distinct from earned route replays.
    const cells={tsugumi:[33,48],sora:[34,49],you:[32,52,53],sara:[35,55,56],coco:[36,58]};
    for(const bit of cells[id])this.state.vars.globalBits[bit]=1;
    if([48,49,53,56].every(bit=>this.state.vars.globalBits[bit]))this.state.vars.globalBits[59]=1;
    this.state.manualCompletions[id]=true;
  }
  progressNotice(){return this.state.vars.globalBits[59]?'The final route is unlocked. Start again to find its new choices.':'The final route unlocks after the four original routes and their required epilogues.';}
  newGameEntries(){return [{id:'start',label:'Start again'}];}
  async startNew(progress,entry='start'){
    if(this.state.pc||this.current)throw Error('New game requires a fresh engine');
    if(entry!=='start')throw Error('Unknown entry');this.applyProgress(progress);return this.run();
  }
  applyProgress(p){
    if(!p)return;
    if(p.format!=='vnkit.progress'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw Error('Incompatible Ever17 progress');
    for(const key of ['global','globalBits']){
      const bank=p.globals?.[key];
      if(!bank||Array.isArray(bank)||Object.entries(bank).some(([n,v])=>!/^\d+$/.test(n)||+n>8191||!Number.isInteger(v)||v< -32768||v>32767||(key==='globalBits'&&![0,1].includes(v))))throw Error('Invalid progress banks');
    }
    const catalog=this.normalizeCatalog(p.globals.catalog);
    if(p.completions&&Object.entries(p.completions).some(([k,v])=>!routes.some(r=>r[0]===k)||v!==true))throw Error('Invalid completion provenance');
    for(const key of ['global','globalBits'])this.state.vars[key]=clone(p.globals[key]);
    this.state.catalog=catalog;this.state.manualCompletions=clone(p.completions||{});
  }
  async loadReadPaths(){
    this.readPaths={};
    try{
      const p=await this.loadJSON('read-paths.json');
      if(p?.format!=='vnkit.read-paths'||p.version!==1||p.gameId!==this.content.id||p.gameSignature!==this.signature)throw Error('Incompatible read paths');
      for(const [id,path]of Object.entries(p.paths||{})){
        if(!routes.some(r=>r[0]===id)||!Array.isArray(path.ids)||path.ids.length>100000||!path.ids.every(v=>typeof v==='string'&&/^[^:]+:[0-9a-f]{4,8}$/.test(v)&&this.content.runtime.scripts[v.split(':')[0]]))throw Error('Invalid source read path');
        this.readPaths[id]=new Set(path.ids);
      }this.readPathWarning='';
    }catch(error){this.readPathWarning=`Completed-route read paths unavailable: ${error.message}`;}
  }
}
