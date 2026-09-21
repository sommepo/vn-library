"""SLPS-25222 v1.04: safe extraction and source-evidenced static recovery.

This adapter deliberately does not claim an executable story conversion. Native
schedule/statistic/minigame functions and the VM still require implementation.
"""
from __future__ import annotations
from dataclasses import asdict, dataclass
from pathlib import Path
from collections import Counter
import hashlib
import json
import struct

from vnkit.disc import IsoImage, DiscEntry, FormatError, safe_name, write_bytes, write_stream, write_json, sha256_file

ADAPTER_ID = 'pia-ps2'
ADAPTER_VERSION = '0.1.0'
GAME_ID = 'pia3-round-summer-slps25222-1.04'
TITLE = 'Piaキャロットへようこそ!!3 ～round summer～'

class Source:
    def __init__(self, source):
        self.path = Path(source)
        self.iso = None if self.path.is_dir() else IsoImage(self.path)
        if self.iso:
            self.entries = {e.path: e for e in self.iso.entries if not e.directory}
        else:
            self.entries = {}
            for p in sorted(self.path.rglob('*')):
                if p.is_symlink():
                    raise FormatError(f'symlink input is unsupported: {p}')
                if p.is_file():
                    n = safe_name(p.relative_to(self.path).as_posix())
                    self.entries[n] = DiscEntry(n, 0, p.stat().st_size)

    def read_at(self, name, offset=0, size=None):
        e = self.entries[name]
        size = e.size - offset if size is None else size
        if offset < 0 or size < 0 or offset+size > e.size or size > 64*1024*1024:
            raise FormatError(f'bounded read failed: {name}@{offset:#x}+{size}')
        path = self.path if self.iso else self.path / name
        with path.open('rb') as f:
            f.seek(e.offset + offset)
            data = f.read(size)
        if len(data) != size:
            raise FormatError(f'truncated source: {name}')
        return data

    def chunks(self, name, offset=0, size=None):
        e = self.entries[name]; size = e.size-offset if size is None else size
        if offset < 0 or size < 0 or offset+size > e.size:
            raise FormatError(f'archive extent out of bounds: {name}')
        path = self.path if self.iso else self.path/name
        with path.open('rb') as f:
            f.seek(e.offset+offset)
            while size:
                data=f.read(min(size,1024*1024))
                if not data: raise FormatError(f'truncated source: {name}')
                size-=len(data); yield data

    def fingerprint(self):
        if self.iso:
            return {'type': 'iso', 'size': self.path.stat().st_size, 'sha256': sha256_file(self.path)}
        files=[]
        for name,e in self.entries.items():
            files.append({'path':name,'size':e.size,'sha256':sha256_file(self.path/name)})
        return {'type':'directory','files':files,'sha256':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest()}

@dataclass(frozen=True)
class NfpEntry:
    name: str
    offset: int
    size: int
    index: int


def nfp_entries(source: Source, name: str) -> list[NfpEntry]:
    head=source.read_at(name,0,0x40)
    if not head.startswith(b'NFP2.0 (c)NOBORI '):
        raise FormatError(f'{name}: unknown NFP signature')
    count, toc, data_start=struct.unpack_from('<III',head,0x34)
    if toc != 0x800 or count > 100000 or toc+count*32 > data_start or data_start>source.entries[name].size:
        raise FormatError(f'{name}: invalid NFP table geometry')
    table=source.read_at(name,toc,count*32)
    result=[]; used=set(); previous=data_start
    for i in range(count):
        record=table[i*32:(i+1)*32]
        raw=record[:24].split(b'\0',1)[0]
        filename=safe_name(raw.decode('ascii','strict'))
        if '/' in filename or filename.casefold() in used:
            raise FormatError(f'{name}: duplicate or nested NFP name: {filename}')
        used.add(filename.casefold())
        offset,size=struct.unpack_from('<II',record,24)
        if offset < previous or offset+size>source.entries[name].size:
            raise FormatError(f'{name}:{filename}: overlapping/out-of-bounds NFP extent')
        previous=offset+size
        result.append(NfpEntry(filename,offset,size,i))
    return result


def detect(source) -> dict:
    source = source if isinstance(source,Source) else Source(source)
    if 'SYSTEM.CNF' not in source.entries:
        return {'supported':False,'reason':'SYSTEM.CNF missing'}
    cnf=source.read_at('SYSTEM.CNF').decode('ascii','strict')
    match = 'SLPS_252.22;1' in cnf and 'VER = 1.04' in cnf and 'NSCR.NFP' in source.entries
    return {'supported':match,'game_id':GAME_ID if match else None,'title':TITLE if match else None,
            'platform':'PlayStation 2','serial':'SLPS-25222' if match else None,
            'edition':'Japanese standard edition, executable version 1.04' if match else 'unrecognised',
            'confidence':'high' if match else 'unknown','evidence':{'SYSTEM.CNF':cnf},
            'engine':'NOBORI NFP2.0 + SCRP bytecode/native PS2 functions' if match else 'unknown'}

# Widths are checked against the named __scrCmd handlers in the supplied ELF.
# b=byte, h=little-endian word, I=little-endian dword. These decode operands;
# they do not implement state, signed arithmetic, calls, or native behaviour.
OPS={
 0x10:('SKIP','h'),0x11:('JUMP','I'),0x12:('JUMPZ','bI'),0x13:('CALL','I'),0x14:('RET',''),0x15:('SWITCH','bb'),
 0x20:('MOV','bb'),0x21:('MOVI','bI'),0x22:('MOVA','bI'),0x28:('PUSH','b'),0x29:('PUSHI','I'),0x2a:('POP','b'),
 0x30:('ADD','bb'),0x31:('ADDI','bI'),0x32:('SUB','bb'),0x33:('SUBI','bI'),0x34:('MUL','bb'),0x35:('MULI','bI'),
 0x36:('DIV','bb'),0x37:('DIVI','bI'),0x38:('SUR','bb'),0x39:('SURI','bI'),0x3a:('INC','b'),0x3b:('DEC','b'),0x3c:('NEG','b'),
 0x40:('AND','bb'),0x41:('ANDI','bI'),0x42:('OR','bb'),0x43:('ORI','bI'),0x44:('XOR','bb'),0x45:('XORI','bI'),0x46:('NOT','b'),
 0x50:('LAND','bb'),0x51:('LANDI','bI'),0x52:('LOR','bb'),0x53:('LORI','bI'),0x54:('LNOT','b'),
 0x58:('LT','b'),0x59:('LE','b'),0x5a:('GT','b'),0x5b:('GE','b'),0x5c:('EQ','b'),0x5d:('NE','b'),
 0x60:('INTVECT','bI'),0x61:('INT','b'),0x62:('RESUME',''),0x63:('INTON',''),0x64:('INTOFF',''),
 0x70:('LDGNVAR','hb'),0x71:('LDGSVAR','hb'),0x72:('LDLNVAR','bb'),0x73:('LDLSVAR','bb'),
 0x78:('STRADD','bb'),0x79:('STRFREE','b'),0x80:('FUNC','I'),0x8f:('EXIT','')}


def parse_script(data: bytes, name: str) -> dict:
    """Recover all bytecode boundaries and relocation names without execution."""
    if data[:4]!=b'SCRP' or data[8:12]!=b'CODE' or len(data)<22:
        raise FormatError(f'{name}: expected SCRP/CODE')
    declared=struct.unpack_from('<I',data,4)[0]
    code_size=struct.unpack_from('<I',data,12)[0]
    if code_size<6 or 16+code_size+4>len(data):
        raise FormatError(f'{name}: invalid CODE size')
    stack_size,nvars,svars=struct.unpack_from('<HHH',data,16)
    code=data[22:16+code_size]
    chunks=[]; relocations={}; cursor=16+code_size
    while True:
        if cursor+4>len(data): raise FormatError(f'{name}@{cursor:#x}: no TERM')
        kind=data[cursor:cursor+4].decode('ascii','strict')
        if kind=='TERM': break
        if kind not in ('NVAR','SVAR','FUNC') or cursor+8>len(data):
            raise FormatError(f'{name}@{cursor:#x}: unknown chunk {kind!r}')
        start=cursor; nominal=struct.unpack_from('<I',data,cursor+4)[0];cursor+=8
        entries=[]
        while True:
            end=data.find(b'\0',cursor,min(len(data),cursor+256))
            if end<0: raise FormatError(f'{name}@{cursor:#x}: invalid relocation name')
            symbol=data[cursor:end].decode('ascii','strict');cursor=end+1
            if not symbol:break
            offsets=[]
            while True:
                if cursor+4>len(data):raise FormatError(f'{name}: truncated relocation list')
                offset=struct.unpack_from('<I',data,cursor)[0];cursor+=4
                if offset==0:break
                if offset+ (4 if kind=='FUNC' else 2)>len(code):
                    raise FormatError(f'{name}: {kind} relocation {offset:#x} out of CODE bounds')
                offsets.append(offset)
                if kind=='FUNC':
                    if offset in relocations:raise FormatError(f'{name}: duplicate function relocation')
                    relocations[offset]=symbol
            entries.append({'name':symbol,'offsets':offsets})
        chunks.append({'kind':kind,'offset':start,'declared_size':nominal,'actual_size':cursor-start,'entries':entries})
    instructions=[]; strings=[]; failures=[]; pos=0
    while pos<len(code):
        start=pos;op=code[pos];pos+=1
        # Compiler emits trailing zero bytes outside its final EXIT instruction.
        if op==0 and all(b==0 for b in code[start:]) and instructions and instructions[-1]['op']=='EXIT':
            break
        if op not in OPS:
            failures.append({'offset':22+start,'code_offset':start,'opcode':op,'reason':'unknown opcode; decoding stopped'})
            break
        mnemonic,layout=OPS[op];args=[]
        for field in layout:
            width={'b':1,'h':2,'I':4}[field]
            if pos+width>len(code):raise FormatError(f'{name}@{22+start:#x}: truncated {mnemonic}')
            args.append(int.from_bytes(code[pos:pos+width],'little'));pos+=width
        instruction={'id':f'{name}:code:{start:08x}','offset':22+start,'code_offset':start,'opcode':op,'op':mnemonic,'args':args}
        if op==0x10:
            size=args[0]
            if pos+size>len(code):raise FormatError(f'{name}@{22+start:#x}: SKIP data exceeds CODE')
            raw=code[pos:pos+size]
            if raw.endswith(b'\0') and b'\0' not in raw[:-1]:
                string={'id':f'{name}:string:{pos:08x}','offset':22+pos,'code_offset':pos,'raw_hex':raw[:-1].hex()}
                try:
                    string['text']=raw[:-1].decode('cp932','strict')
                    string['encoding']='cp932'
                    string['private_use_codepoints']=[hex(ord(c)) for c in string['text'] if 0xe000<=ord(c)<=0xf8ff]
                except UnicodeDecodeError as error:
                    string['decode_error']=str(error)
                strings.append(string)
                instruction['string_id']=string['id']
            else:
                instruction['data_hex']=raw.hex()
            pos+=size
        elif op==0x15:
            count=args[1]
            if pos+count*8>len(code):raise FormatError(f'{name}@{22+start:#x}: SWITCH table exceeds CODE')
            instruction['cases']=[{'value':struct.unpack_from('<I',code,pos+i*8)[0],'target':struct.unpack_from('<I',code,pos+i*8+4)[0]} for i in range(count)]
            pos+=count*8
        elif op==0x80:
            instruction['native']=relocations.get(start+1)
            if instruction['native'] is None:failures.append({'offset':22+start,'reason':'FUNC has no relocation name'})
        instruction['size']=pos-start
        instructions.append(instruction)
    boundaries={i['code_offset'] for i in instructions}
    for i in instructions:
        targets=[]
        if i['op'] in ('JUMP','CALL'):targets=[i['args'][0]]
        elif i['op'] in ('JUMPZ','INTVECT'):targets=[i['args'][1]]
        elif i['op']=='SWITCH':targets=[c['target'] for c in i['cases']]
        for target in targets:
            if target not in boundaries:
                failures.append({'offset':i['offset'],'reason':f'control target {target:#x} is not a decoded instruction boundary'})
    used_relocations={i['code_offset']+1 for i in instructions if i['op']=='FUNC'}
    for offset,symbol in relocations.items():
        if offset not in used_relocations:failures.append({'offset':22+offset,'reason':f'orphan FUNC relocation {symbol}'})
    return {'source':name,'sha256':hashlib.sha256(data).hexdigest(),'declared_size':declared,'code_size':len(code),
            'trailing_zero_padding_bytes':len(code)-pos+1 if pos<len(code) and code[pos-1:]==b'\0'*(len(code)-pos+1) else 0,
            'stack_bytes':stack_size,'local_number_variables':nvars,'local_string_variables':svars,
            'chunks':chunks,'instructions':instructions,'strings':strings,'failures':failures,
            'status':'static-only','execution_implemented':False}


def inspect(source, fingerprint=False):
    src=Source(source); identification=detect(src)
    archives=[]
    for name in src.entries:
        if name.endswith('.NFP'):
            entries=nfp_entries(src,name)
            extensions=Counter(Path(e.name).suffix for e in entries)
            archives.append({'name':name,'size':src.entries[name].size,'entry_count':len(entries),
                             'extensions':dict(extensions),'entries':[asdict(e) for e in entries]})
    result={'format_version':1,'adapter':ADAPTER_ID,'adapter_version':ADAPTER_VERSION,
            'identification':identification,'disc':src.iso.inspect() if src.iso else {'format':'directory'},'archives':archives}
    if fingerprint:result['source']=src.fingerprint()
    return result


def extract(source, destination):
    src=Source(source); destination=Path(destination); outputs=[]
    for name in src.entries:
        if name.endswith('.NFP'):
            for e in nfp_entries(src,name):
                item=write_stream(destination, f'{name}/{e.name}',src.chunks(name,e.offset,e.size))
                item['source']={'disc_path':name,'archive_index':e.index,'archive_offset':e.offset}
                outputs.append(item)
        else:
            item=write_stream(destination,name,src.chunks(name));item['source']={'disc_path':name};outputs.append(item)
    # Do not serialize transient created/unchanged state into a repeatable manifest.
    manifest={'format_version':1,'adapter':ADAPTER_ID,'adapter_version':ADAPTER_VERSION,'source':src.fingerprint(),
              'files':[{k:v for k,v in x.items() if k!='status'} for x in outputs]}
    write_json(destination,'extraction-manifest.json',manifest)
    return manifest


def font_glyph_evidence(font: bytes) -> tuple[dict, bytes]:
    """Recover exact custom source glyph pixels; do not guess Unicode semantics."""
    from .pia_media import _png
    if not font.startswith(b'NFT Ver1.0 ') or len(font)<0x60:
        raise FormatError('unknown NFT font')
    width,height,bpp,count,table,data_start,stride=struct.unpack_from('<IIIIIII',font,0x20)
    if (width,height,bpp,stride)!=(24,25,2,150):
        raise FormatError('unsupported NFT glyph geometry')
    codes=[0xf040,0xf057,0xf05e]
    pixels=bytearray();glyphs=[]
    for code in codes:
        index=code-0xcf90
        start=data_start+index*stride
        if start+stride>len(font):raise FormatError('NFT custom glyph extent exceeds input')
        glyphs.append({'sjis_hex':f'{code:04x}','cp932_codepoint':f'U+{ord(code.to_bytes(2,"big").decode("cp932")):04X}',
                       'font_index':index,'font_offset':start,'unicode_semantics':'unmapped; preserve source glyph'})
    for row in range(height):
        for glyph in glyphs:
            start=glyph['font_offset']+row*6
            for value in font[start:start+6]:
                for shift in (6,4,2,0):pixels.extend([((value>>shift)&3)*85]*3)
    return {'source':'NETC.NFP/FNT24X25.NFT','glyphs':glyphs,'width':width,'height':height,'bpp':bpp,
            'index_evidence':'ELF _NnftGetFntIndex 0x00144294..0x001442d4: F040..F0FF index = code - 0xCF90'},_png(width*len(codes),height,3,bytes(pixels))


def convert_media(src: Source, out: Path):
    """Validate every MLH member and convert supported images; no scene ordering."""
    from .pia_media import read_mlh, convert_entry, nbp_info, MediaError
    assets=[];failures=[];counts=Counter()
    for archive in src.entries:
        if not archive.endswith('.NFP'):continue
        for entry in nfp_entries(src,archive):
            if not entry.name.endswith(('.MLH','.NBP','.NFT')):continue
            origin={'archive':archive,'member':entry.name,'archive_offset':entry.offset,'archive_size':entry.size}
            try:
                raw=src.read_at(archive,entry.offset,entry.size)
                if entry.name.endswith('.NFT'):
                    info,png=font_glyph_evidence(raw)
                    write_json(out,'analysis/custom-glyphs.json',info)
                    write_bytes(out,'analysis/custom-glyphs.png',png)
                    counts['custom_glyphs']=len(info['glyphs']);continue
                if entry.name.endswith('.MLH'):
                    members=read_mlh(raw);counts['mlh_decoded']+=1
                else:members=[{'name':entry.name,'data':raw,'offset':0}]
                for member in members:
                    counts['mlh_members']+=1
                    if not member['name'].lower().endswith('.nbp'):continue
                    provenance={**origin,'inner_name':member['name'],'inner_offset':member['offset']}
                    try:
                        png=convert_entry(member['data'],member['name']); info=nbp_info(member['data'])
                        name=f"assets/{archive}/{entry.name}/{safe_name(member['name'])}.png"
                        created=write_bytes(out,name,png)
                        assets.append({'id':f"{archive}:{entry.name}:{member['name']}",'path':name,
                                       'sha256':created['sha256'],'source':provenance,'image':info})
                        counts['images_converted']+=1
                    except (MediaError,FormatError) as error:
                        failures.append({'source':provenance,'reason':str(error)})
            except (MediaError,FormatError) as error:
                failures.append({'source':origin,'reason':str(error)})
    return assets, failures, dict(counts)


def import_game(source, out, media=True):
    src=Source(source);out=Path(out);identification=detect(src)
    if not identification['supported']:raise FormatError('pia-ps2 supports only SLPS-25222 SYSTEM.CNF version 1.04')
    inventory=inspect(source,fingerprint=True)
    write_json(out,'inventory.json',inventory)
    from vnkit.elf import Elf32
    elf=Elf32(src.read_at('SLPS_252.22'))
    elf_report=elf.evidence()
    write_json(out,'analysis/elf-evidence.json',elf_report)
    totals=Counter();native=Counter();errors=[];scripts=[];assets=[]
    for entry in nfp_entries(src,'NSCR.NFP'):
        try:
            parsed=parse_script(src.read_at('NSCR.NFP',entry.offset,entry.size),entry.name)
            write_json(out,f'analysis/scripts/{entry.name}.json',parsed)
            for i in parsed['instructions']:
                totals['instructions']+=1
                if i.get('native'):native[i['native']]+=1
            totals['strings']+=len(parsed['strings'])
            totals['strict_cp932_decoded_strings']+=sum('text' in s for s in parsed['strings'])
            totals['private_use_strings']+=sum(bool(s.get('private_use_codepoints')) for s in parsed['strings'])
            totals['japanese_strings']+=sum(any(ord(c)>127 for c in s.get('text','')) for s in parsed['strings'])
            for error in parsed['failures']:errors.append({'script':entry.name,**error})
            for s in parsed['strings']:
                if 'decode_error' in s:errors.append({'script':entry.name,'offset':s['offset'],'reason':s['decode_error']})
            scripts.append({'name':entry.name,'sha256':parsed['sha256'],'instructions':len(parsed['instructions']),
                            'strings':len(parsed['strings']),'parse_failures':len(parsed['failures'])})
        except (FormatError,UnicodeError) as error:
            errors.append({'script':entry.name,'reason':str(error)})
    totals['scripts_discovered']=len(nfp_entries(src,'NSCR.NFP'));totals['scripts_parsed']=len(scripts)
    media_errors=[];media_counts={}
    if media:assets,media_errors,media_counts=convert_media(src,out)
    entrypoint={'script':'OPEN01.SPC','confidence':'high; static dataflow, original execution unverified',
                'evidence':[{'elf_address':0x13d268,'literal_address':0x1f76c0,'literal':'OPEN01','function':'_NopeningCtrl'},
                            {'elf_address':0x13d800,'call':'_SetNscrExec','argument':'controller scenario at +0x0e'}],
                'first_native_call':{'script_offset':0x2d,'code_offset':0x17,'native':'EnterScenario'},
                'first_state_dependency':{'script_offset':0x3f,'code_offset':0x29,'native':'GetSysGameClear'},
                'first_condition':{'script_offset':0x4e,'code_offset':0x38,'op':'JUMPZ','target_code_offset':0x10e},
                'first_text_call':{'script_offset':0x35e,'code_offset':0x348,'native':'Mess'}}
    report={'format_version':1,'adapter':ADAPTER_ID,'adapter_version':ADAPTER_VERSION,'game_id':GAME_ID,'title':TITLE,
            'status':'blocked','faithful_port':False,'source':inventory['source'],'identification':identification,
            'achievements':{'disc_opened':True,'archive_indexes_validated':True,'static_scripts_recovered':len(scripts)>0,
                            'story_execution':False,'presentation_execution':False},
            'coverage':dict(totals),'scripts':scripts,'native_functions':dict(sorted(native.items())),
            'parse_failures':errors,'assets':assets,'media_coverage':media_counts,'media_failures':media_errors,'entrypoint':entrypoint,
            'blockers':['SCRP VM execution and native presentation/control functions are not implemented.',
                        'Native scheduling, work, character statistics and minigames affect state; linear text concatenation would change the game.',
                        'Original-engine behavioural comparison has not been performed; ISO executables were never run.'],
            'warnings':['Decoded strings are static source data, not dialogue proven presented in story order.',
                        f"{totals['private_use_strings']} strings contain custom CP932 private glyphs F040/F057/F05E; semantic Unicode mapping is unresolved.",
                        'Ruby/custom control semantics and audio-to-dialogue associations require execution-level verification.',
                        'All parsed native calls remain unsupported for execution; see source-located analysis/scripts/*.json.'],
            'missing_data':['No missing disc resource established. A user-supplied PS2 BIOS would be needed for a conventional PCSX2 reference run; BIOS is not part of the ISO.']}
    content={'format':'vnkit.content','version':1,'id':GAME_ID,'title':TITLE,
             'adapter':{'id':ADAPTER_ID,'version':ADAPTER_VERSION},'entry':'blocked',
             'instructions':[{'id':'blocked','op':'unsupported','source':{'script':'OPEN01.SPC','offset':45},
                              'reason':'Story execution is blocked at OPEN01.SPC+0x2D (EnterScenario). The next native state query GetSysGameClear at +0x3F controls a branch before dialogue. SCRP VM/native functions, original system state, music sequencing and presentation have not been implemented.'}],
             'assets':{a['id']:{'url':a['path'],'type':'image'} for a in assets},
             'compatibility':{'status':'blocked','summary':f"Static recovery: {len(scripts)}/1118 scripts, {totals['instructions']:,} decoded instructions, {totals['strict_cp932_decoded_strings']:,} CP932 strings; {len(assets)} converted images. Story execution: unavailable.",
                              'reportUrl':f'/content/{GAME_ID}/compatibility.json'}}
    write_json(out,'content.json',content)
    write_json(out,'compatibility.json',report)
    write_json(out,'manifest.json',{'format_version':1,'tool':'vnkit','tool_version':'0.1.0','adapter':ADAPTER_ID,
                                 'adapter_version':ADAPTER_VERSION,'source':inventory['source'],'game_id':GAME_ID,
                                 'settings':{'encoding':'strict cp932','artwork_upscale':False,'analysis_only':True,'convert_supported_images':media},
                                 'warnings':report['warnings'],'asset_mappings':assets,'status':'blocked'})
    return report
