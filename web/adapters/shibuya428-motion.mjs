/* SNS effect 8: source rectangular framing with linear or quadratic motion.
 * Effect 11 additionally enables the original five-copy radial composition;
 * only its measured constant-spread mode is admitted here. Effect 12 supplies
 * independent radial strengths and constant, increasing or decreasing spread.
 * Other effect families and easing modes require their own measured consumers.
 * Coordinates are original logical units; the host owns raster composition. */
import {require428OpeningCommand} from './shibuya428-media.mjs';
import {picture428LogicalSize,Shibuya428Pictures} from './shibuya428-picture.mjs';
import {is428ShakeKernel} from './shibuya428-shake-kernel.mjs';
import {is428NoiseKernel} from './shibuya428-noise-kernel.mjs';
const f=Math.fround;
// Five source sprite copies, above the ordinary image, for radial mode 3.
// Sampling/filtering belongs to the renderer; these are the native transforms
// and alpha values, not a claim of bit-identical PSP raster output.
export function radial428Copies(asset,pose,settings){
 const values=[asset.width,asset.height,pose.x,pose.y,pose.scale,settings.centerX,settings.centerY,settings.spreadX,settings.spreadY];
 if(values.some(v=>!Number.isFinite(v))||asset.width<=0||asset.height<=0)throw Error('Invalid radial image geometry');
 const pivotX=f(-f(f(1280*f(settings.centerX*asset.width))/480)),pivotY=f(-f(f(720*f(settings.centerY*asset.height))/272));
 return Array.from({length:5},(_,n)=>{
  const i=n+1,scale=pose.scale;
  const sx=f(scale+f(f(f(2*settings.spreadX)*f(f(32*f(i*scale))/5))/480));
  const sy=f(scale+f(f(f(2*settings.spreadY)*f(f(32*f(i*scale))/5))/272));
  return {x:f(f(f(pivotX*sx)-f(pivotX*scale))+pose.x),y:f(f(f(pivotY*sy)-f(pivotY*scale))+pose.y),scaleX:sx,scaleY:sy,opacity:f((5-i)/5)};
 });
}
export function directional428Copies(pose,settings){
 if([pose.x,pose.y,pose.scale,settings.spreadX,settings.spreadY].some(v=>!Number.isFinite(v)))throw Error('Invalid directional image geometry');
 return Array.from({length:5},(_,n)=>{
  const i=n+1,distance=f(f(32*f(8*i))/5);
  return {x:f(pose.x-f(settings.spreadX*distance)),y:f(pose.y-f(settings.spreadY*distance)),
   scaleX:pose.scale,scaleY:pose.scale,opacity:f((5-i)/5)};
 });
}
export class Shibuya428Motion{
 constructor(driver,assets={}, {shakeKernel=null,randomState=null,noiseKernel=null,noiseSeed=null}={}){
  this.driver=driver;this.assets=assets;this.effects=new Map();this.nextSlot=0;this.shakeKernel=shakeKernel;
  this.flashes=new Shibuya428Pictures({...driver,showIncoming:()=>{}});
  this.randomState=randomState??Array.from(crypto.getRandomValues(new Uint32Array(2)));
  if(!Array.isArray(this.randomState)||this.randomState.length!==2||this.randomState.some(n=>!Number.isInteger(n)||n<0||n>0xffffffff))throw Error('Invalid presentation random state');
  this.randomState=[...this.randomState];
  this.noiseKernel=noiseKernel;this.noiseSeed=noiseSeed??crypto.getRandomValues(new Uint32Array(1))[0];
  if(!Number.isInteger(this.noiseSeed)||this.noiseSeed<0||this.noiseSeed>0xffffffff)throw Error('Invalid camera noise seed');
 }
 key(script,c){return `${script}:${c.layer}:${c.bank}:${c.resource}:${c.effect}`;}
 initialize(v,parameters){
  const [frames,x0,y0,x1,y1]=parameters,scaleX=f(1279/f(x1-x0)),scaleY=f(719/f(y1-y0));
  const target=(old,origin,scale)=>{const product=f(origin*scale);let delta=old<0?f(old+product):f(old-product);if(old<0)delta=f(-delta);return f(delta+old);};
  v.from={...v.value};v.to={x:target(v.value.x,x0,scaleX),y:target(v.value.y,y0,scaleY),scale:scaleX};
  v.frames=Math.max(1,frames);v.easing=frames<2?0:parameters[5];v.elapsed=frames===0?1:0;v.active=true;
  v.stage=0;
  if([11,12].includes(v.command.effect)){
   const asset=this.assets[`${v.script}:${v.command.resource}`],size=picture428LogicalSize(asset.width,asset.height);
   v.radial={centerX:f(f(x0+f(f(x1-x0)/2))/Math.trunc(size.width)),centerY:f(f(y0+f(f(y1-y0)/2))/Math.trunc(size.height))};
   v.spread=v.command.effect===12?{x:parameters[6],y:parameters[7],mode:parameters[8],elapsed:0}:{x:32,y:32,mode:0,elapsed:0};
   this.driver.radial(v.script,v.command,{...v.radial,spreadX:0,spreadY:0});
  }
  if(parameters[5]===3){
   v.final={x:f(-f(x0*scaleX)),y:f(-f(y0*scaleY)),scale:scaleX};
   v.to={x:f(-f(.5*f(Math.abs(v.from.x)+Math.abs(f(x0*scaleX))))),
    y:f(-f(.5*f(Math.abs(v.from.y)+Math.abs(f(y0*scaleY))))),scale:f(scaleX+f(.5*f(v.from.scale-scaleX)))};
  }
  if(v.frames===1)this.update(v);
 }
 apply(script,c){
  require428OpeningCommand(c);
  if(typeof this.driver.motion!=='function')throw Error('Missing picture motion driver');
  if([5,6].includes(c.effect)&&typeof this.driver.colorOverlay!=='function')throw Error('Missing picture flash renderer');
  if([21,22].includes(c.effect)&&(!is428ShakeKernel(this.shakeKernel)||typeof this.driver.shake!=='function'))throw Error('Picture shake requires verified native math and a renderer');
  if(c.effect===26&&(!is428NoiseKernel(this.noiseKernel)||typeof this.driver.shake!=='function'))throw Error('Camera noise requires verified native math and a renderer');
  if(c.effect===24&&typeof this.driver.pictureOpacity!=='function')throw Error('Missing picture opacity renderer');
  if([14,15,16].includes(c.effect)&&typeof this.driver.translation!=='function')throw Error('Missing picture translation renderer');
  if([15,16].includes(c.effect)&&typeof this.driver.directional!=='function')throw Error('Missing directional blur renderer');
  if([11,12].includes(c.effect)&&(typeof this.driver.radial!=='function'||this.assets[`${script}:${c.resource}`]?.type!=='image'))throw Error('Missing original radial picture renderer');
  const match=[...this.effects].find(([,v])=>this.key(v.script,v.command)===this.key(script,c)&&(c.type!=='motionUpdate'||c.effect<7||c.imageSlot==null||v.command.imageSlot===c.imageSlot));
  const [key,existing]=match??[];
  if(c.type==='motionFinish'){this.finishEntry(key);return;}
  if(c.type==='motionSetup'){
   if(this.effects.size>=16||existing&&(c.effect!==8||c.imageSlot==null||[...this.effects.values()].some(v=>this.key(v.script,v.command)===this.key(script,c)&&v.command.imageSlot===c.imageSlot)))throw Error('Picture motion capacity or unsupported duplicate effect');
   const base=this.key(script,c),slot=this.effects.has(base)?`${base}#${++this.nextSlot}`:base;
   const v={script,command:c,value:{x:0,y:0,scale:1},pending:null};this.start(v,c.parameters);this.effects.set(slot,v);return;
  }
  if(c.type!=='motionUpdate'||!existing)throw Error('Missing source picture motion');
  if(existing.pending)throw Error('Overlapping picture motion update');existing.pending=c.parameters;
 }
 finishEntry(key){
   const existing=this.effects.get(key);if(!existing)return;const {script,command:c}=existing;
   if(existing&&typeof this.driver.pictureOpacity==='function')this.driver.pictureOpacity(script,c,1);
   if(existing&&[5,6].includes(c.effect)){this.driver.colorOverlay(c.layer,[0,0,0,0],0);this.effects.delete(key);return;}
   if(existing&&c.effect===24){this.effects.delete(key);return;}
   if(existing&&[21,22,26].includes(c.effect)){this.driver.shake(script,c,{x:0,y:0});this.effects.delete(key);return;}
   if(existing&&[14,15,16].includes(c.effect)){
    if(c.effect!==14)this.driver.directional(script,c,null);
    this.driver.translation(script,c,{x:0,y:0});this.effects.delete(key);return;
   }
   if(existing&&[11,12].includes(c.effect))this.driver.radial(script,c,null);
   if(existing){this.driver.motion(script,c,{x:0,y:0,scale:1});this.effects.delete(key);}return;
  }

 start(v,parameters,updating=false){
  if([5,6].includes(v.command.effect)){
   const [rise,hold,fall,r,g,b,alpha=255]=parameters;
   v.flash={duration:Math.max(1,rise),hold,fall:Math.max(1,fall),color:[r,g,b].map(n=>f(n/255)),alpha:f(alpha/255),frame:rise<2?1:0,phase:0,swapped:false,ready:false};v.active=true;
   if(v.flash.duration===1)this.update(v);return;
  }
  if(v.command.effect===26){const result=this.noiseKernel.start(parameters,this.noiseSeed);v.noise=result.state;this.noiseSeed=result.seed;v.active=true;return;}
  if(v.command.effect===24){
   const [frames,target,easing]=parameters;v.opacity=true;v.fromAlpha=v.alpha??1;v.toAlpha=f(target/255);
   v.frames=Math.max(1,frames);v.easing=frames<2?0:easing;v.elapsed=frames<2?1:0;v.active=true;
   if(v.frames===1)this.update(v);return;
  }
  if([14,15,16].includes(v.command.effect)){
   const [frames,x0,y0,x1,y1,easing]=parameters;v.translation=true;v.from=updating?{...v.value}:{x:x0,y:y0,scale:1};v.to={x:x1,y:y1,scale:1};
   if(v.command.effect!==14){
    v.directional=true;
    if(!updating)v.blur=v.command.effect===16?{spreadX:f(parameters[6]/16),spreadY:f(parameters[7]/16)}:{spreadX:0,spreadY:0};
    this.driver.directional(v.script,v.command,{...v.blur});
   }
   v.frames=Math.max(1,frames);v.easing=frames<2?0:easing;v.elapsed=frames===0?1:0;v.active=true;v.stage=0;
   if(easing===3){v.final={...v.to};for(const axis of ['x','y'])v.to[axis]=v.from[axis]===v.to[axis]?v.to[axis]:f(f(.5*f(Math.abs(v.from[axis])+Math.abs(v.to[axis])))*(v.from[axis]<0||v.to[axis]<0?-1:1));}
   if(v.frames===1)this.update(v);return;
  }
  if(![21,22].includes(v.command.effect)){this.initialize(v,parameters);return;}
  const [interval,remaining,amplitude]=parameters;
  v.shake={...(v.command.effect===22?{amplitudeY:parameters[3]}:{}),interval,countdown:interval,remaining,amplitude,x:0,y:0,active:true};v.active=true;
 }
 update(v){
  if(v.flash){this.flashes.colorTick(v.command.layer,v.flash);v.active=!v.flash.ready;return;}
  if(v.opacity){
   const t=f(v.elapsed/v.frames),a=v.fromAlpha,b=v.toAlpha;
   const value=v.easing===2?f(b-f(b-a)*Math.pow(f(1-t),2)):f(a+f(b-a)*Math.pow(t,v.easing===1?2:1));
   this.driver.pictureOpacity(v.script,v.command,value);v.alpha=value;
   if(++v.elapsed>v.frames)v.active=false;return;
  }
  // Native 0x089052d4 rounds the fraction and endpoint difference to float32,
  // evaluates the power/multiply/add in double, then rounds the result.
  const half=Math.floor(v.frames/2),duration=v.easing===3?(v.stage?half:f(v.frames*f(half/v.frames))):v.frames;
  const t=f(v.elapsed/duration),out=v.easing===2||v.easing===3&&v.stage,interpolate=(a,b)=>out?
   f(b-f(b-a)*Math.pow(f(1-t),2)):f(a+f(b-a)*Math.pow(t,v.easing===1||v.easing===3?2:1));
  const previous=v.value;
  v.value={x:interpolate(v.from.x,v.to.x)||0,y:interpolate(v.from.y,v.to.y)||0,scale:interpolate(v.from.scale,v.to.scale)};
  if(v.translation)this.driver.translation(v.script,v.command,{x:v.value.x,y:v.value.y});
  else this.driver.motion(v.script,v.command,v.value);v.elapsed++;
  if(v.directional&&v.command.effect===15){
   v.blur={spreadX:f(f(previous.x-v.value.x)/16),spreadY:f(f(previous.y-v.value.y)/16)};
   this.driver.directional(v.script,v.command,{...v.blur});
  }
  if(v.radial){
   const spread=v.spread,t=f(spread.elapsed/v.frames);
   const strength=value=>f((spread.mode===0?value:spread.mode===1?f(value*Math.pow(t,2)):f(value*Math.pow(f(1-t),2)))/16);
   this.driver.radial(v.script,v.command,{...v.radial,spreadX:strength(spread.x),spreadY:strength(spread.y)});spread.elapsed++;
  }
  if(v.easing===3&&!v.stage&&v.elapsed>=half){v.stage=1;v.elapsed=0;v.from=v.to;v.to=v.final;}
  else if(v.elapsed>(v.easing===3?half:v.frames))v.active=false;
 }
 ready(script,c){const v=[...this.effects.values()].find(v=>this.key(v.script,v.command)===this.key(script,c));return !v||!v.active&&!v.pending;}
 tick(group=null){for(const v of this.effects.values()){
  if(group!==null&&(v.command.threadGroup??0)!==group)continue;
  if(v.pending){const params=v.pending;v.pending=null;this.start(v,params,true);}
  else if(v.active){
   if(v.noise){const result=this.noiseKernel.step(v.noise,this.noiseSeed);this.driver.shake(v.script,v.command,result.offset);v.noise=result.state;this.noiseSeed=result.seed;}
   else if(v.shake){const result=this.shakeKernel.step(v.shake,this.randomState);this.driver.shake(v.script,v.command,{x:result.state.x||0,y:result.state.y||0});v.shake=result.state;v.active=result.state.active;this.randomState=result.rng;}
   else this.update(v);
  }else if(v.command.effect===8)this.driver.motion(v.script,v.command,v.value);
  else if(v.opacity)this.driver.pictureOpacity(v.script,v.command,v.alpha);
  else if(v.directional&&v.command.effect===15)this.driver.directional(v.script,v.command,null);
 }}
}
