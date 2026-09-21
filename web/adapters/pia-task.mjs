/* SLPS-25222 CG129 controller: _Ntakako129Ctrl 0x1e0860.
 * Original code, original assets supplied by the private import. */
const clamp=(value,lo=0,hi=1)=>Math.min(hi,Math.max(lo,value));
const lerp=(a,b,t)=>a+(b-a)*clamp(t);
export const TASK_FRAMES={0:32,1:129,2:48,3:16,4:96,5:128,'-1':64};
export const initialTaskPose=()=>({horizontal:true,vertical:false,near:true,far:false,
  nearAlpha:1,horizontalAlpha:1,mx:640,my:10,tx:640,ty:145,scale:2});

/** Serializable source-coordinate composition at a nominal NTSC scheduler frame. */
export function taskPose(task,frame=task.frame) {
  const p=structuredClone(task.from),f=clamp(frame,0,task.durationFrames),a=task.action;
  p.black=0;
  if(a===0){p.visible=f>=16;p.black=f<16?f/16:1-(f-16)/16;}
  else if(a===1){
    p.mx=lerp(p.mx,-117,f/48);p.tx=lerp(p.tx,11,(f-48)/16);
    // The native alternates a decaying 32-pixel shake at state0x240.
    const shakeFrame=Math.floor(clamp(f-64,0,65));
    const shake=shakeFrame%2===0?Math.max(0,32-Math.floor(shakeFrame/2)):0;
    if(f>=64&&f<129){p.my+=shake;p.ty+=shake;p.shake=shake;}
  } else if(a===2)p.my=lerp(p.my,p.my+8,f/48);
  else if(a===3){p.nearAlpha=1-clamp(f/16);if(f>=16)p.near=false;}
  else if(a===4){
    p.vertical=true;p.horizontalAlpha=1-clamp(f/48);
    if(f>=48){p.horizontal=false;p.far=true;p.mx=lerp(256,320,(f-48)/48);
      p.my=lerp(652,64,(f-48)/48);p.scale=lerp(2,1.5,(f-48)/48);
      p.tx=154;p.ty=lerp(652,64,(f-48)/48);}
  } else if(a===5){p.mx=lerp(p.mx,480,f/128);p.my=lerp(p.my,652,f/128);p.scale=lerp(p.scale,1,f/128);}
  else if(a===-1)p.black=clamp(f/64);
  return p;
}

/** Mount adapter-owned graphics; return an idempotent cleanup function.
 * task.frame and ambientFrame update in-place so saves retain the animation phase.
 * No dialogue is drawn here. Assets and text remain owned by the import/reader. */
export function mountScene(task,art,mediaURL) {
  if(!task)return ()=>{};
  if(task.type!=='pia-takako129'||task.version!==1)throw new Error('Unsupported Pia presentation task');
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;
  canvas.className='pia-presentation-task';canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:30';
  art.append(canvas);const context=canvas.getContext('2d'),images={};let stopped=false,raf=null,last=null;
  const cleanup=()=>{stopped=true;if(raf!==null)cancelAnimationFrame(raf);canvas.remove();};
  const ready=Promise.all(Object.entries(task.assets).map(([key,id])=>new Promise((resolve,reject)=>{
    const img=new Image();img.onload=()=>{
      // GS RGBA uses 0x80 as unity opacity; preserve file pixels and convert only
      // this graphics surface's alpha, matching _NbodyLoadImageAndOamSet blending.
      if(!key.startsWith('BG')){
        const surface=document.createElement('canvas');surface.width=img.width;surface.height=img.height;
        const ctx=surface.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,img.width,img.height);
        for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=Math.min(255,Math.round(pixels.data[i]*255/128));
        ctx.putImageData(pixels,0,0);images[key]=surface;
      }else images[key]=img;
      resolve();
    };img.onerror=()=>reject(new Error(`Original task asset unavailable: ${id}`));img.src=mediaURL(id);
  })));
  const body=(key,x,y,alpha=1,scale=1)=>{context.globalAlpha=clamp(alpha);const img=images[key];context.drawImage(img,x,y,img.width*scale,img.height*scale);};
  function draw(){
    context.clearRect(0,0,640,480);const p=taskPose(task),ambient=task.ambientFrame||0;
    if(p.visible!==false){
      if(p.vertical)for(const [speed,alpha]of[[8,1],[16,.5]]){
        context.globalAlpha=alpha;
        for(let i=0;i<6;i++){const y=(ambient*speed+i*240)%1440-240;
          if(y>=-240&&y<=480)context.drawImage(images.BGV,0,i*120,320,120,0,y,640,240);}
      }
      if(p.horizontal)for(const[speed,alpha]of[[8,1],[16,.5]]){
        context.globalAlpha=alpha*p.horizontalAlpha;
        for(let i=0;i<15;i++){const x=(ambient*speed+i*128)%1920-128;
          if(x>=-128&&x<=640)context.drawImage(images.BGH,i*64,0,64,240,x,-16+(p.shake||0)/2,128,498);}
      }
      if(p.near){body('MN',p.mx,p.my,p.nearAlpha);body('MT',p.tx,p.ty,p.nearAlpha);}
      if(p.far){body('ON',p.mx,p.my,1,p.scale);body('OT',p.tx,p.ty);}
    }
    if(p.black>0){context.globalAlpha=p.black;context.fillStyle='#000';context.fillRect(0,0,640,480);}
    context.globalAlpha=1;
  }
  const tick=now=>{
    if(stopped)return;
    if(last!==null&&!document.hidden){const frames=Math.max(0,Math.min(now-last,1000))*60/1000;
      if(task.active)task.frame=Math.min(task.durationFrames,task.frame+frames);
      task.ambientFrame=(task.ambientFrame||0)+frames;}
    last=now;draw();raf=requestAnimationFrame(tick);
  };
  ready.then(()=>{if(!stopped)raf=requestAnimationFrame(tick);}).catch(error=>{
    if(stopped)return;canvas.dispatchEvent(new CustomEvent('vnkit-media-error',{bubbles:true,detail:error.message}));
  });
  cleanup.ready=ready;
  return cleanup;
}
