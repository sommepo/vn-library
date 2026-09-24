"""Never7's symbol-addressed scenario words, not Remember11 MAC bytecode.

Widths are taken from oscrExeCommand and its native handlers in SLPS-25256.
No scanning past an unknown word: a failed table retains its exact stop site.
"""
import hashlib
import json
import struct
from collections import Counter
from pathlib import Path
from ..disc import FormatError, write_json
from ..elf import Elf32
from .never7_ps2 import EXE, EXE_SHA256
from .never7_menu import append_entries
from .never7_credits import WIDTHS as CREDIT_WIDTHS, programs as credit_programs

# Opcode width includes the command word. Unlisted commands fail closed.
WIDTHS = {0x00:5, 0x01:4, 0x02:4, 0x03:4, 0x04:4, 0x05:4, 0x06:4,
          0x07:4, 0x08:4, 0x09:2, 0x0a:2, 0x0c:2, 0x0d:2, 0x0e:3,
          0x0f:3, 0x10:2, 0x11:6, 0x12:3, 0x13:3, 0x14:2, 0x15:6,
          0x16:4, 0x17:3, 0x18:2, 0x19:3, 0x1a:2, 0x1b:4, 0x1c:1,
          0x1d:4, 0x1e:1, 0x24:2, 0x2f:5, 0x30:5, 0x31:2, 0x32:2,
          0x33:2, 0x36:2, 0x3a:2, 0x41:2, 0x42:3, 0x57:2, 0x58:2,
          0x68:4, 0x7a:3, 0x7b:2, 0x7c:2, 0x7d:2, 0x7e:4,
          0x80:1, 0x81:3, 0x82:1, 0x83:2, 0x84:1, 0x85:4, 0x86:1,
          0x87:3, 0x88:1, 0x89:2, 0x8a:1, 0x8b:2, 0x8c:1, 0x8d:2,
          0x8e:1, 0x8f:1, 0x90:1, 0x91:1, 0x92:1, 0x93:1, 0x94:1,
          0x95:1, 0x96:1, 0x97:1, 0x98:2, 0x99:1}


def parse_table(table, strings, credits=False):
    words = table['words']; section = table['section']; pc = 0
    result = {'format':'vnkit.never7-script', 'version':1, 'source':table['symbol'],
              'overlay':(section-6)//2, 'address':table['address'],
              'sha256':hashlib.sha256(struct.pack('<%dI' % len(words), *words)).hexdigest(),
              'instructions':{}, 'labels':{}, 'errors':[], 'word_count':len(words)}
    if credits:result['kind'] = 'mend-credits'
    while pc < len(words):
        op = words[pc]; ident = f"{table['symbol']}:{pc*4:08x}"
        inst = {'id':ident, 'offset':pc, 'op':op, 'source':{'section':section,
                'address':table['address']+pc*4, 'word':pc}}
        result['instructions'][pc] = inst
        try:
            if not credits and 0x100000 <= op < 0x80000000:
                size = 4
                if (section, op) not in strings:
                    raise FormatError(f'Unresolved source text pointer {op:#x}')
                inst['text'] = strings[section, op]
            else:
                widths = CREDIT_WIDTHS if credits else WIDTHS
                if op < 0xf0000000 or op-0xf0000000 not in widths:
                    raise FormatError(f'Unknown command word {op:#x}')
                code = op-0xf0000000; size = widths[code]; inst['code'] = code
                if code == 0x00:
                    if (section, words[pc+2]) not in strings:
                        raise FormatError(f'Unresolved choice text pointer {words[pc+2]:#x}')
                    inst['text'] = strings[section, words[pc+2]]
                if code == 0x0d:
                    result['labels'].setdefault(words[pc+1], []).append(pc+size)
            if pc+size > len(words): raise FormatError('Truncated instruction operands')
            inst.update(words=words[pc:pc+size], next=pc+size)
            pc += size
            if credits and code == 0x22:
                if any(words[pc:]):raise FormatError('Nonzero data after credits termination')
                result['padding_words'] = len(words)-pc
                break
        except (FormatError, IndexError) as error:
            inst['unsupported'] = f'{ident}: {error}'
            result['errors'].append(inst['unsupported']); break
    return result


def compile_recovery(recovery, out):
    recovery, out = Path(recovery), Path(out)
    raw = (recovery/'raw'/EXE).read_bytes()
    if hashlib.sha256(raw).hexdigest() != EXE_SHA256:
        raise FormatError('Untested Never7 executable')
    elf = Elf32(raw)
    class Strings(dict):
        def __contains__(self, key):
            try: self[key]; return True
            except (FormatError, UnicodeDecodeError): return False
        def __missing__(self, key):
            section, address = key
            if 0x5dd000 <= address:
                from .never7_ps2 import recovered_overlay
                data = recovered_overlay(recovery, (section-6)//2).read_bytes()
                offset = address-0x5dd000
                if offset < 64 or offset >= len(data):raise FormatError('Text pointer outside overlay')
                data = data[offset:offset+8192]
            else:
                end = next((p[2]+p[4] for p in elf.programs if p[0]==1 and p[2]<=address<p[2]+p[4]), address)
                data = elf.at(address, min(8192,end-address))
            end = data.find(b'\0')
            if end < 0:raise FormatError('Unterminated source text')
            text = data[:end].decode('cp932','strict');self[key] = text
            return text
    strings = Strings()
    for s in json.loads((recovery/'scripts/named-strings.json').read_text(encoding='utf-8')):
        # Recovery's human-readable text escapes backslashes. Decode original
        # bytes here, never the report's escaped representation.
        b = bytes.fromhex(s['raw_hex']).split(b'\0', 1)[0]
        strings[s['section'], s['address']] = b.decode('cp932', 'strict')
    refs = {}; errors = []; census = Counter(); conditions = []; credits_census = Counter()
    tables = json.loads((recovery/'scripts/source-words.json').read_text(encoding='utf-8'))
    credits = credit_programs(elf, tables)
    for table in tables:
        is_credits = table['symbol'] in credits.values()
        data = parse_table(table, strings, credits=is_credits); name = table['symbol']; rel = 'scripts/'+name+'.json'
        write_json(out, rel, data)
        refs[name] = {'url':rel, 'sha256':data['sha256'], 'overlay':data['overlay'], 'address':data['address']}
        errors.extend(data['errors'])
        for i in data['instructions'].values():
            (credits_census if is_credits else census)[str(i.get('code', 'text'))] += 1
            if i.get('code') == 0x0e and not i.get('unsupported'):
                conditions.append({'script':name,'overlay':data['overlay'],'address':data['address'],'selector':i['words'][1],'source':i['id']})
    symbol = elf.symbols['oscrIfCheck']; code = elf.at(symbol['address'], symbol['size'])
    # Only read-only switch tables used by this pure predicate. No syscalls,
    # stores, calls, device memory or executable entrypoint are interpreted.
    table_base = 0x38f000; table_size = 0x1800
    persistent = list(struct.unpack('<51i', elf.at(0x23bdc0, 51*4)))
    if -1 in persistent: persistent = persistent[:persistent.index(-1)]
    native = {'format':'vnkit.never7-predicate','version':1,'executable_sha256':EXE_SHA256,
              'base':symbol['address'], 'words':list(struct.unpack('<%dI' % (len(code)//4), code)),
              'tableBase':table_base, 'tables':list(struct.unpack('<%dI' % (table_size//4),elf.at(table_base,table_size))),
              'persistentVariables':persistent, 'appendEntries':append_entries(elf, refs),
              'creditsPrograms':credits,
              # is_fontsysName: 63 rows of 20 CP932 bytes, then a two-byte
              # dialogue/thought opener. Do not guess names with a regex.
              'speakerNames':[elf.at(0x1e9bf0+n*20,20).split(b'\0',1)[0].decode('cp932','strict') for n in range(63)],
              'speakerOpeners':[elf.at(at,2).decode('cp932','strict') for at in (0x38c3e8,0x38c478)]}
    write_json(out, 'predicate.json', native)
    report = {'format':'vnkit.never7-parse-report','version':1,'scripts':refs,
              'errors':errors,'census':dict(census),'credits_census':dict(credits_census),'conditions':conditions,
              'native_entries':json.loads((recovery/'scripts/native-index.json').read_text(encoding='utf-8'))}
    write_json(out, 'parse-report.json', report)
    return report


if __name__ == '__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('recovery',type=Path);p.add_argument('--out',type=Path,required=True)
    a=p.parse_args()
    try:
        r=compile_recovery(a.recovery,a.out)
        print(json.dumps({'scripts':len(r['scripts']),'instructions':sum(r['census'].values()),'errors':r['errors']},indent=2))
        raise SystemExit(3 if r['errors'] else 0)
    except (OSError, ValueError) as error:p.exit(2,str(error)+'\n')
