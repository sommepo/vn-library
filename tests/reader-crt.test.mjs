import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCRT,crtPreset,crtOutputSize,CRT_PRESETS} from '../web/crt-settings.mjs';
test('CRT preferences clamp untrusted persisted numbers and reject unknown enum values',()=>{
 const s=normalizeCRT({enabled:'true',scanlines:Infinity,maskStrength:-10,maskPitch:999,inputGamma:'2',quality:'9999',maskType:50,preset:'constructor'});
 assert.equal(s.enabled,false);assert.equal(s.scanlines,.6);assert.equal(s.maskStrength,0);assert.equal(s.maskPitch,12);assert.equal(s.inputGamma,2.4);assert.equal(s.quality,'1440');assert.equal(s.maskType,1);assert.equal(s.preset,'soft');
 for(const value of [null,[],false,'text'])assert.equal(normalizeCRT(value).enabled,false);
});
test('Every preset is valid and selection preserves explicit enable/off preference',()=>{
 for(const name of Object.keys(CRT_PRESETS)){assert.equal(crtPreset(name,{enabled:true}).enabled,true);assert.deepEqual(normalizeCRT(crtPreset(name)),crtPreset(name));}
 assert.throws(()=>crtPreset('missing'));
});
test('Physical display resolution is bounded without changing aspect ratio',()=>{
 assert.deepEqual(crtOutputSize(1920,1080,2,'native'),[3840,2160]);
 assert.deepEqual(crtOutputSize(1920,1080,2,'1080'),[1920,1080]);
 assert.deepEqual(crtOutputSize(800,560,2,'native'),[1600,1120]);
 assert.deepEqual(crtOutputSize(800,560,.75,'native'),[600,420]);
 const [w,h]=crtOutputSize(4000,2500,3,'native');assert.ok(w<=4096&&h<=2160);assert.ok(Math.abs(w/h-1.6)<.001);
 assert.ok(crtOutputSize(1600,1200,2,'native',1024).every(n=>n<=1024));
});
