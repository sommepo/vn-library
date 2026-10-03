import test from 'node:test';
import assert from 'node:assert/strict';
import {Operands, compare, condition, decodeBranch, decodeChoice, decodeCheckpoint, decodeSystem, decodeLink, evaluate, choiceText, validateControl} from '../web/adapters/shibuya428-control.mjs';
const i = (code,args=[]) => ({id:'fixture:0:10',code,args});
const label = text => [...Buffer.from(text),0];
const flags = () => Array(2048).fill(0);

test('SNS comparisons include both equality encodings and native direction',()=>{
  assert.deepEqual([6,7,8,9,10,11,12].map(op=>compare(2,op,3)),[false,false,false,true,false,true,true]);
  assert.deepEqual([6,7,8,9,10,11,12].map(op=>compare(3,op,3)),[true,true,false,false,true,true,false]);
  assert.throws(()=>compare(1,0,0),/Unsupported/);
});
test('simple SNS branch uses a big endian flag index and unsigned literal',()=>{
  const b=decodeBranch(i(0x57,[1,2,8,0,0,3,...label('fallback')])), f=flags();
  assert.deepEqual(b.target,{script:3,label:'fallback'});
  assert.equal(evaluate(b.clauses,f),false);f[258]=2;assert.equal(evaluate(b.clauses,f),true);
});
test('compound conditions count predicates, use left-to-right joins and flag operands',()=>{
  const r=new Operands(i(0x57,[255,253,0x57,0,2,7,0,1,0,0x57,0,3,7,0,1,1,0x58,0,4,7,0,5]));
  const clauses=condition(r);r.end();const f=flags();f[2]=1;f[3]=0;f[4]=7;f[5]=6;
  assert.equal(evaluate(clauses,f),false); // (true OR false) AND false
  f[5]=7;assert.equal(evaluate(clauses,f),true);
  const all=new Operands(i(0x70,[255,255]));assert.equal(evaluate(condition(all,{unconditional:true}),f),true);all.end();
});
test('truncated, unknown and out of bank condition terms fail closed',()=>{
  for(const args of [[8,0,7,0,0], [0,1,5,0,0], [255,254,0x66], [255,255,0x58,0,1,7,255,255]])
    assert.throws(()=>condition(new Operands(i(0x57,args))));
  assert.throws(()=>decodeBranch(i(0x57,[0,1,7,0,1,0,65])),/Unterminated/);
  assert.throws(()=>decodeBranch(i(0x57,[0,1,7,0,1,0,...label('ok'),1])),/Unconsumed/);
});
test('choice source order and timing survive decoding',()=>{
  const c=decodeChoice(i(0x54,[1,0,10,2,0,0,...label('left'),4,1,...label('right'),...label('hint')]));
  assert.equal(c.timeoutFrames,600);assert.equal(c.restartLabel,'hint');
  assert.deepEqual(c.options,[{index:0,spacing:0,script:0,label:'left'},{index:1,spacing:4,script:1,label:'right'}]);
  assert.throws(()=>decodeChoice(i(0x53,[1,0,0,11])),/capacity/);
});
test('choice preview uses native restricted dispatch without executing branches or flags',()=>{
  const tokens=[{offset:0,code:0x52,args:[0,...label('after')]},{code:0x5c,args:[0,4]},
    {code:0x1c},{code:1,text:'reading'},{code:0x1d},{code:1,text:'漢字'},
    {code:0x1b},{code:1,text:'Option'},{code:0xbc},{code:0x5e},{code:1,text:'unselected story'}];
  assert.deepEqual(choiceText({tokens},0),{text:'漢字\nOption',recommended:true});
  assert.throws(()=>choiceText({tokens:tokens.slice(0,9)},0),/terminator/);
});
test('choice preview accepts only the verified inert system delimiter',()=>{
  const tokens=[{offset:0,...i(0xc0,[1,3])},{code:1,text:'Original synthetic option'},{code:0x5e}];
  assert.deepEqual(choiceText({tokens},0),{text:'Original synthetic option',recommended:false});
  for (const args of [[1,255],[2,3],[0,3],[1,3,0],[1]]) {
    assert.throws(()=>choiceText({tokens:[{offset:0,...i(0xc0,args)},...tokens.slice(1)]},0));
  }
});
test('checkpoint and system operands reject unknown and truncated forms',()=>{
  assert.deepEqual(decodeCheckpoint(i(0x22,[1])),{restart:true});
  assert.deepEqual(decodeCheckpoint(i(0x22,[0])),{restart:false});
  assert.deepEqual(decodeSystem(i(0xc0,[2,20])),{type:2,code:20});
  for(const args of [[],[2],[1,0]])assert.throws(()=>decodeCheckpoint(i(0x22,args)));
  for(const args of [[],[2],[3,0],[2,20,0]])assert.throws(()=>decodeSystem(i(0xc0,args)));
});
test('all control targets must resolve even when their branch would be false',()=>{
  const tokens=[i(0x57,[0,1,7,0,0,1,...label('missing')])];
  const report=validateControl({0:{tokens,labels:{}}});assert.equal(report.errors.length,1);
});
test('TIPS and JUMP retain source targets and their separate conditions and flags',()=>{
  const tip=decodeLink(i(0x6c,[1,0,8,2,...label('tip')]));
  assert.deepEqual(tip,{mode:1,field:8,extra:null,target:{script:2,label:'tip'}});
  const zap=decodeLink(i(0x70,[0,255,255,3,...label('character'),0,4,0,20]));
  assert.equal(evaluate(zap.clauses,flags()),true);assert.equal(zap.flag,20);
  assert.deepEqual(zap.target,{script:3,label:'character'});
  assert.throws(()=>decodeLink(i(0x70,[0,255,255,3,...label('character'),0,4,7,255])),/outside/);
});
