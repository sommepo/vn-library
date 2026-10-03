import test from 'node:test';
import assert from 'node:assert/strict';
import {Shibuya428FlowState} from '../web/adapters/shibuya428-flow-state.mjs';
const create=()=>new Shibuya428FlowState('a'.repeat(64),4);

test('sparse flow transactions preserve unsigned words and own their data',()=>{
 const flow=create();flow.words[8]=0xffffffff;flow.words[31]=0x12345678;flow.globals[0]=3;
 const snapshot=flow.snapshot(),restored=create();restored.restore(snapshot);
 assert.deepEqual(restored.snapshot(),snapshot);assert.equal(snapshot.records.length,2);
 snapshot.records[0][1]=0;snapshot.globals[0]=0;
 assert.equal(restored.words[8],0xffffffff);assert.equal(restored.globals[0],3);
 restored.restore(create().snapshot());assert.ok(restored.words.every(v=>v===0));
});

test('invalid or foreign flow snapshots cannot partly replace a transaction',()=>{
 const flow=create();flow.words[8]=7;const before=flow.snapshot();
 for(const edit of [
  s=>s.signature='b'.repeat(64),s=>s.count=5,s=>s.globals.pop(),s=>s.globals[0]=-1,
  s=>s.records.push([0,...Array(8).fill(0)]),s=>s.records.push([...s.records[0]]),
  s=>s.records[0][0]=4,s=>s.records[0][1]=0x100000000,s=>s.records[0][2]=1.5,
  s=>s.records[0].pop(),
 ]){const bad=structuredClone(before);edit(bad);assert.throws(()=>flow.restore(bad));assert.deepEqual(flow.snapshot(),before);}
});
