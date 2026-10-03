/* Bounded opening presentation experiment, not the shared reader adapter.
 * Drivers load/validate media before committing it. Frame scheduling and font
 * drawing remain host responsibilities; this does not claim PSP fidelity. */
import {Shibuya428Audio} from './shibuya428-audio.mjs';
import {Shibuya428Music} from './shibuya428-music.mjs';
import {Shibuya428Motion} from './shibuya428-motion.mjs';
import {Shibuya428Pictures} from './shibuya428-picture.mjs';
import {Shibuya428Channels} from './shibuya428-channels.mjs';
import {Shibuya428Feedback} from './shibuya428-feedback.mjs';
import {require428OpeningCommand} from './shibuya428-media.mjs';
import {Shibuya428Threads} from './shibuya428-threads.mjs';
export class Shibuya428OpeningPresentation {
  constructor(driver, assets, {textKernel=null,shakeKernel=null,randomState=null,noiseKernel=null,noiseSeed=null,sourceScripts=null}={}) {
    for(const method of ['frame','picture','text'])
      if(typeof driver?.[method]!=='function')throw Error(`Missing presentation driver ${method}`);
    this.driver=driver;this.assets=assets;this.text='';this.defaultCadence=textKernel?.defaults.find(c=>c.type==='textDefaultCadence')?.frames??1;this.cadence=this.defaultCadence;this.frame=0;this.textKernel=textKernel;
    this.pictures=new Shibuya428Pictures(driver);this.effects=this.pictures.effects;
    this.feedback=new Shibuya428Feedback();
    this.audio=new Shibuya428Audio(driver,assets);this.fade=null;this.glyphs=[];this.busy=false;
    this.channels=new Shibuya428Channels();this.music=new Shibuya428Music(driver,assets,{channels:this.channels});this.motion=new Shibuya428Motion(driver,assets,{shakeKernel,randomState,noiseKernel,noiseSeed});this.wholeFade=null;
    this.threads=sourceScripts?new Shibuya428Threads(sourceScripts):null;this.clockBusy=false;this.clockError=null;this.clockWaiters=[];
    this.pictureSlots=new Map();
  }
  resource(event, type) {
    const resource=type==='movie'?event.command.resource&0x3fff:event.command.resource;
    const asset=this.assets[`${event.script}:${resource}`];
    if(!asset || asset.type!==type)throw Error(`${event.id}: Missing original ${type} resource`);
    return asset;
  }
  draw() {
    const title=this.tipHeading,prefix=title?title.text+'\n':'',glyphs=[...(title?.glyphs??[]),...this.glyphs.map(g=>({...g,textOffset:g.textOffset+prefix.length}))];
    this.driver.text(prefix+this.text,glyphs.map(g=>(g.renderOpacity??g.opacity)/128),glyphs.map(g=>g.layout?{...g.layout,textOffset:g.textOffset}:null),this.textKernel?.choiceImages?.()??[]);
  }
  applyTextChanges(changes){
    for(const change of changes)for(const glyph of this.glyphs){
      const index=glyph.layout?.nativeIndex;
      if(index==null||index<change.start||index>change.end)continue;
      if(change.kind==='colorRange')glyph.layout.color=[...change.color];
      else if(change.kind==='alphaRange'){glyph.opacity=change.alpha;glyph.renderOpacity=change.alpha;glyph.active=false;}
    }
  }
  highlightChoice(index){
    if(this.busy||!this.textKernel)throw Error('Choice highlight unavailable');
    const native=this.textKernel.checkpoint(),glyphs=structuredClone(this.glyphs);
    try{this.applyTextChanges(this.textKernel.highlightChoice(index));this.draw();}
    catch(error){this.glyphs=glyphs;this.textKernel.restore(native);try{this.draw();}catch{}throw error;}
  }
  tick() {
    this.frame++;
    if(this.scenePaused)return;
    this.feedback.tick();
    let changed=false;
    if(this.wholeFade?.active){
      const fade=this.wholeFade,next=Math.fround(fade.opacity+fade.delta);
      fade.opacity=Math.max(0,Math.min(128,next));
      if(next<=0||next>=128)fade.active=false;
      for(const glyph of this.glyphs)glyph.renderOpacity=fade.opacity;
      changed=true;
    }else for(const glyph of this.glyphs)if(glyph.active){
      glyph.opacity=Math.max(0,Math.min(128,Math.fround(glyph.opacity+glyph.delta)));
      glyph.renderOpacity=Math.trunc(glyph.opacity);
      if(glyph.opacity===(glyph.delta<0?0:128))glyph.active=false;
      changed=true;
    }
    if(!this.wholeFade)for(const glyph of this.glyphs)if(glyph.anchor?.active||glyph.anchor?.opacity===128){
      // Native inline primitives receive the untruncated alpha of their
      // associated font index, unlike the bitmap font's integer alpha setter.
      glyph.renderOpacity=glyph.anchor.opacity;changed=true;
    }
    if(changed)this.draw();
    this.pictures.tick(0);this.audio.tick();this.music.tick();this.motion.tick(0);
  }
  async stepFrame(){
    if(this.clockError)throw this.clockError;
    if(this.clockBusy)throw Error('Presentation frame already in progress');
    this.clockBusy=true;
    try{
      if(!this.scenePaused&&this.threads)await this.threads.tick({
        apply:event=>this.consume({...event,command:{...event.command,threadGroup:event.threadGroup}}),
        ready:event=>event.command.type==='pictureWait'?this.pictures.ready(event.command.layer):this.motion.ready(event.script,event.command),
        tickGroup:async(group,picture)=>{this.motion.tick(group);if(picture)this.pictures.tick(group);}
      });
      this.tick();
    }catch(error){this.clockError=error;throw error;}
    finally{this.clockBusy=false;for(const resolve of this.clockWaiters.splice(0))resolve();}
  }
  async frames(count) {
    if(!Number.isInteger(count)||count<0||count>60000)throw Error('Presentation frame budget exceeded');
    for(let n=0;n<count;n++){
      await this.driver.frame();if(!this.driver.externalClock)await this.stepFrame();
      if(this.clockError)throw this.clockError;
    }
  }
  async apply(event) {
    if(this.clockBusy)await new Promise(resolve=>this.clockWaiters.push(resolve));
    if(this.clockError)throw this.clockError;
    if(this.busy)throw Error('Presentation already in progress');
    const textOnly=event.kind==='checkpoint'||event.kind==='presentation'&&/^(text|ruby|tip|hint|choice|callCheckpoint|newline|ellipsis)/.test(event.command.type);
    const before=textOnly?structuredClone({text:this.text,glyphs:this.glyphs,fade:this.fade,wholeFade:this.wholeFade,cadence:this.cadence,hintCadence:this.hintCadence,tipCadence:this.tipCadence,tipHeading:this.tipHeading}):null;
    const native=before?this.textKernel?.checkpoint?.():null;
    this.busy=true;
    try { return await this.consume(event); }
    catch(error){
      // A failed glyph/driver operation must not consume native layout or
      // append the same text again on retry. Media clocks continue separately.
      if(before){Object.assign(this,before);if(native)this.textKernel.restore(native);try{this.draw();}catch{}}
      throw error;
    }finally { this.busy=false; }
  }
  async consume(event) {
    if(event.kind==='checkpoint'){
      if(this.effects.size||this.fade||this.wholeFade?.active||this.glyphs.some(g=>g.active))throw Error('Checkpoint reset with active media is not implemented');
      this.textKernel?.reset();this.text='';this.glyphs=[];this.wholeFade=null;this.draw();return;
    }
    if(event.kind==='wait'){await this.frames(event.frames);return;}
    // Controller 9 resumes execution without clearing the font. In particular,
    // 0x1f can be followed by a whole-page fade before the next checkpoint.
    if(event.kind==='text')return;
    if(event.kind!=='presentation')throw Error('Unsupported presentation boundary');
    const c=event.command;
    if(c.type==='callCheckpoint'){
      if(!this.textKernel?.callCheckpoint)throw Error('Source call font layout required');
      this.applyTextChanges(this.textKernel.callCheckpoint(event));return;
    }
    if(c.type.startsWith('thread')){
      if(!this.threads)throw Error('Source presentation thread scheduler required');
      if(c.type==='threadStart')this.threads.start(event);
      else if(c.type==='threadWait'){
        for(let n=0;!this.threads.ready(event);n++){
          if(n>=60000)throw Error('Thread completion frame budget');await this.frames(1);
        }
      }else if(c.type==='threadStop'){
        this.threads.stop(event);
        // The source cancellation handler finishes every thread-owned media
        // object, including those from other slots; foreground objects survive.
        for(const [key,v]of [...this.motion.effects])if(v.command.threadGroup>0)this.motion.finishEntry(key);
        for(const [layer,e]of this.effects)if(e.threadGroup>0)this.pictures.finish(layer);
      }else throw Error('Unknown thread operation');
      return;
    }
    if(this.soundWait&&this.soundWait.id!==event.id)throw Error('Source sound completion is still pending');
    if(this.movieStart&&this.movieStart.id!==event.id)throw Error('Source movie acknowledgement is still pending');
    if(c.type==='tipOpened'||c.type==='tipReturned'||c.type==='tipCheckpoint'||c.type==='tipReplayCheckpoint'){
      if(!this.textKernel||this.glyphs.some(g=>g.active)||this.wholeFade?.active||typeof this.driver.tip!=='function')throw Error('TIP requires a completed page and overlay presentation');
      if(c.type==='tipOpened'){this.tipCadence=this.cadence;await this.driver.tip({phase:'open'});}
      if(c.type==='tipReturned')await this.driver.tip(null);
      this.cadence=0;this.tipHeading=null;this.textKernel.hintReset();this.text='';this.glyphs=[];this.fade=null;this.wholeFade=null;this.draw();return;
    }
    if(c.type==='tipTitle'||c.type==='tipBody'){
      if(!Number.isInteger(this.tipCadence)||!this.textKernel?.tipPage)throw Error('TIP page has no active caller');
      this.textKernel.tipPage(event);
      if(c.type==='tipTitle')await this.driver.tip({phase:'title',style:c.style});
      else{this.tipHeading={text:this.text.trimEnd(),glyphs:structuredClone(this.glyphs.filter(g=>g.layout))};this.text='';this.glyphs=[];this.draw();}
      return;
    }
    if(c.type==='textMargin'){if(!this.textKernel?.setting)throw Error('Original text margin controller required');this.textKernel.setting(event);return;}
    if(c.type==='tipClosing'){
      if(!Number.isInteger(this.tipCadence)||typeof this.driver.tip!=='function')throw Error('TIP close has no active caller');
      await this.driver.tip({phase:'close'});return;
    }
    if(c.type==='tipReplayEnd'){
      if(!Number.isInteger(this.tipCadence))throw Error('Missing TIP return cadence');
      this.cadence=this.tipCadence;this.tipCadence=null;return;
    }
    if(c.type==='menuPause'){
      if(c.frames!==16||typeof this.driver.pauseScene!=='function')throw Error('Timeline requires scene-pause acknowledgement');
      if(!this.scenePaused){await this.driver.pauseScene({frames:c.frames});this.scenePaused=true;}
      return {freeMovieChannel:this.channels.freeMovie()};
    }
    if(c.type==='jumpTransition'){
      if(typeof c.confirm!=='boolean'||c.frames!==(c.confirm?30:0))throw Error('Invalid JUMP transition');
      if(c.confirm){
        if(typeof this.driver.pauseScene!=='function')throw Error('JUMP requires source-length audio fade');
        if(!this.scenePaused){await this.driver.pauseScene({frames:30});this.scenePaused=true;}
      }
      return;
    }
    if(c.type==='endingReset'||c.type==='timelineSelected'){
      if(typeof this.driver.reset!=='function'||!this.textKernel)throw Error('Ending requires a complete presentation reset');
      if(c.type==='timelineSelected'&&typeof this.textKernel.resetDefaults!=='function')throw Error('Timeline resume requires original font defaults');
      if(c.fadeFrames!==undefined){
        if(c.fadeFrames!==30||typeof this.driver.pauseScene!=='function')throw Error('Hour return requires a source-length audio fade');
        if(!this.scenePaused){await this.driver.pauseScene({frames:c.fadeFrames});this.scenePaused=true;}
      }
      // The host reset is idempotent: retrying a failed acknowledgement can
      // stop media again but cannot restart or replay any source media.
      await this.driver.reset();
      this.threads?.reset();
      this.pictureSlots.clear();
      this.scenePaused=false;
      this.channels.reset();this.movieChannel=null;
      this.audio.voices=[];this.music.voices=[];this.motion.effects.clear();this.effects.clear();
      this.feedback.reset();this.textKernel.reset();this.text='';this.glyphs=[];this.fade=null;this.wholeFade=null;delete this.hintCadence;
      if(c.type==='timelineSelected'){this.textKernel.resetDefaults();this.cadence=this.defaultCadence;}
      this.draw();return;
    }
    if(c.type==='characterSelected'){
      if(!this.textKernel?.resetDefaults||this.audio.voices.length||this.music.voices.length||this.effects.size||this.motion.effects.size)throw Error('Character resume requires reset media and original defaults');
      this.textKernel.resetDefaults();this.cadence=this.defaultCadence;this.text='';this.glyphs=[];this.fade=null;this.wholeFade=null;this.draw();return;
    }
    if(c.type==='hintOpened'||c.type==='hintReturned'){
      if(!this.textKernel||this.glyphs.some(g=>g.active)||this.wholeFade?.active)throw Error('Hint presentation requires a completed native page');
      if(c.type==='hintOpened')this.hintCadence=this.cadence;
      else this.cadence=0;
      this.textKernel.hintReset();this.text='';this.glyphs=[];this.fade=null;this.wholeFade=null;this.draw();return;
    }
    if(c.type==='hintReplayEnd'){
      if(!Number.isInteger(this.hintCadence))throw Error('Missing hint return cadence');
      this.cadence=this.hintCadence;delete this.hintCadence;return;
    }
    if(c.type==='choiceSelected'){
      this.textKernel?.reset();this.text='';this.glyphs=[];this.fade=null;this.wholeFade=null;this.draw();return;
    }
    if(c.type.startsWith('choice')){
      if(!this.textKernel)throw Error('Choice presentation requires original text layout');
      const changes=this.textKernel.choice(event);
      this.applyTextChanges(changes);
      this.draw();return;
    }
    if(c.type==='rubyStart'){
      if(!this.textKernel)throw Error('Ruby requires original text layout');this.textKernel.ruby(event);return;
    }
    if(c.type==='tipStart'||c.type==='tipEnd'){
      if(!this.textKernel)throw Error('TIP spans require original text layout');this.textKernel.tip(event);return;
    }
    if(c.type==='textFragment'){
      if([...this.text+c.text].filter(c=>c!=='\n').length>256)throw Error('Native glyph capacity exceeded');
      const layouts=this.textKernel?.fragment(event);let n=0;
      for(const character of c.text){
        await this.frames(this.cadence);this.text+=character;
        const layout=layouts?.[n++],effect=this.fade?{opacity:this.fade.start??0,delta:this.fade.delta,active:true}:{opacity:128,delta:0,active:false};
        for(const item of [layout,...layout?.ruby||[]])this.glyphs.push({...effect,layout:item?{...item,...(c.choiceIndex!=null?{choiceIndex:c.choiceIndex}:{})}:item,textOffset:this.text.length-character.length});this.draw();
      }
      return;
    }
    if(c.type==='newline'){this.textKernel?.newline();this.text+='\n';this.glyphs.push({opacity:128,active:false});this.draw();if(this.cadence)await this.frames(1);return;}
    if(c.type==='ellipsis'){
      if(!this.textKernel)throw Error('Animated punctuation requires original text layout');
      if(this.glyphs.length+c.count*3>256)throw Error('Native glyph capacity exceeded');
      const layouts=this.textKernel.ellipsis(event),cadence=c.cadence===255?0:c.cadence||this.cadence;
      for(let n=0;n<layouts.length;n++){
        if(c.cadence||n===0)await this.frames(cadence);
        if(n%3===0)this.text+='\u2026';
        this.glyphs.push({...this.fade?{opacity:this.fade.start??0,delta:this.fade.delta,active:true}:{opacity:128,delta:0,active:false},layout:layouts[n],textOffset:this.text.length-1});this.draw();
      }
      return;
    }
    if(c.type==='textRule'){
      if(!this.textKernel)throw Error('Inline rules require original text layout');
      const layouts=this.textKernel.rule(event);
      const textOffset=this.text.length;this.text+='\u2015'.repeat(c.count);
      for(const layout of layouts)this.glyphs.push({opacity:128,active:false,layout,textOffset,
        anchor:this.glyphs.find(g=>g.layout?.nativeIndex===layout.anchorIndex)});
      this.draw();return;
    }
    require428OpeningCommand(c);
    switch(c.type){
      case 'pictureVisible':
        if(typeof this.driver.pictureVisible!=='function')throw Error('Missing picture visibility renderer');await this.driver.pictureVisible(c.layer,c.visible);break;
      case 'deviceFeedback':this.feedback.start(c);break;
      case 'deviceFeedbackStop':this.feedback.reset();await this.frames(1);break;
      case 'deviceFeedbackWait':
        for(let n=0;!this.feedback.ready();n++){
          if(n>=120000)throw Error('Device feedback frame budget');await this.frames(1);
        }break;
      case 'textColor':
        if(!this.textKernel)throw Error('Text color requires original layout');this.textKernel.color(event);break;
      case 'pictureEffect':
        this.pictures.setup(c);break;
      case 'picture':
        if(!this.effects.has(c.layer))throw Error('Implicit picture transition is not implemented');
        {const effect=this.effects.get(c.layer);effect.loading=true;
        try{const imageSlot=Number(!(this.pictureSlots.get(c.layer)??0));await this.driver.picture(this.resource(event,'image'),c.layer,{defer:effect.type===2||effect.type===4&&!effect.swapped,blend:effect.type===3,imageSlot});this.pictureSlots.set(c.layer,imageSlot);}
        finally{delete effect.loading;}}break;
      case 'pictureWait':
        while(!this.pictures.ready(c.layer))await this.frames(1);break;
      case 'pictureFinish':this.pictures.finish(c.layer);if(!event.threadGroup)await this.frames(1);break;
      case 'sound':
        if(!this.soundWait){
          await this.audio.apply(event.script,c);
          if(c.flags&1)this.soundWait={id:event.id,script:event.script,resource:c.resource,frames:0};
        }
        if(this.soundWait){
          // Native controller 17 waits on every backend voice with this exact
          // archive/raw ID, including its start delay and overlapping plays.
          do{if(this.soundWait.frames>=60000)throw Error('Sound completion frame budget exceeded');await this.frames(1);this.soundWait.frames++;}
          while(this.audio.playing(event.script,c.resource));
          this.soundWait=null;
        }
        break;
      case 'ambient':case 'ambientStop':case 'soundStop':case 'soundControl':case 'soundDirect':
        await this.frames(await this.audio.apply(event.script,c));break;
      case 'music':await this.music.apply(event.script,c);break;
      case 'musicControl':this.music.control(c);break;
      case 'musicStop':this.music.stop(c);break;
      case 'movie':{
        const asset=this.resource(event,'movie');
        if(typeof this.driver.movie!=='function'||(asset.hasAudio!==false&&!(asset.hasAudio===true&&asset.audioConverted===true&&this.driver.movieAudio===true)))throw Error('Movie audio or playback backend is not implemented');
        const effect=this.effects.get(c.layer);
        if(effect&&![1,3,11].includes(effect.type))throw Error('Unsupported movie transition');
        if(!this.movieStart){
          const owner=`movie:${event.id}`;
          if(this.movieChannel)throw Error('An existing movie still owns its streaming channel');
          const channel=c.resource&0x4000?this.channels.acquire(owner,'movie'):null;
          if(effect)effect.loading=true;
          try{await this.driver.movie(asset,c.layer,{blend:effect?.type===3,volume:c.volumePercent/100});}
          catch(error){if(channel!==null)this.channels.release(owner);throw error;}
          finally{if(effect)delete effect.loading;}
          if(channel!==null)this.movieChannel={owner,channel,script:event.script,resource:c.resource,layer:c.layer};
          this.movieStart={id:event.id};
        }
        if(c.yieldFrame)await this.frames(1);this.movieStart=null;break;
      }
      case 'movieStop':
        if(typeof this.driver.movieStop!=='function')throw Error('Missing movie stop driver');
        if(this.movieChannel&&(this.movieChannel.script!==event.script||this.movieChannel.resource!==c.resource||this.movieChannel.layer!==c.layer))throw Error('Movie channel stop identity mismatch');
        await this.driver.movieStop(this.resource(event,'movie'),c.layer);
        if(this.movieChannel){this.channels.release(this.movieChannel.owner);this.movieChannel=null;}break;
      case 'movieWait':{
        if(typeof this.driver.movieEnded!=='function')throw Error('Missing movie completion driver');
        const asset=this.resource(event,'movie');let ended=false;
        for(let n=0;n<60000;n++){
          await this.frames(1);if(this.driver.movieEnded(asset,c.layer)){ended=true;break;}
        }
        if(!ended)throw Error('Movie completion frame budget');break;
      }
      case 'moviePause':case 'movieResume':
        if(typeof this.driver.moviePaused!=='function')throw Error('Missing movie pause driver');
        await this.driver.moviePaused(this.resource(event,'movie'),c.layer,c.type==='moviePause');await this.frames(1);break;
      case 'motionSetup':case 'motionUpdate':case 'motionFinish':this.motion.apply(event.script,{...c,imageSlot:this.pictureSlots.get(c.layer)??0});break;
      case 'motionWait':
        for(let n=0;!this.motion.ready(event.script,c);n++){
          if(n>=60000)throw Error('Picture motion frame budget');await this.frames(1);
        }
        break;
      case 'textCadence':this.cadence=c.frames;break;
      case 'textCadenceReset':this.cadence=this.defaultCadence;break;
      case 'textPosition':
        if(!this.textKernel)throw Error('Text position requires original layout');this.textKernel.position(event);break;
      case 'textFontChange':
        if(!this.textKernel)throw Error('Font setting requires original layout');this.textKernel.font(event);break;
      case 'textShift':
        if(!this.textKernel)throw Error('Text movement requires original text layout');
        this.textKernel.shift(event);break;
      case 'textAlignment':
        if(!this.textKernel)throw Error('Text alignment requires original text layout');
        this.textKernel.alignment(event);break;
      case 'textFade':
        if(this.fade)throw Error('Overlapping text fade is not implemented');
        if(c.frames>60000)throw Error('Text effect frame budget exceeded');
        // 0x03 arms the per-glyph effect. Each subsequently emitted glyph
        // gets its own native float32 alpha/delta record (0x08892a9c).
        this.fade={delta:Math.fround((c.direction==='out'?-128:128)/c.frames),...(c.direction==='out'?{start:128}:{})};
        if(c.batch)this.cadence=0;
        if(c.frames===1)await this.frames(1);break;
      case 'textFadeEnd':this.fade=null;if(c.batch)this.cadence=this.defaultCadence;break;
      case 'textWholeFade':
        if(this.fade||this.wholeFade?.active||this.glyphs.some(g=>g.active))throw Error('Overlapping whole-text fade is not implemented');
        if(!['in','out'].includes(c.direction)||!Number.isInteger(c.frames)||c.frames<1||c.frames>60000)throw Error('Text effect frame budget exceeded');
        this.wholeFade={opacity:c.direction==='in'?0:128,delta:Math.fround((c.direction==='in'?128:-128)/c.frames),active:true};
        if(c.frames===1)await this.frames(1);break;
      case 'textWait':
        if(this.fade)throw Error('Waiting while text fade remains armed');
        for(let n=0;this.wholeFade?.active||this.glyphs.some(g=>g.active);n++){
          if(n>=60000)throw Error('Text effect frame budget exceeded');
          await this.frames(1);
        }
        break;
    }
  }
}
