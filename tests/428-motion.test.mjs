import test from 'node:test';import assert from 'node:assert/strict';
import {Shibuya428Motion,radial428Copies,directional428Copies} from '../web/adapters/shibuya428-motion.mjs';
import {create428ShakeKernel} from '../web/adapters/shibuya428-shake-kernel.mjs';
import {create428NoiseKernel} from '../web/adapters/shibuya428-noise-kernel.mjs';
import {picture428LogicalSize} from '../web/adapters/shibuya428-picture.mjs';
const setup={type:'motionSetup',effect:8,layer:1,bank:0,resource:1,parameters:[0,0,0,1279,719,0]};
test('reused pictures keep separate buffer motions; update targets current, finish targets oldest',()=>{
 const poses=new Map(),m=new Shibuya428Motion({motion:(_,c,v)=>poses.set(c.imageSlot,{...v})});
 m.apply(0,{...setup,imageSlot:0});m.apply(0,{...setup,imageSlot:1});
 assert.throws(()=>m.apply(0,{...setup,imageSlot:1}),/duplicate/);assert.equal(m.effects.size,2);
 m.apply(0,{...setup,type:'motionUpdate',imageSlot:1,parameters:[0,100,0,1379,719,0]});m.tick();
 assert.deepEqual(poses.get(0),{x:0,y:0,scale:1});assert.deepEqual(poses.get(1),{x:-100,y:0,scale:1});
 m.apply(0,{...setup,type:'motionFinish',imageSlot:1});assert.equal(m.effects.size,1);assert.equal([...m.effects.values()][0].command.imageSlot,1);
 assert.equal(poses.get(1).x,-100);m.apply(0,{...setup,type:'motionFinish',imageSlot:1});assert.equal(m.effects.size,0);
 for(let resource=0;resource<16;resource++)m.apply(0,{...setup,resource});
 assert.throws(()=>m.apply(0,{...setup,resource:16}),/capacity/);assert.equal(m.effects.size,16);
});
test('motion belongs to its source resource and update runs on the next frame',()=>{
 const calls=[],m=new Shibuya428Motion({motion:(script,c,v)=>calls.push([script,c.resource,{...v}])});
 m.apply(0,setup);assert.ok(m.ready(0,setup));assert.deepEqual(calls.at(-1),[0,1,{x:0,y:0,scale:1}]);
 m.apply(0,{...setup,type:'motionUpdate',parameters:[4,100,100,1379,819,0]});assert.equal(calls.length,1);assert.ok(!m.ready(0,setup));
 m.tick();assert.equal(calls.length,1);for(let n=0;n<5;n++)m.tick();
 assert.deepEqual(calls.at(-1),[0,1,{x:-100,y:-100,scale:1}]);assert.ok(m.ready(0,setup));
 m.apply(0,{...setup,type:'motionFinish'});assert.equal(m.effects.size,0);assert.equal(calls.at(-1)[2].scale,1);
});
test('unknown motion/easing remains blocked and source raster sizes are not stretched to the viewport',()=>{
 const m=new Shibuya428Motion({motion:()=>{}});m.apply(0,setup);
 for(const c of [{...setup,effect:17},{...setup,parameters:[0,0,0,0,0,0]},{...setup,parameters:[4,0,0,1279,719,4]}])assert.throws(()=>m.apply(0,c),/mode/);
 assert.equal(m.effects.size,1);assert.deepEqual(picture428LogicalSize(464,256),{width:1280,height:720});
 assert.ok(picture428LogicalSize(752,496).width>2000);assert.throws(()=>picture428LogicalSize(0,1),/bounds/);
});
test('radial spread starts on its own first update, follows source framing, and clears on finish',()=>{
 let radial;const m=new Shibuya428Motion({motion:()=>{},radial:(_,c,v)=>{radial=v;}},{'0:1':{type:'image',width:464,height:256}});
 const c={...setup,effect:11,parameters:[4,0,0,1279,719,0]};m.apply(0,c);assert.equal(radial.spreadX,0);
 m.tick();assert.equal(radial.spreadX,2);
 const copies=radial428Copies({width:464,height:256},{x:0,y:0,scale:1},radial);
 assert.equal(copies.length,5);assert.ok(copies[0].x<0&&copies[0].scaleX>1);assert.equal(copies[4].opacity,0);
 m.apply(0,{...c,type:'motionFinish'});assert.equal(radial,null);assert.equal(m.effects.size,0);
});
test('shake requires exact-edition native math and unsupported commands leave no effects',async()=>{
 await assert.rejects(create428ShakeKernel(new Uint8Array(128)),/identity mismatch/);
 const m=new Shibuya428Motion({motion:()=>{},shake:()=>{}},{},{shakeKernel:{step:()=>({})},randomState:[0,1]});
 assert.throws(()=>m.apply(0,{...setup,effect:21,parameters:[1,15,8]}),/verified native math/);assert.equal(m.effects.size,0);
 assert.throws(()=>m.apply(0,{...setup,effect:21,parameters:[1,-2,8]}),/shake mode/);assert.equal(m.effects.size,0);
 assert.throws(()=>m.apply(0,{...setup,effect:11,parameters:[3,0,0,1279,719,1]}),/motion mode/);assert.equal(m.effects.size,0);
});
test('translation retains a constant axis and finishes with its source endpoint',()=>{
 let value;const m=new Shibuya428Motion({motion:()=>{},translation:(_,c,v)=>{value=v;}});
 const c={...setup,effect:14,parameters:[4,-32,-100,-32,-20,2]};m.apply(0,c);
 m.tick();assert.deepEqual(value,{x:-32,y:-100});m.tick();assert.ok(value.y> -100&&value.y< -20);
 while(!m.ready(0,c))m.tick();assert.deepEqual(value,{x:-32,y:-20});
 m.apply(0,{...c,type:'motionFinish'});assert.deepEqual(value,{x:0,y:0});assert.equal(m.effects.size,0);
});
test('independent radial strength uses its own timing and rejects unknown spread modes atomically',()=>{
 let radial;const m=new Shibuya428Motion({motion:()=>{},radial:(_,c,v)=>{radial=v;}},{'0:1':{type:'image',width:464,height:256}});
 const c={...setup,effect:12,parameters:[4,0,0,1279,719,0,16,32,1]};m.apply(0,c);
 m.tick();assert.equal(radial.spreadX,0);m.tick();assert.equal(radial.spreadX,1/16);assert.equal(radial.spreadY,1/8);
 while(!m.ready(0,c))m.tick();assert.equal(radial.spreadX,1);assert.equal(radial.spreadY,2);
 m.apply(0,{...c,type:'motionUpdate',parameters:[4,0,0,1279,719,0,16,32,2]});m.tick();m.tick();assert.equal(radial.spreadX,1);
 while(!m.ready(0,c))m.tick();assert.equal(radial.spreadX,0);assert.equal(radial.spreadY,0);
 const before=structuredClone([...m.effects]);assert.throws(()=>m.apply(0,{...c,type:'motionUpdate',parameters:[4,0,0,1279,719,0,16,32,4]}),/mode/);assert.deepEqual([...m.effects],before);
 m.apply(0,{...c,type:'motionFinish'});assert.equal(radial,null);
});
test('opacity updates resume from their current alpha and remain isolated by layer',()=>{
 const values=new Map(),m=new Shibuya428Motion({motion:()=>{},pictureOpacity:(s,c,a)=>values.set(c.layer,a)});
 const front={...setup,effect:24,parameters:[4,0,0]},back={...front,layer:0,parameters:[0,128,0]};
 m.apply(0,front);m.apply(0,back);m.tick();m.tick();m.tick();assert.equal(values.get(1),.5);assert.equal(values.get(0),Math.fround(128/255));
 m.apply(0,{...front,type:'motionUpdate',parameters:[4,255,0]});m.tick();m.tick();assert.equal(values.get(1),.5);
 while(!m.ready(0,front))m.tick();assert.equal(values.get(1),1);
 m.apply(0,{...front,type:'motionFinish'});assert.equal(values.get(1),1);assert.equal(m.effects.size,1);
 // Finishing another effect resets the sprite alpha; retained opacity must be
 // assigned again, including after its timed interpolation has completed.
 m.apply(0,{...setup,layer:0});m.apply(0,{...setup,layer:0,type:'motionFinish'});assert.equal(values.get(0),1);
 m.tick();assert.equal(values.get(0),Math.fround(128/255));
 assert.throws(()=>m.apply(0,{...front,parameters:[4,256,0]}),/opacity mode/);
});
test('camera noise requires source-verified math and its own valid random seed',async()=>{
 await assert.rejects(create428NoiseKernel(new Uint8Array(128)),/identity mismatch/);
 const m=new Shibuya428Motion({motion:()=>{},shake:()=>{}},{},{noiseKernel:{start:()=>({})},noiseSeed:1});
 assert.throws(()=>m.apply(0,{...setup,effect:26,parameters:[255,8,8]}),/verified native math/);assert.equal(m.effects.size,0);
 assert.throws(()=>m.apply(0,{...setup,effect:26,parameters:[255,1,8]}),/noise mode/);
 assert.throws(()=>new Shibuya428Motion({},{},{noiseSeed:-1}),/noise seed/);
});

test('directional blur survives fixed-strength motion, follows current pose on update and clears on finish',()=>{
 let value,blur;const m=new Shibuya428Motion({motion:()=>{},translation:(_,c,v)=>{value=v;},directional:(_,c,v)=>{blur=v;}});
 const c={...setup,effect:16,parameters:[4,-32,0,0,0,0,8,0]};m.apply(0,c);
 while(!m.ready(0,c))m.tick();assert.deepEqual(value,{x:0,y:0});assert.deepEqual(blur,{spreadX:.5,spreadY:0});
 const copies=directional428Copies({x:0,y:0,scale:1},blur);assert.ok(copies[0].x<0);assert.equal(copies[0].scaleX,1);assert.equal(copies.at(-1).opacity,0);
 m.apply(0,{...c,type:'motionUpdate',parameters:[4,500,500,32,16,0,0,0]});m.tick();m.tick();assert.deepEqual(value,{x:0,y:0});assert.equal(blur.spreadX,.5);
 while(!m.ready(0,c))m.tick();assert.deepEqual(value,{x:32,y:16});
 m.apply(0,{...c,type:'motionFinish'});assert.equal(blur,null);assert.deepEqual(value,{x:0,y:0});
 const dynamic={...c,effect:15,parameters:[4,0,0,32,0,0]};m.apply(0,dynamic);m.tick();m.tick();assert.ok(blur.spreadX<0);
 while(!m.ready(0,dynamic))m.tick();m.tick();assert.equal(blur,null);
});
test('a source flash completes its rise, hold and fall before the wait is ready',()=>{
 let color;const m=new Shibuya428Motion({motion:()=>{},colorOverlay:(_,rgba)=>{color=rgba;}});
 const c={...setup,effect:6,parameters:[0,2,0,255,128,0,128]};m.apply(0,c);assert.equal(color[3],Math.fround(128/255));assert.ok(!m.ready(0,c));
 m.tick();m.tick();assert.ok(!m.ready(0,c));assert.ok(color[3]>0);m.tick();assert.ok(!m.ready(0,c));m.tick();assert.ok(m.ready(0,c));assert.deepEqual(color,[0,0,0,0]);
 assert.throws(()=>m.apply(0,{...c,type:'motionUpdate'}),/flash mode/);m.apply(0,{...c,type:'motionFinish'});assert.equal(m.effects.size,0);
});
