"""Locate the existing browser's City Hall source; retain bounded public evidence."""
import concurrent.futures
import gzip
import hashlib
import json
import struct
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'artifacts/city-source-audit/city-hall'
BASE = 'https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/philadelphia_Bldgs_text_untex/SceneServer/layers/0'
OUT.mkdir(parents=True, exist_ok=True)


def capture(relative):
    file = OUT/(relative.replace('/', '-')+'.bin')
    if file.exists():
        return file.read_bytes()
    request = urllib.request.Request(BASE+'/'+relative, headers={'Accept-Encoding':'gzip'})
    with urllib.request.urlopen(request, timeout=30) as response:
        data = response.read(8*1024*1024+1)
        assert len(data) <= 8*1024*1024, 'Resource exceeds discovery limit'
        if response.headers.get('Content-Encoding') == 'gzip' or data[:2] == b'\x1f\x8b':
            data = gzip.decompress(data)
        assert len(data) <= 16*1024*1024
    file.write_bytes(data)
    return data


def field(resource, key, kind):
    data = capture(f'nodes/{resource}/attributes/{key}/0')
    count, = struct.unpack_from('<I', data)
    assert count <= 5000
    if kind == 'string':
        lengths = struct.unpack_from('<'+'I'*count, data, 8)
        start = 8+4*count
        values = []
        for length in lengths:
            values.append(data[start:start+length].rstrip(b'\0').decode('utf8'))
            start += length
        assert start == len(data)
        return values
    offset = 8 if kind == 'd' else 4
    assert len(data) == offset+struct.calcsize(kind)*count
    return list(struct.unpack_from('<'+kind*count, data, offset))


def main():
    root = json.loads(capture('nodepages/0'))['nodes'][0]
    pages = sorted({n//64 for n in root['children']} | {0})
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        loaded = list(pool.map(lambda page: json.loads(capture(f'nodepages/{page}')), pages))
    nodes = {n['index']: n for page in loaded for n in page['nodes']}
    # Geographic proximity narrows candidates; feature identity is still required.
    def distance(n):
        lon,lat,_ = n['obb']['center']
        return (((lon+75.1636)*85000)**2+((lat-39.9526)*111320)**2)**.5
    roots = sorted((nodes[i] for i in root['children']), key=distance)[:5]
    matches = []
    for node in roots:
        resource = node['mesh']['attribute']['resource']
        names = field(resource, 'f_1', 'string')
        ids = field(resource, 'f_0', 'I')
        lats = field(resource, 'f_2', 'd')
        lons = field(resource, 'f_3', 'd')
        heights = field(resource, 'f_4', 'd')
        geometry_bounds = {}
        # The textured 2015 records have blank names and zero placement fields.
        # Locate them from the original per-feature geometry, not those fields.
        if node['mesh']['material']['definition'] and all(v == 0 for v in lats):
            document = json.loads(capture(f'nodes/{resource}'))
            center = document.get('mbs', document.get('obb',{}).get('center'))[:3]
            data = capture(f'nodes/{resource}/geometries/0')
            vertices,features = struct.unpack_from('<II',data)
            assert features == len(ids) and vertices <= 500000
            positions = struct.unpack_from('<'+'f'*(vertices*3), data, 8)
            # Geometry definition 0: position, normal, UV, RGBA, IDs, ranges.
            assert node['mesh']['geometry']['definition'] == 0
            offset = 8+vertices*(12+12+8+4)
            geometry_ids = struct.unpack_from('<'+'Q'*features,data,offset)
            offset += features*8
            assert len(data) == offset+features*8
            for i,ident in enumerate(geometry_ids):
                assert ident == ids[i]
                first,last = struct.unpack_from('<II',data,offset+i*8)
                bounds = [[center[a]+min(positions[j*3+a] for j in range(first*3,(last+1)*3)),
                           center[a]+max(positions[j*3+a] for j in range(first*3,(last+1)*3))] for a in range(3)]
                lons[i] = sum(bounds[0])/2
                lats[i] = sum(bounds[1])/2
                heights[i] = bounds[2][0]
                geometry_bounds[i] = bounds
        for i,name in enumerate(names):
            dist = (((lons[i]+75.1636)*85000)**2+((lats[i]-39.9526)*111320)**2)**.5
            if dist < 180 or 'hall' in name.lower():
                matches.append({'name':name,'objectId':ids[i],'origin':[lons[i],lats[i],heights[i]],
                    'distance_m':dist,'rootNode':node['index'],'resource':resource,
                    'materialDefinition':node['mesh']['material']['definition'],
                    'geometryBounds':geometry_bounds.get(i)})
    report = {'source':BASE,'classification':'Source identity candidates; render verification pending',
              'candidates':sorted(matches,key=lambda x:x['distance_m']),
              'files':[{'file':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()} for f in OUT.glob('*.bin')]}
    (OUT/'discovery.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report['candidates'],indent=2))


if __name__ == '__main__':
    main()
