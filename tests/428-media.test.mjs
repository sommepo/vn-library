import test from 'node:test';
import assert from 'node:assert/strict';
import {decode428Presentation, require428OpeningCommand} from '../web/adapters/shibuya428-media.mjs';
import {Shibuya428VM} from '../web/adapters/shibuya428-vm.mjs';
import {Shibuya428OpeningPresentation} from '../web/adapters/shibuya428-presentation.mjs';
const instruction=(code,args)=>({id:'synthetic:media',code,args});
const decode=(code,args)=>decode428Presentation(instruction(code,args));
test('direct sound properties retain optional timing and reject unknown fields',()=>{
 const command=decode(0x7e,[0,9,1,0,0,70,2,0,30,0,0]);
 assert.deepEqual(command,{type:'soundDirect',resource:9,changes:[{field:1,mode:0,value:Math.fround(.7)},{field:2,value:30}],flags:0});
 assert.doesNotThrow(()=>require428OpeningCommand(command));
 assert.throws(()=>decode(0x7e,[0,9,7,0,30,0,0]),/Unknown direct/);
 assert.throws(()=>require428OpeningCommand({...command,flags:1}),/Unsupported direct/);
});
test('embedded movie audio requires converted media and an audio-capable driver',async()=>{
 const starts=[];
 const driver={frame:async()=>{},picture:async()=>{},text:()=>{},movie:async(...args)=>starts.push(args),prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}};
 const asset={type:'movie',hasAudio:true,audioConverted:false,url:'synthetic.webm'};
 const presenter=new Shibuya428OpeningPresentation(driver,{'0:1':asset});
 const event={kind:'presentation',id:'audio-movie',script:0,command:{type:'movie',resource:1,layer:1,volumePercent:70,yieldFrame:0}};
 await assert.rejects(presenter.apply(event),/audio or playback/);
 asset.audioConverted=true;await assert.rejects(presenter.apply(event),/audio or playback/);
 driver.movieAudio=true;await presenter.apply(event);
 assert.equal(starts.length,1);assert.equal(starts[0][2].volume,0.7);
});
test('timeline pause retries acknowledge once and freeze source glyph clocks',async()=>{
 let fail=true,pauses=0,resets=0,defaults=0;
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},
  pauseScene:async()=>{pauses++;if(fail)throw Error('Pause interrupted');},reset:async()=>{resets++;},
  prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},
 },{},{textKernel:{defaults:[],fragment:()=>[{nativeIndex:0}],reset:()=>{},resetDefaults:()=>{defaults++;}}});
 p.cadence=0;await p.apply({kind:'presentation',command:{type:'textFade',frames:20}});
 await p.apply({kind:'presentation',command:{type:'textFragment',text:'文'}});
 const event={kind:'presentation',id:'pause',command:{type:'menuPause',frames:16}};
 await assert.rejects(p.apply(event),/Pause interrupted/);assert.ok(!p.scenePaused);
 fail=false;assert.deepEqual(await p.apply(event),{freeMovieChannel:1});const glyph=structuredClone(p.glyphs[0]);
 for(let n=0;n<30;n++)p.tick();assert.deepEqual(p.glyphs[0],glyph);
 await p.apply(event);assert.equal(pauses,2);
 await p.apply({kind:'presentation',command:{type:'timelineSelected'}});
 assert.equal(resets,1);assert.equal(defaults,1);assert.equal(p.scenePaused,false);assert.equal(p.text,'');
});
test('VM keeps its paused-menu boundary until streaming channel state is acknowledged',async()=>{
 const v=fixture([[0x1e]]);v.state.menuController={menu:4,frames:16,returnController:5};
 v.state.pending={kind:'presentation',id:'pause',command:{type:'menuPause',frames:16}};const before=v.captureState();
 await assert.rejects(v.present({apply:async()=>{}}),/streaming channel state/);assert.deepEqual(v.captureState(),before);
 await v.present({apply:async()=>({freeMovieChannel:1})});assert.equal(v.state.pending.kind,'menuPaused');
 assert.equal(v.state.menuController.freeMovieChannel,1);assert.throws(()=>v.advance(),/timeline controller/);
});
test('movie blending waits for decoded media and a failed acknowledgement does not restart playback',async()=>{
 let release,starts=0,fail=true,blend;
 const p=new Shibuya428OpeningPresentation({frame:async()=>{if(fail)throw Error('frame failure');},picture:async()=>{},text:()=>{},
  prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},blend:()=>{},finishBlend:()=>{},
  movie:async(_,__,options)=>{blend=options.blend;await new Promise(r=>{release=r;});starts++;}
 },{'0:1':{type:'movie',hasAudio:false,url:'synthetic.webm'}});
 await p.apply({kind:'presentation',id:'effect',script:0,command:{type:'pictureEffect',effect:3,layer:1,parameters:[4]}});
 const event={kind:'presentation',id:'movie',script:0,command:{type:'movie',resource:1,layer:1,volumePercent:0,yieldFrame:1}};
 const pending=p.apply(event);const frame=p.effects.get(1).frame;
 for(let n=0;n<10;n++)p.tick();assert.equal(p.effects.get(1).frame,frame);assert.equal(blend,true);
 release();await assert.rejects(pending,/frame failure/);assert.equal(starts,1);
 await assert.rejects(p.apply({...event,id:'different'}),/acknowledgement is still pending/);
 fail=false;await p.apply(event);assert.equal(starts,1);assert.equal(p.movieStart,null);assert.equal(p.effects.get(1).frame,frame+1);
});
test('sound completion retries continue the existing voices after a frame failure',async()=>{
 let p,starts=0,frames=0,fail=true;
 const driver={picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{starts++;},gainVoice:()=>{},stopVoice:()=>{},frame:async()=>{
  frames++;if(frames===2&&fail)throw Error('frame failure');if(frames===5)for(const v of [...p.audio.voices])p.audio.ended(v.id);
 }};
 p=new Shibuya428OpeningPresentation(driver,{'0:9':{type:'audio',url:'synthetic.wav'}});
 const command=decode(0x7a,[0,9,0,37,...Array(14).fill(0),1]),event={kind:'presentation',script:0,id:'waited-sound',command};
 await assert.rejects(p.apply(event),/frame failure/);assert.equal(starts,1);assert.equal(p.soundWait.id,event.id);
 await assert.rejects(p.apply({...event,id:'later-sound'}),/completion is still pending/);assert.equal(starts,1);
 fail=false;await p.apply(event);assert.equal(starts,1);assert.equal(p.soundWait,null);assert.equal(p.audio.voices.length,0);
});
function fixture(rows) {
  const script={index:0,size:rows.length+1,content_offset:0,labels:{start:{offset:0,bucket:0,table_offset:0}},
    tokens:rows.map(([code,args],offset)=>({id:`synthetic:${offset}`,offset,next:offset+1,code,
      ...(typeof args==='string'?{text:args}:{args:args||[]})}))};
  return new Shibuya428VM({0:script},{script:0,label:'start'},{presentation:'sns-numeric-v1'});
}
test('picture parameter consumption follows the native effect table, not the ignored count byte',()=>{
  assert.deepEqual(decode(0x63,[1,2,99,255,254]),{type:'pictureEffect',effect:1,layer:2,sourceCount:99,parameters:[-2]});
  assert.deepEqual(decode(0x63,[11,2,99]).parameters,[]);
  for(const args of [[0,1,0],[15,1,0],[1,2,0],[11,1,0,0]])assert.throws(()=>decode(0x63,args));
  assert.throws(()=>require428OpeningCommand(decode(0x63,[10,1,1,0,8])),/renderer/);
  assert.doesNotThrow(()=>require428OpeningCommand(decode(0x63,[11,2,0])));
  assert.throws(()=>require428OpeningCommand(decode(0x63,[11,3,0])),/layer transition/);
});
test('sound operands retain signed pan, selector, float bits and resource flags',()=>{
  const s=decode(0x7a,[128,9,0,37,255,156,0,60,0,2,0,3,0,1,63,192,0,0,3,128,11]);
  assert.deepEqual(s,{type:'sound',resource:0x8009,volumePercent:37,volume:Math.fround(.37),pan:-100,spatialDistance:60,
    parameterA:2,parameterB:3,selector:1,parameterFloat:1.5,floatBits:0x3fc00000,flags:3,secondaryResource:0x800b});
  assert.throws(()=>require428OpeningCommand(s),/playback mode/);
  assert.throws(()=>decode(0x7a,[0,9,0,37,0,0,0,0,0,0,0,0,0,0,127,128,0,0,0]),/Non-finite/);
  assert.throws(()=>decode(0x7a,Array(18).fill(0)),/Truncated/);
});
test('visible fragments and logical text boundaries remain distinct, including ruby and retained pages',async()=>{
  const v=fixture([[0x1c],[1,'reading'],[0x1d],[1,'本の文'],[0x1b],[0x1e],[1,'次の文'],[0x1e]]);
  const events=[],presenter={apply:async e=>events.push(e)};
  assert.equal(v.run().command.type,'rubyStart');await v.present(presenter);
  assert.equal(v.run().command.text,'本の文');
  assert.throws(()=>v.advance(),/acknowledgement/);
  await v.present(presenter);assert.equal(v.run().command.type,'newline');await v.present(presenter);
  const first=v.run();assert.equal(first.kind,'text');assert.equal(first.text,'本の文');
  assert.deepEqual(first.fragments,['synthetic:3']);
  await v.present(presenter);assert.equal(v.run().command.text,'次の文');await v.present(presenter);
  assert.equal(v.run().pageText,'本の文\n次の文');
  assert.equal(events.filter(e=>e.command?.type==='textFragment').length,2);
});
test('failed or overlapping acknowledgements retain the pending media event',async()=>{
  const v=fixture([[0x44,[0,9,1,1]],[0xfe]]);v.run();const before=v.captureState();
  await assert.rejects(v.present({apply:async()=>{throw Error('Missing source picture');}}),/Missing source/);
  assert.deepEqual(v.captureState(),before);
  let release;const pending=v.present({apply:()=>new Promise(resolve=>{release=resolve;})});
  for(const fn of [()=>v.advance(),()=>v.run(),()=>v.step(),()=>v.rollback(before),()=>v.jump({script:0,label:'start'})])
    assert.throws(fn,/in progress/);
  await assert.rejects(v.present({apply:async()=>{}}),/in progress/);
  release();await pending;assert.equal(v.state.pending,null);
  const committed=v.captureState();assert.throws(()=>v.run(),/0xfe/);assert.deepEqual(v.captureState(),committed);
});
test('already presented audio is not replayed when the next instruction fails',async()=>{
  const v=fixture([[0x7a,[0,9,0,37,...Array(15).fill(0)]],[0xfe]]);let played=0;
  v.run();await v.present({apply:async()=>{played++;}});
  for(let n=0;n<2;n++)assert.throws(()=>v.run(),/Unsupported/);
  assert.equal(played,1);assert.equal(v.state.pc,1);assert.equal(v.state.pending,null);
});
test('Next retains the displayed page for a source fade, then checkpoint clears it',async()=>{
 let draw,resets=0;const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},text:(text,alpha)=>{draw={text,alpha};}}, {},{textKernel:{defaults:[],reset:()=>{resets++;},fragment:()=>[]}});
 p.cadence=0;await p.apply({kind:'presentation',command:{type:'textFragment',text:'言葉'}});
 await p.apply({kind:'text',clear:true});assert.equal(draw.text,'言葉');assert.equal(resets,0);
 await p.apply({kind:'presentation',command:decode(0x0c,[0,0,0,4])});
 await p.frames(2);assert.deepEqual(draw,{text:'言葉',alpha:[.5,.5]});
 await p.apply({kind:'presentation',command:decode(0x10,[])});assert.deepEqual(draw.alpha,[0,0]);
 await p.apply({kind:'checkpoint'});assert.equal(draw.text,'');assert.equal(resets,1);
});
test('animated punctuation contributes semantic ellipses once while drawing three native dots',async()=>{
  const v=fixture([[1,'文'],[0x43,[2,0]],[0x1e]]),events=[];
  v.run();await v.present({apply:async e=>events.push(e)});
  assert.deepEqual(v.run().command,{type:'ellipsis',count:2,cadence:0});
  await v.present({apply:async e=>events.push(e)});
  assert.equal(v.run().text,'文……');assert.deepEqual(v.state.pending.fragments,['synthetic:0','synthetic:1']);
  const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},
    prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}},{},{textKernel:{
      defaults:[{type:'textDefaultCadence',frames:7}],ellipsis:()=>Array.from({length:6},()=>({index:0}))}});
  await p.apply(events[1]);assert.equal(p.text,'……');assert.equal(p.glyphs.length,6);assert.equal(p.frame,7);
  assert.deepEqual(p.glyphs.map(g=>g.textOffset),[0,0,0,1,1,1]);
  await p.apply({kind:'presentation',command:{type:'textCadence',frames:2}});
  await p.apply({kind:'presentation',command:decode(0x25,[])});assert.equal(p.cadence,7);
});
test('source fade continues after its end command, sound plays create separate voices, unsupported modes stay pending',async()=>{
  let draws=[],voices=[];
  const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},
    prepareVoice:async()=>{},startVoice:v=>voices.push(v),gainVoice:()=>{},stopVoice:()=>{},text:(text,alpha)=>draws.push({text,alpha})},{'0:9':{type:'audio',url:'synthetic.wav'}});
  const event=command=>({kind:'presentation',script:0,id:'synthetic',command});
  await p.apply(event(decode(3,[0,0,0,12])));
  await p.apply(event({type:'textFragment',text:'言葉'}));
  await p.apply(event(decode(4,[])));assert.equal(p.fade,null);assert.ok(p.glyphs.every(g=>g.active));
  assert.ok(p.glyphs[0].opacity>p.glyphs[1].opacity);
  await p.apply(event(decode(0x10,[])));assert.equal(p.fade,null);
  assert.deepEqual(draws.at(-1),{text:'言葉',alpha:[1,1]});
  const sound=decode(0x7a,[0,9,0,37,...Array(15).fill(0)]);
  await p.apply(event(sound));await p.apply(event(sound));await p.frames(1);assert.equal(voices.length,2);
  await assert.rejects(p.apply(event({...sound,resource:0x4009})),/playback mode/);assert.equal(voices.length,2);
  await assert.rejects(p.apply(event({...sound,resource:10})),/Missing original/);assert.equal(voices.length,2);
});
test('inline rules follow their preceding native glyph alpha and count semantic punctuation once',async()=>{
 const v=fixture([[1,'文'],[0x2b,[2]],[0x1e]]);v.run();await v.present({apply:async()=>{}});
 const event=v.run();assert.deepEqual(event.command,{type:'textRule',count:2});await v.present({apply:async()=>{}});assert.equal(v.run().text,'文――');
 let alpha;const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:(_,a)=>{alpha=a;},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}},{},{textKernel:{defaults:[],fragment:()=>[{nativeIndex:0}],rule:()=>[{kind:'rule',anchorIndex:0}]}});
 p.cadence=0;await p.apply({kind:'presentation',command:{type:'textFade',frames:3}});
 await p.apply({kind:'presentation',command:{type:'textFragment',text:'文'}});await p.apply(event);
 assert.equal(alpha[1],1);p.tick();assert.equal(alpha[0],42/128);assert.equal(alpha[1],Math.fround(128/3)/128);
 assert.equal(p.text,'文――');assert.equal(p.glyphs.length,2);
});
test('movie presentation awaits decoded readiness, yields one frame, and rejects unimplemented audio',async()=>{
 let release,started=0,stopped=0;const driver={frame:async()=>{},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},movie:()=>{started++;return new Promise(r=>{release=r;});},movieStop:async()=>{stopped++;}};
 const assets={'0:1':{type:'movie',hasAudio:false}},p=new Shibuya428OpeningPresentation(driver,assets);
 const event=command=>({kind:'presentation',script:0,id:'synthetic',command});
 await p.apply(event({type:'pictureEffect',effect:11,layer:1,parameters:[]}));
 const pending=p.apply(event(decode(0x9c,[0,1,0,70,1,1])));assert.equal(started,1);assert.equal(p.frame,0);release();await pending;assert.equal(p.frame,1);
 await p.apply(event(decode(0x9d,[0,1,1])));assert.equal(stopped,1);
 assets['0:1'].hasAudio=true;await assert.rejects(p.apply(event(decode(0x9c,[0,1,0,70,1,1]))),/audio/);assert.equal(started,1);
});
test('ruby layouts display with their base glyph without inflating semantic text',async()=>{
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}},{},{textKernel:{defaults:[],ruby:()=>{},fragment:()=>[{nativeIndex:0,ruby:[{nativeIndex:1},{nativeIndex:2}]}]}});
 p.cadence=2;await p.apply({kind:'presentation',command:{type:'rubyStart'}});await p.apply({kind:'presentation',command:{type:'textFragment',text:'文'}});
 assert.equal(p.frame,2);assert.equal(p.text,'文');assert.equal(p.glyphs.length,3);assert.deepEqual(p.glyphs.map(g=>g.textOffset),[0,0,0]);
});
test('interrupted text rendering restores native layout and retries without duplication',async()=>{
 let cursor=0,fail=true,drawn='';
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},text:value=>{if(fail&&value.length===2){fail=false;throw Error('Display interrupted');}drawn=value;}},{},{textKernel:{
  defaults:[],checkpoint:()=>({cursor}),restore:s=>{cursor=s.cursor;},fragment:()=>{cursor+=2;return [{index:1},{index:2}];}}});
 const event={kind:'presentation',command:{type:'textFragment',text:'言葉'}};
 await assert.rejects(p.apply(event),/interrupted/);assert.equal(cursor,0);assert.equal(p.text,'');assert.equal(drawn,'');
 await p.apply(event);assert.equal(cursor,2);assert.equal(p.text,'言葉');assert.equal(drawn,'言葉');assert.equal(p.glyphs.length,2);
});
test('batch fades retain selectable text while restoring default cadence and reaching either alpha endpoint',async()=>{
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}},{});
 for(const [begin,end,opacity]of [[5,6,128],[9,10,0]]){
  p.cadence=7;await p.apply({kind:'presentation',command:decode(begin,[0,0,0,4])});
  const frame=p.frame;await p.apply({kind:'presentation',command:{type:'textFragment',text:'言葉'}});
  assert.equal(p.frame,frame);await p.apply({kind:'presentation',command:decode(end,[])});assert.equal(p.cadence,p.defaultCadence);
  await p.apply({kind:'presentation',command:{type:'textWait'}});assert.ok(p.glyphs.slice(-2).every(g=>g.opacity===opacity&&!g.active));
 }
 assert.equal(p.text,'言葉言葉');
});
test('failed choice highlighting restores both native state and visible glyph colours',async()=>{
 let current=0,fail=false;const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},text:()=>{if(fail){fail=false;throw Error('Display interrupted');}},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{}},{},{textKernel:{
  defaults:[],checkpoint:()=>({current}),restore:s=>{current=s.current;},fragment:()=>[{nativeIndex:0,color:[1,1,1]}],highlightChoice:index=>{current=index;return [{kind:'colorRange',start:0,end:0,color:[1,.5,0]}];}}});
 await p.apply({kind:'presentation',command:{type:'textFragment',text:'文',choiceIndex:1}});fail=true;
 assert.throws(()=>p.highlightChoice(1),/interrupted/);assert.equal(current,0);assert.deepEqual(p.glyphs[0].layout.color,[1,1,1]);assert.equal(p.glyphs[0].layout.choiceIndex,1);
 p.highlightChoice(1);assert.equal(current,1);assert.deepEqual(p.glyphs[0].layout.color,[1,.5,0]);
});
test('TIP body retains the selectable heading and retries a failed layer change without duplication',async()=>{
 let cursor=0,fail=false,last;
 const p=new Shibuya428OpeningPresentation({frame:async()=>{},picture:async()=>{},tip:async()=>{},prepareVoice:async()=>{},startVoice:()=>{},gainVoice:()=>{},stopVoice:()=>{},text:(text,alpha,layouts)=>{
  if(fail){fail=false;throw Error('TIP display interruption');}last={text,layouts};
 }},{},{textKernel:{defaults:[],checkpoint:()=>({cursor}),restore:s=>{cursor=s.cursor;},hintReset:()=>{cursor=0;},
  tipPage:()=>{cursor=0;},newline:()=>{},fragment:()=>[{index:1,nativeIndex:cursor++,color:[1,1,1]}]}});
 const event=(type,extra={})=>({kind:'presentation',command:{type,...extra}});
 p.cadence=4;await p.apply(event('tipOpened'));await p.apply(event('tipTitle',{style:0}));
 await p.apply(event('textFragment',{text:'題'}));await p.apply(event('newline'));
 fail=true;await assert.rejects(p.apply(event('tipBody')),/display interruption/);
 assert.equal(p.text,'題\n');assert.equal(cursor,1);assert.equal(p.tipHeading,null);
 await p.apply(event('tipBody'));await p.apply(event('textFragment',{text:'文'}));
 assert.equal(last.text,'題\n文');assert.deepEqual(last.layouts.filter(Boolean).map(g=>g.textOffset),[0,2]);
 p.applyTextChanges([{kind:'colorRange',start:0,end:0,color:[.25,.375,.5]}]);p.draw();
 assert.deepEqual(last.layouts.filter(Boolean).map(g=>g.color),[[1,1,1],[.25,.375,.5]]);
 await p.apply(event('tipReturned'));assert.equal(last.text,'');await p.apply(event('tipReplayEnd'));assert.equal(p.cadence,4);
 await assert.rejects(p.apply(event('tipReplayEnd')),/Missing TIP return cadence/);
});
