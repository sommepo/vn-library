import test from 'node:test';
import assert from 'node:assert/strict';
import {PiaNatives} from '../web/adapters/pia-natives.mjs';
import {taskPose} from '../web/adapters/pia-task.mjs';

// Original test data: no game text or images. Positions and native semantics
// checked here are independently documented ELF observations in pia-natives.md.
test('CG129 actions preserve busy boundaries, source poses, records and teardown',()=>{
  const assets=Object.fromEntries(['BGH','BGV','MN','MT','ON','OT'].map(n=>[`NETC.NFP:TAKA129.MLH:129${n}.NBP`,{type:'image',url:`test/${n}.png`}]));
  const bridge=new PiaNatives({assets});const vm={state:{native:{}}};
  const invoke=(name,args)=>bridge.invoke(name,args,vm,{id:`original-test:${name}`});
  const wake=invoke('TaskWakeUp',[0]);assert.equal(wake.result,0);assert.equal(wake.pending.kind,'task');
  assert.deepEqual(vm.state.native.pia.systemCG,{430:true,431:true});
  assert.throws(()=>invoke('TaskActionSet',[0,1]),/has not completed/);
  bridge.completeTask(vm);invoke('TaskActionSet',[0,1]);
  vm.state.native.pia.scene.task.frame=60;
  const saved=structuredClone(vm.state),pose=taskPose(vm.state.native.pia.scene.task);
  bridge.completeTask(vm);assert.equal(taskPose(vm.state.native.pia.scene.task).mx,-117);
  assert.equal(taskPose(vm.state.native.pia.scene.task).tx,11);
  vm.state=saved;assert.deepEqual(taskPose(vm.state.native.pia.scene.task),pose);
  bridge.completeTask(vm);invoke('TaskActionSet',[0,2]);bridge.completeTask(vm);
  assert.equal(taskPose(vm.state.native.pia.scene.task).my,18);
  invoke('TaskActionSet',[0,3]);bridge.completeTask(vm);
  assert.equal(taskPose(vm.state.native.pia.scene.task).near,false);
  invoke('TaskActionSet',[0,4]);bridge.completeTask(vm);
  const far=taskPose(vm.state.native.pia.scene.task);assert.equal(far.horizontal,false);
  assert.equal(far.vertical,true);assert.equal(far.mx,320);assert.equal(far.my,64);assert.equal(far.scale,1.5);
  invoke('TaskActionSet',[0,5]);bridge.completeTask(vm);
  const last=taskPose(vm.state.native.pia.scene.task);assert.equal(last.mx,480);assert.equal(last.my,652);assert.equal(last.scale,1);
  invoke('TaskKill',[0]);assert.ok(vm.state.native.pia.scene.task);bridge.completeTask(vm);
  assert.equal(vm.state.native.pia.scene.task,null);assert.equal(vm.state.native.pia.scene.background,null);
  assert.equal(vm.state.native.pia.dateWindowVisible,true);
  assert.throws(()=>invoke('TaskWakeUp',[9]),/unsupported original task/);
});

test('room initialization preserves daily action state and original time-specific presentation',()=>{
  const bridge=new PiaNatives({assets:{night:{type:'image',url:'night.png'},day:{type:'image',url:'day.png'},bgm12:{type:'music',url:'day.wav'},bgm13:{type:'music',url:'night.wav'}},
    resources:{background:{BK23A:'day',BK23C:'night'},music:{BGM12:'bgm12',BGM13:'bgm13'}}});
  const vm={state:{native:{}},readString:value=>value};
  const invoke=(name,args=[])=>bridge.invoke(name,args,vm,{id:`original-test:${name}`});
  invoke('SetTime',[21,0]);invoke('SetRoomActionCall',[130]);invoke('RoomInit',['bk23','unused-original-second-argument']);
  assert.equal(vm.state.native.pia.scene.background,'night');assert.equal(vm.state.native.pia.scene.music,'bgm13');
  assert.equal(invoke('GetRoomActionCall').result,-126);
  invoke('RoomSaMain',[4,0]);assert.equal(vm.state.native.pia.room.enabled.main[4],false);
  invoke('SetTime',[7,0]);invoke('RoomInit',['bk23']);
  assert.equal(vm.state.native.pia.scene.background,'day');assert.equal(vm.state.native.pia.scene.music,'bgm12');
  assert.equal(vm.state.native.pia.room.enabled.main[4],true);assert.equal(invoke('GetRoomActionCall').result,-126);
  invoke('ActionClear');assert.equal(invoke('GetRoomActionCall').result,0);
  assert.throws(()=>invoke('RoomMenu'),/original room menu choices/);
});
