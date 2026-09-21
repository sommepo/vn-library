// Extended browser checks use only original synthetic content. No device/Yomitan claim.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { plainText } from '../web/engine.mjs';
const root = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(process.env.VNKIT_PLAYWRIGHT_MODULE || path.join(root, 'private/tooling/playwright/package/index.mjs')));
const base = process.env.VNKIT_URL || 'http://127.0.0.1:8891';
const output = path.join(root, 'private/browser-tests');
await fs.mkdir(output, { recursive: true });
const fixture = JSON.parse(await fs.readFile(path.join(root, 'fixtures/synthetic/content.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const checks = [], limitations = ['Windows/Android physical devices, real touch selection and Yomitan were not tested.', 'Voice-completion check uses a slowed original test tone, not commercial voice acting.'], errors = [];
const pass = name => { checks.push(name); console.log(`PASS ${name}`); };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function store(page, key = 'activity') {
  return page.evaluate(async key => { const { Store } = await import('/storage.mjs'); const store = new Store(); await store.open(); const result = await store.get(`original-synthetic:${key}`); store.db.close(); return result; }, key);
}
async function flush(page) { await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await sleep(150); }
async function current(page) { return (await store(page, 'autosave'))?.state.pending; }
async function expectId(page, id, timeout = 10000) {
  await page.waitForFunction(async id => { const { Store } = await import('/storage.mjs'); const s = new Store(); await s.open(); const p = (await s.get('original-synthetic:autosave'))?.state.pending; s.db.close(); return p?.id === id; }, id, { timeout });
}
async function game(settings = {}, init) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(settings => localStorage.setItem('vnkit.settings', JSON.stringify(settings)), settings);
  if (init) await page.addInitScript(init);
  await page.goto(base + '/?fixture=1');
  return { context, page, start: async () => { await page.locator('.game-card').filter({ hasText: '小さな読書の道' }).getByRole('button', { name: 'Read / resume', exact: true }).click(); await expectId(page, 'opening'); } };
}
const narrativeTotal = data => data.sessions.reduce((sum, session) => sum + session.characters, 0);
const activeTotal = data => data.sessions.reduce((sum, session) => sum + session.activeMs, 0);
try {
  {
    const { context, page, start } = await game({ speed: 10, websocket: true });
    const credentials = await (await fetch(`${base}/api/session`)).json(), events = [];
    const ws = new WebSocket(credentials.structuredWsUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    ws.onmessage = message => events.push(JSON.parse(message.data));
    await start();
    for (let n = 0; !events.length && n < 40; n++) await sleep(25);
    assert.equal(events.length, 1);
    assert.equal(events[0].sentence, plainText(fixture.instructions.find(i => i.id === 'opening').text));
    assert.ok((await page.locator('#sentence').textContent()).length < events[0].sentence.length);
    await page.locator('#nextButton').click(); await sleep(100);
    assert.equal((await current(page)).id, 'opening'); assert.equal(events.length, 1);
    assert.match(await page.locator('#sentence').textContent(), /短い物語です/);
    await page.locator('#nextButton').click(); await expectId(page, 'repeat-a');
    for (let n = 0; events.length < 2 && n < 40; n++) await sleep(25);
    assert.equal(events.length, 2); assert.notEqual(events[0].occurrenceId, events[1].occurrenceId);
    pass('Typewriter emits one complete logical event; reveal click does not advance or emit fragments');
    ws.close(); await context.close();
  }
  {
    const { context, page, start } = await game(); await start();
    await page.locator('#quickSaveButton').click(); await sleep(100);
    await page.locator('#nextButton').click(); await expectId(page, 'repeat-a');
    const prior = narrativeTotal(await store(page));
    await page.locator('#quickLoadButton').click(); await expectId(page, 'opening');
    await page.locator('#skipButton').click(); await expectId(page, 'repeat-b');
    await page.waitForFunction(() => document.querySelector('#skipButton').getAttribute('aria-pressed') === 'false');
    assert.equal(await page.locator('#skipButton').getAttribute('aria-pressed'), 'false');
    const data = await store(page);
    assert.equal(narrativeTotal(data), prior + [...plainText(fixture.instructions.find(i => i.id === 'repeat-b').text)].length);
    assert.equal(data.backlog.findLast(p => p.id === 'repeat-a').skipped, true);
    assert.equal(data.backlog.findLast(p => p.id === 'repeat-b').skipped, false);
    pass('Skip stops at unread source ID; only the newly presented unread segment adds reading characters');
    await context.close();
  }
  {
    const { context, page, start } = await game({ autoDelay: 500 }); await start();
    await page.locator('#nextButton').click(); await expectId(page, 'repeat-a');
    await page.locator('#autoButton').click();
    await page.evaluate(() => { const range = document.createRange(); range.selectNodeContents(document.querySelector('#sentence')); getSelection().removeAllRanges(); getSelection().addRange(range); });
    await sleep(1600); assert.equal((await current(page)).id, 'repeat-a');
    await page.evaluate(() => getSelection().removeAllRanges());
    await expectId(page, 'repeat-b', 4000);
    await page.locator('#autoButton').click();
    pass('Auto pauses for text selection and resumes after selection clears');
    await context.close();
  }
  {
    const { context, page, start } = await game({ autoDelay: 500 }, () => {
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () { if (this.src.endsWith('/voice-test.wav')) { this.playbackRate = .2; window.__testVoice = this; } return original.call(this); };
    });
    await start();
    await page.waitForFunction(() => window.__testVoice && !window.__testVoice.paused);
    await page.locator('#autoButton').click();
    await sleep(3000);
    assert.equal((await current(page)).id, 'opening');
    assert.equal(await page.evaluate(() => window.__testVoice.ended), false);
    await expectId(page, 'repeat-a', 10000);
    await page.locator('#autoButton').click();
    pass('Auto waits beyond text dwell while the original voice-channel test tone is playing');
    await context.close();
  }
  {
    const { context, page, start } = await game(); await start();
    const before = await store(page), other = await context.newPage();
    await other.goto(base); await other.locator('.game-card').filter({ hasText: '小さな読書の道' }).getByRole('button', { name: 'Read / resume', exact: true }).click();
    await other.waitForFunction(() => document.querySelector('#status').textContent.includes('already open in another reader tab'));
    assert.equal((await store(other)).sessions.length, before.sessions.length);
    assert.equal((await current(other)).occurrenceId, (await current(page)).occurrenceId);
    pass('Web Lock blocks a second reader tab before creating a session or mutating story state');
    await other.close(); await page.bringToFront();
    await sleep(2200); await flush(page); const activeBeforePause = activeTotal(await store(page));
    assert.ok(activeBeforePause >= 1000);
    await page.locator('#statsButton').click(); await page.getByRole('button', { name: 'Pause activity timer', exact: true }).click(); await page.locator('#closePanel').click();
    await sleep(2200); await flush(page);
    assert.equal(activeTotal(await store(page)), activeBeforePause);
    const previous = await current(page), previousTotal = narrativeTotal(await store(page));
    await page.reload(); await page.locator('.game-card').filter({ hasText: '小さな読書の道' }).getByRole('button', { name: 'Read / resume', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('Resumed'));
    assert.equal((await current(page)).occurrenceId, previous.occurrenceId); assert.equal(narrativeTotal(await store(page)), previousTotal);
    pass('Manual pause stops active time; reload retains presentation identity and narrative totals');
    await page.locator('#statsButton').click();
    const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export activity JSON', exact: true }).click();
    const backup = await fs.readFile(await (await downloadEvent).path(), 'utf8');
    await page.locator('#closePanel').click(); await page.locator('#nextButton').click(); await expectId(page, 'repeat-a');
    assert.ok(narrativeTotal(await store(page)) > previousTotal);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#activityFile').setInputFiles({ name: 'activity.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.waitForFunction(() => document.querySelector('#panelTitle').textContent === 'Reading activity' && document.querySelector('#panel').open);
    assert.equal(narrativeTotal(await store(page)), previousTotal);
    assert.equal((await current(page)).id, 'repeat-a');
    pass('Activity backup export/import restores study history independently from current game state');
    await page.locator('#closePanel').click();
    await page.locator('#fullscreenButton').click();
    if (await page.evaluate(() => Boolean(document.fullscreenElement))) { pass('Fullscreen enters and exits in headless Chromium'); await page.locator('#fullscreenButton').click(); assert.equal(await page.evaluate(() => Boolean(document.fullscreenElement)), false); }
    else limitations.push('Headless Chromium did not expose fullscreen; real-device fullscreen remains unverified.');
    await context.close();
  }
  assert.deepEqual(errors, []); pass('Extended mode checks produced no uncaught browser JavaScript errors');
} finally {
  await fs.writeFile(path.join(output, 'modes-report.json'), JSON.stringify({ checks, errors, limitations, commercialGameExecutionTested: false, browser: 'Playwright 1.55.0 Chromium 140', timestamp: new Date().toISOString() }, null, 2));
  await browser.close();
}
