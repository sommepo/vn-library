// Private actual-import navigation/UI checks; fast-forward is NOT reading coverage.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ClannadEngine } from '../web/adapters/clannad-engine.mjs';
import { pollBrowser } from './browser-poll.mjs';
const root = path.resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs')));
const base = process.env.VNKIT_URL || 'http://127.0.0.1:8891', game = 'clannad-slpm66302-1.01';
const out = path.resolve(process.env.VNKIT_REPORT_DIR || 'private/browser-tests/clannad-navigation'); await fs.mkdir(out, { recursive: true });
const report = { checks: [], errors: [], timing: 'Fast-forward; no added consecutive reading coverage' };
const pass = name => { report.checks.push(name); console.log('PASS ' + name); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch({ headless: true }); let ws, page;
const stateHash = state => { const s = structuredClone(state); if (s.pending) delete s.pending.occurrenceId; return createHash('sha256').update(JSON.stringify(s)).digest('hex'); };
const totals = a => a.sessions.reduce((s, r) => s + r.characters, 0);
async function stored(page, key = 'autosave') {
  return page.evaluate(async ([game, key]) => { const { Store } = await import('/storage.mjs'); const s = new Store(); await s.open(); const v = await s.get(game + ':' + key); s.db.close(); return v; }, [game, key]);
}
async function settled(page) { await page.waitForFunction(() => document.querySelector('#seekNotice').hidden && !document.querySelector('#status').textContent.startsWith('Moving to')); }
async function seek(page) { await page.locator('#choiceButton').click(); await settled(page); }
async function restoreFile(page, name, save) {
  const file = path.join(out, name); await fs.writeFile(file, JSON.stringify(save));
  await page.locator('#saveFile').setInputFiles(file);
  await pollBrowser(async () => (await stored(page))?.state.pending?.occurrenceId === save.state.pending.occurrenceId, 'restore checkpoint');
}
try {
  const loadJSON = async url => JSON.parse(await fs.readFile(path.join(root, 'private/library/clannad-live', url), 'utf8'));
  const reference = await ClannadEngine.create(await loadJSON('content.json'), { loadJSON }); await reference.run();
  // Baseline follows actual instructions one boundary at a time, no seeking helper.
  let passedText = -1;
  while (reference.current.kind !== 'choice') { if (reference.current.kind === 'text') passedText++; await reference.advance(); }
  const expected = reference.save(); report.firstChoice = { source: expected.state.pending.id, skippedText: passedText, stateHash: stateHash(expected.state) };
  const session = await (await fetch(base + '/api/session')).json(), events = [];
  ws = new WebSocket(session.structuredWsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); ws.onmessage = e => events.push(JSON.parse(e.data));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await context.addInitScript(() => { if (!localStorage.getItem('vnkit.settings')) localStorage.setItem('vnkit.settings', JSON.stringify({ speed: 0, websocket: true })); });
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(`${base}/?game=${game}`); await page.waitForFunction(() => !document.querySelector('#nextButton').disabled); await sleep(100);
  const initial = await stored(page), activity = await stored(page, 'activity'), emitted = events.length;
  await page.locator('#sentence').evaluate(n => { const r = document.createRange(); r.selectNodeContents(n); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await page.keyboard.press('Alt+n'); await sleep(80); assert.equal((await stored(page)).state.pending.id, initial.state.pending.id);
  await page.evaluate(() => getSelection().removeAllRanges());
  await seek(page);
  const choice = await stored(page), after = await stored(page, 'activity');
  assert.equal(stateHash(choice.state), stateHash(expected.state));
  assert.equal(totals(after), totals(activity)); assert.deepEqual(after.seen, activity.seen);
  assert.equal(after.backlog.length, activity.backlog.length + 1); assert.equal(after.backlog.at(-1).kind, 'choice');
  assert.equal(after.sessions.at(-1).skippedSegments, passedText);
  assert.equal(events.length, emitted + 1); assert.equal(events.at(-1).type, 'choice'); assert.equal(events.at(-1).flags.navigation, 'next-choice');
  assert.equal((await stored(page, 'before next choice')).state.pending.occurrenceId, initial.state.pending.occurrenceId);
  assert.equal(await page.locator('#choiceButton').isDisabled(), true);
  pass('Actual first choice and full VM state match sequential execution; no skipped narrative counted, seen, backlogged or streamed; backup retained');
  const eventCount = events.length; await page.reload(); await page.waitForFunction(() => document.querySelectorAll('#choices button').length > 0); await sleep(100);
  assert.equal(stateHash((await stored(page)).state), stateHash(choice.state)); assert.equal(events.length, eventCount); assert.equal(totals(await stored(page, 'activity')), totals(after));
  pass('Choice reload restores state without duplicate text output or reading counts');
  for (let n = 0; n < 2; n++) {
    await restoreFile(page, `first-choice-${n}.json`, choice);
    await page.locator('#choices button').nth(n).click();
    await pollBrowser(async () => (await stored(page))?.state.pending?.id !== choice.state.pending.id, 'choice selected');
    await reference.restore(expected); await reference.advance(expected.state.pending.options[n].id);
    assert.equal(stateHash((await stored(page)).state), stateHash(reference.state));
    while (reference.current.kind !== 'choice') await reference.advance();
    await seek(page); assert.equal(stateHash((await stored(page)).state), stateHash(reference.state));
  }
  pass('Both first-choice branches lead to the same subsequent choice/state as sequential execution');
  await restoreFile(page, 'opening.json', initial);
  // Cancel after the helper yields, while preserving a responsive real browser.
  await page.evaluate(() => {
    document.querySelector('#choiceButton').click();
    const timer = setInterval(() => { if (!document.querySelector('#seekNotice').hidden) { document.querySelector('#choiceButton').click(); clearInterval(timer); } }, 1);
  });
  await settled(page); assert.match(await page.locator('#status').textContent(), /cancelled/);
  assert.equal((await stored(page)).state.pending.occurrenceId, initial.state.pending.occurrenceId);
  pass('Cancellation restores the exact starting presentation and execution state');
  const beforeInterrupted = events.length;
  await page.evaluate(() => { document.querySelector('#choiceButton').click(); setTimeout(() => location.reload(), 10); });
  await page.waitForEvent('domcontentloaded');
  await page.waitForFunction(() => !document.querySelector('#nextButton').disabled);
  assert.equal((await stored(page)).state.pending.occurrenceId, initial.state.pending.occurrenceId);
  assert.equal(events.length, beforeInterrupted);
  pass('Reload during a jump resumes the visible starting position without publishing transient skipped dialogue');
  // Reach a voiced/illustrated source page by ordinary advancement for visual review.
  for (let n = 0; n < 85; n++) {
    const old = (await stored(page)).state.pending.id;
    await page.locator('#nextButton').click();
    await pollBrowser(async () => (await stored(page))?.state.pending?.id !== old, 'normal dialogue advancement');
  }
  await page.locator('#art img').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode())));
  const scene = await stored(page); await page.screenshot({ path: path.join(out, 'desktop-light.png') });
  for (let n = 0; n < 30 && !(await page.locator('#speaker').textContent()); n++) {
    const id = (await stored(page)).state.pending.id; await page.locator('#nextButton').click();
    await pollBrowser(async () => (await stored(page))?.state.pending?.id !== id, 'voiced speaker page');
  }
  assert.ok(await page.locator('#speaker').textContent());
  await page.screenshot({ path: path.join(out, 'desktop-nameplate.png') });
  await restoreFile(page, 'visual-scene.json', scene);
  const light = await page.locator('.textbox').evaluate(n => ({ background: getComputedStyle(n).background, color: getComputedStyle(n).color }));
  await page.locator('#dimButton').click(); await page.screenshot({ path: path.join(out, 'desktop-dim.png') });
  assert.equal(await page.locator('#dimButton').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.locator('.textbox').evaluate(n => ({ background: getComputedStyle(n).background, color: getComputedStyle(n).color })), light);
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#nextButton').disabled);
  assert.equal(await page.locator('#dimButton').getAttribute('aria-pressed'), 'true'); assert.equal(stateHash((await stored(page)).state), stateHash(scene.state));
  await page.locator('#dimButton').click();
  for (const [name, width, height] of [['tablet', 1024, 768], ['mobile', 412, 915], ['landscape', 915, 412]]) {
    await page.setViewportSize({ width, height }); await page.screenshot({ path: path.join(out, name + '.png') });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.ok(await page.locator('#sentence').isVisible());
    const text = await page.locator('#textbox').boundingBox(), stage = await page.locator('#stage').boundingBox();
    assert.ok(text.x >= stage.x && text.x + text.width <= stage.x + stage.width + 1);
  }
  pass('Lavender/gold UI rendered at desktop, tablet, mobile and landscape sizes; Dim persists without changing game/text brightness');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await restoreFile(page, 'before-error-probe.json', initial);
  let choices = 0;
  for (; choices < 25; choices++) {
    const before = await stored(page), beforeActivity = await stored(page, 'activity'), beforeEvents = events.length; await seek(page);
    const message = await page.locator('#status').textContent();
    if (message.includes('Unresolved')) {
      assert.match(message, /SEEN3419.MZX:00000c6a: Unresolved native event 41/);
      assert.equal((await stored(page)).state.pending.occurrenceId, before.state.pending.occurrenceId);
      const afterError = await stored(page, 'activity');
      assert.equal(totals(afterError), totals(beforeActivity)); assert.deepEqual(afterError.backlog, beforeActivity.backlog); assert.equal(events.length, beforeEvents);
      report.failClosedBoundary = message; break;
    }
    assert.equal((await stored(page)).state.pending.kind, 'choice');
    const choiceId = (await stored(page)).state.pending.id;
    await page.locator('#choices button').first().click();
    await pollBrowser(async () => (await stored(page))?.state.pending?.id !== choiceId, 'choice continuation');
  }
  assert.equal(choices, 19); report.reachedChoices = choices;
  pass('19 source choices reached through actual VM; unsupported native event 41 stops navigation and restores its starting point');
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (e) {
  report.errors.push(e.stack || e.message); report.passed = false; process.exitCode = 3;
  if (page) {
    await page.screenshot({ path: path.join(out, 'failure.png') });
    report.failureUI = await page.evaluate(() => ({ status: document.querySelector('#status').textContent, disabled: document.querySelector('#nextButton').disabled, hidden: document.hidden, selected: Boolean(getSelection().toString()), busy: document.querySelector('#stage').getAttribute('aria-busy') }));
    const current = await stored(page); report.failureSource = { source: current?.state.pending?.id, kind: current?.state.pending?.kind };
  }
}
finally { ws?.close(); await browser.close(); await fs.writeFile(path.join(out, 'results.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
