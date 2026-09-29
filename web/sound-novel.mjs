/* Full-scene selectable text. The adapter supplies source page geometry;
 * this renderer neither discovers dialogue nor executes/earns story choices. */
import {plainText} from './engine.mjs';

const colour = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
export function validateSoundPage(pending) {
  const p = pending?.page;
  const finite = n => Number.isFinite(n);
  if (!p || ![p.width,p.height,p.fontSize,p.lineHeight].every(n=>finite(n)&&n>0) ||
      p.width>2048 || p.height>2048 || p.fontSize>p.height || p.lineHeight<p.fontSize ||
      !colour(p.colour) || !colour(p.choiceColour) ||
      !Array.isArray(p.blocks) || p.blocks.length>256) throw Error('Invalid sound novel page geometry');
  const sourceOptions = pending.options ?? [];
  if (!Array.isArray(sourceOptions)) throw Error('Invalid sound novel choices');
  const options = new Map(sourceOptions.map(o=>[o.id,o]));
  if (options.size!==sourceOptions.length) throw Error('Duplicate sound novel choice ID');
  const seen = new Set();
  if(p.font && (typeof p.font.asset!=='string' || !p.font.asset ||
      ![p.font.width,p.font.height].every(n=>Number.isInteger(n)&&n>0&&n<=4096)))throw Error('Invalid sound novel font atlas');
  let glyphCount=0;
  for (const b of p.blocks) {
    if (![b.x,b.y,b.width,b.height].every(finite) || b.x<0 || b.y<0 || b.width<=0 || b.height<=0 ||
        b.x+b.width>p.width || b.y+b.height>p.height ||
        !(typeof b.text==='string'||Array.isArray(b.text)) || (b.colour && !colour(b.colour))) {
      throw Error('Invalid sound novel text block');
    }
    if(b.glyphs) {
      if(!p.font || !Array.isArray(b.glyphs) || (glyphCount+=b.glyphs.length)>4096 ||
          b.glyphs.map(g=>g.text).join('')!==plainText(b.text))throw Error('Sound novel glyphs do not match source text');
      for(const g of b.glyphs)if(typeof g.text!=='string'||[...g.text].length!==1||
          ![g.x,g.y,g.width,g.height,g.u,g.v].every(Number.isFinite)||
          g.x<0||g.y<0||g.width<=0||g.height<=0||g.x+g.width>b.width||g.y+g.height>b.height||
          g.u<0||g.v<0||g.u+g.width>p.font.width||g.v+g.height>p.font.height)throw Error('Invalid sound novel glyph rectangle');
    }
    if (b.choiceId != null) {
      if (pending.kind!=='choice' || !options.has(b.choiceId) || seen.has(b.choiceId) ||
          plainText(b.text)!==plainText(options.get(b.choiceId).text)) throw Error('Sound novel choice does not match source');
      seen.add(b.choiceId);
    }
  }
  if (seen.size!==options.size) throw Error('Sound novel page omits a choice');
  if (pending.kind==='text' && p.blocks.map(b=>plainText(b.text)).join('\n')!==plainText(pending.displayText??pending.text)) {
    throw Error('Sound novel page does not match displayed text');
  }
  return p;
}

export class SoundNovelPage {
  constructor(stage, sentence, choices, renderText, choose, fontURL) {
    Object.assign(this,{stage,sentence,choices,renderText,choose,fontURL,enabled:false,page:null});
    this.observer=new ResizeObserver(()=>this.fit());this.observer.observe(stage);
  }
  setEnabled(enabled) {
    this.enabled=enabled;
    if(enabled)this.stage.dataset.textLayout='full-scene';
    else {delete this.stage.dataset.textLayout;this.page=null;}
  }
  fit() {
    if(!this.enabled||!this.page)return;
    const {width,height}=this.page;
    this.stage.style.setProperty('--sound-scale-x',String(this.stage.clientWidth/width));
    this.stage.style.setProperty('--sound-scale-y',String(this.stage.clientHeight/height));
  }
  render(pending, limit=Infinity) {
    const page=validateSoundPage(pending);
    const atlas=page.font?this.fontURL?.(page.font.asset):null;
    if(page.font&&!atlas)throw Error('Sound novel source font unavailable');
    const narration=document.createElement('div'),choices=document.createElement('div');
    for(const plane of [narration,choices]) {
      plane.className='sound-page-plane';plane.style.width=`${page.width}px`;plane.style.height=`${page.height}px`;
      plane.style.fontSize=`${page.fontSize}px`;plane.style.lineHeight=`${page.lineHeight}px`;
      plane.style.setProperty('--sound-colour',page.colour);plane.style.setProperty('--sound-choice-colour',page.choiceColour);
    }
    const buttons=[];
    const select=button=>{for(const b of buttons)b.classList.toggle('sound-selected',b===button);};
    for(const block of page.blocks) {
      const isChoice=block.choiceId!=null;
      const el=document.createElement(isChoice?'button':'div');el.className='sound-page-block';
      Object.assign(el.style,{left:`${block.x}px`,top:`${block.y}px`,width:`${block.width}px`,height:`${block.height}px`});
      if(block.colour)el.style.setProperty('--sound-colour',block.colour);
      if(block.glyphs) {
        el.classList.add('sound-positioned');
        // Button contents are vertically centred by native browser layout.
        // Anchor the whole run once, keeping its individual glyphs inline.
        const run=document.createElement('span');run.className='sound-glyph-run';el.append(run);
        // Keep adjacent characters in inline flow: dictionary scanners treat
        // absolute/fixed glyphs as separate paragraphs. Relative offsets cancel
        // each inline advance while retaining the exact source coordinates.
        let advance=0;
        for(const g of block.glyphs.slice(0,isChoice?undefined:Math.max(0,limit))) {
          const span=document.createElement('span');span.className='sound-source-glyph';span.textContent=g.text;
          Object.assign(span.style,{left:`${g.x-advance}px`,top:`${g.y}px`,width:`${g.width}px`,height:`${g.height}px`});
          advance+=g.width;
          span.style.setProperty('--glyph-mask',`url(${JSON.stringify(atlas)})`);
          span.style.setProperty('--glyph-u',`${-g.u}px`);span.style.setProperty('--glyph-v',`${-g.v}px`);
          run.append(span);
        }
      } else this.renderText(el,block.text,isChoice?Infinity:Math.max(0,limit));
      if(isChoice) {
        el.type='button';el.dataset.choiceId=String(block.choiceId);buttons.push(el);
        el.addEventListener('focus',()=>select(el));el.addEventListener('pointerenter',()=>select(el));
        el.addEventListener('click',()=>this.choose(block.choiceId));
        el.addEventListener('keydown',event=>{
          if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
          event.preventDefault();event.stopPropagation();
          const at=buttons.indexOf(el),n=buttons.length;
          buttons[event.key==='Home'?0:event.key==='End'?n-1:(at+(event.key==='ArrowDown'?1:-1)+n)%n].focus();
        });
        choices.append(el);
      } else {limit-=[...plainText(block.text)].length+1;narration.append(el);}
    }
    select(buttons[0]);
    // Only commit after validation/construction; malformed source layout cannot
    // partially replace the last valid page. Never touch statistics or saves.
    this.page=page;this.sentence.replaceChildren(narration);
    this.choices.replaceChildren(...(buttons.length?[choices]:[]));this.fit();
  }
  destroy(){this.observer.disconnect();this.setEnabled(false);}
}
