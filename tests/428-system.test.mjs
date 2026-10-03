import test from 'node:test';
import assert from 'node:assert/strict';
import {plan428System, needs428SystemController} from '../web/adapters/shibuya428-system.mjs';
const context = () => ({flags:Array(2048).fill(0), character:0, tutorialsEnabled:true});
const tutorial = (code, state) => plan428System({type:2, code}, state);

test('tutorial selection depends on character and earned flags without marking seen', () => {
  const state = context(), before = structuredClone(state);
  assert.equal(tutorial(20,state).code,19);
  assert.deepEqual(state,before);
  state.character=1; assert.equal(tutorial(20,state).code,18);
  state.flags[34]=1; assert.equal(tutorial(20,state).code,42);
  state.flags[300]=state.flags[301]=1; assert.equal(tutorial(20,state).code,20);
  state.flags[0x440+20]=1;
  const seen=tutorial(20,state); assert.equal(seen.yield,true); assert.equal(needs428SystemController(seen),false);
});
test('tutorial suppression retains special system events and message callbacks', () => {
  const state=context();
  for(const code of [9,14]) {
    assert.equal(tutorial(code,state).request,62);
    state.flags[0x440+code]=1;
    const followup=tutorial(code,state);
    assert.equal(followup.request,63); assert.equal(followup.yield,true);
    assert.deepEqual(followup.callbacks,['resetMessage']);
  }
  state.flags[0x440+13]=1;
  assert.equal(tutorial(9,state).yield,false); assert.equal(tutorial(14,state).yield,true);
  state.flags[0x440+17]=1; assert.equal(tutorial(14,state).yield,false);
  state.tutorialsEnabled=false;
  assert.equal(tutorial(20,state).yield,false);
  assert.deepEqual(tutorial(6,state), {type:0,code:1,yield:true,request:null,active:true,callbacks:[]});
  state.tutorialsEnabled=true;
  assert.equal(tutorial(6,state).request,62);
  state.flags[0x440+6]=1;
  assert.equal(tutorial(6,state).active,true);
});
test('native system requests stay distinct from a harmless yield and unknown controllers fail', () => {
  const state=context();
  assert.equal(needs428SystemController(plan428System({type:1,code:255},state)),true);
  assert.equal(needs428SystemController(plan428System({type:1,code:3},state)),false);
  assert.deepEqual(plan428System({type:0,code:12},state).callbacks,['resetPresentation']);
  for(const code of [0,1,2,5]) assert.throws(()=>plan428System({type:1,code},state),/Unsupported/);
  for(const invalid of [{...state,character:null},{...state,tutorialsEnabled:1},{...state,flags:Array(2048)}])
    assert.throws(()=>tutorial(20,invalid));
});
