// Original synthetic instructions only. Actual-disc routes have separate tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ever17Engine} from '../web/adapters/ever17-engine.mjs';
const name='00000-ORIGINAL.BIP',hash='f'.repeat(64);
const ins=(offset,sourceOp,sub,extra={})=>({offset,id:`${name}:${offset.toString(16).padStart(4,'0')}`,sourceOp,op:sourceOp,sub,words:[sourceOp,0,0],next:offset+2,name:'synthetic',...extra});
function fixture(){
  const rows=[ins(0,9,15,{words:[9,6,0x6000],jumpTable:{0:2,1:8}}),
    ins(2,31,0,{text:'テスト。%03%K%P',voice:65535,readId:1}),
    ins(4,1,2),ins(6,31,0,{text:'続き。%P',voice:65535,readId:2}),ins(8,13,0),ins(10,1,1)];
  const data={format:'vnkit.ever17-script',version:1,source:name,sha256:hash,instructions:Object.fromEntries(rows.map(i=>[i.offset,i]))};
  const c={format:'vnkit.content',version:1,id:'original-ever17-test',assets:{},runtime:{id:'ever17-ps2-kid',version:1,entry:name,scripts:{[name]:{url:'script.json',sha256:hash}},byResource:{0:name}}};
  return {c,data,loadJSON:async()=>structuredClone(data)};
}
test('native credits resume the source epilogue, final end returns to menu',async()=>{
  const {c,loadJSON}=fixture(),e=await Ever17Engine.create(c,{loadJSON});await e.startNew();
  assert.equal(e.current.text,'テスト。');const before=e.save();await e.advance();
  assert.equal(e.current.text,'続き。');assert.equal(e.state.ended,false);assert.equal(e.state.credits.source,`${name}:0004`);
  const after=e.save();await e.restore(before);await e.advance();assert.equal(e.current.id,after.state.pending.id);
  await e.advance();assert.equal(e.current.kind,'pause');await e.restore(e.save());await e.advance();assert.equal(e.current.kind,'end');
});
test('external selectors choose evidenced entries and reject an unknown selector',async()=>{
  const {c,loadJSON}=fixture(),e=await Ever17Engine.create(c,{loadJSON});e.assign(0x6000,1);await e.run();assert.equal(e.current.kind,'pause');
  const bad=await Ever17Engine.create(c,{loadJSON});bad.assign(0x6000,2);const before=bad.save();await assert.rejects(bad.run(),/Unestablished external entry selector/);assert.deepEqual(bad.state,before.state);
});
test('Ever17 CG calculation does not mutate a story variable or reuse R11 saturation opcode',async()=>{
  const {c,loadJSON}=fixture(),e=await Ever17Engine.create(c,{loadJSON});
  e.assign(0x6011,250);e.calculate(ins(0,9,17,{words:[9,0x2004,1]}));assert.equal(e.state.catalog.cg[4],true);assert.equal(e.value(0x6011),250);
  e.calculate(ins(0,9,18,{words:[9,0x6011,20]}));assert.equal(e.value(0x6011),255);
  e.calculate(ins(0,9,19,{words:[9,0x6011,260]}));assert.equal(e.value(0x6011),0);
});
test('480-line portraits retain the native centre anchor',async()=>{
  const {c,loadJSON}=fixture(),e=await Ever17Engine.create(c,{loadJSON});
  c.assets['image:12288']={type:'image',url:'original.png',width:640,height:480};
  e.state.graphics[1]={asset:'image:12288',x:320,y:16,z:1,visible:true};e.compose();assert.equal(e.state.scene.layers[0].x,0);assert.equal(e.state.scene.layers[0].y,-16/480*100);assert.equal(e.state.scene.layers[0].height,100);
});
test('completed-route assumptions remain separate from source progress and save state',async()=>{
  const {c,loadJSON}=fixture(),e=await Ever17Engine.create(c,{loadJSON});await e.run();e.markRouteComplete('tsugumi');
  const p=e.progressSnapshot(),fresh=await Ever17Engine.create(c,{loadJSON});fresh.applyProgress(p);
  assert.equal(fresh.routeProgress()[0].complete,true);assert.deepEqual(fresh.state.vars.local,{});
  assert.equal(fresh.value(0x803b),0);
  for(const id of ['sora','you','sara'])fresh.markRouteComplete(id);
  assert.equal(fresh.value(0x803b),1);assert.equal(fresh.value(0x803a),0);
  assert.equal(fresh.value(0x8034),1);assert.equal(fresh.value(0x8037),1);
  const invalid=structuredClone(p);invalid.completions.invented=true;assert.throws(()=>fresh.applyProgress(invalid),/provenance/);
});
