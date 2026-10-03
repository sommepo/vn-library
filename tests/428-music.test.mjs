import test from 'node:test';import assert from 'node:assert/strict';
import {music428Gain,Shibuya428Music} from '../web/adapters/shibuya428-music.mjs';
import {decode428Presentation} from '../web/adapters/shibuya428-media.mjs';
const asset={type:'audio',url:'synthetic.wav',sampleRate:100,loop:{start:20,end:80}};
function fixture(){const events=[];const m=new Shibuya428Music({prepareVoice:async()=>{},startVoice:v=>events.push(['start',v]),gainVoice:(...a)=>events.push(['gain',...a])},{'0:7':asset,'0:8':asset,'0:9':asset});return {m,events};}
const play={type:'music',resource:7,volumePercent:50,frames:0,delay:0,flags:8};
test('music percentages use the native quantized gain and retain exact loop bounds',async()=>{
 assert.equal(music428Gain(0),0);assert.equal(music428Gain(50),.5);assert.equal(music428Gain(100),1);assert.equal(music428Gain(10),25/256);
 for(const n of [-1,101,NaN,Infinity])assert.throws(()=>music428Gain(n),/bound/);
 const {m,events}=fixture();await m.apply(0,play);m.tick();assert.equal(events[0][1].volume,.5);assert.deepEqual(events[0][1].asset.loop,asset.loop);
 assert.deepEqual(decode428Presentation({code:0x92,args:[0,7,0,50,0,30,0,2,8]}),{...play,frames:30,delay:2});
});
test('delayed music starts once, changes volume in place and releases on actual ending',async()=>{
 const {m,events}=fixture();await m.apply(0,{...play,delay:2,frames:3});m.tick();m.tick();assert.equal(events.length,0);
 m.tick();assert.equal(events[0][0],'start');assert.equal(events[0][1].volume,0);const id=events[0][1].id;
 for(let n=0;n<4;n++)m.tick();assert.equal(m.voices[0].volume,50);
 await m.apply(0,{...play,volumePercent:82});m.tick();assert.equal(events.filter(e=>e[0]==='start').length,1);
 assert.equal(m.voices[0].volume,82);m.ended(id);assert.equal(m.voices.length,0);
});
test('music channels remain bounded and unsupported flags do not replace playback',async()=>{
 const {m}=fixture();await m.apply(0,play);await m.apply(0,{...play,resource:8});
 const before=structuredClone(m.voices);await assert.rejects(m.apply(0,{...play,resource:9}),/capacity/);
 await assert.rejects(m.apply(0,{...play,flags:9}),/mode/);assert.deepEqual(m.voices,before);
});
test('source volume changes preserve playback and apply their delayed envelope',async()=>{
 const {m,events}=fixture();await m.apply(0,play);m.tick();
 const change=decode428Presentation({code:0x96,args:[0,7,0,0,25,0,2,0,1,0]});
 assert.deepEqual(change,{type:'musicControl',resource:7,mode:0,value:25,frames:2,delay:1,wait:0});
 m.control(change);m.tick();assert.equal(m.voices[0].volume,50);
 m.tick();assert.equal(m.voices[0].volume,50);m.tick();assert.equal(m.voices[0].volume,37.5);m.tick();assert.equal(m.voices[0].volume,25);
 assert.equal(events.filter(e=>e[0]==='start').length,1);
 const before=structuredClone(m.voices);assert.throws(()=>m.control({...change,wait:1}),/mode/);assert.deepEqual(m.voices,before);
 m.control({...change,resource:123});assert.deepEqual(m.voices,before);
});
