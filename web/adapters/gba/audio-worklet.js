// Plays interleaved stereo float chunks posted by the live host; bounded latency.
// Running dry is made quiet rather than crackly: the last samples fade out, playback waits
// until a little audio has built up again, then fades back in. The processor reports its
// queue level so the host can pace the machine by what is really buffered.
const FADE = 256, REPORT = 1024;
class GBAOutput extends AudioWorkletProcessor {
  constructor() {
    super(); this.queue = []; this.offset = 0; this.buffered = 0; this.received = 0;
    this.gain = 0; this.waiting = true; this.started = false; this.underruns = 0; this.dropped = 0; this.sinceReport = 0;
    this.port.onmessage = e => {
      this.queue.push(e.data); this.buffered += e.data.length / 2; this.received += e.data.length / 2;
      // Keep latency bounded if the host ever runs ahead.
      while (this.buffered > sampleRate * 0.5 && this.queue.length > 1) { const d = this.queue.shift(), n = (d.length - this.offset) / 2; this.buffered -= n; this.dropped += n; this.offset = 0; }
    };
  }
  process(inputs, outputs) {
    const [l, r] = outputs[0], n = l.length;
    if (this.waiting && this.buffered >= sampleRate * 0.04) { this.waiting = false; this.started = true; }
    for (let i = 0; i < n; i++) {
      const chunk = this.waiting ? null : this.queue[0];
      if (!chunk) { l[i] = r[i] = 0; if (!this.waiting) { this.waiting = true; this.gain = 0; if (this.started) this.underruns++; } continue; }
      const limit = this.buffered < FADE ? this.buffered / FADE : 1; this.gain = Math.min(limit, this.gain + 1 / FADE);
      l[i] = chunk[this.offset] * this.gain; r[i] = chunk[this.offset + 1] * this.gain; this.offset += 2; this.buffered--;
      if (this.offset >= chunk.length) { this.queue.shift(); this.offset = 0; }
    }
    if ((this.sinceReport += n) >= REPORT) { this.sinceReport = 0; this.port.postMessage({buffered: this.buffered, received: this.received, at: currentFrame + n, underruns: this.underruns, dropped: this.dropped}); }
    return true;
  }
}
registerProcessor('gba-output', GBAOutput);
