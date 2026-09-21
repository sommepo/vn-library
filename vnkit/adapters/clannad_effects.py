"""CLANNAD's SE.ACX effects and native SE_NAM lookup, separate from voice cache."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
from vnkit.disc import FormatError
from vnkit.source import Source
from .hunex import mrg_sections


def acx_entries(source):
    header=source.read_at('SE.ACX',0,8)
    reserved,count=struct.unpack('>II',header)
    if reserved or not 0<count<=10000:raise FormatError('Invalid SE.ACX header')
    table=source.read_at('SE.ACX',8,count*8);end=8+count*8;entries=[]
    for i,(offset,size) in enumerate(struct.iter_unpack('>II',table)):
        if offset<end or size<40 or offset+size>source.entries['SE.ACX'].size:raise FormatError(f'SE.ACX:{i}: unsafe extent')
        if source.read_at('SE.ACX',offset,2)!=b'\x80\0':raise FormatError('SE.ACX member is not CRI audio')
        entries.append({'bank':'SE.ACX','index':i,'effect_id':10000+i,'offset':offset,'size':size});end=offset+size
    return entries


def sound_names(source):
    raw=source.read_at('SE_NAM.MRG');parts=mrg_sections(raw)
    if len(parts)!=4:raise FormatError('Expected four SE_NAM sections')
    names={};counts={}
    # Native 0x122008 searches section 3 first (10000+index), then section 2.
    for bank,base in [(3,10000),(2,0)]:
        data=parts[bank]['data'];ended=False;count=0
        if len(data)%32:raise FormatError('SE_NAM record alignment')
        for i in range(0,len(data),32):
            row=data[i:i+32]
            if not row.strip(b'\0'):ended=True;continue
            if ended or row[30:]!=b'\r\n':raise FormatError('Malformed SE_NAM terminator/record')
            name=row[:28].split(b'\0',1)[0].decode('ascii','strict')
            if not name or name!=name.upper():raise FormatError('Invalid native SE name')
            names.setdefault(name,{'asset':f'sound:{base+i//32}','bank':'SE.ACX' if bank==3 else 'VSE.AFS','index':i//32})
            count+=1
        if not ended:raise FormatError('Missing SE_NAM terminator')
        counts[bank]=count
    if counts[3]!=len(acx_entries(source)):raise FormatError('SE_NAM/ACX count mismatch')
    from .clannad_audio import afs_entries
    if counts[2]!=len(afs_entries(source,'VSE.AFS')):raise FormatError('SE_NAM/VSE count mismatch')
    return {'names':names,'source':'SE_NAM.MRG','source_sha256':hashlib.sha256(raw).hexdigest(),
            'evidence':{'lookup':0x122008,'play':0x10bff8,'acx_id_base':10000,'priority':[3,2]}}


def convert(source,output):
    source=source if isinstance(source,Source) else Source(source)
    sound_names(source) # Require independent source name/count agreement.
    from .clannad_audio import convert as decode
    return decode(source,output,entries=acx_entries(source))


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
    try:
        result=convert(a.source,a.out);print(json.dumps(result));raise SystemExit(3 if result['failures'] else 0)
    except (OSError,ValueError) as error:p.exit(2,str(error)+'\n')
