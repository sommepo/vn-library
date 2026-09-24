"""Read-only recovery of Cartagra PS2 SLPM-66231 v1.01.

The DAT layout was identified using punk7890's MIT PS2 Visual Novel Tool
(src/scenes/kid.gd); this edition's sizes are 1024-byte units, confirmed by
contiguous extents through the exact end of every supplied DAT archive.
This module does not claim playable execution.
"""
import hashlib
import struct
from pathlib import Path
from ..source import Source
from ..elf import Elf32
from ..disc import FormatError, write_json, write_stream, safe_name
from .cri_afs import index_afs

ADAPTER_ID = 'cartagra-ps2'
ADAPTER_VERSION = '0.1.0'
EXE = 'SLPM_662.31'
EXE_SHA256 = 'a8e7d0065bfd999125253fa1a21292ff4cd32cfb25f35d3af8f6cde21ccd74ba'
DAT = ('SCRIPT.DAT','BG.DAT','BG2.DAT','CHARA.DAT','CHARA2.DAT','SYSTEM.DAT','SOUND.DAT')
AFS = ('BGM.AFS','SE.AFS','VOICE.AFS')


def detect(source):
    s = Source(source)
    if EXE not in s.entries or 'SYSTEM.CNF' not in s.entries:
        return {'supported':False,'reason':'Cartagra SLPM-66231 not detected'}
    digest = hashlib.sha256(s.read_at(EXE)).hexdigest()
    cnf = s.read_at('SYSTEM.CNF').decode('ascii','strict')
    supported = digest == EXE_SHA256 and 'VER = 1.01' in cnf and all(n in s.entries for n in DAT+AFS)
    return {'supported':supported,'adapter':ADAPTER_ID,'adapter_version':ADAPTER_VERSION,
            'title':'Cartagra — 魂ノ苦悩','edition':'Japanese standard SLPM-66231',
            'version':'1.01','platform':'PlayStation 2','executable_sha256':digest,
            'confidence':'high; exact executable fingerprint','system_cnf':cnf,
            'engine':'KID SC3 variant; execution under investigation','playable':False,
            'reason':'Tested recovery edition' if supported else 'Untested executable or incomplete disc'}


def script_names(data):
    if hashlib.sha256(data).hexdigest() != EXE_SHA256:
        raise FormatError('Untested Cartagra executable')
    e = Elf32(data)
    names = []
    for pointer in struct.unpack('<100I',e.at(0x1995f0,400)):
        name = e.at(pointer,32).split(b'\0')[0].decode('ascii','strict')
        safe_name(name)
        if '/' in name or not name.lower().endswith('.scr') or name in names:
            raise FormatError('Invalid native Cartagra script name table')
        names.append(name)
    return names


def native_tables(data):
    """Exact-ELF data used by instruction 10:16's character-resource lookup."""
    script_names(data)  # fingerprint gate
    e=Elf32(data)
    movies = []
    # 01:13 at 0x11f6c0 indexes this pointer table, not filename order.
    for index, pointer in enumerate(struct.unpack('<5I', e.at(0x1993b8, 20))):
        raw = e.at(pointer, 32).split(b'\0')[0].decode('ascii')
        if not raw.startswith('cdrom0:\\') or not raw.endswith('.PSS;1'):
            raise FormatError('Unexpected native movie path')
        name = raw[len('cdrom0:\\'):-2]
        safe_name(name)
        movies.append({'index': index, 'name': name})
    return {'format':'vnkit.cartagra-native','version':1,'executable_sha256':EXE_SHA256,
            'byteTable':list(e.at(0x1a5ca8,2243)), 'movies':movies,
            'glyphWidths':list(e.at(0x18daf0,351))}


def index_dat(source, archive, names=None):
    s = source if isinstance(source,Source) else Source(source)
    table = s.read_at(archive,0,0x8000)
    members,end = [],0x8000
    for i,(offset,units) in enumerate(struct.iter_unpack('<II',table)):
        if not units:
            if any(table[i*8:]):raise FormatError(f'{archive}: nonzero directory tail')
            break
        offset,size = 0x8000+offset*2048,units*1024
        if offset != end or size%2048 or offset+size>s.entries[archive].size:
            raise FormatError(f'{archive}: invalid extent at member {i}')
        name = names[i] if names is not None and i<len(names) else f'{i:04d}.bin'
        members.append({'index':i,'name':name,'offset':offset,'size':size})
        end = offset+size
    else:raise FormatError(f'{archive}: unterminated directory')
    if not members or end != s.entries[archive].size or names is not None and len(members)!=len(names):
        raise FormatError(f'{archive}: unaccounted file data or wrong member count')
    return members


def inspect(source, fingerprint=False):
    identity = detect(source)
    if not identity['supported']:raise FormatError(identity['reason'])
    s = Source(source)
    names = script_names(s.read_at(EXE))
    archives = {n:index_dat(s,n,names if n=='SCRIPT.DAT' else None) for n in DAT}
    for n in AFS:
        archives[n] = index_afs(s,n,allow_stale_name_sizes=True)
    return {'identification':identity,'archives':archives,
            **({'source':s.fingerprint()} if fingerprint else {})}


def extract(source,destination):
    report = inspect(source,True)
    s = Source(source);out = Path(destination);records = []
    for archive,members in report['archives'].items():
        for member in members:
            name = member['name'] if archive in DAT else f"{member['index']:05d}-{member['name']}"
            rel = archive+'/'+name
            record = write_stream(out,rel,s.chunks(archive,member['offset'],member['size']))
            record.pop('status',None)
            records.append({'archive':archive,**member,'output':record})
    for name in (EXE,'SYSTEM.CNF','FILES.DIR'):
        write_stream(out,name,s.chunks(name))
    write_json(out,'manifest.json',{'adapter':ADAPTER_ID,'version':ADAPTER_VERSION,
        'source':report['source'],'identification':report['identification'],
        'archives':report['archives'],'members':records,'playable':False})
    return {'members':len(records),'out':str(out),'playable':False}


if __name__ == '__main__':
    import argparse
    import json
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path)
    p.add_argument('--out', type=Path, help='Safely extract all DAT/AFS members')
    p.add_argument('--fingerprint', action='store_true')
    args = p.parse_args()
    try:
        if args.out: result = extract(args.source,args.out)
        else:
            result = inspect(args.source,args.fingerprint)
            result['archives'] = {n:len(rows) for n,rows in result['archives'].items()}
        print(json.dumps(result,ensure_ascii=False,indent=2))
    except (OSError,ValueError) as error: p.exit(2,str(error)+'\n')
