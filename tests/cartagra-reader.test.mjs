// Original synthetic SC3 instruction objects; no commercial scripts or assets.
import assert from 'node:assert/strict';import {test} from 'node:test';
import {CartagraEngine} from '../web/adapters/cartagra-engine.mjs';
import {glyphRuns,decodeGlyphText,validateGlyphMap} from '../web/adapters/cartagra-font.mjs';
import {plainText,characterCount} from '../web/engine.mjs';
const expr=n=>[{value:n}],instructions={};
const ins=(at,next,op,args=[])=>instructions[at]={id:`Startup.scr:${at.toString(16).padStart(8,'0')}`,offset:at,next,op,args};
ins(0x12c4,0x12c9,0x110,[0,0,0]);ins(0x12c9,0x12cb,0x111);
ins(0x12cb,0x12d0,0x114,[0,expr(0)]);ins(0x12d0,0x12d5,0x114,[1,1]);ins(0x12d5,0x12da,0x114,[1,2]);ins(0x12da,0x12e0,0x115,[2,expr(10)]);
ins(0x12e0,0x12e6,10,[1,[{op:40,precedence:10},{value:10}],1]);
ins(0x12e6,0x12ec,18,[expr(432)]);ins(0x12ec,0x12f0,7,[2]);
ins(0x12f0,0x12f6,18,[expr(433)]);ins(0x12f6,0x12fc,0x110,[0,0,3]);ins(0x12fc,0x1300,0x111);ins(0x1300,0x1302,0);
const source={format:'vnkit.cartagra-sc3',version:1,source:'Startup.scr',sha256:'synthetic',resource_index:0,labels:[0x12c4,0x12f0,0x12f6],instructions,raw_base64:btoa('synthetic'),strings:[0,1,2,3].map((n)=>({offset:10000+n,tokens:[{glyph:500+n}]}))};
const system={...source,source:'system.scr',resource_index:1};
const native={format:'vnkit.cartagra-native',version:1,executable_sha256:'synthetic',byteTable:Array(2243).fill(0),glyphWidths:Array(351).fill(24)};
const content={format:'vnkit.content',version:1,id:'synthetic-cartagra',assets:{font:{type:'image',url:'font.png'},native:{type:'script',url:'native.json'}},runtime:{id:'cartagra-ps2-sc3',version:1,textMode:'original-glyphs',native:'native.json',executable_sha256:'synthetic',scripts:{'Startup.scr':{url:'start.json',sha256:'synthetic',resource_index:0},'system.scr':{url:'system.json',sha256:'synthetic',resource_index:1}}}};
const create=()=>CartagraEngine.create(content,{loadJSON:async p=>({'native.json':native,'start.json':source,'system.json':system})[p],makeId:()=> 'synthetic-occurrence'});
test('source choice/flags survive save restoration; progress does not roll back',async()=>{
 const e=await create();await e.run();const first=e.save();assert.equal(e.current.text,'');assert.ok(e.current.sourceGlyphs);
 e.recordPresentation(e.current);assert.ok(e.isInheritedRead(e.current.id));await e.advance();assert.equal(e.current.kind,'choice');
 const choice=e.save();await e.advance('1');assert.equal(e.state.work[10],1);assert.equal(e.state.flags[433],1);const expected=e.save();
 const another=await create();await another.restore(choice);await another.advance('1');assert.deepEqual(another.save().state,expected.state);
 await e.restore(first);assert.equal(e.state.flags[433],1);assert.ok(e.isInheritedRead(e.current.id));
 await e.advance();await e.advance('0');assert.equal(e.state.flags[432],1);assert.equal(e.state.work[10],0);
 const beforeDebug=e.progressSnapshot();e.markRouteComplete('455');assert.equal(e.state.flags[462],1);e.applyProgress(beforeDebug);assert.equal(e.state.flags[462],undefined);assert.equal(e.state.manualCompletions['455'],undefined);
});
test('invalid choice, control and save data fail without changing execution state',async()=>{
 const e=await create();await e.run();await e.advance();const save=e.save();await assert.rejects(e.advance('77'));assert.deepEqual(e.state,save.state);
 for(const mutate of [s=>s.gameSignature='wrong',s=>s.state.pc++,s=>s.state.work[1280]=1,s=>s.state.sourceEvent.options[0].value=77,s=>s.state.pending.kind='movie',s=>s.state.stack.push({script:'absent',pc:1,buffer:0})]){
  const bad=structuredClone(save);mutate(bad);await assert.rejects(e.restore(bad));assert.deepEqual(e.state,save.state);
 }
 const unknown=structuredClone(source);unknown.instructions[0x12c4].op=0xffff;
 const fresh=await create();fresh.vm.scripts['Startup.scr']=unknown;const before=structuredClone(fresh.state);await assert.rejects(fresh.run(),/Unimplemented/);assert.deepEqual(fresh.state,before);
});
test('glyph ruby and speakers keep source identities without generating Unicode',()=>{
 const t=[{control:1},{glyph:500},{control:2},{control:9},{glyph:501},{control:10},{glyph:352},{control:11},{control:0},{glyph:502}];
 assert.deepEqual(glyphRuns(t),{speaker:[500],body:[{base:[501],reading:[352]},null,502]});
 assert.throws(()=>glyphRuns([{control:9},{glyph:1}]),/Unterminated/);
 assert.throws(()=>glyphRuns([{glyph:2880}]),/Invalid/);
});
test('reviewed glyph decoding preserves ruby, speakers and source failures',()=>{
 const review={format:'vnkit.cartagra-font-review',version:1,font_sha256:'synthetic',glyphs:[...'先生日本にほん'].map((character,n)=>({glyph:500+n,character,verified:true}))};
 const map=validateGlyphMap(review,'synthetic');
 const p=decodeGlyphText([{control:1},{glyph:500},{glyph:501},{control:2},{control:9},{glyph:502},{glyph:503},{control:10},{glyph:504},{glyph:505},{glyph:506},{control:11},{control:0}],map);
 assert.equal(p.speaker,'先生');assert.equal(plainText(p.text),'日本\n');assert.equal(plainText(p.text,'reading'),'にほん\n');assert.equal(characterCount(p.text),2);
 assert.throws(()=>decodeGlyphText([{glyph:999}],map,'synthetic:12'),/synthetic:12: unreviewed glyph 999/);
 assert.throws(()=>validateGlyphMap(review,'another-font'),/Wrong/);
 assert.throws(()=>validateGlyphMap({...review,glyphs:[{...review.glyphs[0],verified:false}]},'synthetic'),/Invalid/);
});
test('Unicode upgrade restores bitmap saves without changing flags, IDs or progress',async()=>{
 const old=await create();await old.run();old.recordPresentation(old.current);const save=old.save(),progress=old.progressSnapshot();
 const upgraded=structuredClone(content);upgraded.runtime.textMode='reviewed-unicode';upgraded.assets.glyphMap={type:'script',url:'map.json'};
 const map={format:'vnkit.cartagra-font-review',version:1,glyphs:[...'日本語文'].map((character,n)=>({glyph:500+n,character,verified:true}))};
 const fresh=await CartagraEngine.create(upgraded,{loadJSON:async p=>({'native.json':native,'start.json':source,'system.json':system,'map.json':map})[p],makeId:()=> 'synthetic-occurrence'});
 assert.equal(fresh.signature,old.signature);fresh.applyProgress(progress);await fresh.restore(save);
 assert.equal(plainText(fresh.current.text),'日');assert.equal(fresh.current.sourceGlyphs,undefined);assert.equal(fresh.current.occurrenceId,save.state.pending.occurrenceId);assert.ok(fresh.isInheritedRead(fresh.current.id));
 await fresh.advance();assert.deepEqual(fresh.current.options.map(o=>plainText(o.text)),['本','語']);assert.equal(fresh.current.sourceGlyphs,undefined);
 await fresh.advance('1');assert.equal(fresh.state.flags[433],1);assert.equal(plainText(fresh.current.text),'文');
 const missing={...map,glyphs:map.glyphs.slice(1)};
 await assert.rejects(CartagraEngine.create(upgraded,{loadJSON:async p=>({'native.json':native,'start.json':source,'system.json':system,'map.json':missing})[p]}),/unreviewed glyph/);
});
