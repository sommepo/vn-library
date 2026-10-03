// Live cartridge playback with the browser's main thread slowed down (a stand-in for a
// phone): emulated speed, drawn frames and audio underruns over a stretch of play.
// Works for any live import; holds no game text. Sound goes to a simulated output that
// plays in real time (tests/simulated-audio-output.js), because a host without a sound
// device never starts a real one; VNKIT_WEBAUDIO=real uses the browser's own.
// Usage: node tests/browser-live-performance.mjs <import-dir> <new-report-dir> [cpu-slowdown=4] [seconds=20] [min-fps]
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {enterLibrary} from './browser-library.mjs';
const root = path.resolve(import.meta.dirname, '..'), source = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const slowdown = Number(process.argv[4] || 4), seconds = Number(process.argv[5] || 20), minFps = Number(process.argv[6] || 0);
const content = JSON.parse(await fs.readFile(path.join(source, 'content.json'), 'utf8')), game = content.id;
const exact = new RegExp(`^${content.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
await fs.mkdir(out, {recursive: false});
const library = path.join(out, 'library'); await fs.cp(source, path.join(library, game), {recursive: true});
const server = spawn('python3', ['-u', '-c', 'import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()', library, path.join(out, 'server-state')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
let stderr = ''; server.stderr.on('data', b => stderr += b);
const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => { server.kill(); reject(Error(stderr || 'Server timeout')); }, 15000); server.stdout.once('data', b => { clearTimeout(timer); resolve(+b.toString().trim()); }); server.on('exit', c => { clearTimeout(timer); reject(Error(`Server ${c}: ${stderr}`)); }); });
const api = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs')));
const report = {game, slowdown, seconds, errors: []}; let browser, failed = null;
try {
  browser = await api.chromium.launch({headless: true, args: ['--autoplay-policy=no-user-gesture-required']});
  const context = await browser.newContext({viewport: {width: 844, height: 390}});
  if (process.env.VNKIT_WEBAUDIO !== 'real') await context.addInitScript({path: path.join(import.meta.dirname, 'simulated-audio-output.js')});
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  const read = () => page.evaluate(async g => { const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); const v = await s.get(g + ':autosave'); s.db.close(); return v; }, game);
  await page.goto(`http://127.0.0.1:${port}/?livestats`);
  await enterLibrary(page, 'gba'); await page.locator('.advance-screen').waitFor();
  const row = page.locator('.advance-game').filter({hasText: exact}); if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  const start = page.locator('.advance-action').filter({hasText: /^Read \/ resume$/}).first(); await start.focus(); await start.click();
  await page.locator('.native-screen').waitFor({timeout: 60000});
  // A tap that means "continue": the middle of the picture; on a menu of episode plates, the first plate.
  const tap = async () => {
    const box = await page.locator('.native-screen').boundingBox();
    const [x, y] = await page.evaluate(() => { const e = document.querySelector('.native-screen').liveEngine, v = e.view(); if (v.process === 12 && !e.P.select?.carousel) { const s = e.sprites().find(s => s.i === e.P.oam.plates); if (s) return [s.x + 8, s.y + 8]; } return [120, 64]; });
    await page.mouse.click(box.x + box.width * x / 240, box.y + box.height * y / 160);
  };
  for (let k = 0; k < 60; k++) { const s = await read(); if (s?.state?.pending?.kind === 'text') break; await tap(); await page.waitForTimeout(700); }
  for (let k = 0; k < 8; k++) { await tap(); await page.waitForTimeout(900); } // a little way into the opening
  const stats = () => page.evaluate(() => ({...document.querySelector('.native-screen').liveStats, now: performance.now(), raf: 0}));
  const cdp = await context.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', {rate: slowdown});
  await page.waitForTimeout(3000); // settle at the slowed speed
  await page.evaluate(() => { const s = document.querySelector('.native-screen').liveStats; s.maxTickMs = 0; });
  const a = await stats(), t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000) { await tap(); await page.waitForTimeout(1500); }
  const b = await stats(), span = (b.now - a.now) / 1000;
  await cdp.send('Emulation.setCPUThrottlingRate', {rate: 1});
  Object.assign(report, {audio: b.audio, measuredSeconds: +span.toFixed(1), emulatedFps: +((b.frames - a.frames) / span).toFixed(1), drawnFps: +((b.drawn - a.drawn) / span).toFixed(1), ticksPerSecond: +((b.ticks - a.ticks) / span).toFixed(1),
    underruns: b.underruns - a.underruns, droppedSamples: b.dropped - a.dropped, slowTicks: b.slowTicks - a.slowTicks, maxTickMs: +b.maxTickMs.toFixed(1), frameMs: +b.frameMs.toFixed(2), leadSeconds: b.lead});
  await page.screenshot({path: path.join(out, 'screen.png')});
  report.readout = await page.locator('.native-stats').textContent(); assert.match(report.readout, /^\d+ fps · drawn \d+ · [\d.]+ ms · underruns \d+ · lead \d+ ms · \w+$/);
  if (minFps) assert.ok(report.emulatedFps >= minFps, `emulated ${report.emulatedFps} fps, wanted ${minFps}`);
} catch (error) { failed = error; report.errors.push(String(error.stack || error)); }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify(report));
server.kill();
// A real Web Audio teardown can hang on a host without a sound device: do not wait for it.
await Promise.race([browser?.close().catch(() => {}), new Promise(r => setTimeout(r, 4000))]);
process.exit(failed ? 1 : 0);
