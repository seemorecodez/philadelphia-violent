"""Convex clipping in local metre coordinates, preserving subject winding."""
import math


def clip_triangle(subject,boundary):
    if len(subject)<3 or len(boundary)!=3:
        raise ValueError('Expected a convex subject and three boundary points')
    for p in (*subject,*boundary):
        if len(p)!=2 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in p):
            raise ValueError('Expected finite XY pairs')
    def cross(a,b,p):
        return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    if cross(*boundary)<=0:
        raise ValueError('Clipping triangle must be counterclockwise')
    output=[tuple(p) for p in subject]
    for edge in range(3):
        if not output:return []
        a,b=boundary[edge],boundary[(edge+1)%3]
        incoming,output=output,[]
        previous=incoming[-1]
        prev_distance=cross(a,b,previous)
        for point in incoming:
            distance=cross(a,b,point)
            if (prev_distance>=-1e-10)!=(distance>=-1e-10):
                t=max(0.0,min(1.0,prev_distance/(prev_distance-distance)))
                output.append((previous[0]+t*(point[0]-previous[0]),previous[1]+t*(point[1]-previous[1])))
            if distance>=-1e-10:output.append(point)
            previous,prev_distance=point,distance
    unique=[]
    for p in output:
        if not unique or math.dist(p,unique[-1])>1e-10:unique.append(p)
    if len(unique)>1 and math.dist(unique[0],unique[-1])<=1e-10:unique.pop()
    if len(unique)<3:return []
    twice_area=sum(cross(unique[0],unique[i],unique[i+1]) for i in range(1,len(unique)-1))
    return unique if abs(twice_area)>1e-12 else []
