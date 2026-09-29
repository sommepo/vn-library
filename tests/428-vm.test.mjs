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
  v.step();assert.equal(v.state.label,'0:start');assert.equal(v.state.stack.length,1);
  assert.equal(v.run().text,'After call');assert.equal(v.state.flags[2],1);assert.equal(v.state.stack.length,0);
});
test('cross-character replay requires an explicit verified kernel and context',()=>{
  for(const index of [31,90,287,290]){
    const v=vm([[0x5c,[index>>8,index&255]],[1,'Future'],[0x1e]]);
    assert.equal(v.run().kind,'recompute');assert.equal(v.state.flags[index],1);
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
