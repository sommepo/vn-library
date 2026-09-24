"""SLPM-65421 MAC grammar, retaining original opcodes and source words.

Research output stays separate from the compiled program. Variant operations
are deliberately unsupported by the base VM; Ever17Engine handles them.
Native evidence is recorded by scripts/investigate-ever17.py.
"""
import struct
from .remember11_script import Script
from ..disc import FormatError

# The native handlers read byte 1 and advance the PC by two. Remember11's
# same-named commands use four bytes. Do not change the Remember11 defaults.
COMPACT_SOUND = {
    0x3b: 0x122800,  # bgm_speed
    0x3f: 0x122a50,  # se_req
    0x40: 0x11ccd8,  # se_wait
    0x41: 0x122ad8,  # se_speed
    0x42: 0x122b68,  # se_vol
    0x47: 0x122e68,  # voice_speed
}


class Ever17Script(Script):
    def __init__(self, data, name, commands, *, opcode_map, entry_indexes=(0,)):
        self.entry_indexes = sorted(set(entry_indexes))
        if not self.entry_indexes or any(type(n) is not int or not 0 <= n <= 255 for n in self.entry_indexes):
            raise FormatError('Invalid Ever17 entry selectors')
        commands = [dict(c) for c in commands]
        for source_op in COMPACT_SOUND:
            commands[opcode_map[source_op]]['size'] = 2
        # Source ELF PC increments: 0x123cd0, 0x1204e0 and
        # 0x120624/0x120668. Map overlays do not share R11's operand widths.
        for source_op, size in {0x6b:2, 0x6c:8, 0x6d:4,
                                0x5b:6, 0x5c:4, 0x5d:4,
                                0x7d:4, 0x7e:4, 0x7f:4}.items():
            if source_op in opcode_map:
                commands[opcode_map[source_op]]['size'] = size
        super().__init__(data, name, commands, opcode_map=opcode_map)

    def instruction(self, at):
        source_op, sub = self.read(at, 2)
        if source_op == 0x4c:
            # 0x123140: read u16 at PC+2, write the native save-title field,
            # call 0x11b3f0 with it, then advance by 4. Preserve the operation;
            # no execution or guessed replacement with R11 save_disp is allowed.
            raw = self.read(at, 4)
            return {'id':f'{self.name}:{at:04x}', 'offset':at, 'op':0x100,
                    'sourceOp':source_op, 'sub':sub, 'name':'save_title',
                    'size':4, 'next':at+4, 'words':list(struct.unpack('<2H',raw)),
                    'titleIndex':struct.unpack_from('<H',raw,2)[0], 'targets':[],
                    'runtimeUnsupported':True, 'nativeHandler':0x123140}
        i = super().instruction(at)
        if source_op == 1 and sub == 2:
            # Native task 10 (0x10bc10 / 0x1545e8) runs credits, then
            # restores the scenario and continues AFTER this command.
            i['targets'] = [i['next']]
        if source_op == 9 and sub == 15:
            # Entries are admitted from source calls, not by treating the gap
            # before the first instruction as an array (it can contain text).
            table = self.u16(at+2)
            targets = {str(n):self.u16(table+2*n) for n in self.entry_indexes}
            for target in targets.values():
                self.read(target,2)
            i['jumpTable'] = targets
            i['targets'] = sorted(set(targets.values()))
        if source_op in COMPACT_SOUND:
            i['runtimeUnsupported'] = True
            i['nativeHandler'] = COMPACT_SOUND[source_op]
        return i

    def discover(self):
        result = super().discover()
        result['format'] = 'vnkit.ever17-script-research'
        result['execution'] = 'unsupported; static comparison only'
        return result
