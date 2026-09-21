/** SLPS-25222 v1.04 native bridge. See docs/pia-natives.md for ELF evidence. */
import {invokeSchedule} from './pia-schedule.mjs';
import {TASK_FRAMES,initialTaskPose,taskPose} from './pia-task.mjs';
const clone = value => structuredClone(value);
const i32 = value => Number(value) | 0;
export class PiaNatives {
  constructor(content) {
    this.content = content; this.data = content.nativeData || {};
    this.assetNames = new Map(Object.keys(content.assets || {}).map(key => [key.toUpperCase(), key]));
  }
  init(vm) {
    if (!vm.state.native.pia) {
      const startup = {...this.data.startup, ...this.content.startup};
      vm.state.native.pia = {
        format: 'vnkit.pia-native-state', version: 1,
        familyName: startup.familyName, firstName: startup.firstName,
        uniformType: startup.uniformType, systemGameClear: startup.systemGameClear,
        date: [7, 30], time: [18, 0], money: 30000, condition: 0,
        speaker: '', speakerId: 0, speakerVisible: false, voiceName: '', speakingIds: [],
        message: [], choices: [], appear: {}, love: {}, notoriety: 0, flags: {}, threeSize: {}, warnings: [],
        scene: {background: null, sprites: {}, music: null},
        loadedBackground: null, loadedSprites: {}, clearSprites: [], envSE: {},
      };
    }
    return vm.state.native.pia;
  }
  problem(message, instruction) {
    throw new Error(`${instruction.id}: ${message}`);
  }
  warning(state, instruction, feature) {
    if (!state.warnings.some(x => x.source === instruction.id && x.feature === feature))
      state.warnings.push({source: instruction.id, feature});
  }
  string(vm, value, instruction) {
    try { return vm.readString(value); }
    catch (error) { this.problem(`invalid native string: ${error.message}`, instruction); }
  }
  subst(text, state, instruction) {
    return text.replaceAll('##', '').replaceAll('＊１＊', state.familyName ?? (() => this.problem('player family name not initialized', instruction))())
      .replaceAll('＊２＊', state.firstName ?? (() => this.problem('player first name not initialized', instruction))())
      .replaceAll('{familyName}', state.familyName ?? '').replaceAll('{firstName}', state.firstName ?? '');
  }
  asset(kind, name, instruction, optional = false) {
    const sourceName = name.toUpperCase();
    const mapped = this.content.resources?.[kind]?.[sourceName];
    if (mapped) return typeof mapped === 'string' ? mapped : mapped.asset;
    const archive = {background:'NBG.NFP',cg:'NEV.NFP',sprite:'NCHR.NFP',voice:'NVAM.NFP',sound:'NVAM.NFP'}[kind];
    const suffix = kind === 'voice' || kind === 'sound' ? `${sourceName}.VAS` : `${sourceName}.MLH:${sourceName}.NBP`;
    const key = `${archive}:${suffix}`;
    if (this.assetNames.has(key)) return this.assetNames.get(key);
    if (optional) return null;
    this.problem(`unresolved ${kind} resource ${sourceName}`, instruction);
  }
  filename(kind, name, state, instruction) {
    name=name.toUpperCase();
    if (kind==='background') {
      const three=['BK09','BK10','BK16','BK20','BK21','BK23','BK30','BK31','BK32','BK33','BK36'];
      const two=['BK14','BK17','BK18','BK24','BK25','BK26','BK27','BK28','BK29','BK38','BK40','BK41','BK42'];
      const minutes=state.time[0]*60+state.time[1];
      if (three.includes(name)) name += minutes < 1080 ? 'A' : minutes < 1140 ? 'B' : 'C';
      if (two.includes(name)) name += minutes < 1140 ? 'A' : 'C';
    }
    if ((kind==='cg' && this.data.uniformCG?.includes(name)) || (kind==='sprite' && this.data.uniformSprites?.includes(name))) {
      const suffix=this.data.uniformSuffixes?.[state.uniformType];
      if (!suffix) this.problem('uniform selection has not been initialized',instruction);
      if(kind==='sprite') name=name.slice(0,4)+suffix+name.slice(4);
      else if(this.data.uniformCGReorder?.includes(name)) name=name.slice(0,-1)+suffix+name.slice(-1);
      else name+=suffix;
    }
    return name;
  }
  imageAsset(kind,name,state,instruction) {
    const asset=this.asset(kind,name,instruction,true);
    if(asset)return asset;
    const sourceNames=this.data.sourceImageContainers?.[kind];
    // _NplaneLoad substitutes FILEERR only for an absent archive member.
    // A present member whose extraction failed must remain an import error.
    if(Array.isArray(sourceNames)&&!sourceNames.includes(name.toUpperCase())) {
      const fallback=this.asset(kind,'FILEERR',instruction);
      this.warning(state,instruction,`original ${kind} ${name} is absent; displaying the source engine's FILEERR image`);
      return fallback;
    }
    return this.asset(kind,name,instruction);
  }
  commitSprites(state, instruction) {
    // _SetNbustAppearance 0x156408..0x156438 also swaps the prepared BG/CG plane.
    this.commitBackground(state);
    for (const id of state.clearSprites) delete state.scene.sprites[id];
    state.clearSprites=[];
    for (const [id,sprite] of Object.entries(state.loadedSprites)) state.scene.sprites[id]=clone(sprite);
    state.loadedSprites={};
  }
  commitBackground(state) {
    if(state.loadedBackground!==null) {
      state.scene.background=state.loadedBackground === 'BLACK' ? null : state.loadedBackground;
      state.loadedBackground=null;
    }
  }
  choose(vm, value) {
    const state=this.init(vm);
    if(!state.choices.some(x=>x.value===Number(value) && x.visible)) throw new Error('invalid Pia choice');
    vm.setGlobal('SELECT_REG',Number(value));
    state.choices=[];
    return Number(value);
  }
  completeTask(vm) {
    const state=this.init(vm),task=state.scene.task;
    if(!task?.active)return;
    task.frame=task.durationFrames;task.active=false;
    if(task.action===-1){state.scene.task=null;state.scene.background=null;state.scene.sprites={};state.loadedBackground=null;state.dateWindowVisible=true;}
  }
  taskPending(state,instruction,sound=null) {
    const task=state.scene.task;
    return {pending:{kind:'task',id:instruction.id,taskId:task.id,ms:Math.round(task.durationFrames*1000/60),
      sourceFrames:task.durationFrames,sound,kill:task.action===-1}};
  }
  invoke(name, args, vm, instruction) {
    const state=this.init(vm);
    const str=index=>this.string(vm,args[index],instruction);
    const count=(...allowed)=> { if(!allowed.includes(args.length))this.problem(`${name} unsupported argument count ${args.length}`,instruction); };
    switch(name) {
      case 'EnterScenario': count(1); return {};
      case 'GetSysGameClear':
        count(0); if(state.systemGameClear===undefined)this.problem('fresh system record not initialized',instruction);
        return {result:state.systemGameClear & 1};
      case 'SetDate': count(2,3);state.date=args.slice(0,2).map(i32);return {};
      case 'SetTime': count(2,3);state.time=args.slice(0,2).map(i32);return {};
      case 'Money': count(0,1);if(!args.length)return {result:state.money};state.money=i32(args[0]);return {};
      case 'Condition': count(0,1);if(!args.length)return {result:state.condition};state.condition=Math.min(120,Math.max(0,i32(args[0])));return {};
      case 'SysAppearF': count(2);state.appear[i32(args[0])]=!!args[1];return {};
      case 'FLAG': {
        count(1,2);const flag=i32(args[0]);
        if(flag<0||flag>=512)this.problem('FLAG index exceeds source512bytearray',instruction);
        state.flags??={};
        if(args.length===1)return {result:state.flags[flag]??0};
        state.flags[flag]=(i32(args[1])<<24)>>24;return {};
      }
      case 'AddNotoriety': case 'Notoriety': {
        count(...(name==='Notoriety'?[0,1]:[1]));
        if(!args.length)return {result:state.notoriety??0};
        state.notoriety=Math.min(120,Math.max(0,i32(args[0])+(name==='AddNotoriety'?(state.notoriety??0):0)));
        return {};
      }
      case 'SysThreeSizeF': count(2);state.threeSize??={};state.threeSize[i32(args[0])]=!!args[1];return {};
      case 'Wait': {
        count(1);const frames=i32(args[0])*5;
        if(frames<0||frames>360000)this.problem('wait beyond supported bounded timing',instruction);
        return {pending:{kind:'wait',id:instruction.id,ms:Math.round(frames*1000/60),sourceFrames:frames}};
      }
      case 'Love': case 'AddLove': {
        count(...(name==='Love'?[1,2]:[2]));
        const character=i32(args[0]);
        if(character<0 || character>20)this.problem('affection character index outside verified character range',instruction);
        state.love??={};
        const current=state.love[character]??0;
        if(args.length===1)return {result:current};
        state.love[character]=Math.min(300,Math.max(0,i32(args[1])+(name==='AddLove'?current:0)));
        return {};
      }
      case 'HideFadeFrame':
        count(0);state.frameVisible=false;
        this.warning(state,instruction,'message/date frame fade: native animation not reproduced');return {};
      case 'PlayMovie': {
        count(1);const file=str(0).toUpperCase(),asset=this.asset('movie',file,instruction);
        return {pending:{kind:'movie',id:instruction.id,asset,sourceName:file}};
      }
      case 'StopSE': count(0);state.pendingSE=null;return {effects:[{op:'stopSound',channel:'effects'}]};
      case 'Name': {
        count(1,2,3);
        const raw=str(0), entry=this.data.names?.[raw] || this.data.unknownName;
        if(!entry)this.problem('native speaker lookup was not imported',instruction);
        state.voiceName='';
        if(args.length!==3) {
          const speaker=this.subst(entry.text,state,instruction);
          if(state.speaker!==speaker)state.message=[];
          state.speaker=speaker;state.speakerId=entry.characterId;state.speakerVisible=entry.visible;
        }
        if(args.length>1 && entry.characterId!==0) {
          state.voiceName=str(1);
          if(state.speakingIds.length>=8)state.speakingIds=[];
          state.speakingIds.push(entry.characterId);
        }
        return {};
      }
      case 'Mess': {
        count(1,2);
        const info=vm.stringInfo?.(args[0]);
        state.message.push({text:this.subst(str(0),state,instruction), source:info?.id || instruction.id, instruction:instruction.id});
        return {};
      }
      case 'Hitret': {
        count(1,2);
        state.frameVisible=true;
        this.commitSprites(state,instruction);
        const voice=state.voiceName ? this.asset('voice',state.voiceName,instruction,true) : null;
        if(state.voiceName && !voice)this.warning(state,instruction,`voice pending conversion: ${state.voiceName}`);
        const pending={kind:'text',id:instruction.id,text:state.message.map(x=>x.text).join('\n'),
          source:instruction.id,segments:clone(state.message),speaker:state.speakerVisible?state.speaker:'',
          voice,voiceName:state.voiceName || null,readFlag:i32(args[0]),continuation:args.length>1?i32(args[1]):0};
        state.message=[];state.voiceName='';state.speakingIds=[];
        if(state.pendingSE?.asset)pending.leadSound=state.pendingSE.asset;
        state.pendingSE=null;
        return {pending};
      }
      case 'ClearMessage': count(0);state.message=[];return {};
      case 'AddSelectMess': {
        count(1,2);
        state.choices.push({id:`${instruction.id}:option`,source:vm.stringInfo?.(args[0])?.id || instruction.id,
          text:this.subst(str(0),state,instruction),value:state.choices.length+1,visible:args.length===1||!!args[1]});
        return {};
      }
      case 'SelectStart': {
        count(0);
        const options=state.choices.filter(x=>x.visible).map(x=>clone(x));
        if(!options.length)this.problem('selection has no visible options',instruction);
        return {pending:{kind:'choice',id:instruction.id,options}};
      }
      case 'PicBg': case 'PicEv': {
        count(1,2);
        const type=name==='PicBg'?'background':'cg', file=this.filename(type,str(0),state,instruction);
        state.loadedBackground=file==='BLACK'?'BLACK':this.imageAsset(type,file,state,instruction);
        return {};
      }
      case 'PicUp': {
        count(2);
        const file=this.filename('sprite',str(0),state,instruction),charId=Number(file.slice(1,3));
        if(!/^C\d\d/.test(file) || charId<1 || charId>20)this.problem(`invalid sprite character ${file}`,instruction);
        const asset=this.asset('sprite',file,instruction), layout=this.content.resources?.sprite?.[file];
        const occupied={...state.scene.sprites,...state.loadedSprites};
        const slot=occupied[charId]?.slot ?? [0,1,2].find(candidate=>!Object.values(occupied).some(sprite=>sprite.slot===candidate));
        if(slot===undefined)this.problem('all three source character occupancy planes are occupied',instruction);
        state.loadedSprites[charId]={asset,characterId:charId,sourceName:file,position:i32(args[1]),slot,
          ...(typeof layout==='object' ? layout : {})};
        state.clearSprites=state.clearSprites.filter(x=>String(x)!==String(charId));
        return {};
      }
      case 'PicUpClear':
        count(0,1);state.clearSprites=!args.length || i32(args[0])===-1 ? Object.keys(state.scene.sprites) : [i32(args[0])];
        return {};
      case 'DrawCG': case 'DrawEffect': {
        count(...(name==='DrawCG'?[0,1,2,3,4,5]:[1,3,4]));
        if(!args.length || i32(args[0])===0)return {};
        const effect=i32(args[0]);
        if(![1,3,0x103,0x105,0x10b,0x10e,0x10f,0x113,0x118,0x203].includes(effect))this.problem(`unknown draw effect ${effect}`,instruction);
        if(effect===0x105)this.commitSprites(state,instruction);
        else this.commitBackground(state);
        if(effect!==1)this.warning(state,instruction,`visual transition ${effect}: final composition rendered without native animation`);
        return {};
      }
      case 'MaskDrawCG':
        count(5);this.commitBackground(state);this.warning(state,instruction,'mask transition: final composition rendered without native animation');return {};
      case 'PlayMusic': {
        count(1);const file=str(0).toUpperCase();
        if(file==='BGM0'){state.scene.music=null;state.musicName=null;return {};}
        const asset=this.asset('music',file,instruction,true);
        state.musicName=file;state.scene.music=asset;
        if(!asset)this.warning(state,instruction,`sequenced music pending conversion: ${file}`);
        return {};
      }
      case 'PlaySE': {
        count(1);if(typeof args[0]!=='number')this.problem('PlaySE expects numeric source ID',instruction);
        const file=`PIASE${String(i32(args[0])).padStart(3,'0')}`,asset=this.asset('sound',file,instruction,true);
        state.pendingSE={name:file,asset};
        if(!asset)this.warning(state,instruction,`sound pending conversion: ${file}`);
        return {};
      }
      case 'PlayEnvSE': {
        count(1);if(typeof args[0]!=='number')this.problem('PlayEnvSE expects numeric source ID',instruction);
        const file=`S${String(i32(args[0])).padStart(2,'0')}`,asset=this.asset('ambient',file,instruction,true);
        const previous=Object.values(state.envSE).map(item=>({op:'stopSound',asset:item.asset}));
        state.envSE={[file]:{asset}};
        if(!asset)this.warning(state,instruction,`ambient sound pending conversion: ${file}`);
        return {effects:[...previous,...(asset?[{op:'sound',asset,loop:true}]:[])]};
      }
      case 'StopEnvSE': {
        count(0,1);const mode=args.length?str(0).toUpperCase():'';
        if(mode===''||mode==='FADEOUT')this.warning(state,instruction,'ambient sound fade shortened to stop');
        const files=Object.keys(state.envSE);
        const effects=files.map(file=>({op:'stopSound',asset:state.envSE[file]?.asset}));
        for(const file of files)delete state.envSE[file];
        return {effects};
      }
      case 'TaskWakeUp': {
        count(1);if(i32(args[0])!==0)this.problem(`unsupported original task ${args[0]}`,instruction);
        if(state.scene.task)this.problem('presentation task is already active',instruction);
        const assets={};
        for(const key of ['BGH','BGV','MN','MT','ON','OT']){
          const id=this.assetNames.get(`NETC.NFP:TAKA129.MLH:129${key}.NBP`);
          if(!id)this.problem(`missing original CG129 task image 129${key}`,instruction);assets[key]=id;
        }
        state.scene.task={type:'pia-takako129',version:1,id:instruction.id,source:instruction.id,
          action:0,frame:0,ambientFrame:0,active:true,durationFrames:TASK_FRAMES[0],assets,from:initialTaskPose()};
        state.systemCG??={};state.systemCG[430]=true;state.systemCG[431]=true;state.dateWindowVisible=false;
        this.warning(state,instruction,'CG129 presentation: source poses, actions, scrolling and sound order; movement easing and scheduler overhead approximated at60Hz');
        return {...this.taskPending(state,instruction),result:0};
      }
      case 'TaskActionSet': {
        count(2);if(i32(args[0])!==0||!state.scene.task)this.problem('missing or unsupported presentation task handle',instruction);
        const action=i32(args[1]);if(![1,2,3,4,5].includes(action))this.problem(`unsupported CG129 action ${action}`,instruction);
        const task=state.scene.task;if(task.active)this.problem('previous CG129 action has not completed',instruction);
        const from=taskPose(task,task.durationFrames);delete from.black;delete from.shake;
        Object.assign(task,{from,action,source:instruction.id,frame:0,active:true,durationFrames:TASK_FRAMES[action]});
        const soundName=action===1?'PIASE051':action===4?'PIASE054':null;
        const sound=soundName?this.asset('sound',soundName,instruction,true):null;
        if(soundName&&!sound)this.warning(state,instruction,`task sound pending conversion: ${soundName}`);
        return this.taskPending(state,instruction,sound);
      }
      case 'TaskKill': {
        count(1);if(i32(args[0])!==0)this.problem('unsupported presentation task handle',instruction);
        if(!state.scene.task)return {};
        const task=state.scene.task;if(task.active)this.problem('CG129 task still has an unfinished action',instruction);
        const from=taskPose(task,task.durationFrames);delete from.black;
        Object.assign(task,{from,action:-1,source:instruction.id,frame:0,active:true,durationFrames:TASK_FRAMES[-1]});
        return this.taskPending(state,instruction);
      }
      case 'RoomInit': {
        count(1,2);
        // _RoomInit resets menu enable bits, but does not clear daily action bytes.
        state.room??={};
        state.room.enabled=Object.fromEntries(Object.entries({main:8,data:9,town:5,dormitory:8,call:6,item:5,system:8,sub:8})
          .map(([key,length])=>[key,Array(length).fill(true)]));
        const file=this.filename('background',str(0),state,instruction);
        const background=this.asset('background',file,instruction),changed=state.scene.background!==background;
        state.scene.background=background;state.scene.sprites={};state.loadedBackground=null;
        state.loadedSprites={};state.clearSprites=[];state.message=[];state.pendingSE=null;state.frameVisible=false;
        const minutes=state.time[0]*60+state.time[1],musicName=minutes>=420&&minutes<=1139?'BGM12':'BGM13';
        state.musicName=musicName;state.scene.music=this.asset('music',musicName,instruction,true);
        if(!state.scene.music)this.warning(state,instruction,`room music pending conversion: ${musicName}`);
        this.warning(state,instruction,'room initialization: native fades shortened; source background/music/menu state preserved');
        return {effects:[{op:'stopSound',channel:'effects'}],pending:{kind:'wait',id:instruction.id,ms:0,sourceFrames:changed?128:0}};
      }
      case 'RoomSaMain': case 'RoomSaMoveTown': {
        count(2);if(!state.room?.enabled)this.problem('room menu has not been initialized',instruction);
        const group=name==='RoomSaMain'?'main':'town',index=i32(args[0]),enabled=state.room.enabled[group];
        if(index<0||index>=enabled.length)this.problem(`room ${group} option index outside source bitset`,instruction);
        enabled[index]=!!args[1];return {};
      }
      case 'GetRoomAction': case 'GetRoomActionWhere': case 'GetRoomActionCall': case 'GetRoomActionMove': {
        count(0);
        const field={GetRoomAction:'roomAction',GetRoomActionWhere:'roomActionWhere',GetRoomActionCall:'roomActionCall',GetRoomActionMove:'roomActionMove'}[name];
        return {result:state[field]??0};
      }
      case 'SetRoomActionCall': case 'SetRoomActionMove': {
        count(1);state[name==='SetRoomActionCall'?'roomActionCall':'roomActionMove']=(i32(args[0])<<24)>>24;return {};
      }
      case 'RoomMenu': count(0);this.problem('original room menu choices and submenu execution are not implemented',instruction);break;
      case 'chain': count(1);return {pending:{kind:'chain',id:instruction.id,script:str(0).toUpperCase()+'.SPC'}};
      default: {
        const returned=invokeSchedule(name,args,vm,instruction,state,{str,count,problem:message=>this.problem(message,instruction)});
        if(returned!==undefined)return returned;
        this.problem(`unsupported native ${name}`,instruction);
      }
    }
  }
}
