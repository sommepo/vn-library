#!/usr/bin/env node
// Original test harness. Commercial content must be supplied privately at runtime.
import {readFile, writeFile, realpath, stat} from 'node:fs/promises';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {PiaEngine} from '../web/adapters/pia-engine.mjs';
import {PiaVM} from '../web/adapters/pia-vm.mjs';
import {PiaNatives} from '../web/adapters/pia-natives.mjs';

const help = `Usage: node tests/pia-real-smoke.mjs CONTENT_DIRECTORY [options]
  --max-segments N            Main-path text boundaries to exercise (default 1000)
  --all-scripts               Validate every declared script and resource, count opcodes
  --strict-references         Fail if static script/image references remain unresolved
  --diagnostic-skip-movie     Simulate movie completion for control-flow investigation
                             (explicitly NOT movie/presentation coverage)
  --report PRIVATE_JSON      Create a new aggregate report; refuse an existing file

Uses the imported game's evidenced entry and its configured startup defaults.
Follows actual bytecode branches/chains, selects the first available main-path
choice, and separately checks all options of its first encountered choice.
This headless harness does not play or verify graphics/audio/video in a browser.
Reports contain counts, source IDs and digests, never commercial dialogue.
Exit codes: 0 requested scope passed, 2 usage/I/O, 3 execution/validation/check failure.
`;
const args = process.argv.slice(2);
if (!args.length || args.includes('--help')) { console.log(help); process.exit(args.length ? 0 : 2); }
const directory = args.shift();
const options = {maxSegments:1000, allScripts:false, strictReferences:false, skipMovie:false, report:null};
try {
  while (args.length) {
    const option=args.shift();
    if(option==='--all-scripts') options.allScripts=true;
    else if(option==='--strict-references') {options.allScripts=true;options.strictReferences=true;}
    else if(option==='--diagnostic-skip-movie') options.skipMovie=true;
    else if(option==='--max-segments') options.maxSegments=Number(args.shift());
    else if(option==='--report') options.report=args.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  if(!Number.isInteger(options.maxSegments)||options.maxSegments<1||options.maxSegments>100000) throw new Error('max-segments must be 1–100000');
  if(options.report===undefined) throw new Error('--report needs a path');
} catch(error) { console.error(error.message); process.exit(2); }

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
const implemented = new Set(('SKIP JUMP JUMPZ CALL RET SWITCH MOV MOVI MOVA PUSH PUSHI POP ADD ADDI SUB SUBI MUL MULI DIV DIVI SUR SURI INC DEC NEG AND ANDI OR ORI XOR XORI NOT LAND LANDI LOR LORI LNOT LT LE GT GE EQ NE INTVECT INTON INTOFF LDGNVAR LDGSVAR LDLNVAR LDLSVAR STRADD STRFREE FUNC EXIT').split(' '));
const report = {
  format:'vnkit.pia-real-smoke', version:1, startedAt:new Date().toISOString(),
  scope:options.skipMovie?'Headless control-flow execution; movie completion explicitly simulated':'Headless VM/native execution; stops at movie boundary',
  limits:{maxSegments:options.maxSegments},
  unverified:['Original emulator comparison','Rendered image composition','Audible voice/music/effects','Movie decoding/presentation','Wall-clock timing','Browser interaction and learning statistics'],
  execution:{textSegments:0,uniqueTextSegments:0,choices:0,scripts:[],nativeCalls:{},pagesBeforeFirstMovieSkip:null,simulatedMediaBoundaries:{}},
  checks:[], branches:[], diagnosticMovieSkips:[], failures:[], warnings:[],
};

let root, content, engine;
const encountered=new Set(), scripts=new Set();
const checkedPath=async url=>{
  if(typeof url!=='string'||!url||isAbsolute(url)||/^[a-z][a-z0-9+.-]*:/i.test(url)||url.split(/[\\/]/).some(x=>x==='..'||x.startsWith('.'))) throw new Error('Unsafe imported resource path');
  const target=await realpath(resolve(root,url));
  const within=relative(root,target);
  if(within.startsWith(`..${sep}`)||within==='..'||isAbsolute(within)) throw new Error('Imported resource resolves outside content directory');
  return target;
};
const loadJSON=async url=>JSON.parse(await readFile(await checkedPath(url),'utf8'));

// A deliberately conservative, non-executing constant pass. Never invent values
// across branches, variable loads, return values or string arithmetic. This is
// only a reference census; the real VM remains the execution authority.
function literalNativeCalls(parsed) {
  const strings=new Map(parsed.strings.map(s=>[s.code_offset,s.text]));
  const targets=new Set();
  for(const instruction of parsed.instructions) {
    if(['JUMP','CALL'].includes(instruction.op))targets.add(instruction.args[0]);
    if(['JUMPZ','INTVECT'].includes(instruction.op))targets.add(instruction.args[1]);
    if(instruction.op==='SWITCH')for(const entry of instruction.cases)targets.add(entry.target);
  }
  let registers=new Map(),stack=[];
  const unknown=undefined,calls=[];
  const read=index=>index<16?registers.get(index):unknown;
  const reset=()=>{registers=new Map();stack=[];};
  for(const instruction of parsed.instructions) {
    if(targets.has(instruction.code_offset))reset();
    const [a,b]=instruction.args;
    switch(instruction.op) {
      case 'MOVI':registers.set(a,a<16?b|0:unknown);break;
      case 'MOVA':registers.set(a,a<16?strings.get(b):unknown);break;
      case 'MOV':registers.set(a,a<16?read(b):unknown);break;
      case 'PUSHI':stack.push(a|0);break;
      case 'PUSH':stack.push(read(a));break;
      case 'POP':registers.set(a,stack.pop());break;
      case 'FUNC': {
        const count=stack.at(-1);
        const args=Number.isInteger(count)&&count>=0&&count<=64&&stack.length>=count+1?
          stack.slice(stack.length-count-1,-1):null;
        calls.push({instruction,args});
        // A native may alter memory or load another scenario. Subsequent
        // arguments must establish their own constants again.
        reset();break;
      }
      case 'LDGNVAR':case 'LDGSVAR':case 'LDLNVAR':case 'LDLSVAR':registers.delete(b);break;
      case 'SKIP':break;
      case 'JUMP':case 'JUMPZ':case 'SWITCH':case 'CALL':case 'RET':case 'EXIT':
      case 'INT':case 'RESUME':reset();break;
      default:
        // In particular, don't mistake an arithmetic result for its old value.
        if(a!==undefined)registers.delete(a);
    }
  }
  return calls;
}

function inspectReferences(parsed, result, native) {
  const byKind=result.byKind;
  for(const {instruction,args} of literalNativeCalls(parsed)) {
    const name=instruction.native;
    let kind={chain:'script',CALL:'script',PicBg:'background',PicEv:'cg',PicUp:'sprite',
      PlayMusic:'music',PlaySE:'sound',PlayEnvSE:'ambient',PlayMovie:'movie',RoomInit:'background',Name:'voice'}[name];
    if(!kind)continue;
    if(name==='Name'&&args?.length===1)continue;
    const value=args?.[name==='Name'?1:0];
    byKind[kind]??={calls:0,literal:0,dynamic:0,resolved:0,sourceFallbacks:0,unavailable:0};
    const counts=byKind[kind];counts.calls++;
    if(value===undefined||!args) {counts.dynamic++;result.dynamic.push({source:instruction.id,native:name,kind});continue;}
    let sourceName;
    if(name==='PlaySE'||name==='PlayEnvSE') {
      if(typeof value!=='number'){counts.dynamic++;result.dynamic.push({source:instruction.id,native:name,kind});continue;}
      sourceName=name==='PlaySE'?`PIASE${String(value).padStart(3,'0')}`:`S${String(value).padStart(2,'0')}`;
    } else {
      if(typeof value!=='string'){counts.dynamic++;result.dynamic.push({source:instruction.id,native:name,kind});continue;}
      sourceName=value.toUpperCase();
    }
    counts.literal++;
    const candidates=new Set();
    if(['background','cg','sprite'].includes(kind))for(const uniformType of [1,2,3])for(const hour of [12,18,20])
      candidates.add(native.filename(kind,sourceName,{uniformType,time:[hour,0]},instruction));
    else candidates.add(sourceName);
    const missing=[],fallbacks=[];
    for(const candidate of candidates) {
      if((kind==='background'&&candidate==='BLACK')||(kind==='music'&&candidate==='BGM0'))continue;
      if(kind==='script') {
        const script=candidate.endsWith('.SPC')?candidate:`${candidate}.SPC`;
        if(!own(content.runtime.scripts,script))missing.push(script);
      } else if(!native.asset(kind,candidate,instruction,true)) {
        const originals=native.data.sourceImageContainers?.[kind];
        if(['background','cg','sprite'].includes(kind)&&Array.isArray(originals)&&!originals.includes(candidate)&&native.asset(kind,'FILEERR',instruction,true))fallbacks.push(candidate);
        else missing.push(candidate);
      }
    }
    if(missing.length){counts.unavailable++;result.unavailable.push({source:instruction.id,native:name,kind,resources:missing});}
    else counts.resolved++;
    if(fallbacks.length){counts.sourceFallbacks++;result.sourceFallbacks.push({source:instruction.id,native:name,kind,missingSourceNames:fallbacks,fallback:'FILEERR'});}
  }
}

async function validateAll() {
  const result={scripts:0,instructions:0,strings:0,opcodes:{},nativeCallsites:{},nativeScripts:{},resources:0,errors:[],
    references:{method:'Conservative constants within individual basic blocks; original case/uniform/time resource mapping; dynamic calls listed, never guessed',byKind:{},dynamic:[],unavailable:[],sourceFallbacks:[]}};
  const native=new PiaNatives(content);
  for(const [name,reference] of Object.entries(content.runtime.scripts)) {
    try {
      const parsed=await loadJSON(reference.url);
      if(parsed.source!==name||parsed.sha256!==reference.sha256) throw new Error('Scenario identity mismatch');
      const vm=new PiaVM({[name]:parsed},{entry:name});
      const loaded=vm.scripts.get(name);
      const nativeRelocations=new Map();
      for(const chunk of parsed.chunks) if(chunk.kind==='FUNC') for(const entry of chunk.entries) for(const offset of entry.offsets) {
        if(nativeRelocations.has(offset)) throw new Error(`Duplicate FUNC relocation ${offset}`);
        nativeRelocations.set(offset,entry.name);
      }
      const usedNativeRelocations=new Set();
      const scriptNatives=new Set();
      for(const instruction of parsed.instructions) {
        result.instructions++;
        result.opcodes[instruction.op]=(result.opcodes[instruction.op]||0)+1;
        if(!implemented.has(instruction.op)) result.errors.push({source:instruction.id,error:`Unsupported VM opcode ${instruction.op}`});
        const [a,b]=instruction.args;
        const targets=instruction.op==='JUMP'||instruction.op==='CALL'?[a]:['JUMPZ','INTVECT'].includes(instruction.op)?[b]:instruction.op==='SWITCH'?instruction.cases.map(x=>x.target):[];
        for(const target of targets) if(!(instruction.op==='INTVECT'&&target===0)&&!loaded.instructions.has(target)) result.errors.push({source:instruction.id,error:`Unresolved control-flow target ${target}`});
        if(instruction.op==='MOVA'&&!loaded.strings.has(b)) result.errors.push({source:instruction.id,error:`Unresolved embedded string ${b}`});
        if(['LDGNVAR','LDGSVAR'].includes(instruction.op)&&!loaded.relocations[instruction.op==='LDGNVAR'?'number':'string'].has(instruction.code_offset+1)) result.errors.push({source:instruction.id,error:'Unresolved global variable relocation'});
        if(instruction.op==='FUNC') {
          const offset=instruction.code_offset+1;
          if(!instruction.native||nativeRelocations.get(offset)!==instruction.native) result.errors.push({source:instruction.id,error:'Unresolved or conflicting native relocation'});
          usedNativeRelocations.add(offset);
          result.nativeCallsites[instruction.native]=(result.nativeCallsites[instruction.native]||0)+1;
          scriptNatives.add(instruction.native);
        }
      }
      for(const offset of nativeRelocations.keys()) if(!usedNativeRelocations.has(offset)) result.errors.push({script:name,error:`Unused native relocation ${offset}`});
      for(const name of scriptNatives)result.nativeScripts[name]=(result.nativeScripts[name]||0)+1;
      inspectReferences(parsed,result.references,native);
      result.scripts++; result.strings+=parsed.strings.length;
    } catch(error) { result.errors.push({script:name,error:error.message}); }
  }
  for(const [id,asset] of Object.entries(content.assets)) {
    try { if(!(await stat(await checkedPath(asset.url))).isFile()) throw new Error('Resource is not a file'); result.resources++; }
    catch(error) { result.errors.push({asset:id,error:error.message}); }
  }
  result.distinctOpcodes=Object.keys(result.opcodes).length;
  result.distinctNatives=Object.keys(result.nativeCallsites).length;
  result.references.unresolvedEssential=result.references.unavailable.filter(item=>['script','background','cg','sprite'].includes(item.kind));
  result.references.complete=result.references.unresolvedEssential.length===0&&result.references.dynamic.length===0;
  result.references.note='Unavailable declared image/script candidates require investigation; unavailable audio may reflect incomplete conversion. Candidates across all uniforms/times need not be reachable. This is separate from parse validity and main-path execution.';
  result.note='Static resolution/counts only; native callsite discovery does not mean every native executes.';
  report.validation=result;
}

function digestCurrent() {
  const pending=engine.current;
  if(!pending)return {kind:null};
  const {occurrenceId,...sourcePending}=pending;
  return {kind:pending.kind,source:pending.id,presentation:hash(sourcePending),
    state:hash({native:engine.vm.state.native,frame:engine.vm.state.frame,globals:engine.vm.state.globals,parents:engine.vm.state.parents,leadSound:engine.leadSound||null})};
}
const check=(name,passed,detail={})=>report.checks.push({name,passed,...detail});

async function advanceCurrent({choose,main=false}={}) {
  const pending=engine.current;
  if(!pending||pending.kind==='end')return false;
  if(['movie','diagnostic-movie'].includes(pending.kind)&&!options.skipMovie) {
    report.boundary={kind:pending.kind,source:pending.id,reason:'Movie boundary: headless presentation is unverified'};
    return false;
  }
  if(['sound','wait','movie','diagnostic-movie'].includes(pending.kind)) {
    if(main)report.execution.simulatedMediaBoundaries[pending.kind]=(report.execution.simulatedMediaBoundaries[pending.kind]||0)+1;
    await engine.advance();return true;
  }
  if(pending.kind==='choice') {await engine.advance(choose??pending.options[0].id);return true;}
  if(pending.kind==='text') {await engine.advance();return true;}
  throw new Error(`Unsupported harness presentation boundary ${pending.kind} at ${pending.id}`);
}

async function nextTextBoundaries(count) {
  const records=[];
  for(let boundaries=0;boundaries<count*10&&records.length<count;boundaries++) {
    if(['text','choice'].includes(engine.current?.kind))records.push(digestCurrent());
    if(!await advanceCurrent())break;
  }
  return records;
}

async function checkChoice() {
  const pending=engine.current;
  const before=engine.save({voice:{asset:'test-media-state',time:1.25,paused:true}});
  const nativeCount=()=>Object.values(report.execution.nativeCalls).reduce((a,b)=>a+b,0);
  const initialCalls=nativeCount();
  await engine.restore(before);await engine.run();
  check('Restoring current choice and rerendering invokes no native',initialCalls===nativeCount());
  const sourceId=pending.id;
  const first=pending.options[0].id;
  await engine.advance(first);
  const after=engine.save();
  const expected=await nextTextBoundaries(8);
  await engine.restore(before);await engine.advance(first);
  const replay=await nextTextBoundaries(8);
  check('Save before choice restores subsequent text and execution state',hash(expected)===hash(replay),{source:sourceId,segments:expected.length});
  await engine.restore(after);
  const afterReplay=await nextTextBoundaries(8);
  check('Save after choice restores subsequent text and execution state',hash(expected)===hash(afterReplay),{source:sourceId,segments:expected.length});
  for(const option of pending.options) {
    await engine.restore(before);await engine.advance(option.id);
    report.branches.push({choice:sourceId,option:option.id,value:option.value,result:engine.vm.getGlobal('SELECT_REG'),next:await nextTextBoundaries(8)});
  }
  const wrongGame=structuredClone(before);wrongGame.gameId+='-mismatch';
  let rejected=false;try{await engine.restore(wrongGame);}catch{rejected=true;}
  check('Foreign game save rejected',rejected);
  const wrongSource=structuredClone(before);wrongSource.state.frame.sourceSha256='0'.repeat(64);
  rejected=false;try{await engine.restore(wrongSource);}catch{rejected=true;}
  check('Mismatched source fingerprint rejected',rejected);
  await engine.restore(before);
}

try {
  root=await realpath(resolve(directory));
  content=await loadJSON('content.json');
  report.game={id:content.id,adapter:content.adapter,entry:content.runtime?.entry,contentDigest:hash(content)};
  if(options.allScripts)await validateAll();
  let sequence=0;
  engine=await PiaEngine.create(content,{skipSetup:true,loadJSON,makeId:()=>`headless-probe-${++sequence}`});
  const invoke=engine.natives.invoke.bind(engine.natives);
  engine.natives.invoke=(name,args,vm,instruction)=>{
    report.execution.nativeCalls[name]=(report.execution.nativeCalls[name]||0)+1;
    if(name==='PlayMovie'&&options.skipMovie) {
      if(report.execution.pagesBeforeFirstMovieSkip===null)report.execution.pagesBeforeFirstMovieSkip=report.execution.textSegments;
      report.diagnosticMovieSkips.push({source:instruction.id,sourceResource:vm.readString(args[0]),reason:'Native movie completion deliberately simulated; no media claim'});
      return {pending:{kind:'diagnostic-movie',id:instruction.id}};
    }
    return invoke(name,args,vm,instruction);
  };
  await engine.run();
  let choiceChecked=false,leadSoundChecked=false;
  for(let boundary=0;boundary<options.maxSegments*20&&report.execution.textSegments<options.maxSegments;boundary++) {
    const pending=engine.current;
    scripts.add(engine.vm.script);
    if(pending?.kind==='text') {
      report.execution.textSegments++;
      encountered.add(pending.id);
      // Source, text digest and state digest are retained; dialogue itself never enters reports.
      report.execution.firstText??=digestCurrent();report.execution.lastText=digestCurrent();
    } else if(pending?.kind==='choice') {
      report.execution.choices++;
      if(!choiceChecked){await checkChoice();choiceChecked=true;}
    } else if(pending?.kind==='sound'&&!leadSoundChecked) {
      await engine.advance();const after=engine.save(),initial=digestCurrent();
      await engine.run();check('Consumed leading sound is not rearmed by rerender',hash(initial)===hash(digestCurrent()));
      await engine.restore(after);await engine.run();
      check('Consumed leading sound is not rearmed by restore',hash(initial)===hash(digestCurrent()));
      await engine.restore(after);leadSoundChecked=true;continue;
    }
    if(!await advanceCurrent({main:true}))break;
  }
  report.execution.uniqueTextSegments=encountered.size;
  report.execution.scripts=[...scripts];
  report.execution.steps=engine.vm.state.steps;
  report.execution.ended=engine.vm.state.ended;
  report.execution.requestedLimitReached=report.execution.textSegments>=options.maxSegments;
} catch(error) {
  report.failures.push({message:error.message,source:engine?.vm.currentInstruction?.id??null});
  if(engine?.vm.state.fault){
    const previousPc=engine.vm.pc;
    let failedAgain=false;try{engine.vm.run();}catch{failedAgain=true;}
    check('Failure remains stopped when run is retried',failedAgain&&engine.vm.pc===previousPc);
  }
}
if(engine) {
  report.execution.steps=engine.vm.state.steps;
  report.execution.uniqueTextSegments=encountered.size;
  report.execution.scripts=[...scripts];
  report.execution.loadedScripts=Object.keys(engine.scripts);
  report.warnings=engine.vm.state.native.pia?.warnings??[];
}
report.completedAt=new Date().toISOString();
report.passed=!report.failures.length&&!report.validation?.errors.length&&report.checks.every(x=>x.passed)&&(!options.strictReferences||report.validation?.references.complete);
try {
  if(options.report)await writeFile(resolve(options.report),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(report,null,2));
  process.exitCode=report.passed?0:3;
}catch(error){console.error(error.message);process.exitCode=2;}
