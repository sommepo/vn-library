/** Original SLPS-25222 v1.04 room/schedule state bridge. Evidence: docs/pia-runtime.md. */
const i32=value=>Number(value)|0;
const i8=value=>(i32(value)<<24)>>24;
const i16=value=>(i32(value)<<16)>>16;
const clamp=value=>Math.min(120,Math.max(0,i32(value)));
// fPiaCalDayCount is a game calendar, not a Gregorian date subtraction.
export function piaDayCount(month,day) {
  month=i16(month);day=i16(day);
  if(month===7)return ({9:1,26:2,30:3,31:4})[day]??-1;
  if(month===8&&day>=0&&day<32)return day+4;
  return -1;
}
const strcmp=(left,right)=> {
  for(let index=0;index<=Math.max(left.length,right.length);index++) {
    const difference=(left.charCodeAt(index)||0)-(right.charCodeAt(index)||0);
    if(difference)return difference;
  }
  return 0;
};

export function invokeSchedule(name,args,vm,instruction,state,{str,count,problem}) {
  switch(name) {
    case 'MenuTopScenarioNameCmp':
      count(1);return {result:strcmp(str(0).toUpperCase(),state.menuTopScenarioName??'')};
    case 'SetMenuTopScenarioName':
      count(1);state.menuTopScenarioName=str(0).toUpperCase();return {};
    case 'ActionClear':
      count(0);
      for(const field of ['roomRest','firstMessage','actionWho','roomAction','roomActionWhere','roomActionCall','roomActionMove'])state[field]=0;
      return {};
    case 'SetFirstMessage':count(1);state.firstMessage=i8(args[0]);return {};
    case 'IsTimeAfter':
      count(2);return {result:Number(i8(state.time[0])*60+i8(state.time[1])>=(Math.imul(i32(args[0]),60)+i32(args[1])|0))};
    case 'Tenderness':case 'AddTenderness':
      count(...(name==='Tenderness'?[0,1]:[1]));
      if(!args.length)return {result:state.tenderness??0};
      state.tenderness=clamp(i32(args[0])+(name==='AddTenderness'?(state.tenderness??0):0));return {};
    case 'SetConstSchedule':case 'SetSchedule': {
      count(4);
      const index=piaDayCount(args[0],args[1]);
      if(index<0)problem('schedule date outside original fPiaCalDayCount calendar');
      state.scheduleFlags??={};
      state.scheduleFlags[index*3]=name==='SetConstSchedule'?1:0;
      state.scheduleFlags[index*3+1]=i8(args[2]);
      state.scheduleFlags[index*3+2]=i8(args[3]);
      return {};
    }
    case 'CALL':
      count(1);vm.replaceNativeResult(0);vm.exec(str(0));return {};
    case 'ChangeMessage':
      count(0);state.message=[];
      if(vm.state.parents.length)vm.returnToScenario(0);
      else vm.restartScenario();
      return {};
    case 'ScReturn': {
      count(1);state.message=[];
      const result=i32(args[0]);
      if(vm.state.parents.length)vm.returnToScenario(Math.sign(result),{skipParent:result!==0});
      else vm.restartScenario();
      return {};
    }
    default:return undefined;
  }
}
