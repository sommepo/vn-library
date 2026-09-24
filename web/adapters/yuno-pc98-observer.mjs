// Original MIT research observer for the exact PC-98 AI5X executable.
// This is not a story interpreter or the reader's presentation event contract.
// Game bytes/signatures are supplied privately, never embedded in this module.
const MAGIC=new TextEncoder().encode('VNKIT-PC98-RUNTIME-PROBE-2');
const SITES=[
  {offset:0x4f7b,stub:0x300,resume:0x370,size:6},
  {offset:0x83ea,stub:0x400,resume:0x470,size:6},
  {offset:0x2ee,stub:0x500,resume:0x570,size:5},
  {offset:0x97c,stub:0x600,resume:0x670,size:5},
  {offset:0x9f8,stub:0x700,resume:0x770,size:5},
  {offset:0xa39,stub:0x800,resume:0x870,size:8},
  {offset:0x52a4,stub:0x900,resume:0x970,size:5},
  {offset:0x900,stub:0xa00,resume:0xa70,size:8},
];
const equal=(memory,at,bytes)=>at>=0&&at+bytes.length<=memory.length&&bytes.every((b,i)=>memory[at+i]===b);
const find=(memory,bytes,mod=1,shift=0)=>{
  const matches=[];for(let p=0x1000;p<0xa0000-bytes.length;p++){
    if((p-shift)%mod||memory[p]!==bytes[0])continue;
    if(equal(memory,p,bytes))matches.push(p);
  }return matches;
};
export class NativeObserver {
  constructor(moduleBytes){
    if(!(moduleBytes instanceof Uint8Array)||moduleBytes.length!==128288)throw Error('Unexpected private AI5X module');
    this.source=moduleBytes;this.consumed=0;this.base=null;this.segment=null;
    this.decoder=new TextDecoder('shift-jis',{fatal:true});
  }
  install(memory){
    if(this.base!==null)return true;
    const resident=find(memory,MAGIC,16,0x120);
    if(!resident.length)return false;
    if(resident.length!==1)throw Error('Ambiguous resident observer');
    const base=resident[0]-0x120,view=new DataView(memory.buffer,memory.byteOffset,memory.byteLength);
    const code=find(memory,this.source.subarray(0x4f7b,0x4f7b+32),16,0x4f7b);
    let segment;
    if(!code.length){
      // A restored private state may already contain the complete observer.
      segment=view.getUint16(base+0x379,true);
      if(!segment)return false;
      for(const s of SITES){
        const at=segment*16+s.offset;
        if(!equal(memory,base+s.resume,this.source.subarray(s.offset,s.offset+s.size))||
           !equal(memory,at,Uint8Array.of(0xea,s.stub&255,s.stub>>8,(base/16)&255,base>>12))||
           view.getUint16(base+s.resume+s.size+1,true)!==s.offset+s.size||
           view.getUint16(base+s.resume+s.size+3,true)!==segment)throw Error('Incomplete or incompatible saved observer');
      }
      this.consumed=view.getUint16(base+0x200,true);
    }else{
      if(code.length!==1)throw Error('Ambiguous AI5X executable in guest memory');
      segment=(code[0]-0x4f7b)/16;
      // Check every site before writing anything. Never partially instrument an
      // unknown revision or relocate a relative branch/call by guesswork.
      for(const s of SITES)if(!equal(memory,segment*16+s.offset,this.source.subarray(s.offset,s.offset+s.size))){
        // EXEPACK expands backwards. A renderer signature may be visible while
        // earlier code is still packed; never write into that intermediate state.
        this.pending=(this.pending||0)+1;
        if(this.pending>200)throw Error(`AI5X site mismatch at ${s.offset.toString(16)}: ${Array.from(memory.slice(segment*16+s.offset,segment*16+s.offset+s.size)).join(',')}`);
        return false;
      }
      for(const s of SITES){
        const at=segment*16+s.offset;
        memory.set(this.source.subarray(s.offset,s.offset+s.size),base+s.resume);
        view.setUint16(base+s.resume+s.size+1,s.offset+s.size,true);
        view.setUint16(base+s.resume+s.size+3,segment,true);
        memory.fill(0x90,at,at+s.size);
        memory.set([0xea,s.stub&255,s.stub>>8,(base/16)&255,base>>12],at);
      }
    }
    this.base=base;this.segment=segment;return true;
  }
  drain(memory){
    if(!this.install(memory))return [];
    const view=new DataView(memory.buffer,memory.byteOffset,memory.byteLength),produced=view.getUint16(this.base+0x200,true);
    if(((produced-this.consumed)&65535)>64)throw Error('Native observer overflow; text and state observations are incomplete');
    const events=[];
    while(this.consumed!==produced){
      const p=this.base+0x1000+(this.consumed&63)*64,word=i=>view.getUint16(p+i*2,true),kind=word(0);
      const event={kind,es:word(1),ds:word(2),di:word(3),si:word(4),bx:word(7),dx:word(8),ax:word(10)};
      if(kind===2){
        const bytes=memory.slice(p+24,p+40),end=bytes.indexOf(0);
        if(end<1||bytes.slice(0,end).some(b=>b<32||b>126))throw Error('Invalid native archive filename');
        event.filename=new TextDecoder('ascii').decode(bytes.slice(0,end)).toUpperCase();
      }else if(kind===1||kind===7||kind===3||kind===8){
        event.system=Array.from({length:20},(_,i)=>word(12+i)); // @6..25
        if(kind===1||kind===7){
          event.text=this.decoder.decode(kind===1?Uint8Array.of(event.ax>>8,event.ax&255):Uint8Array.of(event.ax&255));
          event.surface=event.system[0];event.x=event.system[11]*8;event.y=event.system[12];
          event.width=kind===1?16:8;event.style=event.system[14];
        }else if(kind===3)event.command=event.ax&255;
      }else if(kind>=4&&kind<=6)event.args=Array.from({length:16},(_,i)=>word(12+i));
      else throw Error(`Unknown native observer record ${kind}`);
      events.push(event);this.consumed=(this.consumed+1)&65535;
    }
    return events;
  }
}
