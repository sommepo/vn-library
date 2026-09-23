import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyLoop, snapshotLoop, isOneShot, releaseLoop} from '../web/audio-loop.mjs';
function fakeAudio(){return {loop:undefined,vnLoop:undefined,playbackRate:1,ontimeupdate:null,onended:null,currentTime:0};}
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
