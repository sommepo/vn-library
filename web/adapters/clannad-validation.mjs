// Full static census. Successful parsing is deliberately separate from support.
import {basicEventSupported,legacySupported} from './clannad-basic-events.mjs';
import {SUPPORTED,validateClannadContent} from './clannad-engine.mjs';
export async function validateClannadScripts(content,loadJSON){
 const result={scripts:0,instructions:0,textSources:0,choiceExpressions:0,commands:{},errors:[],unsupported:[],degraded:{},references:{checked:0,unavailable:[]},unusedScripts:[]};
 result.errors.push(...validateClannadContent(content));const programs={};
 for(const [name,ref] of Object.entries(content.runtime.scripts)){
  try{
   const s=await loadJSON(ref.url);
   if(s.format!=='vnkit.clannad-script'||s.version!==1||s.source!==name||s.sha256!==ref.sha256||s.instructions.length!==ref.instructions)throw new Error('Source program identity/count mismatch');
   programs[name]=s;result.scripts++;
   let last=-1;const ids=new Set();
   for(const i of s.instructions){
    if(!Number.isInteger(i.offset)||i.offset<=last||i.id!==`${name}:${i.offset.toString(16).padStart(8,'0')}`||ids.has(i.id))throw new Error('Invalid source location or duplicate instruction identity');
    last=i.offset;ids.add(i.id);result.instructions++;result.commands[i.op]=(result.commands[i.op]||0)+1;
    if(i.op==='ZM')result.textSources++;
    if(i.op==='MSNL')result.textSources++;
    if(i.selection)result.choiceExpressions++;
    let unsupported=i.unsupported||(!SUPPORTED.has(i.op)?'Opcode not implemented':null);
    if(['NCK0','NCK1','NCK2','NSC0','NSC1'].includes(i.op)&&(!/^(?:\d+|F\[\d+\])$/.test(i.args?.at(-1)||'')))unsupported='Name-check parameter form not implemented';
    if(i.op==='legacy'&&legacySupported(i.argument))unsupported=null;
    if(content.nativeData.condition_overrides?.[i.id]&&content.nativeData.condition_overrides[i.id].argument===i.argument)unsupported=null;
    if(i.selection&&!['SEL','SEB'].includes(i.selection.kind))unsupported='Unknown selection form';
    if(i.op==='EVT0'&&Number(i.args?.[1])!==8&&!basicEventSupported(i.args)){
      const data=content.nativeData.events?.[i.args?.[1]];
      const variant=Number(i.args?.[2]),supported=data?.kind==='eyecatch'?Number.isInteger(variant)&&!!data.variants[variant]:['actor-x-motion','actor-rotation','actor-swing'].includes(data?.kind)&&variant===0;
      if(!supported||i.args.length!==4||Number(i.args[0])!==0||Number(i.args[3])!==0)unsupported='Native event not implemented';
    }
    if(i.op==='EVT1'&&![2,3,4,5,6,7].includes(Number(i.args?.[1])))unsupported='Native event not implemented';
    if(['EVTN','EVTS'].includes(i.op)&&(!/^\d+$/.test(i.args?.[0])||Number(i.args[0])>9))unsupported='Native event channel not implemented';
    if(['SESP','SEFD'].includes(i.op)&&![0,1].includes(Number(i.args?.[0]))&&!(i.op==='SESP'&&Number(i.args[0])>=5))unsupported='Sound-stop channel not implemented';
    if(unsupported)result.unsupported.push({source:i.id,op:i.op,reason:unsupported,...(i.op.startsWith('EVT')?{event:i.args?.[1]}:{})});
    if((['FADB','FADF','FADE','MFAD','EVT1','EVTN','CALN','KEI0','KEI1','KEI2','KEI3','SHAK','SPIA','MSIZ','WNTY','WCOF','WAMS','WATS'].includes(i.op)||(i.op==='EVT0'&&Number(i.args?.[1])===8))&&!unsupported)result.degraded[i.op]=(result.degraded[i.op]||0)+1;
    if(!unsupported&&(i.op==='SEFD'||(['SEPL','SELP'].includes(i.op)&&Number(i.args?.[2])>0)))result.degraded[i.op]=(result.degraded[i.op]||0)+1;
    if(!unsupported&&['FADZ','MVOL','MPL1','VIOL','VIO1','BXDK','BXNG','BXFL','ECTW','MCOL'].includes(i.op))result.degraded[i.op]=(result.degraded[i.op]||0)+1;
    if((i.op==='MSNL'||basicEventSupported(i.args)&&i.op==='EVT0')&&!unsupported)result.degraded[i.op]=(result.degraded[i.op]||0)+1;
    if(i.target&&(s.labels[i.target]==null||s.instructions[s.labels[i.target]]?.label!==i.target))result.errors.push(`${i.id}: unresolved source label ${i.target}`);
   }
  }catch(error){result.errors.push(`${name}: ${error.message}`);}
 }
 const reference=(i,id,kind)=>{
  result.references.checked++;
  if(id==null||content.assets[id]?.type!==kind)result.references.unavailable.push({source:i.id,op:i.op,asset:id??null,kind});
 };
 for(const [name,s] of Object.entries(programs)){
  if(content.nativeData.script_names&&!content.nativeData.script_names.includes(name))result.unusedScripts.push(name);
  for(const i of s.instructions){const a=i.args||[];
   if(i.op==='EVT0'&&content.nativeData.events?.[a[1]]?.kind==='actor-rotation')reference(i,content.nativeData.events[a[1]].asset,'image');
   if(i.op==='EVT0'&&content.nativeData.events?.[a[1]]?.kind==='actor-swing'){reference(i,content.nativeData.events[a[1]].asset,'image');reference(i,content.nativeData.events[a[1]].sound_asset,'sound');}
   if(i.op==='EVT0'&&content.nativeData.events?.[a[1]]?.kind==='eyecatch'){
    const variant=content.nativeData.events[a[1]].variants[Number(a[2])];
    if(variant)for(const key of ['background','strip','final_background'])reference(i,variant[key],'image');
   }
   if(i.op==='STBG')reference(i,`image:${content.nativeData.backgrounds[a[0]?.toLowerCase()]?.archive_index}`,'image');
   if(i.op==='FADZ'){
    reference(i,`image:${content.nativeData.backgrounds[a[0]?.toLowerCase()]?.archive_index}`,'image');
    for(let n=0;n<Number(a[2]);n++){const r=content.nativeData.sprites[a[3+n*4]?.toLowerCase()];reference(i,`image:${r?.body_index}`,'image');if(r?.face_index!=null)reference(i,`image:${r.face_index}`,'image');}
   }
   if(i.op==='FADB'&&a[1]){const r=content.nativeData.sprites[a[1].toLowerCase()];reference(i,`image:${r?.body_index}`,'image');if(r?.face_index!=null)reference(i,`image:${r.face_index}`,'image');}
   if(['MPLY','MPL1'].includes(i.op))reference(i,`music:${content.nativeData.music[a[0]]}`,'music');
   if(['SEPL','SELP'].includes(i.op))reference(i,content.nativeData.sound_lookup?.names[a[0]?.toUpperCase()]?.asset,'sound');
   if(i.op==='VPLY'||i.op==='VPL2'){
    if(/^[A-Z]_{5}$/.test(a[0]))continue;
    if(!/^[A-Z][0-9a-f]{5}$/.test(a[0]))result.errors.push(`${i.id}: invalid voice selector`);
    else reference(i,`voice:${parseInt(a[0].slice(1),16)}`,'voice');
   }
   if(i.op==='MVPL')reference(i,'video:opening','video');
   if(['FCAL','JUMP'].includes(i.op)){
    const n=Number(a[0]);if(i.op==='FCAL'&&(n<400||n>=9000))continue;
    const target=`SEEN${String(n).padStart(4,'0')}.MZX`;result.references.checked++;
    if(!programs[target])result.references.unavailable.push({source:i.id,op:i.op,kind:'script',target});
    else if(a[1]!=null&&programs[target].labels['Z'+a[1]]==null)result.references.unavailable.push({source:i.id,op:i.op,kind:'call-label',target,label:'Z'+a[1]});
   }
  }
 }
 result.parsed=result.errors.length===0;
 result.fullySupported=result.parsed&&!result.unsupported.length&&!result.references.unavailable.length&&!Object.keys(result.degraded).length;
 result.note='All imported programs inspected, including unused scripts; dynamic native-event internals are not covered by direct command references. Static validity does not establish route execution or presentation fidelity.';
 return result;
}
