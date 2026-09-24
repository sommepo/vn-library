"""PS2 CMessageParser controls, traced at 0x14f628 (SLPM-66913).

Keep complete logical segments and ruby separate from animation timing. ASCII
punctuation in the source is escaped with !; unescaped periods are delimiters.
"""
from ..disc import FormatError


def parse_message(raw, source='message'):
    raw = raw.rstrip('\0')
    speaker, body = raw.split('r', 1) if 'r' in raw else ('', raw)
    speaker = speaker.replace('!', '')
    parts, runs, visible, controls = [], [], [], []
    voice, reading, ruby, at = None, None, None, 0

    def append(s):
        target = ruby if ruby is not None else runs
        if target and isinstance(target[-1], str): target[-1] += s
        else: target.append(s)

    def flush():
        nonlocal runs, voice, controls
        if runs:
            visible.extend(runs)
            parts.append({'speaker': speaker, 'text': runs, 'displayText': visible.copy(),
                          'voice': voice, 'controls': controls})
            runs, voice, controls = [], None, []

    while at < len(body):
        ch = body[at]; at += 1
        if ch == '!':
            if at == len(body): raise FormatError(f'{source}: dangling text escape')
            append(body[at]); at += 1
        elif ord(ch) >= 128: append(ch)
        elif ch == 'r': append('\n')
        elif ch == 'k': flush()
        elif ch in 'vbfozscaw$':
            end = body.find('.', at)
            if end < 0: raise FormatError(f'{source}: unterminated {ch} control')
            arg = body[at:end]; at = end+1
            controls.append([ch, arg])
            if ch == 'v': voice = arg
            elif ch == 'b': reading = arg
            elif ch in 'f$': raise FormatError(f'{source}: dynamic text control {ch} needs implementation')
        elif ch == '<':
            if ruby is not None or reading is None: raise FormatError(f'{source}: invalid ruby start')
            ruby = []
        elif ch == '>':
            if ruby is None: raise FormatError(f'{source}: invalid ruby end')
            runs.append({'base': ''.join(ruby), 'reading': reading}); ruby = reading = None
        elif ch in '[]te|y': controls.append([ch])
        else:
            # Native default table target 0x14fa38 consumes unused ASCII.
            controls.append(['ignored-ascii', ch])
    if ruby is not None: raise FormatError(f'{source}: unfinished ruby')
    flush()
    return parts
