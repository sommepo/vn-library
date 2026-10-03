import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCRT,crtPreset,crtOutputSize,platformCRT,CRT_DEFAULTS,CRT_PRESETS} from '../web/crt-settings.mjs';
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
test('Platform defaults: the handheld look is off until enabled, flat, and replaces the first flat defaults',()=>{
 const gba=platformCRT('gba');
 assert.equal(gba.enabled,false);assert.deepEqual([gba.curvature,gba.overscan,gba.corners,gba.convergence],[0,0,0,0]);assert.ok(gba.scanlines>.5&&gba.beam<.35&&gba.maskStrength>0);
 // What an earlier build stored when the filter was switched on for this platform (flat, no mask, no glow).
 const first={...CRT_DEFAULTS,rows:320,curvature:0,corners:0,overscan:0,convergence:0,maskStrength:0,bloom:0,halation:0,vignette:0,enabled:true};
 assert.deepEqual(platformCRT('gba',first),{...gba,enabled:true});
 // Settings somebody has tuned are kept as they are.
 const tuned=platformCRT('gba',{...first,maskStrength:.4,scanlines:.2});assert.deepEqual([tuned.maskStrength,tuned.scanlines,tuned.rows,tuned.enabled],[.4,.2,320,true]);
 assert.deepEqual(platformCRT('ps2',{}),normalizeCRT({}));assert.equal(platformCRT('pc98').rows,400);
 for(const bad of [null,[],'x'])assert.equal(platformCRT('gba',bad).enabled,false);
});
