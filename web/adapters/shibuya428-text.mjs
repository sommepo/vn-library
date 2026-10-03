/* Source text defaults are an executable initialization script, not a font
 * preference. Callers supply its verified native label-zero entry. */
import {Operands} from './shibuya428-control.mjs';
export function decode428TextSetting(i){
 const r=new Operands(i);let c;
 const names={0x30:'letterGap',0x32:'lineGap',0x34:'left',0x36:'right',0x38:'top',0x3a:'bottom'};
 if(names[i.code])c={type:'textSetting',name:names[i.code],value:r.uint(4)};
 else if(i.code===0x29)c={type:'textFont',style:r.uint(),size:r.uint(2)};
 else if(i.code===0x24)c={type:'textDefaultCadence',frames:r.uint()};
 else if(i.code===0x6a||i.code===0x6b)c={type:'layerVisibility',layer:r.uint(),visible:i.code===0x6a};
 else r.fail('Unsupported source initialization command');
 r.end();return c;
}
export function source428TextDefaults(scripts,entry){
 const s=scripts[entry.script],label=s?.labels[entry.label];if(!label)throw Error('Missing verified initialization label');
 const tokens=new Map(s.tokens.map(i=>[i.offset,i])),commands=[];let pc=label.offset;
 for(let n=0;n<128;n++){
  const i=tokens.get(pc);if(!i)throw Error('Initialization outside source');pc=i.next;
  // Native initializer skips checkpoint payloads and stops at script end.
  if(i.code===0x22){const r=new Operands(i);r.uint();r.end();continue;}
  if(i.code===0xac){new Operands(i).end();return commands;}
  commands.push(decode428TextSetting(i));
 }
 throw Error('Initialization instruction budget');
}
