"""Repeatable CLANNAD reader packaging; all game content stays private."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
from vnkit import __version__
from vnkit.disc import FormatError, write_json, write_stream
from vnkit.source import Source
from .clannad_ps2 import ADAPTER_ID, ADAPTER_VERSION, GAME_ID, TITLE, detect, extract
from .clannad_script import parse_script
from .clannad_native import recover

IMPORT_REVISION = '0.3.1'

def implementation_fingerprints():
    """Pin the importer and reader used for this build without bundling assets."""
    root=Path(__file__).resolve().parents[2]
    paths=[*sorted((root/'vnkit/adapters').glob('clannad_*.py')),
           root/'vnkit/adapters/hunex.py',*sorted((root/'web/adapters').glob('clannad-*.mjs')),
           *(root/'web'/name for name in ['app.mjs','engine.mjs','statistics.mjs','navigation.mjs','scene-images.mjs','index.html','classic.css'])]
    return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}


def package_game(source, extracted, images, audio, output, movie=None, effects=None):
    source=source if isinstance(source,Source) else Source(source)
    if not detect(source)['supported']:raise FormatError('CLANNAD SLPM-66302 v1.01 required')
    extracted,images,audio,output=map(Path,(extracted,images,audio,output))
    manifest=json.loads((extracted/'manifest.json').read_text())
    if manifest.get('adapter_version')!='0.1.1':raise FormatError('Use the corrected packed-sector extraction version 0.1.1')
    picture_report=json.loads((images/'images.json').read_text())
    audio_report=json.loads((audio/'audio.json').read_text())
    audio_records=[(audio,r) for r in audio_report['records']]
    if effects:
        effects=Path(effects);effect_report=json.loads((effects/'audio.json').read_text())
        audio_records.extend((effects,r) for r in effect_report['records'])
        audio_report['failures']+=effect_report['failures']
    natives=recover(source.read_at('SLPM_663.02'),manifest['files'],lambda path:(extracted/path).read_bytes())
    from .clannad_effects import sound_names
    natives['sound_lookup']=sound_names(source)
    for event in natives['events'].values():
        if event.get('sound_name'):event['sound_asset']=natives['sound_lookup']['names'][event['sound_name']]['asset']
    assets={};scripts={};commands=Counter();diagnostics=[];image_refs=[];calls=[];selections=0;programs={};natives['condition_overrides']={}
    for record in manifest['scripts']:
        path=extracted/record['path'];name=path.name[:-4];parsed=parse_script(path.read_bytes(),name)
        if parsed['sha256']!=record['sha256']:raise FormatError('Extracted script fingerprint changed: '+name)
        programs[name]=parsed
        for instruction in parsed['instructions']:
            if instruction.get('unsupported') and instruction['op'] in ('IF__','EIF_') and instruction['argument'].startswith('(＠'):
                from .clannad_expression import probe
                result=probe(source.read_at('SLPM_663.02'),instruction['argument'])
                if result['variable_reads']:raise FormatError('Malformed condition reads native variables; cannot constant-fold')
                natives['condition_overrides'][instruction['id']]={'argument':instruction['argument'],**result,'evaluator':0x148240}

        write_json(output,'scripts/'+name+'.json',parsed)
        url='scripts/'+name+'.json';scripts[name]={'url':url,'sha256':parsed['sha256'],'instructions':len(parsed['instructions'])}
        assets['script:'+name]={'type':'script','url':url}
        diagnostics+=parsed['diagnostics']
        for i in parsed['instructions']:
            commands[i['op']]+=1
            if i.get('selection'):selections+=1
            if i['op'] in ('STBG','FADB'):
                args=i.get('args',[]);target=args[0] if i['op']=='STBG' else args[1] if len(args)>1 else None
                if target:image_refs.append((i['id'],i['op'],target))
            if i['op'] in ('FCAL','JUMP'):calls.append((i['id'],i['op'],i.get('args',[])))
    # Independently validate every label against the original SCR_ADR archive.
    from .hunex import mrg_sections
    files=manifest['files'];by_name={e['name']:e for e in files}
    def member(name):
        e=by_name[name];data=(extracted/e['path']).read_bytes()
        if hashlib.sha256(data).hexdigest()!=e['sha256']:raise FormatError('Changed source lookup '+name)
        return data
    native_labels=0
    label_sections=mrg_sections(member('SCR_ADR.MRG'))
    if len(label_sections)!=len(programs):raise FormatError('SCR_ADR scenario count mismatch')
    for (name,program),section in zip(programs.items(),label_sections):
        data=section['data'];labels={i['label']:i['offset'] for i in program['instructions'] if i.get('label')}
        if len(data)%32:raise FormatError('Native label alignment')
        for at in range(0,len(data),32):
            row=data[at:at+32]
            if not row.strip(b'\0\r\n '):continue
            label=row[:21].decode('ascii').strip();offset=int(row[25:30],16)
            if labels.get(label)!=offset:raise FormatError(f'{name}: original label offset mismatch for {label}')
            native_labels+=1
    names=member('SCR.NAM')
    natives['script_names']=[r.split(b'\0')[0].decode('ascii')+'.MZX' for r in [names[i:i+30] for i in range(0,len(names),32)] if r.strip(b'\0')]
    def copy(root,url):
        with (root/url).open('rb') as stream:return write_stream(output,url,iter(lambda:stream.read(1024*1024),b''))
    derivatives=[]
    for img in picture_report['images']:
        result=copy(images,img['asset']);ident=f'image:{img["index"]}'
        assets[ident]={'type':'image','url':img['asset'],'width':img['width'],'height':img['height']}
        derivatives.append({'id':ident,'source':img['path'],'source_sha256':img['sha256'],'sha256':result['sha256']})
        if img['codec']==9:
            pair=files[img['index']+1]
            if pair['name']!=img['name'][:-4]+'.MZU':raise FormatError('Image residual pair mismatch')
            derivatives[-1]['residual_source']={'path':pair['path'],'sha256':pair['sha256']}
    for audio_root,record in audio_records:
        if record['id'] in assets:raise FormatError('Duplicate audio identity: '+record['id'])
        result=copy(audio_root,record['url']);meta=record['metadata'];asset={'type':record['id'].split(':')[0],'url':record['url'],'sampleRate':meta['sampleRate'],'samples':meta['numberOfSamples']}
        if result['sha256']!=record['sha256']:raise FormatError('Converted audio fingerprint changed: '+record['id'])
        loop=meta.get('loopingInfo')
        if loop:
            asset['sourceLoop']=loop
            if 'start' in loop and 'end' in loop:asset.update(loopStart=loop['start']/meta['sampleRate'],loopEnd=loop['end']/meta['sampleRate'])
        assets[record['id']]=asset
        derivatives.append({'id':record['id'],'source':record['source'],'source_sha256':record['source_sha256'],'sha256':result['sha256']})
    if movie:
        movie=Path(movie);m=json.loads((movie/'movie.json').read_text());result=copy(movie,m['movie'])
        if result['sha256']!=m['movie_sha256'] or not m['audio_roundtrip_verified']:raise FormatError('Movie verification/fingerprint mismatch')
        assets['video:opening']={'type':'video','url':m['movie'],'width':m['width'],'height':m['height']}
        derivatives.append({'id':'video:opening','source':'OPENING.PSS','source_sha256':m['source_sha256'],'sha256':result['sha256']})
    for location,op,target in image_refs:
        r=natives['backgrounds' if op=='STBG' else 'sprites'].get(target.lower())
        if not r:diagnostics.append({'id':location,'issue':'Unresolved image name','target':target})
        else:
            indices=[r['archive_index']] if op=='STBG' else [r['body_index'],r['face_index']]
            for idx in indices:
                if idx is not None and f'image:{idx}' not in assets:diagnostics.append({'id':location,'issue':'Image conversion unavailable','index':idx})
    for location,op,args in calls:
        if op=='FCAL' and not 400<=int(args[0])<9000:continue
        target='SEEN'+args[0].zfill(4)+'.MZX'
        if target not in scripts:diagnostics.append({'id':location,'issue':'Unresolved script target','target':target})
        elif len(args)>1 and 'Z'+args[1] not in programs[target]['labels']:diagnostics.append({'id':location,'issue':'Unresolved call label','target':target,'label':'Z'+args[1]})
    compatibility={'status':'incomplete-runtime','summary':'Original source scripts and media; native events and full-route fidelity remain incomplete.',
        'script_count':len(scripts),'command_count':sum(commands.values()),'choice_expressions':selections,'source_label_offsets_verified':native_labels,
        'unsupported_images':len(picture_report['unsupported']),'audio_failures':len(audio_report['failures']),
        'original_engine_comparison':'unverified','full_routes':'unverified'}
    content={'format':'vnkit.content','version':1,'id':GAME_ID,'title':TITLE,'language':'ja','viewport':{'width':640,'height':448},
        'adapter':{'id':ADAPTER_ID,'version':ADAPTER_VERSION,'importRevision':IMPORT_REVISION},'runtime':{'id':'clannad-ps2-hunex','version':1,'entry':natives['entry'],'scripts':scripts},
        'nativeData':natives,'assets':assets,'compatibility':compatibility}
    write_json(output,'content.json',content)
    write_json(output,'compatibility.json',{'compatibility':compatibility,'commands':dict(commands),'diagnostics':diagnostics,
        'unsupported_images':picture_report['unsupported'],'audio_failures':audio_report['failures']})
    write_json(output,'manifest.json',{'format':'vnkit.import-manifest','version':1,'tool_version':__version__,'adapter':content['adapter'],
        'implementation_sha256':implementation_fingerprints(),
        'source':manifest['source'],'runtime':content['runtime'],'settings':{'native_resolution':True,'audio':'vgmstream-r2117 PCM16 to lossless FLAC'},
        'warnings':['Not a faithful full-game port; consult compatibility.json and docs/clannad-runtime.md'],'asset_mappings':derivatives})
    return {'status':compatibility['status'],'gameId':GAME_ID,'scripts':len(scripts),'images':len(picture_report['images']),
            'audio':len(audio_records),'diagnostics':len(diagnostics),'output':str(output)}


def import_game(source, output, work=None):
    from .clannad_media import convert_resources
    from .clannad_audio import convert
    if work is None:work=Path(output).resolve().parent.parent/'clannad-work'
    work=Path(work);source=Source(source)
    extracted=work/'resources-v2';images=work/'media-v3';audio=work/'audio-v1'
    extract(source,extracted)
    convert_resources(extracted,images)
    convert(source,audio)
    from .clannad_effects import convert as effects_convert
    effects=work/'effects-v1';effects_convert(source,effects)
    from .clannad_movie import convert as movie_convert
    movie=work/'movie-v1';movie_report=movie/'movie.json'
    if not movie_report.exists():
        write_stream(work/'movie-source','OPENING.PSS',source.chunks('OPENING.PSS'))
        movie_convert(work/'movie-source'/'OPENING.PSS',movie)
    return package_game(source,extracted,images,audio,output,movie,effects)


if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--work',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    try:print(json.dumps(package_game(a.source,a.work/'resources-v2',a.work/'media-v3',a.work/'audio-v1',a.out,a.work/'movie-v1' if (a.work/'movie-v1'/'movie.json').exists() else None,a.work/'effects-v1' if (a.work/'effects-v1'/'audio.json').exists() else None),ensure_ascii=False))
    except (ValueError,OSError) as error:p.exit(2,str(error)+'\n')
