import { isOneShot, releaseLoop, snapshotLoop } from './audio-loop.mjs';

export function snapshotEffects(effects, savedPaused) {
  return [...effects].filter(audio => !audio.ended).map(audio => ({
    asset: audio.vnAsset,
    ...(audio.vnChannel ? { channel: audio.vnChannel } : {}),
    time: audio.currentTime || 0,
    paused: savedPaused(audio),
    loop: snapshotLoop(audio),
  }));
}

export function clearEffects(effects) {
  for (const audio of effects) {
    audio.pause();
    releaseLoop(audio);
  }
  effects.clear();
}

export function startEffect(effects, effect, services) {
  if (!services.hasAsset(effect.asset)) throw new Error(`Saved effect unavailable: ${effect.asset}`);
  const audio = services.createAudio(services.mediaURL(effect.asset));
  audio.vnAsset = effect.asset;
  audio.vnChannel = effect.channel;
  services.configure(audio, effect.asset, effect.loop === true);
  audio.volume = services.volume;
  effects.add(audio);
  if (effect.time != null) services.seek(audio, effect.time);
  if (isOneShot(effect.loop)) audio.addEventListener('ended', () => effects.delete(audio), { once: true });
  if (!effect.paused) services.play(audio);
  return audio;
}

export function restoreEffects(effects, saved, services) {
  clearEffects(effects);
  return (saved || []).map(effect => startEffect(effects, effect, services));
}

export function stopEffects(effects, effect) {
  for (const audio of effects) {
    if (effect.channel === 'effects' ||
        (effect.channel && audio.vnChannel === effect.channel) ||
        audio.vnAsset === effect.asset) {
      audio.pause();
      releaseLoop(audio);
      effects.delete(audio);
    }
  }
}
