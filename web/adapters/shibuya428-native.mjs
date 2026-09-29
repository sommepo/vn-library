/* Bounded integer Allegrex probe for privately recovered native routines.
 * Research only: no PSP system calls, firmware, files, media or host execution.
 * Code ranges, mapped memory and intercepted helpers are explicit. Unknown
 * instructions/accesses fail, and a failed call rolls back writable memory. */
export class NativeProbe {
  constructor({segments, ranges, hooks = new Map(), observers = new Map(), stackTop, globalPointer = 0}) {
    if (!Array.isArray(segments) || segments.length > 32 ||
        segments.reduce((n,s)=>n+s.bytes.length,0)>32*1024*1024) throw Error('Native probe memory budget');
    this.segments = segments.map(s=>({...s, bytes:new Uint8Array(s.bytes), view:null}));
    for(const s of this.segments)s.view=new DataView(s.bytes.buffer);
    this.segments.sort((a,b)=>a.address-b.address);
    for(let n=0;n<this.segments.length;n++){
      const s=this.segments[n];
      if(!Number.isInteger(s.address)||s.address<0||s.address+s.bytes.length>0xffffffff||
        (n&&this.segments[n-1].address+this.segments[n-1].bytes.length>s.address))throw Error('Native probe overlapping/invalid memory');
    }
    if(!Number.isInteger(globalPointer)||globalPointer<0||globalPointer>0xffffffff)throw Error('Native probe global pointer');
    this.globalPointer=globalPointer;
    this.ranges=ranges;this.hooks=hooks;this.observers=observers;this.stackTop=stackTop;this.trace=new Set();this.pc=0;
  }
  fail(message){throw Error(`428 native ${this.pc.toString(16)}: ${message}`);}
  memory(address,size,write=false){
    if(!Number.isInteger(address)||![1,2,4].includes(size)||address%size)this.fail('Unaligned/invalid memory access');
    const s=this.segments.find(s=>address>=s.address&&address+size<=s.address+s.bytes.length);
    if(!s||(write&&!s.writable))this.fail(`${write?'Write':'Read'} outside mapped ${write?'mutable ':''}memory: ${address.toString(16)}`);
    return [s,address-s.address];
  }
  read(address,size=4){const[s,p]=this.memory(address,size);return size===1?s.view.getUint8(p):size===2?s.view.getUint16(p,true):s.view.getUint32(p,true);}
  write(address,value,size=4){const[s,p]=this.memory(address,size,true);if(size===1)s.view.setUint8(p,value);else if(size===2)s.view.setUint16(p,value,true);else s.view.setUint32(p,value,true);}
  string(address,limit=1024){let out='';for(let i=0;i<limit;i++){const c=this.read(address+i,1);if(!c)return out;out+=String.fromCharCode(c);}this.fail('String bound exceeded');}
  call(entry,args=[],limit=2000000){
    if(!Number.isInteger(limit)||limit<1||limit>10000000||args.length>4)throw Error('Native probe call budget');
    const backups=this.segments.filter(s=>s.writable).map(s=>[s,s.bytes.slice()]);
    const r=new Uint32Array(32);for(let i=0;i<args.length;i++)r[4+i]=args[i];r[29]=this.stackTop;r[28]=this.globalPointer;
    let pc=entry,delay=null,hi=0,lo=0;
    try{
      for(let steps=0;steps<limit;steps++){
        this.pc=pc;
        if(pc===0)return {value:r[2],steps};
        this.trace.add(pc);
        if(this.hooks.has(pc)){
          if(delay!==null)this.fail('Helper in delay slot');
          const result=this.hooks.get(pc)(this,[r[4],r[5],r[6],r[7]],{stackPointer:r[29]});
          r[2]=result??0;pc=r[31];continue;
        }
        if(pc%4||!this.ranges.some(([start,end])=>pc>=start&&pc<end))this.fail('Execution outside audited ranges');
        this.observers.get(pc)?.(this);
        const w=this.read(pc),op=w>>>26,rs=w>>>21&31,rt=w>>>16&31,rd=w>>>11&31,fn=w&63,sh=w>>>6&31,imm=w<<16>>16;
        const a=r[rs],b=r[rt],target=delay;delay=null;let next=pc+4;
        const branch=(taken,likely=false,to=pc+4+imm*4)=>{
          if(target!==null)this.fail('Control transfer in delay slot');
          if(taken)delay=to>>>0;else if(likely)next=pc+8;
        };
        if(op===0){
          if([0,2,3].includes(fn)&&rs!==0)this.fail('Unsupported immediate shift variant');
          if([4,6,7].includes(fn)&&sh!==0)this.fail('Unsupported variable shift variant');
          if(fn===0)r[rd]=b<<sh;
          else if(fn===2)r[rd]=b>>>sh;
          else if(fn===3)r[rd]=(b|0)>>sh;
          else if(fn===4)r[rd]=b<<(a&31);
          else if(fn===6)r[rd]=b>>>(a&31);
          else if(fn===7)r[rd]=(b|0)>>(a&31);
          else if(fn===8)branch(true,false,a);
          else if(fn===9){r[rd]=pc+8;branch(true,false,a);}
          else if(fn===10){if(!b)r[rd]=a;}
          else if(fn===11){if(b)r[rd]=a;}
          else if(fn===0x10)r[rd]=hi;
          else if(fn===0x12)r[rd]=lo;
          else if(fn===0x18||fn===0x19){
            const product=BigInt(fn===0x18?a|0:a)*BigInt(fn===0x18?b|0:b);
            lo=Number(BigInt.asUintN(32,product));hi=Number(BigInt.asUintN(32,product>>32n));
          }else if(fn===0x1a||fn===0x1b){
            const x=fn===0x1a?a|0:a,y=fn===0x1a?b|0:b;
            if(!y)this.fail('Division by zero');lo=Math.trunc(x/y)>>>0;hi=(x%y)>>>0;
          }else if(fn===0x21)r[rd]=a+b;
          else if(fn===0x23)r[rd]=a-b;
          else if(fn===0x24)r[rd]=a&b;
          else if(fn===0x25)r[rd]=a|b;
          else if(fn===0x26)r[rd]=a^b;
          else if(fn===0x27)r[rd]=~(a|b);
          else if(fn===0x2a)r[rd]=Number((a|0)<(b|0));
          else if(fn===0x2b)r[rd]=Number(a<b);
          else this.fail(`Unsupported ALU ${fn.toString(16)}`);
        }else if(op===1){
          if(![0,1,2,3].includes(rt))this.fail('Unsupported REGIMM');
          branch(rt&1?(a|0)>=0:(a|0)<0,Boolean(rt&2));
        }else if(op===2||op===3){if(op===3)r[31]=pc+8;branch(true,false,((pc+4)&0xf0000000)|((w&0x3ffffff)<<2));}
        else if([4,5,6,7,20,21,22,23].includes(op)){
          const kind=op&15;branch(kind===4?a===b:kind===5?a!==b:kind===6?(a|0)<=0:(a|0)>0,op>=20);
        }else if(op===9)r[rt]=a+imm;
        else if(op===10)r[rt]=Number((a|0)<imm);
        else if(op===11)r[rt]=Number(a<(imm>>>0));
        else if(op===12)r[rt]=a&(w&65535);
        else if(op===13)r[rt]=a|(w&65535);
        else if(op===14)r[rt]=a^(w&65535);
        else if(op===15)r[rt]=(w&65535)<<16;
        else if(op===31&&fn===32&&sh===16)r[rd]=b<<24>>24;
        else if(op===31&&fn===32&&sh===24)r[rd]=b<<16>>16;
        else if(op===31&&fn===0){
          const size=rd+1;if(sh+size>32)this.fail('Invalid EXT');
          r[rt]=(a>>>sh)&(size===32?0xffffffff:2**size-1);
        }else if([32,33,35,36,37].includes(op)){
          const size=op===35?4:op===33||op===37?2:1;let value=this.read((a+imm)>>>0,size);
          if(op===32)value=value<<24>>24;if(op===33)value=value<<16>>16;r[rt]=value;
        }else if([34,38,42,46].includes(op)){
          const address=(a+imm)>>>0,aligned=(address&~3)>>>0,offset=address&3;
          const memory=this.read(aligned),shift=(op===34||op===42?3-offset:offset)*8;
          if(op===34)r[rt]=(b&(shift?0xffffffff>>>(32-shift):0))|(memory<<shift);
          else if(op===38)r[rt]=(b&(shift?0xffffffff<<(32-shift):0))|(memory>>>shift);
          else if(op===42)this.write(aligned,(memory&(shift?0xffffffff<<(32-shift):0))|(b>>>shift));
          else this.write(aligned,(memory&(shift?0xffffffff>>>(32-shift):0))|(b<<shift));
        }else if([40,41,43].includes(op))this.write((a+imm)>>>0,b,op===40?1:op===41?2:4);
        else this.fail(`Unsupported instruction ${w.toString(16)}`);
        r[0]=0;pc=target??next;
      }
      this.fail('Instruction budget exceeded');
    }catch(error){for(const[s,bytes]of backups)s.bytes.set(bytes);throw error;}
  }
}
