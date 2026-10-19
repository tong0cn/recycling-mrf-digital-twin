import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('prepare_review', Path(__file__).with_name('prepare-cad-review.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fixture(nodes):
    document = {'asset': {'version': '2.0'}, 'nodes': nodes,
                'meshes': [{'name': 'detailed part', 'primitives': []}]}
    payload = json.dumps(document).encode()
    payload += b' ' * (-len(payload) % 4)
    binary = struct.pack('<II', 4, 0x004E4942) + b'1234'
    return (struct.pack('<4sII', b'glTF', 2, 20+len(payload)+len(binary))
            + struct.pack('<II', len(payload), 0x4E4F534A) + payload + binary)


class PrepareReviewTests(unittest.TestCase):
    def test_preserves_identity_transforms_and_binary_geometry(self):
        source_bytes = fixture([{'name': 'root', 'children': [1]},
                                {'name': 'E02', 'translation': [1, 2, 3], 'children': [2]},
                                {'name': 'NAUO42', 'mesh': 0}])
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory)/'source.glb', Path(directory)/'review.glb'
            source.write_bytes(source_bytes)
            module.prepare(source, target)
            data = target.read_bytes()
            count = struct.unpack_from('<I', data, 12)[0]
            document = json.loads(data[20:20+count])
            self.assertEqual(source.read_bytes(), source_bytes)
            self.assertEqual(data[20+count:], source_bytes[-12:])
            self.assertEqual(document['nodes'][1]['translation'], [1, 2, 3])
            self.assertEqual(document['nodes'][1]['name'], 'E02')
            self.assertNotIn('name', document['nodes'][2])
            self.assertNotIn('name', document['meshes'][0])

    def test_rejects_overwrite_and_duplicate_equipment_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            source, target = Path(directory)/'source.glb', Path(directory)/'review.glb'
            source.write_bytes(fixture([{'name': 'E01'}, {'name': 'E01'}]))
            with self.assertRaisesRegex(ValueError, 'preserved'):
                module.prepare(source, source)
            with self.assertRaisesRegex(ValueError, 'duplicate'):
                module.prepare(source, target)


if __name__ == '__main__':
    unittest.main()
