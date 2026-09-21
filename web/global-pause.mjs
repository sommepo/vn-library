// Playback intent is separate from temporary suspension, including save snapshots.
export class GlobalPause {
  paused = false;
  pending = new Map();
  source(media) { return media.src || media.querySelector?.('source')?.src || ''; }
  request(media) {
    if (!this.paused) return true;
    this.pending.set(media,this.source(media));media.pause();return false;
  }
  suspend(media) {
    this.paused=true;
    for(const item of media)if(!item.paused&&!item.ended){this.pending.set(item,this.source(item));item.pause();}
  }
  savedPaused(media) { return this.pending.get(media)===this.source(media) ? false : media.paused; }
  resume(media,play) {
    this.paused=false;
    for(const item of media)if(!item.ended&&this.pending.get(item)===this.source(item))play(item);
    this.pending.clear();
  }
}
