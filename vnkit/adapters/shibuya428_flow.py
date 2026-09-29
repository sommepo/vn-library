"""Bounded SNS FLO v4 timeline records; source data remains private.

The loader at 0x088cb8a8 copies 460-byte disc records into larger runtime
records. Fields without a verified consumer retain their numeric identity.
Parsing a node never grants access to it or establishes its unlock predicate.
"""
import hashlib
import struct
from ..disc import FormatError


def label_bucket(label):
    # Native 0x088ca590: at most 32 bytes, then fold the low two bytes.
    value = sum(c << (c & 7) for c in label.encode('ascii')[:32])
    return ((value & 255) + (value >> 8 & 255)) & 255


def parse_flow(data, scripts=None):
    def need(ok, message):
        if not ok:
            raise FormatError('428 FLO: ' + message)

    def string(raw, encoding='ascii', empty=False):
        need(b'\0' in raw, 'unterminated string')
        text, padding = raw.split(b'\0', 1)
        need(not any(padding) and (empty or text), 'string padding/empty value')
        try:
            return text.decode(encoding, 'strict')
        except UnicodeError as error:
            raise FormatError('428 FLO: invalid string encoding') from error

    need(20 <= len(data) <= 16 * 1024**2, 'file size')
    version, image_count, field_06, buckets, count, body = struct.unpack_from('<IHHIII', data)
    need(version == 4 and 0 < count <= 20000 and 0 < image_count <= 20000, 'version/counts')
    need(buckets == 20 + image_count * 34 and buckets + 1024 <= body <= len(data), 'section bounds')
    need(body % 4 == 0 and body + (count + 1) * 460 == len(data), 'record extent')
    images = [string(data[20 + i * 34:54 + i * 34]) for i in range(image_count)]
    need(len(set(images)) == image_count, 'duplicate image names')
    index, spans, seen_ids = {}, [], set()
    for bucket, relative in enumerate(struct.unpack_from('<256I', data, buckets)):
        if not relative:
            continue
        at = buckets + relative
        need(at >= buckets + 1024 and at + 4 <= body, 'bucket bounds')
        rows = struct.unpack_from('<I', data, at)[0]
        end = at + 4 + rows * 38
        need(0 < rows <= count and end <= body, 'bucket entries')
        spans.append((at, end))
        for i in range(rows):
            pos = at + 4 + i * 38
            label = string(data[pos:pos + 34])
            need(label_bucket(label) == bucket, 'label in wrong hash bucket')
            node = struct.unpack_from('<I', data, pos + 34)[0]
            need(label not in index and 1 <= node <= count and node not in seen_ids, 'duplicate/invalid index')
            index[label] = {'node': node, 'bucket': bucket}
            seen_ids.add(node)
    previous = buckets + 1024
    for start, end in sorted(spans):
        need(start == previous, 'bucket overlap/unexplained gap')
        previous = end
    need(body - previous < 4 and not any(data[previous:body]) and len(index) == count, 'index coverage/padding')
    need(data[body:body + 460] == bytes(458) + b'\x99\x99', 'sentinel record')
    nodes = []
    for number in range(1, count + 1):
        at = body + number * 460
        row = data[at:at + 460]
        title = string(row[:34], 'cp932', empty=True)
        label = string(row[34:68])
        related = [string(row[p:p + 34], empty=True) for p in range(68, 408, 34)]
        need(index.get(label, {}).get('node') == number, 'record/index disagreement')
        image, declared_script, ordinal = struct.unpack_from('<3H', row, 0x1a0)
        links = list(struct.unpack_from('<10H', row, 0x1a6))
        need(image < image_count and all(n <= count for n in links), 'image/link bounds')
        need(row[0x19f] == 0 and not any(row[0x1ba:0x1bc]) and
             not any(row[0x1c0:0x1ca]) and row[0x1ca:] == b'\x99\x99', 'reserved record fields')
        nodes.append({'id': number, 'source_offset': at, 'title': title, 'label': label,
                      'related_labels': related, 'thumbnail_index': image,
                      'declared_script': declared_script, 'source_ordinal': ordinal, 'links': links,
                      'fields_198': list(row[0x198:0x19f]),
                      'fields_1bc': list(struct.unpack_from('<2H', row, 0x1bc))})
    report = {'format': 'vnkit.428-flow', 'version': 1, 'sha256': hashlib.sha256(data).hexdigest(),
              'source_version': version, 'field_06': field_06, 'images': images, 'nodes': nodes,
              'index': index, 'playable': False}
    if scripts is not None:
        # Some source records have a zero script field, and related labels can
        # belong to a different character. Resolve all names independently;
        # keep the original script field for native-loader comparison.
        targets = {}
        for script in scripts:
            for label, record in script['labels'].items():
                targets.setdefault(label, []).append({'script': script['index'], 'offset': record['offset']})
        resolved, differences = 0, []
        for node in nodes:
            for label in [node['label'], *node['related_labels']]:
                if not label:
                    continue
                need(len(targets.get(label, [])) == 1, 'missing/ambiguous script label')
                resolved += 1
            node['target'] = targets[node['label']][0]
            if node['target']['script'] != node['declared_script']:
                differences.append(node['id'])
        report['audit'] = {'resolved_labels': resolved, 'declared_script_differences': differences}
    return report


if __name__ == '__main__':
    import argparse
    import json
    from pathlib import Path
    from ..disc import write_json
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('flow', type=Path)
    parser.add_argument('--scripts', type=Path, help='Recovered scripts directory for label validation')
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    scripts = None
    if args.scripts:
        paths = sorted(args.scripts.glob('[0-9][0-9].json'))
        if not 0 < len(paths) < 255:
            parser.error('Expected a bounded recovered script directory')
        scripts = [json.loads(p.read_text()) for p in paths]
    result = parse_flow(args.flow.read_bytes(), scripts)
    write_json(args.out, 'flow.json', result)
    print(json.dumps({'nodes': len(result['nodes']), 'images': len(result['images']),
                      'resolved_labels': result.get('audit', {}).get('resolved_labels'), 'playable': False}))
