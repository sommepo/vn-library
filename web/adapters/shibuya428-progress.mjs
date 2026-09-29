/* SNS progress records, independent of study history. Original implementation
 * of the ULJS-00219 graph layout and audited primitive operations. This alone
 * does not implement cross-character replay or make the reader playable. */
import {signature} from '../engine.mjs';
const STRIDE=12, NONE=0x3fff, MAX_LABELS=12800;
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export class Shibuya428Progress {
  constructor(scripts) {
    this.labels=[];this.byKey=new Map();this.scripts=scripts;
    // The native loader replaces on-disc placeholder IDs in hash-chain order.
    for(const s of Object.values(scripts).sort((a,b)=>a.index-b.index)){
      if(!integer(s.index,0,254))throw Error('428 progress: invalid script index');
      const labels=Object.entries(s.labels).filter(([name])=>!name.startsWith('_'))
        .sort(([,a],[,b])=>a.bucket-b.bucket||a.table_offset-b.table_offset);
      for(const [label,source]of labels){
        if(!integer(source.bucket,0,255)||!integer(source.table_offset,0,s.size)||
           !integer(source.offset,s.content_offset,s.size-1))throw Error('428 progress: invalid source label');
        const key=`${s.index}:${label}`;
        if(this.byKey.has(key)||this.labels.length>=MAX_LABELS)throw Error('428 progress: duplicate/excess labels');
        this.byKey.set(key,this.labels.length);this.labels.push({script:s.index,label,offset:source.offset});
      }
    }
    this.bytes=new Uint8Array(this.labels.length*STRIDE);this.view=new DataView(this.bytes.buffer);
    this.signature=signature({version:1,labels:this.labels,sources:Object.values(scripts).sort((a,b)=>a.index-b.index).map(s=>[s.index,s.sha256,s.size,s.content_offset])});
    for(let id=0;id<this.labels.length;id++){
      this.view.setUint32(id*STRIDE,0xff3fffff,true);
      this.view.setUint32(id*STRIDE+4,0x3fff,true);
    }
  }
  id(target){
    const id=typeof target==='number'?target:this.byKey.get(typeof target==='string'?target:`${target.script}:${target.label}`);
    if(!integer(id,0,this.labels.length-1))throw Error('428 progress: unknown source label');
    return id;
  }
  record(target){
    const p=this.id(target)*STRIDE,v=this.view,a=v.getUint32(p,true),b=v.getUint32(p+4,true);
    return {previousScript:a&255,previousLabel:(a>>>8)&NONE,previousBits:(a>>>22)&3,
      nextScript:a>>>24,nextLabel:b&NONE,complete:!!(b&0x4000),replayed:!!(b&0x8000),
      choice:(b>>>18)&15,extraBits:(b>>>16)&0xffc3,readPc:v.getUint32(p+8,true)};
  }
  complete(target){const p=this.id(target)*STRIDE;this.bytes[p+5]|=64;this.view.setUint32(p+8,0,true);}
  clearReplay(target){this.bytes[this.id(target)*STRIDE+5]&=127;}
  // Native jump 0x0887c21c completes the previous label even in no-link mode.
  // Internal underscore labels never reach this operation.
  transition(from,target,{link=true,replay=false,previousScript}={}){
    const next=this.id(target),old=from==null?null:this.id(from);
    if(old===null)return next;
    const sid=previousScript??this.labels[old].script;
    if(!integer(sid,0,254))throw Error('428 progress: invalid previous script');
    this.complete(old);
    if(replay)this.clearReplay(old);
    else if(link){
      const a=old*STRIDE,b=next*STRIDE,v=this.view;
      this.bytes[a+3]=this.labels[next].script;
      v.setUint16(a+4,(v.getUint16(a+4,true)&0xc000)|next,true);
      v.setUint32(b,((v.getUint32(b,true)&0xffc00000)|(old<<8)|sid)>>>0,true);
    }
    return next;
  }
  select(target,index){
    if(!integer(index,0,9))throw Error('428 progress: invalid choice');
    const p=this.id(target)*STRIDE+6;this.bytes[p]=(this.bytes[p]&0xc3)|((index+1)<<2);
  }
  // Native 0x08887964 retains the furthest relative source PC until completion.
  presented(target,pc){
    const id=this.id(target),s=this.scripts[this.labels[id].script];
    if(!integer(pc,0,s.size-s.content_offset))throw Error('428 progress: invalid read position');
    const p=id*STRIDE,v=this.view;
    if(!(this.bytes[p+5]&64)&&pc>v.getUint32(p+8,true))v.setUint32(p+8,pc,true);
  }
  snapshot(){
    const records=[];
    for(let n=0;n<this.labels.length;n++){
      const p=n*STRIDE,a=this.view.getUint32(p,true),b=this.view.getUint32(p+4,true),c=this.view.getUint32(p+8,true);
      if(a!==0xff3fffff||b!==0x3fff||c)records.push([n,a,b,c]);
    }
    return {version:1,signature:this.signature,labelCount:this.labels.length,records};
  }
  restore(data){
    if(data?.version!==1||data.signature!==this.signature||data.labelCount!==this.labels.length||!Array.isArray(data.records)||data.records.length>this.labels.length)
      throw Error('428 progress: incompatible snapshot');
    const bytes=new Uint8Array(this.bytes.length),v=new DataView(bytes.buffer);
    for(let n=0;n<this.labels.length;n++){v.setUint32(n*STRIDE,0xff3fffff,true);v.setUint32(n*STRIDE+4,0x3fff,true);}
    let last=-1;
    for(const row of data.records){
      if(!Array.isArray(row)||row.length!==4||!row.every(n=>integer(n,0,0xffffffff))||row[0]<=last||row[0]>=this.labels.length)
        throw Error('428 progress: invalid snapshot record');
      const [id,a,b,c]=row,s=this.scripts[this.labels[id].script];last=id;
      for(const [sid,label]of [[a&255,(a>>>8)&NONE],[a>>>24,b&NONE]]){
        if(sid===255&&label===NONE)continue;
        // Calls can retain a caller label while changing the current script.
        if(!this.scripts[sid]||label>=this.labels.length)throw Error('428 progress: invalid graph edge');
      }
      if(((b>>>18)&15)>10||c>s.size-s.content_offset||((b&0x4000)&&c!==0))throw Error('428 progress: invalid progress state');
      v.setUint32(id*STRIDE,a,true);v.setUint32(id*STRIDE+4,b,true);v.setUint32(id*STRIDE+8,c,true);
    }
    this.bytes.set(bytes);
  }
}
