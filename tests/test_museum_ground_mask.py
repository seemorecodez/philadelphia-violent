import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'Unreal/Philadelphia/Scripts'))
from mask_museum_ground import subtract,area

class MuseumSurfaceMask(unittest.TestCase):
    def setUp(self):self.surface=[(0.,0.,0.),(4.,0.,4.),(0.,4.,8.)]
    def test_disjoint_preserves_area(self):
        parts=subtract(self.surface,[(5,5,0),(6,5,0),(5,6,0)])
        self.assertAlmostEqual(sum(abs(area(p)) for p in parts),8)
    def test_complete_cover_removes_surface(self):
        self.assertEqual(subtract(self.surface,self.surface),[])
    def test_corner_cut_preserves_plane(self):
        parts=subtract(self.surface,[(0,0,0),(2,0,0),(0,2,0)])
        self.assertAlmostEqual(sum(abs(area(p)) for p in parts),6)
        for poly in parts:
            for x,y,z in poly:self.assertAlmostEqual(z,x+2*y)
    def test_reversed_cut_same_coverage(self):
        parts=subtract(self.surface,[(0,2,0),(2,0,0),(0,0,0)])
        self.assertAlmostEqual(sum(abs(area(p)) for p in parts),6)

if __name__=='__main__':unittest.main()
