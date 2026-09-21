// Private real-disc smoke. Requires the user's generated Pia runtime, never fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root = path.resolve(import.meta.dirname, '..');
const {chromium} = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs')));
const base = process.env.VNKIT_URL || 'http://127.0.0.1:8891';
const output = path.join(root, 'private/browser-tests/pia');
await fs.mkdir(output, {recursive: true});
const browser = await chromium.launch({headless: true});
const evidence = {checks: [], actualPages: 0, consoleErrors: []};
try {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
  await context.addInitScript(() => {const OriginalAudio = Audio; window.__vnAudio = []; window.Audio = class extends OriginalAudio {constructor(...args) {super(...args); window.__vnAudio.push(this);}};});
  const page = await context.newPage();
  page.on('pageerror', error => evidence.consoleErrors.push(error.message));
  await page.goto(base);
  // Select only the specific executable runtime; no fallback to the test fixture.
  const cards = page.locator('.game-card');
  const target = cards.filter({has: page.getByRole('button', {name: 'Start again', exact: true})}).filter({hasText: 'Pia'});
  await target.waitFor();
  assert.equal(await target.count(), 1);
  await target.getByRole('button', {name: 'Start again', exact: true}).click();
  await page.locator('.startup-form').waitFor();
  assert.equal(await page.locator('[name=familyName]').inputValue(), '神無月');
  assert.equal(await page.locator('[name=firstName]').inputValue(), '明彦');
  await page.locator('.startup-form button[type=submit]').click();
  await page.locator('#sentence').filter({hasText: /.+/}).waitFor();
  assert.equal(await page.locator('#speaker').textContent(), '従業員たち');
  const first = await page.locator('#sentence').textContent();
  assert.ok(first.length > 5);
  evidence.checks.push('Original fresh-game defaults and executable-derived first speaker');
  await page.screenshot({path: path.join(output, 'first-page.png')});
  const image = await page.locator('.background').evaluate(async img => {await img.decode(); return [img.naturalWidth, img.naturalHeight];});
  assert.deepEqual(image, [640, 480]);
  evidence.checks.push('Real first background decodes at original 640×480');
  const audio = await page.evaluate(async () => {
    const library = await (await fetch('/api/library')).json();
    const game = library.games.find(item => item.id.endsWith('-runtime1'));
    const content = await (await fetch(game.url)).json();
    const source = content.resources.voice['09598'];
    const a = new Audio(new URL(content.assets[source].url, new URL(game.url, location.href)));
    await new Promise((resolve, reject) => {a.onloadedmetadata = resolve; a.onerror = reject;});
    return {duration: a.duration, source};
  });
  assert.ok(audio.duration > 5 && audio.duration < 6);
  assert.match(audio.source, /PIA3_1/);
  evidence.checks.push('Original first voice alias decodes in Chromium');
  assert.equal(await page.locator('#position').textContent(), '');
  assert.equal(await page.locator('#gameBadge').textContent(), '');
  await page.waitForFunction(() => window.__vnAudio[0]?.currentTime > 0 && window.__vnAudio[0].readyState >= 2);
  const music = await page.evaluate(() => {const a = window.__vnAudio[0]; return {source: a.currentSrc, error: a.error, muted: a.muted};});
  assert.match(music.source, /BGM24\.flac$/); assert.equal(music.error, null); assert.equal(music.muted, false);
  evidence.checks.push('Original-bank BGM24 plays in the reader; requested status labels are absent');
  await page.locator('#sentence').evaluate(node => {const range = document.createRange(); range.selectNodeContents(node); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);});
  await page.keyboard.press('ArrowRight'); assert.equal(await page.locator('#sentence').textContent(), first);
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.locator('#copyButton').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), first);
  evidence.checks.push('Selectable original Japanese blocks advancement; explicit device clipboard succeeds');
  evidence.actualPages = 1;
  for (let index = 0; index < 104; index++) {
    const choice = page.locator('#choices button');
    if (await choice.count()) {await choice.first().click(); evidence.checks.push('Selected an original script choice');}
    else {
      if (await page.locator('audio.script-media').count()) {
        const sound = page.locator('audio.script-media');
        await page.waitForFunction(() => {const a = document.querySelector('audio.script-media'); return a?.readyState >= 2 && Number.isFinite(a.duration);});
        await sound.evaluate(async a => {a.currentTime = Math.max(0, a.duration - .08); await a.play();});
        await sound.waitFor({state: 'detached'});
      }
      await page.locator('#nextButton').click();
    }
    await page.waitForTimeout(20);
    if (await page.locator('#nextButton').isEnabled()) evidence.actualPages++;
    if (index === 20) {await page.locator('#art img').evaluateAll(images => Promise.all(images.map(img => img.decode()))); await page.screenshot({path: path.join(output, 'sprite-page.png')});}
    const error = await page.locator('#status').textContent();
    if (/unsupported|unresolved|invalid|escaped|Expected/i.test(error)) throw new Error(error);
  }
  assert.ok(evidence.actualPages >= 100);
  const current = await page.locator('#sentence').textContent();
  await page.locator('#quickSaveButton').click();
  await page.waitForFunction(() => document.getElementById('status').textContent.includes('saved in this browser'));
  await page.locator('#nextButton').click();
  const next = await page.locator('#sentence').textContent();
  await page.locator('#quickLoadButton').click();
  await page.waitForFunction(text => document.getElementById('sentence').textContent === text, current);
  assert.equal(await page.locator('#sentence').textContent(), current);
  await page.locator('#nextButton').click(); assert.equal(await page.locator('#sentence').textContent(), next);
  evidence.checks.push('Actual browser quicksave/load reproduces following original page');
  await page.setViewportSize({width: 412, height: 915});
  await page.screenshot({path: path.join(output, 'mobile-page.png')});
  assert.ok(await page.locator('#sentence').isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  evidence.checks.push('Actual image/text layout fits a 412px mobile viewport');
  if (process.argv.includes('--movie')) {
    await page.setViewportSize({width: 1280, height: 900});
    for (let step = 0; step < 160 && !await page.locator('video.script-media').count(); step++) {
      if (await page.locator('audio.script-media').count()) {
        const sound = page.locator('audio.script-media');
        await sound.evaluate(async a => {await a.play();});
        await page.waitForFunction(() => document.querySelector('audio.script-media')?.readyState >= 2);
        await sound.evaluate(a => {a.currentTime = Math.max(0, a.duration - .08);});
        await sound.waitFor({state: 'detached'});
      } else if (await page.locator('#choices button').count()) await page.locator('#choices button').first().click();
      else if (await page.locator('#nextButton').isEnabled()) await page.locator('#nextButton').click();
      else await page.waitForTimeout(100);
      await page.waitForTimeout(20);
      const error = await page.locator('#status').textContent();
      if (/unsupported|unresolved|invalid|escaped|Expected/i.test(error)) throw new Error(error);
    }
    const video = page.locator('video.script-media');
    await video.waitFor();
    await video.evaluate(async v => {await v.play();});
    await page.waitForFunction(() => {const v = document.querySelector('video.script-media'); return v?.currentTime > .5 && v.videoWidth === 640 && v.webkitAudioDecodedByteCount > 0;});
    assert.equal(await page.locator('#nextButton').isDisabled(), true);
    await video.evaluate(v => {v.currentTime = v.duration - .15;});
    await video.waitFor({state: 'detached'});
    await page.waitForFunction(() => document.getElementById('nextButton').disabled === false);
    evidence.checks.push('Actual script reaches opening movie; original video/audio decode, seek-to-end resumes source script (not full-duration playback)');
  }
  assert.deepEqual(evidence.consoleErrors, []);
  evidence.passed = true;
} catch (error) {evidence.failure = error.stack; throw error;}
finally {await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(evidence, null, 2)); await browser.close(); console.log(JSON.stringify(evidence, null, 2));}
