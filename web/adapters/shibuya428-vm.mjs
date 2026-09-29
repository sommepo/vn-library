/* SNS control VM under development. This is not a registered reader adapter.
 * Presentation, source-driven progress context and saves are needed for admission.
 * Unimplemented instructions throw without moving the source checkpoint. */
import {Operands, FLAG_COUNT, decodeBranch, decodeChoice, evaluate, choiceText} from './shibuya428-control.mjs';
import {Shibuya428Progress} from './shibuya428-progress.mjs';

const copy = structuredClone;
export class Shibuya428VM {
  constructor(scripts, entry) {
    this.scripts = scripts;
    this.progress = new Shibuya428Progress(scripts);
    this.tokens = Object.fromEntries(Object.entries(scripts).map(([id,s]) => [id,new Map(s.tokens.map(t=>[t.offset,t]))]));
    this.state = {script: entry.script, pc: 0, flags: Array(FLAG_COUNT).fill(0), stack: [],
      label: null, enteredLabels: {}, edges: {}, selections: {}, pending: null,
      text: '', segment: '', ruby: false, rubyText: '', fragments: [], mode: 'story'};
    this.jump(entry, null, false);
  }
  fail(i, message) { throw Error(`${i?.id || `${this.state.script}:${this.state.pc}`}: ${message}`); }
  target(target, i) {
    const label = this.scripts[target.script]?.labels[target.label];
    if (!label || !this.tokens[target.script]?.has(label.offset)) this.fail(i,'Unresolved source target');
    return label.offset;
  }
  jump(target, i, link = true) {
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
    const before = copy(this.state), progress=this.progress.bytes.slice();
    try { return this.executeInstruction(); }
    catch (error) { this.state = before; this.progress.bytes.set(progress); throw error; }
  }
  executeInstruction() {
    const s = this.state;
    if (s.pending) return s.pending;
    const i = this.tokens[s.script]?.get(s.pc);
    if (!i) this.fail(null,'Execution outside decoded source');
    s.pc = i.next;
    const r = i.code === 1 || i.code === 0x1c || i.code === 0x1d ? null : new Operands(i);
    switch (i.code) {
      case 0xab: r.end(); break;
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
        s.stack.push({script:s.script,pc:s.pc,label:s.label});
        // 0x0887a210 changes script/PC, retaining the caller's current label.
        s.script=t.script;s.pc=pc;break;
      }
      case 0x5b: case 0xbb: {
        r.end(); const caller=s.stack.pop(); if (!caller) this.fail(i,'Return without source caller');
        if (!this.tokens[caller.script]?.has(caller.pc)) this.fail(i,'Caller outside source');
        s.script=caller.script;s.pc=caller.pc;s.label=caller.label;break;
      }
      case 0xba: r.end(); break;
      case 0x5c: case 0x5d: {
        const index=r.flag(r.uint(2));r.end();
        // Native 0x08886d78 requests cross-character replay at these writes.
        // Returning an explicit event prevents accidentally continuing with stale flags.
        s.flags[index]=i.code===0x5c?1:0;
        if ((index>=31&&index<91)||index===287||index===290)
          s.pending={kind:'recompute',id:i.id,index};
        break;
      }
      case 0x53: case 0x54: case 0x55: {
        const choice=decodeChoice(i);
        const options=choice.options.map(option=>({
          ...option,...choiceText(this.scripts[option.script],this.target(option,i))
        }));
        s.pending={kind:'choice',id:i.id,...choice,options};break;
      }
      case 1:
        if (typeof i.text!=='string') this.fail(i,'Missing decoded source text');
        if(s.ruby)s.rubyText+=i.text;
        else {s.text+=i.text;s.segment+=i.text;s.fragments.push(i.id);}
        break;
      case 0x1c:s.ruby=true;s.rubyText='';break;
      case 0x1d:
        if(!s.ruby)this.fail(i,'Ruby terminator without reading');s.ruby=false;break;
      case 0x1b:r.end();s.text+='\n';s.segment+='\n';break;
      case 0x1e: case 0x1f:
        r.end();if(s.ruby)this.fail(i,'Boundary within ruby');
        s.pending={kind:'text',id:s.fragments[0]||i.id,text:s.segment.trimEnd(),pageText:s.text.trimEnd(),fragments:[...s.fragments],clear:i.code===0x1f};break;
      case 0x2d: {
        const frames=r.uint(4);r.end();s.pending={kind:'wait',id:i.id,frames};break;
      }
      default:this.fail(i,`Unsupported native SNS command 0x${i.code.toString(16)}`);
    }
    return s.pending;
  }
  run(limit=20000) {
    const before=copy(this.state),progress=this.progress.bytes.slice();
    try {for(let n=0;n<limit;n++){const p=this.executeInstruction();if(p)return p;}this.fail(null,'Instruction budget exhausted');}
    catch(error){this.state=before;this.progress.bytes.set(progress);throw error;}
  }
  advance(option) {
    const before=copy(this.state),progress=this.progress.bytes.slice();
    try {
      const s=this.state,p=s.pending;if(!p)return this.run();
      if(p.kind==='recompute')this.fail(null,'Verified native progress kernel and source context required');
      if(p.kind==='choice'){
        const selected=p.options.find(x=>x.index===option);
        if(!selected)this.fail(null,'Choose an offered source option');
        this.progress.select(s.label,option);
        s.selections[p.id]=option;this.jump(selected,{id:p.id});s.text='';s.segment='';s.fragments=[];
      }else if(p.kind==='text'){s.text=p.clear?'':s.text;s.segment='';s.fragments=[];}
      s.pending=null;return this.run();
    }catch(error){this.state=before;this.progress.bytes.set(progress);throw error;}
  }
  // Research integration only: a verified native kernel and source-derived
  // character/hour context are required. Ordinary advance remains fail-closed.
  resolveRecompute(kernel,context){
    if(this.state.pending?.kind!=='recompute')this.fail(null,'No pending cross-character replay');
    const before=copy(this.state),progress=this.progress.bytes.slice(),native=kernel.checkpoint();
    try{
      const result=kernel.recompute(this.state,this.progress.snapshot(),context);
      if(!Array.isArray(result.flags)||result.flags.length!==FLAG_COUNT||Array.from(result.flags).some(n=>!Number.isInteger(n)||n<0||n>255))
        this.fail(null,'Invalid recomputed flag bank');
      this.progress.restore(result.progress);this.state.flags=[...result.flags];this.state.pending=null;
      return this.run();
    }catch(error){this.state=before;this.progress.bytes.set(progress);kernel.restore(native);throw error;}
  }
}
