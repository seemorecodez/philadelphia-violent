"""Native Museum approach at the same real coordinate/height frame as the city."""
import json
import hashlib
import statistics
import struct
from pathlib import Path
import prepare_district as streets
from geo_frame import ORIGIN,SX,SY,to_unreal
from terrain_conform import grid_height

ROOT=Path(__file__).resolve().parents[3]
streets.SOURCE=ROOT/'Unreal/Philadelphia/SourceAssets/Museum'
streets.OUT=ROOT/'Unreal/Philadelphia/Content/SourceData/museum'
streets.main()
path=streets.OUT/'manifest.json'
meta=json.loads(path.read_text())
original=json.loads((streets.OUT.parent/'manifest.json').read_text())
assert abs(meta['originHeight']-original['originHeight'])<.000001
lon,lat=-75.1791,39.9644
def sample(e,n):return streets.height_at(ORIGIN[0]+e/SX,ORIGIN[1]+n/SY)
height=grid_height((lon-ORIGIN[0])*SX,(lat-ORIGIN[1])*SY,sample)
meta.update(name='Museum of Art',spawn=to_unreal(lon,lat,height+.96,meta['originHeight']),yawDegrees=-140)
path.write_text(json.dumps(meta,indent=2))
packs_path=streets.OUT.parent/'city-packs.json'
packs=json.loads(packs_path.read_text())
if 'museum' not in packs['packs']:packs['packs'].append('museum')
packs_path.write_text(json.dumps(packs,indent=2))
print(json.dumps({'spawn':meta['spawn'],'cells':len(meta['cells'])}),flush=True)

# Register the source's lowest stair-landing band against the actual native
# ground at those same positions. Preserve mesh dimensions and XY placement;
# this is a local height reconciliation, not a claimed geoid transformation.
source=ROOT/'public/models/city/source-2561.glb'
raw=source.read_bytes()
size=struct.unpack_from('<I',raw,12)[0]
gltf=json.loads(raw[20:20+size])
accessor=gltf['accessors'][gltf['meshes'][0]['primitives'][0]['attributes']['POSITION']]
view=gltf['bufferViews'][accessor['bufferView']]
assert accessor['componentType']==5126 and accessor['type']=='VEC3'
points=set(struct.iter_unpack('<fff',raw[28+size+view['byteOffset']:28+size+view['byteOffset']+view['byteLength']]))
lowest=min(p[1] for p in points)
contacts=sorted(p for p in points if p[1]<=lowest+.15)
assert len(contacts)>=10
origin=gltf['extras']['origin']
base_position=to_unreal(*origin,origin_height=meta['originHeight'])
native_cells={}
def native_surface(x,y):
    key=f'{int(x//10000)}_{int((-y)//10000)}'
    if key not in native_cells:native_cells[key]=json.loads((streets.OUT/(key+'.json')).read_text())
    heights=[]
    for kind,values in native_cells[key]['groups'].items():
        if kind=='curb':continue
        for i in range(0,len(values),9):
            ax,ay,az,bx,by,bz,cx,cy,cz=values[i:i+9]
            det=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
            if abs(det)<.001:continue
            u=((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det
            v=((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det
            if u>=-1e-6 and v>=-1e-6 and u+v<=1.000001:heights.append(u*az+v*bz+(1-u-v)*cz)
    assert heights, 'Every contact must have retained source ground'
    return max(heights)
observations=[]
for x,z,south in contacts:
    px,py=base_position[0]+x*100,base_position[1]+south*100
    source_z=base_position[2]+z*100
    surface_z=native_surface(px,py)
    observations.append({'x_cm':px,'y_cm':py,'source_z_cm':source_z,'ground_z_cm':surface_z,'offset_cm':surface_z-source_z})
offset=statistics.median(p['offset_cm'] for p in observations)
residual=max(abs(p['offset_cm']-offset) for p in observations)
assert residual<50, 'Inconsistent landing observations; do not apply a blind offset'
registration={'sourceSha256':hashlib.sha256(raw).hexdigest(),'sourceObjectId':2561,'verticalOffsetCm':offset,
              'maxContactResidualCm':residual,'contacts':observations,
              'method':'Median vertical registration of source lowest 15cm stair-landing band to native mapped ground at identical XY',
              'limitations':['Local surface reconciliation, not a surveyed datum correction','Native visual and collision verification still required','Mesh geometry, dimensions, photographs and XY unchanged']}
(streets.OUT/'landmark-registration.json').write_text(json.dumps(registration,indent=2))
print(json.dumps({'landmarkOffsetCm':offset,'contacts':len(contacts),'maxResidualCm':residual}),flush=True)
from mask_museum_ground import main as mask_ground
mask_ground()
