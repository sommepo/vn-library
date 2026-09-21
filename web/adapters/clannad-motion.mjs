// Source BIN motion table, sampled on the native 60 Hz clock. Artwork is unchanged.
export function motionDuration(data){return Math.ceil(data.frames.reduce((s,f)=>s+f.ms,0)*60/1000)*1000/60;}
export function motionX(data,elapsed){
 const nativeTime=Math.floor(elapsed*60/1000)*1000/60;let cumulative=0,x=0;
 for(const frame of data.frames){if(frame.x!=null)x=frame.x;cumulative+=frame.ms;if(nativeTime<cumulative)break;}
 return x;
}
export function rotationDuration(data){return data.duration_frames*1000/60;}
export function rotationAngle(data,elapsed){
 const frame=Math.min(data.duration_frames-1,Math.floor(elapsed*60/1000));
 return frame<=data.hold_frames?0:(frame-data.hold_frames)*data.angle_units_per_frame*data.radians_per_unit*180/Math.PI;
}
export function mountMotion(art,engine){
 const task=engine.state.scene.task;if(!['clannad-motion','clannad-rotation'].includes(task?.id))return null;
 const rotate=task.id==='clannad-rotation';
 const data=engine.content.nativeData.events[task.event],duration=rotate?rotationDuration(data):motionDuration(data),layers=[...art.querySelectorAll('.scene-layer')];
 let frame=null,started=null;
 const draw=elapsed=>{for(const layer of layers){
  if(rotate){layer.style.transformOrigin='100% 100%';layer.style.transform=`rotate(${rotationAngle(data,elapsed)}deg)`;}
  else layer.style.marginLeft=`${motionX(data,elapsed)/640*100}%`;
 }};
 const tick=now=>{if(started===null)return;draw(Math.min(duration,now-started));frame=requestAnimationFrame(tick);};
 const cleanup=()=>{cancelAnimationFrame(frame);started=null;};
 cleanup.pause=cleanup;
 cleanup.resume=()=>{if(started!==null)return;started=performance.now()-(duration-engine.current.remainingMs);frame=requestAnimationFrame(tick);};
 draw(duration-engine.current.remainingMs);return cleanup;
}
