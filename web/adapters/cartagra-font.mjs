/* Original source tokens; Unicode is available only with a reviewed font map. */
export function validateGlyphMap(data,fontHash){
  if(data?.format!=='vnkit.cartagra-font-review'||data.version!==1||data.font_sha256!==fontHash||!Array.isArray(data.glyphs)||data.glyphs.length>2880)throw Error('Wrong reviewed Cartagra font map');
  const map=new Map();
  for(const row of data.glyphs){
    if(!Number.isInteger(row.glyph)||row.glyph<0||row.glyph>=2880||map.has(row.glyph)||row.verified!==true||typeof row.character!=='string'||[...row.character].length!==1||/[\p{C}\r\n\u2028\u2029\ufffd]/u.test(row.character))throw Error('Invalid reviewed Cartagra glyph');
    map.set(row.glyph,row.character);
  }
  return map;
}

export function decodeGlyphText(tokens,map,location='source text'){
  const groups=glyphRuns(tokens);
  const character=g=>{if(!map.has(g))throw Error(`${location}: unreviewed glyph ${g}`);return map.get(g);};
  const decode=runs=>{
    const result=[];
    const append=text=>{if(typeof result.at(-1)==='string')result[result.length-1]+=text;else result.push(text);};
    for(const r of runs){
      if(r===null)append('\n');
      else if(typeof r==='number')append(character(r));
      else result.push({base:r.base.map(character).join(''),reading:r.reading.map(character).join('')});
    }
    return result;
  };
  return {text:decode(groups.body),speaker:decode(groups.speaker).map(r=>typeof r==='string'?r:r.base).join('')};
}
export function glyphRuns(tokens) {
  const body=[],speaker=[];let out=body,ruby=null,reading=false;
  for(const t of tokens){
    if(t.glyph!=null){
      if(!Number.isInteger(t.glyph)||t.glyph<0||t.glyph>=2880)throw Error('Invalid source glyph');
      (ruby?(reading?ruby.reading:ruby.base):out).push(t.glyph);continue;
    }
    switch(t.control){
      case 0:out.push(null);break;
      case 1:out=speaker;break;
      case 2:out=body;break;
      case 9:if(ruby)throw Error('Nested source ruby');ruby={base:[],reading:[]};reading=false;break;
      case 10:if(!ruby)throw Error('Source ruby has no base');reading=true;break;
      case 11:if(!ruby)throw Error('Source ruby has no start');out.push(ruby);ruby=null;reading=false;break;
      // Timing/colour/size controls remain in source tokens. The preview uses
      // uniform original-size glyphs and instant presentation; it exports none.
      case 3:case 4:case 5:case 6:case 7:case 8:case 12:break;
      default:throw Error(`Unknown glyph control at ${t.offset}`);
    }
  }
  if(ruby)throw Error('Unterminated source ruby');
  return {body,speaker};
}

export function drawGlyphRuns(container,runs,atlas,widths,{width=576}={}){
  container.replaceChildren();if(!runs.length)return;
  const glyphWidth=g=>g<widths.length?widths[g]:24;
  const placements=[];let x=0,y=12;
  const put=(g,px,py,scale=1)=>placements.push({g,x:px,y:py,scale});
  for(const run of runs){
    if(run===null){x=0;y+=38;continue;}
    const ruby=typeof run==='object',base=ruby?run.base:[run];
    const bw=base.reduce((n,g)=>n+glyphWidth(g),0),rw=ruby?run.reading.reduce((n,g)=>n+glyphWidth(g)/2,0):0;
    const span=Math.max(bw,rw);
    if(x+span>width&&x){x=0;y+=38;}
    let bx=x+(span-bw)/2;
    for(const g of base){put(g,bx,y);bx+=glyphWidth(g);}
    if(ruby){let rx=x+(span-rw)/2;for(const g of run.reading){put(g,rx,y-12,.5);rx+=glyphWidth(g)/2;}}
    x+=span;
  }
  const c=document.createElement('canvas');c.width=width;c.height=y+26;
  c.className='source-font-preview';c.setAttribute('role','img');
  c.setAttribute('aria-label','Original Japanese font preview. Unicode text is not available yet.');
  c.style.cssText=`display:block;width:${width/24}em;max-width:100%;height:auto;filter:drop-shadow(1px 1px 1px #000)`;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  for(const p of placements)ctx.drawImage(atlas,p.g%32*24,Math.floor(p.g/32)*24,24,24,p.x,p.y,24*p.scale,24*p.scale);
  ctx.globalCompositeOperation='source-in';ctx.fillStyle=getComputedStyle(container).color;ctx.fillRect(0,0,c.width,c.height);
  container.append(c);
}
