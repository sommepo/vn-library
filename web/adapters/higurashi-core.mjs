/* SLPM-66913 SNR. Native CScripter 0x15fa10..0x1633d0, command
 * consumers 0x1b82f8..0x1bfea8. No engine identity inferred from other games. */
export const signed16=n=>(n<<16)>>16;
function freshState(program,entry){
    const state={pc:program.entry,entry,regs:Array(1024).fill(0),stack:[],system:{},nativeRead:{},choiceHistory:{},choiceRead:{},tips:{},characters:{},otsu:{},chart:{},chartPath:[],layers:{},staged:{},music:null,sounds:{},message:null,pending:null,title:'',chapter:0};
    state.regs[0]=signed16(entry);
    return state;
}
export class HigurashiCore {
  constructor(program,entry=0){
    if(program.format!=='vnkit.higurashi-program'||program.version!==1)throw Error('Invalid Higurashi program');
    this.program=program;this.code=new Map(program.instructions.map(r=>[r[0],r]));
    this.indices=new Map(program.instructions.map((r,i)=>[r[0],i]));
    this.readOffsets=new Map();let textIndex=0;for(const row of program.instructions){if(row[5]?.length){this.readOffsets.set(row[0],textIndex);textIndex+=row[5].length;}}
    this.state=freshState(program,entry);
  }
  fork(entry=0){const v=Object.create(HigurashiCore.prototype);for(const k of ['program','code','indices','readOffsets'])v[k]=this[k];v.state=freshState(this.program,entry);return v;}
  fail(message,offset=this.state.pc){throw Error(`main.snr:${offset.toString(16).padStart(8,'0')}: ${message}`);}
  index(word){const i=word-0x8000;if(!Number.isInteger(i)||i<0||i>=1024)this.fail(`Invalid register ${word}`);return i;}
  value(word){return word>=0x8000&&word<0xc000?this.state.regs[this.index(word)]:signed16(word);}
  put(word,value){this.state.regs[this.index(word)]=signed16(value);}
  jump(pc){if(!this.code.has(pc))this.fail(`Invalid target ${pc}`);this.state.pc=pc;}
  pop(){if(!this.state.stack.length)this.fail('Stack underflow');return this.state.stack.pop();}
  push(value){if(this.state.stack.length>=4096)this.fail('Stack overflow');this.state.stack.push(value);}
  choose(value){
    const p=this.state.pending;
    if(p?.kind!=='choice'||!p.options.some(o=>o.value===value))this.fail('Invalid choice');
    this.put(p.destination,value);
    if(p.history>=0)this.state.choiceHistory[p.history]=value+1;
    if(p.read>=0)this.state.choiceRead[p.read+value]=1;
    this.state.pending=null;
  }
  step(){
    const s=this.state;if(s.pending)return s.pending;
    if(s.message){
      const m=s.message,row=this.code.get(m.offset),part=row[5][m.index];
      const event={kind:'text',offset:m.offset,part:m.index,...part};
      if(++m.index>=row[5].length)s.message=null;
      return event;
    }
    const row=this.code.get(s.pc);if(!row)this.fail('Instruction missing');
    const [offset,next,op,a,texts,parts]=row,v=n=>this.value(n);
    s.pc=next;this.last=row;
    switch(op){
      case 0x41:{
        const mode=a[0]&127,left=a[0]&128?v(a[2]):v(a[1]),right=v(a.at(-1));let result;
        if(mode===0)result=right;
        else if(mode===1)result=signed16(a[2]);
        else if(mode===2)result=left+right;
        else if(mode===3)result=left-right;
        else if(mode===4)result=Math.imul(left,right);
        else if(mode===5||mode===6){if(!right)this.fail('Division by zero',offset);result=mode===5?Math.trunc(left/right):left%right;}
        else if(mode===7)result=left&right;
        else if(mode===8)result=left|right;
        else if(mode===9)result=left^right;
        else if(mode===10)result=left<<(right&31);
        else if(mode===11)result=left>>(right&31);
        else this.fail('Unknown arithmetic',offset);
        this.put(a[1],result);break;
      }
      case 0x46:{
        const l=v(a[1]),r=v(a[2]),mode=a[0]&127;
        let yes=[l===r,l!==r,l>=r,l>r,l<=r,l<r,Boolean(l&r)][mode];
        if(yes===undefined)this.fail('Unknown condition',offset);
        if(a[0]&128)yes=!yes;if(yes)this.jump(a[3]);break;
      }
      case 0x47:this.jump(a[0]);break;
      case 0x48:this.push(next);this.jump(a[0]);break;
      case 0x49:this.jump(this.pop());break;
      case 0x4a:{const n=v(a[0]);if(n>=0&&n<a[1])this.jump(a[2+n]);break;}
      case 0x4d:for(const w of a.slice(1))this.push(v(w));break;
      case 0x4e:for(const w of a.slice(1))this.put(w,this.pop());break;
      case 0x80:return s.pending={kind:'end',offset,mode:v(a[0])};
      case 0x81:this.put(a[0],s.system[v(a[1])]||0);break;
      case 0x82:{const n=v(a[0]);if(n<0||n>=64)this.fail('System index outside native bank',offset);s.system[n]=v(a[1]);break;}
      case 0x83:return {kind:'wait',offset,frames:Math.max(0,v(a[0]))};
      case 0x84:return {kind:'keywait',offset,frames:v(a[0])};
      case 0x85:s.messageMode=a.map(v);break;
      case 0x86:if(parts.length){s.message={offset,index:0};return this.step();}break;
      case 0x87:return {kind:'message-wait',offset,mode:v(a[0])};
      case 0x88:return {kind:'message-signal',offset};
      case 0x89:return {kind:'message-close',offset};
      case 0x8a:s.nativeRead[a[0]]=1;break;
      case 0x8b:break; // Native LOGSET consumer 0x1ba158 is a no-op.
      case 0x8c:{
        const mask=v(a[3]),strings=texts[1].split('\0');strings.pop();
        const options=strings.flatMap((text,value)=>(mask&(1<<value))?[{text,value}]:[]);
        if(!options.length)this.fail('No visible source choices',offset);
        return s.pending={kind:'choice',offset,options,caption:texts[0].replace(/\0$/,''),destination:a[2],read:a[0]-1,history:a[1]-1};
      }
      case 0x8d:
        Object.assign(s.layers,s.staged);s.staged={};return {kind:'wipe',offset,args:a};
      case 0x8e:return {kind:'wipe-wait',offset};
      case 0x8f:s.layers={};s.staged={};break;
      case 0x90:case 0x91:{
        const mask=a[0],b=a.slice(1).map(v);let n=3;
        const g={kind:op===0x90?'picture':'portrait',index:b[1],z:b[2],x:0,y:0,colour:[255,255,255,255],sx:1,sy:1,rotation:0,extra:0};
        if(mask&1){g.x=b[n++];g.y=b[n++];}
        if(mask&2)g.colour=b.slice(n,n+=4).map(x=>Math.max(0,Math.min(255,x)));
        if(mask&4){g.sx=b[n++]/1024;g.sy=b[n++]/1024;}
        if(mask&8)g.rotation=b[n++]/1024;
        if(mask&16)g.extra=b[n++];
        s.staged[b[0]]=g;break;
      }
      case 0x93:s.staged[v(a[0])]=null;break;
      case 0x94:case 0x95:case 0x97:case 0x98:{
        const b=a.map(v),g=s.layers[b[0]];
        if(g){
          if(op===0x94)g.colour=b.slice(1,5).map(x=>Math.max(0,Math.min(255,x)));
          if(op===0x95){g.x=b[1];g.y=b[2];}
          if(op===0x97){g.sx=b[1]/1024;g.sy=b[2]/1024;}
          if(op===0x98)g.rotation=b[1]/1024;
        }
        return {kind:'visual-motion',offset,opcode:op,args:b};
      }
      case 0x9b:case 0x9f:case 0xa4:case 0xad:case 0xaf:case 0xba:return {kind:'media-wait',offset,opcode:op,args:a.map(v)};
      case 0x9c:s.music={index:v(a[0]),loop:v(a[1])===0,volume:v(a[2])/256};return {kind:'music',offset,...s.music};
      case 0x9d:s.music=null;return {kind:'music-stop',offset};
      case 0xa0:{const [channel,index,mode,volume,fade]=a.map(v);s.sounds[channel]={index,loop:mode===0,volume:volume/256};return {kind:'sound',offset,channel,...s.sounds[channel]};}
      case 0xa1:{const channel=v(a[0]);delete s.sounds[channel];return {kind:'sound-stop',offset,channel};}
      case 0xa8:case 0xac:case 0xae:case 0xb5:return {kind:'visual-effect',offset,opcode:op,args:a.map(v)};
      case 0xb0:s.chapter=v(a[0]);s.title=texts[0].replace(/\0$/,'');return {kind:'chapter',offset,title:s.title};
      case 0xb1:return {kind:'movie',offset,index:v(a[0])};
      case 0xb3:s.eventMode=v(a[0]);break;
      case 0xb4:s.eventMode=null;break;
      case 0xb6:return {kind:'autosave',offset};
      case 0xb9:return {kind:'voice',offset,path:texts[0].replace(/\0$/,'')};
      case 0xbb:{const ids=a.slice(1).map(v);for(const id of ids)s.tips[id]=1;return {kind:'tips',offset,ids};}
      case 0xbc:s.characters[v(a[0])]=1;return {kind:'character-unlocked',offset,index:v(a[0])};
      case 0xbe:{
        const count=this.program.selectorCounts?.[a[1]],mask=v(a[3]);
        if(!count||count>16)this.fail('Unknown native selector mode',offset);
        const options=Array.from({length:count},(_,value)=>({value})).filter(o=>mask&(1<<o.value));
        if(!options.length)this.fail('Native selector has no available characters',offset);
        return s.pending={kind:'choice',offset,options,destination:a[2],read:-1,history:a[0]-1,selector:a[1]};
      }
      case 0xbf:s.otsu[v(a[0])]=1;return {kind:'otsu-unlocked',offset,index:v(a[0])};
      case 0xc0:return {kind:'fake-choice',offset}; // No VM result or branch; original single moving button.
      case 0xbd:for(const id of a.slice(1).map(v)){s.chart[id]=1;s.chartPath.push(id);}break;
      default:this.fail(`Unimplemented command 0x${op.toString(16)}`,offset);
    }
    return null;
  }
}
