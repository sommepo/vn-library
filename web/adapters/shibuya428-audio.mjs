/* Numeric SNS voices. Full IDs identify instances; masked IDs identify CPK
 * members. Delay, initial fade and later envelope updates are separate native
 * states. The driver owns decoding and original loop sample boundaries. */
const f=Math.fround,backendGain=value=>f(f(value*100)/100),clamp=x=>Math.max(0,Math.min(1,x));
export class Shibuya428Audio {
  constructor(driver,assets){
    for(const method of ['prepareVoice','startVoice','gainVoice','stopVoice'])if(typeof driver?.[method]!=='function')throw Error(`Missing audio driver ${method}`);
    this.driver=driver;this.assets=assets;this.voices=[];this.nextId=1;this.frame=0;
  }
  asset(script,resource){
    const asset=this.assets[`${script}:${resource&0x3fff}`];
    if(!asset||asset.type!=='audio')throw Error('Missing original numeric sound resource');
    return asset;
  }
  async create(script,c,category){
    const asset=this.asset(script,c.resource);
    const movieAsset=c.selector?this.movieAsset(script,c):null;
    if(this.voices.length>=128)throw Error('Sound voice budget exceeded');
    const fade=category===4?c.incomingFrames:c.parameterA,delay=category===4?c.incomingDelay:c.parameterB;
    if(fade>60000||delay>60000)throw Error('Sound envelope budget exceeded');
    await this.driver.prepareVoice(asset);
    const voice={id:this.nextId++,asset,script,resource:c.resource,category,status:1,
      volume:fade?0:c.volume,target:c.volume,delay,fade,elapsed:0,envelope:null,
      pan:c.pan||0,spatialDistance:c.spatialDistance||0,movieGate:c.selector||0,movieAsset};
    this.voices.unshift(voice);return voice;
  }
  ended(id){this.voices=this.voices.filter(v=>v.id!==id);}
  playing(script,resource){return this.voices.some(v=>v.script===script&&v.resource===resource&&v.status!==5);}
  movieAsset(script,c){
    const asset=this.assets[`${script}:${c.secondaryResource}`];
    if(!Number.isInteger(c.selector)||c.selector<1||c.selector>65535||!Number.isInteger(c.secondaryResource)||c.secondaryResource<0||c.secondaryResource>=0x4000||asset?.type!=='movie'||typeof this.driver.movieFrame!=='function')throw Error('Missing original movie clock for sound');
    this.movieFrame(asset);return asset;
  }
  movieFrame(asset){
    const frame=this.driver.movieFrame(asset);
    if(!Number.isInteger(frame)||frame< -1||frame>0x7fffffff)throw Error('Invalid original movie frame');
    return frame;
  }
  envelope(voice,to,frames,delay){
    if(frames>60000||delay>60000)throw Error('Sound envelope budget exceeded');
    voice.target=to;voice.envelope={from:voice.volume,to,total:frames,remaining:frames,delay};
  }
  async apply(script,c){
    if(c.type==='ambientStop'){
      if(c.wait||!Number.isInteger(c.frames)||!Number.isInteger(c.delay)||c.frames<0||c.delay<0||c.frames>60000||c.delay>60000)throw Error('Unsupported ambient stop');
      // This category-wide command crosses archive/resource boundaries and
      // also updates already stopping voices, without reviving their status.
      for(const v of this.voices.filter(v=>v.category===4))this.envelope(v,0,Math.max(10,c.frames),c.delay);
      return 0;
    }
    if(c.type==='soundDirect'){
      if(c.resource&0x4000||c.flags&~2||!['1','1,2','1,3','1,2,3'].includes(c.changes.map(change=>change.field).join(','))||c.changes[0].mode!==0||c.changes[0].value<0||c.changes[0].value>1||c.changes.slice(1).some(change=>!Number.isInteger(change.value)||change.value<0||change.value>60000))throw Error('Unsupported direct sound properties');
      for(const voice of this.voices.filter(voice=>voice.script===script&&voice.resource===c.resource&&![3,5].includes(voice.status))){
        const prior=voice.envelope,to=c.changes[0].value;
        const duration=c.changes.find(change=>change.field===2)?.value;
        const delay=c.changes.find(change=>change.field===3)?.value??prior?.delay??0;
        voice.target=to;voice.envelope={from:voice.volume,to,total:duration??prior?.total??0,remaining:duration??prior?.remaining??0,delay};
      }
      return 0;
    }
    if(c.type==='soundControl'||c.type==='soundStop'){
      if(c.resource&0x4000||c.wait||c.parameter||c.frames>60000||c.delay>60000)throw Error('Unsupported sound-control mode');
      if(c.type==='soundControl'&&c.changes.some(x=>x.field!==1||x.mode!==0||x.value<0||x.value>1))throw Error('Unsupported sound property');
      for(const v of this.voices.filter(v=>v.script===script&&v.resource===c.resource&&![3,5].includes(v.status))){
        if(c.type==='soundStop')this.envelope(v,0,Math.max(10,c.frames),c.delay);
        else for(const change of c.changes)this.envelope(v,change.value,c.frames,c.delay);
      }
      return 0;
    }
    if(!['sound','ambient'].includes(c.type)||c.resource&0x4000||c.volumePercent>100)throw Error('Unsupported sound mode');
    this.asset(script,c.resource); // A missing incoming asset must not stop an existing voice.
    if(c.type==='ambient'){
      if(c.wait>1)throw Error('Unsupported ambient wait mode');
      const current=this.voices.find(v=>v.category===4);
      if(current?.resource===c.resource){
        for(const v of this.voices.filter(v=>v.script===script&&v.resource===c.resource&&![3,5].includes(v.status)))
          this.envelope(v,c.volume,c.incomingFrames,c.incomingDelay);
      }else{
        const previous=this.voices.filter(v=>v.category===4&&![3,5].includes(v.status));
        await this.create(script,c,4);
        for(const v of previous)this.envelope(v,0,Math.max(10,c.outgoingFrames),c.outgoingDelay);
      }
      return c.wait?Math.max(c.outgoingFrames+c.outgoingDelay,c.incomingFrames+c.incomingDelay):0;
    }
    // This edition's flag-2 helper (0x088413dc) returns 1 with no side effects.
    // Flag 1 is acknowledged by the presenter's explicit completion boundary.
    if(c.parameterFloat||c.flags&~3||c.pan)throw Error('Unsupported sound selector/pan/control');
    const movieAsset=c.selector?this.movieAsset(script,c):null;
    const existing=c.resource&0x8000?this.voices.find(v=>v.script===script&&v.resource===c.resource&&![3,5].includes(v.status)):null;
    if(existing){
      existing.volume=0;existing.target=c.volume;existing.fade=c.parameterA;existing.elapsed=c.parameterA;
      existing.envelope=null;existing.pan=c.pan;existing.spatialDistance=c.spatialDistance;
      existing.movieGate=c.selector||0;existing.movieAsset=movieAsset;
      // Native reuse retains the existing start-delay and playback position.
      return 0;
    }
    await this.create(script,c,2);return 0;
  }
  tick(){
    this.frame++;
    for(const voice of [...this.voices]){
      if(voice.status===5){this.ended(voice.id);continue;}
      if(voice.movieGate){
        // The native voice loop uses the current movie's decoded frame, with
        // float32 60/29.97 conversion. Reaching the threshold consumes this
        // tick; start-delay and playback resume on the following tick. An
        // absent/finished movie reports -1, not permission to start early.
        const clock=Math.trunc(f(f(60*f(this.movieFrame(voice.movieAsset)))/f(29.97)));
        if(clock>=voice.movieGate||clock===-1)voice.movieGate=0;
        continue;
      }
      if(voice.delay){voice.delay--;continue;}
      if(voice.status===1){
        // Categories 2/4 use the pan angle, not spatialDistance, in the native
        // backend call. Positional category 3 remains outside this contract.
        this.driver.startVoice({id:voice.id,asset:voice.asset,volume:backendGain(voice.volume),pan:voice.pan,category:voice.category});
        voice.status=2;continue;
      }
      if(voice.status===3){this.driver.stopVoice(voice.id);voice.status=5;continue;}
      const e=voice.envelope;
      if(!e&&voice.volume!==voice.target)voice.volume=clamp(voice.fade?f(f(voice.target*f(voice.elapsed))/f(voice.fade)):voice.target);
      this.driver.gainVoice(voice.id,backendGain(voice.volume));
      if(voice.elapsed!==voice.fade)voice.elapsed++;
      if(!e)continue;
      if(e.delay){e.delay--;continue;}
      if(e.remaining){
        voice.volume=clamp(f(e.to+f(f(f(e.remaining)*f(e.from-e.to))/f(e.total))));e.remaining--;
      }else{
        voice.volume=e.to;voice.envelope=null;if(voice.volume===0)voice.status=3;
      }
      this.driver.gainVoice(voice.id,backendGain(voice.volume));
    }
  }
}
