// Edition-specific basic presentation policies, derived from SLPM-66302 v1.01.
// See docs/clannad-basic-execution.md for callbacks and deliberate degradation.
// This is an allowlist: an unknown native never becomes an automatic no-op.
export const BASIC_EVENTS = new Set([0,11,12,13,14,17,18,19,20,21,62,70,71,72,73,74,77,78,25,26,27,28,29,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,49,52,53,60,63,64,65,66,67,68]);
export function basicEventSupported(args) {
  if(args?.length!==4||args.some(x=>!/^\d+$/.test(x)))return false;
  const [channel,event,a,b]=args.map(Number);
  if(!BASIC_EVENTS.has(event)||channel>9)return false;
  if(event===14)return channel===0&&a<=6&&b===0;
  if(event===17)return channel===0&&a<=2&&b===0;
  if(event===19)return channel===0&&a<=4&&b===0;
  if(event===62)return channel===3&&a<=1&&b===0;
  if(event===53)return channel===0&&a===0&&b<=7;
  if(event===49)return channel===0&&[7,14,21].includes(a)&&b===0;
  if(event===63)return channel===0&&a<=3&&b===0;
  if(event===64)return channel===0&&a<=2&&b===0;
  if(event===60)return channel===1&&a===0&&b===0;
  if(event===67)return channel===2&&a===0&&b===0;
  return channel===0&&a===0&&b===0;
}
export function startBasicEvent(engine,i,effects) {
  if(!basicEventSupported(i.args))return false;
  const [channel,event,a]=i.args.map(Number),s=engine.state,F=s.vars.F;
  s.nativeChannels??={};delete s.nativeChannels[channel];
  if(event===45){F[1114]=0;F[1115]=7;F[1116]=0;}
  if(event===49)F[1115]=a;
  if(event===52)F[1115]=Math.min(49,(F[1115]||0)+7);
  if(event===53){
    engine.assign({bank:'F',index:1114,operator:'='},Math.min((F[1114]||0)+1,F[1115]||0));
    engine.assign({bank:'F',index:1116,operator:'+='},1);
    if(F[1116]>0)delete s.nativeChannels[1];
    const resource=engine.content.nativeData.sound_lookup?.names.DOGUSI;
    if(!resource)engine.fail(i,'Missing original combo sound lookup');
    effects.push({op:'sound',asset:engine.asset(resource.asset,i),channel:'native-combo',loop:false});
  }
  if([53,60,67].includes(event))s.nativeChannels[channel]={event,source:i.id};
  if([11,42].includes(event))s.scene.layers=[];
  const data=engine.content.nativeData.basic_events?.[event];
  if([0,14,17,18,19,20,21,62,70,71,72,74,77,78].includes(event)&&!data)engine.fail(i,'Missing recovered native basic-event data');
  if(data?.final_background){engine.background(data.final_background,i);s.scene.background=s.nextBackground;}
  if(data?.clear_background)s.scene.background=s.nextBackground=null;
  if(data?.clear_actors)s.scene.layers=[];
  if(data?.stop_music)s.scene.music=null;
  if(data?.music!=null)s.scene.music={asset:engine.asset(`music:${data.music}`,i),loop:false};
  if(data?.global_flag!=null)s.vars.G[data.global_flag]=1;
  if(data?.buffer_text)s.buffer.push({script:s.script,pc:s.pc-1});
  const sound=data?.sound_name||data?.sound_variants?.[a];
  if(sound){const r=engine.content.nativeData.sound_lookup?.names[sound.toUpperCase()];if(!r)engine.fail(i,'Missing native effect sound');effects.push({op:'sound',asset:engine.asset(r.asset,i),channel:'native-notice'});}
  if(data?.notices){s.pending={kind:'pause',id:i.id,basicNative:true,display:{speaker:'',text:data.notices[a]}};}

  if(event===77)s.pending={kind:'choice',id:i.id,occurrenceId:engine.makeId(),nativeChoice:77,promptAsset:engine.asset(data.prompt_asset,i),assignment:{bank:'F',index:1090,operator:'='},options:engine.nativeChoiceOptions(77)};

  engine.warn(i,`Basic presentation: native ${event} animation/timing simplified; verified script-state effects retained`);
  return true;
}
export function signalBasicEvent(engine,i) {
  const [channel,signal]=i.args.map(Number),s=engine.state;
  if(i.args.length!==2||i.args.some(x=>!/^\d+$/.test(x))||channel>9||signal>3)engine.fail(i,'Untested native signal');
  const event=s.nativeChannels?.[channel]?.event;
  if(event===67&&[1,2].includes(signal)){s.scene.layers=[];delete s.nativeChannels[channel];}
  else if([53,60].includes(event)&&signal===2)delete s.nativeChannels[channel];
}
export function validateBasicChannels(engine) {
  const channels=engine.state.nativeChannels;
  if(channels==null)return;
  if(typeof channels!=='object'||Array.isArray(channels)||Object.keys(channels).length>10)throw new Error('Invalid native channel state');
  for(const [channel,t] of Object.entries(channels)){
    const i=engine.scripts[t?.source?.split(':')[0]]?.instructions.find(i=>i.id===t.source);
    if(!i||i.op!=='EVT0'||!basicEventSupported(i.args)||String(Number(i.args[0]))!==channel||Number(i.args[1])!==t.event||![53,60,67].includes(t.event))throw new Error('Saved native channel differs from source');
  }
}

// The native scanner recognizes the first underscore, then four command bytes.
// These exact shipped leftovers either have no underscore or dispatch to no handler.
export const legacySupported = text => /^_Xvib\(-?\d+\)$/.test(text)||/^(?:mouseclear|SAVEPOINT|PDTEXPAND\(bg021y,2\)|BOXCOPY\(2,1,(?:50|100|150|200|250)\)|BG\(\?,000\)|@GMES_CLS_ALL\(1000\)|PCMVOLSET\(015,255\))$/.test(text);
