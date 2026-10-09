"""Recover the existing public I3S museum geometry, without generating substitutes."""
import importlib.util
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location('source', ROOT/'scripts/locate-city-hall-source.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
# Reuse retained city resources and their original identities.
OUT = ROOT/'artifacts/city-source-audit/museum'
OUT.mkdir(parents=True, exist_ok=True)
LON, LAT = -75.18105, 39.96557
nodes = {}

def node(index):
    if index not in nodes:
        for item in json.loads(source.capture(f'nodepages/{index//64}'))['nodes']:
            nodes[item['index']] = item
    return nodes[index]

def distance(center):
    return math.hypot((center[0]-LON)*85300, (center[1]-LAT)*111320)

def discover():
    roots = sorted((node(i) for i in node(0)['children']), key=lambda n: distance(n['obb']['center']))[:5]
    candidates = []
    for item in roots:
        resource = item['mesh']['attribute']['resource']
        ids = source.field(resource, 'f_0', 'I')
        names = source.field(resource, 'f_1', 'string')
        if not item['mesh']['material']['definition']:
            continue
        doc = json.loads(source.capture(f'nodes/{resource}'))
        center = doc['mbs'][:3]
        raw = source.capture(f'nodes/{resource}/geometries/0')
        nv, nf = struct.unpack_from('<II', raw)
        assert item['mesh']['geometry']['definition'] == 0 and nf == len(ids)
        positions = struct.unpack_from('<'+'f'*(nv*3), raw, 8)
        offset = 8+nv*36
        geometry_ids = struct.unpack_from('<'+'Q'*nf, raw, offset)
        offset += nf*8
        assert len(raw) == offset+nf*8
        for i, ident in enumerate(geometry_ids):
            assert ident == ids[i]
            first, last = struct.unpack_from('<II', raw, offset+i*8)
            bounds = [[center[a]+min(positions[j*3+a] for j in range(first*3,(last+1)*3)),
                       center[a]+max(positions[j*3+a] for j in range(first*3,(last+1)*3))] for a in range(3)]
            closest = [max(bounds[a][0], min(bounds[a][1], [LON,LAT][a])) for a in range(2)]
            if distance(closest) < 90:
                candidates.append({'objectId':ident,'name':names[i],'rootNode':item['index'],'bounds':bounds,'distance_m':distance(closest)})
    (OUT/'discovery.json').write_text(json.dumps(candidates,indent=2))
    print(json.dumps(candidates,indent=2),flush=True)

def capture_mesh():
    matches = json.loads((OUT/'discovery.json').read_text())
    assert len(matches) == 1 and matches[0]['objectId'] == 2561
    lods = []
    def trace(index):
        item = node(index)
        ids = source.field(item['mesh']['attribute']['resource'], 'f_0', 'I')
        if 2561 not in ids:
            return
        record = {'objectId':2561,'nodeIndex':index,'featureIndex':ids.index(2561),
                  'sourceVersion':item['version'],'leaf':not item.get('children'),'mesh':item['mesh']}
        lods.append(record)
        if record['leaf']:
            resource = item['mesh']['geometry']['resource']
            record['nodeDocument'] = json.loads(source.capture(f'nodes/{resource}'))
            source.capture(f'nodes/{resource}/geometries/0')
            source.capture(f'nodes/{resource}/textures/0')
        for child in item.get('children', []):
            trace(child)
    trace(matches[0]['rootNode'])
    assert sum(r['leaf'] for r in lods) == 1
    (OUT/'museum-mesh.json').write_text(json.dumps({'objectIds':[2561],'source':source.BASE,'lods':lods},indent=2))
    print('Retained museum source and photo atlas; native visual identity check pending',flush=True)

if __name__ == '__main__':
    discover()
    capture_mesh()
