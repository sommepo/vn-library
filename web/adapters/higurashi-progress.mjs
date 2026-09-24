// Minimal native clear cells, traced at the ending SSET sites. No other route's
// prerequisite flags or assumed-read text are granted by manual completion.
export const ROUTES=[
 ['oni','鬼隠し編',{11:1,12:1},1],['wata','綿流し編',{13:1},8],
 ['tatari','祟殺し編',{},4],['hima','暇潰し編',{},16],
 ['tara','盥回し編',{10:1},2],['me','目明し編',{14:1},0],
 ['tsumi','罪滅し編',{16:1},0],['tsuki','憑落し編',{15:1},0],
 ['mina','皆殺し編',{17:1},0],['mio','澪尽し編',{1:1},32],
];
export function routeProgress(state){return ROUTES.map(([id,label])=>({id,label,complete:!!state.completed[label+' 終劇'],manual:!!state.manual[id]}));}
export function markRouteComplete(state,id){const row=ROUTES.find(r=>r[0]===id);if(!row)throw Error('Unknown Higurashi route');Object.assign(state.system,row[2]);state.system[21]=(state.system[21]||0)|row[3];state.completed[row[1]+' 終劇']=true;state.manual[id]=true;}
