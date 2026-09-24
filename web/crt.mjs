import {vertex,blur,screen} from './crt-shaders.mjs';
import {CRT_KEY,CRT_DEFAULTS,CRT_RANGES,normalizeCRT,crtOutputSize} from './crt-settings.mjs';

// Capture the reader's graphics plane, never dialogue or hidden script content.
// The supported graphics contract is positioned image/div trees, clipped atlases,
// opacity, 2D transforms and the reader's source-alpha filter. Movies bypass it.
export class SceneCapture {
 constructor(){this.canvas=document.createElement('canvas');this.ctx=this.canvas.getContext('2d',{alpha:false});this.alphaImages=new Map();this.alphaBytes=0;}
 image(node,style){
  const tint=node.dataset.tint?JSON.parse(node.dataset.tint):null,alpha=style.filter.includes('source-alpha');
  if(!alpha&&!tint)return node;
  const key=`${node.currentSrc}:${node.naturalWidth}:${node.naturalHeight}:${alpha}:${node.dataset.tint||''}`,cached=this.alphaImages.get(key);
  if(cached){this.alphaImages.delete(key);this.alphaImages.set(key,cached);return cached;}
  const adjusted=document.createElement('canvas');adjusted.width=node.naturalWidth;adjusted.height=node.naturalHeight;
  const c=adjusted.getContext('2d');c.drawImage(node,0,0);
  const pixels=c.getImageData(0,0,adjusted.width,adjusted.height);
  for(let i=0;i<pixels.data.length;i+=4){if(alpha)pixels.data[i+3]=Math.min(255,pixels.data[i+3]*1.9921875);if(tint)for(let j=0;j<3;j++)pixels.data[i+j]*=tint[j];}
  c.putImageData(pixels,0,0);
  const bytes=adjusted.width*adjusted.height*4,limit=32*1024*1024;
  if(bytes<=limit){
   while(this.alphaImages.size&&(this.alphaBytes+bytes>limit||this.alphaImages.size>=64)){
    const oldest=this.alphaImages.keys().next().value,image=this.alphaImages.get(oldest);
    this.alphaBytes-=image.width*image.height*4;this.alphaImages.delete(oldest);
   }
   this.alphaImages.set(key,adjusted);this.alphaBytes+=bytes;
  }
  return adjusted;
 }
 draw(root,viewport){
  const c=this.ctx,w=Math.round(viewport[0]),h=Math.round(viewport[1]);
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  c.setTransform(1,0,0,1,0,0);c.globalAlpha=1;c.fillStyle='#000';c.fillRect(0,0,w,h);
  // Keep percentage layout in source pixels. offsetLeft/clientWidth round CSS
  // pixels: at a scaled viewport that moves a face patch relative to its body.
  const rootStyle=getComputedStyle(root),sx=w/parseFloat(rootStyle.width),sy=h/parseFloat(rootStyle.height);
  const length=(inline,computed,parent,scale)=>{
   const value=inline?.trim();
   const n=value?.endsWith('%')?parseFloat(value)*parent/100:(parseFloat(computed)||0)*scale;
   return Math.abs(n-Math.round(n))<1e-6?Math.round(n):n;
  };
  c.save();
  const paintChildren=(parent,pw,ph)=>{
   const children=[...parent.children].filter(n=>n instanceof HTMLElement&&!n.matches('.crt-screen,.native-screen'));
   children.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
   for(const node of children){
    const s=getComputedStyle(node);if(s.display==='none')continue;
    const width=length(node.style.width,s.width,pw,sx),height=length(node.style.height,s.height,ph,sy);if(!width||!height)continue;
    c.save();try{c.translate(length(node.style.left,s.left,pw,sx),length(node.style.top,s.top,ph,sy));
    if(s.transform!=='none'){
     const origin=s.transformOrigin.split(' '),rawOrigin=node.style.transformOrigin.split(' '),m=new DOMMatrix(s.transform);
     const ox=length(rawOrigin[0],origin[0],width,sx),oy=length(rawOrigin[1],origin[1],height,sy);
     if(!m.is2D)throw new Error('This scene uses a 3D transform; original artwork is shown.');
     c.translate(ox,oy);c.transform(m.a,m.b*sy/sx,m.c*sx/sy,m.d,m.e*sx,m.f*sy);c.translate(-ox,-oy);
    }
    c.globalAlpha*=Number(s.opacity);
    if(['hidden','clip'].includes(s.overflow)||['hidden','clip'].includes(s.overflowX)){c.beginPath();c.rect(0,0,width,height);c.clip();}
    if(s.backgroundColor!=='rgba(0, 0, 0, 0)'&&s.backgroundColor!=='transparent'){c.fillStyle=s.backgroundColor;c.fillRect(0,0,width,height);}
    if(node instanceof HTMLImageElement){
     if(!node.complete||!node.naturalWidth)throw new Error('Artwork is still decoding.');
     const img=this.image(node,s);let dw=width,dh=height;
     if(['contain','cover'].includes(s.objectFit)){
      const f=Math[s.objectFit==='contain'?'min':'max'](width/node.naturalWidth,height/node.naturalHeight);
      dw=node.naturalWidth*f;dh=node.naturalHeight*f;
     }
     c.drawImage(img,(width-dw)/2,(height-dh)/2,dw,dh);
    }else paintChildren(node,width,height);
    }finally{c.restore();}
   }
  };
  try{paintChildren(root,w,h);}finally{c.restore();}return this.canvas;
 }
}
export class CRTDisplay {
 constructor(root,viewport=()=>[640,448]){
  this.platform='ps2';this.storageKey=CRT_KEY;
  this.root=root;this.viewport=viewport;this.capture=new SceneCapture();this.settings={...CRT_DEFAULTS};this.preview=null;this.listener=null;this.message='CRT is off · original artwork';this.frame=0;
  try{this.settings=normalizeCRT(JSON.parse(localStorage.getItem(CRT_KEY)||'{}'));}catch{}
  this.observer=new MutationObserver(records=>{
   const own=n=>n===this.canvas||n===this.nativeCanvas;
   if(records.some(r=>!own(r.target)&&!(r.target===root&&r.type==='attributes')&&!(r.type==='childList'&&[...r.addedNodes,...r.removedNodes].every(own))))this.invalidate();
  });
  this.observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','src']});
  this.resize=new ResizeObserver(()=>this.invalidate());this.resize.observe(root);
  window.addEventListener('resize',()=>this.invalidate());
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)this.invalidate();});
 }
 setPlatform(id){
  if(this.platform===id)return;
  this.platform=id;this.storageKey=id==='ps2'?CRT_KEY:`vnkit.crt.${id}.v1`;
  const defaults=id==='pc98'?{...CRT_DEFAULTS,rows:400,curvature:0,corners:0,overscan:0,convergence:0,maskStrength:0,bloom:0,halation:0,enabled:false}:CRT_DEFAULTS;
  try{this.settings=normalizeCRT({...defaults,...JSON.parse(localStorage.getItem(this.storageKey)||'{}')});}catch{this.settings=normalizeCRT(defaults);}
  this.refresh();
 }
 set(values){
  this.settings=normalizeCRT({...this.settings,...values});
  try{localStorage.setItem(this.storageKey,JSON.stringify(this.settings));}catch{this.persistWarning=' Preferences could not be saved in this browser.';}
  this.refresh();
 }
 subscribe(listener){this.listener=listener;this.notify(this.message);return()=>{this.listener=null;};}
 notify(message){const changed=this.message!==message;this.message=message;this.listener?.(message+(this.persistWarning||''));if(changed&&/^(CRT (unavailable|paused):|Artwork composition unavailable:)/.test(message))this.onError?.(message);}
 invalidate(){if(!this.frame&&(this.settings.enabled||this.preview||this.root.querySelector('.scene-layer')))this.frame=requestAnimationFrame(()=>{this.frame=0;this.refresh();});}
 original(message){
  this.root.classList.remove('crt-active');this.canvas?.remove();
  // A face patch fills a hole in the body. Scaling those two textures separately
  // blends their edges with the background. Join in native pixels first, even
  // with CRT off; keep the source DOM for motion, readiness and graphics fallback.
  if(this.root.querySelector('.scene-layer')&&!this.root.querySelector('.script-media')){
   try{
    const source=this.capture.draw(this.root,this.viewport());
    if(!this.nativeCanvas){this.nativeCanvas=document.createElement('canvas');this.nativeCanvas.className='native-screen';this.nativeCanvas.setAttribute('aria-hidden','true');}
    const canvas=this.nativeCanvas;
    if(canvas.width!==source.width||canvas.height!==source.height){canvas.width=source.width;canvas.height=source.height;}
    canvas.getContext('2d',{alpha:false}).drawImage(source,0,0);
    if(canvas.parentElement!==this.root)this.root.append(canvas);
    this.root.classList.add('native-active');
   }catch(error){this.root.classList.remove('native-active');this.nativeCanvas?.remove();message=`Artwork composition unavailable: ${error.message} Showing original image layers.`;}
  }else{this.root.classList.remove('native-active');this.nativeCanvas?.remove();}
  this.notify(message);
 }
 init(){
  if(this.gl)return;
  const canvas=document.createElement('canvas');canvas.className='crt-screen';canvas.setAttribute('aria-hidden','true');this.canvas=canvas;
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,powerPreference:'low-power',preserveDrawingBuffer:false});
  if(!gl)throw new Error('WebGL 2 is unavailable. Original artwork is shown; try enabling browser hardware acceleration.');
  this.gl=gl;
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;this.original('CRT paused: graphics context lost. Original artwork is shown.');});
  canvas.addEventListener('webglcontextrestored',()=>{this.lost=false;try{this.resources();this.refresh();}catch(error){this.original(`CRT unavailable: ${error.message}`);}});
  this.resources();
 }
 resources(){
  const gl=this.gl;
  const program=fragment=>{
   const shaders=[[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]].map(([type,source])=>{
    const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw new Error(`CRT shader did not compile: ${log}`);}return shader;
   });
   const p=gl.createProgram();shaders.forEach(s=>gl.attachShader(p,s));gl.linkProgram(p);shaders.forEach(s=>gl.deleteShader(s));
   if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(`CRT shader link failed: ${gl.getProgramInfoLog(p)}`);
   const uniforms={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const u=gl.getActiveUniform(p,i);uniforms[u.name]=gl.getUniformLocation(p,u.name);}
   return{p,uniforms};
  };
  this.blurProgram=program(blur);this.screenProgram=program(screen);
  const texture=()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
  this.sourceTexture=texture();this.targets=[0,1].map(()=>({texture:texture(),framebuffer:gl.createFramebuffer()}));this.targetSize='';
  this.float=Boolean(gl.getExtension('EXT_color_buffer_float'));gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
 }
 render(source){
  const gl=this.gl,s=this.settings;
  const [w,h]=crtOutputSize(this.root.clientWidth,this.root.clientHeight,devicePixelRatio,s.quality,gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sourceTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const tw=source.width,th=source.height;
  if(this.targetSize!==`${tw}:${th}`){
   for(const target of this.targets){
    gl.bindTexture(gl.TEXTURE_2D,target.texture);
    gl.texImage2D(gl.TEXTURE_2D,0,this.float?gl.RGBA16F:gl.RGBA8,tw,th,0,gl.RGBA,this.float?gl.HALF_FLOAT:gl.UNSIGNED_BYTE,null);
    gl.bindFramebuffer(gl.FRAMEBUFFER,target.framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,target.texture,0);
    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('CRT glow framebuffer is unavailable on this GPU.');
   }
   this.targetSize=`${tw}:${th}`;
  }
  const blur=this.blurProgram;gl.useProgram(blur.p);gl.uniform1i(blur.uniforms.image,0);gl.uniform1f(blur.uniforms.inputGamma,s.inputGamma);
  gl.viewport(0,0,tw,th);
  for(let pass=0;pass<2;pass++){
   gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[pass].framebuffer);gl.bindTexture(gl.TEXTURE_2D,pass?this.targets[0].texture:this.sourceTexture);
   gl.uniform1i(blur.uniforms.decodeInput,pass===0?1:0);gl.uniform2f(blur.uniforms.direction,pass?0:s.glowRadius/tw,pass?s.glowRadius/th:0);gl.drawArrays(gl.TRIANGLES,0,3);
  }
  const output=this.screenProgram;gl.useProgram(output.p);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.sourceTexture);gl.uniform1i(output.uniforms.image,0);
  gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,this.targets[1].texture);gl.uniform1i(output.uniforms.glow,1);
  gl.uniform2f(output.uniforms.sourceSize,source.width,source.height);gl.uniform2f(output.uniforms.outputSize,w,h);gl.uniform1i(output.uniforms.maskType,s.maskType);
  for(const name of Object.keys(CRT_RANGES))if(output.uniforms[name]!==undefined)gl.uniform1f(output.uniforms[name],s[name]);
  gl.drawArrays(gl.TRIANGLES,0,3);
  if(gl.getError()!==gl.NO_ERROR)throw new Error('The GPU could not finish the CRT frame. Original artwork is shown.');
  this.drawPreview(this.canvas);
  this.notify(`CRT active · ${w} × ${h} pixels · ${this.float?'16-bit float':'8-bit'} glow · Japanese text stays selectable`);
 }
 drawPreview(source){
  if(!this.preview)return;
  this.preview.width=source.width;this.preview.height=source.height;
  this.preview.getContext('2d',{alpha:false}).drawImage(source,0,0);
 }
 refresh(){
  cancelAnimationFrame(this.frame);this.frame=0;
  if(document.hidden)return;
  if(!this.root.clientWidth||!this.root.clientHeight)return;
  if(this.root.querySelector('video,audio.script-media')){this.original('Movie / media playback uses the original player; CRT resumes afterwards.');return;}
  if(!this.root.querySelector('img')){this.original('Load a scene to preview its artwork. CRT preferences are saved for play.');return;}
  try{
   if(!this.settings.enabled){this.original('CRT is off · original artwork');if(this.preview)this.drawPreview(this.capture.draw(this.root,this.viewport()));return;}
   if(this.lost){this.original('CRT paused: graphics context lost. Original artwork is shown.');return;}
   this.init();const source=this.capture.draw(this.root,this.viewport());this.render(source);
   this.nativeCanvas?.remove();this.root.classList.remove('native-active');
   if(this.canvas.parentElement!==this.root)this.root.append(this.canvas);
   if(!this.root.classList.contains('crt-active'))this.root.classList.add('crt-active');
  }catch(error){this.original(`CRT unavailable: ${error.message}`);}
 }
 attachPreview(canvas){this.preview=canvas;this.refresh();return()=>{this.preview=null;};}
}
