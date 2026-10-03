/* Original music uses percentage envelopes and a quantized decibel backend,
 * separate from the ordinary SNS sound voices. Loop bounds are supplied by
 * the original media decoder, never inferred from a name or command flag. */
import {Shibuya428Channels} from './shibuya428-channels.mjs';
const f=Math.fround,clamp=x=>Math.max(0,Math.min(100,x));
export function music428Gain(percent,master=100){
 if(!Number.isFinite(percent)||!Number.isFinite(master)||percent<0||percent>100||master<0||master>100)throw Error('Music volume bound');
 const fraction=f(f(f(percent*master)/100)/100);
 const decibels=fraction?Math.max(-960,Math.trunc(200*Math.log10(fraction))):-960;
 return Math.floor(256*10**(decibels/200))/256;
}
export class Shibuya428Music{
 constructor(driver,assets,{channels=new Shibuya428Channels()}={}){this.driver=driver;this.assets=assets;this.voices=[];this.nextId=1;this.channels=channels;}
 async apply(script,c){
  if(c.type!=='music'||c.resource>=0x4000||c.flags!==8||c.volumePercent>100||c.frames>60000||c.delay>60000)throw Error('Unsupported music mode');
  const asset=this.assets[`${script}:${c.resource}`];if(!asset||asset.type!=='audio')throw Error('Missing original music resource');
  const existing=this.voices.find(v=>v.script===script&&v.resource===c.resource);
  if(existing){
   existing.status=2;existing.target=c.volumePercent;existing.from=c.frames?existing.volume:c.volumePercent;
   existing.volume=c.frames?existing.volume:1;existing.frames=c.frames;existing.elapsed=0;
   return;
  }
  if(this.voices.length>=2)throw Error('Native music channel capacity exceeded');
  const id=`music:${this.nextId}`,channel=this.channels.acquire(id,'music');
  try{await this.driver.prepareVoice(asset);}catch(error){this.channels.release(id);throw error;}
  this.nextId++;
  this.voices.unshift({id,channel,script,resource:c.resource,asset,status:1,delay:c.delay,
   volume:c.frames?0:c.volumePercent,target:c.volumePercent,from:c.frames?0:c.volumePercent,frames:c.frames,elapsed:0});
 }
 ended(id){this.channels.release(id);this.voices=this.voices.filter(v=>v.id!==id);}
 stop(c){
  if(c.type!=='musicStop'||c.resource>=0x4000||c.wait!==0||c.frames>60000||c.delay>60000)throw Error('Unsupported music stop mode');
  for(const voice of this.voices.filter(v=>v.resource===c.resource)){
   if(voice.volume===0){voice.status=3;voice.delay=c.delay;}
   else{voice.from=voice.volume;voice.control={target:0,remaining:Math.max(10,c.frames),frames:Math.max(10,c.frames),delay:c.delay};}
  }
 }
 control(c){
  if(c.type!=='musicControl'||c.resource>=0x4000||c.mode!==0||c.wait!==0||c.value<0||c.value>100||c.frames>60000||c.delay>60000)throw Error('Unsupported music control mode');
  // Native property lookup uses the numeric BGM name across both channels.
  for(const voice of this.voices.filter(v=>v.resource===c.resource)){
   voice.from=voice.volume;voice.control={target:c.value,remaining:c.frames,frames:c.frames,delay:c.delay};
  }
 }
 tick(){
  for(const voice of this.voices){
   if(voice.status===4){this.ended(voice.id);continue;}
   if(voice.delay){voice.delay--;continue;}
   if(voice.status===3){voice.status=4;this.driver.stopVoice(voice.id);continue;}
   if(voice.status===1){
    this.driver.startVoice({id:voice.id,asset:voice.asset,volume:music428Gain(voice.volume),pan:0,category:'music'});
    voice.status=2;continue;
   }
   if(voice.volume!==voice.target){
    voice.volume=clamp(voice.frames?f(voice.from+f(f(f(voice.elapsed)*f(voice.target-voice.from))/f(voice.frames))):voice.target);
    if(!voice.frames&&!voice.target){voice.from=0;voice.status=4;this.driver.stopVoice(voice.id);}
   }
   this.driver.gainVoice(voice.id,music428Gain(voice.volume));
   if(voice.elapsed!==voice.frames)voice.elapsed++;
   const c=voice.control;
   if(c){
    if(c.delay){c.delay--;continue;}
    const value=c.remaining?f(c.target+f(f(f(c.remaining)*f(voice.from-c.target))/f(c.frames))):c.target;
    voice.target=value;voice.volume=clamp(value);
    if(c.remaining)c.remaining--;
    else{voice.control=null;if(!value){voice.status=4;this.driver.stopVoice(voice.id);}}
    this.driver.gainVoice(voice.id,music428Gain(voice.volume));
   }
  }
 }
}
