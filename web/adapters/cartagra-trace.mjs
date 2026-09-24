/* Bounded source-control research harness, NOT a playable reader adapter.
 * It exposes glyph IDs and explicitly reports omitted presentation. Unknown
 * state/control commands stop. No Unicode candidates are used here.
 */
import {cartagraExpression} from './cartagra-expression.mjs';
export class CartagraTrace {
  constructor(scripts,native={}){
    this.scripts=scripts;this.names=Object.values(scripts).sort((a,b)=>a.resource_index-b.resource_index).map(s=>s.source);
    this.native=native;this.bytes=Object.fromEntries(Object.entries(scripts).filter(([,s])=>s.raw_base64).map(([name,s])=>[name,Uint8Array.from(atob(s.raw_base64),c=>c.charCodeAt(0))]));
    // Startup.scr's NEW GAME branch loads and calls both source macro modules
    // before creating the story thread. PS2 memory-card menus are not simulated.
    this.state={script:'Startup.scr',pc:0x12c4,buffer:0,buffers:{0:'Startup.scr',1:'system.scr'},stack:[],work:{},flags:{},thread:{},choice:[],loop:null,ended:false,visits:0,omissions:{},bg:{},portraits:{},events:0};
  }
  fail(i,message){throw Error(`${i?.id||this.state.script+':'+this.state.pc.toString(16)}: ${message}`);}
  read(bank,index){if(!Number.isInteger(index)||index<0||index>=(bank===41?16384:bank===45?64:1280))throw Error(`Invalid SC3 bank ${bank} index ${index}`);return this.state[bank===40?'work':bank===41?'flags':'thread'][index]||0;}
  write(bank,index,value){this.read(bank,index);this.state[bank===40?'work':bank===41?'flags':'thread'][index]=bank===41?value&1:value|0;}
  expr(tokens){return cartagraExpression(tokens,{read:(...a)=>this.read(...a),write:(...a)=>this.write(...a),special:(...a)=>this.special(...a)});}
  special(op,left,right){throw Error(`Unverified SC3 expression function ${op}`);}
  target(buffer,label){
    const script=this.state.buffers[buffer],data=this.scripts[script];
    if(!data||!Number.isInteger(label)||!Number.isInteger(data.labels[label]))throw Error(`Invalid SC3 target ${buffer}:${label}`);
    return {script,buffer,pc:data.labels[label]};
  }
  jump(buffer,label,call=false){const s=this.state;if(call){if(s.stack.length>=8)throw Error('Native call stack overflow');s.stack.push({script:s.script,pc:s.pc,buffer:s.buffer});}Object.assign(s,this.target(buffer,label));}
  omit(i,reason){this.state.omissions[i.op]=reason;}
  text(index,i){const t=this.scripts[this.state.script].strings[index];if(!t)this.fail(i,'Absent source string');return {script:this.state.script,index,offset:t.offset,tokens:t.tokens};}
  step(){
    const s=this.state;if(s.ended)return {kind:'end'};
    const script=this.scripts[s.script],i=script?.instructions[s.pc];if(!i)this.fail(null,'Outside structurally decoded code');
    s.pc=i.next;s.visits++;const a=i.args,op=i.op,e=n=>this.expr(a[n]),jump=n=>this.jump(s.buffer,n);
    switch(op){
      case 0xfe:s.last=e(0);break;
      case 0:if(s.stack.length)this.fail(i,'Thread end with live stack');s.ended=true;return {kind:'end',id:i.id};
      case 1:{const priority=e(0),buffer=e(1),label=a[2];
        if(i.id!=='Startup.scr:00001314'||priority!==4||buffer!==0||label!==1)this.fail(i,'Unverified concurrent source thread');
        s.stack=[];this.jump(buffer,label);break;
      }
      case 4:{const buffer=e(1),index=e(2);if(!this.names[index]||buffer<0||buffer>15)this.fail(i,'Invalid source load');s.buffers[buffer]=this.names[index];break;}
      case 5:case 0x33:this.omit(i,'Source wait simulated for control-flow research');return {kind:'wait',id:i.id};
      case 6:
        if(i.id!=='MAIN00.scr:00000fd0'||!this.read(41,392))this.fail(i,'Unverified halted source thread');
        // Startup.scr 0x1346 observes this exact completion flag and opens its
        // title menu. An arbitrary HALT must never be treated as an ending.
        s.ended=true;return {kind:'end',id:i.id,clearFlag:this.read(40,57)};
      case 7:jump(a[0]);break;
      case 8:{const index=e(0),base=script.labels[a[1]],bytes=this.bytes[s.script],stop=Math.min(...script.labels.filter(p=>p>base),script.code_end);if(index<0||base+index*2+2>stop)this.fail(i,'Jump table index outside source');jump(bytes[base+index*2]|bytes[base+index*2+1]<<8);break;}
      case 10:if(Boolean(e(1))===Boolean(a[0]))jump(a[2]);break;
      case 11:this.jump(s.buffer,a[0],true);break;
      case 12:this.jump(e(0),a[1]);break;
      case 13:this.jump(e(0),a[1],true);break;
      case 14:{const frame=s.stack.pop();if(!frame)this.fail(i,'Return without caller');Object.assign(s,frame);break;}
      case 15:{const count=e(1);if(s.loop?.id!==i.id)s.loop={id:i.id,remaining:count};if(s.loop.remaining!==0&&--s.loop.remaining!==0)jump(a[0]);else s.loop=null;break;}
      case 16:if(this.read(41,e(1))===a[0])jump(a[2]);break;
      case 17:if(this.read(41,e(1))!==a[0])this.fail(i,'Flag wait requires a native/concurrent state change');break;
      case 18:this.write(41,e(0),1);break;
      case 19:this.write(41,e(0),0);break;
      case 20:this.write(41,e(0),this.read(41,e(1)));break;
      case 21:this.fail(i,'Unverified controller-dependent branch');break;
      case 24:this.write(45,e(0),e(1));break;
      case 0x8018:this.write(45,a[0],a[1]);break;
      case 26:this.write(45,7,0x70000000);break; // bounded symbolic story-thread handle
      case 27:{const index=e(0);if(!this.names[index])this.fail(i,'Absent scenario');s.buffers[s.buffer]=this.names[index];jump(a[1]);break;}
      case 0x21:s.music={index:e(0),mode:e(1)};this.omit(i,'BGM playback not rendered in trace');break;
      case 0x22:s.music=null;break;
      case 0x23:s.sound={channel:a[0],index:e(1),mode:e(2)};this.omit(i,'Effect playback not rendered in trace');break;
      case 0x24:s.sound=null;break;
      case 0x25:s.musicEnvelope=a.map((_,n)=>e(n));this.omit(i,'Music envelope not rendered in trace');break;
      case 0x26:s.soundEnvelope=e(0);this.omit(i,'Effect envelope not rendered in trace');break;
      case 0x102:s.systemImage={slot:e(0),image:e(1),mode:e(2),table:a[3],script:s.script};this.omit(i,'System artwork omitted in trace');break;
      case 0x113:s.movie={index:e(0),previouslyPlayed:e(1)};this.omit(i,'Movie completion simulated in trace');return {kind:'movie',id:i.id,...s.movie};
      case 0x110:{const voiced=a[0]!==0;s.message={kind:'glyph-text',id:i.id,...this.text(a.at(-1),i),voice:voiced?a[1]:null,speakerCode:a.at(-2)};break;}
      case 0x111:if(!s.message)this.fail(i,'Presentation without message');s.events++;return structuredClone(s.message);
      case 0x114:
        if(a[0]===0){s.choice=[];s.choiceStyle=e(1);}else s.choice.push({value:s.choice.length,source:this.text(a[1],i),enabled:a[0]===1||Boolean(e(2))});break;
      case 0x115:
        if(a[0]===2){s.destination=e(1);const options=s.choice.filter(c=>c.enabled);if(!options.length)this.fail(i,'No available choices');return {kind:'choice',id:i.id,options:structuredClone(options)};}break;
      case 0x11e:s.textMode=a[0];break;
      case 0x1001:case 0x1003:{const mask=e(0),value=e(1),slot={1:0,2:1,4:2}[mask];if(slot==null)this.fail(i,'Invalid BG slot');s.bg[slot]=op===0x1001?{image:value}:{colour:value};this.write(40,713+slot*9,op===0x1001?value:65535);this.omit(i,'Background not rendered in trace');break;}
      case 0x1005:{const mask=e(0),value=e(1),slot=Math.log2(mask);if(!Number.isInteger(slot)||slot<0||slot>7)this.fail(i,'Invalid portrait slot');s.portraits[slot]={image:value};this.write(40,749+slot*10,value);this.omit(i,'Portrait not rendered in trace');break;}
      case 0x1002:case 0x1006:{
        const slots=[e(0),e(1)].map(Math.log2),bg=op===0x1002;
        if(slots.some(n=>!Number.isInteger(n)||n<0||n>=(bg?3:8)))this.fail(i,'Invalid image swap');
        const [x,y]=slots,indices=n=>bg?[...Array.from({length:9},(_,k)=>706+9*n+k),420+n,423+n,426+n]:[...Array.from({length:10},(_,k)=>740+10*n+k),429+3*n,430+3*n,431+3*n];
        const swap=(bank,a,b)=>{const old=this.read(bank,a);this.write(bank,a,this.read(bank,b));this.write(bank,b,old);};
        swap(41,(bg?472:475)+x,(bg?472:475)+y);
        const a=indices(x),b=indices(y);for(let k=0;k<a.length;k++)swap(40,a[k],b[k]);
        const images=bg?s.bg:s.portraits;[images[x],images[y]]=[images[y]??null,images[x]??null];break;
      }
      case 0x1016:{const index=e(0),table=this.native.byteTable;if(!table||!Number.isInteger(table[index]))this.fail(i,'Native lookup table absent');this.write(40,e(1),table[index]);break;}
      case 0x1007:s.portraitEffect={slot:e(0),mode:e(1)};this.omit(i,'Native portrait surface effect omitted in trace');break;
      case 0x1028:s.audioChannel=e(0);break;
      case 0x1029:{const index=e(0);if(index<0||index>=801)this.fail(i,'CG index outside source');if(index>=2)(s.cg??={})[index]=true;break;}
      case 0x1022:
        if(a[0]>3)this.fail(i,'Unknown source autosave mode');
        if(a[0]===2)s.pc+=3; // native 0x1280b0..0x128188, ordinary non-skip path
        if(a[0]===0)this.write(40,860,0);
        if(a[0]===3)this.write(41,311,0);
        this.omit(i,'Native memory-card autosave simulated in trace');break;
      case 0x102a:{const x=e(0),y=e(1),z=e(2);this.write(40,878,(x<<16)|(((y===4?3:y)-1)<<8)|((z===4?3:z)-1));break;}
      default:this.fail(i,`Unimplemented trace command ${op.toString(16)}`);
    }
    return null;
  }
  choose(value){if(!this.state.choice.some(o=>o.value===value&&o.enabled)||!Number.isInteger(this.state.destination))throw Error('Unavailable choice');this.write(40,this.state.destination,value);this.state.choice=[];delete this.state.destination;}
  run(limit=100000){for(let n=0;n<limit;n++){const event=this.step();if(event)return event;}throw Error('Cartagra instruction budget exhausted');}
}
