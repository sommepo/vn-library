// Edition-specific completion cells, traced to source CALC sites. See docs/clannad-menu.md.
// Native credit flags 41/42 are shared by several endings, not character clear flags.
export const routes = [
  {id:'misae',label:'相楽 美佐枝 · Misae',flags:[13]},
  {id:'tomoyo',label:'坂上 智代 · Tomoyo',flags:[3]},
  {id:'misae-light',label:'Misae’s light (within Tomoyo’s route)',flags:[31],extra:true},
  {id:'yukine',label:'宮沢 有紀寧 · Yukine',flags:[6,30]},
  {id:'ryou',label:'藤林 椋 · Ryou',flags:[],ending:'SEEN3505.MZX:00008fa9'},
  {id:'kyou',label:'藤林 杏 · Kyou',flags:[4]},
  {id:'kappei',label:'柊 勝平 · Kappei',flags:[12]},
  {id:'sunoharas',label:'春原兄妹 · Sunoharas',flags:[9]},
  {id:'kotomi',label:'一ノ瀬 ことみ · Kotomi',flags:[5]},
  {id:'fuko',label:'伊吹 風子 · Fuko (School Life)',flags:[2]},
  {id:'koumura',label:'幸村 俊夫 · Koumura',flags:[15]},
  {id:'nagisa',label:'古河 渚 · Nagisa (School Life)',flags:[1]},
  {id:'sanae',label:'早苗 · Sanae’s light',flags:[8],after:true},
  {id:'yoshino',label:'芳野 · Yoshino’s light',flags:[11],after:true},
  {id:'naoyuki',label:'直幸 · Naoyuki’s light',flags:[14],after:true},
  {id:'fuko-light',label:'風子 · Fuko’s returned light',flags:[33],after:true},
  {id:'kouko',label:'公子 · Kouko’s light',flags:[10],after:true},
  {id:'akio',label:'秋生 · Akio’s light',flags:[7],after:true},
  {id:'after-story',label:'AFTER STORY · first ending',flags:[35],after:true},
  {id:'true-ending',label:'AFTER STORY · true ending',flags:[45],after:true},
];
const orbFlags = new Set([3,4,5,7,8,9,10,11,12,14,15,30,31,33]);
export function validateReaderProgress(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid completion record');
  for(const [id,record] of Object.entries(value)) {
    if(!routes.some(r=>r.id===id)||!record||!['manual','source'].includes(record.method)||!Number.isFinite(Date.parse(record.at))||
      (record.method==='source'&&record.source!==routes.find(r=>r.id===id).ending))throw new Error('Invalid route completion record');
  }
  return structuredClone(value);
}
export function routeStatus(engine) {
  const G=engine.state.vars.G,marks=engine.readerProgress||{};
  return routes.map(r=>({...r,complete:r.flags.length?r.flags.every(k=>G[k]===1):Boolean(marks[r.id]),manual:marks[r.id]?.method==='manual'}));
}
export function markComplete(engine,id) {
  const route=routes.find(r=>r.id===id);if(!route)throw new Error('Unknown route');
  const G=engine.state.vars.G;
  // The recovered Fuko light repays the light used earlier (G32, -1).
  // Imported partial progress may not have that earlier event: record the pair,
  // rather than manufacture a fourteenth light by marking only the repayment.
  if(route.id==='fuko-light'&&G[33]!==1&&G[32]!==1){G[32]=1;G[0]=(G[0]||0)-1;}
  for(const flag of route.flags) {
    if(G[flag]!==1&&orbFlags.has(flag))G[0]=(G[0]||0)+1;
    G[flag]=1;
  }
  engine.readerProgress={...engine.readerProgress,[id]:{method:'manual',at:new Date().toISOString()}};
  engine.state.vars.G=engine.titleGlobals();
  return routeStatus(engine);
}
export function recordEnding(engine) {
  if(engine.current?.kind!=='end')return;
  const route=routes.find(r=>r.ending===engine.current.id);
  if(route&&!engine.readerProgress?.[route.id])engine.readerProgress={...engine.readerProgress,[route.id]:{method:'source',source:route.ending,at:new Date().toISOString()}};
  engine.state.vars.G=engine.titleGlobals();
}
