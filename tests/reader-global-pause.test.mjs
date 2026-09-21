import {test} from 'node:test';import assert from 'node:assert/strict';import {GlobalPause} from '../web/global-pause.mjs';
const media=(src,paused=false)=>({src,paused,ended:false,pause(){this.paused=true;}});
test('global pause preserves playback intent and excludes old/replaced/ended media',()=>{
 const p=new GlobalPause(),music=media('music'),voice=media('voice',true),effect=media('effect');
 p.suspend([music,voice,effect]);assert.equal(music.paused,true);assert.equal(p.savedPaused(music),false);assert.equal(p.savedPaused(voice),true);
 const added=media('new',true);assert.equal(p.request(added),false);effect.src='replacement';const resumed=[];p.resume([music,voice,effect,added],a=>resumed.push(a.src));assert.deepEqual(resumed,['music','new']);assert.equal(p.pending.size,0);assert.equal(p.paused,false);
});
