"""Cut coarse ground only beneath the retained museum's near-ground walk surfaces."""
import hashlib
import json
import math
from pathlib import Path
import struct
from geo_frame import ORIGIN,SX,SY,to_unreal
import prepare_district as terrain
from terrain_conform import grid_height

ROOT=Path(__file__).resolve().parents[3]
DATA=ROOT/'Unreal/Philadelphia/Content/SourceData/museum'

def area(poly):
    return sum(poly[i][0]*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*poly[i][1] for i in range(len(poly)))/2

def half(poly,a,b,inside):
    out=[]
    def side(p):return (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])
    for i,p in enumerate(poly):
        q=poly[(i+1)%len(poly)];dp,dq=side(p),side(q)
        ip=dp>=0 if inside else dp<=0
        iq=dq>=0 if inside else dq<=0
        if ip:out.append(p)
        if ip!=iq:
            t=dp/(dp-dq)
            out.append(tuple(p[j]+t*(q[j]-p[j]) for j in range(3)))
    return out

def subtract(subject,cut):
    """Disjoint convex remainder pieces, preserving original 3D surface height."""
    if area(cut)<0:cut=list(reversed(cut))
    remainder=list(subject);pieces=[]
    for i,a in enumerate(cut):
        if len(remainder)<3:break
        b=cut[(i+1)%3]
        outside=half(remainder,a,b,False)
        if len(outside)>=3 and abs(area(outside))>1e-10:pieces.append(outside)
        remainder=half(remainder,a,b,True)
    return pieces

def main():
    registration=json.loads((DATA/'landmark-registration.json').read_text())
    meta=json.loads((DATA/'manifest.json').read_text())
    raw=(ROOT/'public/models/city/source-2561.glb').read_bytes()
    assert hashlib.sha256(raw).hexdigest()==registration['sourceSha256']
    n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n])
    ac=g['accessors'][g['meshes'][0]['primitives'][0]['attributes']['POSITION']]
    view=g['bufferViews'][ac['bufferView']]
    points=list(struct.iter_unpack('<fff',raw[28+n+view['byteOffset']:28+n+view['byteOffset']+view['byteLength']]))
    base=to_unreal(*g['extras']['origin'],origin_height=meta['originHeight'])
    triangles=[];index={}
    def sample(e,n):return terrain.height_at(ORIGIN[0]+e/SX,ORIGIN[1]+n/SY)
    def keys(box):
        for x in range(math.floor(box[0]/10),math.floor(box[2]/10)+1):
            for y in range(math.floor(box[1]/10),math.floor(box[3]/10)+1):yield x,y
    def bounds(p):return min(v[0] for v in p),min(v[1] for v in p),max(v[0] for v in p),max(v[1] for v in p)
    for start in range(0,len(points),3):
        tri=[((base[0]+x*100)/100,(base[1]+south*100)/100,(base[2]+z*100+registration['verticalOffsetCm'])/100) for x,z,south in points[start:start+3]]
        a,b,c=tri
        cross=((b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))
        length=math.sqrt(sum(v*v for v in cross))
        if length<1e-6 or abs(cross[2])/length<.65 or abs(area(tri))<.001:continue
        center=[sum(p[j] for p in tri)/3 for j in range(3)]
        ground=grid_height(center[0],-center[1],sample)-meta['originHeight']
        # Roofs and elevated architectural pieces do not erase streets below.
        if abs(center[2]-ground)>5:continue
        ident=len(triangles);triangles.append(tri)
        for key in keys(bounds(tri)):index.setdefault(key,[]).append(ident)
    assert triangles
    changed=[];removed_area=0
    backup=ROOT/'artifacts/unreal/museum-ground-before-mask'
    backup.mkdir(parents=True,exist_ok=True)
    for cell in meta['cells']:
        path=DATA/(cell['id']+'.json');original=path.read_bytes();data=json.loads(original)
        cell_removed=0
        for kind,values in data['groups'].items():
            if kind=='curb':continue
            output=[]
            for i in range(0,len(values),9):
                tri=[tuple(v/100 for v in values[i+j:i+j+3]) for j in (0,3,6)]
                candidates=set(t for key in keys(bounds(tri)) for t in index.get(key,[]))
                pieces=[tri]
                for ident in sorted(candidates):
                    pieces=[part for p in pieces for part in subtract(p,triangles[ident])]
                    if not pieces:break
                kept=sum(abs(area(p)) for p in pieces)
                assert kept<=abs(area(tri))+1e-5
                cell_removed+=max(0,abs(area(tri))-kept)
                for poly in pieces:
                    for k in range(1,len(poly)-1):
                        for p in (poly[0],poly[k],poly[k+1]):output.extend(round(v*100,5) for v in p)
            data['groups'][kind]=output
        if cell_removed>.001:
            (backup/path.name).write_bytes(original)
            path.write_text(json.dumps(data,separators=(',',':')))
            changed.append({'cell':cell['id'],'removedSurfaceAreaM2':cell_removed,'inputSha256':hashlib.sha256(original).hexdigest(),'outputSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
            removed_area+=cell_removed
    report={'method':'Exact triangle subtraction under retained near-ground museum surfaces; terrain Z interpolated from each original face','maskTriangles':len(triangles),'changedCells':changed,'removedStackedSurfaceAreaM2':removed_area,'sourceSha256':registration['sourceSha256'],'limits':['Summed area includes stacked terrain and pavement; not land coverage','Native visual and walk checks required','Curbs retained; source art remains historical']}
    (DATA/'ground-mask.json').write_text(json.dumps(report,indent=2))
    print(json.dumps({'maskTriangles':len(triangles),'changedCells':len(changed),'removedStackedSurfaceAreaM2':removed_area}),flush=True)

if __name__=='__main__':main()
