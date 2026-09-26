import {SceneCapture} from './crt.mjs';
import {plainText} from './engine.mjs';

export function miningLine(p) {
 if(!p||p.sourceGlyphs||p.auxiliary)return null;
 if(p.kind==='choice')return {...p,text:p.options.map(o=>plainText(o.text)).join('\n'),voice:null};
 return p.text&&p.id&&p.occurrenceId?{...p,text:plainText(p.displayText??p.text)}:null;
}

// URL is captured by Yomitan at lookup time. Each immutable media context has
// its own capability; tabs, repeated sentences and later advances cannot mix.
export class MiningMedia {
 constructor(notify){this.notify=notify;this.capture=new SceneCapture();this.enabled=false;this.suspended=false;this.serial=0;this.key=null;this.context=null;this.token=null;this.state='off';this.message='Anki media is off.';}
 update(state,message){this.state=state;this.message=message;this.url();this.notify(message,state==='error',state);}
 setEnabled(value){this.enabled=!!value;this.serial++;this.key=null;this.context=null;this.update(value?'unavailable':'off',value?'Open a game line to prepare Anki media.':'Anki media is off.');}
 suspend(value){this.suspended=value;this.url();}
 url(){
  const u=new URL(location.href);
  if(this.enabled)u.hash='vnl='+(this.suspended?'unavailable':this.context||this.state);
  else if(u.hash.startsWith('#vnl='))u.hash='';
  history.replaceState(history.state,'',u);
 }
 invalidate(){this.serial++;this.key=null;this.context=null;this.update(this.enabled?'unavailable':'off',this.enabled?'No game line is available for mining.':'Anki media is off.');}
 async present({game,p,art,viewport,visualKey,skipping=false}){
  if(!this.enabled)return;
  const line=miningLine(p);
  if(!line||skipping){this.invalidate();return;}
  const key=JSON.stringify([game.id,line.id,line.occurrenceId,line.text,line.voice,visualKey]);
  if(this.key===key&&this.context){this.url();return;}
  this.key=key;this.context=null;const serial=++this.serial;
  this.update('pending','Preparing Anki media… Wait for “Anki: ready”, then open your word lookup.');
  try{
   // Copy the complete decoded graphics plane at source resolution, before
   // any asynchronous work. No dictionary popup, desktop or CRT filter.
   const image=this.capture.draw(art,[viewport?.width||640,viewport?.height||448]).toDataURL('image/png').split(',')[1];
   const context=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(!this.token){const r=await fetch('/api/mining/session',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Media service unavailable');this.token=(await r.json()).token;}
   const r=await fetch('/api/mining/contexts',{method:'POST',headers:{'Content-Type':'application/json','X-VNKit-Mining-Token':this.token},body:JSON.stringify({context,gameId:game.id,segmentId:line.id,occurrenceId:line.occurrenceId,sentence:line.text,voice:line.voice||null,image}),signal:AbortSignal.timeout(10000)});
   if(!r.ok){if(r.status===403)this.token=null;throw Error('Could not prepare the original media');}
   if(serial!==this.serial||!this.enabled)return;
   this.context=context;this.update('ready',line.voice?'Anki media ready · image and original voice.':'Anki media ready · image; this line has no associated voice.');
  }catch(e){if(serial===this.serial){this.update('error',e.message+'. Open Anki media → Prepare current line again, then reopen your word lookup.');}}
 }
}
