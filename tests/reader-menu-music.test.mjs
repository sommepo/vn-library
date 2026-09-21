import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MenuMusic} from '../web/menu-music.mjs';
function setup(saved){const storage={getItem:()=>saved,setItem(k,v){this.saved=v;}};const audio={paused:true,plays:0,pause(){this.paused=true;},play(){this.plays++;this.paused=false;return Promise.resolve();}};return {audio,storage,music:new MenuMusic(audio,storage)};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('quiet default, loop, leaving menu pauses',async()=>{const {music,audio}=setup();assert.equal(audio.volume,.20);assert.equal(audio.loop,true);music.sync(true);await tick();assert.equal(audio.paused,false);music.sync(false);assert.equal(audio.paused,true);});
test('mute and volume persist independently',async()=>{const {music,audio,storage}=setup();music.sync(true);await tick();music.setMuted(true);assert.equal(audio.paused,true);music.setVolume(.02);assert.deepEqual(JSON.parse(storage.saved),{volume:.02,muted:true});const next=setup(storage.saved);next.music.sync(true);assert.equal(next.audio.plays,0);});
test('autoplay denial can retry and late play cannot leak into game',async()=>{const {music,audio}=setup();audio.play=()=>Promise.reject(new Error('NotAllowedError'));music.sync(true);await tick();audio.play=()=>{audio.paused=false;return Promise.resolve();};music.sync(true);music.sync(false);await tick();assert.equal(audio.paused,true);});
