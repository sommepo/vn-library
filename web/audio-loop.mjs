// Loop-point assets have an intro that plays once then a body that repeats; a
// seek drives that instead of native audio.loop (which would replay the intro).
// vnLoop keeps the loop intent for snapshots, separate from the transport flag.
export function applyLoop(audio, asset, loop, play) {
  audio.playbackRate = asset.playbackRate || 1;
  audio.vnLoop = loop;
  audio.ontimeupdate = null;
  audio.onended = null;
  if (loop && Number.isFinite(asset.loopStart) && Number.isFinite(asset.loopEnd) && asset.loopEnd > asset.loopStart) {
    audio.loop = false;
    audio.ontimeupdate = () => {
      if (audio.currentTime >= asset.loopEnd) audio.currentTime = asset.loopStart + (audio.currentTime - asset.loopEnd) % (asset.loopEnd - asset.loopStart);
    };
    audio.onended = () => { audio.currentTime = asset.loopStart; play(audio); };
  } else {
    audio.loop = loop;
  }
}
export function snapshotLoop(audio) { return audio.vnLoop; }
export function isOneShot(loop) { return loop !== true; }
export function releaseLoop(audio) { audio.ontimeupdate = null; audio.onended = null; }
