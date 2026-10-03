/* Exact-edition device-feedback timer. The PSP executable's final output
 * function is empty, but its source wait command still observes this timer.
 * Defaults follow the native settings initializer; this is not host haptics. */
export class Shibuya428Feedback {
 constructor({enabled=true}={}){this.enabled=!!enabled;this.reset();}
 reset(){this.from=0;this.to=0;this.value=0;this.duration=0;this.elapsed=0;this.delay=0;}
 start({from,to,frames,delay}){
  if([from,to,frames,delay].some(n=>!Number.isInteger(n)||n<0)||from>255||to>255||frames>60000||delay>60000)throw Error('Unsupported device feedback');
  if(!this.enabled)return;
  this.from=from;this.to=to;this.value=from;this.duration=frames;this.elapsed=0;this.delay=delay;
 }
 ready(){return this.duration===0;}
 tick(){
  if(this.delay>0){this.delay--;return;}
  if(!this.duration)return;
  this.elapsed++;
  if(this.from===this.to)this.value=this.from;
  else if(this.elapsed>=this.duration-1)this.value=this.to;
  else this.value=Math.max(0,Math.min(255,this.from+Math.trunc(this.elapsed*(this.to-this.from)/(this.duration-1))));
  if(this.elapsed>=this.duration)this.reset();
 }
}
