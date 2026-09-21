import {routes} from './clannad-progress.mjs';
export function validateReadPaths(data,engine){
 if(data?.format!=='vnkit.read-paths'||data.version!==1||data.gameId!==engine.content.id||data.gameSignature!==engine.signature||!data.paths||typeof data.paths!=='object'||Array.isArray(data.paths))throw Error('Incompatible completed-route read paths');
 const paths={};
 for(const [route,p]of Object.entries(data.paths)){
  if(!routes.some(r=>r.id===route)||!Array.isArray(p.ids)||p.ids.length>100000||!p.ids.every(id=>typeof id==='string'&&/^SEEN\d{4}\.MZX:/.test(id)&&engine.content.runtime.scripts[id.split(':')[0]]))throw Error('Invalid completed-route read path');
  paths[route]=new Set(p.ids);
 }
 return paths;
}
export function inheritedRead(engine,id){
 return engine.routeProgress().some(r=>r.complete&&engine.readPaths?.[r.id]?.has(id));
}
