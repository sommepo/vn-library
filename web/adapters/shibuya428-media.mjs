/* Experimental SNS numeric-resource presentation operands. These consumers are
 * separate from a complete PSP renderer; unknown effects stay unsupported. */
import {Operands} from './shibuya428-control.mjs';

// Native table 0x089caab4: the source's third byte is NOT the parameter count.
const EFFECT_ARITY = [null,1,1,1,7,3,4,3,3,3,1,0,4,2,2];
const MOTION_ARITY = [null,4,5,7,9,6,7,8,6,8,11,6,9,6,6,6,8,5,5,4,5,3,4,9,3,2,3,4,4,7,7,11,3,4];
export const PRESENTATION_CODES = new Set([3,4,5,6,7,8,9,10,0x0b,0x0c,0x0f,0x10,0x11,0x13,0x14,0x15,0x16,0x17,0x18,0x23,0x25,0x28,0x29,0x2a,0x44,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x6b,0x7a,0x7b,0x8f,0x90,0x91,0x92,0x93,0x96,0x9c,0x9d,0x9e,0x9f,0xa0,0xad,0xaf,0xb2]);
PRESENTATION_CODES.add(0x7e);
export function decode428Presentation(i) {
  const r = new Operands(i); let command;
  switch (i.code) {
    case 0xad:command={type:'deviceFeedback',from:r.uint(),to:r.uint(),frames:r.uint(2),delay:r.uint(2)};break;
    case 0xaf:command={type:'deviceFeedbackStop'};break;
    case 0xb2:command={type:'deviceFeedbackWait'};break;
    case 0x6a:case 0x6b:command={type:'pictureVisible',layer:r.uint(),visible:i.code===0x6a};break;
    case 0x63: {
      const effect = r.uint(), layer = r.uint(), sourceCount = r.uint();
      const count = EFFECT_ARITY[effect];
      if (count == null) r.fail('Unknown picture effect');
      command = {type:'pictureEffect', effect, layer, sourceCount,
        parameters:Array.from({length:count},()=>r.signed16())}; break;
    }
    case 0x44: command = {type:'picture', resource:r.uint(2), layer:r.uint(), flags:r.uint()}; break;
    case 0x64: command = {type:'pictureWait', layer:r.uint()}; break;
    case 0x65: command = {type:'pictureFinish', layer:r.uint()}; break;
    case 0x66:case 0x67:case 0x68:case 0x69:{
      const effect=r.uint(),layer=r.uint(),bank=r.uint(),resource=r.uint(2),count=MOTION_ARITY[effect];
      if(count==null)r.fail('Unknown picture motion');
      command={type:({102:'motionSetup',103:'motionUpdate',104:'motionWait',105:'motionFinish'})[i.code],effect,layer,bank,resource};
      if(i.code===0x66||i.code===0x67){command.sourceCount=r.uint();command.parameters=Array.from({length:count},()=>r.signed16());}
      break;
    }
    case 0x7a: {
      const resource = r.uint(2), volumePercent = r.uint(2), pan = r.signed16(), spatialDistance = r.uint(2);
      const parameterA = r.uint(2), parameterB = r.uint(2), selector = r.uint(2), floatBits = r.uint(4), flags = r.uint();
      const bytes = new DataView(new ArrayBuffer(4)); bytes.setUint32(0,floatBits);
      const parameterFloat = bytes.getFloat32(0);
      if (!Number.isFinite(parameterFloat)) r.fail('Non-finite sound parameter');
      command = {type:'sound', resource, volumePercent, volume:Math.fround(volumePercent / 100), pan, spatialDistance,
        parameterA, parameterB, selector, parameterFloat, floatBits, flags, secondaryResource:selector ? r.uint(2) : null}; break;
    }
    case 0x91: {
      const resource=r.uint(2),volumePercent=r.uint(2);
      command={type:'ambient',resource,volumePercent,volume:Math.fround(volumePercent/100),
        outgoingFrames:r.uint(2),incomingFrames:r.uint(2),outgoingDelay:r.uint(2),incomingDelay:r.uint(2),wait:r.uint()};
      break;
    }
    case 0x7e:{
      const resource=r.uint(2),changes=[];
      for(let index=0;index<64;index++){
        const field=r.uint();if(!field)break;
        if(![1,2,3].includes(field))r.fail('Unknown direct sound property');
        if(field===1){const mode=r.uint();if(mode!==0)r.fail('Unsupported direct sound arithmetic');changes.push({field,mode,value:Math.fround(r.signed16()/100)});}
        else changes.push({field,value:r.signed16()});
        if(index===63)r.fail('Direct sound property budget');
      }
      command={type:'soundDirect',resource,changes,flags:r.uint()};break;
    }
    case 0x7b:command={type:'soundStop',resource:r.uint(2),frames:r.uint(2),delay:r.uint(2),parameter:r.uint(2),wait:r.uint()};break;
    case 0x8f:command={type:'ambientStop',frames:r.uint(2),delay:r.uint(2),wait:r.uint()};break;
    case 0x92:command={type:'music',resource:r.uint(2),volumePercent:r.uint(2),frames:r.uint(2),delay:r.uint(2),flags:r.uint()};break;
    case 0x93:command={type:'musicStop',resource:r.uint(2),frames:r.uint(2),delay:r.uint(2),wait:r.uint()};break;
    case 0x96:{
      const resource=r.uint(2),mode=r.uint();if(mode>2)r.fail('Unknown music arithmetic');
      let value;if(mode===2){const view=new DataView(new ArrayBuffer(4));view.setUint32(0,r.uint(4));value=view.getFloat32(0);}else value=r.signed16();
      if(!Number.isFinite(value))r.fail('Non-finite music property');
      command={type:'musicControl',resource,mode,value,frames:r.uint(2),delay:r.uint(2),wait:r.uint()};break;
    }
    case 0x9c:command={type:'movie',resource:r.uint(2),volumePercent:r.uint(2),layer:r.uint(),yieldFrame:r.uint()};break;
    case 0x9d:command={type:'movieStop',resource:r.uint(2),layer:r.uint()};break;
    case 0x9e:case 0x9f:case 0xa0:command={type:({158:'movieWait',159:'moviePause',160:'movieResume'})[i.code],resource:r.uint(2),layer:r.uint()};break;
    case 0x90:{
      const resource=r.uint(2),changes=[];
      for(let n=0;n<64;n++){
        const field=r.uint();if(!field)break;
        if(field!==1&&field!==10)r.fail('Unknown sound property');
        const mode=field===1?r.uint():0;
        if(field===1&&mode>2)r.fail('Unknown sound property arithmetic');
        let value;
        if(field===10||mode===2){const view=new DataView(new ArrayBuffer(4));view.setUint32(0,r.uint(4));value=view.getFloat32(0);}
        else value=Math.fround(r.signed16()/100);
        if(!Number.isFinite(value))r.fail('Non-finite sound property');
        changes.push({field,mode,value});if(n===63)r.fail('Sound property budget');
      }
      command={type:'soundControl',resource,changes,frames:r.uint(2),delay:r.uint(2),wait:r.uint()};break;
    }
    case 3:case 5:case 7:case 9: case 0x0b: case 0x0c: {
      const frames=r.uint(4);
      if(frames>=0x80000000)r.fail('Unsupported negative text-fade duration');
      command = i.code<11 ? {type:'textFade', frames:Math.max(1,frames),...(i.code>=7?{direction:'out'}:{}),...([5,9].includes(i.code)?{batch:true}:{})} :
        {type:'textWholeFade',direction:i.code===0x0b?'in':'out',frames:Math.max(1,frames)}; break;
    }
    case 4:case 6:case 8:case 10: command = {type:'textFadeEnd',...([6,10].includes(i.code)?{batch:true}:{})}; break;
    case 0x10: command = {type:'textWait'}; break;
    case 0x23: command = {type:'textCadence', frames:r.uint()}; break;
    case 0x25: command = {type:'textCadenceReset'}; break;
    case 0x28:case 0x29:command={type:'textFontChange',mode:i.code===0x28?'current':'default',style:r.uint(),size:r.uint(2)};break;
    case 0x2a:command={type:'textFontChange',mode:'reset'};break;
    case 0x0f: command = {type:'textShift',pixels:r.uint()};break;
    case 0x11:command={type:'textPosition',axes:r.uint(),x:r.uint(2),y:r.uint(2)};break;
    case 0x13:case 0x14:case 0x15:case 0x16:command={type:'textColor',code:i.code,rgb:i.code===0x15?[128,128,128]:[r.uint(),r.uint(),r.uint()]};break;
    case 0x17:case 0x18:command={type:'textAlignment',mode:i.code===0x17?1:0};break;
    default: r.fail('Unsupported presentation command');
  }
  r.end(); return command;
}

// Deliberately narrow opening renderer contract. Operand recovery does not
// authorize approximating later picture effects, sound selectors or reuse.
export function require428OpeningCommand(command) {
  switch (command.type) {
    case 'deviceFeedback':
      if([command.from,command.to,command.frames,command.delay].some(n=>!Number.isInteger(n)||n<0)||command.from>255||command.to>255||command.frames>60000||command.delay>60000)throw Error('Unsupported device feedback');break;
    case 'deviceFeedbackStop':case 'deviceFeedbackWait':break;
    case 'pictureVisible':if(![0,1,2].includes(command.layer)||typeof command.visible!=='boolean')throw Error('Unsupported picture visibility');break;
    case 'pictureEffect':
      if(![0,1,2].includes(command.layer)||command.layer!==1&&command.effect!==11)throw Error('Unsupported picture layer transition');
      if(command.effect===4){
        if(command.parameters.length!==7||command.parameters.some(n=>!Number.isInteger(n)||n<0)||command.parameters.slice(0,3).some(n=>n>60000)||command.parameters.slice(3,6).some(n=>n>255)||command.parameters[6]!==0)throw Error('Unsupported colour transition parameters');
      }else if (![1,2,3,11].includes(command.effect) || (command.effect===11 ? command.parameters.length!==0 : command.parameters.length!==1 || command.parameters[0]<0)) throw Error('Unsupported picture effect renderer');
      break;
    case 'picture':
      if (command.flags !== 1 || command.resource >= 0x4000||![0,1,2].includes(command.layer)) throw Error('Unsupported picture loading mode');
      break;
    case 'sound':
      if (command.resource & 0x4000 || command.pan ||
          command.parameterFloat || command.flags&~3 || (command.selector ? !Number.isInteger(command.secondaryResource)||command.secondaryResource<0||command.secondaryResource>=0x4000 : command.secondaryResource !== null) || command.volumePercent > 100)
        throw Error('Unsupported sound playback mode');
      break;
    case 'ambientStop':
      if(command.wait||command.frames>60000||command.delay>60000)throw Error('Unsupported ambient stop');break;
    case 'ambient':
      if(command.resource&0x4000||command.volumePercent>100||command.wait>1)throw Error('Unsupported ambient sound mode');
      break;
    case 'soundStop':
      if(command.resource&0x4000||command.parameter||command.wait)throw Error('Unsupported sound-stop mode');break;
    case 'soundDirect':
      if(command.resource&0x4000||command.flags&~2||!['1','1,2','1,3','1,2,3'].includes(command.changes.map(change=>change.field).join(','))||command.changes.some(change=>change.value<0||(change.field===1?change.mode!==0||change.value>1:change.value>60000)))throw Error('Unsupported direct sound properties');break;
    case 'soundControl':
      if(command.resource&0x4000||command.wait||command.changes.some(c=>c.field!==1||c.mode!==0||c.value<0||c.value>1))throw Error('Unsupported sound-control mode');break;
    case 'music':
      if(command.resource>=0x4000||command.flags!==8||command.volumePercent>100)throw Error('Unsupported music playback mode');break;
    case 'musicControl':
      if(command.resource>=0x4000||command.mode!==0||command.wait!==0||command.value<0||command.value>100)throw Error('Unsupported music control mode');break;
    case 'musicStop':
      if(command.resource>=0x4000||command.wait!==0)throw Error('Unsupported music stop mode');break;
    case 'movie':case 'movieStop':case 'movieWait':case 'moviePause':case 'movieResume':
      if(command.resource>=0x8000||command.layer!==1||(command.type==='movie'&&(command.volumePercent>100||command.yieldFrame>1)))throw Error('Unsupported movie mode');break;
    case 'motionSetup':case 'motionUpdate':case 'motionWait':case 'motionFinish':
      if([5,6].includes(command.effect)){
        if(command.type==='motionUpdate'||command.bank!==0||command.layer!==1||command.resource>=0x4000||command.parameters&&(command.parameters.length!==(command.effect===5?6:7)||command.parameters.some(n=>!Number.isInteger(n)||n<0)||command.parameters.slice(0,3).some(n=>n>60000)||command.parameters.slice(3).some(n=>n>255)))throw Error('Unsupported picture flash mode');break;
      }
      if(command.effect===26){
        if(command.bank!==0||command.layer!==1||command.resource>=0x4000||command.parameters&&(command.parameters.length!==3||command.parameters.some(n=>!Number.isInteger(n))||command.parameters[0]<0||command.parameters[0]>255||command.parameters[1]<2||command.parameters[1]>32767||command.parameters[2]<4||command.parameters[2]>32767))throw Error('Unsupported camera noise mode');break;
      }
      if(command.effect===24){
        if(command.bank!==0||![0,1,2].includes(command.layer)||command.resource>=0x4000||command.parameters&&(command.parameters.length!==3||command.parameters.some(n=>!Number.isInteger(n))||command.parameters[0]<0||command.parameters[0]>60000||command.parameters[1]<0||command.parameters[1]>255||![0,1,2].includes(command.parameters[2])))throw Error('Unsupported picture opacity mode');break;
      }
      if([14,15,16].includes(command.effect)){
        if(command.bank!==0||!(command.effect===14?[1,2].includes(command.layer):command.layer===1)||command.resource>=0x4000||command.parameters&&(command.parameters.length!==(command.effect===16?8:6)||command.parameters.some(n=>!Number.isInteger(n))||command.parameters[0]<0||command.parameters[0]>60000||![0,1,2,3].includes(command.parameters[5])))throw Error('Unsupported picture translation mode');
        break;
      }
      if([21,22].includes(command.effect)){
        if(command.bank!==0||command.layer!==1||command.resource>=0x4000||command.parameters&&(command.parameters.length!==(command.effect===21?3:4)||command.parameters.some(n=>!Number.isInteger(n))||command.parameters[0]<0||command.parameters[0]>60000||command.parameters[1]< -1||command.parameters[1]>60000||command.parameters[2]<0||command.parameters[2]>32767||command.effect===22&&(command.parameters[3]<0||command.parameters[3]>32767)))throw Error('Unsupported picture shake mode');
        break;
      }
      if(![8,11,12].includes(command.effect)||command.bank!==0||!(command.effect===8?[0,1].includes(command.layer):command.layer===1)||command.resource>=0x4000||command.effect===11&&command.parameters&&command.parameters[5]!==0||
        (command.parameters&&(command.parameters.length!==(command.effect===12?9:6)||command.parameters.some(n=>!Number.isInteger(n))||command.parameters[0]<0||command.parameters[0]>60000||![0,1,2,3].includes(command.parameters[5])||command.parameters[3]<=command.parameters[1]||command.parameters[4]<=command.parameters[2]||command.effect===12&&(![0,1,2].includes(command.parameters[8])||command.parameters[6]<0||command.parameters[7]<0))))throw Error('Unsupported picture motion mode');break;
    case 'textPosition':if(command.axes>3)throw Error('Unsupported text position axes');break;
    case 'textColor':if(![0x13,0x14,0x15,0x16].includes(command.code)||command.rgb.length!==3||command.rgb.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('Unsupported source text color');break;
    case 'textFontChange':if(command.mode!=='reset'&&(command.style>4||command.size<1||command.size>2047))throw Error('Unsupported source font setting');break;
    case 'pictureWait': case 'pictureFinish': case 'textFade': case 'textWholeFade': case 'textFadeEnd': case 'textWait': case 'textCadence': case 'textCadenceReset': case 'textShift': case 'textAlignment': break;
    default: throw Error('Unknown opening presentation command');
  }
  return command;
}
