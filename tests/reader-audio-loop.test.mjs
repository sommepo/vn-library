import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyLoop, snapshotLoop, isOneShot, releaseLoop} from '../web/audio-loop.mjs';
import {restoreEffects, snapshotEffects, startEffect, stopEffects} from '../web/audio-effects.mjs';
import {Engine} from '../web/engine.mjs';
function fakeAudio(){return {loop:undefined,vnLoop:undefined,playbackRate:1,ontimeupdate:null,onended:null,currentTime:0,ended:false,paused:true,listeners:[],pause(){this.paused=true;},addEventListener(type,listener,options){this.listeners.push({type,listener,options});}};}
const loopAsset={loopStart:5,loopEnd:100};
const plainAsset={};
test('loop-point asset keeps native loop off but records loop intent',()=>{const a=fakeAudio();applyLoop(a,loopAsset,true,()=>{});assert.equal(a.loop,false);assert.equal(a.vnLoop,true);assert.ok(a.ontimeupdate);assert.ok(a.onended);});
test('timeupdate wraps from loopEnd to loopStart',()=>{const a=fakeAudio();applyLoop(a,loopAsset,true,()=>{});a.currentTime=101;a.ontimeupdate();assert.equal(a.currentTime,6);});
test('ended fallback resumes at loopStart',()=>{const a=fakeAudio();let played=0;applyLoop(a,loopAsset,true,()=>played++);a.currentTime=100;a.onended();assert.equal(a.currentTime,5);assert.equal(played,1);});
test('loop-point asset with loop=false attaches no handlers',()=>{const a=fakeAudio();applyLoop(a,loopAsset,false,()=>{});assert.equal(a.loop,false);assert.equal(a.vnLoop,false);assert.equal(a.ontimeupdate,null);assert.equal(a.onended,null);});
test('loop asset without loop points falls back to native loop',()=>{const a=fakeAudio();applyLoop(a,plainAsset,true,()=>{});assert.equal(a.loop,true);assert.equal(a.vnLoop,true);assert.equal(a.onended,null);});
// The snapshot serializes vnLoop (intent), not native audio.loop (transport):
// a loop-point effect has audio.loop===false yet must round-trip as looping.
test('snapshot serializes loop intent, not the native transport flag',()=>{const a=fakeAudio();applyLoop(a,loopAsset,true,()=>{});assert.equal(a.loop,false);assert.equal(snapshotLoop(a),true);});
test('one-shot cleanup applies only to non-looping effects',()=>{assert.equal(isOneShot(true),false);assert.equal(isOneShot(false),true);assert.equal(isOneShot(undefined),true);});
test('release clears loop handlers so a stopped effect cannot resurrect',()=>{const a=fakeAudio();applyLoop(a,loopAsset,true,()=>{throw new Error('must not replay after release');});releaseLoop(a);assert.equal(a.ontimeupdate,null);assert.equal(a.onended,null);});
test('loop-point effect survives save/restore and remains stoppable',()=>{
 const effects=new Set(),created=[],played=[];
 const assets={ambient:{type:'sound',url:'ambient.wav',loopStart:5,loopEnd:100,provenance:'original test tone'}};
 const content={format:'vnkit.content',version:1,id:'audio-test',assets,entry:'line',instructions:[{id:'line',op:'text',text:'test'}]};
 const engine=new Engine(content,{makeId:()=> 'occurrence'});engine.run();
 const services={
  hasAsset:id=>Boolean(assets[id]),mediaURL:id=>assets[id].url,volume:.5,
  createAudio(){const audio=fakeAudio();created.push(audio);return audio;},
  configure:(audio,id,loop)=>applyLoop(audio,assets[id],loop,a=>{a.paused=false;played.push(a);}),
  seek:(audio,time)=>{audio.currentTime=time;},play:audio=>{audio.paused=false;played.push(audio);},
 };
 const original=startEffect(effects,{op:'sound',asset:'ambient',channel:'room',loop:true},services);
 assert.equal(original.loop,false);assert.equal(original.vnLoop,true);assert.equal(original.listeners.length,0);
 original.currentTime=12;
 const save=engine.save({effects:snapshotEffects(effects,a=>a.paused)});
 assert.deepEqual(save.media.effects,[{asset:'ambient',channel:'room',time:12,paused:false,loop:true}]);
 stopEffects(effects,{op:'stopSound',channel:'room'});
 assert.equal(effects.size,0);assert.equal(original.paused,true);assert.equal(original.ontimeupdate,null);assert.equal(original.onended,null);
 engine.restore(save);const [restored]=restoreEffects(effects,save.media.effects,services);
 assert.notEqual(restored,original);assert.equal(restored.currentTime,12);assert.equal(restored.loop,false);assert.equal(restored.vnLoop,true);assert.ok(restored.ontimeupdate);assert.ok(restored.onended);assert.equal(restored.listeners.length,0);
 stopEffects(effects,{op:'stopSound',asset:'ambient'});
 assert.equal(effects.size,0);assert.equal(restored.paused,true);assert.equal(restored.ontimeupdate,null);assert.equal(restored.onended,null);assert.equal(created.length,2);assert.equal(played.length,2);
});
