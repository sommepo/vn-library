// Event 10's source phases: lower actor, hold alternate image, rotate until
// input, then retire within the original safe angular interval. 60 Hz clock.
export const swingFrame = (data, elapsed) => Math.floor(elapsed * 60 / 1000) % data.cycle_frames;
export function swingFinishDuration(data, elapsed) {
  const frame=swingFrame(data,elapsed);
  for(let n=1;n<=data.cycle_frames;n++)if((frame+n)%data.cycle_frames>=data.exit_frames[0]&&(frame+n)%data.cycle_frames<=data.exit_frames[1])return n*1000/60;
  throw new Error('Invalid native swing retirement interval');
}
export function mountSwing(art,engine,mediaURL,playEffect) {
  const task=engine.state.scene.task;if(task?.id!=='clannad-swing')return null;
  const data=engine.content.nativeData.events[task.event],phase=task.phase;let image;
  const layers=[...art.querySelectorAll('.scene-layer')];
  if(['hold','spin','finish'].includes(task.phase)){
    image=document.createElement('img');image.src=mediaURL(data.asset);image.alt='';image.className='native-swing';
    const a=engine.content.assets[data.asset];
    image.style.cssText=`position:absolute;pointer-events:none;left:0;top:${(data.hold_position[1]-a.height)/448*100}%;width:100%;height:${a.height/448*100}%;transform-origin:${data.pivot[0]/a.width*100}% ${data.pivot[1]/a.height*100}%;`;
    art.append(image);
  }
  let raf=null,started=null,lastElapsed=task.elapsedMs||0;
  const draw=elapsed=>{
    if(task.phase==='lower'){
      const offset=Math.min(data.lower_pixels,Math.floor(Math.floor(elapsed*60/1000)*data.lower_pixels/data.lower_frames))*data.y_scale;
      layers.forEach((l,n)=>{l.style.top=`${engine.state.scene.layers[n].y+offset/448*100}%`;});
    }
    if(image&&['spin','finish'].includes(task.phase)){
      image.style.top=`${(data.spin_position[1]-data.pivot[1])/448*100}%`;
      image.style.transform=`rotate(${swingFrame(data,elapsed)*data.angle_units_per_frame*data.radians_per_unit*180/Math.PI}deg)`;
      const tick=Math.floor(elapsed*60/1000),prior=Math.floor(lastElapsed*60/1000);
      if(Math.floor((tick-data.sound_frame)/data.cycle_frames)>Math.floor((prior-data.sound_frame)/data.cycle_frames))playEffect?.({op:'sound',asset:data.sound_asset,channel:'native-swing'});
    }
    lastElapsed=elapsed;
  };
  const tick=now=>{if(started===null||task.phase!==phase)return;task.elapsedMs=now-started;draw(task.elapsedMs);raf=requestAnimationFrame(tick);};
  // The VM may already have changed this same task object to its next phase.
  // Disposing the old drawing must not overwrite that phase's fresh clock.
  const cleanup=()=>{if(started!==null&&task.phase===phase)task.elapsedMs=performance.now()-started;cancelAnimationFrame(raf);started=null;};
  cleanup.pause=cleanup;
  cleanup.resume=()=>{if(started!==null||task.phase!==phase||!['lower','spin','finish'].includes(task.phase))return;started=performance.now()-(task.elapsedMs||0);raf=requestAnimationFrame(tick);};
  if(image)cleanup.ready=image.decode();
  draw(lastElapsed);return cleanup;
}
