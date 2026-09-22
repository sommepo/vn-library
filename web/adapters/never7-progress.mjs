// Clear flags assigned by source ending scripts; see docs/never7-routes.md.
// These are edition-specific, independent of study activity and save slots.
export const routes=[
  {id:'yuka',label:'Yuka',flags:[21]},
  {id:'haruka',label:'Haruka',flags:[22]},
  {id:'saki',label:'Saki',flags:[23]},
  {id:'kurumi',label:'Kurumi',flags:[24]},
  {id:'izumi-normal',label:'Izumi · normal',flags:[77]},
  {id:'izumi-cure-a',label:'Izumi · Cure A',flags:[49,69]},
  {id:'izumi-cure-b',label:'Izumi · Cure B',flags:[50]},
  {id:'izumi-finale',label:'Izumi · finale',flags:[70,69]},
  {id:'yuka-cure-a',label:'Yuka · Cure A',flags:[90,69]},
  {id:'yuka-cure-b',label:'Yuka · Cure B',flags:[91,69]},
];
export function validateManual(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([id,v])=>!routes.some(r=>r.id===id)||v!==true))throw Error('Invalid Never7 manual completion record');
  return structuredClone(value);
}
export function routeStatus(engine){return routes.map(r=>({...r,complete:r.flags.every(n=>engine.state.globals[n]),manual:Boolean(engine.state.manualCompletions?.[r.id])}));}
export function markComplete(engine,id){
  const route=routes.find(r=>r.id===id);if(!route)throw Error('Unknown Never7 route');
  // Main good endings also latch these source presentation/unlock flags.
  const flags=[...route.flags,...(id.startsWith('yuka-cure')?[]:[51,52,53,54])];
  for(const n of flags)engine.state.globals[n]=true;
  if([21,22,23,24].every(n=>engine.state.globals[n]))engine.state.globals[57]=true;
  engine.state.manualCompletions={...engine.state.manualCompletions,[id]:true};
  for(const n of engine.native.persistentVariables)engine.state.vars[n]=engine.state.globals[n]?1:0;
}
