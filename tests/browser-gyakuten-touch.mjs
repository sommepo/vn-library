// Real taps on the native screens of a live Gyakuten Saiban (GBA) reader, in a real browser
// with touch input: each run resumes a saved machine state (a private file made by the
// reader or the playthrough tools) and taps what the game itself draws. The page exposes the
// engine on its canvas (`liveEngine`), so targets come from the game's own sprites and the
// result of every tap is read from native state. No game text in this file.
// Usage: node tests/browser-gyakuten-touch.mjs <import-dir> <new-report-dir> <screen>=<state.json> ...
//   screens: cross (a cross-examination statement), investigation (the investigation menu),
//            lock (a psyche-lock with its prompts), choice (a page with a choice list),
//            save (the save prompt), detector (a detector minigame waiting for input)
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {enterLibrary} from './browser-library.mjs';
const root = path.resolve(import.meta.dirname, '..'), source = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const jobs = process.argv.slice(4).map(a => { const k = a.indexOf('='); return [a.slice(0, k), path.resolve(a.slice(k + 1))]; });
const content = JSON.parse(await fs.readFile(path.join(source, 'content.json'), 'utf8')), game = content.id, key = content.runtime.id.split('-')[0];
const exact = new RegExp(`^${content.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
// The state files may come from an earlier import of the same cartridge: bind them to this one.
const {[`${key.toUpperCase()}NativeEngine`]: Engine} = await import(pathToFileURL(path.join(root, `web/adapters/${key}-native.mjs`)));
const signature = (await Engine.create(content, {loadBytes: async u => new Uint8Array(await fs.readFile(path.join(source, u))), loadJSON: async u => JSON.parse(await fs.readFile(path.join(source, u), 'utf8'))})).signature;
await fs.mkdir(out, {recursive: false});
const library = path.join(out, 'library'); await fs.cp(source, path.join(library, game), {recursive: true});
const server = spawn('python3', ['-u', '-c', 'import sys\nfrom vnkit.server import ReaderServer\ns=ReaderServer(("127.0.0.1",0),sys.argv[1],sys.argv[2])\nprint(s.server_address[1],flush=True)\ns.serve_forever()', library, path.join(out, 'server-state')], {cwd: root, stdio: ['ignore', 'pipe', 'pipe']});
let stderr = ''; server.stderr.on('data', b => stderr += b);
const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => { server.kill(); reject(Error(stderr || 'Server timeout')); }, 15000); server.stdout.once('data', b => { clearTimeout(timer); resolve(+b.toString().trim()); }); server.on('exit', c => { clearTimeout(timer); reject(Error(`Server ${c}: ${stderr}`)); }); });
const api = await import(pathToFileURL(path.join(root, 'private/tooling/playwright/package/index.mjs')));
const report = {game, screens: {}, errors: []}; let browser, failed = null;
const pass = label => { console.log('PASS ' + label); return label; };

// Everything below runs against one page resumed at one saved state.
async function screen(name, file) {
  const checks = report.screens[name] = [];
  const context = await browser.newContext({viewport: {width: 844, height: 390}, hasTouch: true});
  await context.addInitScript(() => { window.AudioContext = undefined; }); // no sound device on a test host
  const page = await context.newPage(); page.on('pageerror', e => report.errors.push(`${name}: ${e.message}`));
  await page.goto(`http://127.0.0.1:${port}`); await enterLibrary(page, 'gba'); await page.locator('.advance-screen').waitFor();
  const save = {...JSON.parse(await fs.readFile(file, 'utf8')), gameId: game, gameSignature: signature};
  await page.evaluate(async ([k, v]) => { const {Store} = await import('/storage.mjs'); const s = new Store(); await s.open(); await s.put(k, v); s.db.close(); }, [`${game}:autosave`, save]);
  const row = page.locator('.advance-game').filter({hasText: exact}); if ((await row.getAttribute('aria-expanded')) !== 'true') await row.click();
  const start = page.locator('.advance-action').filter({hasText: /^Read \/ resume$/}).first(); await start.focus(); await start.click();
  await page.locator('.native-screen').waitFor({timeout: 60000});
  const box = await page.locator('.native-screen').boundingBox();
  // Native state, read in the page: s.* is whatever the function returns.
  const native = (fn, arg) => page.evaluate(([source, arg]) => { const e = document.querySelector('.native-screen').liveEngine; return new Function('e', 'arg', `return (${source})(e, arg)`)(e, arg); }, [fn.toString(), arg]);
  const view = () => page.evaluate(() => { const e = document.querySelector('.native-screen').liveEngine, v = e.view(), s = e.scriptState(); return {process: v.process, state: v.state, var1: v.var1, flags: v.flags, section: s.section, pointer: s.ptr, kind: e.current?.kind, text: e.textLayer().length, frame: e.machine.frame, options: v.options}; });
  const sprites = () => page.evaluate(() => { const e = document.querySelector('.native-screen').liveEngine; return {list: e.sprites(), oam: e.P.oam}; });
  const drawn = async indexes => (await sprites()).list.find(s => indexes.includes(s.i));
  // Prompts and arrows blink or slide in: wait for one to be on the screen.
  const shown = async (indexes, label) => { for (let k = 0; k < 40; k++) { const s = await drawn(indexes); if (s) return s; await page.waitForTimeout(100); } throw Error(`${name}: the game does not draw ${label}`); };
  const tap = async (x, y) => { await page.touchscreen.tap(box.x + box.width * x / 240, box.y + box.height * y / 160); };
  const tapSprite = async s => tap(s.x + s.w / 2, Math.max(0, s.y) + Math.min(6, s.h / 2));
  const until = async (test, ms = 15000, label = 'state') => { const end = Date.now() + ms; let v; for (;;) { v = await view(); if (await test(v)) return v; if (Date.now() > end) throw Error(`${name}: timed out waiting for ${label}: ${JSON.stringify(v)}`); await page.waitForTimeout(120); } };
  const ok = label => checks.push(pass(`${name}: ${label}`));
  // Read on until a state: pages by a tap on the picture; a choice by a tap on one of its lines,
  // the next line each time the same question comes round again.
  const asked = new Map();
  const readTo = async (test, label, turns = 120) => { for (let k = 0; k < turns; k++) { const v = await view(); if (await test(v)) return v; if (v.kind === 'text' || (v.kind === 'native' && v.flags & 1 && v.text)) await tap(120, 60); else if (v.kind === 'choice') { const lines = page.locator('.native-line'), n = await lines.count(), seen = asked.get(v.pointer) || 0; asked.set(v.pointer, seen + 1); if (n) await lines.nth(seen % n).tap(); } await page.waitForTimeout(650); } return until(test, 15000, label); };
  const oam = (await sprites()).oam;
  try {
    if (name === 'cross') {
      // A statement takes input once the game has drawn its press prompt.
      const ready = async v => v.process === 6 && v.state === 1 && v.flags & 8 && !(v.flags & 1) && (await drawn(oam.press))?.y === 0;
      let v = await until(ready, 30000, 'a statement with its prompts'); const first = v.section;
      const right = await shown([oam.arrows[1]], 'its ▶ arrow');
      const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('.native-line') ? 'the text line' : el?.className || el?.tagName; }, [box.x + box.width * (right.x + 8) / 240, box.y + box.height * (right.y + 6) / 160]);
      await tapSprite(right); v = await until(async v => await ready(v) && v.section !== first, 15000, 'the next statement'); const second = v.section;
      ok(`the ▶ arrow at the end of the text box moves to the next statement (the tap lands on ${hit})`);
      const left = await shown([oam.arrows[0]], 'a ◀ arrow on a later statement');
      await tapSprite(left); await until(async v => await ready(v) && v.section === first, 15000, 'the first statement again'); ok('the ◀ arrow moves back');
      // The words of the statement are for reading: a tap on them does nothing.
      await tap(120, 132); await page.waitForTimeout(1200); v = await view(); assert.ok(v.process === 6 && v.section === first && v.kind === 'native', JSON.stringify(v)); ok('a tap on the statement text does not move on');
      await tap(120, 60); await until(async v => await ready(v) && v.section === second, 15000, 'the next statement after a tap on the picture'); ok('a tap on the picture moves to the next statement');
      await tapSprite(await shown(oam.present, 'its present prompt')); await until(v => v.process === 7 && v.state === 1, 15000, 'the court record'); ok('the present prompt opens the court record');
      let b = null; for (let k = 0; k < 40 && !b; k++) { b = await native(e => e.recordPrompt('B')); if (!b) await page.waitForTimeout(150); }
      assert.ok(b, 'no B prompt in the record'); await tapSprite(b); await until(ready, 15000, 'the statement after closing the record'); ok('the record\'s own back prompt returns to the statement');
      // Pressing comes last: its conversation can end the cross-examination.
      await tapSprite(await shown(oam.press, 'its press prompt')); await until(v => v.kind === 'text', 20000, 'the press conversation'); ok('the press prompt starts the press conversation');
    }
    if (name === 'investigation') {
      const idle = async v => v.process === 4 && v.state === 1 && !(v.flags & 1) && v.text === 0 && Boolean(await drawn([oam.actions]));
      await readTo(idle, 'the investigation menu');
      const buttons = (await sprites()).list.filter(s => s.i >= oam.actions && s.i < oam.actions + 4);
      // Examine: the button, then a spot on the picture.
      await tapSprite(buttons[0]); await until(v => v.process === 4 && v.state === 6 && v.var1 === 1, 10000, 'the examine pointer'); ok('the examine button opens the pointer');
      assert.ok(await page.locator('.native-tab-back').isVisible(), 'no back tab while examining');
      await tap(120, 60); await until(v => v.kind === 'text', 15000, 'the text for the examined spot'); ok('a tap on the picture examines that spot');
      await readTo(v => v.process === 4 && v.state === 6 && v.var1 === 1 && v.text === 0 && v.kind === 'native', 'the pointer after the text');
      await page.locator('.native-tab-back').tap(); await until(idle, 15000, 'the menu after the back tab'); ok('the back tab leaves the pointer');
      // Move: the button, then a destination plate.
      await tapSprite(buttons[1]); let v = await until(v => v.process === 4 && v.state === 7 && v.var1 === 3, 10000, 'the move menu'); ok('the move button opens the destinations');
      const plate = await drawn([oam.plates]); assert.ok(plate, 'no destination plate');
      const before = await native(e => Array.from(e.ppu.frame.subarray(0, 240 * 100 * 4)).reduce((h, x) => Math.imul(h ^ x, 16777619) >>> 0, 2166136261));
      await tapSprite(plate); await until(async v => v.process === 4 && (v.kind === 'text' || await idle(v)) && v.state !== 7, 25000, 'the new place'); ok('a destination plate moves there');
      await readTo(idle, 'the menu in the new place');
      const after = await native(e => Array.from(e.ppu.frame.subarray(0, 240 * 100 * 4)).reduce((h, x) => Math.imul(h ^ x, 16777619) >>> 0, 2166136261)); assert.notEqual(after, before, 'the picture did not change'); ok('the picture is the new place');
      // The court record from the menu, by the reader's tab, and back.
      // The game takes no input while its menu is still sliding in: tap the tab again if needed, as a person would.
      for (let k = 0; k < 4 && (await view()).process !== 7; k++) { await page.locator('.native-tab-record').tap(); await page.waitForTimeout(1500); }
      await until(v => v.process === 7 && v.state === 1, 10000, 'the court record'); await page.waitForTimeout(600);
      await page.locator('.native-tab-back').tap(); await until(idle, 15000, 'the menu after the record'); ok('the record tab opens the court record and the back tab returns');
    }
    if (name === 'lock') {
      const prompt = async v => v.process === 4 && v.state === 10 && Boolean(await drawn(oam.lockPresent)) && (await drawn(oam.lockPresent)).y === 0;
      await readTo(prompt, 'the lock prompts');
      assert.equal(await page.locator('.native-tab-record').count(), 0, 'a reader record tab over the game\'s own prompt');
      await tapSprite(await drawn(oam.lockPresent)); await until(v => v.process === 7 && v.state === 1, 15000, 'the court record'); ok('the lock\'s present prompt opens the court record');
      let b = null; for (let k = 0; k < 40 && !b; k++) { b = await native(e => e.recordPrompt('B')); if (!b) await page.waitForTimeout(150); }
      assert.ok(b, 'no B prompt in the record'); await tapSprite(b); await until(prompt, 15000, 'the lock prompts again'); ok('the record\'s back prompt returns to the lock');
      await until(async () => (await drawn(oam.lockStop))?.y === 0, 10000, 'the stop prompt'); await tapSprite(await drawn(oam.lockStop));
      await readTo(v => v.process === 4 && v.state !== 10, 'leaving the lock'); ok('the lock\'s stop prompt leaves the lock');
    }
    if (name === 'choice') {
      let v = await until(v => v.kind === 'choice', 30000, 'a choice list'); const lines = page.locator('.native-line'); const n = await lines.count(); assert.ok(n >= 2, `${n} choice lines`);
      const cursor = e => e.machine.read8(e.P.script + e.P.s.cursor) - (e.P.s.cursorBase || 0);
      await lines.nth(1).tap(); await until(v => v.kind !== 'choice', 15000, 'the choice to be taken');
      assert.equal(await native(cursor), 1, 'the game\'s cursor was not on the second option'); ok('a tap on the second line of a choice takes that option');
    }
    if (name === 'save') {
      const plates = async () => { const list = (await sprites()).list; return [list.find(s => s.i === oam.plates + 2), list.find(s => s.i === oam.plates + 3)]; };
      const selected = e => e.machine.read8(e.P.main + e.P.m.selected);
      await until(async v => [10, 13, 14].includes(v.process) && v.flags & 8 && (await plates()).every(Boolean), 30000, 'the prompt with its two plates'); await page.waitForTimeout(800);
      const [yes, no] = await plates(), at = await view();
      await tap((yes.x + yes.w + no.x) / 2, yes.y + yes.h / 2); await tap(120, 40); await page.waitForTimeout(900);
      let v = await view(); assert.ok(v.process === at.process && v.state === at.state, `a stray tap answered the prompt: ${JSON.stringify(v)}`); ok('taps beside the plates do not answer the prompt');
      await tapSprite(no); await until(v => v.process !== at.process || v.state !== at.state, 15000, 'the prompt to be answered');
      assert.equal(await native(selected), 1, 'the second plate was not the one chosen'); ok('a tap on the second plate answers with it');
    }
    if (name === 'detector') {
      const pointer = e => [e.machine.read16(e.P.investigation), e.machine.read16(e.P.investigation + 2)];
      await until(async () => await native(e => e.detecting()), 30000, 'the detector to take input');
      await tap(100, 90); await page.waitForTimeout(500); assert.deepEqual(await native(pointer), [100, 90]); ok('a tap moves the detector there');
      await tap(60, 70); await page.waitForTimeout(500); assert.deepEqual(await native(pointer), [60, 70]); ok('another tap moves it again');
      await tap(62, 72); await until(async v => v.kind === 'text' || !(await native(e => e.detecting())), 15000, 'the game to check the spot'); ok('a tap on the detector checks the spot');
    }
    await page.screenshot({path: path.join(out, `${name}.png`)});
  } catch (error) { await page.screenshot({path: path.join(out, `${name}-failure.png`)}).catch(() => {}); throw error; }
  finally { await context.close(); }
}
try {
  browser = await api.chromium.launch({headless: true});
  for (const [name, file] of jobs) await screen(name, file);
} catch (error) { failed = error; report.errors.push(String(error.stack || error)); console.log(String(error.message || error).slice(0, 600)); }
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
server.kill(); await browser?.close();
process.exit(failed ? 1 : 0);
