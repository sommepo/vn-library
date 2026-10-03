import test from 'node:test';
import assert from 'node:assert/strict';
import {Shibuya428Threads,decode428Thread} from '../web/adapters/shibuya428-threads.mjs';
import {Shibuya428OpeningPresentation} from '../web/adapters/shibuya428-presentation.mjs';

function fixture(loop=0){
  const tokens=[
    [0,0xa1,[0,116,0,loop]], [6,0xa3,[0,116,0]], [11,0xa2,[0,116,0]],
    [16,0x22,[0]], [19,0x2d,[0,0,0,2]], [25,0x6a,[1]], [28,0xa5,[]]
  ].map(([offset,code,args])=>({id:`synthetic:${offset}`,offset,next:offset+2+args.length,code,args}));
  return {0:{index:0,labels:{t:{offset:16}},tokens}};
}
const event=(scripts,index)=>({kind:'presentation',id:scripts[0].tokens[index].id,script:0,command:decode428Thread(scripts[0].tokens[index])});
const driver=()=>({frame:async()=>{},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},stopVoice:()=>{},gainVoice:()=>{}});

test('background waits preserve foreground text and join only after completion',async()=>{
  const scripts=fixture(),draws=[],v=new Shibuya428OpeningPresentation({...driver(),pictureVisible:(...args)=>draws.push(args)}, {},{sourceScripts:scripts});
  v.text='foreground';await v.apply(event(scripts,0));assert.equal(v.frame,0);
  await v.apply(event(scripts,1));
  assert.equal(v.frame,3);assert.deepEqual(draws,[[1,true]]);assert.equal(v.text,'foreground');assert.equal(v.threads.slots[0].status,2);
  await v.apply(event(scripts,2));assert.ok(v.threads.slots.every(s=>s===null));
});

test('looping slots restart on the following frame and keep their source identity',async()=>{
  const scripts=fixture(1),v=new Shibuya428Threads(scripts),seen=[];
  v.start(event(scripts,0));
  for(let n=0;n<7;n++)await v.tick({apply:async()=>seen.push(n),ready:()=>true,tickGroup:async()=>{}});
  assert.deepEqual(seen,[2,5]);assert.equal(v.slots[0].status,1);assert.equal(v.ready(event(scripts,1)),false);
  v.stop(event(scripts,2));assert.equal(v.ready(event(scripts,1)),true);
});

test('full slots never replace an existing source thread; malformed targets fail before mutation',()=>{
  const scripts=fixture(),v=new Shibuya428Threads(scripts);
  for(let n=0;n<8;n++)assert.equal(v.start(event(scripts,0)),n);
  const before=v.snapshot();assert.equal(v.start(event(scripts,0)),null);assert.deepEqual(v.snapshot(),before);
  const forged=event(scripts,0);forged.command.target.label='missing';assert.throws(()=>v.start(forged),/source mismatch/);assert.deepEqual(v.snapshot(),before);
});

test('a background control error freezes subsequent presentation and cannot silently drop the thread',async()=>{
  const scripts=fixture();scripts[0].tokens[5]={...scripts[0].tokens[5],code:0x5c,args:[0,31],next:29};
  const v=new Shibuya428OpeningPresentation(driver(),{},{sourceScripts:scripts});
  await v.apply(event(scripts,0));
  await assert.rejects(v.apply(event(scripts,1)),/Unsupported presentation thread/);
  assert.equal(v.threads.slots[0].pc,25);assert.equal(v.threads.slots[0].status,1);
  await assert.rejects(v.apply({kind:'wait',frames:1}),/Unsupported presentation thread/);
});

test('failed background media loading retains its source PC and releases the frame lock',async()=>{
  const scripts=fixture(),v=new Shibuya428Threads(scripts);v.start(event(scripts,0));
  const callbacks={apply:async()=>{throw Error('image unavailable');},ready:()=>true,tickGroup:async()=>{}};
  await v.tick(callbacks);await v.tick(callbacks);await assert.rejects(v.tick(callbacks),/image unavailable/);
  assert.equal(v.busy,false);assert.equal(v.slots[0].pc,25);
});
