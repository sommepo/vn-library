import test from 'node:test';import assert from 'node:assert/strict';
import{SaveStore,validateBank}from'../web/save-storage.mjs';
class Memory{constructor(){this.data=new Map();}async open(){}async get(k){return structuredClone(this.data.get(k));}async put(k,v){this.data.set(k,structuredClone(v));}async delete(k){this.data.delete(k);}async replaceRecords(keys,expected,records,backupKey,backup){for(const k of keys)if(JSON.stringify(this.data.get(k))!==JSON.stringify(expected[k]))throw Error('Local saves changed');this.data.set(backupKey,structuredClone(backup));for(const k of keys){if(Object.hasOwn(records,k))this.data.set(k,structuredClone(records[k]));else this.data.delete(k);}}getItem(k){return this.data.get(k)||null;}setItem(k,v){this.data.set(k,v);}}
const save=n=>({format:'vnkit.save',version:1,gameId:'test',gameSignature:'sig',state:{n}});
function server(){let bank={format:'vnkit.shared-saves',version:1,gameId:'test',gameSignature:null,revision:0,records:{}},offline=false;const receipts=new Map();
 const fetcher=async(url,options={})=>{if(offline)throw Error('offline');let data=structuredClone(bank),status=200;
 if(url.endsWith('/session'))data={token:'secret',bankReplacement:1};
 else if(options.method==='POST'){const b=JSON.parse(options.body);const receipt=receipts.get(b.operationId);if(receipt&&receipt.body===options.body&&receipt.data.revision===bank.revision){data=structuredClone(receipt.data);}else if(b.baseRevision!==bank.revision){status=409;data={error:'Shared saves changed on another device.'};}else{const records={...(b.replace?{}:bank.records),...b.changes};for(const[k,v]of Object.entries(records))if(v===null)delete records[k];bank={...bank,gameSignature:'sig',revision:bank.revision+1,records};data=structuredClone(bank);if(b.operationId)receipts.set(b.operationId,{body:options.body,data:structuredClone(data)});}}
 return{ok:status===200,status,json:async()=>data};};return{fetcher,bank:()=>structuredClone(bank),offline:v=>offline=v};}
function client(api){const local=new Memory(),preferences=new Memory(),store=new SaveStore(local,{fetcher:api.fetcher,preferences,sleep:async()=>{}});return{store,local,preferences};}
test('A read-only shared join caches the acknowledged bank without a new revision or local overwrite',async()=>{
 const api=server(),a=client(api);a.store.setMode('test','shared');await a.store.prepare('test','sig');await a.store.put('test:autosave',save(7));
 const b=client(api);await b.local.put('test:autosave',save(2));b.store.setMode('test','shared');await b.store.prepare('test','sig');
 assert.equal((await b.local.get('test:shared-cache')).records.autosave.state.n,7);assert.equal((await b.local.get('test:autosave')).state.n,2);assert.equal(api.bank().revision,1);
});
test('Local mode never calls the save API; an opted-in seed preserves local bank and activity',async()=>{
 const api=server(),{store,local}=client(api);await store.put('test:slot 1',save(1));await store.put('test:activity',{characters:9});assert.equal(api.bank().revision,0);
 const bank=await store.fetchBank('test','sig');await store.seed('test','sig',bank);store.setMode('test','shared');await store.prepare('test','sig');await store.put('test:slot 1',save(2));
 assert.equal((await store.get('test:slot 1')).state.n,2);assert.equal((await local.get('test:slot 1')).state.n,1);assert.deepEqual(await store.get('test:activity'),{characters:9});
 await assert.rejects(()=>store.seed('test','sig',api.bank()),/already exist/);
 store.setMode('test','local');assert.equal((await store.get('test:slot 1')).state.n,1);
});
test('Two device snapshots detect stale writes, freeze further changes and keep unsynced recovery',async()=>{
 const api=server(),a=client(api),b=client(api);for(const c of [a,b]){c.store.setMode('test','shared');await c.store.prepare('test','sig');}
 await a.store.put('test:autosave',save(1));await assert.rejects(()=>b.store.put('test:autosave',save(2)),/changed on another device/);
 assert.equal(api.bank().records.autosave.state.n,1);assert.equal((await b.local.get('test:shared-recovery')).records.autosave.state.n,2);assert.equal(b.store.blocked('test'),true);
 await assert.rejects(()=>b.store.put('test:autosave',save(3)));assert.equal((await b.local.get('test:shared-recovery')).records.autosave.state.n,2);
 await b.store.put('test:activity',{characters:10});assert.equal((await b.local.get('test:activity')).characters,10);
});
test('Writes queue by revision; progress is atomically attached to autosave; failed connection retains recovery',async()=>{
 const api=server(),{store,local}=client(api);store.setMode('test','shared');await store.prepare('test','sig');store.progress=()=>({format:'vnkit.progress',version:1,gameId:'test',gameSignature:'sig',globals:{13:1}});
 await Promise.all([store.put('test:autosave',save(10)),store.put('test:slot 15',save(15))]);assert.equal(api.bank().revision,2);assert.equal(api.bank().records.progress.globals[13],1);
 api.offline(true);await assert.rejects(()=>store.put('test:autosave',save(11)),/Cannot reach/);assert.equal((await local.get('test:shared-recovery')).records.autosave.state.n,11);assert.equal(api.bank().records.autosave.state.n,10);
});
test('A different tab changing preferences cannot silently move this tab to another bank',async()=>{
 const api=server(),{store,preferences}=client(api);assert.equal(store.mode('test'),'local');preferences.setItem('vnkit.save-location:test','shared');assert.equal(store.mode('test'),'local');
});
test('Imported bank identity and record signatures are checked before use',()=>{
 const bank={format:'vnkit.shared-saves',version:1,gameId:'test',gameSignature:'sig',revision:1,records:{autosave:save(1)}};assert.equal(validateBank(bank,'test','sig'),bank);
 for(const altered of [{...bank,gameId:'other'},{...bank,gameSignature:'other'},{...bank,records:{activity:save(1)}},{...bank,records:{autosave:{...save(1),gameSignature:'wrong'}}}])assert.throws(()=>validateBank(altered,'test','sig'));
});
test('A pending Next choice checkpoint overrides transient global progress atomically',async()=>{
 const api=server(),{store}=client(api);store.setMode('test','shared');await store.prepare('test','sig');
 const before={format:'vnkit.progress',version:1,gameId:'test',gameSignature:'sig',globals:{13:0}};
 store.progress=()=>({...before,globals:{13:1}});
 await store.put('test:autosave',save(1),{progress:before});assert.equal(api.bank().records.progress.globals[13],0);
 await store.put('test:autosave',save(2));assert.equal(api.bank().records.progress.globals[13],1);
});

test('Transient network failure and lost acknowledgement retry the exact operation once',async()=>{
 for(const afterCommit of [false,true]){
  const api=server();let posts=0;const bodies=[];
  const wrapped={fetcher:async(url,options)=>{
   if(options?.method==='POST'){
    posts++;bodies.push(options.body);
    if(posts===1){if(afterCommit)await api.fetcher(url,options);throw new TypeError('connection reset');}
   }
   return api.fetcher(url,options);
  }};
  const {store,local}=client(wrapped);store.setMode('test','shared');await store.prepare('test','sig');
  await store.put('test:autosave',save(25));assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);assert.equal(api.bank().revision,1);assert.equal(store.blocked('test'),false);assert.equal(await local.get('test:shared-pending'),null);
 }
});
test('A pending recovery survives page closure; retry restores it without overwriting local slots',async()=>{
 const api=server(),{store,local,preferences}=client(api);await local.put('test:slot 1',save(1));store.setMode('test','shared');await store.prepare('test','sig');
 api.offline(true);await assert.rejects(()=>store.put('test:autosave',save(9)),/Cannot reach/);const pending=await local.get('test:shared-pending');assert.equal(pending.pending.baseRevision,0);
 api.offline(false);const restarted=new SaveStore(local,{preferences,fetcher:api.fetcher,sleep:async()=>{}});
 await assert.rejects(()=>restarted.prepare('test','sig'),/unsynced save/);await restarted.recover('test','sig');assert.equal(api.bank().records.autosave.state.n,9);assert.equal(api.bank().revision,1);assert.equal((await local.get('test:slot 1')).state.n,1);assert.equal(await restarted.recovery('test'),null);
});
test('Manual recovery refuses a newer bank; choosing server position archives the recovery',async()=>{
 const api=server(),a=client(api),b=client(api);for(const c of[a,b]){c.store.setMode('test','shared');await c.store.prepare('test','sig');}
 api.offline(true);await assert.rejects(()=>a.store.put('test:autosave',save(7)));api.offline(false);await b.store.put('test:autosave',save(8));
 await assert.rejects(()=>a.store.recover('test','sig'),/changed/);assert.equal(api.bank().records.autosave.state.n,8);assert.equal((await a.store.recovery('test')).records.autosave.state.n,7);
 await a.store.dismissRecovery('test');assert.equal(await a.store.recovery('test'),null);assert.equal((await a.local.get('test:shared-recovery')).records.autosave.state.n,7);
});
test('Legacy recovery retries its original revision and already-saved recovery creates no write',async()=>{
 const api=server(),{store,local}=client(api);store.setMode('test','shared');await store.prepare('test','sig');
 const legacy={format:'vnkit.shared-saves',version:1,gameId:'test',gameSignature:'sig',revision:0,records:{autosave:save(4)}};
 await local.put('test:shared-recovery',legacy);await store.recover('test','sig');assert.equal(api.bank().revision,1);
 await local.put('test:shared-recovery',legacy);await store.recover('test','sig');assert.equal(api.bank().revision,1);assert.equal(await store.recovery('test'),null);
});
test('Server token rotation retries the same save without relaxing its bank revision',async()=>{
 const api=server();let tokenReads=0,posts=0;const bodies=[];
 const fetcher=async(url,options)=>{
  if(url.endsWith('/session')){tokenReads++;return{ok:true,status:200,json:async()=>({token:tokenReads===1?'expired':'current'})};}
  if(options?.method==='POST'){
   posts++;bodies.push(options.body);
   if(options.headers['X-VNKit-Save-Token']==='expired')return{ok:false,status:403,json:async()=>({error:'Invalid save-session token'})};
  }
  return api.fetcher(url,options);
 };
 const {store}=client({fetcher});store.setMode('test','shared');await store.prepare('test','sig');await store.put('test:autosave',save(6));
 assert.equal(tokenReads,2);assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);assert.equal(api.bank().revision,1);
});
test('Local and shared slot deletion stay in their selected bank and retain activity/progress',async()=>{
 const api=server(),{store,local}=client(api);
 await store.put('test:slot 1',save(1));await store.put('test:activity',{characters:7});await store.put('test:slot 2',save(2));
 await store.delete('test:slot 2');assert.equal(await store.get('test:slot 2'),undefined);assert.equal(api.bank().revision,0);
 await store.seed('test','sig',await store.fetchBank('test','sig'));store.setMode('test','shared');await store.prepare('test','sig');
 const progress={format:'vnkit.progress',version:1,gameId:'test',gameSignature:'sig',globals:{13:1}};await store.put('test:progress',progress);
 await store.delete('test:slot 1');assert.equal(await store.get('test:slot 1'),undefined);assert.equal((await local.get('test:slot 1')).state.n,1);
 assert.equal(Object.hasOwn(api.bank().records,'slot 1'),false);assert.deepEqual(api.bank().records.progress,progress);assert.equal((await local.get('test:activity')).characters,7);
 assert.equal(Object.hasOwn((await local.get('test:shared-cache')).records,'slot 1'),false);
 const revision=api.bank().revision;await store.delete('test:slot 1');assert.equal(api.bank().revision,revision);
 for(const name of ['progress','progress-before-debug','activity','slot 16'])await assert.rejects(()=>store.delete(`test:${name}`),/Only save slots/);
 await store.put('test:slot 1',save(9));assert.equal((await store.get('test:slot 1')).state.n,9);
});
test('Deletion retries a lost reply once and stale devices cannot resurrect or erase newer slots',async()=>{
 const api=server(),a=client(api),b=client(api);a.store.setMode('test','shared');await a.store.prepare('test','sig');await a.store.put('test:slot 1',save(1));
 b.store.setMode('test','shared');await b.store.prepare('test','sig');let posts=0;const bodies=[];
 a.store.fetcher=async(url,options)=>{if(options?.method==='POST'){posts++;bodies.push(options.body);const reply=await api.fetcher(url,options);if(posts===1)throw Error('lost delete reply');return reply;}return api.fetcher(url,options);};
 await a.store.delete('test:slot 1');assert.equal(posts,2);assert.equal(bodies[0],bodies[1]);assert.equal(api.bank().revision,2);
 await assert.rejects(()=>b.store.put('test:slot 1',save(7)),/changed/);assert.equal(api.bank().records['slot 1'],undefined);
 await a.store.put('test:slot 1',save(7));const c=client(api);c.store.setMode('test','shared');await c.store.prepare('test','sig');await a.store.put('test:slot 1',save(8));
 await assert.rejects(()=>c.store.delete('test:slot 1'),/changed/);assert.equal(api.bank().records['slot 1'].state.n,8);
});
test('Offline deletion survives restart as a tombstone and explicit recovery removes only that slot',async()=>{
 const api=server(),{store,local,preferences}=client(api);store.setMode('test','shared');await store.prepare('test','sig');await store.put('test:slot 1',save(1));await store.put('test:slot 2',save(2));
 api.offline(true);await assert.rejects(()=>store.delete('test:slot 1'),/Cannot reach/);const pending=await local.get('test:shared-pending');
 assert.equal(pending.pending.changes['slot 1'],null);assert.equal(Object.hasOwn(pending.records,'slot 1'),false);assert.equal(api.bank().records['slot 1'].state.n,1);
 api.offline(false);const restarted=new SaveStore(local,{preferences,fetcher:api.fetcher,sleep:async()=>{}});await assert.rejects(()=>restarted.prepare('test','sig'),/unsynced/);
 await restarted.recover('test','sig');assert.equal(api.bank().records['slot 1'],undefined);assert.equal(api.bank().records['slot 2'].state.n,2);assert.equal(await restarted.recovery('test'),null);
});
test('Deleting a slot queued behind the first shared save uses its committed signature',async()=>{
 const api=server(),sent=[];const {store}=client({fetcher:async(url,options)=>{if(options?.method==='POST')sent.push(JSON.parse(options.body));return api.fetcher(url,options);}});
 store.setMode('test','shared');await store.prepare('test','sig');
 await Promise.all([store.put('test:slot 1',save(1)),store.delete('test:slot 1')]);
 assert.deepEqual(sent.map(b=>b.gameSignature),['sig','sig']);assert.deepEqual(sent.map(b=>b.baseRevision),[0,1]);assert.equal(api.bank().records['slot 1'],undefined);
});

const progress={format:'vnkit.progress',version:1,gameId:'test',gameSignature:'sig',globals:{13:1}};
test('Whole-bank shared replacement removes absent slots and progress, backs up destination, and preserves local activity',async()=>{
 const api=server(),a=client(api);await a.local.put('test:slot 2',save(2));await a.local.put('test:activity',{characters:500});
 await a.store.writeBank('test','sig',0,{'slot 1':save(1),progress});
 const old=await a.store.fetchBank('test','sig'),source=await a.store.localBank('test','sig');
 await a.store.replaceBank('test','sig','shared',source,old);
 assert.deepEqual(api.bank().records,{'slot 2':save(2)});assert.deepEqual((await a.local.get('test:before-copy-shared')).records,old.records);
 assert.deepEqual((await a.store.localBank('test','sig')).records,source.records);assert.equal((await a.local.get('test:activity')).characters,500);
 assert.equal(await a.store.recovery('test'),null);
});
test('Whole-bank local replacement keeps server unchanged and detects stale local snapshots',async()=>{
 const api=server(),a=client(api);await a.local.put('test:slot 2',save(2));await a.local.put('test:progress',progress);
 await a.store.writeBank('test','sig',0,{'slot 1':save(1)});
 const old=await a.store.localBank('test','sig'),source=await a.store.fetchBank('test','sig');
 await a.local.put('test:slot 3',save(3));await assert.rejects(()=>a.store.replaceBank('test','sig','local',source,old),/changed/);
 assert.equal(await a.local.get('test:before-copy-local'),undefined);
 const fresh=await a.store.localBank('test','sig');await a.store.replaceBank('test','sig','local',source,fresh);
 assert.deepEqual((await a.store.localBank('test','sig')).records,source.records);assert.deepEqual(api.bank(),source);
 assert.deepEqual((await a.local.get('test:before-copy-local')).records,fresh.records);
});
test('A replacement with a lost acknowledgement is retried identically and never reverts a newer server revision',async()=>{
 const api=server(),a=client(api);await a.store.writeBank('test','sig',0,{'slot 1':save(1),progress});
 const old=await a.store.fetchBank('test','sig'),source=await a.store.localBank('test','sig');
 const bodies=[];a.store.fetcher=async(url,options)=>{if(options?.method==='POST'){bodies.push(options.body);const r=await api.fetcher(url,options);if(bodies.length===1)throw Error('lost reply');return r;}return api.fetcher(url,options);};
 await a.store.replaceBank('test','sig','shared',source,old);
 assert.equal(bodies.length,2);assert.equal(bodies[0],bodies[1]);assert.deepEqual(api.bank().records,{});
 await a.store.writeBank('test','sig',2,{'slot 4':save(4)});
 await assert.rejects(()=>a.store.replaceBank('test','sig','shared',source,old),/changed/);
 assert.deepEqual(api.bank().records,{'slot 4':save(4)});
});
test('Interrupted replacement recovery remembers replace mode and refuses a new copy until resolved',async()=>{
 const api=server(),a=client(api);await a.store.writeBank('test','sig',0,{'slot 1':save(1),progress});
 const old=await a.store.fetchBank('test','sig'),source=await a.store.localBank('test','sig');
 api.offline(true);await assert.rejects(()=>a.store.replaceBank('test','sig','shared',source,old),/Cannot reach/);
 assert.equal((await a.store.recovery('test')).pending.replace,true);
 await assert.rejects(()=>a.store.replaceBank('test','sig','local',old,source),/unsynced/);
 api.offline(false);await a.store.recover('test','sig');assert.deepEqual(api.bank().records,{});
 assert.equal(await a.store.recovery('test'),null);
});

test('An older server cannot silently merge a requested replacement',async()=>{
 const api=server(),a=client(api);await a.store.writeBank('test','sig',0,{'slot 1':save(1)});
 const source=await a.store.localBank('test','sig'),old=await a.store.fetchBank('test','sig');
 a.store.fetcher=async(url,options)=>url.endsWith('/session')?{ok:true,json:async()=>({token:'secret'})}:api.fetcher(url,options);
 await assert.rejects(()=>a.store.replaceBank('test','sig','shared',source,old),/Update and restart/);
 assert.deepEqual(api.bank(),old);
});
