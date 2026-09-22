/* Read-only, bounded evaluation of the owner's oscrIfCheck predicate.
 * This is not a general MIPS emulator. Calls, stores and all other code fail.
 * Native route comparisons remain private data recovered from the exact ELF. */
export function evaluateNever7Predicate(native, {overlay,address,selector,vars}, trace=null) {
  if(native?.format!=='vnkit.never7-predicate'||native.version!==1||native.words?.length>8192||native.tables?.length>4096)
    throw Error('Invalid Never7 condition data');
  const r=new Uint32Array(32);r[4]=selector;r[28]=0x39f570;
  let pc=native.base,delay=null;
  const fail=message=>{throw Error(`Never7 condition ${pc.toString(16)}: ${message}`);};
  const read=(at,size)=>{
    if(at%size)fail('unaligned read');
    if(size===4&&at===0x3985d8)return overlay;
    if(size===4&&at===0x398614)return address;
    if(size===2&&at>=0x5cbd58&&at<0x5cc358){const index=(at-0x5cbd58)/2;trace?.variables?.add(index);return vars[index]||0;}
    if(size===4&&at>=native.tableBase&&at<native.tableBase+native.tables.length*4)return native.tables[(at-native.tableBase)/4];
    fail(`read outside audited state/tables: ${at.toString(16)}`);
  };
  for(let steps=0;steps<10000;steps++) {
    if(pc===0){if(r[2]>1)fail('non-boolean return');return Boolean(r[2]);}
    if(pc<native.base||pc>=native.base+native.words.length*4||pc%4)fail('jump outside audited predicate');
    trace?.instructions?.add(pc);
    const w=native.words[(pc-native.base)/4]>>>0,op=w>>>26,rs=w>>>21&31,rt=w>>>16&31,rd=w>>>11&31,fn=w&63,sh=w>>>6&31,imm=w<<16>>16;
    const a=r[rs],b=r[rt],target=delay;delay=null;
    if(op===0){
      if(fn===0)r[rd]=b<<sh;
      else if(fn===8)delay=a;
      else if(fn===0x21||fn===0x2d)r[rd]=a+b;
      else if(fn===0x2a)r[rd]=Number((a|0)<(b|0));
      else fail(`unsupported ALU ${fn.toString(16)}`);
    }else if(op===9)r[rt]=a+imm;
    else if(op===15)r[rt]=imm<<16;
    else if(op===10)r[rt]=Number((a|0)<imm);
    else if(op===11)r[rt]=Number(a<(imm>>>0));
    else if(op===4||op===5){if(op===4?a===b:a!==b)delay=pc+4+imm*4;}
    else if(op===7){if((a|0)>0)delay=pc+4+imm*4;}
    else if(op===0x21)r[rt]=read((a+imm)>>>0,2)<<16>>16;
    else if(op===0x23)r[rt]=read((a+imm)>>>0,4);
    else fail(`unsupported instruction ${w.toString(16)}`);
    r[0]=0;pc=target??pc+4;
  }
  fail('instruction bound exceeded');
}
