"""Keep only top-level equipment names before gltfpack merges CAD face primitives.

This creates a layout-review derivative. The full CAD export is preserved for later
motion-part extraction; removing lower-level names here is deliberately review-only.
"""
import argparse
import json
import re
import struct
from pathlib import Path


def prepare(source, target):
    if source.resolve() == target.resolve():
        raise ValueError('Source export must be preserved')
    data = source.read_bytes()
    magic, version, total = struct.unpack_from('<4sII', data)
    length, kind = struct.unpack_from('<II', data, 12)
    if magic != b'glTF' or version != 2 or total != len(data) or kind != 0x4E4F534A:
        raise ValueError('Expected a complete GLB 2.0 document')
    document = json.loads(data[20:20+length])
    kept = []
    for node in document['nodes']:
        if re.fullmatch(r'E\d{2}', node.get('name', '')):
            kept.append(node['name'])
        else:
            node.pop('name', None)
    if not kept or len(kept) != len(set(kept)):
        raise ValueError('Missing or duplicate equipment instance IDs')
    for mesh in document['meshes']:
        mesh.pop('name', None)
    payload = json.dumps(document, separators=(',', ':')).encode('utf-8')
    payload += b' ' * ((-len(payload)) % 4)
    remainder = data[20+length:]
    target.write_bytes(struct.pack('<4sII', b'glTF', 2, 20+len(payload)+len(remainder))
                       + struct.pack('<II', len(payload), kind) + payload + remainder)
    print(f'Preserved {len(kept)} independently selectable equipment names')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    args = parser.parse_args()
    prepare(args.source, args.target)
