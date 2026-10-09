"""Import source 2561 at its retained geographic position into the native world."""
import hashlib
import json
from pathlib import Path
import sys
import unreal

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE))
from geo_frame import to_unreal
assets=unreal.EditorAssetLibrary
source=ROOT/'public/models/city/source-2561.glb'
proof=json.loads(source.with_suffix('.provenance.json').read_text())
assert proof['objectId']==2561 and proof['originalJpegBytesPreserved']
assert hashlib.sha256(source.read_bytes()).hexdigest()==proof['outputSha256']
folder='/Game/Philadelphia/Assets/MuseumOriginal/'+proof['outputSha256'][:12]
assets.make_directory(folder)
if not assets.list_assets(folder,recursive=True,include_folder=False):
    pipeline=unreal.InterchangeGenericAssetsPipeline()
    pipeline.set_editor_property('use_source_name_for_asset',True)
    pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes',True)
    parameters=unreal.ImportAssetParameters()
    parameters.set_editor_property('is_automated',True)
    parameters.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
    data=unreal.InterchangeManager.create_source_data(str(source))
    assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,data,parameters)
meshes=[]
textures=[]
for path in assets.list_assets(folder,recursive=True,include_folder=False):
    obj=assets.load_asset(path)
    if isinstance(obj,unreal.StaticMesh):meshes.append(obj)
    if isinstance(obj,unreal.Texture2D):textures.append(obj)
    assets.save_loaded_asset(obj,only_if_is_dirty=True)
assert len(meshes)==1 and len(textures)==1
mesh=meshes[0]
assert (textures[0].blueprint_get_size_x(),textures[0].blueprint_get_size_y())==(proof['textureDimensions']['width'],proof['textureDimensions']['height'])
slots=mesh.get_editor_property('static_materials')
assert len(slots)==1 and slots[0].get_editor_property('material_interface')
nanite=mesh.get_editor_property('nanite_settings')
nanite.set_editor_property('enabled',False)
mesh.set_editor_property('nanite_settings',nanite)
mesh.get_editor_property('body_setup').set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
assert assets.save_loaded_asset(mesh)
# Compare the full native mesh after disabling the automatically generated
# Nanite fallback. Its reduced fallback triangle count is not the source count.
assert mesh.get_num_triangles(0)==proof['triangles'], (mesh.get_num_triangles(0),proof['triangles'])
editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actor_system=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
label='Philadelphia Museum of Art - original source 2561'
matches=[a for a in actor_system.get_all_level_actors() if a.get_actor_label()==label]
assert len(matches)<=1
meta=json.loads((HERE.parent/'Content/SourceData/manifest.json').read_text())
position=to_unreal(*proof['origin'],origin_height=meta['originHeight'])
registration=json.loads((HERE.parent/'Content/SourceData/museum/landmark-registration.json').read_text())
assert registration['sourceSha256']==proof['outputSha256'] and registration['maxContactResidualCm']<50
position=(position[0],position[1],position[2]+registration['verticalOffsetCm'])
actor=matches[0] if matches else actor_system.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(*position))
actor.set_actor_label(label)
actor.set_actor_location(unreal.Vector(*position),False,False)
actor.set_actor_rotation(unreal.Rotator(pitch=0,yaw=0,roll=0),False)
actor.static_mesh_component.set_static_mesh(mesh)
actor.static_mesh_component.set_collision_profile_name('BlockAll')
actor.set_editor_property('tags',[unreal.Name('MuseumOriginal')])
assert editor.save_current_level()
report={'sourceSha256':proof['outputSha256'],'sourceObjectId':2561,'mesh':mesh.get_path_name(),
        'triangles':mesh.get_num_triangles(0),'photoDimensions':proof['textureDimensions'],
        'position_cm':position,'verticalRegistration':registration,'status':'Imported; native visual and gameplay checks pending',
        'limits':['Historical photo lighting and occlusion remain','No interior','Approach terrain and source step collision require gameplay inspection']}
(ROOT/'artifacts/unreal/museum-import.json').write_text(json.dumps(report,indent=2))
unreal.log('PHILLY_MUSEUM_IMPORTED '+json.dumps(report))
# Reimporting the source must retain the installed native stair reconstruction.
if (HERE.parent/'SourceAssets/Museum/details/source.json').exists() and (HERE.parent/'SourceAssets/Museum/stone/source.json').exists():
    import runpy
    runpy.run_path(str(HERE/'import_museum_stairs.py'),run_name='__main__')
