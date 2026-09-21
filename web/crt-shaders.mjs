// Original MIT WebGL2 shaders. Feature references and scope: docs/crt-display.md.
export const vertex = `#version 300 es
precision highp float;
out vec2 uv;
void main() {
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  uv=p; gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
export const blur = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D image;
uniform vec2 direction;
uniform float inputGamma;
uniform bool decodeInput;
vec3 sampleLinear(vec2 p){vec3 c=texture(image,p).rgb;return decodeInput?pow(c,vec3(inputGamma)):c;}
void main(){
 vec3 c=sampleLinear(uv)*0.227027;
 c+=(sampleLinear(uv+direction*1.384615)+sampleLinear(uv-direction*1.384615))*0.316216;
 c+=(sampleLinear(uv+direction*3.230769)+sampleLinear(uv-direction*3.230769))*0.070270;
 color=vec4(c,1.0);
}`;
export const screen = `#version 300 es
precision highp float;
in vec2 uv; out vec4 color;
uniform sampler2D image, glow;
uniform vec2 sourceSize, outputSize;
uniform float scanlines, rows, beam, maskStrength, maskPitch, bloom, halation;
uniform float convergence, sharpness, inputGamma, outputGamma, brightness, saturation, warmth;
uniform float curvature, overscan, vignette, corners, grain;
uniform int maskType;
vec3 linearAt(vec2 p){
 vec2 d=vec2(convergence/sourceSize.x,0.0);
 vec3 c=vec3(texture(image,p+d).r,texture(image,p).g,texture(image,p-d).b);
 if(sharpness>0.0){
  vec2 q=1.0/sourceSize;
  vec3 soft=(texture(image,p+vec2(q.x,0)).rgb+texture(image,p-vec2(q.x,0)).rgb+texture(image,p+vec2(0,q.y)).rgb+texture(image,p-vec2(0,q.y)).rgb)*0.25;
  c=clamp(c+(c-soft)*sharpness,0.0,1.0);
 }
 return pow(max(c,vec3(0)),vec3(inputGamma));
}
vec3 phosphors(){
 if(maskType==0||maskStrength==0.0)return vec3(1);
 // Pitch is the width of a complete RGB triad in physical framebuffer pixels.
 vec2 pixel=gl_FragCoord.xy;
 float stagger=maskType==3?mod(floor(pixel.y/(maskPitch*0.75)),2.0)*0.5:0.0;
 float phase=pixel.x/maskPitch+stagger;
 vec3 distance=abs(fract(vec3(phase)-vec3(1.0/6.0,0.5,5.0/6.0)+0.5)-0.5);
 float aa=min(0.16,0.5/maskPitch);
 vec3 m=1.0-smoothstep(vec3(1.0/6.0-aa),vec3(1.0/6.0+aa),distance);
 m=vec3(0.27)+m*2.19; // Unit average energy before slot gaps.
 if(maskType==2){
  float slot=abs(fract(pixel.y/(maskPitch*1.6)+floor(pixel.x/maskPitch)*0.5)-0.5);
  m*=mix(1.12,0.45,smoothstep(0.32,0.49,slot));
 }
 if(maskType==3){
  float dotRow=abs(fract(pixel.y/(maskPitch*0.75))-0.5);
  m*=mix(1.2,0.5,smoothstep(0.20,0.48,dotRow));
 }
 return mix(vec3(1),m,maskStrength);
}
void main(){
 vec2 p=(uv-0.5)*2.0;
 p*=1.0+curvature*vec2(p.y*p.y,p.x*p.x);
 vec2 tex=p*0.5/(1.0+overscan)+0.5;
 float edge=max(abs(p.x),abs(p.y));
 vec2 cornerDistance=abs(p)-vec2(1.0-corners);
 float roundEdge=min(max(cornerDistance.x,cornerDistance.y),0.0)+length(max(cornerDistance,0.0))-corners;
 float coverage=1.0-smoothstep(-2.0/min(outputSize.x,outputSize.y),0.0,max(edge-1.0,roundEdge));
 vec3 base=linearAt(tex), c=base;
 float lineY=tex.y*rows-0.5;
 float footprint=max(fwidth(lineY),0.001);
 // Bright pixels have a wider electron beam; integrate the output-pixel footprint.
 float sigma=mix(beam*0.65,beam,clamp(dot(base,vec3(0.2126,0.7152,0.0722)),0.0,1.0));
 sigma=sqrt(sigma*sigma+footprint*footprint/12.0);
 vec3 raster=vec3(0);
 for(int k=-2;k<=2;k++){
  float row=floor(lineY)+float(k), d=lineY-row;
  raster+=linearAt(vec2(tex.x,(row+0.5)/rows))*exp(-0.5*d*d/(sigma*sigma))/(2.506628*sigma);
 }
 // Suppress aliases when there are fewer output pixels than source scanlines.
 float effective=scanlines*(1.0-smoothstep(0.65,1.5,footprint));
 c=mix(base,raster,effective);
 vec3 haze=texture(glow,tex).rgb;
 c=(c+halation*haze)*phosphors()+bloom*haze;
 float luma=dot(c,vec3(0.2126,0.7152,0.0722));
 c=mix(vec3(luma),c,saturation)*vec3(1.0+warmth*0.12,1.0,1.0-warmth*0.12)*brightness;
 c*=1.0-vignette*clamp(dot(p,p)*0.5,0.0,1.0);
 c=pow(max(c,vec3(0)),vec3(1.0/outputGamma));
 float noise=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5;
 color=vec4(clamp(c+noise*grain,0.0,1.0)*coverage,1.0);
}`;
