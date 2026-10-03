// Home page and global statistics. Original synthetic content only; temporary
// library, state folder and browser profile.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root = path.resolve(import.meta.dirname, '..'), tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'vnkit-home-'));
const out = path.resolve(process.env.VNKIT_REPORT_DIR || path.join(root, 'private/browser-tests/home')); await fs.mkdir(out, {recursive: true});
const pass = name => console.log('PASS ' + name);
let server, browser;
try {
  const library = path.join(tmp, 'library'); await fs.mkdir(library);
  for (const platform of ['ps2', 'ps1']) {
    const folder = path.join(library, platform); await fs.cp(path.join(root, 'fixtures/synthetic'), folder, {recursive: true});
    const content = JSON.parse(await fs.readFile(path.join(folder, 'content.json'), 'utf8'));
    content.id = `home-test-${platform}`; content.title = `${platform.toUpperCase()} synthetic test`; content.platform = {id: platform, name: platform};
    await fs.writeFile(path.join(folder, 'content.json'), JSON.stringify(content));
  }
  server = spawn('python3', ['-u', '-c', 'import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()', library, path.join(tmp, 'state')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
  const port = await new Promise((resolve, reject) => { server.stdout.once('data', b => resolve(Number(String(b).trim()))); server.on('exit', n => reject(Error('server ' + n))); });
  const api = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs')));
  browser = await api[process.env.VNKIT_BROWSER || 'chromium'].launch({headless: true});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('dialog', d => d.accept());
  await context.addInitScript(() => localStorage.setItem('vnkit.settings', JSON.stringify({speed: 0, websocket: false})));
  const base = `http://127.0.0.1:${port}`;
  // One screen: no page scroll either way, and Home itself never overflows its panel.
  const fits = () => page.evaluate(() => { const v = document.querySelector('.home-view'), b = document.querySelector('#panelBody'); return document.documentElement.scrollWidth <= innerWidth + 1 && v.scrollWidth <= b.clientWidth + 1 && v.scrollHeight <= b.clientHeight + 1 && document.querySelector('#panel').getBoundingClientRect().height <= innerHeight + 1; });
  const stat = label => page.locator('.home-metric').filter({hasText: label}).locator('strong').textContent();
  const read = key => page.evaluate(async k => { const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); const v = await s.get(k); s.db.close(); return v; }, key);

  await page.goto(base); await page.locator('.home-view').waitFor();
  assert.equal(await page.locator('.home-item[data-system]').count(), 4);
  assert.ok(await fits()); await page.screenshot({path: path.join(out, 'home-menu.png')});
  await page.locator('.home-item[data-key=stats]').click(); await page.locator('.home-stats').waitFor();
  assert.equal(await stat('Chars'), '0'); assert.ok(await page.locator('.home-clear-all').isDisabled());
  assert.ok(await fits()); await page.screenshot({path: path.join(out, 'home-desktop.png')});
  pass('Home opens first with four systems and empty global stats');

  await page.locator('.home-item[data-system=ps2]').click(); await page.locator('.console-catalogue').waitFor();
  assert.ok(await page.locator('.home-return').isVisible()); await page.screenshot({path: path.join(out, 'library-ps2.png')});
  await page.locator('.platform-navigation [data-platform=gba]').click(); await page.waitForTimeout(700); await page.screenshot({path: path.join(out, 'library-gba.png')}); await page.locator('.platform-navigation [data-platform=ps1]').click(); await page.waitForTimeout(700); await page.screenshot({path: path.join(out, 'library-ps1.png')}); await page.locator('.platform-navigation [data-platform=ps2]').click(); await page.locator('.console-catalogue').waitFor();
  const card = page.locator('.game-card').filter({hasText: 'PS2 synthetic'}); await card.locator('summary').first().click();
  await card.getByRole('button', {name: 'Read / resume', exact: true}).click();
  await page.waitForFunction(() => !document.querySelector('#panel').open && !document.querySelector('#nextButton').disabled, null, {timeout: 30000});
  for (let n = 0; n < 4; n++) { await page.waitForTimeout(1200); await page.waitForFunction(() => !document.querySelector('#nextButton').disabled || document.querySelector('#choices button')); if (await page.locator('#choices button').count()) await page.locator('#choices button').first().click(); else await page.locator('#nextButton').click(); }
  await page.waitForTimeout(800);
  pass('A system opens from Home and a game is read');

  await page.locator('#libraryButton').click(); await page.locator('.home-return').click(); await page.locator('.home-view').waitFor(); await page.locator('.home-item[data-key=stats]').click(); await page.locator('.home-stats').waitFor();
  const chars = Number((await stat('Chars')).replace(/,/g, ''));
  assert.ok(chars > 0, `characters ${chars}`);
  const row = page.locator('.home-game[data-game="home-test-ps2"]');
  assert.match(await row.getAttribute('title'), /two/); assert.ok(!(await row.locator('.home-game-clear').isVisible()), 'clearing stays behind the toggle');
  assert.ok(await fits()); await page.screenshot({path: path.join(out, 'home-stats.png'), fullPage: false});
  await page.locator('.home-toggle').click();
  assert.ok(await row.locator('.home-game-clear').isVisible()); assert.ok(await page.locator('.home-chip[data-system=ps2]').isVisible());
  await page.screenshot({path: path.join(out, 'home-manage.png'), fullPage: false});
  pass(`Global stats include the reading (${chars} characters) with system and game rows`);

  const seenBefore = Object.keys((await read('home-test-ps2:activity')).seen).length;
  await row.locator('.home-game-clear').click(); await page.locator('.home-caption').filter({hasText: 'Cleared'}).waitFor();
  assert.equal(await stat('Chars'), '0');
  const after = await read('home-test-ps2:activity');
  assert.equal(after.sessions.reduce((n, s) => n + s.characters, 0), 0);
  assert.equal(Object.keys(after.seen).length, seenBefore); assert.ok(after.backlog.length > 0);
  assert.ok((await read('home-test-ps2:activity-before-clear')).sessions.some(s => s.characters > 0));
  pass('Per-game clear zeroes statistics, keeps read markers and backlog, and leaves a backup');

  // The open game keeps counting from zero after a clear.
  await page.locator('#closePanel').click();
  for (let n = 0; n < 2; n++) { await page.waitForTimeout(1200); if (await page.locator('#choices button').count()) await page.locator('#choices button').first().click(); else await page.locator('#nextButton').click(); }
  await page.waitForTimeout(800);
  await page.locator('#libraryButton').click(); await page.locator('.home-return').click(); await page.locator('.home-view').waitFor(); await page.locator('.home-item[data-key=stats]').click(); await page.locator('.home-stats').waitFor();
  assert.ok(Number((await stat('Chars')).replace(/,/g, '')) > 0);
  await page.locator('.home-toggle').click(); await page.locator('.home-clear-all').click(); await page.locator('.home-caption').filter({hasText: 'Cleared'}).waitFor();
  assert.equal(await stat('Chars'), '0'); assert.ok(await page.locator('.home-clear-all').isDisabled());
  pass('Clear all stats zeroes every game on this device');

  await page.locator('.home-tool[aria-label="Dark mode"]').click(); await page.waitForFunction(() => document.body.classList.contains('dim-surroundings'));
  await page.screenshot({path: path.join(out, 'home-stats-dark.png')});
  await page.keyboard.press('Escape'); await page.locator('.home-front').waitFor(); assert.ok(await page.locator('#panel').evaluate(p => p.open), 'Escape leaves stats, not Home');
  await page.screenshot({path: path.join(out, 'home-menu-dark.png')});
  pass('Dark mode toggles from Home and Escape returns from stats to the menu');
  // Phone portrait, handheld landscape and a very small screen all fit without scrolling.
  for (const [width, height, name] of [[390, 844, 'phone'], [854, 480, 'handheld'], [640, 360, 'small']]) {
    await page.setViewportSize({width, height}); await page.waitForTimeout(300);
    assert.ok(await fits(), `fits ${width}x${height}`); await page.screenshot({path: path.join(out, `home-${name}.png`), fullPage: false});
  }
  pass('Home fits one screen on phone, handheld and small screens');
  assert.deepEqual(errors, []);
} finally {
  await browser?.close(); server?.kill(); await fs.rm(tmp, {recursive: true, force: true});
}
