"""Source-located SLPS-01794 SCE decoding; parsing is not execution support.

Operand widths are measured from the exact executable's 101-entry skip table.
Every native entry is traversed; unconditional transfers terminate a block.
Raw byte offsets and byte strings are retained independently of Unicode text.
"""
import hashlib
import struct

from ..disc import FormatError

SIZES = (
    -1,2,2,0,2,2,2,2,3,3,1,1,2,1,3,3,
    2,2,0,-1,1,0,0,0,2,2,1,1,1,1,2,0,
    0,1,1,2,3,3,1,1,1,3,1,3,0,3,2,2,
    2,4,4,0,2,3,3,2,0,7,1,1,2,0,0,1,
    4,2,1,2,0,4,1,1,1,0,4,2,0,1,0,1,
    2,3,0,2,5,5,4,-1,2,0,1,1,2,5,5,2,
    1,2,2,0,0,
)


def parse(data, script_id):
    if not isinstance(script_id, int) or not 0 <= script_id <= 999 or not 2 <= len(data) <= 65536:
        raise FormatError('Invalid Kamaitachi script identity/extent')
    first = int.from_bytes(data[:2], 'little')
    if first < 2 or first % 2 or first >= len(data) or first > 2000:
        raise FormatError('Invalid Kamaitachi entry table extent')
    entries = list(struct.unpack_from('<' + 'H' * (first // 2), data))
    starts = sorted(set(entries))
    if starts[0] != first or starts[-1] >= len(data):
        raise FormatError('Kamaitachi entry is outside source script')
    commands, occupied = {}, set()
    pending = list(starts)
    while pending:
        at = pending.pop()
        while at not in commands:
            if not first <= at < len(data) or at in occupied:
                raise FormatError(f'Kamaitachi {script_id}:{at:04x}: target is not a command boundary')
            if not any(data[at:]):
                break  # Preserved sector padding, never a playable instruction.
            offset, op = at, data[at]
            at += 1
            if op >= len(SIZES):
                raise FormatError(f'Kamaitachi {script_id}:{offset:04x}: unknown opcode {op:02x}')
            if op == 0:
                while at < len(data) and data[at]:
                    at += 2 if data[at] >= 128 else 1
                if at >= len(data):
                    raise FormatError(f'Kamaitachi {script_id}:{offset:04x}: unterminated text')
                at += 1
            elif op in (0x13, 0x57):
                if at >= len(data) or data[at] > 8:
                    raise FormatError(f'Kamaitachi {script_id}:{offset:04x}: invalid choice count')
                at += (4 + 2 * data[at]) if op == 0x13 else (6 + 4 * data[at])
            else:
                at += SIZES[op]
            if at > len(data) or any(p in occupied for p in range(offset, at)):
                raise FormatError(f'Kamaitachi {script_id}:{offset:04x}: overlapping/truncated command')
            args = data[offset + 1:at]
            command = {'id': f'kama:{script_id}:{offset:04x}', 'offset': offset,
                       'op': op, 'next': at, 'size': at - offset, 'args': list(args)}
            commands[offset] = command
            occupied.update(range(offset, at))
            # These two instructions branch to byte offsets within the current
            # SCE, unlike resource*1000 + entry labels used by other transfers.
            if op in (0x1e, 0x45):
                target = int.from_bytes(args[-2:], 'little')
                if not first <= target < len(data):
                    raise FormatError(f'{command["id"]}: local branch outside script')
                pending.append(target)
                command['local_target'] = target
            if op in (1, 3, 0x12, 0x16, 0x56):
                break
    return {'format': 'vnkit.kamaitachi-script', 'version': 1, 'id': script_id,
            'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data),
            'entries': entries, 'commands': [commands[k] for k in sorted(commands)]}
