"""Bake the South source pack into the existing native centimetre frame."""
import json
import math
from pathlib import Path
import prepare_district as streets
from geo_frame import ORIGIN,SX,SY,to_unreal
from terrain_conform import grid_height

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'Unreal/Philadelphia/SourceAssets/South'
OUT=ROOT/'Unreal/Philadelphia/Content/SourceData/south'
streets.SOURCE=SOURCE
streets.OUT=OUT
streets.main()
meta=json.loads((OUT/'manifest.json').read_text())
original=json.loads((OUT.parent/'manifest.json').read_text())
assert abs(meta['originHeight']-original['originHeight'])<.000001
def sample(e,n):return streets.height_at(ORIGIN[0]+e/SX,ORIGIN[1]+n/SY)
features=[]
for f in json.loads((SOURCE/'buildings.geojson').read_text())['features']:
    geom=f['geometry'];p=f['properties']
    polys=[geom['coordinates']] if geom['type']=='Polygon' else geom['coordinates'] if geom['type']=='MultiPolygon' else []
    if not polys:continue
    coords=[q for poly in polys for ring in poly for q in ring]
    lon=(min(q[0] for q in coords)+max(q[0] for q in coords))/2
    lat=(min(q[1] for q in coords)+max(q[1] for q in coords))/2
    e,n=(lon-ORIGIN[0])*SX,(lat-ORIGIN[1])*SY
    x,y=math.floor(e/100),math.floor(n/100)
    if not (-8<=x<=-4 and -23<=y<=-19):continue
    height=p.get('approx_hgt')
    if not isinstance(height,(int,float)) or height<=0:continue
    # Foundation starts at the lowest observed boundary height. Source footprint
    # and supplied height are retained; interior rooms are not invented here.
    base=min(grid_height((q[0]-ORIGIN[0])*SX,(q[1]-ORIGIN[1])*SY,sample) for q in coords)
    features.append({'id':str(p.get('objectid',f.get('id'))),'longitude':lon,'latitude':lat,'height':height*.3048,'baseHeight':base,'polygons':polys,'buildingName':str(p.get('building_name') or '').strip(),'cell':f'{x}_{y}'})
(SOURCE/'prepared-buildings.json').write_text(json.dumps({'originHeight':meta['originHeight'],'features':features},separators=(',',':')))
print(json.dumps({'preparedBuildings':len(features),'pack':str(OUT)}),flush=True)
