// Real-time host for engines that execute original cartridge code (engine.live).
// Owns the frame loop, audio output, and GBA button input. Text/choice boundaries
// found by the engine are handed to the reader's ordinary presentation path.
// Seconds of audio kept queued ahead of playback, the most it may grow to, the most frames
// run in one display tick, and the longest a tick may spend on the machine (milliseconds).
const LEAD = 0.1, LEAD_MAX = 0.3, MAX_FRAMES = 5, TICK_LIMIT = 50;
const KEYMAP = {ArrowUp: 64, ArrowDown: 128, ArrowLeft: 32, ArrowRight: 16, KeyZ: 1, Enter: 1, Space: 1, KeyX: 2, Backspace: 2, KeyA: 512, KeyS: 256, KeyQ: 8, KeyW: 4};

export class LiveHost {
  constructor({ready, busy, boundary, choose, volume, onError, drawn}) {
    this.ready = ready; this.busy = busy || (() => false); this.boundary = boundary; this.choose = choose; this.volume = volume; this.onError = onError; this.drawn = drawn;
    addEventListener('pagehide', () => this.shutdown());
    this.engine = null; this.canvas = null; this.raf = 0; this.last = 0; this.carry = 0; this.audio = null; this.node = null; this.gain = null; this.pending = false;
    // Audio pacing: samples posted to the output, the output's last report of its queue, and
    // the amount of audio kept queued (raised when the device proves to need more).
    this.sent = 0; this.report = null; this.underruns = 0; this.lead = LEAD; this.calm = 0; this.runCost = 0; this.drawCost = 0;
    // Counters for performance checks (read from the canvas element as `liveStats`).
    this.stats = {ticks: 0, frames: 0, drawn: 0, underruns: 0, dropped: 0, lead: LEAD, frameMs: 0, slowTicks: 0, maxTickMs: 0, audio: 'none'};
    addEventListener('visibilitychange', () => { if (document.hidden && this.audio?.state === 'running') this.audio.suspend(); });
  }
  get active() { return Boolean(this.engine); }
  // Taps and keys go to the game while no page is being read, and also while the game has a
  // screen of its own over the page being read (the court record opened from that page).
  get native() { const e = this.engine, kind = e?.current?.kind; return kind === 'native' || (kind === 'text' && Boolean(e.nativeScreen?.())); }
  mount(engine, art) {
    // Scene rebuilds (restores, previous line) remount: keep one canvas and one text layer.
    const generation = this.generation = (this.generation || 0) + 1;
    const cleanup = () => { if (generation === this.generation && this.canvas) this.unmount(this.canvas); };
    if (this.canvas && this.engine === engine) { art.append(this.canvas); this.textKey = ''; this.tabKey = ''; this.start(); return cleanup; }
    if (this.canvas) this.unmount(this.canvas);
    this.engine = engine;
    const canvas = document.createElement('canvas'); canvas.width = 240; canvas.height = 160; canvas.className = 'native-screen live-screen';
    canvas.setAttribute('aria-label', 'Game screen'); this.canvas = canvas; this.ctx = canvas.getContext('2d'); canvas.liveStats = this.stats; canvas.liveEngine = engine; // both for checks from the page
    this.image = new ImageData(new Uint8ClampedArray(engine.ppu.frame.buffer), 240, 160);
    const tabs = document.createElement('div'); tabs.className = 'native-tabs'; this.tabs = tabs; this.tabKey = '';
    const text = document.createElement('div'); text.className = 'native-text'; text.lang = 'ja'; this.text = text; this.textKey = '';
    engine.hideNativeText(true); engine.ppu.onFrame = null; art.append(canvas);
    // Text and tabs sit in the stage itself: #art is composited and hidden from assistive tech.
    // Taps on the game's own text box never advance: that area is for reading and lookup.
    const guard = document.createElement('div'); guard.className = 'native-box-guard'; this.guard = guard;
    guard.addEventListener('click', e => e.stopPropagation());
    guard.addEventListener('pointerup', e => { if (this.engine?.current?.kind === 'choice') { const r = canvas.getBoundingClientRect(); const k = this.engine.choiceAt(Math.floor((e.clientY - r.top) / r.height * 160)); if (k >= 0 && !getSelection()?.toString()) this.choose(String(k)); } else this.boxTap(e); });
    const stage = document.getElementById('stage'); stage.append(guard, text, tabs); this.draw();
    // ?livestats in the address shows the speed counters on the screen, for reports from a device.
    if (new URLSearchParams(location.search).has('livestats')) { this.readout = document.createElement('div'); this.readout.className = 'native-stats'; stage.append(this.readout); this.sample = {...this.stats, at: performance.now()}; }
    this.resize = new ResizeObserver(() => { const r = canvas.getBoundingClientRect(); stage.style.setProperty('--native-unit', `${r.width / 240}px`); });
    this.resize.observe(canvas);
    text.addEventListener('pointerup', e => { if (this.engine?.current?.kind === 'choice' && !getSelection()?.toString()) { const r = canvas.getBoundingClientRect(); const k = this.engine.choiceAt(Math.floor((e.clientY - r.top) / r.height * 160)); if (k >= 0) { e.stopPropagation(); this.choose(String(k)); } } else this.boxTap(e); });
    text.addEventListener('click', e => { if (this.engine?.current?.kind === 'choice') e.stopPropagation(); });
    // The game screen is the controller: taps choose what they touch, swipes browse.
    canvas.addEventListener('pointerdown', e => { if (!this.native) return; this.start0 = {x: e.clientX, y: e.clientY}; });
    canvas.addEventListener('pointerup', e => this.pointer(e));
    canvas.addEventListener('click', e => { if (this.native) e.stopPropagation(); });
    this.start(); return cleanup;
  }
  unmount(canvas) { if (canvas !== this.canvas) return; this.stop(); this.resize?.disconnect(); canvas.remove(); this.tabs?.remove(); this.text?.remove(); this.guard?.remove(); this.readout?.remove(); this.readout = null; this.canvas = null; this.engine = null; }
  // The game's text, drawn as selectable DOM characters on the native 14-pixel grid.
  renderText() {
    // Guard the native text box region whenever it shows text (or a choice list).
    const box = this.engine.textBox?.(); this.guard.hidden = !box;
    if (box) this.guard.style.cssText = `left:0;right:0;top:calc(${box.top} * var(--native-unit));height:calc(${box.height} * var(--native-unit))`;
    const cells = this.engine.textLayer(), key = cells.map(c => `${c.ch}${c.x},${c.y},${c.rgb}`).join('|');
    if (key === this.textKey) return; this.textKey = key;
    const rows = new Map(); for (const c of cells) { if (!rows.has(c.y)) rows.set(c.y, []); rows.get(c.y).push(c); }
    this.text.replaceChildren(...[...rows.entries()].sort((a, b) => a[0] - b[0]).map(([y, list]) => {
      list.sort((a, b) => a.x - b.x); const line = document.createElement('div'); line.className = 'native-line';
      line.style.cssText = `left:calc(${list[0].x} * var(--native-unit));top:calc(${y} * var(--native-unit))`;
      // One continuous text run per row (split only by colour) so words select and scan as words.
      let run = null;
      for (const c of list) {
        if (!run || run.style.color !== c.rgb) { run = document.createElement('span'); run.style.color = c.rgb; line.append(run); }
        run.textContent += c.ch;
      }
      return line;
    }));
  }
  renderTabs() {
    const e = this.engine, list = ['native', 'text'].includes(e.current?.kind) ? e.touchTabs() : [], key = JSON.stringify(list.map(t => [t.id, t.x, t.y])); // a tab can move (record: top-right over text, bottom-right in menus)
    if (key === this.tabKey) return; this.tabKey = key;
    this.tabs.replaceChildren(...list.map(tab => {
      const b = document.createElement('button'); b.type = 'button'; b.className = `native-tab native-tab-${tab.id}`; b.textContent = tab.label;
      b.style.cssText = `left:${tab.x / 2.4}%;top:${tab.y / 1.6}%;width:${tab.w / 2.4}%;height:${tab.h / 1.6}%`;
      b.addEventListener('click', ev => { ev.stopPropagation(); this.engine?.press(tab.mask); });
      return b;
    }));
  }
  // `drawn` tells whoever post-processes the picture (the CRT display) that a new frame is on the canvas.
  draw() { this.ctx?.putImageData(this.image, 0, 0); this.drawn?.(); }
  async startAudio() {
    if (this.audio || !window.AudioContext) return;
    try {
      this.audio = new AudioContext(); await this.audio.audioWorklet.addModule(new URL('./adapters/gba/audio-worklet.js', import.meta.url));
      this.node = new AudioWorkletNode(this.audio, 'gba-output', {outputChannelCount: [2]}); this.gain = this.audio.createGain();
      this.node.port.onmessage = e => this.outputReport(e.data);
      this.node.connect(this.gain).connect(this.audio.destination); this.engine?.apu && this.engine.setAudioRate?.(this.audio.sampleRate);
    } catch (error) { this.audio = null; this.onError?.(`Game audio unavailable: ${error.message}`); }
  }
  // Release the audio device and frame loop when the page goes away.
  shutdown() { this.stop(); try { this.node?.disconnect(); } catch {} }
  start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(t => this.tick(t)); } this.startAudio(); this.audio?.resume?.(); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.audio?.suspend?.(); }
  // The output ran dry since its last report: keep more audio queued from now on.
  outputReport(report) {
    this.report = report; this.stats.dropped = report.dropped;
    if (report.underruns > this.underruns) { this.underruns = report.underruns; this.stats.underruns = report.underruns; this.lead = Math.min(LEAD_MAX, this.lead + 0.04); this.calm = performance.now(); }
    else if (this.lead > LEAD && performance.now() - this.calm > 60000) { this.lead = Math.max(LEAD, this.lead - 0.02); this.calm = performance.now(); } // a clean minute: come back down a step
    this.stats.lead = this.lead;
  }
  // Seconds of audio queued ahead of playback: the output's last reported level, plus what
  // has been posted since, minus what has played since.
  queued() {
    const r = this.report, rate = this.audio.sampleRate;
    if (!r) return this.sent / rate; // nothing reported yet: the output is still collecting its first audio
    return Math.max(0, r.buffered + (this.sent - r.received) - Math.max(0, this.audio.currentTime * rate - r.at)) / rate;
  }
  tick(now) {
    this.raf = requestAnimationFrame(t => this.tick(t));
    const e = this.engine; if (!e) return;
    const elapsed = Math.min(100, now - this.last); this.last = now;
    if (!this.ready()) { if (this.audio?.state === 'running') this.audio.suspend(); return; }
    // While the reader is presenting a page or saving, keep playing but do not report new boundaries.
    const observe = !this.pending && !this.busy();
    if (this.audio?.state === 'suspended') this.audio.resume();
    // Pace emulation by the audio output when sound runs (the machine makes exactly the audio
    // that is played, so there is no drift); otherwise by display time.
    let frames;
    if (this.node && this.audio?.state === 'running') frames = Math.ceil((this.lead - this.queued()) * e.frameRate);
    else { this.carry += elapsed * e.frameRate / 1000; frames = Math.floor(this.carry); this.carry -= frames; }
    frames = Math.max(0, Math.min(MAX_FRAMES, frames));
    const stats = this.stats, started = performance.now(); stats.ticks++;
    let ran = 0, drawn = false;
    try {
      while (ran < frames) {
        // Only the last frame of a tick is shown, so only that one is drawn: a slow device
        // keeps its sound whole and shows fewer pictures. A tick stops early when there is
        // no time left for another undrawn frame before the drawn one.
        const spent = performance.now() - started, last = ran === frames - 1 || spent + this.runCost + this.drawCost > TICK_LIMIT;
        e.machine.skipRender = !last;
        const t = performance.now(), result = e.frame(observe), cost = performance.now() - t; ran++;
        if (last) this.drawCost += (cost - this.drawCost) * 0.1; else this.runCost += (cost - this.runCost) * 0.1;
        if (last) drawn = true;
        if (result) { this.pending = true; Promise.resolve(this.boundary(result)).finally(() => { this.pending = false; }); break; }
        if (last) break;
      }
    } catch (error) { e.machine.skipRender = false; this.stop(); this.onError?.(error.message); return; }
    e.machine.skipRender = false;
    if (ran) {
      if (drawn) { this.draw(); stats.drawn++; }
      this.renderText(); if (e.machine.frame % 6 < ran) this.renderTabs();
      const samples = e.apu.drain();
      if (this.node && samples.length && this.audio?.state === 'running') { this.gain.gain.value = this.volume(); this.sent += samples.length / 2; this.node.port.postMessage(samples, [samples.buffer]); }
    }
    const took = performance.now() - started; stats.frames += ran; stats.frameMs = this.drawCost; stats.audio = this.node ? this.audio.state : 'none';
    if (took > stats.maxTickMs) stats.maxTickMs = took; if (took > 1000 / 60) stats.slowTicks++;
    if (this.readout && now - this.sample.at >= 1000) {
      const a = this.sample, seconds = (now - a.at) / 1000;
      this.readout.textContent = `${((stats.frames - a.frames) / seconds).toFixed(0)} fps · drawn ${((stats.drawn - a.drawn) / seconds).toFixed(0)} · ${this.drawCost.toFixed(1)} ms · underruns ${stats.underruns} · lead ${Math.round(this.lead * 1000)} ms · ${stats.audio}`;
      this.sample = {...stats, at: now};
    }
  }
  key(event, down) {
    if (!this.engine || event.ctrlKey || event.altKey || event.metaKey) return false;
    const mask = KEYMAP[event.code]; if (!mask) return false;
    // Text pages and choices keep the reader's own keys; everything else is native input.
    if (!this.native) return false;
    event.preventDefault(); this.engine.hold(mask, down); return true;
  }
  // A tap inside the text box area. That area is for reading, so it never continues the
  // game; but controls the game draws there (a statement's arrows at the ends of the box, the
  // record's R prompt just above a page's name tag) still take the tap.
  boxTap(event) {
    const e = this.engine; if (!e || !this.native || getSelection()?.toString()) return;
    const r = this.canvas.getBoundingClientRect();
    e.touch(Math.floor((event.clientX - r.left) / r.width * 240), Math.floor((event.clientY - r.top) / r.height * 160), true);
  }
  pointer(event) {
    const e = this.engine, start = this.start0; this.start0 = null;
    if (!e || !this.native || !start) return;
    const r = this.canvas.getBoundingClientRect(), dx = event.clientX - start.x, dy = event.clientY - start.y;
    if (Math.abs(dx) > r.width * 0.12 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.swipe(dx < 0 ? -1 : 1); return; }
    e.touch(Math.floor((event.clientX - r.left) / r.width * 240), Math.floor((event.clientY - r.top) / r.height * 160));
  }
}
