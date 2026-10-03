import test from 'node:test';import assert from 'node:assert/strict';
import {Shibuya428Channels} from '../web/adapters/shibuya428-channels.mjs';
import {Shibuya428OpeningPresentation} from '../web/adapters/shibuya428-presentation.mjs';
test('shared streaming ownership follows distinct music and movie orders',()=>{
 const c=new Shibuya428Channels();assert.equal(c.freeMovie(),1);assert.equal(c.acquire('music:1','music'),0);assert.equal(c.acquire('movie:1','movie'),1);
 assert.equal(c.freeMovie(),-1);assert.throws(()=>c.acquire('music:2','music'),/occupied/);c.release('music:1');assert.equal(c.freeMovie(),0);
 c.release('stale');assert.equal(c.acquire('movie:2','movie'),0);assert.throws(()=>c.acquire('movie:2','movie'),/ownership/);c.reset();assert.deepEqual(c.owners,[null,null]);
});
test('flagged movies share music channels and retain ownership through retries and completion',async()=>{
 let failLoad=true,failFrame=false,failStop=false,starts=0,stops=0;
 const p=new Shibuya428OpeningPresentation({frame:async()=>{if(failFrame)throw Error('Frame interrupted');},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},
  movie:async a=>{assert.equal(a.url,'movie.webm');if(failLoad)throw Error('Load interrupted');starts++;},movieEnded:()=>true,
  movieStop:async()=>{if(failStop)throw Error('Stop interrupted');stops++;}
 },{'0:7':{type:'audio'},'0:8':{type:'audio'},'0:9':{type:'movie',url:'movie.webm',hasAudio:false}});
 const event=(id,command)=>({kind:'presentation',script:0,id,command}),music={type:'music',resource:7,volumePercent:50,frames:0,delay:0,flags:8},movie={type:'movie',resource:0x4009,layer:1,volumePercent:70,yieldFrame:1};
 await p.apply(event('music',music));assert.equal(p.music.voices[0].channel,0);
 await assert.rejects(p.apply(event('movie',movie)),/Load interrupted/);assert.equal(p.channels.freeMovie(),1);assert.equal(p.movieChannel,undefined);
 failLoad=false;failFrame=true;await assert.rejects(p.apply(event('movie',movie)),/Frame interrupted/);assert.equal(starts,1);assert.equal(p.movieChannel.channel,1);
 failFrame=false;await p.apply(event('movie',movie));assert.equal(starts,1);assert.equal(p.channels.freeMovie(),-1);
 await p.apply(event('wait',{type:'movieWait',resource:0x4009,layer:1}));assert.equal(p.channels.freeMovie(),-1);
 await assert.rejects(p.apply(event('music2',{...music,resource:8})),/occupied/);assert.equal(p.music.voices.length,1);
 failStop=true;await assert.rejects(p.apply(event('stop',{type:'movieStop',resource:0x4009,layer:1})),/Stop interrupted/);assert.equal(p.channels.freeMovie(),-1);
 failStop=false;await p.apply(event('stop',{type:'movieStop',resource:0x4009,layer:1}));assert.equal(stops,1);assert.equal(p.channels.freeMovie(),1);
 await p.apply(event('music2',{...music,resource:8}));assert.equal(p.music.voices[0].channel,1);
});
test('a rejected music preparation returns the reserved shared channel',async()=>{
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},prepareVoice:async()=>{throw Error('Audio decode failed');}},{'0:7':{type:'audio'}});
 await assert.rejects(p.apply({kind:'presentation',id:'music',script:0,command:{type:'music',resource:7,volumePercent:50,frames:0,delay:0,flags:8}}),/Audio decode failed/);
 assert.deepEqual(p.channels.owners,[null,null]);assert.equal(p.music.nextId,1);assert.equal(p.music.voices.length,0);
});
test('hour return completes its audio fade once across a failed reset acknowledgement',async()=>{
 let fades=0,resets=0,fail=true;
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},
  pauseScene:async({frames})=>{assert.equal(frames,30);fades++;},reset:async()=>{resets++;if(fail)throw Error('Reset interrupted');}
 },{},{textKernel:{defaults:[],reset:()=>{}}});
 const event={kind:'presentation',id:'hour-return',command:{type:'endingReset',fadeFrames:30}};
 await assert.rejects(p.apply(event),/Reset interrupted/);assert.equal(p.scenePaused,true);assert.equal(fades,1);
 fail=false;await p.apply(event);assert.equal(fades,1);assert.equal(resets,2);assert.equal(p.scenePaused,false);
 await assert.rejects(p.apply({...event,command:{...event.command,fadeFrames:31}}),/source-length/);
});
