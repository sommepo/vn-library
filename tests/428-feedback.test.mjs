import test from 'node:test';import assert from 'node:assert/strict';
import {Shibuya428Feedback} from '../web/adapters/shibuya428-feedback.mjs';
test('device feedback keeps delay separate from duration and waits through the final tick',()=>{
 const f=new Shibuya428Feedback();f.start({from:240,to:40,frames:5,delay:2});
 f.tick();f.tick();assert.equal(f.elapsed,0);assert.equal(f.value,240);assert.equal(f.ready(),false);
 f.tick();assert.equal(f.value,190);f.tick();f.tick();f.tick();assert.equal(f.value,40);assert.equal(f.ready(),false);
 f.tick();assert.equal(f.value,0);assert.equal(f.ready(),true);
});
test('native disabled preference and zero duration do not manufacture a wait',()=>{
 const f=new Shibuya428Feedback({enabled:false});f.start({from:255,to:0,frames:60,delay:12});assert.equal(f.ready(),true);
 f.enabled=true;f.start({from:255,to:0,frames:0,delay:12});assert.equal(f.ready(),true);
 const before={...f};assert.throws(()=>f.start({from:256,to:0,frames:1,delay:0}),/Unsupported/);assert.deepEqual({...f},before);
 f.reset();assert.equal(f.delay,0);
});
