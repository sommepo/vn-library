import test from 'node:test';
import assert from 'node:assert/strict';
import {Shibuya428VM} from '../web/adapters/shibuya428-vm.mjs';
const label=s=>[...Buffer.from(s),0],target=s=>[0,...label(s)];
function fixture(rows,labels={start:0}){
  return {0:{index:0,size:rows.length+1,content_offset:0,labels:Object.fromEntries(Object.entries(labels).map(([k,v],n)=>[k,{offset:v,bucket:0,table_offset:n}])),
    tokens:rows.map(([code,args],offset)=>({id:`fixture:${offset}`,offset,next:offset+1,code,
      ...(typeof args==='string'?{text:args}:{args:args||[]})}))}};
}
const vm=(rows,labels)=>new Shibuya428VM(fixture(rows,labels),{script:0,label:'start'});
test('source segments exclude ruby readings and previously presented page text',()=>{
  const v=vm([[0x1c],[1,'reading'],[0x1d],[1,'漢字'],[0x1b],[0x1e],[1,'Next'],[0x1f],[1,'New page'],[0x1e]]);
  let p=v.run();assert.equal(p.text,'漢字');assert.deepEqual(p.fragments,['fixture:3']);
  p=v.advance();assert.equal(p.text,'Next');assert.equal(p.pageText,'漢字\nNext');
  p=v.advance();assert.equal(p.text,'New page');assert.equal(p.pageText,'New page');
});
test('the native spacing marker changes display text without changing recovered source',()=>{
 const scripts=fixture([[1,'文\u4edd章'],[0x1e]]),runner=new Shibuya428VM(scripts,{script:0,label:'start'});
 assert.equal(runner.run().text,'文 章');assert.equal(scripts[0].tokens[0].text,'文\u4edd章');
});
test('false branch follows its source target, true branch falls through',()=>{
  const rows=[[0x57,[0,2,7,0,1,...target('false')]],[1,'true'],[0x1e],[1,'false'],[0x1e]];
  const a=vm(rows,{start:0,false:3});assert.equal(a.run().text,'false');
  const b=vm(rows,{start:0,false:3});b.state.flags[2]=1;assert.equal(b.run().text,'true');
});
test('choice preview cannot execute writes from unselected options',()=>{
  const v=vm([[0x53,[1,0,0,2,0,...target('left'),0,...target('right')]],
    [0x52,target('_leftbody')],[0x5c,[0,2]],[1,'Left'],[0x5e],
    [0x52,target('_rightbody')],[0x5c,[0,3]],[1,'Right'],[0x5e],
    [0x5c,[0,4]],[1,'Selected left'],[0x1e],
    [0x5c,[0,5]],[1,'Selected right'],[0x1e]],
    {start:0,left:1,right:5,_leftbody:9,_rightbody:12});
  const p=v.run();assert.deepEqual(p.options.map(o=>o.text),['Left','Right']);
  assert.deepEqual(v.state.flags.slice(2,6),[0,0,0,0]);
  const before=structuredClone(v.state);assert.throws(()=>v.advance(4),/offered/);assert.deepEqual(v.state,before);
  assert.equal(v.advance(1).text,'Selected right');assert.deepEqual(v.state.flags.slice(2,6),[0,0,0,1]);
  assert.equal(v.progress.record('0:start').choice,2);assert.equal(v.progress.record('0:start').complete,true);
  assert.equal(v.progress.record('0:right').complete,false); // internal transfer retains current label
});
test('native call keeps the caller label and returns to the source continuation',()=>{
  const v=vm([[0x5a,target('function')],[1,'After call'],[0x1e],[0x5c,[0,2]],[0x5b]],{start:0,function:3});
  v.progress.complete('0:function');
  v.step();assert.equal(v.state.label,'0:start');assert.equal(v.state.stack.length,1);
  assert.equal(v.progress.record('0:function').complete,false);
  assert.equal(v.run().text,'After call');assert.equal(v.state.flags[2],1);assert.equal(v.state.stack.length,0);
  assert.equal(v.progress.record('0:function').complete,true);assert.equal(v.progress.record('0:function').replayed,true);
});
test('a called checkpoint keeps the caller page and does not update checkpoint context',()=>{
  const v=vm([[0x5a,target('function')],[1,'After'],[0x1e],[0x22,[0]],[1,'Inside'],[0x5b]],{start:0,function:3});
  v.state.text='Retained';v.step();v.step();assert.equal(v.state.text,'Retained');assert.equal(v.state.label,'0:start');
  assert.equal(v.run().pageText,'RetainedInsideAfter');
});
test('cross-character replay requires an explicit verified kernel and context',()=>{
  for(const index of [31,90,287,290]){
    const v=vm([[0x5c,[index>>8,index&255]],[1,'Future'],[0x1e]]);
    assert.equal(v.run().kind,'recompute');assert.equal(v.state.flags[index],1);
    assert.equal(v.progress.record('0:start').readPc,1);
    const before=structuredClone(v.state);assert.throws(()=>v.advance(),/kernel and source context required/);assert.deepEqual(v.state,before);
  }
});
test('unsupported commands, invalid targets and stack overflow roll back the batch',()=>{
  for(const rows of [[[0x5c,[0,2]],[0xc0,[1,3]]],[[0x5a,target('start')]],[[0x59,target('missing')]]]){
    const v=vm(rows),before=structuredClone(v.state),progress=v.progress.snapshot();assert.throws(()=>v.run());assert.deepEqual(v.state,before);assert.deepEqual(v.progress.snapshot(),progress);
  }
});
test('failed selected branch rolls back both graph completion and choice selection',()=>{
 const v=vm([[0x53,[1,0,0,1,0,...target('option')]],[0x52,target('_body')],[1,'Option'],[0x5e],[0xc0,[1,3]]],{start:0,option:1,_body:4});
 v.run();const state=structuredClone(v.state),progress=v.progress.snapshot();
 assert.throws(()=>v.advance(0),/Unsupported/);assert.deepEqual(v.state,state);assert.deepEqual(v.progress.snapshot(),progress);
});
test('explicit recomputation changes branch flags and rolls back the native transaction on a later stop',()=>{
 const rows=[[0x5c,[0,31]],[0x57,[0,2,7,0,1,...target('other')]],[1,'Changed path'],[0x1e],[0xc0,[1,3]]];
 const v=vm(rows,{start:0,other:4});v.run();let nativeState=0;
 const kernel={checkpoint:()=>nativeState,restore:value=>{nativeState=value;},recompute:(state,progress)=>{
  nativeState++;const flags=[...state.flags];flags[2]=1;return {flags,progress};
 }};
 assert.equal(v.resolveRecompute(kernel,{character:0,hour:0}).text,'Changed path');assert.equal(nativeState,1);
 const bad=vm([[0x5c,[0,31]],[0xc0,[1,3]]]);bad.run();const state=structuredClone(bad.state),progress=bad.progress.snapshot();
 assert.throws(()=>bad.resolveRecompute(kernel,{}),/Unsupported/);assert.equal(nativeState,1);
 assert.deepEqual(bad.state,state);assert.deepEqual(bad.progress.snapshot(),progress);
});

const sourceContext={prefixes:[...'ABCDEFGHIJ'],labels:['A_start','D_late'],times:[['A_start',10,5],['D_late',17,5]]};
test('TIP spans retain source targets and prior read status without earning completion',async()=>{
 const scripts=fixture([[1,'Before '],[0x6c,[0,255,255,...target('tip')]],[1,'linked words'],[0x6e],[0x1e],[1,'TIP body'],[0x1f]],{start:0,tip:5});
 for(const visited of [false,true]){
  const runner=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1'});
  if(visited)runner.progress.complete('0:tip');
  runner.run();await runner.present({apply:async()=>{}});
  const event=runner.run();assert.equal(event.command.type,'tipStart');assert.equal(event.command.visited,visited);
  await runner.present({apply:async()=>{}});runner.run();await runner.present({apply:async()=>{}});
  assert.equal(runner.run().command.type,'tipEnd');await runner.present({apply:async()=>{}});
  assert.equal(runner.run().text,'Before linked words');
  assert.deepEqual(runner.state.tips,[{id:'fixture:1',target:{script:0,label:'tip'},start:7,end:19,visited}]);
  assert.equal(runner.progress.record('0:tip').complete,visited);
 }
});
test('TIP source failures restore text ranges and cannot discard an open link at checkpoints',async()=>{
 for(const bad of [[0x6c,[0,255,255,...target('start')]],[0x22,[1]]]){
  const scripts=fixture([[0x6c,[0,255,255,...target('start')]],bad],{start:0});
  const runner=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1',contextData:sourceContext});
  runner.run();await runner.present({apply:async()=>{}});const before=runner.captureState();
  assert.throws(()=>runner.run(),/TIP span|unpresented/);assert.deepEqual(runner.captureState(),before);
 }
});
test('a caller cannot acknowledge a tutorial using a fake completion callback',async()=>{
 const scripts=fixture([[0x22,[1]],[0xc0,[2,3]]],{A_start:0});
 const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{presentation:'sns-numeric-v1',contextData:sourceContext,tutorialsEnabled:true});
 runner.run();await runner.present({apply:async()=>{}});runner.run();const before=runner.captureState();
 await assert.rejects(runner.presentSystem({finish:()=>Array(2000).fill(1)},{frame:async()=>({confirm:true}),draw:async()=>{}}),/Verified tutorial/);
 assert.deepEqual(runner.captureState(),before);
});
test('source checkpoints derive character context, mark restart records and clear retained pages',()=>{
  const scripts=fixture([[0x22,[1]],[1,'Presented page'],[0x1e],[0x56,target('D_late')],
    [0x22,[1]],[1,'Later page'],[0x1e]],{A_start:0,D_late:4});
  const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext});
  assert.deepEqual(runner.run().context,{character:0,hour:0});
  assert.equal(runner.progress.record('0:A_start').extraBits,0x8000);
  assert.equal(runner.advance().text,'Presented page');
  assert.deepEqual(runner.advance().context,{character:10,hour:7});
  assert.equal(runner.context.snapshot().restarts[0],'A_start');
  assert.equal(runner.advance().pageText,'Later page');
});
test('checkpoint failures retain context and never discard unpresented text',()=>{
  const scripts=fixture([[0x22,[1]],[0x56,target('D_late')],[0x22,[1]],[0xfe]],{A_start:0,D_late:2});
  const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext});
  runner.run();runner.advance();
  const before=runner.captureState();
  assert.throws(()=>runner.advance(),/Unsupported/);assert.deepEqual(runner.captureState(),before);
  const buffered=new Shibuya428VM(fixture([[1,'Unpresented'],[0x22,[1]]],{A_start:0}),
    {script:0,label:'A_start'},{contextData:sourceContext});
  const initial=buffered.captureState();
  assert.throws(()=>buffered.run(),/unpresented source text/);assert.deepEqual(buffered.captureState(),initial);
  const missing=new Shibuya428VM(scripts,{script:0,label:'A_start'});
  assert.throws(()=>missing.run(),/checkpoint metadata/);
});
test('recalculation uses source-derived context and restores it after later failure',()=>{
  const scripts=fixture([[0x22,[1]],[0x5c,[0,31]],[0x56,target('D_late')],[0x22,[1]],[0xfe]],
    {A_start:0,D_late:3});
  const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext});
  runner.run();runner.advance();let nativeState=0;
  const kernel={checkpoint:()=>nativeState,restore:value=>{nativeState=value;},
    recomputeWithContext:(state,progress,context)=>{
      assert.equal(context.character,0);assert.equal(context.hour,0);nativeState++;
      return {flags:[...state.flags],progress,context};
    }};
  const before=runner.captureState();
  assert.throws(()=>runner.resolveRecompute(kernel,{character:4,hour:9}),/cannot be overridden/);
  assert.deepEqual(runner.captureState(),before);assert.equal(nativeState,0);
  assert.deepEqual(runner.resolveRecompute(kernel).context,{character:10,hour:7});
  assert.equal(nativeState,1);
  const rejected={...kernel,recomputeWithContext:(state,progress,context)=>{
    nativeState++;return {flags:state.flags,progress,context:{...context,signature:'wrong'}};
  }};
  runner.rollback(before);
  assert.throws(()=>runner.resolveRecompute(rejected),/incompatible snapshot/);
  assert.deepEqual(runner.captureState(),before);assert.equal(nativeState,1);
});

test('system requests retain their checkpoint and cannot be skipped or marked seen',()=>{
  const scripts=fixture([[0x22,[1]],[0xc0,[2,20]],[1,'Still blocked'],[0x1e]],{A_start:0});
  const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext,tutorialsEnabled:true});
  runner.run();const event=runner.advance();
  assert.equal(event.kind,'system');assert.equal(event.plan.code,19);assert.equal(event.plan.request,62);
  assert.equal(runner.progress.record('0:A_start').readPc,2);
  assert.deepEqual(runner.state.systemResume,{script:0,pc:2});
  const before=runner.captureState();
  for(const option of [undefined,0,true])assert.throws(()=>runner.advance(option),/controller and presentation/);
  assert.deepEqual(runner.captureState(),before);assert.equal(runner.state.flags[0x440+19],0);
});
test('only inert or already seen system decisions can continue without a controller',()=>{
  const scripts=fixture([[0x22,[1]],[0x80,[5,0,0,0]],[0xc0,[1,3]],[0xc0,[2,21]],[1,'Continued'],[0x1e]],{A_start:0});
  const runner=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext,tutorialsEnabled:true});
  runner.state.flags[0x440+21]=1;
  runner.run();assert.equal(runner.advance().plan.request,null);
  assert.equal(runner.progress.record('0:A_start').complete,true);
  assert.equal(runner.advance().text,'Continued');
});

test('presented choices compose source options without entering their branches or counting preview text',async()=>{
 const scripts=fixture([[0x53,[1,0,0,2,0,...target('left'),0,...target('right')]],
  [0x22,[0]],[0x52,target('_branch')],[0x5c,[0,2]],[1,'Left'],[0x1b],[0x5e],
  [0x22,[0]],[1,'Right'],[0xbc],[0x5e],[1,'Selected branch'],[0x1e]],{start:0,left:1,right:7,_branch:11});
 const v=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1'}),events=[];
 for(let n=0;n<20;n++){const e=v.run();events.push(e);if(e.kind==='choice')break;assert.equal(e.kind,'presentation');await v.present({apply:async()=>{}});}
 const choice=events.at(-1);assert.equal(choice.kind,'choice');assert.deepEqual(choice.options.map(o=>[o.text,o.recommended]),[['Left',false],['Right',true]]);
 assert.equal(v.state.label,'0:start');assert.equal(v.state.pc,1);assert.equal(v.state.flags[2],0);assert.equal(v.state.text,'');assert.equal(v.state.segment,'');
 assert.equal(v.progress.record('0:start').complete,true);assert.equal(v.progress.record('0:start').replayed,true);assert.equal(v.progress.record('0:start').choice,0);
 for(const label of ['left','right'])assert.equal(v.progress.record(`0:${label}`).complete,false);
 const before=v.captureState();assert.throws(()=>v.advance(0),/selection controller/);assert.deepEqual(v.captureState(),before);
});

test('a source tutorial pauses choice composition and cannot be skipped to expose a selection',async()=>{
 const scripts=fixture([[0x22,[1]],[0x53,[1,0,0,1,0,...target('option')]],
  [0x22,[0]],[1,'Option'],[0xc0,[2,5]],[0x5e],[1,'Future'],[0x1e]],{A_start:0,option:2});
 const v=new Shibuya428VM(scripts,{script:0,label:'A_start'},{presentation:'sns-numeric-v1',contextData:sourceContext,tutorialsEnabled:true});
 const seen=[];for(let n=0;n<10;n++){const e=v.run();seen.push(e.kind);if(e.kind==='system')break;await v.present({apply:async()=>{}});}
 assert.equal(v.state.pending.kind,'system');assert.equal(v.state.pending.plan.code,5);assert.equal(v.state.choicePreview.index,0);assert.equal(v.state.choicePreview.done,false);
 assert.equal(v.state.label,'0:A_start');assert.equal(v.state.flags[0x445],0);assert.equal(v.progress.record('0:option').complete,false);assert.ok(!seen.includes('choice'));
 const before=v.captureState();assert.throws(()=>v.advance(),/controller/);assert.deepEqual(v.captureState(),before);
 await assert.rejects(v.presentSystem({start:()=>({done:true}),finish:()=>[]},{frame:async()=>({}),draw:async()=>{}}),/Verified/);assert.deepEqual(v.captureState(),before);
});

test('interruptible waits cannot be acknowledged as ordinary text or by a fabricated kernel',async()=>{
 const scripts=fixture([[0x2e,[255,255,255,255]],[1,'Later']]);
 const v=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1'});
 assert.equal(v.run().kind,'inputWait');const before=v.captureState();
 assert.throws(()=>v.advance(),/interruptible/);await assert.rejects(v.present({apply:async()=>{}}),/presentation boundary/);
 await assert.rejects(v.presentWait({start:()=>({done:true})},{frame:async()=>({}),draw:async()=>{}}),/Verified/);
 assert.deepEqual(v.captureState(),before);
});
test('ending records do not end execution or acknowledge the following controller',async()=>{
 const scripts=fixture([[0x62,[1,0,92]],[0xc0,[1,255]]]);
 const v=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1'});
 assert.equal(v.run().kind,'wait');assert.equal(v.state.flags[491],1);assert.equal(v.state.flags[0x229],1);assert.equal(v.progress.record('0:start').complete,true);
 await v.present({apply:async()=>{}});const before=v.captureState();assert.throws(()=>v.run(),/source context/);assert.deepEqual(v.captureState(),before);
});
test('source page commits distinguish a nonblocking hint page from a reading pause',async()=>{
 const scripts=fixture([[1,'Hint body'],[0x20],[0x2e,[255,255,255,255]]]);
 const v=new Shibuya428VM(scripts,{script:0,label:'start'},{presentation:'sns-numeric-v1'});
 v.run();await v.present({apply:async()=>{}});const page=v.run();assert.equal(page.auto,true);assert.equal(page.clear,false);assert.equal(page.text,'Hint body');
 await v.present({apply:async()=>{}});assert.equal(v.run().kind,'inputWait');assert.equal(v.state.text,'Hint body');assert.equal(v.state.segment,'');
 assert.equal(v.progress.record('0:start').complete,true);
});
test('hint activation and return require their source caller and restore a failed transaction',()=>{
 const v=new Shibuya428VM(fixture([[0x77]]),{script:0,label:'start'},{presentation:'sns-numeric-v1'}),before=v.captureState();
 assert.throws(()=>v.openHint(),/Source hint/);assert.throws(()=>v.run(),/hint return/);assert.deepEqual(v.captureState(),before);
});
test('ending return, persistence and navigation cannot be consumed with ordinary Next',async()=>{
 const scripts=fixture([[0x22,[1]],[0x62,[1,0,1]],[0xac],[1,'Unrelated following script']],{A_start:0});
 const v=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext,presentation:'sns-numeric-v1'});
 v.run();await v.present({apply:async()=>{}});v.run();await v.present({apply:async()=>{}});
 assert.equal(v.run().kind,'endingReturn');const before=v.captureState();
 assert.throws(()=>v.resolveEnding({beginEnding:()=>({})}),/Verified/);assert.deepEqual(v.captureState(),before);
 for(const kind of ['endingReturn','endingSave','endingSaved','navigation']){
  v.state.pending={kind,id:'fixture:2'};const checkpoint=v.captureState();
  assert.throws(()=>v.advance(),/controller/);await assert.rejects(v.present({apply:async()=>{}}),/presentation boundary/);
  assert.deepEqual(v.captureState(),checkpoint);
 }
});
test('ending persistence retains the retry checkpoint on failure and commits before navigation',async()=>{
 const scripts=fixture([[0x22,[1]],[0x62,[1,0,1]],[0xac]],{A_start:0});
 const v=new Shibuya428VM(scripts,{script:0,label:'A_start'},{contextData:sourceContext,presentation:'sns-numeric-v1'});
 v.run();await v.present({apply:async()=>{}});v.run();await v.present({apply:async()=>{}});v.run();
 // Synthetic persistence-stage fixture. The actual source controller is
 // checked separately against owner-supplied native code, never fabricated.
 v.state.pending={kind:'endingSave',id:'fixture:2'};v.state.endingController={phase:'save'};
 const before=v.captureState();
 await assert.rejects(v.persistEnding({write:async snapshot=>{snapshot.state.flags[0]=255;throw Error('Disk full');}}),/Disk full/);
 assert.deepEqual(v.captureState(),before);
 let writes=0;
 await v.persistEnding({write:async snapshot=>{
  writes++;assert.equal(snapshot.state.pending.kind,'endingSave');assert.equal(snapshot.progress.signature,v.progress.signature);
  assert.throws(()=>v.advance(),/in progress/);assert.equal(v.state.pending.kind,'endingSave');
 }});
 assert.equal(writes,1);assert.equal(v.state.pending.kind,'endingSaved');
 const saved=v.captureState();assert.throws(()=>v.resolveEndingSave({}),/Verified/);
 await assert.rejects(v.persistEnding({write:async()=>writes++}),/backend required/);
 assert.equal(writes,1);assert.deepEqual(v.captureState(),saved);
});

test('timeline requests cannot be discarded by ordinary advance',()=>{
 const vm=new Shibuya428VM(fixture([[0xfe]]),{script:0,label:'start'},{presentation:'sns-numeric-v1'});
 for(const kind of ['menuRequest','menuPaused','timeline','timelineResume']){
  vm.state.pending={kind,id:'synthetic:timeline',menu:4};const before=vm.captureState();
  assert.throws(()=>vm.advance(),/Explicit timeline controller/);assert.deepEqual(vm.captureState(),before);
 }
});
test('link selection and unverified JUMP spans cannot be discarded or entered',()=>{
 const v=vm([[0x70,[0,0,1,7,0,1,...target('end'),0,1,0,2]],[1,'Future'],[0x1e]],{start:0,end:1});
 const before=v.captureState();assert.throws(()=>v.run(),/verified source context/);assert.deepEqual(v.captureState(),before);
 for(const kind of ['linkSelection','jumpDialog','jumpTransition','tipControl','tip','tipClose','tipResume']){
  v.state.pending={kind,id:'synthetic:links',selected:0};const pending=v.captureState();
  assert.throws(()=>v.advance(),/Explicit source link selection/);
  assert.throws(()=>v.selectLink(0,{}),/Verified/);
  assert.throws(()=>v.decideJump(true,{}),/Verified/);
  assert.throws(()=>v.resolveJumpTransition({}),/Verified/);
  assert.throws(()=>v.openTip(0,{}),/Verified/);
  assert.throws(()=>v.closeTip({}),/Verified/);
  assert.throws(()=>v.resolveTipControl({}),/Verified/);
  assert.throws(()=>v.resolveTipClose({}),/Verified/);
  assert.throws(()=>v.resolveTipReplay({}),/Verified/);
  assert.deepEqual(v.captureState(),pending);
 }
});
