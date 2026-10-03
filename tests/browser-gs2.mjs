// Actual GS2 private import, isolated HTTP/save server and disposable browser profile.
// Usage: node tests/browser-gs2.mjs <import-dir> <new-report-dir> [segments]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {plainText} from '../web/engine.mjs';
const root = path.resolve(import.meta.dirname, '..'), source = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]), target = Number(process.argv[4] || 400), game = 'gs2-agb-a3gj';
await fs.mkdir(out, {recursive: false});
const library = path.join(out, 'library'); await fs.cp(source, path.join(library, 'gs2'), {recursive: true});
const server = spawn('python3', ['-u', '-c', 'import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()', library, path.join(out, 'server-state')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
let stderr = ''; server.stderr.on('data', b => stderr += b);
const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => { server.kill(); reject(Error(stderr || 'Server timeout')); }, 15000); server.stdout.once('data', b => { clearTimeout(timer); resolve(+b.toString().trim()); }); server.on('exit', c => { clearTimeout(timer); reject(Error(`Server ${c}: ${stderr}`)); }); });
const api = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs'))), name = process.env.VNKIT_BROWSER || 'chromium';
const report = {browser: name, segments: 0, choices: 0, statements: 0, presents: 0, checks: [], errors: []}; let browser, page;
const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
try {
  browser = await api[name].launch({headless: true}); const context = await browser.newContext({viewport: {width: 1100, height: 850}});
  await context.addInitScript(() => localStorage.setItem('vnkit.settings', JSON.stringify({speed: 0})));
  page = await context.newPage(); page.on('pageerror', e => report.errors.push(e.message));
  const ready = () => page.waitForFunction(() => !document.querySelector('#stage').hasAttribute('aria-busy') && (!document.querySelector('#nextButton').disabled || document.querySelector('#choices button')), null, {timeout: 45000});
  const read = (k = 'autosave') => page.evaluate(async ([g, k]) => { const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); const v = await s.get(g + ':' + k); s.db.close(); return v; }, [game, k]);
  const caseData = JSON.parse(await fs.readFile(path.join(source, 'case.json'), 'utf8'));
  await page.goto(`http://127.0.0.1:${port}`);
  await page.getByRole('button', {name: 'advance', exact: true}).click(); await page.locator('.advance-screen').waitFor();
  assert.equal(await page.locator('#panel .platform-logo').count(), 0);
  await page.locator('.advance-game').filter({hasText: '逆転裁判2'}).click();
  await page.getByRole('button', {name: 'Read / resume', exact: true}).click(); await ready();
  assert.equal(await page.locator('body').getAttribute('data-platform'), 'gba'); pass('advance library launches the GS2 import');
  const stage = await page.locator('.stage').evaluate(el => getComputedStyle(el).getPropertyValue('--fit-width'));
  assert.ok(parseFloat(stage) >= 240); await page.screenshot({path: path.join(out, 'reader-start.png')});
  const seen = new Map();
  for (let step = 0; step < target * 4 && report.segments < target; step++) {
    await ready(); const save = await read(), s = save.state, p = s.pending;
    if (p.kind === 'text') {
      assert.equal(await page.locator('#sentence').textContent(), plainText(p.displayText));
      assert.equal(await page.locator('#speaker').textContent(), p.speaker);
      report.segments++; await page.locator('#nextButton').click(); continue;
    }
    assert.equal(p.kind, 'choice', `unexpected ${p.kind}`);
    assert.deepEqual(await page.locator('#choices button').allTextContents(), p.options.map(o => plainText(o.text)));
    const rows = caseData.courtPresent[s.scenario].filter(r => r.statement === s.section && (r.flag === null || s.flags[r.flag]));
    let pick = 0;
    if (p.source.native === 'questioning') {
      report.statements++;
      const answer = rows.find(r => [...s.record.evidence, ...s.record.profiles].includes(r.item));
      pick = p.options.findIndex(o => o.id === (answer ? 'present' : 'next'));
      if (report.statements === 3 && p.options.some(o => o.id === 'press')) pick = p.options.findIndex(o => o.id === 'press');
    } else if (p.source.native === 'court-record') {
      report.presents++; const answer = rows.find(r => p.options.some(o => o.id === String(r.item)));
      pick = Math.max(0, p.options.findIndex(o => o.id === String(answer?.item)));
      if (report.presents === 1) await page.screenshot({path: path.join(out, 'court-record.png')});
    } else { report.choices++; const visits = seen.get(p.id) || 0; seen.set(p.id, visits + 1); pick = visits % p.options.length; }
    await page.locator('#choices button').nth(pick).click();
  }
  assert.equal(report.segments, target); assert.ok(report.choices > 0 && report.statements > 0 && report.presents > 0, JSON.stringify(report));
  pass(`${target} source pages, ${report.choices} story choices, ${report.statements} cross-examination menus and ${report.presents} court-record presentations`);
  await page.screenshot({path: path.join(out, 'reader.png')});
  const before = await read(); await page.reload(); await page.locator('.advance-screen').waitFor();
  await page.locator('.advance-game').filter({hasText: '逆転裁判2'}).click();
  await page.getByRole('button', {name: 'Read / resume', exact: true}).click(); await ready(); assert.equal((await read()).state.pending.id, before.state.pending.id); pass('Reload resumes the same source position');
  assert.deepEqual(report.errors, []);
} catch (error) {
  report.failure = error.stack; if (page) await page.screenshot({path: path.join(out, 'failure.png')}); throw error;
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await fs.rm(library, {recursive: true, force: true});
  await browser?.close(); server.kill('SIGTERM');
}
