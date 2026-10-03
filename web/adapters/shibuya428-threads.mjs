/* Bounded SNS presentation threads. Eight source slots run in native order;
 * foreground text/progress belongs to the VM. This subset admits picture work
 * and timed waits only. Unknown control or text in a thread stops explicitly.
 * Snapshots here are diagnostics, not a complete reader save format. */
import {Operands} from './shibuya428-control.mjs';
import {decode428Presentation, require428OpeningCommand} from './shibuya428-media.mjs';

export function decode428Thread(i) {
  const r=new Operands(i);
  if(![0xa1,0xa2,0xa3].includes(i.code))r.fail('Unsupported thread command');
  const command={type:({161:'threadStart',162:'threadStop',163:'threadWait'})[i.code],target:r.target()};
  if(i.code===0xa1)command.loop=r.uint();
  r.end();return command;
}

export class Shibuya428Threads {
  constructor(scripts) {
    this.scripts=scripts;
    this.tokens=new Map(Object.values(scripts).map(s=>[s.index,new Map(s.tokens.map(t=>[t.offset,t]))]));
    this.slots=Array(8).fill(null);this.busy=false;
  }
  target(target) {
    const pc=this.scripts[target?.script]?.labels[target.label]?.offset;
    if(!this.tokens.get(target?.script)?.has(pc))throw Error('428 thread target outside source');
    return pc;
  }
  source(event) {
    const t=this.scripts[event?.script]?.tokens.find(t=>t.id===event.id);
    if(!t||JSON.stringify(decode428Thread(t))!==JSON.stringify(event.command))throw Error('428 thread source mismatch');
    this.target(event.command.target);return event.command;
  }
  start(event) {
    if(this.busy)throw Error('428 thread frame in progress');
    const c=this.source(event);if(c.type!=='threadStart')throw Error('428 thread start required');
    const slot=this.slots.findIndex(s=>s===null);
    // A full native table ignores the new request; it never replaces a slot.
    if(slot<0)return null;
    const pc=this.target(c.target);
    this.slots[slot]={status:1,loop:c.loop,script:c.target.script,label:c.target.label,start:pc,pc,wait:0,controller:5};
    return slot;
  }
  ready(event) {
    const c=this.source(event);if(c.type!=='threadWait')throw Error('428 thread wait required');
    return this.slots.every(s=>s===null)||this.slots.some(s=>s?.script===c.target.script&&s.label===c.target.label&&s.status===2);
  }
  stop(event) {
    if(this.busy)throw Error('428 thread frame in progress');
    const c=this.source(event);if(c.type!=='threadStop')throw Error('428 thread stop required');
    const slot=this.slots.findIndex(s=>s?.script===c.target.script&&s.label===c.target.label);
    if(slot>=0)this.slots[slot]=null;
  }
  reset(){if(this.busy)throw Error('428 thread frame in progress');this.slots.fill(null);}
  snapshot(){return structuredClone(this.slots);}
  async tick({apply,ready,tickGroup}) {
    if(this.busy)throw Error('428 overlapping thread frames');
    this.busy=true;
    try {
      for(let slot=0;slot<8;slot++) {
        const s=this.slots[slot];if(!s)continue;
        if(s.status===2){await tickGroup(slot+1,false);continue;}
        if(s.wait)s.wait--;
        if(!s.wait)for(let count=0;;count++) {
          if(count>=1024)throw Error('428 thread instruction budget');
          const i=this.tokens.get(s.script)?.get(s.pc);
          if(!i)throw Error('428 thread PC outside source');
          let next=i.next,yieldFrame=false;
          const r=new Operands(i);
          if(i.code===0x22){r.uint();r.end();}
          else if(i.code===0x2d){
            const frames=r.uint(4);r.end();if(frames>60000)r.fail('Unsupported thread wait');
            s.wait=frames;yieldFrame=frames>0;
          }else if(i.code===0xa5){
            r.end();if(s.loop)next=s.start;else s.status=2;yieldFrame=true;
          }else if([0x44,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x6b].includes(i.code)){
            const command=decode428Presentation(i);require428OpeningCommand(command);
            const event={kind:'presentation',id:i.id,script:s.script,command,threadGroup:slot+1};
            if(command.type==='pictureWait'||command.type==='motionWait'){
              if(!ready(event)){next=i.offset;yieldFrame=true;}
            }else{await apply(event);yieldFrame=command.type==='pictureFinish';}
          }else r.fail('Unsupported presentation thread instruction');
          s.pc=next;if(yieldFrame)break;
        }
        await tickGroup(slot+1,true);
      }
    }finally{this.busy=false;}
  }
}
