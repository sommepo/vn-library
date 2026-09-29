// Optional upstream scanner is private test tooling, never reader/runtime code.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

export async function installWordScanner(page, root) {
  const allowed=new Set(['dom/dom-text-scanner.js','data/string-util.js']);
  await page.route('**/word-scan-test/**',async route=>{
    const relative=new URL(route.request().url()).pathname.slice('/word-scan-test/'.length);
    assert.ok(allowed.has(relative));
    await route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(root,'ext/js',relative))});
  });
}

export async function checkWordScanning(page, selector) {
  const result=await page.evaluate(async selector=>{
    try {
    const {DOMTextScanner}=await import('/word-scan-test/dom/dom-text-scanner.js');
    let sequences=0,rectangles=0,pointerScans=0;
    for(const block of document.querySelectorAll(selector)) {
      const glyphs=[...block.querySelectorAll('.sound-source-glyph')];
      if(glyphs.length<2)continue;
      for(let index=0;index<glyphs.length-1;index++) {
        const count=Math.min(8,glyphs.length-index),text=glyphs.slice(index,index+count).map(g=>g.textContent).join('');
        const scan=new DOMTextScanner(glyphs[index].firstChild,0).seek(count);
        if(scan.content!==text)throw Error('Dictionary scanner split contiguous source text');
        const backwards=new DOMTextScanner(glyphs[index+count-1].firstChild,glyphs[index+count-1].textContent.length).seek(-count);
        if(backwards.content!==text)throw Error('Dictionary scanner split backwards context');
        const range=document.createRange();range.setStart(glyphs[index].firstChild,0);range.setEnd(scan.node,scan.offset);
        if(range.toString()!==text)throw Error('Dictionary selection differs from source text');
        for(const rect of range.getClientRects())if(rect.width>0&&rect.height>0)rectangles++;
        sequences++;
      }
      const index=glyphs.findIndex((g,i)=>i<glyphs.length-1&&/\p{Letter}/u.test(g.textContent));
      if(index>=0) {
        const glyph=glyphs[index],rect=glyph.getBoundingClientRect(),x=rect.x+rect.width*.2,y=rect.y+rect.height*.5;
        const caret=document.caretPositionFromPoint?.(x,y);
        const range=caret?null:document.caretRangeFromPoint?.(x,y);
        const node=caret?.offsetNode??range?.startContainer,offset=caret?.offset??range?.startOffset;
        if(node!==glyph.firstChild||offset!==0)throw Error('Pointer lookup missed the visible source character');
        const text=glyphs.slice(index,index+2).map(g=>g.textContent).join('');
        if(new DOMTextScanner(node,offset).seek(2).content!==text)throw Error('Pointer lookup split the word');
        pointerScans++;
      }
    }
    return{sequences,rectangles,pointerScans};
    }catch(error){return{error:error.message};}
  },selector);
  assert.equal(result.error,undefined,result.error);
  assert.ok(result.sequences>0,'Multiple adjacent source glyphs scanned');
  assert.ok(result.rectangles>0,'Scanned words retain selectable screen rectangles');
  return result;
}
