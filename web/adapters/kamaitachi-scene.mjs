/* Source SDW composition: max of index bytes (8003b398 mode 3), followed by
 * the two seven-colour ramps built at 8001f690. No mask RGB is artwork RGB. */
export function shadowPalette(colours){
 if(!Array.isArray(colours)||colours.length!==2||colours.some(c=>!Array.isArray(c)||c.length!==3||c.some(v=>!Number.isInteger(v)||v<0||v>255)))throw Error('Invalid native silhouette colours');
 const ramp=[[0,1],[179,256],[3,4],[51,64],[217,256],[115,128],[243,256],[1,1]],palette=[];
 for(const rgb of colours)for(const [n,d]of ramp){
  const [r,g,b]=rgb.map(v=>Math.floor(v*n/d)),word=(0x8000+r+32*g+1024*b)&65535;
  palette.push(n?[word&31,(word>>5)&31,(word>>10)&31,15.5].map(v=>Math.round(v*255/31)):[0,0,0,0]);
 }return palette;
}
export function composeShadows(sources,colours){
 if(!Array.isArray(sources)||sources.length>1024)throw Error('Native silhouette source bound');
 const indices=new Uint8Array(320*240),rgba=new Uint8ClampedArray(indices.length*4),palette=shadowPalette(colours);
 for(const source of sources){
  if(!(source instanceof Uint8ClampedArray)||source.length!==indices.length*4)throw Error('Native silhouette geometry');
  for(let i=0;i<indices.length;i++){const v=source[i*4];if(v>15)throw Error('Unaudited native silhouette palette index');indices[i]=Math.max(indices[i],v);}
 }
 for(let i=0;i<indices.length;i++)rgba.set(palette[indices[i]],i*4);
 return rgba;
}
export function mountKamaitachiShadows(root,url,state,assets){
 let cancelled=false;const cleanup=()=>{cancelled=true;};
 cleanup.ready=(async()=>{
  const rows=Object.values(state.shadows).filter(r=>r.visible);
  if(!state.shadowVisible||!rows.length)return;
  const colours=structuredClone(state.shadowColours),canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
  const context=canvas.getContext('2d',{willReadFrequently:true}),sources=[];
  for(const row of rows){
   const asset=assets[row.asset];if(asset.width!==320||asset.height!==240)throw Error('Unverified silhouette texture geometry');
   const image=new Image();image.src=url(row.asset);await image.decode();context.clearRect(0,0,320,240);context.drawImage(image,0,0);sources.push(context.getImageData(0,0,320,240).data);
  }
  context.putImageData(new ImageData(composeShadows(sources,colours),320,240),0,0);
  const image=new Image();image.alt='';image.src=canvas.toDataURL();image.style.cssText='position:absolute;left:0;top:-1.6666666667%;width:100%;height:100%;z-index:10';await image.decode();
  if(!cancelled)root.append(image);
 })();return cleanup;
}
