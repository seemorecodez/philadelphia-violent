"""Import the browser's recovered City Hall, preserving its two photo materials."""
import hashlib
import json
from pathlib import Path
import sys
import unreal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from geo_frame import to_unreal

district='-PhillyReadingTerminal' in unreal.SystemLibrary.get_command_line()
arch='-PhillyArchStreet' in unreal.SystemLibrary.get_command_line()
assert not (arch and district)
slug='arch-street' if arch else 'reading-terminal-block' if district else 'city-hall'
expected_ids=[2731,2732,2740,2833,2746,2741,2745,2770,2780] if arch else [2742,2743,2739,2850,2851] if district else [2849,2422]
source = ROOT/f'public/models/city/{slug}-original.glb'
proof = json.loads(source.with_suffix('.provenance.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest() == proof['sha256']
assert proof['objectIds'] == expected_ids
count=len(proof['textureAtlases'])
assert count==(4 if arch else len(expected_ids))
folder = ('/Game/Philadelphia/Assets/ArchStreetOriginal/'+proof['sha256'][:12]) if arch else ('/Game/Philadelphia/Assets/ReadingTerminalOriginal/'+proof['sha256'][:12]) if district else '/Game/Philadelphia/Assets/CityHallOriginal/DistinctSourceMaterials'
assets = unreal.EditorAssetLibrary
assets.make_directory(folder)
if not assets.list_assets(folder,recursive=True,include_folder=False):
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    pipeline.set_editor_property('use_source_name_for_asset',True)
    pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes',True)
    parameters = unreal.ImportAssetParameters()
    parameters.set_editor_property('is_automated',True)
    parameters.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
    data = unreal.InterchangeManager.create_source_data(str(source))
    assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,data,parameters)

meshes=[]
textures=[]
for path in assets.list_assets(folder,recursive=True,include_folder=False):
    obj=assets.load_asset(path)
    if isinstance(obj,unreal.StaticMesh): meshes.append(obj)
    if isinstance(obj,unreal.Texture2D):
        textures.append({'asset':path,'width':obj.blueprint_get_size_x(),'height':obj.blueprint_get_size_y()})
    assets.save_loaded_asset(obj,only_if_is_dirty=True)
assert len(meshes)==1 and len(textures)==count, 'All source pieces and atlases must import'
assert sorted((t['width'],t['height']) for t in textures)==sorted((t['width'],t['height']) for t in proof['textureAtlases'])
mesh=meshes[0]
slots=mesh.get_editor_property('static_materials')
unreal.log('PHILLY_CITY_HALL_SLOTS '+str([(str(s.get_editor_property('material_slot_name')),str(s.get_editor_property('material_interface'))) for s in slots]))
assert len(slots)==count and all(s.get_editor_property('material_interface') for s in slots)
# The editor subsystem is not instantiated in this commandlet. Its read-only
# section query has no instance state; use the engine class default object here.
subsystem=unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem) or unreal.get_default_object(unreal.StaticMeshEditorSubsystem)
section_slots=[subsystem.get_lod_material_slot(mesh,0,i) for i in range(mesh.get_num_sections(0))]
assert set(section_slots)==set(range(count)), 'All source sections must use their distinct material slots'
settings=mesh.get_editor_property('nanite_settings')
settings.set_editor_property('enabled',False)
mesh.set_editor_property('nanite_settings',settings)
mesh.get_editor_property('body_setup').set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
assert assets.save_loaded_asset(mesh)

editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actor_system=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
label='Original Arch Street source cluster' if arch else 'Original Reading Terminal source cluster' if district else 'Original City Hall - sources 2849 and 2422'
matches=[a for a in actor_system.get_all_level_actors() if a.get_actor_label()==label]
assert len(matches)<=1
meta=json.loads((HERE.parent/'Content/SourceData/manifest.json').read_text())
position=to_unreal(*proof['origin'],origin_height=meta['originHeight'])
actor=matches[0] if matches else actor_system.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(*position))
actor.set_actor_label(label)
actor.set_actor_location(unreal.Vector(*position),False,False)
actor.set_actor_rotation(unreal.Rotator(pitch=0,yaw=0,roll=0),False)
actor.static_mesh_component.set_static_mesh(mesh)
actor.set_editor_property('tags',[unreal.Name('ArchStreetOriginal' if arch else 'ReadingTerminalOriginal' if district else 'CityHallOriginal')])
assert editor.save_current_level()
report={'sourceSha256':proof['sha256'],'mesh':mesh.get_path_name(),'sourceTriangles':proof['triangles'],
        'nativeTriangles':mesh.get_num_triangles(0),'textures':textures,'position_cm':position,
        'materials':[s.get_editor_property('material_interface').get_path_name() for s in slots],
        'sectionMaterialSlots':section_slots,
        'status':'Imported at source coordinates; native visual check pending',
        'limits':['Historical photo lighting remains','No interior','No district streaming acceptance']}
(ROOT/f'artifacts/unreal/{slug}-import.json').write_text(json.dumps(report,indent=2))
unreal.log('PHILLY_CITY_HALL_IMPORTED '+json.dumps(report))
