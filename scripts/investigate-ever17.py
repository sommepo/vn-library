#!/usr/bin/env python3
"""Read-only Ever17 SLPM-65421 comparison with the owned Remember11 disc.

This produces private research, not reader content. Exit 3 means no playable
import; 2 means an input/tool failure. Existing adapters stay edition-gated.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from vnkit import __version__
from vnkit.disc import FormatError, write_bytes, write_json
from vnkit.source import Source
from vnkit.elf import Elf32
from vnkit.adapters.cri_afs import index_afs, unpack_lzss
from vnkit.adapters.remember11_ps2 import ARCHIVES, thumbnail_png
from vnkit.adapters.remember11_graphics import decode as decode_image
from vnkit.adapters.remember11_script import Script, native_metadata
from vnkit.adapters.ever17_script import Ever17Script
from vnkit.adapters.never7_ps2 import cps, ogdt_png
from vnkit.sony_sequence import inspect_sq

VERSION = '0.2.0'
EXE = 'SLPM_654.21'
EXE_SHA256 = '7bd43ef8ba43090eee7f54ef83ffdd5779834ef7b7f825c8e5a33663dc37e17b'
TABLE = 0x1e1338
COMMAND_COUNT = 0x82


def native_commands(raw):
    if hashlib.sha256(raw).hexdigest() != EXE_SHA256:
        raise FormatError('Ever17 probe requires the tested SLPM-65421 v1.01 executable')
    elf = Elf32(raw)
    commands = []
    for op in range(COMMAND_COUNT):
        handler, name, reserved = struct.unpack('<III', elf.at(TABLE + op * 12, 12))
        name = elf.at(name, 64).split(b'\0')[0].decode('ascii', 'strict')
        if reserved or not name or (not handler and op != 0x60):
            raise FormatError(f'Invalid native command directory row {op:#x}')
        if handler: elf.at(handler, 4)
        commands.append(dict(op=op, name=name, handler=handler))
    return elf, commands


def normalized_name(name):
    return name.replace('grap_', 'graph_')


def measured_fixed_steps(elf, commands):
    """Static evidence: adjacent load/add/store of the native PC field at +8.

    This is not control-flow analysis. Retain sites for review; do not use it to
    infer variable-length commands or silently override the reference parser.
    """
    starts = sorted({c['handler'] for c in commands if c['handler']})
    result = {}
    for c in commands:
        start = c['handler']
        if not start: continue
        end = next((n for n in starts if n > start), start + 256)
        if end - start > 16384: raise FormatError('Handler evidence extent exceeds bound')
        words = struct.unpack('<%dI' % ((end-start)//4), elf.at(start, end-start))
        sites = []
        for k, (a, b, d) in enumerate(zip(words, words[1:], words[2:])):
            reg, base = (a >> 16) & 31, (a >> 21) & 31
            if (a >> 26 == 0x23 and a & 65535 == 8 and b >> 26 == 9
                    and (b >> 21) & 31 == reg and (b >> 16) & 31 == reg
                    and d >> 26 == 0x2b and d & 65535 == 8
                    and (d >> 21) & 31 == base and (d >> 16) & 31 == reg):
                sites.append({'site': start + 4*k, 'bytes': b & 65535})
        if sites: result[str(c['op'])] = sites
    return result


def bank_sequence(data):
    if len(data) < 16 or struct.unpack_from('<I', data)[0] != 3:
        raise FormatError('Not a three-section KID Sony bank')
    relative = struct.unpack_from('<3I', data, 4)
    variants = []
    for unit in (4, 16):
        offsets = [16 + unit * v for v in relative] + [len(data)]
        if (offsets == sorted(offsets) and offsets[0] == 16
                and data[offsets[1]:offsets[1]+8] == b'IECSsreV'
                and data[offsets[1]+16:offsets[1]+24] == b'IECSdaeH'):
            variants.append((unit, offsets))
    if len(variants) != 1: raise FormatError('Ambiguous bank section layout')
    unit, offsets = variants[0]
    seq = inspect_sq(data[offsets[0]:offsets[1]], require_loop=False)
    return {'offset_unit': unit, 'sequence': seq}


def run(source, reference, out, images=False, scripts_only=False):
    s, ref = Source(source), Source(reference)
    cnf = s.read_at('SYSTEM.CNF').decode('ascii', 'strict')
    if EXE not in cnf or '1.01' not in cnf:
        raise FormatError('Expected Ever17 SLPM-65421 v1.01 SYSTEM.CNF')
    raw = s.read_at(EXE)
    elf, commands = native_commands(raw)
    reference_raw = ref.read_at('SLPM_655.50')
    baseline = native_metadata(reference_raw)['commands']
    reference_elf = Elf32(reference_raw)
    mapping = {}
    paired = []
    trial_commands = [dict(c) for c in baseline]
    reference_names = {normalized_name(c['name']):c for c in baseline}
    for c in commands:
        if not c['handler']: continue
        old = reference_names.get(normalized_name(c['name']))
        if old is None:
            paired.append(dict(sourceOp=c['op'],name=c['name'],handler=c['handler'],
                               status='unmapped; requires edition-specific semantics'))
            continue
        canonical = old['op']
        mapping[c['op']] = canonical
        trial_commands[canonical].update(name=c['name'], handler=c['handler'])
        left, right = elf.at(c['handler'], 64), reference_elf.at(old['handler'], 64)
        equal = next((p for p, (a, b) in enumerate(zip(left, right)) if a != b), 64)
        paired.append(dict(sourceOp=c['op'], referenceOp=canonical,
                           name=c['name'], referenceName=old['name'],
                           handler=c['handler'], referenceHandler=old['handler'],
                           identical_prefix_bytes=equal,
                           reference_size=old['size']))
    write_bytes(out, 'raw/'+EXE, raw)
    write_bytes(out, 'raw/SYSTEM.CNF', s.read_at('SYSTEM.CNF'))
    write_json(out, 'native-commands.json', commands)
    steps = measured_fixed_steps(elf, commands)
    write_json(out, 'native-comparison.json', {'pairs':paired, 'fixed_pc_steps':steps})
    evidence = {}
    for label, address, size in [('condition',0x11b9a0,0x2c8),
                                 ('operand-read',0x119b90,0xc8),
                                 ('variable',0x11c158,0x398),
                                 ('choice',0x11dba8,0x6f0),
                                 ('dialogue',0x11d4b0,0x6f8)]:
        elf.symbols[label] = {'address':address,'size':size}
        evidence[label] = elf.disassemble_mips(label)
    write_json(out, 'native-disassembly.json', evidence)
    archives = {name:index_afs(s,name) for name in ARCHIVES}
    write_json(out, 'archives.json', archives)
    scripts = []
    for entry in archives['MAC.AFS']:
        original = s.read_at('MAC.AFS',entry['offset'],entry['size'])
        data = unpack_lzss(original)
        name = entry['name']; rel = f'{entry["index"]:04d}-{name}'
        write_bytes(out, 'raw/MAC.AFS/'+rel, original)
        write_bytes(out, 'decoded/MAC.AFS/'+rel, data)
        unchanged = Script(data,name,baseline).discover()
        mapped = Script(data,name,trial_commands,opcode_map=mapping).discover()
        adapted = Ever17Script(data,name,trial_commands,opcode_map=mapping).discover()
        write_json(out, 'script-trial/'+rel+'.json', adapted)
        scripts.append({'source':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                        'unchanged_instructions':len(unchanged['instructions']),
                        'unchanged_errors':unchanged['errors'],
                        'mapped_instructions':len(mapped['instructions']),
                        'mapped_errors':mapped['errors'], 'mapped_strings':len(mapped['strings']),
                        'mapped_commands':dict(Counter(i['sourceOp'] for i in mapped['instructions'].values() if 'sourceOp' in i)),
                        'adapted_instructions':len(adapted['instructions']),
                        'adapted_errors':adapted['errors'], 'adapted_strings':len(adapted['strings']),
                        'adapted_commands':dict(Counter(i['sourceOp'] for i in adapted['instructions'].values() if 'sourceOp' in i)),
                        'execution':'not attempted; widths/semantics remain a comparison hypothesis'})
    write_json(out, 'script-comparison.json', scripts)
    init = unpack_lzss(s.read_at('INIT.BIN'))
    write_bytes(out, 'decoded/INIT.BIN', init)
    resources = []
    for archive, entries in archives.items():
        if scripts_only: break
        if archive == 'MAC.AFS': continue
        print(f'Checking {archive}: {len(entries)} members', flush=True)
        for entry in entries:
            record = {'archive':archive,'index':entry['index'],'name':entry['name']}
            if entry['name'].upper().endswith(('.BIP','.T2P','.FOP')):
                try:
                    data = unpack_lzss(s.read_at(archive,entry['offset'],entry['size']))
                    record.update(decoded_bytes=len(data),sha256=hashlib.sha256(data).hexdigest())
                except FormatError as error:
                    record['decompression_error']=str(error);resources.append(record);continue
                if archive in ('BG.AFS','EV.AFS','CHR.AFS'):
                    if entry['name'].upper().endswith('.BIP') and images:
                        try:
                            w,h,pixels=decode_image(data)
                            record.update(image=[w,h],pixel_sha256=hashlib.sha256(pixels).hexdigest())
                        except FormatError as error:record['image_error']=str(error)
                    elif entry['name'].upper().endswith('.T2P') and images:
                        try:record['thumbnail_sha256']=hashlib.sha256(thumbnail_png(data)).hexdigest()
                        except FormatError as error:record['thumbnail_error']=str(error)
                if archive == 'BGM.AFS':
                    try:record['bank']=bank_sequence(data)
                    except (FormatError,ValueError) as error:record['bank_error']=str(error)
                if entry['index'] == 0:
                    write_bytes(out,'samples/'+archive+'/'+entry['name']+'.decoded',data)
            elif archive in ('VOICE.AFS','SE.AFS'):
                head=s.read_at(archive,entry['offset'],min(entry['size'],32))
                record['adx_signature']=head[:2]==b'\x80\x00'
                if entry['index']==0:
                    write_bytes(out,'samples/'+archive+'/'+entry['name'],s.read_at(archive,entry['offset'],entry['size']))
            resources.append(record)
    write_json(out,'resource-comparison.json',resources)
    # Explicit negative tests: Never7's CPS/OGDT layout is a different candidate.
    negative=[]
    for arc in ('BG.AFS','CHR.AFS'):
        entry=archives[arc][0];raw_image=s.read_at(arc,entry['offset'],entry['size'])
        try:
            decoded,used=cps(raw_image);ogdt_png(decoded)
            negative.append({'archive':arc,'accepted':True,'consumed':used})
        except FormatError as error:negative.append({'archive':arc,'accepted':False,'error':str(error)})
    summary={
        'status':'research-only','playable':False,'probe_version':VERSION,'tool_version':__version__,
        'edition':'Japanese PS2 Ever17 Premium Edition SLPM-65421 v1.01',
        'source':s.fingerprint(),'executable_sha256':EXE_SHA256,
        'reference_executable_sha256':hashlib.sha256(reference_raw).hexdigest(),
        'filesystem':s.iso.volume_descriptors if s.iso else 'extracted directory',
        'archives':{k:len(v) for k,v in archives.items()},'members':sum(map(len,archives.values())),
        'native_command_count':len(commands),'mapped_nonnull_commands':len(mapping),
        'byte_identical_64byte_handler_prefixes':sum(p.get('identical_prefix_bytes')==64 for p in paired),
        'scripts':len(scripts),
        'unchanged_parser_failed_scripts':sum(bool(s['unchanged_errors']) for s in scripts),
        'mapped_parser_failed_scripts':sum(bool(s['mapped_errors']) for s in scripts),
        'mapped_parser_errors':sum(len(s['mapped_errors']) for s in scripts),
        'mapped_trial_instructions':sum(s['mapped_instructions'] for s in scripts),
        'mapped_trial_strings':sum(s['mapped_strings'] for s in scripts),
        'adapted_parser_failed_scripts':sum(bool(s['adapted_errors']) for s in scripts),
        'adapted_parser_errors':sum(len(s['adapted_errors']) for s in scripts),
        'adapted_trial_instructions':sum(s['adapted_instructions'] for s in scripts),
        'adapted_trial_strings':sum(s['adapted_strings'] for s in scripts),
        'resource_checks_enabled':not scripts_only,
        'init_decoded_bytes':len(init),'decompression_failures':sum('decompression_error' in r for r in resources),
        'image_checks_enabled':images,'images_decoded':sum('image' in r for r in resources),
        'image_failures':sum('image_error' in r for r in resources),
        'thumbnails_decoded':sum('thumbnail_sha256' in r for r in resources),
        'thumbnail_failures':sum('thumbnail_error' in r for r in resources),
        'sony_banks_parsed':sum('bank' in r for r in resources),
        'sony_bank_failures':sum('bank_error' in r for r in resources),
        'adx_signature_members':sum(r.get('adx_signature',False) for r in resources),
        'never7_image_trials':negative,
        'warnings':['Opcode translation alone does not verify operands, control flow or native state.',
                    'Zero parse errors are not route, save or story-execution evidence.',
                    'No content.json or library install is produced.'],
    }
    write_json(out,'report.json',summary)
    return summary


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('--reference',type=Path,required=True,help='Owned Remember11 SLPM-65550 ISO/directory')
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--images',action='store_true',help='Decode all scene BIP and thumbnail pixels; no image exports')
    parser.add_argument('--scripts-only',action='store_true',help='Skip media audit for a new parser comparison; not media validation')
    args=parser.parse_args()
    try:
        if args.images and args.scripts_only:raise FormatError('--images and --scripts-only cannot be combined')
        report=run(args.source,args.reference,args.out,args.images,args.scripts_only)
        print(json.dumps(report,indent=2));return 3
    except (OSError,ValueError,KeyError,struct.error) as error:
        print(f'Ever17 investigation: {error}',file=sys.stderr);return 2


if __name__=='__main__':sys.exit(main())
