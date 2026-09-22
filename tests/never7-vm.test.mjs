// Entirely original synthetic instructions, no game script or ELF bytes.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {Never7Engine} from '../web/adapters/never7-engine.mjs';import {evaluateNever7Predicate} from '../web/adapters/never7-predicate.mjs';
import {validateReadPaths} from '../web/adapters/never7-read-paths.mjs';
import {buildReadPaths} from '../scripts/build-never7-read-paths.mjs';
import {isRead} from '../web/read-status.mjs';
const predicate={format:'vnkit.never7-predicate',version:1,base:0x1000,words:[0x24020001,0x03e00008,0],tableBase:0x2000,tables:[],persistentVariables:[50],speakerNames:['案内'],speakerOpeners:['「','（']};
const op=(offset,code,args=[],extra={})=>({id:`test:${offset}`,offset,code,op:0xf0000000+code,words:[0xf0000000+code,...args],next:offset+1+args.length,...extra});
function fixture(){
 const instructions=[op(0,0x0f,[0x80010002,0]),{id:'test:12',offset:3,op:0x100000,words:[0x100000,0,0,0],next:7,text:'案内「これは独自の試験です。」\\k\\p'},op(7,0,[1,0x100000,0,0],{text:'進む'}),op(12,0,[2,0x100010,0,0],{text:'戻る'}),op(17,1,[0,2<<16,0]),op(21,0x0f,[0x80010001,3]),{id:'test:100',offset:24,op:0x100000,words:[0x100000,0,0,0],next:28,text:'同じ文章。\\k\\p'},op(28,0x68,[0,0,0])];
 const data={format:'vnkit.never7-script',version:1,source:'test',sha256:'synthetic',overlay:0,address:0x2000,word_count:32,labels:{},instructions:Object.fromEntries(instructions.map(i=>[i.offset,i]))};
 const content={format:'vnkit.content',version:1,id:'original-never7-test',assets:{},runtime:{id:'never7-ps2-oscr',version:1,entry:'test',predicate:'predicate.json',scripts:{test:{url:'test.json',sha256:'synthetic',overlay:0,address:0x2000}}}};
 const loadJSON=async url=>structuredClone(url==='predicate.json'?predicate:data);
 return {data,content,loadJSON};
}
test('original fixture: choice state, arithmetic, save restore and stable occurrences',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON,makeId:()=> 'occurrence'});await e.run();assert.equal(e.current.speaker,'案内');assert.equal(e.state.vars[1],2);await e.advance();const saved=e.save();
 for(const option of ['0','1']){await e.restore(saved);await e.advance(option);assert.equal(e.state.vars[16],+option);assert.equal(e.state.vars[1],3);const r=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});await r.restore(e.save());assert.deepEqual(r.state,e.state);assert.equal((await r.advance()).pending.kind,'end');}
});
test('unknown command and source text control roll back the visible checkpoint',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});await e.run();const saved=e.save();e.scripts.test.instructions[7].code=999;await assert.rejects(e.advance(),/Unsupported native command/);assert.deepEqual(e.state,saved.state);
 e.scripts.test.instructions[7].code=0;e.scripts.test.instructions[7].text='試験\\UNKNOWN';await assert.rejects(e.advance(),/Unsupported source text control/);assert.deepEqual(e.state,saved.state);
});
test('forged choice text, state, timer and incompatible save are refused atomically',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});await e.run();await e.advance();const saved=e.save();
 for(const mutate of [s=>{s.gameId='wrong';},s=>{s.state.vars[800]=1;},s=>{s.state.globals[1]=true;},s=>{s.state.pending.options[0].text=s.state.choices[0].text='Forged';},s=>{s.state.pending.kind='wait';s.state.pending.remainingMs=-1;}]){const bad=clone(saved);mutate(bad);await assert.rejects(e.restore(bad));assert.deepEqual(e.state,saved.state);}
});
const clone=structuredClone;
test('native name table does not mistake narration or choice wording for a speaker',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});
 assert.deepEqual(e.message({id:'test',text:'案内（独自の試験。）\\p'}),{speaker:'案内',text:'（独自の試験。）',clearAfter:true});
 for(const text of ['彼は「試験」と言った。','あの「試験」'])assert.equal(e.message({id:'test',text}).text,text);
 assert.equal(e.message({id:'test',code:0,text:'案内「進む」'}).text,'案内「進む」');
});
test('persistent flags latch independently and signed16 math wraps',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});e.calculate(op(0,15,[0x80320001,0]));const progress=e.progressSnapshot();e.calculate(op(0,15,[0x80320000,0]));assert.equal(e.state.globals[50],true);e.calculate(op(0,15,[0x80017fff,0]));e.calculate(op(0,15,[0x80010001,1]));assert.equal(e.state.vars[1],-32768);const fresh=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});fresh.applyProgress(progress);assert.equal(fresh.state.vars[50],1);assert.equal(fresh.state.vars[1],undefined);
});
test('duplicate native labels distinguish forward from from-start jumps',async()=>{
 const f=fixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON}),script={labels:{7:[2,20,50]}};e.goto(script,7,25,{id:'test'});assert.equal(e.state.pc,50);e.goto(script,7,0,{id:'test'});assert.equal(e.state.pc,2);assert.throws(()=>e.goto(script,7,60,{id:'test'}),/absent/);
});
test('condition evaluator handles branch delay slots and signed variable loads',()=>{
 // lui t0,0x5d; lh t1,-0x42a8(t0); slti v0,t1,0; jr ra; nop
 const n={...predicate,words:[0x3c08005d,0x8509bd58,0x29220000,0x03e00008,0]};
 assert.equal(evaluateNever7Predicate(n,{vars:{0:-1}}),true);assert.equal(evaluateNever7Predicate(n,{vars:{0:1}}),false);
 const delayed={...predicate,words:[0x24020000,0x10000001,0x24020001,0x03e00008,0]};assert.equal(evaluateNever7Predicate(delayed,{vars:{}}),true);
});
test('condition evaluator refuses calls, stores, unbounded loops and external reads',()=>{
 for(const words of [[0x0c000000],[0xac020000],[0x8c020000],[0x1000ffff,0]])assert.throws(()=>evaluateNever7Predicate({...predicate,words},{vars:{}}),/condition/);
});
function menuFixture(){
 const f=fixture(),n={...predicate,persistentVariables:[21,22,23,24,49,50,51,52,53,54,57,69,70,77,90,91],appendEntries:[
  {id:'append-0',label:'Original test chapter',requires:[21],script:'test'},
  {id:'append-1',label:'Original test extra',requires:[70],script:'test',group:'Append stories'}]};
 return {...f,loadJSON:async url=>structuredClone(url==='predicate.json'?n:f.data)};
}
function readFixture(){
 const f=menuFixture();
 for(const i of Object.values(f.data.instructions))i.id=`test:${(i.offset*4).toString(16).padStart(8,'0')}`;
 f.data.instructions[21].words=[0xf000000f,0x80150001,0]; // Source-earned synthetic Yuka flag.
 const recipe={choices:[{source:'test:00000044',option:0}],ending:'test:00000070',earned:[21]};
 return {...f,recipe};
}
test('read-path builder requires source choices, a new earned clear and the exact ending',async()=>{
 const f=readFixture(),plan={routes:[{id:'yuka',recipe:'original'}]},options={loadJSON:f.loadJSON};
 const paths=await buildReadPaths(f.content,plan,async()=>f.recipe,options);
 assert.deepEqual(paths.paths.yuka.ids,['test:0000000c','test:00000060']);
 for(const bad of [{...f.recipe,ending:'wrong'},{...f.recipe,choices:[]},{...f.recipe,choices:[{source:'wrong',option:0}]}])await assert.rejects(buildReadPaths(f.content,plan,async()=>bad,options));
 await assert.rejects(buildReadPaths(f.content,{routes:[{id:'haruka',recipe:'original'}]},async()=>f.recipe,options),/Unverified route ending/);
 await assert.rejects(buildReadPaths(f.content,{routes:[{id:'yuka',recipe:'original',progressFrom:'unknown'}]},async()=>f.recipe,options),/earlier verified replay/);
 await assert.rejects(buildReadPaths(f.content,{routes:[...plan.routes,...plan.routes]},async()=>f.recipe,options),/duplicate/);
});
test('completed paths use source IDs, follow current progress and never populate study history or saves',async()=>{
 const f=readFixture(),paths=await buildReadPaths(f.content,{routes:[{id:'yuka',recipe:'original'}]},async()=>f.recipe,{loadJSON:f.loadJSON});
 const e=await Never7Engine.create(f.content,{loadJSON:async url=>url==='read-paths.json'?paths:f.loadJSON(url)});
 await e.loadReadPaths();const blank=e.progressSnapshot(),activity={data:{seen:{}}},before=structuredClone(activity);
 assert.equal(isRead(activity,e,'test:00000060'),false);e.markRouteComplete('yuka');
 assert.equal(isRead(activity,e,'test:00000060'),true);assert.equal(isRead(activity,e,'test:00000064'),false);
 assert.deepEqual(activity,before);assert.ok(!JSON.stringify(e.save()).includes('readPaths'));
 e.applyProgress(blank);assert.equal(isRead(activity,e,'test:00000060'),false);
 activity.data.seen['test:00000060']=true;assert.equal(isRead(activity,e,'test:00000060'),true);
 const source=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});await source.run();await source.advance();await source.advance('0');e.applyProgress(source.progressSnapshot());
 assert.equal(e.isInheritedRead('test:0000000c'),true);assert.deepEqual(e.state.manualCompletions,{});
});
test('missing or incompatible read evidence fails closed without blocking the story',async()=>{
 const f=readFixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});
 const good={format:'vnkit.read-paths',version:1,gameId:f.content.id,gameSignature:e.signature,paths:{yuka:{ids:['test:0000000c']}}};
 assert.ok(validateReadPaths(good,e).yuka.has('test:0000000c'));
 for(const bad of [{...good,gameId:'other'},{...good,gameSignature:'old'}, {...good,paths:{unknown:{ids:['test:0000000c']}}}, ...['absent:00000000','test:0000000d','test:1',null].map(id=>({...good,paths:{yuka:{ids:[id]}}}))])assert.throws(()=>validateReadPaths(bad,e));
 e.readPaths={yuka:new Set(['test:0000000c'])};e.markRouteComplete('yuka');await e.loadReadPaths();
 assert.equal(e.isInheritedRead('test:0000000c'),false);assert.ok(e.readPathWarning);await e.run();assert.equal(e.current.kind,'text');
});
test('native menu gates, manual provenance and progress survive a new story independently of a slot',async()=>{
 const f=menuFixture(),options={loadJSON:f.loadJSON},e=await Never7Engine.create(f.content,options);
 assert.deepEqual(e.newGameEntries().map(x=>x.id),['start']);
 await assert.rejects(e.startNew(undefined,'append-0'),/not been unlocked/);
 e.markRouteComplete('yuka');assert.deepEqual(e.newGameEntries().map(x=>x.id),['start','append-0']);
 assert.equal(e.state.globals[57],undefined);
 for(const id of ['haruka','saki','kurumi'])e.markRouteComplete(id);
 assert.equal(e.state.globals[57],true);assert.equal(e.state.globals[70],undefined);
 e.markRouteComplete('izumi-finale');const progress=e.progressSnapshot();
 const fresh=await Never7Engine.create(f.content,options);await fresh.startNew(progress,'append-1');
 assert.equal(fresh.current.kind,'text');assert.equal(fresh.routeProgress().find(r=>r.id==='izumi-finale').manual,true);
 await assert.rejects(fresh.startNew(progress),/fresh engine/);
 const old=await Never7Engine.create(f.content,options);await old.run();const save=old.save();delete save.state.manualCompletions;
 await fresh.restore(save);fresh.applyProgress(progress);assert.deepEqual(fresh.progressSnapshot().globals,progress.globals);
 assert.equal(fresh.current.id,old.current.id);
 const before=fresh.progressSnapshot();assert.throws(()=>fresh.applyProgress({...progress,manualCompletions:{unknown:true}}),/completion record/);assert.deepEqual(fresh.progressSnapshot(),before);
});
test('bad end does not invent completions; ending stops source effects and rejects unknown credits',async()=>{
 const f=menuFixture(),e=await Never7Engine.create(f.content,{loadJSON:f.loadJSON});
 await e.run();await e.advance();await e.advance('0');e.state.lastSound='synthetic';
 const saved=e.save();e.native.creditsPrograms={};e.scripts.test.instructions[28].words[1]=77<<16;
 await assert.rejects(e.advance(),/Unknown credits program/);assert.deepEqual(e.state,saved.state);
 e.scripts.test.instructions[28].words[1]=0;const result=await e.advance();
 assert.equal(e.current.kind,'end');assert.deepEqual(e.progressSnapshot().globals,{});
 assert.equal(e.state.lastSound,null);assert.ok(result.effects.some(f=>f.op==='stopSound'));
});
