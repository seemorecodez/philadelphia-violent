"""Convert retained neighborhood observations into the shared native world frame."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import prepare_district as streets
from geo_frame import ORIGIN, SX, SY
from terrain_conform import grid_height


def prepare(pack):
    root = Path(__file__).resolve().parents[3]
    source = root / 'Unreal/Philadelphia/SourceAssets' / pack
    output = root / 'Unreal/Philadelphia/Content/SourceData' / pack
    observed = json.loads((source / 'manifest.json').read_text())
    raw = (source / 'buildings.geojson').read_bytes()
    if hashlib.sha256(raw).hexdigest() != observed['buildingSha256']:
        raise ValueError('Building observation changed')
    for item in observed['cells']:
        if hashlib.sha256((source / 'cells' / (item['id']+'.json')).read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('Surface observation changed: '+item['id'])
    streets.SOURCE, streets.OUT = source, output
    streets.main()
    meta = json.loads((output / 'manifest.json').read_text())
    original = json.loads((output.parent / 'manifest.json').read_text())
    if abs(meta['originHeight']-original['originHeight']) > .000001:
        raise ValueError('Incompatible native height frame')
    cells = {c['id'] for c in observed['cells']}
    features, omitted = [], []
    def sample(e, n): return streets.height_at(ORIGIN[0]+e/SX, ORIGIN[1]+n/SY)
    for feature in json.loads(raw)['features']:
        geom, properties = feature['geometry'], feature['properties']
        polygons = [geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates'] if geom['type']=='MultiPolygon' else []
        if not polygons: continue
        points = [p for polygon in polygons for ring in polygon for p in ring]
        lon = (min(p[0] for p in points)+max(p[0] for p in points))/2
        lat = (min(p[1] for p in points)+max(p[1] for p in points))/2
        cell = f'{math.floor((lon-ORIGIN[0])*SX/100)}_{math.floor((lat-ORIGIN[1])*SY/100)}'
        if cell not in cells: continue
        identity = properties.get('objectid', feature.get('id'))
        height = properties.get('approx_hgt')
        if identity is None or type(height) not in (int,float) or not math.isfinite(height) or height <= 0:
            omitted.append({'id':identity,'reason':'Missing supplied building identity or height'})
            continue
        base = min(grid_height((p[0]-ORIGIN[0])*SX,(p[1]-ORIGIN[1])*SY,sample) for p in points)
        features.append({'id':str(identity),'longitude':lon,'latitude':lat,'height':height*.3048,
                         'baseHeight':base,'polygons':polygons,'buildingName':str(properties.get('building_name') or '').strip(),'cell':cell})
    (source / 'prepared-buildings.json').write_text(json.dumps({'originHeight':meta['originHeight'],'features':features,'omitted':omitted},separators=(',',':')))
    print(json.dumps({'pack':pack,'sourceCells':len(cells),'preparedBuildings':len(features),'omitted':len(omitted),'nativeRegistration':'Pending valid street spawn and building export'}),flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packs',nargs='+',choices=['west','north','river','fairmount'])
    for name in dict.fromkeys(parser.parse_args().packs): prepare(name)
