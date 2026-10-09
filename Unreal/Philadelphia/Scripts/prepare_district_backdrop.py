"""Bake mapped surfaces onto retained distant terrain; no invented coverage.

The near streaming cells remain authoritative. The backdrop is 5 cm lower and
omits road relief, vertical curbs and painted lines; nearby cells retain them.
This is coverage/LOD work, not final ground art or a complete aerial world.
"""
import hashlib
import json
import math
from pathlib import Path
import struct
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'Content/SourceData'
COLORS = {
    'road': (.07, .078, .085), 'grass': (.11, .19, .07),
    'earth': (.23, .22, .19), 'ground': (.23, .22, .19),
    'parking': (.11, .12, .13), 'sidewalk': (.46, .44, .40),
    'concrete': (.46, .44, .40), 'gravel': (.46, .44, .40),
}


def main():
    manifest = json.loads((DATA / 'manifest.json').read_text())
    bounds = [min(c['x'] for c in manifest['cells'])-5000,
              min(c['y'] for c in manifest['cells'])-5000,
              max(c['x'] for c in manifest['cells'])+5000,
              max(c['y'] for c in manifest['cells'])+5000]
    size = (4096, 4096)
    def srgb(values):
        return tuple(round(255*(12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055)) for v in values)
    atlas = Image.new('RGB', size, srgb(COLORS['ground']))
    draw = ImageDraw.Draw(atlas)
    def pixel(point):
        return ((point[0]-bounds[0])/(bounds[2]-bounds[0])*(size[0]-1),
                (point[1]-bounds[1])/(bounds[3]-bounds[1])*(size[1]-1))
    vertices, indices, lookup, sources = [], [], {}, []
    rejected = 0
    for cell in manifest['cells']:
        path = DATA / (cell['id'] + '.json')
        raw = path.read_bytes()
        groups = json.loads(raw)['groups']
        assert not set(groups) - set(COLORS) - {'curb', 'paint', 'yellow'}
        sources.append({'id': cell['id'], 'sha256': hashlib.sha256(raw).hexdigest()})
        # Only actual bare-earth triangles are needed at distance. Surface
        # categories are baked below from geometry, never satellite photographs.
        for kind in ('ground',):
            flat = groups[kind]
            assert len(flat) % 9 == 0 and all(math.isfinite(x) for x in flat)
            for i in range(0, len(flat), 9):
                p = [flat[i+j:i+j+3] for j in (0, 3, 6)]
                a = [p[2][j]-p[0][j] for j in range(3)]
                b = [p[1][j]-p[0][j] for j in range(3)]
                cross = (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
                length = math.sqrt(sum(x*x for x in cross))
                if length < .01:
                    rejected += 1
                    continue
                normal = tuple(x/length for x in cross)
                for point in p:
                    # Full precision normals preserve each retained source face.
                    record = struct.pack('<9f', point[0], point[1], point[2]-5, *normal, 1, 1, 1)
                    if record not in lookup:
                        lookup[record] = len(vertices)
                        vertices.append(record)
                    indices.append(lookup[record])
        # Broad land use first, then traversable surfaces. Fine street paint and
        # vertical curbs belong to the nearby geometric representation only.
        for kind in ('earth', 'grass', 'gravel', 'concrete', 'parking', 'road', 'sidewalk'):
            flat = groups.get(kind, [])
            assert len(flat) % 9 == 0 and all(math.isfinite(x) for x in flat)
            for start in range(0, len(flat), 9):
                draw.polygon([pixel(flat[start+j:start+j+3]) for j in (0, 3, 6)], fill=srgb(COLORS[kind]))
    assert indices and max(indices) < len(vertices)
    atlas_path = DATA / 'district-backdrop.png'
    atlas.save(atlas_path)
    payload = b'PHLYLOD2' + struct.pack('<II4f', len(vertices), len(indices), *bounds) + b''.join(vertices) + struct.pack(f'<{len(indices)}I', *indices)
    output = DATA / 'district-backdrop.bin'
    output.write_bytes(payload)
    proof = {'schema': 2, 'sourceCells': sources, 'vertices': len(vertices),
             'triangles': len(indices)//3, 'rejectedSlivers': rejected,
             'bytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest(),
             'units': 'centimetres', 'verticalOffsetCm': -5,
             'uvBoundsCm': bounds, 'textureSize': size,
             'textureSha256': hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
             'geometryGroups': ['ground'], 'textureGroups': ['earth', 'grass', 'gravel', 'concrete', 'parking', 'road', 'sidewalk'],
             'excludedGroups': ['curb', 'paint', 'yellow'], 'collision': False,
             'limitations': ['Retained district coverage only', 'Existing flat source materials are not final art',
                            'Buildings and distant city coverage require separate LOD',
                            'Road height relief omitted at distance; near cells remain physical geometry']}
    output.with_suffix('.json').write_text(json.dumps(proof, indent=2)+'\n')
    print(json.dumps({k: v for k, v in proof.items() if k != 'sourceCells'}))


if __name__ == '__main__':
    main()
