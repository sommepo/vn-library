// Read-only installed-import boundary check. Does NOT execute story segments.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..');
const {chromium}=await import(pathToFileURL(process.env.VNKIT_PLAYWRIGHT_MODULE || path.join(root,'private/tooling/playwright/package/index.mjs')));
const base=process.env.VNKIT_URL || 'http://127.0.0.1:8891';
const id=process.argv[2];
if (!id) throw new Error('Usage: node tests/browser-import.mjs INSTALLED_GAME_ID');
const library=await (await fetch(base+'/api/library')).json();
const game=library.games.find(g=>g.id===id);assert.ok(game,'Import must exist, never substitute the fixture');
const content=await (await fetch(new URL(game.url,base))).json();
const browser=await chromium.launch({headless:true});
const checks=[];
try {
  const page=await browser.newPage();await page.goto(base);
  const card=page.locator('.game-card').filter({hasText:game.title});await card.waitFor();
  assert.equal(game.compatibility.status,'blocked');
  assert.equal(await card.getByRole('button',{name:'Read / resume',exact:true}).count(),0);
  assert.match(await card.textContent(),/unavailable|not a faithful/i);
  checks.push('Actual identified import appears blocked, with no fabricated Read action');
  const response=await fetch(new URL(game.compatibility.reportUrl,base));assert.equal(response.status,200);
  const report=await response.json();assert.equal(report.status,'blocked');assert.equal(report.faithful_port,false);
  assert.equal(report.coverage.scripts_parsed,1118);assert.equal(report.parse_failures.length,0);
  checks.push('Actual source-specific compatibility report is accessible');
  const asset=Object.values(content.assets).find(a=>a.type==='image');assert.ok(asset);
  const url=new URL(asset.url,new URL(game.url,base)).href;
  const dimensions=await page.evaluate(async url=>{const image=new Image();image.src=url;await image.decode();return [image.naturalWidth,image.naturalHeight];},url);
  assert.ok(dimensions.every(n=>n>0));
  checks.push('An actual converted original image decodes through the reader asset endpoint');
  const privateURL=new URL('analysis/scripts/OPEN01.SPC.json',new URL(game.url,base));
  assert.equal((await fetch(privateURL)).status,404);
  checks.push('Private decoded script analysis is not served');
  const output={id,checks,assets:Object.keys(content.assets).length,representativeImageDimensions:dimensions,actualStorySegmentsExecuted:0,faithfulPort:false};
  await fs.mkdir(path.join(root,'private/browser-tests'),{recursive:true});
  await fs.writeFile(path.join(root,'private/browser-tests/import-report.json'),JSON.stringify(output,null,2));
  console.log(JSON.stringify(output,null,2));
} finally {await browser.close();}
