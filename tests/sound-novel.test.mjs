import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSoundPage} from '../web/sound-novel.mjs';

import {soundFixture} from './sound-novel-fixture.mjs';

test('full-scene pages keep retained text distinct from the new counted segment',()=>{
  const p=soundFixture();p.displayText=p.text;p.text='文字を絵に重ねます。';
  assert.equal(validateSoundPage(p),p.page);
  assert.equal(p.text,'文字を絵に重ねます。');
  assert.equal(validateSoundPage(soundFixture('choice')).blocks.length,3);
});
test('positioned source glyphs bind Unicode and atlas rectangles to the visible block',()=>{
  const p={kind:'text',text:'あい',page:{width:320,height:240,fontSize:16,lineHeight:22,
    colour:'#ffffff',choiceColour:'#ffaaaa',font:{asset:'font',width:32,height:16},blocks:[{
      x:8,y:17,width:30,height:16,text:'あい',glyphs:[
        {x:0,y:0,width:14,height:16,u:0,v:0,text:'あ'},
        {x:15,y:0,width:14,height:16,u:16,v:0,text:'い'}]}]}};
  validateSoundPage(p);
  for(const mutate of [q=>q.page.blocks[0].glyphs[0].text='う',q=>q.page.blocks[0].glyphs[1].x=30,
    q=>q.page.blocks[0].glyphs[1].u=20,q=>delete q.page.font]){
    const q=structuredClone(p);mutate(q);assert.throws(()=>validateSoundPage(q));
  }
});
test('missing layouts, invented choices, inconsistent text and out-of-frame geometry fail',()=>{
  for(const mutate of [p=>delete p.page,p=>p.page.width=NaN,p=>p.page.blocks[0].y=239,
    p=>p.text='unrelated text',p=>p.page.colour='url(invalid)',p=>p.page.blocks[0].width=-1]) {
    const p=soundFixture();mutate(p);assert.throws(()=>validateSoundPage(p));
  }
  for(const mutate of [p=>p.page.blocks.pop(),p=>p.page.blocks[1].choiceId=8,
    p=>p.page.blocks[2].choiceId=7,p=>p.options[0].text='wrong branch',
    p=>p.options.push({...p.options[0]}),p=>p.options={}]) {
    const p=soundFixture('choice');mutate(p);assert.throws(()=>validateSoundPage(p));
  }
});
