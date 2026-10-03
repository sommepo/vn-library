import test from 'node:test';
import assert from 'node:assert/strict';
import {Shibuya428Context} from '../web/adapters/shibuya428-context.mjs';
const data={prefixes:[...'ABCDEFGHIJ'],
 labels:['A_morning','A_evening','D_afternoon','D_late','D_last','H_bonus','I_bonus','A_interior','unknown'],
 times:[['A_morning',10,5],['A_evening',19,25],['D_afternoon',16,30],['D_late',17,5],['D_last',20,0],['H_bonus',8,0],['I_bonus',9,0]]};

test('source time and restart clocks survive interior labels and character changes',()=>{
 const c=new Shibuya428Context(data);
 assert.equal(c.checkpoint('A_interior',false),null);
 assert.deepEqual(c.checkpoint('A_morning',true),{character:0,hour:0});
 assert.equal(c.snapshot().clocks[0],605);
 assert.deepEqual(c.checkpoint('D_afternoon',true),{character:3,hour:6});
 assert.equal(c.snapshot().clocks[0],605);
 assert.deepEqual(c.checkpoint('A_interior',false),{character:3,hour:6});
 assert.equal(c.snapshot().restarts[3],'D_afternoon');
 assert.deepEqual(c.checkpoint('A_evening',true),{character:0,hour:8});
 assert.equal(c.snapshot().clocks[0],1165);
});
test('late character remapping and bonus clocks follow native special cases',()=>{
 const c=new Shibuya428Context(data);
 assert.deepEqual(c.checkpoint('D_late',true),{character:10,hour:7});
 assert.equal(c.snapshot().restarts[10],'D_late');
 assert.deepEqual(c.checkpoint('D_last',true),{character:10,hour:9});
 for(const [label,character]of [['H_bonus',7],['I_bonus',8]]){
  assert.deepEqual(c.checkpoint(label,true),{character,hour:0});
  assert.equal(c.snapshot().clocks[character],600);
 }
});
test('compact context restores source identity and rejects invalid states atomically',()=>{
 const a=new Shibuya428Context(data);a.checkpoint('A_morning',true);a.checkpoint('D_late',true);
 const saved=a.snapshot(),b=new Shibuya428Context(data);b.restore(saved);assert.deepEqual(b.snapshot(),saved);
 for(const bad of [{...saved,signature:'wrong'},{...saved,hour:2},{...saved,clocks:Array(11).fill(-1)},
  {...saved,restarts:Array(11).fill('not_a_source_label')},{...saved,character:null,hour:null}]){
  assert.throws(()=>b.restore(bad));assert.deepEqual(b.snapshot(),saved);
 }
 assert.throws(()=>b.checkpoint('unknown',true),/restart character/);assert.deepEqual(b.snapshot(),saved);
 assert.throws(()=>b.checkpoint('A_morning',1),/invalid checkpoint/);assert.deepEqual(b.snapshot(),saved);
 saved.clocks[0]=0;assert.equal(a.snapshot().clocks[0],605);
});
test('native replay may merge different characters onto a common final restart',()=>{
 const c=new Shibuya428Context(data);c.checkpoint('D_last',true);
 const saved=c.snapshot();
 for(let n=0;n<7;n++){saved.restarts[n]='D_last';saved.clocks[n]=1200;}
 c.restore(saved);assert.deepEqual(c.snapshot(),saved);
 c.checkpoint('A_morning',true);
 assert.equal(c.snapshot().restarts[0],'A_morning');
 assert.equal(c.snapshot().restarts[1],'D_last');
 assert.equal(c.snapshot().clocks[1],1200);
});
