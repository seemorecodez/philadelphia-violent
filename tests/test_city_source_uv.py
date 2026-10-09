"""Source-specific regression: facade ground must sample the bottom atlas row."""
import importlib.util
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('converter', ROOT/'scripts/convert-city-source.py')
converter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(converter)


class SourceUVTests(unittest.TestCase):
    def test_observed_facade_anchors(self):
        source = converter.load_source(ROOT/'Unreal/Philadelphia/SourceAssets/Nearby/philly_0056')
        payload = converter.convert(source)
        size = struct.unpack_from('<I', payload, 12)[0]
        doc = json.loads(payload[20:20+size])
        data = payload[28+size:]

        def read(index):
            a = doc['accessors'][index]
            view = doc['bufferViews'][a['bufferView']]
            width = {'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
            code = {5126:'f',5123:'H',5125:'I'}[a['componentType']]
            values = struct.unpack_from('<'+code*a['count']*width, data, view.get('byteOffset',0)+a.get('byteOffset',0))
            return list(zip(*[iter(values)]*width))

        observed = 0
        for primitive in doc['meshes'][0]['primitives']:
            if 'TEXCOORD_0' not in primitive['attributes']:
                continue
            positions = read(primitive['attributes']['POSITION'])
            uv = read(primitive['attributes']['TEXCOORD_0'])
            # Independent anchors: source Z=-.001 is facade ground; GLB Y is up.
            # The inspected atlas has ground at its bottom (v=1), roof at v~.124.
            for position, coord in zip(positions,uv):
                if abs(position[1]+.001)<1e-6:
                    self.assertAlmostEqual(coord[1], 1.0, places=5)
                    observed += 1
        self.assertGreaterEqual(observed, 4)
        converter.verify(payload, source)
        with self.assertRaises(ValueError):
            converter.verify(converter.convert(source,'bottom-left'), source)


if __name__ == '__main__':
    unittest.main()
