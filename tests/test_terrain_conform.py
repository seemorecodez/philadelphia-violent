import json
import math
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'Unreal/Philadelphia/Scripts'))
from terrain_clip import clip_triangle
from terrain_conform import conform_triangle,conform_segment,grid_height


def area(poly):
    if len(poly)<3:return 0
    x,y=poly[0]
    return sum((poly[i][0]-x)*(poly[i+1][1]-y)-(poly[i+1][0]-x)*(poly[i][1]-y) for i in range(1,len(poly)-1))/2


class TerrainConformTest(unittest.TestCase):
    def test_clipping_inside_outside_winding_and_touch(self):
        subject=[(0,0),(10,0),(0,10)]
        boundary=[(0,0),(5,0),(0,5)]
        original=list(subject)
        self.assertAlmostEqual(area(clip_triangle(subject,boundary)),12.5)
        self.assertAlmostEqual(area(clip_triangle(list(reversed(subject)),boundary)),-12.5)
        self.assertEqual(subject,original)
        self.assertEqual(clip_triangle([(10,10),(11,10),(10,11)],boundary),[])
        self.assertEqual(clip_triangle([(0,0),(-5,0),(0,-5)],boundary),[])
        with self.assertRaises(ValueError):clip_triangle([(math.nan,0),(1,0),(0,1)],boundary)

    def test_shifted_thin_face_is_preserved(self):
        subject=[(-300,900),(-295,900),(-300,900.000001)]
        boundary=[(-310,890),(-270,890),(-310,930)]
        self.assertAlmostEqual(area(clip_triangle(subject,boundary)),area(subject),delta=1e-10)

    def test_real_source_footprints_and_terrain_clearance(self):
        faces=[[(1,2),(34,7),(4,39)],[(-25,17),(18,-13),(9,38)]]
        for name in ('3_5','4_5','0_3','-1_3'):
            cell=json.loads((ROOT/f'public/data/district/cells/{name}.json').read_text())
            flat=cell['groups'].get('road',[])
            stride=max(6,(len(flat)//120//6)*6)
            faces.extend([[tuple(flat[i+j:i+j+2]) for j in (0,2,4)] for i in range(0,len(flat),stride)])
        sample=lambda x,y:.003*x*y+.001*x*x-.002*y*y
        for face in faces:
            parts=list(conform_triangle(face))
            self.assertAlmostEqual(sum(area(p) for p in parts),area(face),delta=max(1e-7,abs(area(face))*1e-7))
            for part in parts:
                mid=tuple(sum(p[j] for p in part)/3 for j in (0,1))
                # All faces must remain on one affine terrain patch; the road's
                # 4mm relief plus the terrain's -20mm leaves 24mm separation.
                road=sum(grid_height(*p,sample)+.004 for p in part)/3
                ground=grid_height(*mid,sample)-.02
                self.assertAlmostEqual(road-ground,.024,delta=1e-8)

    def test_curbs_follow_each_terrain_patch(self):
        start,end=(-22,3),(34,27)
        points=conform_segment(start,end)
        self.assertEqual(points[0],start);self.assertEqual(points[-1],end)
        sample=lambda x,y:.003*x*y+.001*x*x-.002*y*y
        for p,q in zip(points,points[1:]):
            mid=((p[0]+q[0])/2,(p[1]+q[1])/2)
            self.assertAlmostEqual((grid_height(*p,sample)+grid_height(*q,sample))/2,grid_height(*mid,sample),delta=1e-8)


if __name__=='__main__':unittest.main()
