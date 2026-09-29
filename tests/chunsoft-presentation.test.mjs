import test from 'node:test';import assert from 'node:assert/strict';
import {shadowPalette,composeShadows} from '../web/adapters/kamaitachi-scene.mjs';
import {otogirisouPage} from '../web/adapters/otogirisou-kernel.mjs';
import {validateSoundPage} from '../web/sound-novel.mjs';
import {soundWaitActive} from '../web/media-wait.mjs';
test('native silhouette masks merge indices before colouring and remain translucent',()=>{
 const a=new Uint8ClampedArray(320*240*4),b=a.slice();a[4]=3;b[4]=7;a[8]=7;b[8]=2;
 const palette=shadowPalette([[5,0,15],[31,0,0]]),out=composeShadows([a,b],[[5,0,15],[31,0,0]]);
 assert.deepEqual([...out.slice(0,4)],[0,0,0,0]);assert.deepEqual([...out.slice(4,8)],palette[7]);assert.deepEqual([...out.slice(8,12)],palette[7]);assert.equal(out[7],128);
 assert.ok(out[6]>out[4]);assert.throws(()=>composeShadows([a.slice(4)],[[5,0,15],[0,0,0]]));b[0]=16;assert.throws(()=>composeShadows([b],[[5,0,15],[0,0,0]]));
});
test('Otogirisou clips a native edge glyph without changing its character or moving it',()=>{
 const kernel={font:{width:1024,height:512},glyphs:()=>[{x:314,y:49,width:7,height:13,u:52,v:0,text:'。',slot:80,baseline:54}],choiceRanges:()=>[]};
 const page=otogirisouPage(kernel),block=page.blocks[0];assert.equal(block.width,6);assert.equal(block.x,314);assert.equal(block.glyphs[0].text,'。');assert.equal(block.glyphs[0].u,52);validateSoundPage({kind:'text',text:'。',page});
});
test('source sound completion uses the named active channel and source completion time',()=>{
 const wait={asset:'cue',channel:'wind',untilSeconds:3},sound={vnAsset:'cue',vnChannel:'wind',currentTime:2,ended:false,error:null};
 assert.ok(soundWaitActive(wait,[sound]));assert.equal(soundWaitActive(wait,[{...sound,currentTime:3}]),false);assert.equal(soundWaitActive(wait,[{...sound,vnChannel:'other'}]),false);assert.equal(soundWaitActive(wait,[{...sound,error:{code:4}}]),false);assert.equal(soundWaitActive(wait,[{...sound,ended:true}]),false);
});
