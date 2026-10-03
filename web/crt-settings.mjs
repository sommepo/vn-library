// Per-device preferences, independent of game state and reading history.
export const CRT_KEY='vnkit.crt.v1';
export const CRT_RANGES={scanlines:[0,1,.01],rows:[200,600,1],beam:[.2,.65,.01],maskStrength:[0,1,.01],maskPitch:[3,12,.25],bloom:[0,.5,.01],halation:[0,.4,.01],glowRadius:[.5,5,.1],convergence:[0,2,.05],sharpness:[0,1.5,.05],inputGamma:[1.8,2.8,.05],outputGamma:[1.8,2.8,.05],brightness:[.6,1.6,.01],saturation:[0,1.5,.01],warmth:[-1,1,.05],curvature:[0,.18,.005],overscan:[0,.08,.005],vignette:[0,.6,.01],corners:[0,.2,.005],grain:[0,.08,.002]};
export const CRT_DEFAULTS=Object.freeze({enabled:false,preset:'soft',maskType:1,quality:'1440',scanlines:.6,rows:448,beam:.43,maskStrength:.2,maskPitch:3,bloom:.09,halation:.04,glowRadius:1.7,convergence:.15,sharpness:.15,inputGamma:2.4,outputGamma:2.2,brightness:1.08,saturation:1,warmth:.05,curvature:.025,overscan:0,vignette:.12,corners:.055,grain:0});
export const CRT_PRESETS=Object.freeze({
 soft:{label:'Soft living-room CRT',values:{}},
 monitor:{label:'RGB studio monitor',values:{scanlines:.85,beam:.34,maskStrength:.28,maskPitch:3,bloom:.04,halation:.02,glowRadius:1,convergence:0,sharpness:.35,curvature:0,vignette:.03,corners:.018,brightness:1.12}},
 consumer:{label:'Warm slot-mask television',values:{maskType:2,scanlines:.7,beam:.47,maskStrength:.36,maskPitch:4,bloom:.13,halation:.08,glowRadius:2.4,convergence:.35,sharpness:0,warmth:.35,curvature:.075,vignette:.2,corners:.1,brightness:1.12}},
 shadow:{label:'Fine shadow mask · 4K',values:{maskType:3,scanlines:.85,beam:.36,maskStrength:.45,maskPitch:4,bloom:.06,halation:.025,glowRadius:1.3,convergence:.1,curvature:.035,vignette:.1,corners:.045,brightness:1.18,quality:'native'}},
 arcade:{label:'240-line arcade',values:{rows:240,scanlines:.9,beam:.4,maskType:1,maskStrength:.2,maskPitch:3,bloom:.1,halation:.04,curvature:.05,brightness:1.12}},
 clean:{label:'Clean tube · no mask',values:{maskType:0,scanlines:.35,beam:.5,bloom:.06,halation:.02,curvature:0,vignette:.06,corners:.02,sharpness:0}},
});
export function normalizeCRT(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))value={};
 const result={...CRT_DEFAULTS,enabled:value.enabled===true};
 for(const [key,[min,max]]of Object.entries(CRT_RANGES)){
  if(typeof value[key]==='number'&&Number.isFinite(value[key]))result[key]=Math.min(max,Math.max(min,value[key]));
 }
 if([0,1,2,3].includes(value.maskType))result.maskType=value.maskType;
 if(['1080','1440','native'].includes(value.quality))result.quality=value.quality;
 if(value.preset==='custom'||Object.hasOwn(CRT_PRESETS,value.preset))result.preset=value.preset;
 return result;
}
// Starting points per platform. A handheld's own screen through the filter: one scanline per
// line of its picture (set when it is drawn), a tight beam so the lines show at that
// magnification, a light aperture grille and glow, no convergence error or extra sharpening
// (its pixels keep their edges), and no bend (the game's text is laid over the picture).
const PLATFORM_CRT=Object.freeze({
 gba:{...CRT_DEFAULTS,enabled:false,preset:'custom',scanlines:.75,beam:.3,maskType:1,maskStrength:.16,maskPitch:3,bloom:.08,halation:.03,glowRadius:1.4,convergence:0,sharpness:0,brightness:1.16,curvature:0,overscan:0,vignette:0,corners:0},
 pc98:{...CRT_DEFAULTS,rows:400,curvature:0,corners:0,overscan:0,convergence:0,maskStrength:0,bloom:0,halation:0,enabled:false},
});
// A platform's settings from what the browser has stored for it.
export function platformCRT(id,stored={}){
 if(!stored||typeof stored!=='object'||Array.isArray(stored))stored={};
 // The first handheld defaults were a flat screen that only blurred once enabled (and never ran:
 // the filter did not take a live picture then). Where they were left as they were, the new ones apply.
 if(id==='gba'&&stored.rows===320&&stored.maskStrength===0&&stored.bloom===0&&stored.halation===0)stored={enabled:stored.enabled===true};
 return normalizeCRT({...(PLATFORM_CRT[id]||CRT_DEFAULTS),...stored});
}
export function crtPreset(name,current=CRT_DEFAULTS){
 if(!Object.hasOwn(CRT_PRESETS,name))throw new Error('Unknown CRT preset');
 return normalizeCRT({...CRT_DEFAULTS,...CRT_PRESETS[name].values,enabled:current.enabled,preset:name});
}
export function crtOutputSize(width,height,dpr,quality,maxTexture=4096){
 const cap=quality==='1080'?1080:quality==='1440'?1440:2160;
 const scale=Math.min(Math.max(.1,Number.isFinite(dpr)?dpr:1),cap/height,Math.min(4096,maxTexture)/width,Math.min(4096,maxTexture)/height);
 return [Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale))];
}
