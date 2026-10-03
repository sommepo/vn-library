/* Independent implementation of the exact edition's checkpoint-context helper.
 * Tables/labels are recovered from the owner's ELF/FLO, never embedded here.
 * A context snapshot is not a complete game save or a timeline unlock list. */
import {signature} from '../engine.mjs';
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
const hourIndex=minutes=>minutes>600?Math.trunc(minutes/60)-10:0;

export class Shibuya428Context {
  constructor(data) {
    if(!Array.isArray(data?.prefixes)||data.prefixes.length!==10||
       data.prefixes.some(p=>typeof p!=='string'||!/^[A-Z]$/.test(p))||new Set(data.prefixes).size!==10||
       !Array.isArray(data.labels)||data.labels.length>12800||
       data.labels.some(p=>typeof p!=='string'||!p.length||p.length>32||!/^[\x20-\x7e]+$/.test(p))||
       new Set(data.labels).size!==data.labels.length||!Array.isArray(data.times))
      throw Error('428 context: invalid source metadata');
    this.prefixes=[...data.prefixes];this.labels=new Set(data.labels);this.times=new Map();
    for(const row of data.times){
      if(!Array.isArray(row)||row.length!==3||!this.labels.has(row[0])||this.times.has(row[0])||
         !integer(row[1],0,23)||!integer(row[2],0,59))throw Error('428 context: invalid source clock');
      this.times.set(row[0],row.slice(1));
    }
    this.clockValues=new Set([0,600,...[...this.times.values()].filter(([h])=>h>0).map(([h,m])=>h*60+m)]);
    this.signature=signature({prefixes:this.prefixes,labels:[...this.labels].sort(),times:[...this.times].sort()});
    this.state={character:null,hour:null,restarts:Array(11).fill(null),clocks:Array(11).fill(0)};
  }
  restartValue(label){
    if(!this.labels.has(label))throw Error('428 context: unknown source label');
    let character=this.prefixes.indexOf(label[0]);
    // The original loop has an invalid eleventh table word. No recovered
    // restart checkpoint needs it; reject unknown prefixes rather than guess.
    if(character<0)throw Error('428 context: unknown restart character');
    const [hour,minute]=this.times.get(label)||[0,0],minutes=hour>0?hour*60+minute:0;
    if(character===3&&hourIndex(minutes)>=7)character=10;
    return {character,minutes,hour};
  }
  checkpoint(label,restart){
    if(typeof restart!=='boolean'||!this.labels.has(label))throw Error('428 context: invalid checkpoint');
    const s=structuredClone(this.state);
    if(restart){
      const next=this.restartValue(label);s.character=next.character;
      s.restarts[s.character]=label;
      if(next.hour>0)s.clocks[s.character]=next.minutes;
      if(s.character===7||s.character===8)s.clocks[s.character]=600;
    }
    if(s.character!==null){
      s.hour=hourIndex(s.clocks[s.character]);
      if(s.character===3&&s.hour>=7){s.character=10;s.hour=9;}
      if(s.character===10&&s.hour>=10)s.hour=9;
      if(s.character<7&&s.hour===9)s.hour=8;
    }
    this.state=s;return this.current();
  }
  current(){return this.state.character===null?null:{character:this.state.character,hour:this.state.hour};}
  snapshot(){return {version:1,signature:this.signature,...structuredClone(this.state)};}
  restore(data){
    if(data?.version!==1||data.signature!==this.signature||
       !(data.character===null&&data.hour===null||integer(data.character,0,10)&&integer(data.hour,0,13))||
       !Array.isArray(data.restarts)||data.restarts.length!==11||
       !Array.isArray(data.clocks)||data.clocks.length!==11)
      throw Error('428 context: incompatible snapshot');
    for(let n=0;n<11;n++){
      const label=data.restarts[n],clock=data.clocks[n];
      if(!integer(clock,0,1439)||!this.clockValues.has(clock)||label!==null&&typeof label!=='string')throw Error('428 context: invalid clock');
      if(label===null){if(clock!==0)throw Error('428 context: clock without restart');continue;}
      // Original replay can merge character slots onto one final branch.
      // A restart is a source target, not proof of that slot's character or
      // last checkpoint clock. Preserve the independently stored fields.
      if(!this.labels.has(label))throw Error('428 context: unknown restart target');
    }
    if(data.character===null){
      if(data.restarts.some(x=>x!==null))throw Error('428 context: unresolved character with restarts');
    }else{
      if(data.restarts[data.character]===null)throw Error('428 context: current character lacks restart');
      let expected=hourIndex(data.clocks[data.character]);
      if(data.character===3&&expected>=7)throw Error('428 context: unremapped late character');
      if(data.character===10&&expected>=10)expected=9;
      if(data.character<7&&expected===9)expected=8;
      if(data.hour!==expected)throw Error('428 context: hour differs from character clock');
    }
    this.state={character:data.character,hour:data.hour,restarts:[...data.restarts],clocks:[...data.clocks]};
  }
}
