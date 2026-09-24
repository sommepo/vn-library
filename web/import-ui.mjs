// ISO bytes travel only to the reader's own origin, in bounded resumable chunks.
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
const size=n=>`${(n/1024**3).toFixed(2)} GiB`;
const digest=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');
export async function importPanel(body,{openGame,refreshLibrary,platform='ps2'}) {
 let alive=true,token,timer,uploading=false,paused=false,last='',activeJob,serverBusy=false;
 const message=el('p','','notice');message.setAttribute('role','status');
 const upload=el('section'),label=el('label','Choose your game ISO'),file=el('input');
 file.type='file';file.accept='.iso';file.id='isoFile';label.htmlFor=file.id;
 const send=el('button','Add game'),pause=el('button','Pause upload'),progress=el('progress');progress.max=1;progress.value=0;progress.hidden=true;pause.hidden=true;
 upload.append(label,file,send,pause,progress);
 const sources=el('details'),jobs=el('section');sources.append(el('summary','Use an ISO already on the host'));jobs.append(el('h2','Your games'));
 const destination=el('p','Checking copy destination…','import-destination');
 const editions=el('div','','muted');editions.append(el('p','Checking supported editions…'));
 body.append(el('p','Choose an ISO and click Add game.'),destination,editions,upload,message,sources,jobs);

 const show=text=>{if(alive)message.textContent=text;};
 const request=async(path,body,binary=false)=>{
  const response=await fetch(path,{method:'POST',headers:{'X-VNKit-Import-Token':token,'Content-Type':binary?'application/octet-stream':'application/json'},body:binary?body:JSON.stringify(body),signal:AbortSignal.timeout(binary?120000:30000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'Import request failed');return result;
 };
 const action=async args=>{try{activeJob=args.id;show('Preparing your game…');await request('/api/imports/action',args);last='';await poll();}catch(e){show(e.message);}};
 const control=(label,fn,disabled=false)=>{const b=el('button',label);b.disabled=disabled;b.onclick=()=>Promise.resolve().then(fn).catch(e=>show(e.message));return b;};
 async function poll(){
  if(!alive)return;
  try{
   const response=await fetch('/api/imports');if(!response.ok)throw new Error('Import service unavailable. Reload after the server update.');
   const data=await response.json();token=data.token;destination.textContent=data.uploadDirectory?`A copy of the game will be made in ${data.uploadDirectory}`:'Copy destination unavailable. Reload the reader after updating the app.';serverBusy=data.busy;send.disabled=uploading||serverBusy;
   const current=data.jobs.find(j=>j.id===activeJob);if(current&&!uploading)show(current.status==='complete'?'Your game is ready. Choose Open game below.':current.status==='failed'?'Preparation stopped. Your ISO is saved; try again below.':current.message);
   const fingerprint=JSON.stringify(data);if(fingerprint===last)return;last=fingerprint;
   editions.replaceChildren(el('p','Supported editions:'),...(data.editions||[]).map(e=>el('div',e.label)));
   sources.replaceChildren(el('summary','Use an ISO already on the host'));
   if(!data.sources.length)sources.append(el('p','No ISOs in the configured server import folder.','muted'));
   for(const source of data.sources){const r=el('div','','import-card');r.append(el('strong',source.name),el('span',`${size(source.size)} · On server`,'muted'),control('Add game',async()=>{const job=await request('/api/imports/action',{action:'register',sourceId:source.id});await action({action:'prepare',id:job.id});},data.busy));sources.append(r);}
   jobs.replaceChildren(el('h2','Your games'));
   if(!data.jobs.length)jobs.append(el('p','Your game will appear here as it is prepared.','muted'));
   for(const job of data.jobs.slice().reverse()){
    const card=el('article','','import-card');card.dataset.job=job.id;
    const transferred=job.origin==='server'?(job.sourceAvailable?'ISO on server':'Source ISO moved or unavailable'):job.received===job.size?'ISO uploaded':`Upload paused / transferring · ${size(job.received)} of ${size(job.size)}`;
    const stages={uploaded:'Ready to prepare',inspecting:'Checking your game…',ready:'Ready to prepare',preflight:'Checking tools…',converting:'Preparing artwork, audio and story…',validating:'Checking the finished game…',installing:'Adding to your library…',complete:'Ready to play',failed:'Preparation stopped',interrupted:'Preparation interrupted',unsupported:'This edition is not supported'};
    card.append(el('strong',job.title||job.name),el('span',stages[job.status]||transferred,'import-badge'));
    const busy=['inspecting','preflight','converting','validating','installing'].includes(job.status);
    if(busy){const meter=el('progress');meter.removeAttribute?.('value');meter.setAttribute('aria-label','Preparing game');card.append(meter,el('p','You can close this panel. Keep the desktop app or server running; preparation continues.'));}
    if(job.status==='failed'||job.status==='interrupted')card.append(el('p','Your ISO and completed work are saved. Try again to continue. If it keeps stopping, run Check tools in the desktop app.'));
    else if(job.status==='unsupported')card.append(el('p','This disc needs a compatible adapter. Nothing has been installed.'));
    else if(job.status==='uploading'){}else if(!busy&&!job.installed)card.append(el('p','Choose Continue to prepare this saved ISO. No upload is needed.'));
    if(busy&&job.status==='preflight')card.append(el('p',job.message,'muted'));
    const controls=el('div','','row');
    if(job.sourceAvailable&&['uploaded','ready','failed','interrupted'].includes(job.status)&&!job.installed){const next=control(['failed','interrupted'].includes(job.status)?'Try again':'Continue',()=>action({action:'prepare',id:job.id}),data.busy);next.classList.add('import-next');controls.append(next);}
    if(job.installed){const play=control('Open game',async()=>{await refreshLibrary();await openGame(job.gameId);});play.classList.add('import-next');controls.append(play);}
    const details=el('details');details.append(el('summary','Details'),el('p',job.message||transferred));
    if(job.sha256)details.append(el('small','SHA-256 '+job.sha256,'import-hash'));
    details.append(el('small','Job: '+job.id));
    if(job.status==='uploading')card.append(el('small','Select the same ISO above to resume. Received chunks are kept.'));
    if(job.warnings?.length)card.append(el('p','Playable with limitations. See the game’s compatibility report.','muted'));
    card.append(controls,details);jobs.append(card);
   }
  }catch(e){show(e.message);}
 }
 pause.onclick=()=>{paused=true;show('Pausing after this chunk…');};
 send.onclick=async()=>{
  if(uploading||serverBusy)return;
  const iso=file.files[0];if(!iso){show('Choose an ISO first.');return;}
  if(!crypto.subtle){show('Uploads need HTTPS or localhost. Server ISOs can still be selected below.');return;}
  uploading=true;paused=false;send.disabled=true;file.disabled=true;pause.hidden=false;progress.hidden=false;
  try{
   if(!token)await poll();
   const chunk=4*1024*1024;
   show('Checking transfer identity…');
   const sample=new Blob([iso.slice(0,chunk),iso.slice(Math.max(0,iso.size-chunk)),String(iso.size)]);
   const job=await request('/api/imports/action',{action:'upload',name:iso.name,size:iso.size,resumeKey:await digest(sample)});
   let offset=job.received||0;
   // Verify every previously transferred byte locally before appending. A same
   // name/size/first+last sample alone must not create a mixed ISO on resume.
   for(let i=0;i<(job.prefixHashes||[]).length;i++){
    if(paused||!alive)break;
    show(`Verifying saved upload · ${Math.round(i/job.prefixHashes.length*100)}%`);
    if(await digest(iso.slice(i*chunk,Math.min(offset,(i+1)*chunk)))!==job.prefixHashes[i])throw new Error('This file differs from the saved upload. Rename it to start a separate transfer.');
   }
   while(offset<iso.size&&alive&&!paused){
    const end=Math.min(offset+chunk,iso.size);
    await request(`/api/imports/${job.id}/chunk?offset=${offset}`,iso.slice(offset,end),true);
    offset=end;progress.value=offset/iso.size;show(`Uploading to ${location.host} · ${Math.round(progress.value*100)}%`);
   }
   if(offset===iso.size&&!paused){progress.value=1;activeJob=job.id;show('ISO copied. Preparing your game…');await action({action:'prepare',id:job.id});}
   else show('Upload paused. Select the same file to resume.');
   last='';await poll();
  }catch(e){show(`${e.message} Your saved upload is kept. Select the same ISO and choose Add game to resume.`);}
  finally{uploading=false;send.disabled=serverBusy;file.disabled=false;pause.hidden=true;}
 };
 await poll();timer=setInterval(poll,2000);
 return ()=>{alive=false;paused=true;clearInterval(timer);};
}
