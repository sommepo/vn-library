export class MenuMusic {
  constructor(audio, storage) {
    this.audio=audio;this.storage=storage;this.active=false;this.pending=false;this.blocked=false;
    let saved={};try{saved=JSON.parse(storage.getItem('vnkit.menuMusic')||'{}');}catch{}
    this.volume=Number.isFinite(saved?.volume)?Math.max(0,Math.min(1,saved.volume)):.20;
    this.muted=saved?.muted===true;
    audio.src='/media/nova-mistero.mp3';audio.loop=true;audio.preload='none';
    this.apply();
  }
  apply(){this.audio.volume=this.volume;this.audio.muted=this.muted;}
  save(){try{this.storage.setItem('vnkit.menuMusic',JSON.stringify({volume:this.volume,muted:this.muted}));}catch{}}
  setVolume(value){this.volume=Math.max(0,Math.min(1,Number(value)||0));this.apply();this.save();this.sync(this.active);}
  setMuted(value){this.muted=Boolean(value);this.apply();this.save();this.sync(this.active);}
  sync(active){
    this.active=active;
    if(!active||this.muted||!this.volume){this.audio.pause();return;}
    if(this.pending||!this.audio.paused)return;
    this.pending=true;
    Promise.resolve(this.audio.play()).then(()=>{this.blocked=false;}).catch(error=>{this.blocked=error.name==='NotAllowedError';}).finally(()=>{
      this.pending=false;if(!this.active||this.muted||!this.volume)this.audio.pause();this.onChange?.();
    });
  }
}
