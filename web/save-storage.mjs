import {randomId} from './engine.mjs';
// Save-location routing. Study history and preferences never leave this device.
export const SAVE_SLOTS=Object.freeze(['autosave','quicksave','before next choice',...Array.from({length:15},(_,i)=>`slot ${i+1}`)]);
export const SHARED_KEYS=Object.freeze([...SAVE_SLOTS,'progress','progress-before-debug']);
const clone=value=>value===undefined?undefined:structuredClone(value);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const applyChanges=(records,changes)=>{const result={...records};for(const[name,value]of Object.entries(changes)){if(value===null)delete result[name];else result[name]=value;}return result;};
export function validateBank(bank,game,signature){
 if(!bank||bank.format!=='vnkit.shared-saves'||bank.version!==1||bank.gameId!==game||!Number.isSafeInteger(bank.revision)||bank.revision<0||!bank.records||typeof bank.records!=='object'||Array.isArray(bank.records))throw new Error('Invalid shared save-bank response. Local saves are unchanged.');
 if(bank.gameSignature!==null&&bank.gameSignature!==signature)throw new Error('Shared saves use another game/content revision. Choose local saves or a compatible import.');
 for(const[name,record]of Object.entries(bank.records)){
  if(!SHARED_KEYS.includes(name)||record?.format!==(name.startsWith('progress')?'vnkit.progress':'vnkit.save')||record.version!==1||record.gameId!==game||record.gameSignature!==signature)throw new Error('Incompatible record in shared save bank. Local saves are unchanged.');
 }
 return bank;
}
export class SaveStore {
 constructor(local,{fetcher=(...args)=>fetch(...args),preferences=globalThis.localStorage,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){this.local=local;this.fetcher=fetcher;this.sleep=sleep;this.preferences=preferences;this.sessions=new Map();this.queues=new Map();this.modes=new Map();this.token=null;this.onStatus=()=>{};this.progress=()=>null;}
 async open(){return this.local.open();}
 mode(game){if(!this.modes.has(game)){let value='local';try{if(this.preferences.getItem(`vnkit.save-location:${game}`)==='shared')value='shared';}catch{}this.modes.set(game,value);}return this.modes.get(game);}
 setMode(game,mode){if(!['local','shared'].includes(mode))throw new Error('Unknown save location');this.preferences.setItem(`vnkit.save-location:${game}`,mode);this.modes.set(game,mode);this.onStatus(game,mode==='shared'?'Shared saves':'Local saves');}
 blocked(game){return this.mode(game)==='shared'&&Boolean(this.sessions.get(game)?.error);}
 split(key){const at=key.lastIndexOf(':');return[key.slice(0,at),key.slice(at+1)];}
 async request(path,options={}){
  let response;
  try{response=await this.fetcher(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),...options});}
  catch(cause){const error=new Error(cause.name==='TimeoutError'?'Shared-save request timed out. Check your home-server/Tailscale connection.':'Cannot reach shared saves. Check your home-server/Tailscale connection.');error.retryable=true;throw error;}
  let data;
  try{data=await response.json();}catch{
   const error=new Error(`Shared-save server returned an incomplete or invalid response (HTTP ${response.status}).`);
   error.status=response.status;error.retryable=response.ok||[408,502,503,504].includes(response.status);throw error;
  }
  if(!response.ok){const error=new Error(data.error||`Shared saves unavailable (${response.status})`);error.status=response.status;error.retryable=[408,502,503,504].includes(response.status);throw error;}
  return data;
 }
 async fetchBank(game,signature){return validateBank(await this.request(`/api/saves/${encodeURIComponent(game)}`),game,signature);}
 async prepare(game,signature){
  if(this.mode(game)!=='shared')return;
  const current=this.sessions.get(game);if(current){if(current.error)throw current.error;if(current.gameSignature!==null&&current.gameSignature!==signature)throw new Error('Shared save revision mismatch');return;}
  const bank=await this.fetchBank(game,signature);this.sessions.set(game,bank);
  const recovery=await this.recovery(game);
  if(recovery){bank.error=new Error('An unsynced save is preserved on this device. Open Library → Save location to retry it or choose the server position.');throw bank.error;}
  // A read-only join may not cause any write. Retain the acknowledged server
  // bank immediately, separately from this device's original local positions.
  await this.local.put(`${game}:shared-cache`,clone(bank));
  this.onStatus(game,'Shared saves · connected');
 }
 async writeBank(game,signature,revision,changes,{operationId=randomId(),onRetry=()=>{},replace=false}={}){
  const body=JSON.stringify({format:'vnkit.shared-saves',version:1,gameId:game,gameSignature:signature,baseRevision:revision,operationId,changes,...(replace?{replace:true}:{})});
  const send=async()=>{
   if(!this.token||replace){
    const session=await this.request('/api/saves/session');
    if(replace&&session.bankReplacement!==1)throw new Error('Update and restart VN Library on the server before replacing a save bank. No replacement was sent.');
    this.token=session.token;
   }
   return this.request(`/api/saves/${encodeURIComponent(game)}`,{method:'POST',headers:{'Content-Type':'application/json','X-VNKit-Save-Token':this.token},body});
  };
  let refreshed=false;
  for(let attempt=0;;){
   try{return await send();}catch(error){
    if(error.status===403&&!refreshed){this.token=null;refreshed=true;continue;}
    if(!error.retryable||attempt>=2)throw error;
    onRetry(++attempt);await this.sleep(attempt===1?600:1600);
   }
  }
 }
 async recovery(game){
  const pending=await this.local.get(`${game}:shared-pending`),recovery=pending||await this.local.get(`${game}:shared-recovery`);
  return recovery&&!recovery.resolved?recovery:null;
 }
 async dismissRecovery(game,resolution='server-position-selected'){
  const recovery=await this.recovery(game);
  if(recovery)await this.local.put(`${game}:shared-recovery`,{...recovery,resolved:true,resolution});
  await this.local.put(`${game}:shared-pending`,null);
 }
 async recover(game,signature){
  const recovery=await this.recovery(game);if(!recovery)throw new Error('No unsynced save is waiting on this device.');
  validateBank(recovery,game,signature);
  const bank=await this.fetchBank(game,signature);
  // A legacy client had no receipt. Only acknowledge its full candidate if it
  // exactly matches the server, otherwise retain its original revision check.
  if(same(bank.records,recovery.records)){
   await this.dismissRecovery(game,'already-saved');return;
  }
  const pending=recovery.pending||{operationId:randomId(),baseRevision:recovery.revision,changes:recovery.records};
  if(!Number.isSafeInteger(pending.baseRevision)||pending.baseRevision!==recovery.revision)throw new Error('Invalid recovery revision. Export the recovery instead.');
  const candidate={...recovery,pending};await this.local.put(`${game}:shared-pending`,candidate);
  try{
   await this.writeBank(game,signature,pending.baseRevision,pending.changes,{operationId:pending.operationId,replace:pending.replace===true,onRetry:n=>this.onStatus(game,`Shared saves · retrying (${n}/2)`)});
   await this.dismissRecovery(game,'retried-successfully');
   this.onStatus(game,'Shared saves · saved');
  }catch(error){this.onStatus(game,'Shared saves · paused',error);throw error;}
 }
 async localBank(game,signature){const records={};for(const name of SHARED_KEYS){const value=await this.local.get(`${game}:${name}`);if(value!==undefined)records[name]=value;}return validateBank({format:'vnkit.shared-saves',version:1,gameId:game,gameSignature:signature,revision:0,updatedAt:null,records},game,signature);}
 async seed(game,signature,bank){
  if(Object.keys(bank.records).length)throw new Error('Shared saves already exist. Use them or export/import individual slots; nothing was overwritten.');
  const local=await this.localBank(game,signature);
  if(Object.keys(local.records).length)await this.writeBank(game,signature,bank.revision,local.records);
 }
 async replaceBank(game,signature,destination,source,previous){
  if(!['local','shared'].includes(destination))throw new Error('Unknown save location');
  validateBank(source,game,signature);validateBank(previous,game,signature);
  await this.flush(game);
  if(await this.recovery(game))throw new Error('Resolve the unsynced save before copying banks: retry it or choose the server position.');
  const backup={...clone(previous),copiedAt:new Date().toISOString(),destination};
  const backupKey=`${game}:before-copy-${destination}`;
  if(destination==='local'){
   const prefix=records=>Object.fromEntries(Object.entries(records).map(([name,value])=>[`${game}:${name}`,value]));
   await this.local.replaceRecords(SHARED_KEYS.map(name=>`${game}:${name}`),prefix(previous.records),prefix(source.records),backupKey,backup);
   return;
  }
  // This is an explicit replacement, not a patch. Persist its operation before
  // transport so a dropped acknowledgement/restart retains that distinction.
  await this.local.put(backupKey,backup);
  const pending={operationId:randomId(),baseRevision:previous.revision,changes:clone(source.records),replace:true};
  const candidate={...clone(previous),gameSignature:signature,records:clone(source.records),pending,recoveryAt:new Date().toISOString()};
  await this.local.put(`${game}:shared-pending`,candidate);
  try{
   const result=await this.writeBank(game,signature,previous.revision,pending.changes,{operationId:pending.operationId,replace:true});
   if(result.gameId!==game||(result.gameSignature!==signature&&!(result.gameSignature===null&&!Object.keys(source.records).length))||!Number.isSafeInteger(result.revision)||result.revision<previous.revision)throw new Error('Server did not acknowledge the copied bank.');
   const bank={...result,records:candidate.records};this.sessions.set(game,bank);
   await this.local.put(`${game}:shared-cache`,clone(bank));
   await this.dismissRecovery(game,'bank-copied');
  }catch(error){
   const session=this.sessions.get(game);if(session)session.error=error;
   this.onStatus(game,'Shared saves · paused',error);throw error;
  }
 }
 async get(key){
  const[game,name]=this.split(key);
  if(!SHARED_KEYS.includes(name)||this.mode(game)!=='shared')return this.local.get(key);
  const session=this.sessions.get(game);if(!session)throw new Error('Open this game before reading its shared saves.');
  return clone(session.records[name]);
 }
 async put(key,value,options={}){
  const[game,name]=this.split(key);
  if(!SHARED_KEYS.includes(name)||this.mode(game)!=='shared')return this.local.put(key,value);
  const changes={[name]:clone(value)};
  // Resume position and persistent route flags are one atomic server update.
  if(name==='autosave'){const progress=Object.hasOwn(options,'progress')?options.progress:this.progress(game);if(progress)changes.progress=clone(progress);}
  return this.change(game,value.gameSignature,changes);
 }
 async delete(key){
  const[game,name]=this.split(key);
  if(!SAVE_SLOTS.includes(name))throw new Error('Only save slots can be deleted. Route progress and activity are kept separately.');
  if(this.mode(game)!=='shared')return this.local.delete(key);
  return this.change(game,this.sessions.get(game)?.gameSignature,{[name]:null});
 }
 async change(game,signature,changes){
  const run=async()=>{
   const session=this.sessions.get(game);if(!session)throw new Error('Shared saves have not been opened.');if(session.error)throw session.error;
   if(Object.entries(changes).every(([k,v])=>v===null?!Object.hasOwn(session.records,k):same(session.records[k],v)))return;
   const gameSignature=signature??session.gameSignature;
   this.onStatus(game,'Saving to home server…');
   const pending={operationId:randomId(),baseRevision:session.revision,changes};
   const candidate={...session,gameSignature,records:applyChanges(session.records,changes),pending,recoveryAt:new Date().toISOString()};
   try{
    // Persist the exact operation before transport; tab closure must not lose it.
    await this.local.put(`${game}:shared-pending`,candidate);
    const result=await this.writeBank(game,gameSignature,session.revision,changes,{operationId:pending.operationId,onRetry:n=>this.onStatus(game,`Shared saves · retrying (${n}/2)`)});
    if(result.gameId!==game||result.gameSignature!==gameSignature||!Number.isSafeInteger(result.revision)||result.revision<session.revision)throw new Error('Server did not acknowledge the save revision.');
    Object.assign(session,result,{records:candidate.records});
    // Separate cache, never the user's pre-existing local save bank.
    try{await this.local.put(`${game}:shared-cache`,clone(session));await this.local.put(`${game}:shared-pending`,null);}catch{/* Server commit succeeded; do not misreport a save failure. */}
    this.onStatus(game,'Shared saves · saved');
   }catch(error){
    let recovery='';
    try{await this.local.put(`${game}:shared-recovery`,{...candidate,recoveryAt:new Date().toISOString()});recovery=' A recovery copy is kept on this device.';}catch{recovery=' Export the current state before closing this tab.';}
    session.error=new Error(`${error.message}${recovery} Shared saving is paused; open Saves → Save location to retry, reload or switch to local.`);
    this.onStatus(game,'Shared saves · paused',session.error);throw session.error;
   }
  };
  const pending=(this.queues.get(game)||Promise.resolve()).catch(()=>{}).then(run);this.queues.set(game,pending);return pending;
 }
 async flush(game){await this.queues.get(game);}
}
