"""Check actual exported district coverage against retained source triangles."""
import hashlib
import json
from pathlib import Path
import random
import struct
import unittest

DATA = Path(__file__).resolve().parents[1] / 'Unreal/Philadelphia/Content/SourceData'


class DistrictBackdropTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.raw = (DATA / 'district-backdrop.bin').read_bytes()
        cls.proof = json.loads((DATA / 'district-backdrop.json').read_text())
        cls.vertex_count, cls.index_count = struct.unpack_from('<II', cls.raw, 8)
        cls.index_start = 32 + 36 * cls.vertex_count

    def test_binary_integrity_and_indices(self):
        self.assertEqual(self.raw[:8], b'PHLYLOD2')
        self.assertEqual(len(self.raw), self.index_start + self.index_count * 4)
        self.assertEqual(hashlib.sha256(self.raw).hexdigest(), self.proof['sha256'])
        self.assertEqual(self.index_count, self.proof['triangles'] * 3)
        indices = struct.iter_unpack('<I', self.raw[self.index_start:])
        self.assertLess(max(i[0] for i in indices), self.vertex_count)
        self.assertEqual(hashlib.sha256((DATA/'district-backdrop.png').read_bytes()).hexdigest(), self.proof['textureSha256'])
        bounds = struct.unpack_from('<4f', self.raw, 16)
        self.assertEqual(list(bounds), self.proof['uvBoundsCm'])

    def test_every_cell_and_sampled_source_faces(self):
        manifest = json.loads((DATA / 'manifest.json').read_text())
        self.assertEqual([c['id'] for c in manifest['cells']], [c['id'] for c in self.proof['sourceCells']])
        randomizer = random.Random(89421)
        output_triangle = 0
        sampled = 0
        # Test source faces in every cell, including first and last face of each
        # surface group. Compare source positions independently of exporter code.
        for source in self.proof['sourceCells']:
            raw = (DATA / (source['id'] + '.json')).read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), source['sha256'])
            for kind, values in json.loads(raw)['groups'].items():
                if kind != 'ground':
                    continue
                for start in range(0, len(values), 9):
                    p, q, r = [values[start+j:start+j+3] for j in (0, 3, 6)]
                    u, v = [q[j]-p[j] for j in range(3)], [r[j]-p[j] for j in range(3)]
                    area_squared = sum(x*x for x in (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]))
                    if area_squared < .0001:
                        continue
                    if start in (0, len(values)-9) or randomizer.random() < .02:
                        for corner, point in enumerate((p, q, r)):
                            index = struct.unpack_from('<I', self.raw, self.index_start+(output_triangle*3+corner)*4)[0]
                            xyz = struct.unpack_from('<3f', self.raw, 32+index*36)
                            for axis in range(3):
                                expected = point[axis] - (5 if axis == 2 else 0)
                                self.assertAlmostEqual(xyz[axis], expected, delta=.008)
                        sampled += 1
                    output_triangle += 1
        self.assertEqual(output_triangle * 3, self.index_count)
        self.assertGreater(sampled, 700)


if __name__ == '__main__':
    unittest.main()
