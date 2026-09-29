/* A source cue can finish before its waveform or ambience loop ends. */
export function soundWaitActive(wait, media) {
  if (!wait) return false;
  const until = wait.untilSeconds;
  if (until != null && (!Number.isFinite(until) || until < 0 || until > 600)) {
    throw new Error('Invalid source audio cue boundary');
  }
  return [...media].some(a => a.vnAsset === wait.asset && a.vnChannel === wait.channel &&
    !a.ended && !a.error && (until == null || a.currentTime < until));
}
