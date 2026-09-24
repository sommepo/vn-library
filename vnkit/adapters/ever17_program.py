"""Compile reachable MAC instructions and source-proven external entry selectors."""
from .cri_afs import unpack_lzss
from .ever17_script import Ever17Script

# INIT's first table contains STARTUP, DBG_MENU and these four menu-resource
# IDs. Their three offset header is menu layout, not an opcode stream. Keep the
# raw members and report their separate native-menu status.
MENU_DATA = frozenset((82,83,84,85))


def compile_program(resources, entries, native):
    raw = {e['index']:(f"{e['index']:05d}-{e['name']}",unpack_lzss(
        (resources/'MAC.AFS'/f"{e['index']:05d}-{e['name']}").read_bytes()))
        for e in entries if e['index'] not in MENU_DATA}
    indexes = {n:{0} for n in raw}
    evidence = []
    parsed = {}
    for _ in range(256):
        for resource,(name,data) in raw.items():
            if resource in parsed and set(parsed[resource]['entrySelectors']) == {str(n) for n in indexes[resource]}:
                continue
            decoder = Ever17Script(data,name,native['commands'],opcode_map=native['opcode_map'],entry_indexes=indexes[resource])
            script = decoder.discover()
            script['format'] = 'vnkit.ever17-script'
            script.pop('execution',None)
            script['entrySelectors'] = sorted(map(str,indexes[resource]))
            parsed[resource] = script
        changed = False
        for resource,script in list(parsed.items()):
            predecessors = {i['next']:i for i in script['instructions'].values() if 'next' in i}
            for i in script['instructions'].values():
                if i.get('op') not in (6,7):
                    continue
                at = i['offset']
                previous = []
                for _ in range(3):
                    if at not in predecessors:
                        break
                    previous.append(predecessors[at])
                    at = previous[-1]['offset']
                if len(previous) != 3:
                    continue
                calc,wait,load = previous
                if (calc.get('op'),calc.get('sub'),wait.get('op'),load.get('op')) != (9,0,16,15):
                    continue
                if calc['words'][1] != 0x6000:
                    continue
                destination,selector = load['words'][1],calc['words'][2]
                if destination not in raw or selector >= 256:
                    continue
                if selector not in indexes[destination]:
                    indexes[destination].add(selector)
                    evidence.append({'source':i['id'],'destination':destination,'selector':selector})
                    changed = True
        if not changed:
            return parsed,evidence
    raise ValueError('Ever17 entry discovery did not converge')
