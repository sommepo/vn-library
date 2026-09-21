// Private supplied-game media verification; no commercial content in fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(process.env.VNKIT_PLAYWRIGHT_MODULE || path.join(root,'private/tooling/playwright/package/index.mjs')));
const files=process.argv.slice(2).length?process.argv.slice(2):[
  'private/probe/music-rendered/BGM24.flac','private/probe/music-rendered/BGM12.flac',
  'private/probe/music-rendered/S04.flac','private/probe/audio/native-effects/PIASE051.wav'];
const browser=await chromium.launch({headless:true});
const results=[];
try {
  const page=await browser.newPage();
  for(const file of files){
    const source=path.resolve(root,file);
    if(!source.startsWith(path.join(root,'private')+path.sep))throw new Error('Private assets required');
    await fs.access(source);await page.goto(pathToFileURL(source).href);
    await page.waitForFunction(()=>document.querySelector('video,audio')?.readyState>=2);
    await page.locator('video,audio').click();
    await page.evaluate(async()=>{const a=document.querySelector('video,audio');a.muted=false;a.currentTime=0;await a.play();});
    await page.waitForFunction(()=>{const a=document.querySelector('video,audio');return a.currentTime>0.1 || a.ended;});
    const result=await page.evaluate(()=>{const a=document.querySelector('video,audio');return {duration:a.duration,time:a.currentTime,error:a.error,audioBytes:a.webkitAudioDecodedByteCount,muted:a.muted};});
    assert.equal(result.error,null);assert.equal(result.muted,false);assert.ok(result.duration>0);assert.ok(result.audioBytes>0);
    results.push({file:path.basename(source),...result});
  }
  await fs.mkdir(path.join(root,'private/browser-tests'),{recursive:true});
  await fs.writeFile(path.join(root,'private/browser-tests/pia-audio-report.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}
