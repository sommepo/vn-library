import test from 'node:test';
import assert from 'node:assert/strict';
import {MemoriesOffEngine} from '../web/adapters/memoriesoff-engine.mjs';
const sha='0'.repeat(64);
function fixture(rows){
 const instructions=rows.map((i,n)=>({offset:n,next:n+1,id:`mo1:0:${n.toString(16).padStart(4,'0')}`,args:[],...i}));
 const script={format:'vnkit.memoriesoff-script',version:1,id:'0',sha256:sha,size:rows.length,instructions};
 const content={format:'vnkit.content',version:1,id:'synthetic-mo1',assets:{},runtime:{id:'memoriesoff-ps1',version:1,entry:'0',scripts:{0:{url:'script.json',sha256:sha}}}};
 return()=>MemoriesOffEngine.create(content,{loadJSON:async()=>script,makeId:()=> 'synthetic-occurrence',seed:123});
}
test('choices follow original indices, byte arithmetic wraps, and progress is separate',async()=>{
 const create=fixture([{code:0x60,args:[1,255]},{code:0x61,args:[1,2]},
  {code:0x11,options:['First','Second']},{code:0x20,args:[2,2]},
  {code:0x52,clauses:[{variable:0x8002,compare:1,value:2}],target:7},
  {code:0x6a,args:[5,1]},{code:0x10,text:'Original synthetic line',continuation:0},{code:0}]);
 const e=await create();await e.run();assert.equal(e.state.vars[1],1);
 const saved=e.save(),restored=await create();await restored.restore(saved);await restored.advance('1');assert.equal(restored.state.vars[2],2);assert.equal(restored.state.globals[5],1);
 await e.advance('0');assert.equal(e.current.kind,'end');assert.equal(e.state.globals[5],0);
 const progress=restored.progressSnapshot();await restored.restore(saved);restored.applyProgress(progress);assert.equal(restored.state.globals[5],1);assert.equal(restored.current.kind,'choice');
});
test('unresolved targets and unknown operations roll back without hiding the stop',async()=>{
 const create=fixture([{code:0x10,text:'Boundary'},{code:0x60,args:[3,42]},{code:0x50,target:3}]);
 const e=await create();await e.run();const before=e.save();await assert.rejects(e.advance(),/Unresolved source target/);assert.deepEqual(e.state,before.state);
 const bad=await fixture([{code:0x44}])();await assert.rejects(bad.run(),/Unsupported native command/);assert.equal(bad.state.pc,0);
});
test('save validation rejects altered dialogue, invalid banks and inflated timers atomically',async()=>{
 const create=fixture([{code:0x10,text:'Source text'},{code:5,args:[60]},{code:0}]),e=await create();await e.run();const before=e.save();
 for(const change of [s=>s.state.pending.text='fabricated',s=>s.state.vars[0]=256,s=>s.state.stack=[{script:'0',pc:900}]]){
  const save=structuredClone(before);change(save);await assert.rejects(e.restore(save));assert.deepEqual(e.state,before.state);
 }
 await e.advance();const wait=e.save();wait.state.pending.remainingMs=1001;await assert.rejects(e.restore(wait),/timer/);assert.equal(e.current.remainingMs,1000);
});
test('malformed choice selections do not advance or change state',async()=>{
 const create=fixture([{code:0x11,options:['Only']},{code:0x20,args:[2,1]},{code:0}]);
 const e=await create();await e.run();const before=e.save();await assert.rejects(e.advance('8'),/visible option/);assert.deepEqual(e.state,before.state);
});
