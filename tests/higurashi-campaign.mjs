// Private actual-disc route evidence. All timing/media and notification closes
// are simulated; this is not original-console or browser playback coverage.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {HigurashiCore} from '../web/adapters/higurashi-core.mjs';
const [programPath,out,countString='200']=process.argv.slice(2);if(!programPath||!out)throw Error('program.json private-output [runs]');
const p=JSON.parse(fs.readFileSync(programPath)),vm=new HigurashiCore(p),seen=new Set(),texts=new Set(),choices=new Set(),endings={},stops=[];
fs.mkdirSync(out,{recursive:true});let progress={},campaign=[],seed=0x98765432,restores=0;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const digest=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
function nextBoundary(machine){for(let n=0;n<100000;n++){const e=machine.step();if(['text','choice','end'].includes(e?.kind))return e;}throw Error('boundary budget');}
for(let run=0;run<Number(countString);run++){
  const fresh=new HigurashiCore(p);fresh.state.system=structuredClone(progress);vm.state=fresh.state;
  const priorSystem=structuredClone(progress);let segments=0,recipe=[],ended=false;
  try{
    for(let tick=0;tick<2000000;tick++){
      const e=vm.step();if(vm.last)seen.add(vm.last[0]);
      if(e?.kind==='text'){segments++;texts.add(`${e.offset}:${e.part}`);}
      if(e?.kind==='choice'){
        const pick=e.options[random()%e.options.length].value;recipe.push({offset:e.offset,value:pick});choices.add(`${e.offset}:${pick}`);
        if(run<10){
          const checkpoint=structuredClone(vm.state),a=new HigurashiCore(p),b=new HigurashiCore(p);a.state=structuredClone(checkpoint);b.state=JSON.parse(JSON.stringify(checkpoint));
          a.choose(pick);b.choose(pick);if(digest(nextBoundary(a))!==digest(nextBoundary(b))||digest(a.state)!==digest(b.state))throw Error('choice restore mismatch');restores++;
        }
        vm.choose(pick);
      }
      if(e?.kind==='end'){
        ended=true;const name=vm.state.title;progress=structuredClone(vm.state.system);
        campaign.push({run,recipe,ending:name,system:progress});
        if(!endings[name]){
          const id=Object.keys(endings).length;endings[name]={run,segments,offset:e.offset,system:progress,recipe:`route-${id}.json`};
          fs.writeFileSync(path.join(out,`route-${id}.json`),JSON.stringify({priorSystem,recipe,ending:e,system:progress},null,2));
          console.log('New ending',name,segments,'segments');
        }break;
      }
    }
    if(!ended)throw Error('run budget');
  }catch(error){stops.push({run,error:error.message,pc:vm.state.pc,title:vm.state.title});}
  if(run%20===0)console.log('Runs',run+1,'endings',Object.keys(endings).length,'stops',stops.length);
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({runs:Number(countString),endings,stops,restoreChecks:restores,instructionSites:seen.size,textSegments:texts.size,choiceEdges:choices.size,system:progress,simulation:'All media/timing/notification closes simulated'},null,2));
fs.writeFileSync(path.join(out,'campaign.json'),JSON.stringify(campaign));
console.log('DONE',Object.keys(endings).length,'endings',seen.size,'sites',stops.length,'stops');
