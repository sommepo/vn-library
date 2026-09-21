// Original instruction probes; no commercial text or media is bundled.
import assert from 'node:assert/strict';
import test from 'node:test';
import {PiaVM} from '../web/adapters/pia-vm.mjs';
import {invokeSchedule,piaDayCount} from '../web/adapters/pia-schedule.mjs';
import {PiaNatives} from '../web/adapters/pia-natives.mjs';

function program(source,rows) {
  const widths={PUSHI:5,PUSH:2,POP:2,ADDI:6,FUNC:5,EXIT:1};let offset=0;
  const instructions=rows.map(([op,args=[],native])=>{
    const size=widths[op],code_offset=offset;offset+=size;
    return {op,args,size,native,code_offset,offset:code_offset+22,opcode:0,id:`${source}:code:${code_offset.toString(16).padStart(8,'0')}`};
  });
  return {source,sha256:'original-schedule-test-v1',code_size:offset,stack_bytes:128,local_number_variables:0,local_string_variables:0,instructions,strings:[],chunks:[]};
}
const helper=(args,strings=[])=>({str:index=>strings[index]??String(args[index]),count:(...allowed)=>assert.ok(allowed.includes(args.length)),problem:message=>{throw new Error(message);}});

test('source menu comparison, action clearing and fixed schedule preserve actual state',()=>{
  const state={menuTopScenarioName:'7M30DN',roomRest:9,firstMessage:9,actionWho:9,roomAction:9,roomActionWhere:9,roomActionCall:9,roomActionMove:9};
  const call=(name,args=[],strings=[])=>invokeSchedule(name,args,null,{id:'original-test'},state,helper(args,strings));
  assert.equal(call('MenuTopScenarioNameCmp',[0],['7m30dn']).result,0);
  assert.notEqual(call('MenuTopScenarioNameCmp',[0],['7m31dn']).result,0);
  call('ActionClear');assert.deepEqual(Object.values(state).slice(1),[0,0,0,0,0,0,0]);
  call('SetFirstMessage',[255]);assert.equal(state.firstMessage,-1);
  call('SetConstSchedule',[8,1,2,6]);assert.deepEqual(state.scheduleFlags,{'15':1,'16':2,'17':6});
  call('SetSchedule',[8,1,3,8]);assert.deepEqual(state.scheduleFlags,{'15':0,'16':3,'17':8});
  call('AddTenderness',[5]);assert.equal(call('Tenderness').result,5);
  call('AddTenderness',[200]);assert.equal(state.tenderness,120);
  call('Tenderness',[-10]);assert.equal(state.tenderness,0);
  state.time=[18,0];assert.equal(call('IsTimeAfter',[18,0]).result,1);assert.equal(call('IsTimeAfter',[18,1]).result,0);
  assert.equal(piaDayCount(7,30),3);assert.equal(piaDayCount(7,31),4);assert.equal(piaDayCount(8,31),35);
  assert.throws(()=>call('SetSchedule',[9,1,2,3]),/calendar/);
});

for(const result of [0,1,-5])test(`nested ScReturn(${result}) restores the correct caller and survives a paused snapshot`,()=>{
  const root=program('ROOT.SPC',[
    ['PUSHI',[1]],['PUSHI',[1]],['FUNC',[0],'CALL'],['POP',[0]],['ADDI',[15,4]],
    ['PUSH',[0]],['PUSHI',[1]],['FUNC',[0],'probe'],['POP',[0]],['ADDI',[15,4]],['EXIT'],
  ]);
  const mid=program('MID.SPC',[
    ['PUSHI',[2]],['PUSHI',[1]],['FUNC',[0],'CALL'],['POP',[0]],['ADDI',[15,4]],
    ['PUSHI',[0]],['FUNC',[0],'ChangeMessage'],['EXIT'],
  ]);
  const leaf=program('LEAF.SPC',[
    ['PUSHI',[0]],['FUNC',[0],'pause'],['POP',[0]],
    ['PUSHI',[result]],['PUSHI',[1]],['FUNC',[0],'ScReturn'],['EXIT'],
  ]);
  const observed=[];
  const native=(name,args,vm,instruction)=>{
    if(name==='pause')return {pending:{kind:'wait',id:instruction.id,ms:1}};
    if(name==='probe'){observed.push(args[0]);return {};}
    return invokeSchedule(name,args,vm,instruction,vm.state.native,helper(args,args.map(v=>({1:'MID',2:'LEAF'})[v])));
  };
  const vm=new PiaVM({'ROOT.SPC':root,'MID.SPC':mid,'LEAF.SPC':leaf},{entry:'ROOT.SPC',native});
  vm.setGlobal('KEEP',7);vm.run();assert.equal(vm.state.parents.length,2);
  const saved=vm.exportState();vm.advance();
  assert.deepEqual(observed,[Math.sign(result)]);assert.equal(vm.state.ended,true);assert.equal(vm.getGlobal('KEEP'),7);
  vm.restore(saved);vm.advance();assert.deepEqual(observed,[Math.sign(result),Math.sign(result)]);
  assert.equal(vm.state.frame.registers[15],root.code_size+root.stack_bytes);
});

test('native CALL lazy loading retains zero caller result and ChangeMessage resets a root',()=>{
  const root=program('ROOT.SPC',[['PUSHI',[1]],['PUSHI',[1]],['FUNC',[0],'CALL'],['POP',[0]],['ADDI',[15,4]],['EXIT']]);
  const child=program('MID.SPC',[['PUSHI',[0]],['FUNC',[0],'ChangeMessage'],['EXIT']]);
  const vm=new PiaVM({'ROOT.SPC':root},{entry:'ROOT.SPC',native:(name,args,vm,instruction)=>invokeSchedule(name,args,vm,instruction,vm.state.native,helper(args,['MID']))});
  assert.equal(vm.run().pending.mode,'exec');vm.addScript(child);vm.resume();vm.run();
  assert.equal(vm.state.frame.registers[0],0);assert.equal(vm.state.ended,true);
  vm.setGlobal('KEEP',3);vm.restartScenario();assert.equal(vm.pc,0);assert.equal(vm.getGlobal('KEEP'),3);
});

test('source FILEERR fallback applies to absent originals, never failed conversion',()=>{
  const bridge=new PiaNatives({nativeData:{sourceImageContainers:{cg:['FILEERR','PRESENT']}},resources:{cg:{FILEERR:'original-error-image'}},assets:{}});
  const state={warnings:[]},instruction={id:'ORIGINAL-TEST:missing-image'};
  assert.equal(bridge.imageAsset('cg','ABSENT',state,instruction),'original-error-image');
  assert.equal(state.warnings.length,1);assert.equal(state.warnings[0].source,instruction.id);
  assert.throws(()=>bridge.imageAsset('cg','PRESENT',state,instruction),/unresolved cg resource PRESENT/);
});
