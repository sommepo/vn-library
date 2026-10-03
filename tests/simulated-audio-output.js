// Browser init script for hosts without a sound device: a stand-in AudioContext whose
// output is consumed in real time by the page's own worklet processor code, run here on
// a simulated audio clock. Samples count as available only from the moment they were
// posted, so a stalled main thread starves the output exactly as a real device would.
(() => {
  const RATE = 48000, QUANTUM = 128, registry = {};
  let frame = 0, posted = [], creating = null;
  Object.defineProperty(globalThis, 'sampleRate', {value: RATE, configurable: true});
  Object.defineProperty(globalThis, 'currentFrame', {get: () => frame, configurable: true});
  globalThis.AudioWorkletProcessor = class { constructor() { this.port = {onmessage: null, postMessage: data => { const node = creating; setTimeout(() => node.port.onmessage?.({data}), 0); }}; } };
  globalThis.registerProcessor = (name, cls) => { registry[name] = cls; };
  class Context {
    constructor() { this.sampleRate = RATE; this.state = 'running'; this.destination = {}; this.nodes = []; this.origin = performance.now(); this.paused = 0; this.pausedAt = 0; this.baseLatency = 0.01; this.outputLatency = 0.05;
      // The processor file runs as an ordinary same-origin script (the page's policy allows no eval).
      this.audioWorklet = {addModule: url => new Promise((resolve, reject) => { const el = document.createElement('script'); el.src = String(url); el.onload = () => resolve(); el.onerror = () => reject(Error('processor script failed to load')); document.head.append(el); })};
      setInterval(() => this.currentTime, 50); Context.last = this; }
    // Reading the clock runs the output up to now.
    get currentTime() {
      const now = this.state === 'running' ? performance.now() : this.pausedAt, due = Math.floor((now - this.origin - this.paused) / 1000 * RATE / QUANTUM) * QUANTUM;
      while (frame < due) {
        const at = this.origin + this.paused + frame / RATE * 1000; // when this quantum plays
        for (const node of this.nodes) {
          while (posted.length && posted[0].node === node && posted[0].time <= at) node.processor.port.onmessage?.({data: posted.shift().data});
          creating = node; node.processor.process([], [[new Float32Array(QUANTUM), new Float32Array(QUANTUM)]]);
        }
        frame += QUANTUM;
      }
      return frame / RATE;
    }
    async suspend() { if (this.state === 'running') { this.currentTime; this.pausedAt = performance.now(); this.state = 'suspended'; } }
    async resume() { if (this.state === 'suspended') { this.paused += performance.now() - this.pausedAt; this.state = 'running'; } }
    createGain() { return {gain: {value: 1}, connect: target => target}; }
    async close() { this.state = 'closed'; }
  }
  globalThis.AudioContext = Context;
  globalThis.AudioWorkletNode = class {
    constructor(context, name) {
      creating = this; this.processor = new registry[name](); context.nodes.push(this);
      this.port = {onmessage: null, postMessage: data => posted.push({node: this, data, time: performance.now()})};
    }
    connect(target) { return target; }
    disconnect() {}
  };
})();
