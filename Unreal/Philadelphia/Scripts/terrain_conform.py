"""Fit retained surface triangles to the same piecewise-planar source terrain."""
import math
from terrain_clip import clip_triangle

STEP = 10.0


def grid_height(x, y, sample):
    gx, gy = math.floor(x/STEP)*STEP, math.floor(y/STEP)*STEP
    u, v = (x-gx)/STEP, (y-gy)/STEP
    a, c = sample(gx,gy), sample(gx+STEP,gy+STEP)
    if u >= v:
        return a*(1-u)+sample(gx+STEP,gy)*(u-v)+c*v
    return a*(1-v)+sample(gx,gy+STEP)*(v-u)+c*u


def conform_triangle(points):
    """Yield the original XY footprint partitioned along terrain-face edges."""
    for ix in range(math.floor(min(p[0] for p in points)/STEP),math.floor(max(p[0] for p in points)/STEP)+1):
        for iy in range(math.floor(min(p[1] for p in points)/STEP),math.floor(max(p[1] for p in points)/STEP)+1):
            x,y = ix*STEP,iy*STEP
            a,b,c,d = (x,y),(x+STEP,y),(x+STEP,y+STEP),(x,y+STEP)
            for face in ((a,b,c),(a,c,d)):
                polygon = clip_triangle(points,face)
                for i in range(1,len(polygon)-1):
                    p,q,r = polygon[0],polygon[i],polygon[i+1]
                    if abs((q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]))>1e-10:
                        yield p,q,r


def conform_segment(start,end):
    """Split a curb wherever it crosses the terrain grid or a grid diagonal."""
    cuts = {0.0,1.0}
    for a,b in ((start[0],end[0]),(start[1],end[1]),(start[0]-start[1],end[0]-end[1])):
        if abs(b-a)<1e-12:
            continue
        for i in range(math.floor(min(a,b)/STEP),math.ceil(max(a,b)/STEP)+1):
            t=(i*STEP-a)/(b-a)
            if 1e-10<t<1-1e-10:
                cuts.add(t)
    ordered=[]
    for t in sorted(cuts):
        if not ordered or t-ordered[-1]>1e-10:
            ordered.append(t)
    return [(start[0]+t*(end[0]-start[0]),start[1]+t*(end[1]-start[1])) for t in ordered]
