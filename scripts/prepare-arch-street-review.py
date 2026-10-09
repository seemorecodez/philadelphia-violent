"""Place the asset review on retained Arch Street, using native road height."""
import hashlib
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'Unreal/Philadelphia/Scripts'))
from geo_frame import to_unreal, from_unreal

DATA = ROOT/'Unreal/Philadelphia/Content/SourceData'
meta = json.loads((DATA/'manifest.json').read_text())
proof = json.loads((ROOT/'public/models/city/arch-street-original.provenance.json').read_text())
streets = ROOT/'public/data/district/streets.geojson'
features = json.loads(streets.read_text())['features']
road = next(f for f in features if str(f['properties']['objectid']) == '13636')
assert road['properties']['st_name'] == 'ARCH'
a, b = [to_unreal(*ll, 0) for ll in road['geometry']['coordinates']]
target = to_unreal(*proof['origin'], origin_height=meta['originHeight'])
dx, dy = b[0]-a[0], b[1]-a[1]
t = ((target[0]-a[0])*dx+(target[1]-a[1])*dy)/(dx*dx+dy*dy)
assert .05 < t < .95, 'The review must be within this block, away from intersections'
x, y = a[0]+t*dx, a[1]+t*dy
hits = []
for entry in meta['cells']:
    if math.hypot(entry['x']-x, entry['y']-y) > 15000:
        continue
    path = DATA/(entry['id']+'.json')
    flat = json.loads(path.read_text())['groups'].get('road', [])
    for i in range(0, len(flat), 9):
        ax,ay,az,bx,by,bz,cx,cy,cz = flat[i:i+9]
        det = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(det) < 1e-8:
            continue
        u = ((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det
        v = ((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det
        w = 1-u-v
        if min(u,v,w) >= -1e-7:
            hits.append({'cell':entry['id'], 'triangle':i//9,
                         'heightCm':u*az+v*bz+w*cz,
                         'cellSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
assert hits, 'No retained road exists at the proposed player location'
assert max(h['heightCm'] for h in hits)-min(h['heightCm'] for h in hits) < .1
z = hits[0]['heightCm']
result = {
    'scope':'Source-derived Arch Street player-camera review, not gameplay acceptance',
    'sourceRoadObjectId':13636,
    'streetDataSha256':hashlib.sha256(streets.read_bytes()).hexdigest(),
    'sourceMeshSha256':proof['sha256'],
    'segmentFraction':t,
    'roadHits':hits,
    'pawnCm':[x,y,z+94],
    'yawDegrees':math.degrees(math.atan2(target[1]-y,target[0]-x)),
    'pitchDegrees':6,
    'browserEyeLonLatHeight':from_unreal(x,y,z+165,origin_height=meta['originHeight']),
    'limits':['Browser eye and third-person player camera are different views',
              'Height follows retained road geometry, not surveyed street elevation']
}
payload = json.dumps(result, indent=2)+'\n'
(DATA/'arch-street-review.json').write_text(payload)
(ROOT/'public/models/city/arch-street-review.json').write_text(payload)
print(payload)
