"""Independent metre/centimetre and handedness contract for the Unreal import."""
import importlib.util
import math
from pathlib import Path
import unittest

path = Path(__file__).resolve().parents[1] / 'Unreal/Philadelphia/Scripts/geo_frame.py'
spec = importlib.util.spec_from_file_location('geo_frame', path)
geo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geo)


class CoordinateContract(unittest.TestCase):
    def test_origin_and_one_meter_axes(self):
        sx = 111320 * math.cos(math.radians(39.95))
        self.assertEqual(geo.to_unreal(-75.16, 39.95, 12, 12), (0, 0, 0))
        east = geo.to_unreal(-75.16 + 1/sx, 39.95, 12, 12)
        north = geo.to_unreal(-75.16, 39.95 + 1/111320, 12, 12)
        self.assertAlmostEqual(east[0], 100, places=5)
        self.assertAlmostEqual(north[1], -100, places=5)
        self.assertEqual(geo.to_unreal(-75.16, 39.95, 13, 12)[2], 100)

    def test_real_source_landmark_roundtrip(self):
        original = (-75.155179, 39.955632, 19.75)
        point = geo.to_unreal(*original, origin_height=12)
        self.assertGreater(point[0], 40000)
        self.assertLess(point[1], -60000)
        for a, b in zip(original, geo.from_unreal(*point, origin_height=12)):
            self.assertAlmostEqual(a, b, places=9)

    def test_invalid_inputs(self):
        for bad in [float('nan'), float('inf'), -float('inf'), True, '12', None]:
            for function, good in [(geo.to_unreal, [-75.16,39.95,12,0]), (geo.from_unreal,[0,0,0,12])]:
                for i in range(4):
                    args = good.copy()
                    args[i] = bad
                    with self.assertRaises(ValueError):
                        function(*args)
        for lon, lat in [(181,0),(-181,0),(0,91),(0,-91)]:
            with self.assertRaises(ValueError):
                geo.to_unreal(lon,lat,0)


if __name__ == '__main__':
    unittest.main()
