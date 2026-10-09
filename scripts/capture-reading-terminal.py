"""Retain real textured source geometry for the Reading Terminal block cluster."""
import importlib.util
import json
from pathlib import Path

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('capture',HERE/'capture-city-hall-mesh.py')
capture=importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)
IDS=[2742,2743,2739,2850,2851]
OUT=HERE.parent/'artifacts/city-source-audit/reading-terminal'


def main():
    result=[]
    for ident in IDS:
        capture.trace(762,ident,result)
    leaves=[r for r in result if r['leaf']]
    assert all(any(r['objectId']==ident for r in leaves) for ident in IDS)
    assert len(leaves)<=16, 'Unexpected source fanout; inspect before extending capture'
    for leaf in leaves:
        resource=leaf['mesh']['geometry']['resource']
        assert leaf['mesh']['material']['definition'] in (1,2), 'Do not replace textured candidates with plain meshes'
        doc=json.loads(capture.source.capture(f'nodes/{resource}'))
        leaf['nodeDocument']=doc
        capture.source.capture(f'nodes/{resource}/geometries/0')
        assert any(t['href']=='./textures/0' for t in doc.get('textureData',[]))
        capture.source.capture(f'nodes/{resource}/textures/0')
    report={'objectIds':IDS,'source':capture.source.BASE,
            'identity':'Reading Terminal area source cluster by real geographic bounds; rendered identities pending',
            'sourceCache':'artifacts/city-source-audit/city-hall','lods':result}
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'source-meshes.json').write_text(json.dumps(report,indent=2))
    print(json.dumps([{'id':r['objectId'],'node':r['nodeIndex'],'mesh':r['mesh']} for r in leaves],indent=2))


if __name__=='__main__':
    main()
