"""Retain the exact I3S City Hall LOD chain and original leaf payloads."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('source',Path(__file__).with_name('locate-city-hall-source.py'))
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
nodes = {}


def node(index):
    if index not in nodes:
        for item in json.loads(source.capture(f'nodepages/{index//64}'))['nodes']:
            nodes[item['index']] = item
    return nodes[index]


def trace(index, feature, result):
    item = node(index)
    resource = item['mesh']['attribute']['resource']
    ids = source.field(resource,'f_0','I')
    if feature not in ids:
        return
    assert ids.count(feature) == 1
    result.append({'objectId':feature,'nodeIndex':index,'featureIndex':ids.index(feature),'sourceVersion':item['version'],
                   'leaf':not item.get('children'),'mesh':item['mesh']})
    for child in item.get('children',[]):
        trace(child,feature,result)


def main():
    result = []
    trace(632,2849,result)
    trace(632,2422,result)
    for leaf in (r for r in result if r['leaf']):
        resource = leaf['mesh']['geometry']['resource']
        doc = json.loads(source.capture(f'nodes/{resource}'))
        leaf['nodeDocument'] = doc
        source.capture(f'nodes/{resource}/geometries/0')
        for texture in doc.get('textureData',[]):
            if texture['href'].endswith('/0') or texture.get('id') == '0':
                source.capture(f'nodes/{resource}/'+texture['href'].removeprefix('./'))
    report = {'objectIds':[2849,2422],'source':source.BASE,'identity':'City Hall northern tower section and candidate southern section; assembly visual verification pending','lods':result}
    (source.OUT/'city-hall-mesh.json').write_text(json.dumps(report,indent=2))
    print(json.dumps([{'node':r['nodeIndex'],'leaf':r['leaf'],'mesh':r['mesh']} for r in result],indent=2))


if __name__ == '__main__':
    main()
