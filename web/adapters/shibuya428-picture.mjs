/* The source effect manager has two slots: black reveal/fade, picture blend,
 * and instant transition. Other effect families remain unimplemented. */
export class Shibuya428Pictures {
  constructor(driver){this.driver=driver;this.effects=new Map();}
  setup(c){
    if(![1,2,3,4,11].includes(c.effect))throw Error('Unsupported picture effect renderer');
    if(this.effects.size>=2||this.effects.has(c.layer))throw Error('Picture effect slot capacity/conflict');
    const duration=c.effect!==11?Math.max(1,c.parameters[0]):1;
    if(!Number.isInteger(duration)||duration<1||duration>60000||c.parameters.some(n=>n<0))throw Error('Unsupported picture effect duration');
    if([1,2].includes(c.effect)&&typeof this.driver.overlay!=='function')throw Error('Missing picture overlay driver');
    if(c.effect===2&&typeof this.driver.showIncoming!=='function')throw Error('Missing picture swap driver');
    if(c.effect===3&&['blend','finishBlend'].some(k=>typeof this.driver[k]!=='function'))throw Error('Missing picture blend driver');
    if(c.effect===4){
      if(c.parameters.length!==7||c.parameters.some(n=>!Number.isInteger(n))||c.parameters.slice(0,3).some(n=>n>60000)||c.parameters.slice(3,6).some(n=>n>255)||c.parameters[6]!==0)throw Error('Unsupported colour transition parameters');
      if(['colorOverlay','showIncoming'].some(k=>typeof this.driver[k]!=='function'))throw Error('Missing colour transition driver');
      const [rise,hold,fall,...color]=c.parameters;
      const effect={type:4,duration:Math.max(1,rise),hold,fall:Math.max(1,fall),color:color.slice(0,3).map(n=>Math.fround(n/255)),frame:rise<2?1:0,phase:0,swapped:false,ready:false,threadGroup:c.threadGroup??0};
      this.effects.set(c.layer,effect);
      if(effect.duration===1)this.colorTick(c.layer,effect);
      return;
    }
    this.effects.set(c.layer,{type:c.effect,duration,frame:c.effect===3?(c.parameters[0]===0?1:0):duration<2?1:0,ready:false,threadGroup:c.threadGroup??0});
  }
  tick(group=null){
    for(const [layer,e]of this.effects){
      if(group!==null&&(e.threadGroup??0)!==group)continue;
      if(e.ready||e.loading)continue;
      if(e.type===4){this.colorTick(layer,e);continue;}
      if(e.type!==11){
        const t=Math.fround(e.frame/e.duration);
        if(e.type===3)this.driver.blend(layer,t);
        else this.driver.overlay(layer,e.type===1?Math.fround(1-t):t);
        e.frame++;e.ready=e.frame>e.duration;
        if(e.ready&&e.type===2)this.driver.showIncoming(layer);
        if(e.ready&&e.type===3)this.driver.finishBlend(layer);
      }else e.ready=true;
    }
  }
  colorTick(layer,e){
    if(e.phase===1){
      if(--e.hold>=0)return;
      e.phase=2;e.duration=e.fall;e.frame=e.fall<2?1:0;e.swapped=true;this.driver.showIncoming(layer);return;
    }
    const t=Math.fround(e.frame/e.duration),fall=e.phase===2;
    const interpolate=target=>Math.fround(fall?target-target*t:target*t);
    this.driver.colorOverlay(layer,[...e.color.map(interpolate),interpolate(e.alpha??1)],0);
    if(++e.frame<=e.duration)return;
    if(fall)e.ready=true;
    else if(e.hold)e.phase=1;
    else {e.phase=2;e.duration=e.fall;e.frame=e.fall<2?1:0;e.swapped=true;this.driver.showIncoming(layer);}
  }
  ready(layer){return !this.effects.has(layer)||this.effects.get(layer).ready;}
  finish(layer){
    const e=this.effects.get(layer);
    if(e?.type===4)this.driver.colorOverlay(layer,[0,0,0,0],0);
    else if(e?.type===3){this.driver.blend(layer,1);this.driver.finishBlend(layer);}
    else if(e&&e.type!==11)this.driver.overlay(layer,0);
    this.effects.delete(layer);
  }
}
// The PSP raster backend expands its source images into logical coordinates.
// These factors come from the native size getters, not the text/font scale.
export function picture428LogicalSize(width,height){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>4096||height>4096)throw Error('Picture dimensions outside source bounds');
  return {width:Math.fround(Math.fround(1280/464)*width),height:Math.fround(2.8125*height)};
}
// Native rectangle colour correction at default display gain, float32 order.
export function picture428OverlayColor(rgba){
  if(!Array.isArray(rgba)||rgba.length!==4||rgba.some(v=>!Number.isFinite(v)||v<0||v>1))throw Error('Colour overlay bounds');
  const f=Math.fround,scale=[f(f(.97)*f(248/255)),f(f(.91)*f(252/255)),f(f(.865)*f(248/255))];
  return rgba.map((v,i)=>i===3?v:f(v*scale[i]));
}
