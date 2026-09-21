// Original synthetic commands. No private text, assets or original route fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import {ClannadEngine,evaluate} from '../web/adapters/clannad-engine.mjs';
import {Activity} from '../web/statistics.mjs';
import {motionDuration,motionX,rotationDuration,rotationAngle} from '../web/adapters/clannad-motion.mjs';
import {eyecatchFrames,eyecatchDuration} from '../web/adapters/clannad-eyecatch.mjs';
import {swingFinishDuration} from '../web/adapters/clannad-swing.mjs';
const hash='1'.repeat(64),entry='SEEN0000.MZX';
function fixture(ops) {
 const instructions=ops.map((i,n)=>({id:`${entry}:${n.toString(16).padStart(8,'0')}`,offset:n,...i}));
 const script={format:'vnkit.clannad-script',version:1,source:entry,sha256:hash,instructions,labels:{}};
 instructions.forEach((i,n)=>{if(i.label)script.labels[i.label]=n;});
 const content={format:'vnkit.content',version:1,id:'original-clannad-adapter-test',runtime:{id:'clannad-ps2-hunex',version:1,entry,scripts:{[entry]:{url:'test.json',sha256:hash}}},nativeData:{format:'vnkit.clannad-native',version:1,default_names:{family:'海野',first:'夏'},name_substitutions:{'Ａ':['友達','先生']},evidence:{}},assets:{[`script:${entry}`]:{type:'script',url:'test.json'}}};
 let sequence=0;const options={makeId:()=>`occurrence-${sequence++}`,loadJSON:async()=>script};return {content,options};
}
const runToText=async engine=>{let r=await engine.run();while(r.pending?.kind==='wait')r=await engine.advance();return r.pending;};

test('manual completion preserves earned globals, adds each light once and follows native title gate',async()=>{
 const {content,options}=fixture([{op:'END_'}]);const e=await ClannadEngine.create(content,options);
 e.state.vars.G={0:0,32:1,51:9};
 for(const r of e.routeProgress().filter(r=>!r.after&&r.id!=='misae-light'))e.markRouteComplete(r.id);
 assert.equal(e.newGameEntries().some(r=>r.id==='after-story'),false);
 e.markRouteComplete('misae-light');assert.equal(e.newGameEntries().some(r=>r.id==='after-story'),true);
 assert.equal(e.state.vars.G[0],8);e.markRouteComplete('tomoyo');assert.equal(e.state.vars.G[0],8);
 assert.equal(e.state.vars.G[32],1);assert.equal(e.state.vars.G[51],9);
 const progress=e.progressSnapshot(),other=await ClannadEngine.create(content,options);other.applyProgress(progress);
 assert.deepEqual(other.progressSnapshot(),progress);assert.ok(other.routeProgress().find(r=>r.id==='ryou').manual);
 const fresh=await ClannadEngine.create(content,options);for(const r of fresh.routeProgress())fresh.markRouteComplete(r.id);assert.equal(fresh.state.vars.G[0],13);assert.equal(fresh.state.vars.G[32],1);assert.equal(fresh.state.vars.G[33],1);
 const bad=structuredClone(progress);bad.completions.unknown={method:'manual',at:new Date().toISOString()};assert.throws(()=>other.applyProgress(bad),/completion/);assert.deepEqual(other.progressSnapshot(),progress);
});
test('ordinary endings do not fabricate completion flags; date overlays use recovered assets',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'朝。'},{op:'WTKY'},{op:'END_'}]);
 content.assets.badge={type:'image',url:'badge.svg',width:100,height:86};content.nativeData.calendar={TEST:'badge'};content.nativeData.music={Test:2};content.assets['music:2']={type:'music',url:'music.wav'};
 const e=await ClannadEngine.create(content,options);await e.run();e.state.date='TEST';assert.deepEqual(e.sceneOverlays(),[]);e.state.vars.F[1112]=1;assert.equal(e.sceneOverlays()[0].asset,'badge');
 assert.deepEqual(e.soundtrack(),[{asset:'music:2',label:'Test'}]);await e.advance();e.finishEnding();assert.ok(e.routeProgress().every(r=>!r.complete));assert.deepEqual(e.sceneOverlays(),[]);
});

test('original synthetic branch, repeated text IDs, stable save restoration',async()=>{
 const {content,options}=fixture([
  {op:'CALC',assignment:{bank:'F',index:1,operator:'='},selection:{kind:'SEL',options:['海へ','山へ']}},
  {op:'IF__',expression:{operator:'==',left:{bank:'F',index:1},right:{number:0}}},
  {op:'IFJP',target:'mountain'},
  {op:'ZM',text:'同じ言葉。'},{op:'WTKY'}, {op:'GOTO',target:'end'},
  {op:'ZY',label:'mountain'},{op:'ZM',text:'同じ言葉。'},{op:'WTKY'},
  {op:'ZY',label:'end'},{op:'END_'}]);
 const engine=await ClannadEngine.create(content,options);await engine.run();const choice=engine.save();
 await engine.advance('0');const first=engine.current;const save=engine.save();
 await engine.advance();assert.equal(engine.current.kind,'end');
 await engine.restore(save);assert.deepEqual(engine.current,first);
 await engine.restore(choice);await engine.advance('1');assert.equal(engine.current.text,first.text);assert.notEqual(engine.current.id,first.id);assert.notEqual(engine.current.occurrenceId,first.occurrenceId);
 assert.equal(engine.state.vars.F[1],1);
 const bad=structuredClone(save);bad.state.pending.text='fabricated';await assert.rejects(engine.restore(bad),/differs from source/);
});

test('native name substitutions and complete message boundaries',async()=>{
 const {content,options}=fixture([{op:'LNIN'},{op:'ZM',text:'【％Ａ】＊Ａ＊Ｂさん。'},{op:'ZM',text:'夏ですね。'},{op:'WTKY'},{op:'END_'}]);
 const e=await ClannadEngine.create(content,options);const p=await runToText(e);
 assert.equal(p.speaker,'友達');assert.equal(p.text,'海野夏さん。夏ですね。');assert.equal(p.source.segments.length,2);
});

test('source name checks assign comparison results used by later conditions',async()=>{
 const {content,options}=fixture([{op:'NCK0',args:['海野','20']},{op:'NCK1',args:['春','21']},{op:'NCK2',args:['海野','夏','22']},{op:'NSC0',args:['海','23']},{op:'ZM',text:'朝。'},{op:'WTKY'}]);
 const e=await ClannadEngine.create(content,options);await e.run();assert.deepEqual(e.state.vars.F,{20:1,21:0,22:1,23:1});
 await e.restore(e.save());assert.equal(e.state.vars.F[22],1);
});
test('MSNL preserves simultaneous source text, separate location and name substitutions',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'【案内】朝。'},{op:'MSNL',args:['1','0','【＊Ｂ】昼。']},{op:'WTKY'}]);
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.text,'朝。\n【夏】昼。');assert.equal(e.current.source.segments.length,2);await e.restore(e.save());
 const activity=new Activity(content.id);activity.present(e.current);assert.equal(activity.totals().characters,4);
 assert.deepEqual(e.current.dialogue,[{speaker:'案内',text:'朝。'},{speaker:'夏',text:'昼。'}]);
 const bad=e.save();bad.state.pending.dialogue[1].text='偽';await assert.rejects(e.restore(bad),/differs from source/);
});
test('native swing follows lowering/signals/input/safe retirement and restores every phase',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','10','0','0']},{op:'ZM',text:'朝。'},{op:'WTKY'},
  {op:'EVTN',args:['0','1']},{op:'EVWT'},{op:'ZM',text:'昼。'},{op:'WTKY'},
  {op:'ZM',text:'夕。'},{op:'EVTN',args:['0','2']},{op:'EVWT'},{op:'EVTN',args:['0','3']},{op:'CLR_'},{op:'ZM',text:'夜。'},{op:'WTKY'}]);
 content.nativeData.events={10:{kind:'actor-swing',asset:'art',sound_asset:'effect',lower_frames:27,lower_pixels:180,y_scale:448/480,cycle_frames:49,exit_frames:[13,35]}};
 content.assets.art={type:'image',url:'art.svg'};content.assets.effect={type:'sound',url:'effect.wav'};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.ms,28*1000/60);await e.restore(e.save());
 await e.advance();assert.equal(e.current.text,'朝。');assert.equal(e.state.scene.task.phase,'lowered');await e.restore(e.save());
 await e.advance();assert.equal(e.current.kind,'wait');await e.restore(e.save());await e.advance();assert.equal(e.current.text,'昼。');
 await e.advance();assert.equal(e.current.nativeInput,true);assert.equal(e.current.presentation.text,'夕。');await e.restore(e.save());e.state.scene.task.elapsedMs=600;
 await e.advance();assert.equal(e.current.ms,swingFinishDuration(content.nativeData.events[10],600));await e.restore(e.save());
 await e.advance();assert.equal(e.current.text,'夜。');assert.equal(e.state.scene.task,null);
});

test('source newline command keeps formatting without counting a command or extra character',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'朝。'},{op:'MNWL'},{op:'ZM',text:'昼。'},{op:'WTKY'},{op:'END_'}]);
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.text,'朝。\n昼。');
 const activity=new Activity(content.id);activity.present(e.current);assert.equal(activity.totals().characters,4);await e.restore(e.save());assert.equal(e.current.text,'朝。\n昼。');
});

test('unresolved state commands fail at the original source position',async()=>{
 const {content,options}=fixture([{op:'UNKN',argument:'(123)'}]);const e=await ClannadEngine.create(content,options);
 await assert.rejects(e.run(),/SEEN0000.MZX:00000000: Unsupported/);assert.equal(e.state.pc,0);
});

test('window-off persists through a wait and save, then source text reopens it',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'朝。'},{op:'WTKY'},{op:'WCOF'},{op:'WTTM',args:['300']},{op:'ZM',text:'昼。'},{op:'WTKY'},{op:'END_'}]);
 const e=await ClannadEngine.create(content,options);await e.run();await e.advance();
 assert.equal(e.current.hideText,true);assert.equal(e.state.messageVisible,false);assert.equal(e.current.display.text,'朝。');
 const save=e.save();await e.advance();assert.equal(e.state.messageVisible,true);assert.equal(e.current.text,'昼。');
 await e.restore(save);assert.equal(e.state.messageVisible,false);assert.equal(e.current.hideText,true);
 await e.advance();assert.equal(e.state.messageVisible,true);assert.equal(e.current.text,'昼。');
});

test('voice-timed text appends at source cues and retains the same clip across saved continuations',async()=>{
 const {content,options}=fixture([{op:'VPLY',args:['A00001']},{op:'ZM',text:'【案内】朝。'},{op:'WTVT',args:['1700']},{op:'ZM',text:'昼。'},{op:'WTVT',args:['3400']},{op:'ZM',text:'夜。'},{op:'WTKY'},{op:'END_'}]);
 content.assets['voice:1']={type:'voice',url:'original.wav'};
 const e=await ClannadEngine.create(content,options),activity=new Activity(content.id);await e.run();
 assert.equal(e.current.voiceUntilMs,100*1000/60);assert.equal(e.current.continueVoice,undefined);activity.present(e.current);
 await e.advance();assert.equal(e.current.displayText,'朝。昼。');assert.equal(e.current.text,'昼。');assert.equal(e.current.voice,'voice:1');assert.equal(e.current.continueVoice,true);activity.present(e.current);
 const save=e.save({voice:{asset:'voice:1',time:2,paused:false}});await e.advance();assert.equal(e.current.displayText,'朝。昼。夜。');assert.equal(e.current.continueVoice,true);assert.equal(e.current.voiceUntilMs,undefined);activity.present(e.current);
 assert.equal(activity.totals().characters,6);await e.restore(save);assert.equal(activity.present(e.current),null);assert.equal(e.current.voiceUntilMs,200*1000/60);
 const bad=structuredClone(save);bad.state.pending.voiceUntilMs=1;await assert.rejects(e.restore(bad),/differs from source/);await e.advance();await e.advance();assert.equal(e.current.kind,'end');assert.equal(e.state.voice,null);
});

test('named sound lookup preserves source channel replacement, looping and stop order',async()=>{
 const {content,options}=fixture([{op:'SEPL',args:['kick']},{op:'SELP',args:['rain','1','0']},{op:'ZM',text:'雨。'},{op:'WTKY'},{op:'SESP',args:['1']},{op:'END_'}]);
 content.nativeData.sound_lookup={names:{KICK:{asset:'sound:10000'},RAIN:{asset:'sound:1'}}};
 for(const id of ['sound:10000','sound:1'])content.assets[id]={type:'sound',url:id.replace(':','-')+'.wav'};
 const e=await ClannadEngine.create(content,options),first=await e.run();
 assert.deepEqual(first.effects,[{op:'stopSound',channel:'source-sound:0'},{op:'sound',asset:'sound:10000',channel:'source-sound:0',loop:false},{op:'stopSound',channel:'source-sound:1'},{op:'sound',asset:'sound:1',channel:'source-sound:1',loop:true}]);
 const save=e.save({effects:[{asset:'sound:1',channel:'source-sound:1',time:2,paused:false,loop:true}]});
 await e.restore(save);assert.deepEqual((await e.run()).effects,[]);assert.deepEqual((await e.advance()).effects,[{op:'stopSound',channel:'source-sound:1'}]);
});

test('expressions short circuit and signed variables reject invalid values',()=>{
 assert.equal(evaluate({operator:'&&',left:{number:0},right:{operator:'/',left:{number:1},right:{number:0}}},{}),0);
 assert.equal(evaluate({operator:'+',left:{bank:'F',index:8},right:{number:3}},{F:{8:2}}),5);
});

test('native else-if uses false-branch flag and conditional jump bypasses label reset',async()=>{
 for(const value of [0,1,2]){
  const {content,options}=fixture([
   {op:'IF__',expression:{operator:'==',left:{number:value},right:{number:0}}},{op:'IFJP',target:'second'},
   {op:'ZM',text:'朝。'},{op:'WTKY'},{op:'ZY',label:'second'},
   {op:'EIF_',expression:{operator:'==',left:{number:value},right:{number:1}}},{op:'IFJP',target:'third'},
   {op:'ZM',text:'昼。'},{op:'WTKY'},{op:'ZY',label:'third'},
   {op:'ELS_'},{op:'IFJP',target:'end'},
   {op:'ZM',text:'夜。'},{op:'WTKY'},{op:'ZY',label:'end'},{op:'END_'}]);
  const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.text,['朝。','昼。','夜。'][value]);
  await e.advance();assert.equal(e.current.kind,'end');
 }
});

test('continuation retains DOM page but publishes/counts only newly appended source text',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'【案内】朝。'},{op:'WTK2'},{op:'ZM',text:'昼。'},{op:'WTKY'},{op:'WTKY'},{op:'END_'}]);
 const e=await ClannadEngine.create(content,options),activity=new Activity(content.id);await e.run();const first=e.current;activity.present(first);
 await e.advance();assert.equal(e.current.displayText,'朝。昼。');assert.equal(e.current.text,'昼。');assert.equal(e.current.speaker,'案内');assert.notEqual(e.current.id,first.id);activity.present(e.current);
 assert.equal(activity.totals().characters,4);const save=e.save();await e.restore(save);assert.equal(activity.present(e.current),null);
 await e.advance();assert.equal(e.current.kind,'pause');assert.equal(e.current.display.text,'朝。昼。');assert.equal(activity.present(e.current),null);
 await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'end');
});

test('failed compound call does not partially mutate stack or frame',async()=>{
 const {content,options}=fixture([{op:'FCAL',args:['500','absent']}]);
 content.runtime.scripts['SEEN0500.MZX']={url:'other.json',sha256:hash};content.assets['script:SEEN0500.MZX']={type:'script',url:'other.json'};
 const baseLoad=options.loadJSON;options.loadJSON=async url=>url==='test.json'?baseLoad(url):{...await baseLoad(url),source:'SEEN0500.MZX'};
 const e=await ClannadEngine.create(content,options),before=structuredClone(e.state);await assert.rejects(e.run(),/Unresolved label/);assert.deepEqual(e.state,before);
});

test('motion uses native 60Hz sampling, holds values and preserves termination',()=>{
 const d={frames:[{ms:16,x:0},{ms:16,x:12},{ms:16,x:null},{ms:0,x:null}]};
 assert.equal(motionDuration(d),50);assert.equal(motionX(d,0),0);assert.equal(motionX(d,17),12);assert.equal(motionX(d,49),12);
});

test('buffered dialogue/voice begins with native motion and survives its key wait exactly once',async()=>{
 const {content,options}=fixture([{op:'VPLY',args:['A00001']},{op:'ZM',text:'【案内】風だ。'},
  {op:'EVT0',args:['0','30','0','0']},{op:'WTKY'},{op:'ZM',text:'朝。'},{op:'WTKY'},{op:'END_'}]);
 content.nativeData.events={30:{kind:'actor-x-motion',frames:[{ms:280,x:24},{ms:0,x:null}],clear_actor_at_end:true,present_buffer:true}};
 content.assets['voice:1']={type:'voice',url:'original.wav'};
 const e=await ClannadEngine.create(content,options),activity=new Activity(content.id);await e.run();
 assert.equal(e.current.kind,'wait');assert.equal(e.current.presentation.text,'風だ。');assert.equal(e.current.presentation.voice,'voice:1');
 activity.present(e.current.presentation);e.current.remainingMs=100;const during=e.save({voice:{asset:'voice:1',time:.1,paused:false}});
 await e.restore(during);assert.equal(activity.present(e.current.presentation),null);
 for(const change of [s=>s.state.pending.presentation.text='偽',s=>s.state.pending.presentation.voice=null,s=>delete s.state.pending.presentation]){
  const bad=structuredClone(during);change(bad);await assert.rejects(e.restore(bad),/differs|missing/);
 }
 await e.advance();assert.equal(e.current.kind,'pause');assert.equal(e.current.display.text,'風だ。');assert.equal(e.state.scene.task,null);
 const after=e.save();await e.restore(after);await e.advance();assert.equal(e.current.text,'朝。');assert.equal(e.current.displayText,undefined);assert.equal(e.current.voice,null);
 activity.present(e.current);assert.equal(activity.totals().characters,5);assert.equal(activity.data.backlog.length,2);
});

test('native rotation retains its remaining wait and clears the actor before subsequent text',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','9','0','0']},{op:'ZM',text:'風が吹いた。'},{op:'WTKY'},{op:'END_'}]);
 const event={kind:'actor-rotation',asset:'image:original',hold_frames:2,duration_frames:8,angle_units_per_frame:-8,radians_per_unit:Math.PI/180,pivot:[20,30],clear_actor_at_end:true};
 content.nativeData.events={9:event};content.assets[event.asset]={type:'image',url:'original.svg',width:20,height:30};
 assert.equal(rotationAngle(event,0),0);assert.equal(rotationAngle(event,50),-8);assert.equal(rotationDuration(event),8*1000/60);
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.kind,'wait');assert.equal(e.state.scene.layers[0].asset,event.asset);
 e.current.remainingMs=50;const save=e.save();await e.advance();assert.equal(e.current.text,'風が吹いた。');assert.equal(e.state.scene.layers.length,0);
 await e.restore(save);assert.equal(e.current.remainingMs,50);assert.equal(e.state.scene.task.event,9);
 const bad=structuredClone(save);bad.state.scene.task.id='unknown';await assert.rejects(e.restore(bad),/Invalid saved native animation/);
 await e.advance();assert.equal(e.current.text,'風が吹いた。');assert.equal(e.state.scene.layers.length,0);
});

test('interlude crop progresses before final background and preserves source-reached wait on restore',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','75','0','0']},{op:'ZM',text:'海の向こう。'},{op:'WTKY'},{op:'END_'}]);
 const data={kind:'eyecatch',wait_frames:[0,0,0],fade_steps:[.5,.5],strip_last_counter:2,variants:[{background:'bg',strip:'strip',final_background:'white',white:true}]};
 for(const id of ['bg','strip','white'])content.assets[id]={type:'image',url:id+'.svg'};content.nativeData.events={75:data};
 const frames=eyecatchFrames(data);assert.equal(frames[0].alpha,0);assert.equal(frames.at(-1).overlay,1);assert.equal(frames.at(-1).row,1);assert.ok(frames.findIndex(f=>f.row===1)<frames.findIndex(f=>f.overlay===1));
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.ms,eyecatchDuration(data));
 e.current.remainingMs=25;const save=e.save();await e.advance();assert.equal(e.current.text,'海の向こう。');assert.equal(e.state.scene.background,'white');assert.equal(e.state.nextBackground,'white');
 await e.restore(save);assert.equal(e.current.remainingMs,25);assert.equal(e.state.scene.background,null);
 const bad=structuredClone(save);bad.state.scene.task.variant=1;await assert.rejects(e.restore(bad),/Invalid saved interlude variant/);await e.advance();assert.equal(e.state.scene.background,'white');
});

test('basic native counter events and channel signals preserve saved branch state',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','45','0','0']},{op:'EVT0',args:['0','49','14','0']},{op:'EVT0',args:['1','60','0','0']},{op:'EVT0',args:['0','53','0','0']},{op:'EVTN',args:['0','2']},{op:'EVT0',args:['0','52','0','0']},{op:'END_'}]);
 content.nativeData.sound_lookup={names:{DOGUSI:{asset:'sound:1'}}};content.assets['sound:1']={type:'sound',url:'test.wav'};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.state.vars.F[1115],7);await e.advance();await e.advance();assert.ok(e.state.nativeChannels[1]);
 await e.advance();assert.equal(e.state.vars.F[1114],1);assert.equal(e.state.vars.F[1116],1);assert.equal(e.state.nativeChannels[1],undefined);await e.restore(e.save());
 await e.advance();assert.equal(e.state.nativeChannels[0],undefined);assert.equal(e.state.vars.F[1115],21);await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'end');
});
test('SEB source options reflect levels and save validation rejects rewritten choices',async()=>{
 const {content,options}=fixture([{op:'CALC',assignment:{bank:'F',index:100,operator:'='},expression:{number:2}},{op:'CALC',assignment:{bank:'F',index:1089,operator:'='},selection:{kind:'SEB',options:['1','5']}},{op:'END_'}]);
 content.nativeData.special_choices=Array.from({length:15},(_,i)=>`試験${i}`);const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.options[0].text,'試験5');assert.equal(e.current.options[1].text,'試験1');await e.restore(e.save());
 const bad=e.save();bad.state.vars.F[100]=0;await assert.rejects(e.restore(bad),/choices differ/);await e.advance('1');assert.equal(e.state.vars.F[1089],1);
});
test('native transfer prompt preserves original boolean destination before subsequent conditions',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','77','0','0']},{op:'END_'}]);content.nativeData.basic_events={77:{prompt_asset:'prompt'}};content.assets.prompt={type:'image',url:'original-synthetic.svg'};
 const e=await ClannadEngine.create(content,options);await e.run();const save=e.save();assert.equal(e.current.kind,'choice');await e.restore(save);await e.advance('0');assert.equal(e.state.vars.F[1090],1);await e.restore(save);await e.advance('1');assert.equal(e.state.vars.F[1090],0);
});
test('native recovered buffer text remains one source event through its later key wait',async()=>{
 const {content,options}=fixture([{op:'EVT0',args:['0','70','0','0']},{op:'WTKY'},{op:'END_'}]);content.nativeData.basic_events={70:{buffer_text:'合成テスト。'}};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.presentation.text,'合成テスト。');await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'pause');await e.advance();assert.equal(e.current.kind,'end');assert.equal(e.state.buffer.length,0);
});
test('multi-actor composition retains position, layer order and opacity across restore',async()=>{
 const {content,options}=fixture([{op:'FADZ',args:['sky','0','2','a','120','0','255','b','-120','0','125']},{op:'ZM',text:'合成の場面。'},{op:'WTKY'}]);content.nativeData.backgrounds={sky:{archive_index:0}};content.nativeData.sprites={a:{body_index:1,face_index:2,face_x:8,face_y:9},b:{body_index:3,face_index:null}};
 for(let n=0;n<4;n++)content.assets[`image:${n}`]={type:'image',url:`test-${n}.svg`,width:640,height:448};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.state.scene.layers.length,3);assert.equal(e.state.scene.layers[2].opacity,125/255);assert.equal(e.state.scene.layers[0].x,120/640*100);assert.equal(e.state.scene.layers[1].x,128/640*100);await e.restore(e.save());
 const bad=e.save();bad.state.scene.layers[0].opacity=7;await assert.rejects(e.restore(bad),/composition/);
});
test('new playthrough preserves global progress, resets local flags and gates second entry',async()=>{
 const {content,options}=fixture([{op:'END_'}]);content.nativeData.initial_f={500:1};const e=await ClannadEngine.create(content,options);
 await e.startNew();assert.equal(e.state.vars.F[500],1);assert.equal(e.newGameEntries().length,1);
 e.state.vars.G={1:1,2:1,3:1,4:1,5:1,6:1,9:1,12:1,13:1,15:1,30:1,31:1,0:8};const progress=e.progressSnapshot();const next=await ClannadEngine.create(content,options);await next.startNew(progress);assert.equal(next.state.vars.G[73],2);assert.equal(next.newGameEntries()[1].id,'after-story');assert.equal(next.state.vars.G[0],8);assert.deepEqual(next.state.vars.F,{500:1});
 assert.throws(()=>next.applyProgress({...progress,gameId:'wrong'}),/incompatible/);assert.throws(()=>next.applyProgress({...progress,globals:{__invalid:1}}),/incompatible/);
});
test('source jump label, empty return and call depth follow native control behavior',async()=>{
 const {content,options}=fixture([{op:'FRET'},{op:'JUMP',args:['400','01']},{op:'END_'}]);const other='SEEN0400.MZX';content.runtime.scripts[other]={url:'other.json',sha256:hash};content.assets['script:'+other]={type:'script',url:'other.json'};
 const load=options.loadJSON;options.loadJSON=async url=>url==='test.json'?load(url):{format:'vnkit.clannad-script',version:1,source:other,sha256:hash,labels:{Z01:1},instructions:[{id:other+':00000000',offset:0,op:'UNKN'},{id:other+':00000001',offset:1,op:'ZZ',label:'Z01'},{id:other+':00000002',offset:2,op:'END_'}]};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.id,other+':00000002');await e.restore(e.save());
});
test('timed text, immediate voice completion and source movie have resumable boundaries',async()=>{
 const {content,options}=fixture([{op:'ECTS',args:['4']},{op:'ZM',text:'合成の歌。'},{op:'ECTW',args:['2000','4']},{op:'CLR_'},{op:'VPL2',args:['A00001']},{op:'VCWT'},{op:'MVPL',args:['0','1']},{op:'END_'}]);
 content.assets['voice:1']={type:'voice',url:'test.wav',samples:8000,sampleRate:8000};content.assets['video:opening']={type:'video',url:'test.webm'};
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.ms,2000);assert.equal(e.current.presentation.text,'合成の歌。');await e.restore(e.save());await e.advance();assert.equal(e.current.voiceWait,true);assert.equal(e.current.ms,1000);await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'movie');await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'end');
});
test('known native parameter quirks preserve quotes, extract numeric F index and reject unknown legacy',async()=>{
 const {content,options}=fixture([{op:'NCK0',args:['"海野"','F[1091]']},{op:'legacy',argument:'mouseclear',unsupported:'unknown'},{op:'SESP',args:['015']},{op:'END_'}]);const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.state.vars.F[1091],0);
 const other=fixture([{op:'legacy',argument:'UNKNOWN(1)'}]);await assert.rejects((await ClannadEngine.create(other.content,other.options)).run(),/Unresolved legacy/);
});

test('timed narrative and native clear flush source text instead of discarding it',async()=>{
 const {content,options}=fixture([{op:'ZM',text:'朝。'},{op:'WTTM',args:['800']},{op:'ZM',text:'昼。'},{op:'WTTM',args:['800']},{op:'CLOS'},{op:'ZM',text:'夕。'},{op:'CLR_'},{op:'WTKY'},{op:'END_'}]);
 const e=await ClannadEngine.create(content,options);await e.run();assert.equal(e.current.presentation.text,'朝。');await e.restore(e.save());await e.advance();assert.equal(e.current.presentation.text,'昼。');assert.equal(e.current.presentation.displayText,'朝。昼。');await e.restore(e.save());await e.advance();assert.equal(e.current.flushText,true);assert.equal(e.current.presentation.text,'夕。');await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'pause');assert.equal(e.current.display.text,'夕。');await e.advance();assert.equal(e.current.kind,'end');
});
