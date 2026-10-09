import json,struct
from pathlib import Path
root=Path.cwd()
def inspect(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);a=d['accessors'];tri=0;lo=[float('inf')]*3;hi=[-float('inf')]*3
 for mesh in d['meshes']:
  for p in mesh['primitives']:
   assert p.get('mode',4)==4
   tri+=a[p.get('indices',p['attributes']['POSITION'])]['count']//3
   v=a[p['attributes']['POSITION']]
   for i in range(3):lo[i]=min(lo[i],v['min'][i]);hi[i]=max(hi[i],v['max'][i])
 return {'triangles':tri,'min':lo,'max':hi,'nodes':d.get('nodes',[])}
x=inspect(root/'public/models/city/arch-street-facade-details.glb');y=inspect(root/'assets/city/blender/arch-street/arch-street-detail.glb')
assert x['triangles']==y['triangles']
# Accessor bounds are comparable only when transforms are identity.
for node in y['nodes']:
 assert 'matrix' not in node
 assert node.get('translation',[0,0,0])==[0,0,0]
 assert node.get('rotation',[0,0,0,1])==[0,0,0,1]
 assert node.get('scale',[1,1,1])==[1,1,1]
error=max(abs(x[k][i]-y[k][i]) for k in ['min','max'] for i in range(3));assert error<.0001
report={'source':x,'blender_export':y,'max_bounds_error_metres':error,'scope':'Triangle count and identity-transform bounds only; not native visual acceptance'}
(root/'assets/city/blender/arch-street/roundtrip-check.json').write_text(json.dumps(report,indent=2))
print(json.dumps({'triangles':y['triangles'],'bounds_error_m':error}))
