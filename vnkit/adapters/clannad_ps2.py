"""SLPM-66302 v1.01 disc adapter. Original inputs are read only."""
import argparse
from collections import Counter
from pathlib import Path
import json
import struct
from vnkit.disc import FormatError, safe_name, write_bytes, write_stream, write_json
from vnkit.source import Source
from .hunex import decompress_mzx

ADAPTER_ID = 'clannad-ps2'
ADAPTER_VERSION = '0.1.1'
GAME_ID = 'clannad-slpm66302-1.01'
TITLE = 'CLANNAD — クラナド'


def detect(source):
    source = source if isinstance(source,Source) else Source(source)
    cnf = source.read_at('SYSTEM.CNF').decode('ascii') if 'SYSTEM.CNF' in source.entries else ''
    match = 'SLPM_663.02;1' in cnf and 'VER = 1.01' in cnf and all(n in source.entries for n in ['ALLPAC.HED','ALLPAC.MRG','ALLPAC.NAM'])
    return {'supported':match, 'game_id':GAME_ID if match else None, 'title':TITLE if match else None,
        'platform':'PlayStation 2', 'serial':'SLPM-66302' if match else None,
        'edition':'Japanese original release, executable v1.01' if match else 'unrecognised',
        'confidence':'high' if match else 'unknown', 'evidence':{'SYSTEM.CNF':cnf},
        'engine':'HuneX MRG/HED/NAM, MZX-compressed command scripts' if match else 'unknown'}


def verify_import_source(source):
    from .clannad_native import verify_executable
    source = source if isinstance(source, Source) else Source(source)
    verify_executable(source.read_at('SLPM_663.02'))


def allpac_entries(source):
    hed, nam = source.read_at('ALLPAC.HED'), source.read_at('ALLPAC.NAM')
    if len(hed)%8 or len(nam)%32:
        raise FormatError('invalid ALLPAC index alignment')
    result=[]
    for i in range(len(hed)//8):
        raw_offset, sectors, low_size = struct.unpack_from('<IHH',hed,i*8)
        if raw_offset == 0xffffffff:
            if any(v != 255 for v in hed[i*8:]):
                raise FormatError('non-terminator after ALLPAC terminator')
            return result
        record = nam[i*32:(i+1)*32]
        if len(record)!=32 or record[-2:]!=b'\r\n':
            raise FormatError(f'ALLPAC name {i}: invalid record')
        name = safe_name(record[:30].split(b'\0')[0].decode('ascii'))
        # This PS2 layout packs sector bits16..19 into dword bits28..31.
        # The first wrap is 0x0000ff9f +142 sectors -> 0x1000002d.
        if raw_offset & 0x0fff0000:
            raise FormatError(f'ALLPAC entry {i}: unknown packed address bits')
        offset = ((raw_offset & 65535) | ((raw_offset >> 28) << 16))*2048
        size = ((sectors*2048)&~65535) | low_size
        if size > sectors*2048: size -= 65536
        if size<0 or offset+sectors*2048 > source.entries['ALLPAC.MRG'].size:
            raise FormatError(f'ALLPAC entry {i}: invalid extent')
        result.append({'index':i,'name':name,'offset':offset,'size':size,
            'storage_size':sectors*2048,'raw_offset':raw_offset,'path':f'ALLPAC/{i:05d}/{name}'})
    raise FormatError('ALLPAC index has no terminator')


def inspect(source, fingerprint=False):
    source = source if isinstance(source,Source) else Source(source)
    identification = detect(source)
    if not identification['supported']: raise FormatError('Expected SLPM-66302 v1.01')
    entries = allpac_entries(source)
    result = {'identification':identification,'archives':{'ALLPAC':{'entries':len(entries),
        'extensions':dict(Counter(Path(e['name']).suffix for e in entries)),
        'packed_sector_address':True}},'entries':entries}
    if fingerprint: result['source'] = source.fingerprint()
    return result


def extract(source, output):
    source = source if isinstance(source,Source) else Source(source)
    report = inspect(source)
    records, scripts, failures = [], [], []
    for entry in report['entries']:
        record = write_stream(output,entry['path'],source.chunks('ALLPAC.MRG',entry['offset'],entry['size']))
        record.pop('status',None); records.append({**entry,**record})
        if entry['name'].upper().startswith('SEEN') and entry['name'].upper().endswith('.MZX'):
            try:
                raw = source.read_at('ALLPAC.MRG',entry['offset'],entry['size'])
                decoded,meta = decompress_mzx(raw)
                decoded.decode('cp932','strict')
                path = f'scripts/{entry["name"]}.bin'
                item=write_bytes(output,path,decoded);item.pop('status',None)
                scripts.append({**item,**meta,'archive_index':entry['index'],'source':entry['path']})
            except (ValueError,UnicodeError) as error:
                failures.append({'source':entry['path'],'error':str(error)})
    result={'format':'vnkit.clannad-extraction','version':1,'adapter':ADAPTER_ID,'adapter_version':ADAPTER_VERSION,
        'source':source.fingerprint(),'files':records,'scripts':scripts,'failures':failures}
    write_json(Path(output),'manifest.json',result)
    return {'entries':len(records),'scripts':len(scripts),'failures':failures,'manifest':str(Path(output)/'manifest.json')}


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('operation',choices=['inspect','extract']);p.add_argument('source',type=Path);p.add_argument('--out',type=Path);a=p.parse_args()
    try:
        if a.operation=='extract' and not a.out:p.error('extract requires --out')
        result=inspect(a.source,True) if a.operation=='inspect' else extract(a.source,a.out)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return 3 if result.get('failures') else 0
    except (ValueError,OSError,KeyError) as e:p.exit(2,f'clannad-ps2: {e}\n')


if __name__=='__main__':raise SystemExit(main())
