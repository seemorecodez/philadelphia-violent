"""Retain textured source leaves on Arch Street inside the requested district."""
import importlib.util
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('capture',HERE/'capture-city-hall-mesh.py')
capture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
LEAVES=[756,751,750,754]
OUT=HERE.parent/'artifacts/city-source-audit/arch-street'


def main():
    records=[]
    for index in LEAVES:
        node=capture.node(index)
        assert not node.get('children') and node['mesh']['material']['definition'] in (1,2)
        assert node['mesh']['geometry']['definition']==1
        resource=node['mesh']['geometry']['resource']
        ids=capture.source.field(node['mesh']['attribute']['resource'],'f_0','I')
        assert len(ids)==node['mesh']['geometry']['featureCount'] and len(set(ids))==len(ids)
        doc=json.loads(capture.source.capture(f'nodes/{resource}'))
        assert any(t['href']=='./textures/0' for t in doc.get('textureData',[]))
        capture.source.capture(f'nodes/{resource}/geometries/0')
        capture.source.capture(f'nodes/{resource}/textures/0')
        for i,ident in enumerate(ids):
            records.append({'objectId':ident,'nodeIndex':index,'featureIndex':i,
                            'sourceVersion':node['version'],'leaf':True,'mesh':node['mesh'],'nodeDocument':doc})
        print(json.dumps({'node':index,'ids':ids,'vertices':node['mesh']['geometry']['vertexCount']}),flush=True)
    assert len(records)==9
    OUT.mkdir(parents=True,exist_ok=True)
    report={'objectIds':[r['objectId'] for r in records],'source':capture.source.BASE,
            'identity':'Arch Street textured source records; individual identities require visual review',
            'sourceCache':'artifacts/city-source-audit/city-hall','lods':records}
    (OUT/'source-meshes.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__':main()
