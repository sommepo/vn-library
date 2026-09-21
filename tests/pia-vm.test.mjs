// Original, code-only instruction fixtures. These are not commercial-game coverage.
import assert from 'node:assert/strict';
import test from 'node:test';
import {PiaVM} from '../web/adapters/pia-vm.mjs';

function program(rows, {source = 'TEST.SPC', locals = 0} = {}) {
  const widths = {MOVI:6, MOV:3, ADDI:6, SUBI:6, PUSHI:5, PUSH:2, POP:2, FUNC:5,
    LDGNVAR:4, LDLNVAR:3, DIVI:6, SURI:6, EQ:2, JUMPZ:6, JUMP:5, EXIT:1};
  let offset = 0;
  const instructions = rows.map(([op, args = [], extra = {}]) => {
    const instruction = {op, args, opcode:0, code_offset:offset, offset:offset + 22,
      size:widths[op], id:`${source}:code:${offset.toString(16).padStart(8, '0')}`, ...extra};
    assert.ok(instruction.size, op);
    offset += instruction.size;
    return instruction;
  });
  return {source, sha256:'original-test-fixture-v1', code_size:offset, stack_bytes:1024,
    local_number_variables:locals, local_string_variables:0, instructions, strings:[], failures:[], chunks:[]};
}

test('FUNC preserves argument order, overwrites count slot only on return, and balances R15', () => {
  const parsed = program([
    ['PUSHI',[11]], ['PUSHI',[22]], ['PUSHI',[2]], ['FUNC',[0],{native:'probe'}],
    ['POP',[0]], ['ADDI',[15,8]], ['PUSH',[0]], ['PUSHI',[1]], ['FUNC',[0],{native:'result'}],
    ['POP',[0]], ['ADDI',[15,4]], ['EXIT'],
  ]);
  const calls = [];
  const vm = new PiaVM({'TEST.SPC':parsed}, {entry:'TEST.SPC', native(name,args) {
    calls.push({name,args});
    return name === 'probe' ? {result:37} : {};
  }});
  vm.run();
  assert.deepEqual(calls, [{name:'probe',args:[11,22]}, {name:'result',args:[37]}]);
  assert.equal(vm.state.frame.registers[0], 1, 'no-write native retains the count slot');
  assert.equal(vm.state.frame.registers[15], parsed.code_size + parsed.stack_bytes);
});

test('global relocations and local array pointers survive a paused snapshot', () => {
  const parsed = program([
    ['MOVI',[0,3]], ['LDGNVAR',[0,0]], ['MOVI',[128,9]],
    ['MOVI',[1,0]], ['LDLNVAR',[0,1]], ['MOV',[129,128]],
    ['PUSHI',[0]], ['FUNC',[0],{native:'pause'}], ['POP',[0]],
    ['MOV',[0,129]], ['PUSH',[0]], ['PUSHI',[1]], ['FUNC',[0],{native:'inspect'}],
    ['POP',[0]], ['ADDI',[15,4]], ['EXIT'],
  ],{locals:1});
  parsed.chunks = [{kind:'NVAR',entries:[{name:'FLAGS',offsets:[parsed.instructions[1].code_offset+1]}]}];
  let calls = 0;
  const callback = (name,args) => {
    calls++;
    if (name === 'pause') return {pending:{kind:'test-pause'}};
    assert.deepEqual(args,[9]); return {};
  };
  const vm = new PiaVM({'TEST.SPC':parsed},{entry:'TEST.SPC',native:callback});
  vm.run();
  const saved = JSON.parse(JSON.stringify(vm.exportState()));
  const restored = new PiaVM({'TEST.SPC':parsed},{entry:'TEST.SPC',native:callback,state:saved});
  assert.equal(restored.getGlobal('FLAGS',3),9);
  restored.run(); restored.run();
  assert.equal(calls,1,'restoration and rerenders must not invoke current native again');
  restored.setGlobal('FLAGS',44,3);
  restored.advance();
  assert.equal(restored.getGlobal('FLAGS',3),44);
  assert.equal(restored.state.ended,true);
});

test('signed comparisons and division follow source integer semantics', () => {
  const parsed = program([
    ['MOVI',[0,0xfffffff3]], ['DIVI',[0,10]], ['PUSH',[0]],
    ['MOVI',[0,0xfffffff3]], ['SURI',[0,10]], ['PUSH',[0]],
    ['PUSHI',[2]], ['FUNC',[0],{native:'check'}], ['POP',[0]], ['ADDI',[15,8]], ['EXIT'],
  ]);
  const vm = new PiaVM({'TEST.SPC':parsed},{entry:'TEST.SPC',native(name,args){assert.deepEqual(args,[-1,-3]);return {};}});
  vm.run(); assert.equal(vm.state.ended,true);
});

test('native-controlled choice branches resume from saved state without rerunning prompt', () => {
  const parsed = program([
    ['PUSHI',[0]],['FUNC',[0],{native:'choice'}],['POP',[0]],['SUBI',[0,2]],['EQ',[0]],
    ['JUMPZ',[0,0]],['PUSHI',[22]],['JUMP',[0]],['PUSHI',[11]],['PUSHI',[1]],
    ['FUNC',[0],{native:'branch'}],['POP',[0]],['ADDI',[15,4]],['EXIT'],
  ]);
  parsed.instructions[5].args[1] = parsed.instructions[8].code_offset;
  parsed.instructions[7].args[0] = parsed.instructions[9].code_offset;
  const results = [];
  let prompts = 0;
  const native = (name,args) => {
    if(name === 'choice') {prompts++;return {pending:{kind:'choice'}};}
    results.push(args[0]);return {};
  };
  const vm = new PiaVM({'TEST.SPC':parsed},{entry:'TEST.SPC',native});
  vm.run(); const save=vm.exportState();
  vm.advance(2); assert.deepEqual(results,[22]);
  vm.restore(save); vm.advance(1); assert.deepEqual(results,[22,11]);
  assert.equal(prompts,1);
});

test('lazy chain preserves globals, resets local/register state and validates saved source', () => {
  const a = program([['PUSHI',[0]],['FUNC',[0],{native:'next'}],['EXIT']]);
  const b = program([['EXIT']],{source:'OTHER.SPC'});
  const vm = new PiaVM({'TEST.SPC':a},{entry:'TEST.SPC',native(name,args,vm){vm.chain('OTHER');return {};}});
  vm.setGlobal('PERSIST',42);
  assert.equal(vm.run().pending.script,'OTHER.SPC');
  vm.addScript(b); vm.resume();
  assert.equal(vm.state.frame.pc,0);
  assert.equal(vm.state.frame.registers[0],0);
  assert.equal(vm.getGlobal('PERSIST'),42);
  const saved=vm.exportState(); saved.frame.sourceSha256='wrong';
  assert.throws(()=>vm.restore(saved),/source\/state mismatch/);
  vm.run(); assert.equal(vm.state.ended,true);
});

test('unimplemented opcodes and unknown natives fail with a stable source location', () => {
  const parsed=program([['FUNC',[0],{op:'MYSTERY',opcode:0xee}],['EXIT']]);
  const vm=new PiaVM({'TEST.SPC':parsed},{entry:'TEST.SPC'});
  assert.throws(()=>vm.run(),/MYSTERY.*TEST\.SPC:code:00000000/);
  assert.throws(()=>vm.run(),/MYSTERY.*TEST\.SPC:code:00000000/);
  assert.equal(vm.pc,0,'repeated run cannot step past the unknown instruction');
  assert.equal(vm.state.ended,false);
});
