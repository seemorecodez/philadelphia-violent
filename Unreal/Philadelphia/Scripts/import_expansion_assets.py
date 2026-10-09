"""Stage retained photographs and meshes in Unreal; does not alter the game map."""
import json
from pathlib import Path
import unreal
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
manifest=json.loads((HERE.parent/'SourceAssets/DowntownExpansion/manifest.json').read_text())
assets=unreal.EditorAssetLibrary
report={'classification':'Staged historical assets; placement and visual acceptance pending','assets':[],'excluded':['philly_0000']}
for item in manifest['assets']:
    if item['id']=='philly_0000':continue
    folder='/Game/Philadelphia/Assets/DowntownExpansion/'+item['id']
    assets.make_directory(folder)
    if not assets.list_assets(folder,recursive=True,include_folder=False):
        pipeline=unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset',True)
        pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes',True)
        params=unreal.ImportAssetParameters()
        params.set_editor_property('is_automated',True)
        params.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
        source=unreal.InterchangeManager.create_source_data(str(ROOT/item['glb']))
        assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,source,params)
    meshes=[];textures=[]
    for path in assets.list_assets(folder,recursive=True,include_folder=False):
        obj=assets.load_asset(path)
        if isinstance(obj,unreal.StaticMesh):meshes.append(obj)
        if isinstance(obj,unreal.Texture2D):textures.append(path)
        assets.save_loaded_asset(obj,only_if_is_dirty=True)
    assert len(meshes)==1 and len(textures)==len(item['textures']),item['id']
    mesh=meshes[0]
    settings=mesh.get_editor_property('nanite_settings');settings.set_editor_property('enabled',False);mesh.set_editor_property('nanite_settings',settings)
    assert assets.save_loaded_asset(mesh)
    report['assets'].append({'id':item['id'],'mesh':mesh.get_path_name(),'textures':textures,'source':item['glb'],'position_cm':item['position_cm']})
    (ROOT/'artifacts/unreal/downtown-expansion-import.json').write_text(json.dumps(report,indent=2))
    unreal.log('PHILLY_EXPANSION_STAGED '+item['id'])
unreal.log('PHILLY_EXPANSION_STAGING_COMPLETE '+str(len(report['assets'])))
