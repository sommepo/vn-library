/* SNS control VM under development. This is not a registered reader adapter.
 * Presentation, the system controller, switching and saves are needed for admission.
 * Unimplemented instructions throw without moving the source checkpoint. */
import {Operands, FLAG_COUNT, CHOICE_RENDER_CODES, decodeBranch, decodeChoice, decodeCheckpoint, decodeSystem, decodeLink, evaluate, choiceText, source428StoryText} from './shibuya428-control.mjs';
import {Shibuya428Progress} from './shibuya428-progress.mjs';
import {Shibuya428Context} from './shibuya428-context.mjs';
import {plan428System, needs428SystemController} from './shibuya428-system.mjs';
import {PRESENTATION_CODES, decode428Presentation} from './shibuya428-media.mjs';
import {is428TutorialKernel} from './shibuya428-tutorial-kernel.mjs';
import {is428ProgressKernel} from './shibuya428-progress-kernel.mjs';
import {is428WaitKernel} from './shibuya428-wait-kernel.mjs';
import {decode428Thread} from './shibuya428-threads.mjs';

const copy = structuredClone;
export class Shibuya428VM {
  constructor(scripts, entry, {contextData = null, tutorialsEnabled = null, presentation = false, flowKernel = null} = {}) {
    this.scripts = scripts;
    this.progress = new Shibuya428Progress(scripts);
    this.context = contextData === null ? null : new Shibuya428Context(contextData);
    if (tutorialsEnabled !== null && typeof tutorialsEnabled !== 'boolean') throw Error('Invalid tutorial preference');
    this.tutorialsEnabled = tutorialsEnabled;
    if (presentation !== false && presentation !== 'sns-numeric-v1') throw Error('Unknown presentation operand profile');
    this.presentation = presentation;
    if(flowKernel!==null&&(!is428ProgressKernel(flowKernel)||contextData===null))throw Error('Verified source flow kernel required');
    this.flowKernel=flowKernel;
    this.presenting = false;
    this.tokens = Object.fromEntries(Object.entries(scripts).map(([id,s]) => [id,new Map(s.tokens.map(t=>[t.offset,t]))]));
    this.state = {script: entry.script, pc: 0, flags: Array(FLAG_COUNT).fill(0), stack: [],
      label: null, enteredLabels: {}, edges: {}, selections: {}, pending: null,
      text: '', segment: '', ruby: false, rubyText: '', fragments: [], tips:[], openTip:null, mode: 'story'};
    if(flowKernel)this.state.flow=flowKernel.initialFlow();
    this.jump(entry, null, false);
  }
  captureState() {
    return {state: copy(this.state), progress: this.progress.bytes.slice(), context: this.context?.snapshot()};
  }
  rollback(snapshot) {
    this.assertIdle();
    this.state = copy(snapshot.state);
    this.progress.bytes.set(snapshot.progress);
    if (this.context) this.context.restore(snapshot.context);
  }
  fail(i, message) { throw Error(`${i?.id || `${this.state.script}:${this.state.pc}`}: ${message}`); }
  assertIdle() { if (this.presenting) throw Error('Presentation acknowledgement in progress'); }
  target(target, i) {
    const label = this.scripts[target.script]?.labels[target.label];
    if (!label || !this.tokens[target.script]?.has(label.offset)) this.fail(i,'Unresolved source target');
    return label.offset;
  }
  jump(target, i, link = true) {
    this.assertIdle();
    const pc = this.target(target,i), s = this.state;
    if (!target.label.startsWith('_')) {
      const key = `${target.script}:${target.label}`;
      this.progress.transition(s.label,key,{link,previousScript:s.script});
      if (link && s.label) s.edges[s.label] = key;
      s.label = key; s.enteredLabels[key] = true;
    }
    s.script = target.script; s.pc = pc;
  }
  // One instruction is atomic, including branches to missing source targets.
  step() {
    this.assertIdle();
    const before = this.captureState();
    try { return this.executeInstruction(); }
    catch (error) { this.rollback(before); throw error; }
  }
  executeInstruction() {
    this.assertIdle();
    const s = this.state;
    if (s.pending) return s.pending;
    if(s.choicePreview?.done){
      const preview=s.choicePreview;
      s.pending={kind:'choice',id:preview.id,...preview.choice,options:copy(preview.options),nativePreview:true};
      return s.pending;
    }
    const i = this.tokens[s.script]?.get(s.pc);
    if (!i) this.fail(null,'Execution outside decoded source');
    s.pc = i.next;
    if(s.mode==='tipReplay'){
      if(![1,0x0f,0x1b,0x1c,0x1d,0x1e,0x22,0x2d,0x43,0x6c,0x6e,0xc0].includes(i.code))this.fail(i,'Unsupported TIP caller replay command');
      if(i.code===0x2d)return null;
      if(i.code===0xc0){const c=decodeSystem(i);if(c.type!==2||c.code!==3||!s.flags[0x443])this.fail(i,'Unsupported TIP replay system event');return null;}
      if(i.code===0x22){if(decodeCheckpoint(i).restart)this.fail(i,'Unsupported TIP replay restart');s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipReplayCheckpoint'}};return s.pending;}
      if(i.code===0x1e){
        if(s.pc>s.tipReturnPC)this.fail(i,'TIP replay passed caller position');
        if(s.pc===s.tipReturnPC){s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipReplayEnd'}};return s.pending;}
        s.segment='';s.fragments=[];return null;
      }
    }else if(s.tipCaller){
      if(![1,0xf,0x10,0x1b,0x22,0x28,0x2a,0x2b,0x33,0x35,0x37,0x39,0x43,0x5a,0xbb,0xb8,0xb9,0x1f,0x6f].includes(i.code))this.fail(i,'Unsupported TIP page command');
      if([0x22,0x1f,0x5a,0xbb,0x6f].includes(i.code)){s.pending={kind:'tipControl',id:i.id,script:s.script};return s.pending;}
      if(i.code===0xb8){const r=new Operands(i),style=r.uint()&3;r.end();s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipTitle',style}};return s.pending;}
      if(i.code===0xb9){new Operands(i).end();s.tipTitle=s.text.trimEnd();s.text='';s.segment='';s.fragments=[];s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipBody'}};return s.pending;}
      if([0x33,0x35,0x37,0x39].includes(i.code)){const r=new Operands(i),value=r.uint(4);r.end();s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'textMargin',code:i.code,value}};return s.pending;}
    }
    if(s.mode==='hintReplay'){
      // 0x77 rebuilds only the retained title, starting at the actual system
      // position. Native replay suppresses glyph fades and finishes at its
      // yielding tutorial selector. Never run arbitrary story/media as replay.
      if(![1,3,4,5,6,7,8,9,10,0x10,0x11,0x13,0x14,0x15,0x16,0x17,0x18,0x28,0x29,0x2a,0x2e,0x74,0x76,0xc0].includes(i.code))this.fail(i,'Unsupported hint title replay command');
      if(i.code>=3&&i.code<=10||i.code===0x10)return null;
      if(i.code===0x2e){
        if(s.systemController?.type!==0||!s.systemController.active)this.fail(i,'Unsupported hint replay wait');
        s.mode='story';s.pc=i.offset;s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'hintReplayEnd'}};return s.pending;
      }
      if(i.code===0xc0){
        const command=decodeSystem(i);
        if(command.type!==2||command.code!==6||!s.flags[0x446])this.fail(i,'Unsupported hint replay completion');
        const plan=plan428System(command,{flags:s.flags,character:this.context.current().character,tutorialsEnabled:this.tutorialsEnabled});
        if(plan.type!==0||plan.code!==1||!plan.active||!plan.yield||plan.request!==null)this.fail(i,'Unexpected hint replay system result');
        s.system=plan;s.systemController={type:0,code:1,active:true};s.mode='story';
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'hintReplayEnd'}};return s.pending;
      }
    }
    if(s.choicePreview){
      const handled=this.previewInstruction(i);
      if(handled)return s.pending;
    }
    if (this.presentation && PRESENTATION_CODES.has(i.code)) {
      s.pending = {kind:'presentation', id:i.id, script:s.script, command:decode428Presentation(i)};
      return s.pending;
    }
    const r = i.code === 1 || i.code === 0x1c || i.code === 0x1d ? null : new Operands(i);
    switch (i.code) {
      case 0xab: r.end(); break;
      // The original 0x0889d750 handler only skips this token's payload.
      case 0x80: r.pos = r.bytes.length; r.end(); break;
      case 0x22: {
        const checkpoint = decodeCheckpoint(i);
        if(s.stack.length){
          if(checkpoint.restart||s.mode!=='story')this.fail(i,'Unsupported subroutine checkpoint');
          // Original 0x22 bypasses context/FLO updates while a source call is
          // active. Its font state continues on the caller's displayed page.
          if(this.presentation)s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'callCheckpoint'}};
          break;
        }
        if (!this.context) this.fail(i, 'Verified source checkpoint metadata required');
        if (s.segment || s.ruby || s.openTip) this.fail(i, 'Checkpoint would discard unpresented source text');
        const current = this.progress.labels[this.progress.id(s.label)];
        const context = this.context.checkpoint(current.label, checkpoint.restart);
        if (checkpoint.restart) this.progress.restartCheckpoint(s.label);
        if(this.flowKernel)s.flow=this.flowKernel.checkpointFlow(copy(s));
        s.pending = {kind:'checkpoint', id:i.id, ...checkpoint, context};
        break;
      }
      case 0xc0: {
        const command = decodeSystem(i), context = this.context?.snapshot();
        if (context?.character == null || this.tutorialsEnabled === null)
          this.fail(i, 'Unsupported system command without source context and tutorial preference');
        const plan = plan428System(command, {flags:s.flags, character:context.character, tutorialsEnabled:this.tutorialsEnabled});
        if (command.type === 2) {
          this.progress.presented(s.label, s.pc - this.scripts[s.script].content_offset);
          s.systemResume = {script:s.script, pc:s.pc};
          s.readPosition=copy(s.systemResume);
        } else this.progress.complete(s.label);
        s.system = plan;
        s.systemController={type:plan.type,code:plan.code,active:plan.active};
        if (command.type === 0) s.systemPosition = {script:s.script, pc:s.pc};
        if (plan.yield || needs428SystemController(plan)) s.pending = {kind:'system', id:i.id, plan};
        break;
      }
      case 0x52: case 0x56: case 0x59: {
        const t = r.target(); r.end(); this.jump(t,i,i.code!==0x52); break;
      }
      case 0x57: {
        const b = decodeBranch(i); if (!evaluate(b.clauses,s.flags)) this.jump(b.target,i); break;
      }
      case 0x5a: {
        const t = r.target(); r.end();
        if (s.stack.length >= 8) this.fail(i,'Native call stack capacity exceeded');
        const pc=this.target(t,i);
        this.progress.beginCall(t);
        s.stack.push({script:s.script,pc:s.pc,label:s.label,target:copy(t)});
        // 0x0887a210 changes script/PC, retaining the caller's current label.
        s.script=t.script;s.pc=pc;break;
      }
      case 0x5b: case 0xbb: {
        r.end(); const caller=s.stack.pop(); if (!caller) this.fail(i,'Return without source caller');
        if (!this.tokens[caller.script]?.has(caller.pc)) this.fail(i,'Caller outside source');
        if(!caller.target)this.fail(i,'Return without owned source call');
        this.progress.complete(caller.target);this.progress.beginChoice(caller.target);
        s.script=caller.script;s.pc=caller.pc;s.label=caller.label;break;
      }
      case 0xba: r.end(); break;
      case 0x5c: case 0x5d: {
        const index=r.flag(r.uint(2));r.end();
        // Native 0x08886d78 requests cross-character replay at these writes.
        // Returning an explicit event prevents accidentally continuing with stale flags.
        s.flags[index]=i.code===0x5c?1:0;
        this.progress.presented(s.label,s.pc-this.scripts[s.script].content_offset);
        if ((index>=31&&index<91)||index===287||index===290)
          s.pending={kind:'recompute',id:i.id,index};
        break;
      }
      case 0x53: case 0x54: case 0x55: {
        const choice=decodeChoice(i);
        if(this.presentation){
          if(s.stack.length||s.ruby||s.openTip||choice.timeoutFrames||i.code===0x55)
            this.fail(i,'Unsupported choice presentation mode');
          for(const option of choice.options)this.target(option,i);
          const preview={id:i.id,choice,script:s.script,pc:s.pc,label:s.label,index:0,done:false,
            previousChoice:this.progress.record(s.label).choice,
            options:choice.options.map(o=>({...o,text:'',fragments:[],recommended:false,visited:this.progress.record(o).complete}))};
          s.choicePreview=preview;this.progress.beginChoice(s.label);
          s.script=choice.options[0].script;s.pc=this.target(choice.options[0],i);
          s.pending={kind:'presentation',id:i.id,script:preview.script,command:{type:'choiceStart',label:preview.label,...copy(choice),previousChoice:preview.previousChoice,visited:preview.options.map(o=>o.visited)}};
          break;
        }
        const options=choice.options.map(option=>({
          ...option,...choiceText(this.scripts[option.script],this.target(option,i))
        }));
        s.pending={kind:'choice',id:i.id,...choice,options};break;
      }
      case 1:
        if (typeof i.text!=='string') this.fail(i,'Missing decoded source text');
        if(s.ruby)s.rubyText+=i.text;
        else {
          const text=source428StoryText(i.text);
          s.text+=text;s.segment+=text;s.fragments.push(i.id);
          if(this.presentation)s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'textFragment',text}};
        }
        break;
      case 0x1c:
        if(s.ruby)this.fail(i,'Nested ruby is not implemented');s.ruby=true;s.rubyText='';
        if(this.presentation)s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'rubyStart'}};break;
      case 0x1d:
        if(!s.ruby)this.fail(i,'Ruby terminator without reading');s.ruby=false;break;
      case 0x1b:
        r.end();s.text+='\n';s.segment+='\n';
        if(this.presentation)s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'newline'}};
        break;
      case 0x70:{
        if(!this.presentation||s.openTip||s.ruby||s.tips.length>=8||!is428ProgressKernel(this.flowKernel)||!this.context?.current())this.fail(i,'JUMP span requires verified source context');
        const link=decodeLink(i);this.target(link.target,i);
        const available=this.flowKernel.jumpAvailable(s,this.progress.snapshot(),this.context.snapshot(),i.id),visited=!!s.flags[link.flag+0x44c];
        s.openTip={id:i.id,target:link.target,start:s.text.length,jump:true,available,field:link.field,flag:link.flag};
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipStart',...link,jump:true,available,visited}};break;
      }
      case 0x6c:case 0x74:{
        if(!this.presentation||s.openTip||s.ruby)this.fail(i,'TIP span requires source presentation');
        if(i.code===0x74)s.tips=[];
        if(s.tips.length>=8)this.fail(i,'Native TIP capacity exceeded');
        const link=decodeLink(i);if(link.mode!==0||link.field!==65535)this.fail(i,'Unsupported TIP mode');
        this.target(link.target,i);const target=`${link.target.script}:${link.target.label}`;
        const hint=i.code===0x74?{hint:true}:{};
        s.openTip={id:i.id,target:link.target,start:s.text.length,visited:this.progress.record(target).complete,...hint};
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipStart',...link,...hint,visited:this.progress.record(target).complete}};break;
      }
      case 0x6e:case 0x72:case 0x76:
        r.end();if(!this.presentation||!s.openTip)this.fail(i,'TIP end without source span');
        if((i.code===0x76)!==!!s.openTip.hint)this.fail(i,'Mismatched source link end');
        if((i.code===0x72)!==!!s.openTip.jump)this.fail(i,'Mismatched source JUMP end');
        s.tips.push({...s.openTip,end:s.text.length});s.openTip=null;
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'tipEnd',...(i.code===0x76?{hint:true}:i.code===0x72?{jump:true}:{})}};break;
      case 0x2b: {
        if(!this.presentation||s.ruby)this.fail(i,'Inline rule requires source presentation');
        const count=r.uint();r.end();const text='\u2015'.repeat(count);
        s.text+=text;s.segment+=text;if(count)s.fragments.push(i.id);
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'textRule',count}};break;
      }
      case 0x43: {
        if(!this.presentation)this.fail(i,'Animated punctuation requires source presentation');
        if(s.ruby)this.fail(i,'Animated punctuation inside ruby is not implemented');
        const count=r.uint(),cadence=r.uint();r.end();
        const text='\u2026'.repeat(count);s.text+=text;s.segment+=text;if(count)s.fragments.push(i.id);
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'ellipsis',count,cadence}};break;
      }
      case 0x1e: case 0x1f:case 0x20:case 0x21:
        r.end();if(s.ruby)this.fail(i,'Boundary within ruby');
        s.readPosition={script:s.script,pc:s.pc};
        if(i.code===0x1e)this.progress.presented(s.label,s.pc-this.scripts[s.script].content_offset);
        else{this.progress.beginChoice(s.label);s.flags[12]=0;if(i.code!==0x21)this.progress.complete(s.label);}
        s.pending={kind:'text',id:s.fragments[0]||i.id,text:s.segment.trimEnd(),pageText:s.text.trimEnd(),fragments:[...s.fragments],clear:i.code===0x1f||i.code===0x21,...(i.code===0x20?{auto:true}:{})};break;
      case 0x2d: {
        const frames=r.uint(4);r.end();s.pending={kind:'wait',id:i.id,frames};break;
      }
      case 0xa1:case 0xa2:case 0xa3:{
        if(!this.presentation||s.mode!=='story'||s.stack.length)this.fail(i,'Unsupported thread caller');
        const command=decode428Thread(i);this.target(command.target,i);
        s.pending={kind:'presentation',id:i.id,script:s.script,command};break;
      }
      // This foreground delimiter only consumes its empty source payload.
      // A thread's actual completion command is 0xa5, owned by its scheduler.
      case 0xa4:r.end();break;
      case 0x2e:{
        const frames=r.uint(4)|0;r.end();
        if(!this.presentation||frames< -1||frames>60000||s.stack.length||s.mode!=='story')this.fail(i,'Unsupported interruptible wait context');
        s.pending={kind:'inputWait',id:i.id,script:s.script,frames,system:copy(s.systemController??{type:0,code:0,active:false}),...(s.tips.length===1&&s.tips[0].hint&&!s.hintCaller?{hints:1}:{})};break;
      }
      case 0x77:{
        r.end();const caller=s.hintCaller;
        if(!this.presentation||!caller||s.stack.length||s.mode!=='story')this.fail(i,'Unsupported hint return context');
        this.progress.transition(s.label,caller.label,{link:false,previousScript:s.script});
        s.script=caller.script;s.label=caller.label;s.pc=caller.systemPosition.pc;
        s.systemPosition=caller.systemPosition;s.readPosition=caller.readPosition;
        s.systemController={...s.systemController,type:0,active:true};s.mode='hintReplay';delete s.hintCaller;
        s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
        s.pending={kind:'presentation',id:i.id,script:s.script,command:{type:'hintReturned'}};break;
      }
      case 0x62:{
        const type=r.uint(),number=r.uint(2);r.end();
        if(!this.presentation||s.mode!=='story'||s.stack.length||type>1||number<1||number>96)
          this.fail(i,'Unsupported ending-record context');
        // 0x08895a88 uses the flag base initialized by 0x088828f8. This
        // records the source ending; the following system commands still run.
        s.flags[400+number-1]=1;
        if(number===92)s.flags[0x229]=1;
        if(number===93)s.flags[0x227]=1;
        s.ending={id:i.id,type,index:number-1,label:s.label};
        this.progress.complete(s.label);
        s.pending={kind:'wait',id:i.id,frames:1};break;
      }
      case 0xac:
        r.end();
        if(s.hourPrelude){
          if(!this.presentation||!this.context?.current()||s.stack.length||s.hourPrelude.endId!==i.id)this.fail(i,'Prepared source hour return required');
          s.pending={kind:'hourReturn',id:i.id};break;
        }
        if(!this.presentation||!this.context?.current()||s.mode!=='story'||s.stack.length||!s.ending||s.endingController)
          this.fail(i,'Source ending return controller required');
        s.pending={kind:'endingReturn',id:i.id};break;
      default:this.fail(i,`Unsupported native SNS command 0x${i.code.toString(16)}`);
    }
    return s.pending;
  }
  // Native controller 7 composes each option in source order. It retains the
  // caller label and skips branch/write commands; tutorial events can suspend
  // this process. Rendering an option never selects or completes that option.
  previewInstruction(i){
    const s=this.state,p=s.choicePreview,o=p.options[p.index];
    const event=command=>{s.pending={kind:'presentation',id:i.id,script:s.script,command};return true;};
    if(s.ruby){
      if(i.code===1){s.rubyText+=i.text;return true;}
      if(i.code===0x1d){s.ruby=false;return true;}
      this.fail(i,'Unsupported choice ruby framing');
    }
    if(!CHOICE_RENDER_CODES.has(i.code))return true;
    if(i.code===1){
      if(typeof i.text!=='string')this.fail(i,'Missing choice source text');
      const text=source428StoryText(i.text);o.text+=text;o.fragments.push(i.id);
      return event({type:'textFragment',text,choiceIndex:p.index});
    }
    if(i.code===0x1b){new Operands(i).end();o.text+='\n';return event({type:'newline'});}
    if(i.code===0x22){
      if(decodeCheckpoint(i).restart)this.fail(i,'Choice preview restart checkpoint is not implemented');
      return event({type:'choiceCheckpoint'});
    }
    if(i.code===0xbc){new Operands(i).end();o.recommended=true;return event({type:'choiceRecommended'});}
    if(i.code===0x43){
      const r=new Operands(i),count=r.uint(),cadence=r.uint();r.end();
      o.text+='\u2026'.repeat(count);if(count)o.fragments.push(i.id);
      return event({type:'ellipsis',count,cadence});
    }
    if(i.code===0x5e){
      new Operands(i).end();o.text=o.text.trimEnd();
      const command={type:'choiceEnd',choiceId:p.id,index:p.index,visited:p.options.map(o=>o.visited)};
      const sourceScript=s.script;
      if(++p.index===p.options.length){
        p.done=true;s.script=p.script;s.pc=p.pc;this.progress.complete(s.label);
      }else{const next=p.options[p.index];s.script=next.script;s.pc=this.target(next,i);}
      s.pending={kind:'presentation',id:i.id,script:sourceScript,command};return true;
    }
    if(i.code===0xc0||i.code===0x1c||i.code===0x2d||PRESENTATION_CODES.has(i.code))return false;
    this.fail(i,`Unsupported choice presentation command 0x${i.code.toString(16)}`);
  }
  run(limit=20000) {
    this.assertIdle();
    const before=this.captureState();
    try {for(let n=0;n<limit;n++){const p=this.executeInstruction();if(p)return p;}this.fail(null,'Instruction budget exhausted');}
    catch(error){this.rollback(before);throw error;}
  }
  advance(option) {
    this.assertIdle();
    const before=this.captureState();
    try {
      const s=this.state,p=s.pending;if(!p)return this.run();
      if(this.presentation && ['presentation','checkpoint','wait','text'].includes(p.kind))
        this.fail({id:p.id},'Explicit presentation acknowledgement required');
      if(p.kind==='recompute')this.fail(null,'Verified native progress kernel and source context required');
      if(p.kind==='inputWait')this.fail(p,'Native interruptible-wait input required');
      if(p.kind==='hint')this.fail(p,'Explicit source hint activation required');
      if(['linkSelection','jumpDialog','jumpTransition','tipControl','tip','tipClose','tipResume'].includes(p.kind))this.fail(p,'Explicit source link selection required');
      if(['endingReturn','endingSave','endingSaved','navigation','navigationTimeline','hourReturn','hourIntro','hourIntroPlaying','hourNotice'].includes(p.kind))this.fail(p,'Explicit ending/navigation controller required');
      if(['menuRequest','menuPaused','timeline','timelineResume'].includes(p.kind))this.fail(p,'Explicit timeline controller required');
      if(p.kind==='system' && needs428SystemController(p.plan))
        this.fail({id:p.id}, 'Native system controller and presentation required');
      if(p.kind==='choice'){
        if(p.nativePreview)this.fail(p,'Verified choice selection controller required');
        const selected=p.options.find(x=>x.index===option);
        if(!selected)this.fail(null,'Choose an offered source option');
        this.progress.select(s.label,option);
        s.selections[p.id]=option;this.jump(selected,{id:p.id});s.text='';s.segment='';s.fragments=[];
      }else if(p.kind==='text'){s.text=p.clear?'':s.text;s.segment='';s.fragments=[];}
      else if(p.kind==='checkpoint'){s.text='';s.segment='';s.fragments=[];}
      s.pending=null;return this.run();
    }catch(error){this.rollback(before);throw error;}
  }
  // Commit just this boundary, then let the caller run the next source batch.
  // A later unsupported instruction must not replay already played audio or
  // remove a page the user has seen. No media event is a study/read-count event.
  async present(presenter) {
    this.assertIdle();
    const s=this.state, event=s.pending;
    if(!this.presentation || !event || !['presentation','checkpoint','wait','text'].includes(event.kind))
      this.fail(event,'No pending presentation boundary');
    if(typeof presenter?.apply!=='function')throw Error('Presentation consumer required');
    this.presenting=true;
    try {
      const acknowledgement=await presenter.apply(copy(event));
      if(event.command?.type==='menuPause'){
        if(![-1,0,1].includes(acknowledgement?.freeMovieChannel))throw Error('Timeline requires streaming channel state');
        s.menuController.freeMovieChannel=acknowledgement.freeMovieChannel;
      }
      if(event.kind==='checkpoint'){s.text='';s.segment='';s.fragments=[];s.tips=[];}
      else if(event.kind==='text'){if(event.clear){s.text='';s.tips=[];}s.segment='';s.fragments=[];}
      if(event.command?.type==='endingReset'){
        s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
        s.endingController.phase='save';s.pending={kind:'endingSave',id:event.id};
      }else if(event.command?.type==='menuPause')s.pending={kind:'menuPaused',id:event.id,menu:s.menuController.menu};
      else if(event.command?.type==='timelineSelected'){
        s.menuController.phase='reset';s.pending={kind:'timelineResume',id:event.id};
      }
      else if(event.command?.type==='jumpTransition')s.pending={kind:'jumpTransition',id:event.id};
      else if(event.command?.type==='tipClosing')s.pending={kind:'tipClose',id:event.id};
      else if(event.command?.type==='tipReplayEnd')s.pending={kind:'tipResume',id:event.id};
      else s.pending=null;
    } finally { this.presenting=false; }
  }
  // Completion is earned by the verified controller consuming real host input.
  // Commit only this event; a later source stop cannot replay the tutorial.
  async presentSystem(kernel,driver){
    this.assertIdle();
    const event=this.state.pending;
    if(!this.presentation||event?.kind!=='system'||!is428TutorialKernel(kernel))this.fail(event,'Verified tutorial controller required');
    if(typeof driver?.frame!=='function'||typeof driver?.draw!=='function')throw Error('Tutorial presentation and input required');
    const checkpoint=kernel.checkpoint();this.presenting=true;
    try{
      let view=kernel.start(copy(event),this.state.flags,this.state.systemPosition,this.tutorialsEnabled,this.state.tips,{owner:this.flowKernel,snapshot:this.context?.snapshot()});
      await driver.draw(view);
      while(!view.done){view=kernel.tick(await driver.frame());await driver.draw(view);}
      await driver.draw(null);
      const systemController=kernel.systemState();
      const continuation=kernel.continuation();
      this.state.flags=kernel.finish(copy(event),this.state.flags);
      this.state.systemController=systemController;
      this.state.pending=continuation?{...continuation,id:event.id}:null;
    }catch(error){kernel.restore(checkpoint);throw error;}
    finally{this.presenting=false;}
  }
  async presentWait(kernel,driver){
    this.assertIdle();const event=this.state.pending;
    if(!this.presentation||event?.kind!=='inputWait'||!is428WaitKernel(kernel))this.fail(event,'Verified interruptible-wait controller required');
    if(typeof driver?.frame!=='function'||typeof driver?.draw!=='function')throw Error('Wait presentation and input required');
    const before=kernel.checkpoint();this.presenting=true;
    try{
      let view=kernel.start(copy(event));await driver.draw(view);
      while(!view.done){view=kernel.tick(await driver.frame());await driver.draw(view);}
      await driver.draw(null);const {hint,...system}=kernel.finish(copy(event));this.state.systemController=system;
      this.state.pending=hint?{kind:'hint',id:event.id}:null;
    }catch(error){kernel.restore(before);throw error;}
    finally{this.presenting=false;}
  }
  openHint(){
    this.assertIdle();const before=this.captureState(),s=this.state;
    try{
      if(!this.presentation||!this.context?.current()||s.pending?.kind!=='hint'||s.hintCaller||s.stack.length||s.mode!=='story'||s.tips.length!==1||!s.tips[0].hint||s.openTip||s.ruby)
        this.fail(s.pending,'Source hint activation requires its native wait request');
      const tip=s.tips[0],t=[...this.tokens[s.script].values()].find(t=>t.id===tip.id),link=t&&decodeLink(t);
      if(t?.code!==0x74||JSON.stringify(link.target)!==JSON.stringify(tip.target)||link.mode!==0||link.field!==65535)this.fail(t,'Hint source target mismatch');
      const origin=[...this.tokens[s.script].values()].find(t=>t.next===s.systemPosition?.pc);
      if(s.systemPosition?.script!==s.script||origin?.code!==0xc0||origin.args[0]!==0||!s.readPosition||s.readPosition.script!==s.script)this.fail(t,'Hint source return position required');
      const first=tip.target.label.indexOf('_'),last=tip.target.label.indexOf('_',first+1),number=Number.parseInt(tip.target.label.slice(first+1,last),10);
      if(first<0||last<0||!Number.isInteger(number)||number<1||number>1248)this.fail(t,'Unsupported native hint flag index');
      const pc=this.target(tip.target,t);
      s.hintCaller={script:s.script,label:s.label,systemPosition:copy(s.systemPosition),readPosition:copy(s.readPosition)};
      s.flags[13]|=8;s.flags[800+number-1]=1;
      s.script=tip.target.script;s.pc=pc;s.label=`${s.script}:${tip.target.label}`;
      s.systemController={...s.systemController,type:0,active:false};
      s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
      s.pending={kind:'presentation',id:tip.id,script:s.script,command:{type:'hintOpened'}};
    }catch(error){this.rollback(before);throw error;}
  }
  resolveMenuRequest(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified timeline request controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.beginTimelinePause(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;s.menuController=copy(result.pause);
      s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'menuPause',frames:result.pause.frames}};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  selectLink(index,kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified JUMP selection required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.openJump(copy(s),this.progress.snapshot(),this.context.snapshot(),index,this.tutorialsEnabled);
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.pending={kind:'jumpDialog',id:s.pending.id,...copy(result.dialog)};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  openTip(index,kernel){
    this.tipTransaction(kernel,()=>{
      const s=this.state,result=kernel.openTip(copy(s),this.progress.snapshot(),this.context.snapshot(),index);
      this.progress.restore(result.progress);s.flow=result.flow;s.flags=result.flags;this.context.restore(result.context);
      s.tipCaller=result.key;s.script=result.script;s.label=result.label;s.pc=result.pc;
      s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
      s.pending={kind:'presentation',id:result.key,script:s.script,command:{type:'tipOpened'}};
    });
  }
  tipTransaction(kernel,action){
    this.assertIdle();
    if(!this.presentation||!this.context||kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(this.state.pending,'Verified TIP controller required');
    const before=this.captureState(),native=kernel.checkpoint();
    try{return action();}catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveTipControl(kernel){
    this.tipTransaction(kernel,()=>{
      const s=this.state,id=s.pending?.id,result=kernel.tipStep(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);s.flow=result.flow;s.flags=result.flags;this.context.restore(result.context);
      if(result.phase==='call'||result.phase==='callReturn'){
        if(result.phase==='call')s.stack.push({script:s.script,pc:s.pc,label:s.label});else s.stack.pop();
        s.script=result.script;s.pc=result.pc;s.pending=null;
      }
      else if(result.phase==='callCheckpoint')s.pending=null;
      else if(result.phase==='checkpoint')s.pending={kind:'presentation',id,script:s.script,command:{type:'tipCheckpoint'}};
      else if(result.phase==='wait')s.pending={kind:'tip',id,title:s.tipTitle,text:s.text.trimEnd(),fragments:[...s.fragments]};
      else{
        this.state={...result.caller,flags:result.flags,flow:result.flow,mode:'tipReplay',pc:result.pc,
          tipCaller:s.tipCaller,tipReturnPC:result.caller.pc,text:'',segment:'',fragments:[],tips:[],openTip:null,
          pending:{kind:'presentation',id,script:result.caller.script,command:{type:'tipReturned'}}};
      }
    });
  }
  closeTip(kernel){
    this.tipTransaction(kernel,()=>{
      const s=this.state,result=kernel.beginTipClose(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);s.flow=result.flow;s.flags=result.flags;this.context.restore(result.context);
      s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'tipClosing'}};
    });
  }
  resolveTipClose(kernel){this.tipTransaction(kernel,()=>{kernel.finishTipClose(copy(this.state));this.state.pending=null;});}
  resolveTipReplay(kernel){this.tipTransaction(kernel,()=>{
    const s=this.state;s.pending=kernel.finishTipReplay(copy(s));s.mode='story';delete s.tipCaller;delete s.tipReturnPC;
  });}
  async presentJumpTutorial(kernel,tutorial,driver){
    this.assertIdle();const s=this.state,event=s.pending;
    if(!this.presentation||event?.kind!=='jumpDialog'||!event.tutorial||kernel!==this.flowKernel||!is428TutorialKernel(tutorial))this.fail(event,'Verified JUMP tutorial required');
    if(typeof driver?.frame!=='function'||typeof driver?.draw!=='function')throw Error('JUMP tutorial presentation and input required');
    const native=kernel.checkpoint(),display=tutorial.checkpoint();this.presenting=true;
    try{
      const request=kernel.jumpTutorialRequest(copy(s),this.progress.snapshot(),this.context.snapshot());
      let view=tutorial.startMenu(request,s.flags,kernel);await driver.draw(view);
      while(!view.done){view=tutorial.tick(await driver.frame());await driver.draw(view);}
      await driver.draw(null);const flags=tutorial.finishMenu(request,s.flags,kernel);
      const result=kernel.finishJumpTutorial(copy(s),this.progress.snapshot(),this.context.snapshot(),request,flags);
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.pending={kind:'jumpDialog',id:event.id,...copy(result.dialog)};
    }catch(error){kernel.restore(native);tutorial.restore(display);throw error;}finally{this.presenting=false;}
  }
  decideJump(confirm,kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified JUMP decision required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.decideJump(copy(s),this.progress.snapshot(),this.context.snapshot(),confirm);
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'jumpTransition',...result.transition}};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveJumpTransition(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified JUMP transition required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.finishJumpTransition(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      if(result.cancelled)s.pending={kind:'system',id:s.pending.id,plan:plan428System({type:2,code:14},{flags:s.flags,character:this.context.current().character,tutorialsEnabled:this.tutorialsEnabled})};
      else{s.menuController={menu:4,frames:30,returnController:5};s.pending={kind:'timeline',id:s.pending.id,...copy(result.timeline)};}
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveMenuPause(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified earned timeline controller required');
    const native=kernel.checkpoint();
    try{
      const automatic=s.pending?.kind==='navigationTimeline';
      const result=automatic?kernel.openNavigationTimeline(copy(s),this.progress.snapshot(),this.context.snapshot(),this.tutorialsEnabled):kernel.openTimeline(copy(s),this.progress.snapshot(),this.context.snapshot());
      if(automatic)s.menuController={menu:4,frames:0,returnController:5};
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.pending={kind:'timeline',id:s.pending.id,...copy(result.timeline)};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  async presentTimelineTutorial(kernel,tutorial,driver){
    this.assertIdle();const s=this.state,event=s.pending;
    if(!this.presentation||event?.kind!=='timeline'||!event.tutorial||kernel!==this.flowKernel||!is428TutorialKernel(tutorial))this.fail(event,'Verified timeline tutorial required');
    if(typeof driver?.frame!=='function'||typeof driver?.draw!=='function')throw Error('Timeline tutorial presentation and input required');
    const native=kernel.checkpoint(),display=tutorial.checkpoint();this.presenting=true;
    try{
      const request=kernel.timelineTutorialRequest(copy(s),this.progress.snapshot(),this.context.snapshot());
      let view=tutorial.startMenu(request,s.flags,kernel);await driver.draw(view);
      while(!view.done){view=tutorial.tick(await driver.frame());await driver.draw(view);}
      await driver.draw(null);
      const flags=tutorial.finishMenu(request,s.flags,kernel);
      const result=kernel.finishTimelineTutorial(copy(s),this.progress.snapshot(),this.context.snapshot(),request,flags);
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.pending={kind:'timeline',id:event.id,...copy(result.timeline)};
    }catch(error){kernel.restore(native);tutorial.restore(display);throw error;}
    finally{this.presenting=false;}
  }
  selectTimeline(id,kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified timeline selection required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.selectTimeline(copy(s),this.progress.snapshot(),this.context.snapshot(),id);
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);
      s.flags=result.flags;s.script=result.script;s.pc=result.pc;s.label=result.label;s.enteredLabels[result.label]=true;
      delete s.system;delete s.systemPosition;delete s.systemResume;delete s.readPosition;
      s.systemController={type:0,code:0,active:false};s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
      delete s.ending;delete s.endingController;
      s.menuController.phase='selected';s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'timelineSelected'}};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveTimelineResume(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(kernel!==this.flowKernel||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified timeline resume required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.resumeTimeline(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);s.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      delete s.menuController;s.pending={kind:'wait',id:s.pending.id,frames:result.frames};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveEndingSystem(kernel){
    this.assertIdle();const before=this.captureState();
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(this.state.pending,'Verified ending system controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.finishEndingSystem(copy(this.state),this.progress.snapshot(),this.context.snapshot());
      this.state.flags=result.flags;this.context.restore(result.context);
      if(result.progress)this.progress.restore(result.progress);if(result.flow)this.state.flow=result.flow;
      if(result.hourPrelude)this.state.hourPrelude=result.hourPrelude;
      if(result.reset){
        this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;
        this.state.endingController={phase:'reset',...result.reset};
        this.state.pending={kind:'presentation',id:this.state.pending.id,script:this.state.script,command:{type:'endingReset',fadeFrames:result.reset.fadeFrames}};
      }else{
        this.state.systemController=result.system;
        // The selector, entry and continuation each yield in the native loop.
        this.state.pending={kind:'wait',id:this.state.pending.id,frames:3};
      }
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveEnding(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified ending return controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.beginEnding(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.endingController={phase:'reset',save:result.save};
      s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'endingReset'}};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  resolveHourReturn(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified hour return controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.beginHourReturn(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);this.context.restore(result.context);s.flags=result.flags;s.flow=result.flow;delete s.hourPrelude;
      s.pending={kind:'hourIntro',id:s.pending.id,...result.intro};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  async presentHourIntro(kernel,presenter){
    this.assertIdle();const state=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel)||!['hourIntro','hourIntroPlaying'].includes(state.pending?.kind)||typeof presenter?.apply!=='function')this.fail(state.pending,'Verified hour intro presentation required');
    this.presenting=true;
    try{
      if(state.pending.kind==='hourIntro'){
        await presenter.apply({kind:'presentation',id:state.pending.id,command:{type:'endingReset',fadeFrames:30}});
        const plan=kernel.startHourIntro(copy(state),this.progress.snapshot(),this.context.snapshot());
        state.pending={kind:'hourIntroPlaying',id:state.pending.id,plan,phase:'delay'};
      }
      const pending=state.pending,event={kind:'presentation',id:pending.id,script:pending.plan.script};
      if(pending.phase==='delay'){
        await presenter.apply({kind:'wait',id:pending.id,frames:pending.plan.frames});pending.phase='start';
      }
      if(pending.phase==='start'){
        await presenter.apply({...event,command:{type:'movie',resource:pending.plan.resource,layer:1,volumePercent:pending.plan.volumePercent,yieldFrame:0}});pending.phase='playing';
      }
      if(pending.phase==='playing'){
        await presenter.apply({...event,command:{type:'movieWait',resource:pending.plan.resource,layer:1}});pending.phase='stop';
      }
      if(pending.phase==='stop'){
        await presenter.apply({...event,command:{type:'movieStop',resource:pending.plan.resource,layer:1}});pending.phase='complete';
      }
      if(pending.phase!=='complete')throw Error('428 invalid hour presentation phase');
      kernel.finishHourIntro(copy(state),this.progress.snapshot(),this.context.snapshot());
      state.pending={kind:'hourNotice',id:pending.id};
    }finally{this.presenting=false;}
  }
  resolveHourNotice(kernel){
    this.assertIdle();const before=this.captureState(),state=this.state;
    if(!this.context||!is428ProgressKernel(kernel))this.fail(state.pending,'Verified hour notice controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.finishHourNotice(copy(state),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);this.context.restore(result.context);state.flags=result.flags;state.flow=result.flow;
      state.endingController={phase:'save',source:'hour-intro',status:8,save:result.save};state.pending={kind:'endingSave',id:state.pending.id};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  // Save completion is a separate host boundary. A later navigation failure
  // must not run the ending record or reset again, or repeat the persisted save.
  async persistEnding(store){
    this.assertIdle();const s=this.state;
    if(s.pending?.kind!=='endingSave'||s.endingController?.phase!=='save'||typeof store?.write!=='function')this.fail(s.pending,'Ending persistence backend required');
    const snapshot={version:1,kind:'428-ending-checkpoint',state:copy(s),progress:this.progress.snapshot(),context:this.context.snapshot()};
    this.presenting=true;
    try{await store.write(snapshot);s.endingController.phase='saved';s.pending={kind:'endingSaved',id:s.pending.id};}
    finally{this.presenting=false;}
  }
  resolveEndingSave(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified post-save controller required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.finishEndingSave(copy(s),this.progress.snapshot(),this.context.snapshot());
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      s.endingController={...s.endingController,phase:'navigation'};
      s.pending={kind:result.navigation.timeline?'navigationTimeline':'navigation',id:s.pending.id,...result.navigation};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  navigationOptions(kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified character menu required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.navigationOptions(copy(s),this.progress.snapshot(),this.context.snapshot(),this.tutorialsEnabled);
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);s.flags=result.flags;
      return copy(result.options);
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  selectCharacter(index,kernel){
    this.assertIdle();const before=this.captureState(),s=this.state;
    if(!this.presentation||!this.context||!is428ProgressKernel(kernel))this.fail(s.pending,'Verified character menu required');
    const native=kernel.checkpoint();
    try{
      const result=kernel.selectCharacter(copy(s),this.progress.snapshot(),this.context.snapshot(),this.tutorialsEnabled,index);
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);
      s.flags=result.flags;s.script=result.script;s.pc=result.pc;s.label=result.label;s.enteredLabels[result.label]=true;
      delete s.ending;delete s.endingController;delete s.system;delete s.systemPosition;delete s.systemResume;delete s.readPosition;
      s.systemController={type:0,code:0,active:false};s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
      s.pending={kind:'presentation',id:s.pending.id,script:s.script,command:{type:'characterSelected'}};
    }catch(error){kernel.restore(native);this.rollback(before);throw error;}
  }
  choose(index,kernel){
    this.assertIdle();
    const event=this.state.pending;
    if(!this.presentation||event?.kind!=='choice'||!event.nativePreview||!this.context||!is428ProgressKernel(kernel))
      this.fail(event,'Verified choice selection controller required');
    const before=this.captureState(),native=kernel.checkpoint();
    try{
      const result=kernel.selectChoice(this.state,this.progress.snapshot(),this.context.snapshot(),index);
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.context.restore(result.context);
      const s=this.state;s.script=result.script;s.pc=result.pc;s.label=result.label;s.flags=result.flags;
      s.selections[event.id]=index;s.enteredLabels[result.label]=true;s.choicePreview=null;
      s.text='';s.segment='';s.fragments=[];s.tips=[];s.openTip=null;
      s.pending={kind:'presentation',id:event.id,script:before.state.script,command:{type:'choiceSelected'}};
      return s.pending;
    }catch(error){this.rollback(before);kernel.restore(native);throw error;}
  }
  // Research integration only: a verified native kernel and source-derived
  // character/hour context are required. Ordinary advance remains fail-closed.
  resolveRecompute(kernel,context){
    this.assertIdle();
    if(this.state.pending?.kind!=='recompute')this.fail(null,'No pending cross-character replay');
    const before=this.captureState(),native=kernel.checkpoint();
    try{
      if (this.context && context !== undefined) this.fail(null, 'Source checkpoint context cannot be overridden');
      const result=this.context
        ? kernel.recomputeWithContext(this.state,this.progress.snapshot(),this.context.snapshot())
        : kernel.recompute(this.state,this.progress.snapshot(),context);
      if(!Array.isArray(result.flags)||result.flags.length!==FLAG_COUNT||Array.from(result.flags).some(n=>!Number.isInteger(n)||n<0||n>255))
        this.fail(null,'Invalid recomputed flag bank');
      this.progress.restore(result.progress);if(this.flowKernel)this.state.flow=result.flow;this.state.flags=[...result.flags];this.state.pending=null;
      if (this.context) this.context.restore(result.context);
      return this.run();
    }catch(error){this.rollback(before);kernel.restore(native);throw error;}
  }
}
