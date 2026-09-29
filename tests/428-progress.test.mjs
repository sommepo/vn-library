import test from 'node:test';
import assert from 'node:assert/strict';
import {Shibuya428Progress} from '../web/adapters/shibuya428-progress.mjs';
const scripts={0:{index:0,size:100,content_offset:10,labels:{
  first:{offset:10,bucket:2,table_offset:1},second:{offset:20,bucket:1,table_offset:3},
  _internal:{offset:30,bucket:0,table_offset:0}}},1:{index:1,size:200,content_offset:10,labels:{
  other:{offset:10,bucket:0,table_offset:0}}}};
const graph=()=>new Shibuya428Progress(scripts);
test('native ID order follows buckets, excludes internal labels and ignores object order',()=>{
 const g=graph();assert.deepEqual(g.labels.map(x=>x.label),['second','first','other']);
 assert.throws(()=>g.id('0:_internal'),/unknown/);assert.equal(g.snapshot().records.length,0);
});
test('linked and no-link transfers complete the old node without inventing visited targets',()=>{
 const g=graph();g.presented(1,40);g.transition(1,2);
 assert.equal(g.record(1).nextLabel,2);assert.equal(g.record(2).previousLabel,1);
 assert.equal(g.record(1).complete,true);assert.equal(g.record(1).readPc,0);assert.equal(g.record(2).complete,false);
 g.transition(2,0,{link:false});assert.equal(g.record(2).complete,true);
 assert.equal(g.record(2).nextLabel,0x3fff);assert.equal(g.record(0).previousLabel,0x3fff);
 g.transition(0,0);assert.equal(g.record(0).previousLabel,0);assert.equal(g.record(0).nextLabel,0);
});
test('replay clears only its marker and keeps the prior graph edge',()=>{
 const g=graph();g.transition(0,1);g.bytes[5]|=128;g.select(0,2);
 g.transition(0,2,{replay:true});assert.equal(g.record(0).replayed,false);
 assert.equal(g.record(0).nextLabel,1);assert.equal(g.record(0).choice,3);
});
test('source read thresholds are monotonic until completed and separate from choices',()=>{
 const g=graph();g.presented(1,40);g.presented(1,20);assert.equal(g.record(1).readPc,40);
 g.select(1,9);assert.equal(g.record(1).choice,10);g.select(1,0);assert.equal(g.record(1).choice,1);
 g.complete(1);g.presented(1,80);assert.equal(g.record(1).readPc,0);
 for(const n of [-1,91,1.5])assert.throws(()=>g.presented(1,n));
 for(const n of [-1,10,1.5])assert.throws(()=>g.select(1,n));
});
test('sparse snapshots round-trip, bind source identity and reject malformed data atomically',()=>{
 const g=graph();g.transition(1,2);g.select(1,2);g.presented(2,120);const saved=g.snapshot(),fresh=graph();
 fresh.restore(JSON.parse(JSON.stringify(saved)));assert.deepEqual(fresh.bytes,g.bytes);
 const malformed=[{...saved,signature:'wrong'},{...saved,labelCount:5},{...saved,records:[...saved.records,...saved.records]},
   {...saved,records:[[3,0,0,0]]},{...saved,records:[[0,0xff3fffff,0x3fff,-1]]},
   {...saved,records:[[0,0xff3fffff,0x3fff,1000]]},{...saved,records:[[0,0xff3fffff,0x7fff,20]]},
   {...saved,records:[[0,0xff3fffff,0x3c0000|0x3fff,0]]},{...saved,records:[[0,0xff3ffffe,0x3fff,0]]}];
 for(const data of malformed){assert.throws(()=>g.restore(data));assert.deepEqual(g.snapshot(),saved);}
});
