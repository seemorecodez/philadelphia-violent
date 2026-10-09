"""Export retained source surfaces into native centimetre cells with real heights.

Uses the same public Terrarium source as the browser build. No missing-height
fallback, imagery, invented roads, or fabricated buildings. Run with Python/PIL.
"""
import hashlib
import io
import json
import math
from pathlib import Path
import sys
import urllib.request
from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from geo_frame import ORIGIN, SX, SY, to_unreal
from terrain_conform import grid_height, conform_triangle, conform_segment

SOURCE = ROOT / 'public/data/district'
OUT = HERE.parent / 'Content/SourceData'
CACHE = ROOT / 'artifacts/unreal/terrain'
tiles = {}
receipts = {}


def pixel_height(px, py):
    x, y = math.floor(px), math.floor(py)
    tx, ty = x // 256, y // 256
    key = (tx,ty)
    if key not in tiles:
        path = CACHE / f'15-{tx}-{ty}.png'
        url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/15/{tx}/{ty}.png'
        if not path.exists():
            with urllib.request.urlopen(url, timeout=45) as response:
                data = response.read()
            image = Image.open(io.BytesIO(data)).convert('RGBA')
            if image.size != (256,256):
                raise ValueError('Unexpected terrain tile size')
            path.write_bytes(data)
        raw = path.read_bytes()
        tiles[key] = Image.open(io.BytesIO(raw)).convert('RGBA')
        receipts[str(path.relative_to(ROOT))] = {'url': url, 'sha256': hashlib.sha256(raw).hexdigest()}
    r,g,b,a = tiles[key].getpixel((x%256,y%256))
    height = r*256+g+b/256-32768
    if a != 255 or height == -32768:
        raise ValueError('Missing terrain observation')
    return height


def height_at(lon, lat):
    # Raster pixel centres, including neighbouring tiles at sample boundaries.
    px = (lon+180)/360 * (256*2**15) - .5
    py = (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2 * (256*2**15) - .5
    x,y = math.floor(px),math.floor(py)
    fx,fy = px-x,py-y
    return (pixel_height(x,y)*(1-fx)+pixel_height(x+1,y)*fx)*(1-fy) + (pixel_height(x,y+1)*(1-fx)+pixel_height(x+1,y+1)*fx)*fy


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((SOURCE/'manifest.json').read_text())
    spawn = [-75.15599476,39.95493557]
    base = height_at(*spawn)
    cached = {}
    def sample(east,north):
        key=(east,north)
        if key not in cached:
            cached[key]=height_at(ORIGIN[0]+east/SX,ORIGIN[1]+north/SY)
        return cached[key]
    def vertex(east,north,relief=0):
        height=grid_height(east,north,sample)
        return [round(east*100,3),round(-north*100,3),round((height-base+relief)*100,3)]
    entries=[]
    source_triangles=0
    output_triangles=0
    max_adjustment=0
    for entry in manifest['cells']:
        original=SOURCE/'cells'/f"{entry['id']}.json"
        cell=json.loads(original.read_text())
        groups={}
        for kind,flat in cell['groups'].items():
            relief=.16 if kind=='sidewalk' else .018 if kind in ('paint','yellow') else .004
            assert len(flat)%6==0
            result=[]
            for i in range(0,len(flat),6):
                points=[tuple(flat[i+j:i+j+2]) for j in (0,2,4)]
                source_triangles+=1
                for p in points:
                    max_adjustment=max(max_adjustment,abs(grid_height(*p,sample)-sample(*p)))
                for triangle in conform_triangle(points):
                    output_triangles+=1
                    for p in triangle:result.extend(vertex(*p,relief))
            groups[kind]=result
        # Source terrain fills between mapped surfaces. Keep 2cm below pavement.
        ground=[]
        for x in range(cell['x']*100,(cell['x']+1)*100,10):
            for y in range(cell['y']*100,(cell['y']+1)*100,10):
                for p in [(x,y),(x+10,y),(x+10,y+10),(x,y),(x+10,y+10),(x,y+10)]:
                    ground.extend(vertex(*p,-.02))
        groups['ground']=ground
        curbs=[]
        for i in range(0,len(cell['curbs']),4):
            x,y,a,b=cell['curbs'][i:i+4]
            segments=conform_segment((x,y),(a,b))
            for start,end in zip(segments,segments[1:]):
                lo1,lo2=vertex(*start),vertex(*end)
                hi1,hi2=vertex(*start,.16),vertex(*end,.16)
                for p in [lo1,lo2,hi2,lo1,hi2,hi1]: curbs.extend(p)
        groups['curb']=curbs
        path=OUT/f"{entry['id']}.json"
        path.write_text(json.dumps({'id':entry['id'],'groups':groups},separators=(',',':')))
        entries.append({'id':entry['id'],'x':(cell['x']+.5)*10000,'y':-(cell['y']+.5)*10000,
                        'sourceSha256':hashlib.sha256(original.read_bytes()).hexdigest()})
        if len(entries)%25==0:print(f'Conformed {len(entries)} / {len(manifest["cells"])} source cells',flush=True)
    landmark=[-75.155179,39.955632]
    metadata={'schema':1,'units':'centimetres','axes':'X east, Y south, Z up',
              'origin':ORIGIN,'originHeight':base,'terrain':'Shared 10m piecewise-planar grid from Terrarium z15 observations',
              'surfaceConformance':{'gridMeters':10,'sourceTriangles':source_triangles,'outputTriangles':output_triangles,'maxOriginalVertexHeightAdjustmentM':max_adjustment},
              'target':{'width':1920,'height':1080,'fps':60},'cells':entries,
              'spawn':to_unreal(*spawn,base+.94,base),
              'landmark':to_unreal(*landmark,height_at(*landmark),base),
              'sourceManifestSha256':hashlib.sha256((SOURCE/'manifest.json').read_bytes()).hexdigest(),
              'terrainSources':receipts,'limitations':['Historical source geometry is not final architecture.',
              'Terrain source is not a surveyed road or bridge deck.']}
    (OUT/'manifest.json').write_text(json.dumps(metadata,indent=2))
    print(json.dumps({'cells':len(entries),'sampledVertices':len(cached),'terrainTiles':len(tiles),'spawn':metadata['spawn']}))


if __name__ == '__main__': main()
