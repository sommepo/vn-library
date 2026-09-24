#!/usr/bin/env python3
"""Create a PRIVATE offline source-glyph review sheet; never approve OCR by score."""
import argparse
import base64
import hashlib
import html
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from vnkit.adapters.pia_media import _png
from vnkit.disc import write_bytes


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('font',type=Path);p.add_argument('candidates',type=Path)
    p.add_argument('--out',type=Path,required=True)
    a=p.parse_args();font=a.font.read_bytes();c=json.loads(a.candidates.read_text())
    if len(font)!=829440 or c['font_sha256']!=hashlib.sha256(font).hexdigest():p.error('Font/candidate identity mismatch')
    width,height=32*24,90*24;pixels=bytearray([255])*(width*height*3)
    for g in range(2880):
        x0,y0=(g%32)*24,(g//32)*24
        for y in range(24):
            for x in range(24):
                value=font[g*288+y*12+x//2];v=255-((value>>4) if not x%2 else (value&15))*17
                at=((y0+y)*width+x0+x)*3;pixels[at:at+3]=bytes([v])*3
    atlas=base64.b64encode(_png(width,height,3,bytes(pixels))).decode()
    rows=[]
    for row in c['glyphs']:
        g=row['glyph'];candidate=html.escape(row['candidate'],quote=True)
        rows.append(f'<div class="glyph" data-id="{g}"><small>{g}</small><div class="source" style="background-position:-{g%32*48}px -{g//32*48}px"></div><input aria-label="Unicode for glyph {g}" value="{candidate}"><label><input class="approve" type="checkbox">verified</label></div>')
    metadata=json.dumps({'format':'vnkit.cartagra-font-review','version':1,'font_sha256':c['font_sha256']})
    page='''<!doctype html><meta charset="utf-8"><title>Cartagra source font review — private</title>
<style>body{background:#eee;color:#111;font:14px sans-serif;margin:16px}header{position:sticky;top:0;background:#eee;z-index:1;padding:12px}main{display:grid;grid-template-columns:repeat(12,112px);gap:5px}.glyph{background:white;display:grid;grid-template-columns:52px 52px;gap:2px;padding:4px}small{grid-column:span 2}.source{width:48px;height:48px;image-rendering:pixelated;background-image:url(data:image/png;base64,ATLAS);background-size:1536px 4320px}.glyph>input{width:46px;font:30px serif;text-align:center;border:1px solid #ddd}.glyph label{grid-column:span 2}.glyph:has(:checked){background:#cfd}</style>
<header><b>Source glyph on the left; unverified OCR candidate on the right.</b> Check each against the font. Empty and multi-character candidates need correction. <button id="download">Export review</button> <span id="count">0 approved</span></header><main>ROWS</main>
<script>const meta=META;document.addEventListener('change',()=>document.querySelector('#count').textContent=document.querySelectorAll('.approve:checked').length+' approved');document.querySelector('#download').onclick=()=>{const glyphs=[...document.querySelectorAll('.glyph')].map(e=>({glyph:+e.dataset.id,character:e.querySelector('input').value,verified:e.querySelector('.approve').checked}));const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({...meta,glyphs},null,2)],{type:'application/json'}));a.download='cartagra-font-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};</script>'''
    page=page.replace('ATLAS',atlas).replace('ROWS',''.join(rows)).replace('META',metadata)
    write_bytes(a.out.parent,a.out.name,page.encode())
    print(a.out)


if __name__=='__main__':main()
