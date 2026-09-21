/* Execute the current route; never scan text or jump to a guessed script offset. */
const passable = new Set(['text', 'pause', 'wait']);
const stops = new Set(['choice', 'end', 'movie', 'sound', 'setup']);
export class NavigationCancelled extends Error {
  constructor() { super('Next-choice navigation cancelled'); this.name = 'NavigationCancelled'; }
}

// Keep only persistent audio. One-shot sounds and voices passed during a seek
// were never presented and must not play in a burst at the destination.
export function retainLoops(loops, effects) {
  for (const effect of effects || []) {
    if (effect.op === 'stopSound') {
      loops = loops.filter(sound => !(effect.channel === 'effects' ||
        (effect.channel && sound.channel === effect.channel) || sound.asset === effect.asset));
    } else if (effect.op === 'sound' && effect.loop === true) {
      loops.push({ asset: effect.asset, channel: effect.channel, time: 0, paused: false, loop: true });
    }
  }
  return loops;
}

// Caller owns rollback/persistence and UI locking. No activity or text-output
// callbacks are invoked here: unpresented narrative stays unread and unexported.
export async function seekNextChoice(engine, {
  cancelled = () => false, onProgress = () => {}, loops = [],
  yieldEvery = 8, maxSteps = 20000,
  yieldControl = () => new Promise(resolve => setTimeout(resolve, 0)),
} = {}) {
  loops = structuredClone(loops).filter(sound => sound.loop);
  let steps = 0, skippedSegments = 0, first = true;
  for (;;) {
    if (cancelled()) throw new NavigationCancelled();
    const p = engine.current;
    if (stops.has(p?.kind)) return { pending: p, effects: [], loops, skippedSegments, steps };
    if (!passable.has(p?.kind)) throw new Error(`${p?.id || 'Current position'}: cannot seek through ${p?.kind || 'missing presentation'}`);
    if (steps >= maxSteps) throw new Error(`Next choice was not reached within ${maxSteps} presentation boundaries. Nothing was skipped permanently.`);
    if (!first && (p.kind === 'text' || p.presentation?.kind === 'text')) skippedSegments++;
    first = false;
    const result = await engine.advance();
    loops = retainLoops(loops, result.effects);
    steps++;
    if (steps % yieldEvery === 0) {
      onProgress({ steps, skippedSegments });
      await yieldControl();
    }
  }
}
