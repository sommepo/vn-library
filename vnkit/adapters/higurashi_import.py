"""Build an exact-edition Shin reader from the owner's recovered files."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import struct
from .. import __version__
from ..disc import FormatError,write_bytes,write_json,write_stream
from ..elf import Elf32
from .higurashi_ps2 import EXE_SHA256
from .higurashi_program import compile_program
from .shin_ps2_graphics import picture,portrait_composites
from .shin_ps2_texture import texture_archive

VERSION='0.1.0'
LAYOUTS={1:(26,24,'picture','.pic'),2:(40,24,'bustup','.bup'),4:(44,12,'bgm','.ads'),5:(24,24,'se','.ads'),6:(16,12,'movie','.pss')}


def build(recovery,out,audio,movies):
    recovery,out,audio,movies=[Path(p).resolve() for p in (recovery,out,audio,movies)]
    exe=(recovery/'SLPM_669.13').read_bytes()
    if hashlib.sha256(exe).hexdigest()!=EXE_SHA256:raise FormatError('Untested Higurashi executable')
    snr=(recovery/'main.snr').read_bytes();program=compile_program(snr,exe);elf=Elf32(exe)
    fake=[]
    for ptr in struct.unpack('<2I',elf.at(0x25b198,8)):fake.append(elf.at(ptr,200).split(b'\0')[0].decode('cp932'))
    program['fakeChoices']=fake
    end=struct.unpack_from('<I',snr,32)[0];tables=struct.unpack_from('<12I',snr,end)
    assets={};source_records=[];image_cache={};records=[]
    properties=json.loads((audio/'track-properties.json').read_text())
    def source(name):
        p=(recovery/name).resolve()
        if not p.is_relative_to(recovery) or not p.is_file():raise FormatError(f'Missing source {name}')
        return p
    def emit(rel,data):
        r=write_bytes(out,rel,data);r.pop('status',None);records.append(r)
    def link_checked(p,rel):
        dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True)
        sha=hashlib.sha256(p.read_bytes()).hexdigest()
        if dest.exists():
            if hashlib.sha256(dest.read_bytes()).hexdigest()!=sha:raise FormatError('Changed output '+rel)
        else:
            try:os.link(p,dest)
            except OSError:
                with p.open('rb') as f:write_stream(out,rel,iter(lambda:f.read(1024*1024),b''))
        records.append({'path':rel,'sha256':sha,'size':p.stat().st_size})
    for t,(stride,namesize,folder,suffix) in LAYOUTS.items():
        start=tables[t]+4;size=struct.unpack_from('<I',snr,tables[t])[0]
        if size%stride:raise FormatError('Resource table size')
        for index,at in enumerate(range(start,start+size,stride)):
            name=snr[at:at+namesize].split(b'\0')[0].decode('cp932');rel_source=f'{folder}/{name}{suffix}'.lower()
            if name=='macro.log':continue # Unused original diagnostic entry; validator rejects any attempted load.
            p=source(rel_source);kind={1:'picture',2:'portrait',4:'music',5:'sound',6:'video'}[t]
            item={'source':rel_source,'sourceOffset':at,'index':index,'kind':kind}
            if t in (1,2):
                if rel_source not in image_cache:
                    data=p.read_bytes();sha=hashlib.sha256(data).hexdigest()
                    if t==1:
                        meta,png=picture(data);rel='images/'+rel_source+'.png';emit(rel,png);image_cache[rel_source]=(meta,{'':rel})
                    else:
                        meta,variants=portrait_composites(data);paths={}
                        for variant,png in variants:
                            if variant and (not variant.isascii() or not variant.replace('_','').replace('-','').isalnum()):raise FormatError('Unsafe BUP variant')
                            rel='images/'+rel_source+'-'+variant+'.png';emit(rel,png);paths[variant]=rel
                        image_cache[rel_source]=(meta,paths)
                    source_records.append({'source':rel_source,'sha256':sha})
                meta,paths=image_cache[rel_source];variant=snr[at+24:at+40].split(b'\0')[0].decode('ascii') if t==2 else ''
                if variant not in paths:raise FormatError(f'Missing BUP expression {rel_source}:{variant}')
                item.update(type='image',url=paths[variant],width=meta['width'],height=meta['height'],anchor=meta['anchor'])
            elif t in (4,5):
                rel='audio/'+rel_source+'.wav';link_checked(audio/(rel_source+'.wav'),rel);item.update(type=kind,url=rel)
                m=properties[rel_source];loop=m.get('loopingInfo')
                if loop:item.update(loopStart=loop['start']/m['sampleRate'],loopEnd=loop['end']/m['sampleRate'])
                if t==4:item['label']=snr[at+12:at+44].split(b'\0')[0].decode('cp932')
            else:
                rel='movies/'+p.stem+'.mp4';link_checked(movies/(p.stem+'.mp4'),rel);item.update(type='video',url=rel)
            assets[f'{kind}:{index}']=item
        print('Prepared',folder,flush=True)
    audio_cache=json.loads((audio/'audio-cache.json').read_text())
    for n,item in audio_cache.items():
        if not n.startswith('voice/'):continue
        if hashlib.sha256(source(n).read_bytes()).hexdigest()!=item['source_sha256']:raise FormatError('Changed voice source')
        rel='audio/'+n+'.wav';link_checked(audio/(n+'.wav'),rel)
        assets['voice:'+n[6:-4].lower()]={'type':'voice','url':rel,'source':n,'duration':item['samples']/item['sample_rate']}
    from .higurashi_voice_groups import prepare,MISSING_SOURCE_VOICES
    groups=prepare(program,audio,out)
    assets.update(groups)
    for asset in groups.values():
        p=out/asset['url'];records.append({'path':asset['url'],'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'size':p.stat().st_size})
    print('Prepared voices',flush=True)
    for n in ['chrsel.lzs','galsel.lzs','fakeselect.lzs','otsuget.lzs',*[f'chrget{i}.lzs' for i in range(4)]]:
        for meta,png in texture_archive(source(n).read_bytes()):
            rel=f'images/ui/{n}-{meta["index"]}.png';emit(rel,png)
            assets[f'ui:{n}:{meta["index"]}']={**meta,'type':'image','url':rel}
    tip_start=tables[11]+4;tip_size=struct.unpack_from('<I',snr,tables[11])[0];program['tips']=[]
    for at in range(tip_start,tip_start+tip_size,18):
        entry=struct.unpack_from('<H',snr,at)[0];name=snr[at+2:at+18].split(b'\0')[0].decode('ascii')
        program['tips'].append({'entry':1000+entry,'source':name})
        for meta,png in texture_archive(source(name).read_bytes()):
            rel=f'images/ui/tip-{entry}-{meta["index"]}.png';emit(rel,png)
            assets[f'tip:{entry}:{meta["index"]}']={**meta,'type':'image','url':rel}
    program['selectorLabels']=[] # The reader derives chapter labels from source branch entry text.
    emit('program.json',json.dumps(program,ensure_ascii=False,separators=(',',':')).encode())
    assets['program']={'type':'script','url':'program.json'}
    content={'format':'vnkit.content','version':1,'id':'higurashi-slpm66913-1.01','title':'ひぐらしのなく頃に祭 カケラ遊び','platform':{'id':'ps2','name':'PlayStation 2'},'adapter':{'id':'higurashi-matsuri-ps2','version':VERSION},'viewport':{'width':640,'height':448},'assets':assets,'runtime':{'id':'higurashi-ps2-shin','version':1,'program':'program.json','sha256':program['sha256'],'executable_sha256':EXE_SHA256,'missingSourceVoices':sorted(MISSING_SOURCE_VOICES)},'compatibility':{'status':'experimental','summary':'Source-driven reader. Native animated effects are settled; original-console comparison is unverified.'}}
    write_json(out,'content.json',content)
    write_json(out,'manifest.json',{'format':'vnkit.import-manifest','version':1,'adapter':content['adapter'],'tool_version':__version__,'source':{'executable_sha256':EXE_SHA256,'script_sha256':program['sha256'],'disc':json.loads((recovery/'recovery-manifest.json').read_text())['source']},'settings':{'images':'native size','audio':'PCM16 WAV','movie':'lossless VP9 + FLAC','animation':'settled'},'warnings':[content['compatibility']['summary']],'files':records,'source_records':source_records})
    return content


def import_game(source,out,work=None):
    from . import higurashi_ps2 as recovery
    from .higurashi_audio import convert as audio_convert
    from .higurashi_movie import convert as movie_convert
    from ..windows_tools import vgmstream_path
    source,out=Path(source),Path(out)
    work=Path(work or out.parent/(out.name+'-work'))
    if not recovery.detect(source)['supported']:raise FormatError('Untested Higurashi edition')
    resources=work/'recovery-v1';audio=work/'audio-converted-v1';movies=work/'movies-v1'
    print('Recovering original disc resources',flush=True)
    recovery.extract(source,resources)
    audio_convert(resources,audio,vgmstream_path())
    for p in sorted((resources/'movie').glob('*.pss')):
        print('Preparing movie '+p.name,flush=True);movie_convert(p,movies,vgmstream_path())
    c=build(resources,out,audio,movies)
    return {'status':'incomplete-runtime','gameId':c['id'],'assets':len(c['assets']),'out':str(out),'warnings':['Native animation and exact presentation remain incomplete; three original voice references are absent from the supplied disc.']}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('recovery',type=Path);p.add_argument('--out',required=True,type=Path);p.add_argument('--audio',required=True,type=Path);p.add_argument('--movies',required=True,type=Path);a=p.parse_args();build(a.recovery,a.out,a.audio,a.movies)

if __name__=='__main__':main()
