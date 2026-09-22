import test from 'node:test';
import assert from 'node:assert/strict';
import {importPanel} from '../web/import-ui.mjs';

// Minimal DOM harness: checks labels and actions, not rendering/browser behaviour.
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.classList={add:()=>{}};this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[...nodes];}
 setAttribute(){}
 get text(){return this.textContent+' '+this.children.map(n=>n.text).join(' ');}
 all(tag){return [ ...(this.tag===tag?[this]:[]), ...this.children.flatMap(n=>n.all(tag)) ];}
}
test('saved disc has one Continue action for automatic preparation',async()=>{
 const original={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
 const job={id:'test',title:'Synthetic disc',status:'ready',adapter:'fixture',origin:'upload',received:1,size:1,sourceAvailable:true,message:'Disc identified'};
 let submitted;
 globalThis.document={createElement:tag=>new Element(tag)};
 globalThis.location={host:'localhost:8891'};
 globalThis.fetch=async(path,options)=>{
  if(options){submitted=JSON.parse(options.body);job.status='preflight';job.message='Checking node…';}
  return {ok:true,json:async()=>({token:'test',sources:[],jobs:[job],busy:job.status==='preflight',editions:[{adapter:'never7-ps2',label:'PS2 Never7 SLPS-25256 v1.01'}]})};
 };
 let close;
 try {
  const body=new Element('body');close=await importPanel(body,{openGame:()=>{},refreshLibrary:()=>{}});
  assert.match(body.text,/Choose an ISO and click Add game/);
  assert.match(body.text,/PS2 Never7 SLPS-25256 v1.01/);
  assert.match(body.text,/Choose Continue to prepare this saved ISO/);
  const button=body.all('button').find(b=>b.textContent==='Continue');assert.ok(button);
  assert.equal(body.all('button').some(b=>b.textContent==='Inspect disc'),false);
  await button.onclick();assert.deepEqual(submitted,{action:'prepare',id:'test'});
  assert.match(body.text,/Checking node/);
  assert.doesNotMatch(body.text,/Disc identified\. Click Import game below to continue/);
 } finally {close?.();for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});

test('Add game uploads and requests preparation without a second user action',async()=>{
 const original={document:globalThis.document,location:globalThis.location,fetch:globalThis.fetch};
 const calls=[],job={id:'upload',name:'fixture.iso',origin:'upload',size:32768,received:0,status:'uploading',sourceAvailable:true,prefixHashes:[]};
 globalThis.document={createElement:tag=>new Element(tag)};globalThis.location={host:'localhost:8891'};
 globalThis.fetch=async(path,options)=>{
  let result;
  if(!options)result={token:'test',sources:[],jobs:calls.length?[job]:[],busy:false};
  else if(path.includes('/chunk?')){job.received=32768;job.status='uploaded';result=job;}
  else {const body=JSON.parse(options.body);calls.push(body.action);if(body.action==='prepare'){job.status='inspecting';job.message='Identifying your game…';}result=job;}
  return {ok:true,json:async()=>result};
 };
 let close;
 try {
  const body=new Element('body');close=await importPanel(body,{openGame:()=>{},refreshLibrary:()=>{}});
  const iso=new Blob([new Uint8Array(32768)]);iso.name='fixture.iso';body.all('input')[0].files=[iso];
  await body.all('button').find(b=>b.textContent==='Add game').onclick();
  assert.deepEqual(calls,['upload','prepare']);assert.equal(job.received,32768);
  assert.match(body.text,/Checking your game/);
 } finally {close?.();for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
