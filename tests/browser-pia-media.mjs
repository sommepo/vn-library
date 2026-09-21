// Private real-media smoke test. Requires supplied assets; never a public fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const source=path.resolve(process.argv[2] || path.join(root,'private/probe/movie/OPENNING.vp9.mp4'));
if (!source.startsWith(path.join(root,'private')+path.sep)) throw new Error('Real-media checks must use private assets');
await fs.access(source);
const {chromium}=await import(pathToFileURL(process.env.VNKIT_PLAYWRIGHT_MODULE || path.join(root,'private/tooling/playwright/package/index.mjs')));
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage();
  await page.goto(pathToFileURL(source).href);
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await page.locator('video').click();
  await page.evaluate(async()=>{const video=document.querySelector('video');video.muted=false;await video.play();});
  await page.waitForFunction(()=>document.querySelector('video').currentTime>1);
  const result=await page.evaluate(()=>{const v=document.querySelector('video');return {width:v.videoWidth,height:v.videoHeight,duration:v.duration,currentTime:v.currentTime,error:v.error,decodedVideoFrames:v.getVideoPlaybackQuality().totalVideoFrames,audioBytes:v.webkitAudioDecodedByteCount,muted:v.muted};});
  assert.equal(result.width,640);assert.equal(result.height,448);assert.equal(result.error,null);
  assert.ok(result.duration>128 && result.duration<131);assert.ok(result.decodedVideoFrames>0);assert.ok(result.audioBytes>0);
  await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=v.duration-0.3;});
  await page.waitForFunction(()=>document.querySelector('video').ended);
  result.seekAndEnded=true;
  const output=path.join(root,'private/browser-tests/pia-media-report.json');
  await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
