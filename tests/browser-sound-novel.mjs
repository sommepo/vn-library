// Synthetic layout/selection evidence only. No game execution or user saves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {soundFixture,soundGlyphFixture} from './sound-novel-fixture.mjs';
import {installWordScanner,checkWordScanning} from './sound-word-lookup.mjs';

const root=path.resolve(import.meta.dirname,'..'),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'vnkit-sound-page-'));
const name=process.env.VNKIT_BROWSER||'chromium';
const out=path.resolve(process.env.VNKIT_REPORT_DIR||`private/chunsoft-ps1/browser-${name}-v3`);
await fs.mkdir(out,{recursive:true});
let server,browser,page;
const report={browser:name,scope:'Original synthetic page and artwork only; no title runtime coverage',checks:[],errors:[]};
try {
  await fs.mkdir(path.join(tmp,'library'));
  server=spawn('python3',['-u','-c','import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()',path.join(tmp,'library'),path.join(tmp,'state')],{cwd:root,stdio:['ignore','pipe','pipe']});
  let serverErrors='';server.stderr.on('data',data=>serverErrors+=data);
  const port=await new Promise((resolve,reject)=>{let text='';server.stdout.on('data',b=>{text+=b;if(text.includes('\n'))resolve(Number(text.trim().split('\n')[0]));});server.on('error',reject);server.on('exit',code=>reject(Error(`Test server exited ${code}: ${serverErrors}`)));});
  const api=await import(pathToFileURL(path.join(root,'private/tooling/playwright/package/index.mjs')));
  browser=await api[name].launch({headless:true});
  const context=await browser.newContext({viewport:{width:1100,height:800},hasTouch:true});
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));
  if(process.env.VNKIT_YOMITAN_TEST_ROOT)await installWordScanner(page,process.env.VNKIT_YOMITAN_TEST_ROOT);
  const css=['style','classic','crt','layout','console-player','psone','sound-novel'];
  await page.route('**/sound-page-test',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${css.map(c=>`<link rel="stylesheet" href="/${c}.css">`).join('')}<body class="reader-page"><div id="gameArea" class="game-area"><main id="stage" class="stage"><div class="art" style="background:linear-gradient(145deg,#243943,#090f23 58%,#24433e)"></div><div id="choices" class="choices" aria-label="Story choices"></div><section id="textbox" class="textbox"><div class="speaker"></div><div id="sentence" class="sentence"></div><div class="text-footer"><button id="nextButton">▸</button></div></section></main></div><button id="fullscreenButton">Fullscreen</button></body></html>`}));
  await page.goto(`http://127.0.0.1:${port}/sound-page-test`);
  await page.evaluate(async p=>{
    const {SoundNovelPage}=await import('/sound-novel.mjs');const {ReaderLayout}=await import('/layout.mjs');
    window.layout=new ReaderLayout(document.querySelector('#gameArea'),document.querySelector('#stage'));
    layout.setViewport({width:320,height:240});
    window.chosen=[];
    const text=(el,value,limit=Infinity)=>el.textContent=[...value].slice(0,limit).join('');
    window.novel=new SoundNovelPage(document.querySelector('#stage'),document.querySelector('#sentence'),document.querySelector('#choices'),text,id=>chosen.push(id));
    novel.setEnabled(true);novel.render(p);
    document.querySelector('#fullscreenButton').onclick=()=>document.documentElement.requestFullscreen();
  },soundFixture('choice'));
  for(const size of [{width:1100,height:800},{width:390,height:844},{width:844,height:390}]) {
    await page.setViewportSize(size);await page.waitForTimeout(100);
    const g=await page.evaluate(()=>{
      const stage=document.querySelector('#stage'),r=stage.getBoundingClientRect();
      const block=document.querySelector('.sentence .sound-page-block'),b=block.getBoundingClientRect(),style=getComputedStyle(document.querySelector('#textbox'));
      return {stage:{x:r.x,y:r.y,w:stage.clientWidth,h:stage.clientHeight,left:r.left+stage.clientLeft,top:r.top+stage.clientTop},
        block:{x:b.x,y:b.y,w:b.width,h:b.height},panel:style.backgroundImage,display:style.display,
        choiceStyles:[...document.querySelectorAll('.choices button')].map(b=>({background:getComputedStyle(b).backgroundColor,border:getComputedStyle(b).borderWidth,rect:b.getBoundingClientRect().toJSON()})),
        selectable:getComputedStyle(block).userSelect,text:block.textContent,scrolling:document.documentElement.scrollWidth>innerWidth};
    });
    assert.equal(g.panel,'none');assert.equal(g.display,'contents');assert.equal(g.selectable,'text');assert.equal(g.scrolling,false);
    assert.ok(Math.abs(g.block.x-g.stage.left-16*g.stage.w/320)<1);
    assert.ok(Math.abs(g.block.y-g.stage.top-18*g.stage.h/240)<1);
    for(const b of g.choiceStyles){assert.equal(b.background,'rgba(0, 0, 0, 0)');assert.equal(b.border,'0px');assert.ok(b.rect.bottom<=g.stage.top+g.stage.h+1);}
    assert.equal(g.text,soundFixture().text);
    await page.screenshot({path:path.join(out,`${name}-${size.width}x${size.height}.png`)});
  }
  assert.equal(await page.locator('.choices button').first().evaluate(el=>getComputedStyle(el,'::before').content),'"▸"');
  report.checks.push('Source positions, full-scene transparent text, inline choices and line breaks at desktop/phone/landscape sizes');
  const first=page.locator('.choices button').first(),second=page.locator('.choices button').last();
  await first.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await second.evaluate(el=>el===document.activeElement),true);
  assert.equal(await second.evaluate(el=>getComputedStyle(el).color),'rgb(238, 102, 102)');
  await page.keyboard.press('Enter');assert.deepEqual(await page.evaluate(()=>chosen),[19]);
  await first.tap();assert.deepEqual(await page.evaluate(()=>chosen),[19,7]);
  report.checks.push('Keyboard and touch return original choice IDs and move the selected colour/arrow');
  assert.equal(await page.evaluate(()=>{const r=document.createRange();r.selectNodeContents(document.querySelector('.sentence .sound-page-block'));getSelection().removeAllRanges();getSelection().addRange(r);return getSelection().toString();}),soundFixture().text);
  await page.evaluate(()=>getSelection().removeAllRanges());
  await page.evaluate(p=>novel.render(p,5),soundFixture());
  assert.equal(await page.locator('#sentence').textContent(),[...soundFixture().text].slice(0,5).join(''));
  await page.evaluate(p=>novel.render(p),soundFixture());
  assert.equal(await page.locator('#choices button').count(),0);
  report.checks.push('DOM text selection, bounded reveal and replacement/clear of an old choice page');
  await page.locator('#fullscreenButton').click();await page.waitForFunction(()=>document.fullscreenElement);
  assert.equal(await page.locator('#textbox').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  await page.evaluate(()=>document.exitFullscreen());
  await page.evaluate(p=>{
    novel.fontURL=()=>`data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path fill="white" d="M0 0h14v12H0z"/></svg>')}`;
    novel.render(p);
  },soundGlyphFixture());
  for(const [width,height]of [[1100,800],[390,844],[844,390]]) {
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const errors=await page.evaluate(p=>{
      const scale=document.querySelector('#stage').clientWidth/p.page.width,errors=[];
      const nodes=[...document.querySelectorAll('.sentence .sound-page-block'),...document.querySelectorAll('.choices .sound-page-block')];
      for(let i=0;i<nodes.length;i++) {
        const block=nodes[i],rect=block.getBoundingClientRect(),glyphs=block.querySelectorAll('.sound-source-glyph');
        for(let j=0;j<glyphs.length;j++) {
          const r=glyphs[j].getBoundingClientRect(),g=p.page.blocks[i].glyphs[j];
          if(Math.abs(r.x-rect.x-g.x*scale)>.1||Math.abs(r.y-rect.y-g.y*scale)>.1||Math.abs(r.width-g.width*scale)>.1||Math.abs(r.height-g.height*scale)>.1)errors.push([i,j,r.x-rect.x-g.x*scale,r.y-rect.y-g.y*scale,r.width-g.width*scale,r.height-g.height*scale]);
        }
      }return errors;
    },soundGlyphFixture());assert.deepEqual(errors,[],'Native glyph rectangles remain exact');
    if(process.env.VNKIT_YOMITAN_TEST_ROOT)await checkWordScanning(page,'.sound-positioned');
  }
  report.checks.push('Variable-width native glyphs retain exact source positions across wrapped lines and viewports');
  if(process.env.VNKIT_YOMITAN_TEST_ROOT) {
    const oldStyle=await page.addStyleTag({content:'.stage[data-text-layout="full-scene"] .sound-source-glyph {position:absolute}'});
    await assert.rejects(()=>checkWordScanning(page,'.sound-positioned'),/split contiguous/);
    await oldStyle.evaluate(el=>el.remove());
    await checkWordScanning(page,'.sound-positioned');
    report.checks.push('Real Yomitan scanner reproduces old one-character boundaries and reads full words after the fix');
  }
  await page.evaluate(p=>{
    p.kind='text';p.text=p.page.blocks[0].text;p.page.blocks.length=1;delete p.options;novel.render(p,3);
  },soundGlyphFixture());
  assert.equal(await page.locator('#sentence').textContent(),'図書館');
  if(process.env.VNKIT_YOMITAN_TEST_ROOT)await checkWordScanning(page,'.sound-positioned');
  report.checks.push('Partial native-font reveal exposes only visible text for lookup');
  await page.evaluate(()=>{novel.setEnabled(false);document.querySelector('#sentence').textContent='Ordinary dialogue';});
  assert.notEqual(await page.locator('#textbox').evaluate(el=>getComputedStyle(el).display),'contents');
  assert.notEqual(await page.locator('#textbox').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
  report.checks.push('Fullscreen retains overlay; disabling mode restores the ordinary dialogue styling');
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
} catch(error) {
  report.failure=error.stack;process.exitCode=1;console.error(error.stack);
  if(page&&!page.isClosed())await page.screenshot({path:path.join(out,'failure.png')});
} finally {
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  if(browser)await browser.close();if(server)server.kill('SIGTERM');await fs.rm(tmp,{recursive:true,force:true});
}
