// Live native Gyakuten Saiban (GBA) reader in a real browser: isolated server, fresh
// profile, private import. Works for any edition; the game id, title and episode
// starts come from the import's own content.json, so no game text is in this file.
// Usage: node tests/browser-gyakuten-native.mjs <import-dir> <new-report-dir> [pages]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {enterLibrary} from './browser-library.mjs';
const root = path.resolve(import.meta.dirname, '..'), source = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]), target = Number(process.argv[4] || 60);
const content = JSON.parse(await fs.readFile(path.join(source, 'content.json'), 'utf8')), game = content.id, entries = content.runtime.entries || [];
const exact = new RegExp(`^${content.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
await fs.mkdir(out, {recursive: false});
const library = path.join(out, 'library'); await fs.cp(source, path.join(library, game), {recursive: true});
const server = spawn('python3', ['-u', '-c', 'import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()', library, path.join(out, 'server-state')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
let stderr = ''; server.stderr.on('data', b => stderr += b);
const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => { server.kill(); reject(Error(stderr || 'Server timeout')); }, 15000); server.stdout.once('data', b => { clearTimeout(timer); resolve(+b.toString().trim()); }); server.on('exit', c => { clearTimeout(timer); reject(Error(`Server ${c}: ${stderr}`)); }); });
const api = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs'))), name = process.env.VNKIT_BROWSER || 'chromium';
const report = {browser: name, game, pages: 0, choices: 0, checks: [], errors: []}; let browser, page;
const pass = label => { report.checks.push(label); console.log('PASS ' + label); };
try {
  // Software WebGL 2 for the CRT check on a host without a GPU.
  browser = await api[name].launch({headless: true, args: name === 'chromium' ? ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] : []});
  const context = await browser.newContext({viewport: {width: 1100, height: 900}});
  // This headless host has no audio device: Web Audio teardown blocks navigation there.
  // Game audio is checked separately (APU capture); the reader must work without it.
  if (!process.env.VNKIT_WEBAUDIO) await context.addInitScript(() => { window.AudioContext = undefined; });
  page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  const read = (k = 'autosave') => page.evaluate(async ([g, k]) => { const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); const v = await s.get(g + ':' + k); s.db.close(); return v; }, [game, k]);
  const openGame = async () => { const row = page.locator('.advance-game').filter({hasText: exact}); if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click(); };
  // Rows below the menu's visible area scroll in when focused, as with the keyboard.
  const action = async label => { const b = page.locator('.advance-action').filter({hasText: label}).first(); await b.focus(); await b.click(); };
  await page.goto(`http://127.0.0.1:${port}`);
  await enterLibrary(page, 'gba'); await page.locator('.advance-screen').waitFor();
  await openGame(); await action(/^Read \/ resume$/);
  await page.locator('.native-screen').waitFor({timeout: 60000});
  assert.equal(await page.locator('#gbaPad').count(), 0); pass('Live cartridge screen mounts with no off-screen controls');
  // The canvas must show the game's own frames (non-uniform pixels) within a few seconds.
  await page.waitForFunction(() => { const c = document.querySelector('.native-screen'), d = c.getContext('2d').getImageData(0, 0, 240, 160).data; const s = new Set(); for (let i = 0; i < d.length; i += 97) s.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]); return s.size > 8; }, null, {timeout: 30000});
  await page.screenshot({path: path.join(out, 'title.png')}); pass('Original frames render live');
  // Title and episode menu are native: confirm with the A button until the first page.
  // A tap that means "continue": the middle of the picture; on a menu of episode plates, the first plate.
  const tapA = async () => {
    const box = await page.locator('.native-screen').boundingBox();
    const [x, y] = await page.evaluate(() => { const e = document.querySelector('.native-screen').liveEngine, v = e.view(); if (v.process === 12 && !e.P.select?.carousel) { const s = e.sprites().find(s => s.i === e.P.oam.plates); if (s) return [s.x + 8, s.y + 8]; } return [120, 64]; });
    await page.mouse.click(box.x + box.width * x / 240, box.y + box.height * y / 160);
  };
  for (let k = 0; k < 40; k++) { const s = await read(); if (s?.state?.pending?.kind === 'text') break; await tapA(); await page.waitForTimeout(700); }
  let seen = null;
  for (let step = 0; step < target * 60 && report.pages < target; step++) {
    const s = await read(), p = s?.state?.pending;
    if (!p || p.occurrenceId === seen) { await page.waitForTimeout(150); continue; }
    seen = p.occurrenceId;
    if (p?.kind === 'text') {
      // The game's own text is DOM: same characters, one line element per native row.
      await page.waitForFunction(t => [...document.querySelectorAll('.native-line')].map(l => l.textContent).join('\n').replace(/\s+$/u, '') === t, p.displayText, {timeout: 10000});
      assert.equal(await page.locator('#textbox').isHidden(), true);
      if (!report.selectedWords && [...p.displayText.replace(/[‥　\s。、！？]/gu, '')].length >= 8) {
        const words = [];
        for (const line of await page.locator('.native-line').all()) {
          const box = await line.boundingBox(); await page.mouse.dblclick(box.x + box.width * 0.45, box.y + box.height / 2);
          words.push(await page.evaluate(() => getSelection().toString())); await page.evaluate(() => getSelection().removeAllRanges());
        }
        report.selectedWords = words.length; assert.ok(words.some(w => [...w].length > 1), 'word selection');
        await page.screenshot({path: path.join(out, 'text.png')}); pass(`Word selection on native text (${words.length} lines)`);
      }
      report.pages++; if (report.pages === 6) await page.screenshot({path: path.join(out, 'page.png')});
      await tapA();
    } else if (p?.kind === 'choice') {
      assert.equal(await page.locator('#choices button').count(), 0);
      await page.waitForFunction(n => document.querySelectorAll('.native-line').length >= n, p.options.length);
      report.choices++; await page.screenshot({path: path.join(out, 'choice.png')});
      await page.locator('.native-line').first().click();
    }
    await page.waitForTimeout(150);
  }
  report.audioWorklet = await page.evaluate(() => typeof AudioWorkletNode === 'function');
  await page.screenshot({path: path.join(out, 'reader.png')});
  assert.ok(report.pages >= target, JSON.stringify({pages: report.pages, choices: report.choices})); pass(`${report.pages} native pages with exact DOM text; ${report.choices} choices`);
  // Tapping inside the game's text box never advances.
  // The autosave keeps the last page while the game runs on natively, so wait until the
  // box guard is up on a page that waits for input (timed pages clear by themselves).
  // The box can also stay on screen while the game runs on after a page, so require the same
  // page, with its text shown, over several seconds.
  const guard = () => page.evaluate(() => { const g = document.querySelector('.native-box-guard'), r = g?.getBoundingClientRect(); return g && !g.hidden && r.height > 0 ? {top: r.top, bottom: r.bottom} : null; });
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.native-line')].map(l => l.textContent).join('\n').replace(/\s+$/u, ''));
  let still = 0;
  for (let n = 0; n < 60 && still < 3; n++) {
    const a = (await read()).state.pending; await page.waitForTimeout(1500); const b = (await read()).state.pending, up = await guard();
    const waiting = b.occurrenceId === a.occurrenceId && b.kind === 'text' && !b.timed && up && await shown() === b.displayText;
    still = waiting ? still + 1 : 0;
    if (b.occurrenceId === a.occurrenceId && !up) await tapA();
  }
  { const before = (await read()).state.pending, box = await page.locator('.native-screen').boundingBox(), up = await guard();
    assert.ok(still >= 3 && up, 'no input page held still with its text box shown');
    const x = box.x + box.width * 0.9, y = up.top + (up.bottom - up.top) * 0.6;
    const target = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return `${el?.tagName}.${el?.className}`; }, [x, y]);
    await page.mouse.click(x, y); await page.waitForTimeout(1500);
    const after = (await read()).state.pending; report.boxTap = {timed: Boolean(before.timed), changed: after.occurrenceId !== before.occurrenceId, target};
    assert.equal(after.occurrenceId, before.occurrenceId, JSON.stringify(report.boxTap)); pass('Text box taps do not advance'); }
  // The court record opened from a page of dialogue: the game's own prompts take taps while
  // the page waits underneath, and the reader's back tab returns to that page.
  { const tab = page.locator('.native-tab-record'), back = page.locator('.native-tab-back');
    for (let k = 0; k < 6 && !(await tab.isVisible()); k++) { await tapA(); await page.waitForTimeout(2500); } // a page where the game allows the record
    const before = (await read()).state.pending, box = await page.locator('.native-screen').boundingBox(), t = await tab.boundingBox();
    assert.ok(t && t.x >= box.x - 1 && t.x + t.width <= box.x + box.width + 1 && t.y >= box.y - 1 && t.y + t.height <= box.y + box.height + 1, JSON.stringify({t, box}));
    const tapGame = (x, y) => page.mouse.click(box.x + box.width * x / 240, box.y + box.height * y / 160);
    // What the record shows, without its bobbing arrows: the middle of its panel in the game's own frame.
    const panel = () => page.evaluate(() => { const f = document.querySelector('.native-screen').liveEngine.ppu.frame; let h = 2166136261; for (let y = 28; y < 84; y++) for (let x = 24; x < 216; x++) { const i = (y * 240 + x) * 4; h = Math.imul(h ^ f[i] ^ f[i + 1] << 8 ^ f[i + 2] << 16, 16777619); } return h >>> 0; });
    const settled = async differentFrom => { let last = await panel(); for (let k = 0; k < 40; k++) { await page.waitForTimeout(300); const now = await panel(); if (now === last && now !== differentFrom) return now; last = now; } return last; };
    const native = () => page.evaluate(() => { const e = document.querySelector('.native-screen').liveEngine, r = e.recordPrompt('R'); return {process: e.view().process, r: r && [r.x + r.w / 2, r.y + r.h - 3]}; });
    await tab.click(); await back.waitFor({timeout: 10000});
    const evidence = await settled(); await page.screenshot({path: path.join(out, 'record.png')});
    const prompt = (await native()).r; assert.ok(prompt, 'the game draws no R prompt in its record');
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.className, [box.x + box.width * prompt[0] / 240, box.y + box.height * prompt[1] / 160]);
    await tapGame(...prompt); // the lower part of the game's own R prompt, which the text box area overlaps
    const other = await settled(evidence); assert.notEqual(other, evidence, `the R prompt (under .${under}) did not switch the list`); await page.screenshot({path: path.join(out, 'record-other-list.png')});
    await tapGame(232, 56); const next = await settled(other); // the strip beside the game's ▶ arrow
    report.record = {under, arrowChangedItem: next !== other};
    await tapGame(120, 56); await page.waitForTimeout(700); assert.equal((await native()).process, 7, 'a tap on the record\'s panel must not close it');
    await back.click(); await tab.waitFor({timeout: 10000});
    const after = (await read()).state.pending; Object.assign(report.record, {same: after.occurrenceId === before.occurrenceId, text: await shown() === before.displayText});
    assert.ok(report.record.same && report.record.text, JSON.stringify(report.record)); pass('Court record over a page: the game\'s prompts take taps and the page stays'); }
  // Previous line restores the earlier page with a single text layer.
  { for (let k = 0; k < 2; k++) { await tapA(); await page.waitForTimeout(2500); }
    await page.locator('#previousButton').click(); await page.waitForTimeout(1500);
    assert.equal(await page.locator('.native-text').count(), 1); assert.equal(await page.locator('.native-screen').count(), 1);
    pass('Previous line keeps one text layer'); }
  // Fullscreen at phone size: the game and its DOM text scale together.
  await page.setViewportSize({width: 844, height: 390}); await page.locator('#fullscreenButton').click(); await page.waitForTimeout(1200);
  { const c = await page.locator('.native-screen').boundingBox(), lines = await page.locator('.native-line').evaluateAll(ls => ls.map(l => { const r = l.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    report.fullscreen = {canvas: c, active: await page.evaluate(() => Boolean(document.fullscreenElement)), lines: lines.length};
    assert.ok(report.fullscreen.active && c.height > 360, JSON.stringify(report.fullscreen));
    for (const [l, tp, r, b] of lines) assert.ok(l >= c.x - 1 && r <= c.x + c.width + 2 && tp >= c.y - 1 && b <= c.y + c.height + 2, JSON.stringify({c, l, tp, r, b}));
    await page.screenshot({path: path.join(out, 'fullscreen.png')}); pass(`Fullscreen fits ${Math.round(c.width)}x${Math.round(c.height)} with aligned text`); }
  await page.evaluate(() => document.exitFullscreen?.()); await page.setViewportSize({width: 1100, height: 900});
  report.rafPerSecond = await page.evaluate(() => new Promise(done => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else done(n / 2); }; requestAnimationFrame(f); }));
  console.log('rAF/s', report.rafPerSecond);
  // The CRT display takes the live picture as its source: it switches on, the game keeps
  // drawing and taking taps underneath, and switching it off shows the plain screen again.
  { const live = page.locator('.live-screen'), drawn = () => live.evaluate(c => c.liveStats.drawn), opacity = () => live.evaluate(c => getComputedStyle(c).opacity);
    await page.locator('#crtButton').click(); await page.locator('#crt-enabled').check();
    await page.waitForFunction(() => document.querySelector('#crt-state').textContent.startsWith('CRT active'), null, {timeout: 20000});
    report.crt = await page.locator('#crt-state').textContent(); await page.locator('#closePanel').click();
    assert.equal(await page.locator('#art.crt-active > canvas.crt-screen').count(), 1, report.crt); assert.equal(await opacity(), '0');
    const d0 = await drawn(); await page.waitForTimeout(2000); assert.ok(await drawn() > d0 + 5, 'the game stopped drawing under the CRT');
    for (let k = 0; k < 8 && (await read()).state.pending.kind !== 'text'; k++) await page.waitForTimeout(800);
    const before = (await read()).state.pending; let moved = false;
    for (let k = 0; k < 6 && !moved; k++) { await tapA(); await page.waitForTimeout(2500); moved = (await read()).state.pending.occurrenceId !== before.occurrenceId; }
    assert.ok(moved, 'a tap on the picture did not continue under the CRT'); await page.screenshot({path: path.join(out, 'crt.png')});
    await page.locator('#crtButton').click(); await page.locator('#crt-enabled').uncheck(); await page.locator('#closePanel').click();
    assert.equal(await page.locator('#art.crt-active').count(), 0); assert.equal(await page.locator('.crt-screen').count(), 0); assert.equal(await opacity(), '1');
    pass('CRT display filters the live picture; the game keeps running and taking taps under it'); }
  const before = await read(); await page.reload(); await enterLibrary(page, 'gba'); await page.locator('.advance-screen').waitFor();
  await openGame(); await action(/^Read \/ resume$/);
  await page.locator('.native-screen').waitFor();
  await page.waitForFunction(t => [...document.querySelectorAll('.native-line')].map(l => l.textContent).join('\n').replace(/\s+$/u, '') === t, before.state.pending.displayText ?? '', {timeout: 30000});
  pass('Reload resumes the saved machine at the same page');
  // Any case starts independently from the menu: the first page comes from that episode's scenario.
  if (entries[1]) {
    await page.locator('#libraryButton').click(); await page.locator('.advance-screen').waitFor();
    await openGame(); await action(entries[1].label);
    await page.locator('.native-screen').waitFor();
    let reached = null;
    for (let k = 0; k < 120 && reached == null; k++) { const p = (await read())?.state?.pending; if (p?.kind === 'text' && p.source?.scenario === entries[1].scenario) reached = p; else await page.waitForTimeout(500); }
    assert.ok(reached, `no page from scenario ${entries[1].scenario}`);
    await page.waitForFunction(t => [...document.querySelectorAll('.native-line')].map(l => l.textContent).join('\n').replace(/\s+$/u, '') === t, reached.displayText, {timeout: 10000});
    await page.screenshot({path: path.join(out, 'episode-2.png')}); pass('Episode 2 starts independently from the advance menu');
  }
  assert.deepEqual(report.errors.filter(e => !/AudioContext|audio/i.test(e)), []);
} catch (error) {
  report.failure = error.stack; if (page) await page.screenshot({path: path.join(out, 'failure.png')}); throw error;
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await fs.rm(library, {recursive: true, force: true});
  await browser?.close(); server.kill('SIGTERM');
}
