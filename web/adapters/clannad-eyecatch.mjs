// Native six-stage interlude: original background, animated crop and final fade.
const cache=new WeakMap();
export function eyecatchFrames(data){
 if(cache.has(data))return cache.get(data);
 let stage=0,counter=0,strip=-1,alpha=0,overlay=0;const frames=[];
 for(let tick=0;tick<3600;tick++){
  let done=false;
  switch(stage){
   case 0:if(counter>=data.wait_frames[0]){stage++;counter=0;}break;
   case 1:alpha=Math.fround(alpha+data.fade_steps[0]);if(alpha>=1){alpha=1;stage++;}break;
   case 2:strip++;if(strip>=data.strip_last_counter){stage++;counter=0;}break;
   case 3:if(counter>=data.wait_frames[1]){stage++;counter=0;}break;
   case 4:overlay=Math.fround(overlay+data.fade_steps[1]);if(overlay>=1){overlay=1;stage++;counter=0;}break;
   case 5:if(counter>=data.wait_frames[2])done=true;break;
  }
  counter++;frames.push({alpha,overlay,row:strip<0?-1:Math.trunc(strip/2),final:stage===5});
  if(done){cache.set(data,frames);return frames;}
 }
 throw new Error('Native interlude timeline exceeded its bound');
}
export const eyecatchDuration=data=>eyecatchFrames(data).length*1000/60;
export function mountEyecatch(art,engine){
 const task=engine.state.scene.task;if(task?.id!=='clannad-eyecatch')return null;
 const data=engine.content.nativeData.events[task.event],variant=data.variants[task.variant],frames=eyecatchFrames(data),duration=eyecatchDuration(data);
 const view=engine.presentationViewport;
 const image=id=>{const img=new Image();img.alt='';img.src=new URL(engine.content.assets[id].url,engine.baseURL);return img;};
 const overlay=document.createElement('div');overlay.className='clannad-eyecatch';overlay.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:50;overflow:hidden';
 const bg=image(variant.background);bg.style.cssText='position:absolute;left:0;top:0;width:100%;height:100%';
 const crop=document.createElement('div'),strip=image(variant.strip),[x,y,right,bottom]=data.crop,w=right-x,h=bottom-y;
 crop.style.cssText=`position:absolute;overflow:hidden;left:${data.position[0]/view.width*100}%;top:${data.position[1]/view.height*100}%;width:${w/view.width*100}%;height:${h/view.height*100}%`;
 strip.style.cssText=`position:absolute;left:${-x/w*100}%;width:${engine.content.assets[variant.strip].width/w*100}%;height:${engine.content.assets[variant.strip].height/h*100}%`;crop.append(strip);
 const fade=document.createElement('div');fade.style.cssText=`position:absolute;inset:0;background:${variant.white?'white':'black'}`;
 overlay.append(bg,crop,fade);art.append(overlay);
 let frame=null,started=null;
 const draw=elapsed=>{const f=frames[Math.min(frames.length-1,Math.floor(elapsed*60/1000))];bg.style.opacity=f.alpha;fade.style.opacity=f.overlay;crop.style.display=f.row<0?'none':'';strip.style.top=`${-(f.row*h+y)/h*100}%`;};
 const tick=now=>{if(started===null)return;draw(Math.min(duration,now-started));frame=requestAnimationFrame(tick);};
 const pause=()=>{cancelAnimationFrame(frame);started=null;};
 const cleanup=()=>{pause();overlay.remove();};cleanup.pause=pause;
 cleanup.resume=()=>{if(started!==null)return;started=performance.now()-(duration-engine.current.remainingMs);frame=requestAnimationFrame(tick);};
 draw(duration-engine.current.remainingMs);return cleanup;
}
