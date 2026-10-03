import test from 'node:test';import assert from 'node:assert/strict';
import {Shibuya428Audio} from '../web/adapters/shibuya428-audio.mjs';
import {Shibuya428Pictures} from '../web/adapters/shibuya428-picture.mjs';
const asset={type:'audio',url:'synthetic.wav'};
function setup(){
 const events=[];const driver={prepareVoice:async()=>{},startVoice:v=>events.push(['start',v.id,v.volume]),gainVoice:(id,gain)=>events.push(['gain',id,gain]),stopVoice:id=>events.push(['stop',id])};
 return {audio:new Shibuya428Audio(driver,{'0:9':asset,'0:10':asset,'1:9':asset}),events,driver};
}
const sound=(extra={})=>({type:'sound',resource:9,volumePercent:50,volume:.5,pan:0,spatialDistance:90,parameterA:0,parameterB:0,selector:0,parameterFloat:0,flags:0,...extra});
const ambient=(extra={})=>({type:'ambient',resource:0x8009,volumePercent:50,volume:.5,outgoingFrames:0,incomingFrames:0,outgoingDelay:0,incomingDelay:0,wait:0,...extra});
test('direct volume updates retain unmentioned remaining time and delay without restarting voices',async()=>{
 const {audio,events}=setup();await audio.apply(0,sound());audio.tick();
 audio.envelope(audio.voices[0],.2,20,3);audio.voices[0].envelope.remaining=10;
 await audio.apply(0,{type:'soundDirect',resource:9,flags:0,changes:[{field:1,mode:0,value:.8}]});
 assert.deepEqual(audio.voices[0].envelope,{from:.5,to:.8,total:20,remaining:10,delay:3});
 for(let index=0;index<3;index++)audio.tick();assert.equal(audio.voices[0].volume,.5);
 audio.tick();assert.equal(audio.voices[0].envelope.remaining,9);
 await audio.apply(0,{type:'soundDirect',resource:9,flags:2,changes:[{field:1,mode:0,value:.7},{field:2,value:30},{field:3,value:0}]});
 assert.equal(audio.voices[0].envelope.total,30);assert.equal(audio.voices[0].envelope.remaining,30);
 assert.equal(events.filter(event=>event[0]==='start').length,1);
 const before=structuredClone(audio.voices);
 await assert.rejects(audio.apply(0,{type:'soundDirect',resource:9,flags:0,changes:[{field:1,mode:0,value:.7},{field:7,value:20}]}),/Unsupported/);
 assert.deepEqual(audio.voices,before);
});
test('start delay postpones playback and a fade starts from silence on its own frame clock',async()=>{
 const {audio,events}=setup();await audio.apply(0,sound({parameterA:3,parameterB:2}));
 audio.tick();audio.tick();assert.deepEqual(events,[]);audio.tick();assert.deepEqual(events,[['start',1,0]]);
 audio.tick();assert.equal(audio.voices[0].volume,0);audio.tick();assert.equal(audio.voices[0].volume,Math.fround(.5/3));
 audio.tick();audio.tick();assert.equal(audio.voices[0].volume,.5);
});
test('movie sound uses decoded frames, holds while paused, and releases before its separate start delay',async()=>{
 const {audio,driver,events}=setup();let frame=0;
 audio.assets['0:3']={type:'movie',url:'synthetic.webm'};driver.movieFrame=()=>frame;
 await audio.apply(0,sound({selector:30,secondaryResource:3,parameterB:2}));
 for(let n=0;n<100;n++)audio.tick();assert.deepEqual(events,[]);assert.equal(audio.voices[0].delay,2);
 frame=14;audio.tick();assert.equal(audio.voices[0].movieGate,30);
 frame=15;audio.tick();assert.equal(audio.voices[0].movieGate,0);assert.equal(audio.voices[0].delay,2);
 audio.tick();audio.tick();assert.deepEqual(events,[]);audio.tick();assert.equal(events[0][0],'start');
});
test('unavailable movie clocks cannot create or change a sound voice',async()=>{
 const {audio,driver}=setup();await audio.apply(0,sound({resource:0x8009}));const before=structuredClone(audio.voices);
 await assert.rejects(audio.apply(0,sound({resource:0x8009,selector:30,secondaryResource:3})),/movie clock/);assert.deepEqual(audio.voices,before);
 audio.assets['0:3']={type:'movie',url:'synthetic.webm'};driver.movieFrame=()=>NaN;
 await assert.rejects(audio.apply(0,sound({selector:30,secondaryResource:3})),/Invalid original movie frame/);assert.deepEqual(audio.voices,before);
 driver.movieFrame=()=>-1;await audio.apply(0,sound({selector:30,secondaryResource:3}));audio.tick();assert.equal(audio.voices[0].status,1);
});
test('raw high bit reuses the same instance while ordinary resource plays overlap',async()=>{
 const {audio,events}=setup();await audio.apply(0,sound({resource:0x8009}));audio.tick();
 await audio.apply(0,sound({resource:0x8009,parameterA:30,parameterB:60}));audio.tick();
 assert.equal(events.filter(e=>e[0]==='start').length,1);assert.equal(audio.voices[0].volume,.5);assert.equal(audio.voices[0].delay,0);
 await audio.apply(0,sound());await audio.apply(0,sound());audio.tick();assert.equal(events.filter(e=>e[0]==='start').length,3);
});
test('ambient replacement retains source minimum outgoing fade and stops after final zero gain',async()=>{
 const {audio,events}=setup();await audio.apply(0,ambient());audio.tick();
 assert.equal(await audio.apply(0,ambient({resource:0x800a,incomingFrames:4,wait:1})),4);
 assert.equal(audio.voices.find(v=>v.id===1).envelope.total,10);
 for(let n=0;n<11;n++)audio.tick();assert.equal(events.filter(e=>e[0]==='stop').length,0);
 audio.tick();assert.deepEqual(events.filter(e=>e[0]==='stop'),[['stop',1]]);audio.tick();assert.equal(audio.voices.length,1);
});
test('missing or failed incoming media preserves the existing ambient channel',async()=>{
 const {audio,driver}=setup();await audio.apply(0,ambient());audio.tick();const before=structuredClone(audio.voices);
 await assert.rejects(audio.apply(0,ambient({resource:22})),/Missing original/);assert.deepEqual(audio.voices,before);
 driver.prepareVoice=async()=>{throw Error('Decode failed');};await assert.rejects(audio.apply(0,ambient({resource:10})),/Decode failed/);assert.deepEqual(audio.voices,before);
});
test('same raw ambient ID in another archive follows the native asymmetric no-update comparison',async()=>{
 const {audio}=setup();await audio.apply(0,ambient());audio.tick();const before=structuredClone(audio.voices);
 await audio.apply(1,ambient({volume:.2,volumePercent:20}));assert.deepEqual(audio.voices,before);
});
test('black reveal includes the endpoint, uses two effect slots, and cleans its overlay',()=>{
 const draws=[],pictures=new Shibuya428Pictures({overlay:(...args)=>draws.push(args)});
 pictures.setup({effect:1,layer:1,parameters:[3]});pictures.setup({effect:11,layer:2,parameters:[]});
 assert.throws(()=>pictures.setup({effect:11,layer:3,parameters:[]}),/capacity/);
 for(let n=0;n<3;n++)pictures.tick();assert.equal(pictures.ready(1),false);pictures.tick();assert.equal(pictures.ready(1),true);
 assert.deepEqual(draws.map(d=>d[1]),[1,Math.fround(1-Math.fround(1/3)),Math.fround(1-Math.fround(2/3)),0]);
 pictures.finish(1);assert.deepEqual(draws.at(-1),[1,0]);assert.equal(pictures.effects.size,1);
});
test('ambient stop crosses archives, preserves effects and never revives an already stopping voice',async()=>{
 const {audio}=setup();await audio.apply(0,sound());await audio.apply(1,ambient());
 const effect=structuredClone(audio.voices.find(v=>v.category===2)),ambientVoice=audio.voices.find(v=>v.category===4);
 ambientVoice.status=3;await audio.apply(0,{type:'ambientStop',frames:0,delay:2,wait:0});
 assert.deepEqual(audio.voices.find(v=>v.category===2),effect);assert.equal(ambientVoice.status,3);
 assert.equal(ambientVoice.envelope.total,10);assert.equal(ambientVoice.envelope.delay,2);
 const before=structuredClone(audio.voices);await assert.rejects(audio.apply(0,{type:'ambientStop',frames:0,delay:2,wait:1}),/Unsupported/);assert.deepEqual(audio.voices,before);
});
test('colour transition holds its peak through the source delay and swaps once before fading out',()=>{
 let color,swaps=0;const p=new Shibuya428Pictures({colorOverlay:(_,rgba)=>{color=rgba;},showIncoming:()=>{swaps++;}});
 p.setup({effect:4,layer:1,parameters:[2,1,2,255,0,0,0]});
 p.tick();p.tick();assert.equal(swaps,0);p.tick();assert.deepEqual(color,[1,0,0,1]);
 p.tick();assert.equal(swaps,0);assert.deepEqual(color,[1,0,0,1]);p.tick();assert.equal(swaps,1);
 while(!p.ready(1))p.tick();assert.deepEqual(color,[0,0,0,0]);assert.equal(swaps,1);p.finish(1);assert.equal(p.effects.size,0);
 assert.throws(()=>p.setup({effect:4,layer:1,parameters:[2,1,2,255,0,0,1]}),/Unsupported/);assert.equal(p.effects.size,0);
});
