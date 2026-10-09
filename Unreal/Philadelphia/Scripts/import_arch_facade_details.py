"""Add the source-guided facade relief, preserving original source actors."""
import hashlib
import json
from pathlib import Path
import sys
import unreal

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
sys.path.insert(0,str(HERE))
from geo_frame import to_unreal

source=ROOT/'public/models/city/arch-street-facade-details.glb'
proof=json.loads(source.with_suffix('.provenance.json').read_text())
assert hashlib.sha256(source.read_bytes()).hexdigest()==proof['sha256']
assert proof['sourceObjectId']==2740
folder='/Game/Philadelphia/Assets/ArchFacadeDetails/'+proof['sha256'][:12]
assets=unreal.EditorAssetLibrary
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
for path in assets.list_assets(folder,recursive=True,include_folder=False):
    obj=assets.load_asset(path)
    if isinstance(obj,unreal.StaticMesh): meshes.append(obj)
    assets.save_loaded_asset(obj,only_if_is_dirty=True)
assert len(meshes)==1
mesh=meshes[0]
assert len(mesh.get_editor_property('static_materials'))==3
# Source photography carries shadows and occlusions. New stone receives lighting
# in the game and restrained world-space mineral variation, rather than reusing
# those baked shadows as its surface color. Fast gradient uses a texture lookup;
# two levels are deliberately bounded for the integrated-GPU evaluation.
material_path='/Game/Philadelphia/Materials/M_ArchFacadeStone'
stone=assets.load_asset(material_path) if assets.does_asset_exist(material_path) else unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_ArchFacadeStone','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
edit=unreal.MaterialEditingLibrary
edit.delete_all_material_expressions(stone)
stone.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_DEFAULT_LIT)
noise=edit.create_material_expression(stone,unreal.MaterialExpressionNoise)
noise.set_editor_property('noise_function',unreal.NoiseFunction.NOISEFUNCTION_GRADIENT_TEX3D)
noise.set_editor_property('levels',2)
noise.set_editor_property('scale',.15)
noise.set_editor_property('output_min',.80)
noise.set_editor_property('output_max',1.0)
color=edit.create_material_expression(stone,unreal.MaterialExpressionConstant3Vector)
color.set_editor_property('constant',unreal.LinearColor(.55,.50,.40,1))
multiply=edit.create_material_expression(stone,unreal.MaterialExpressionMultiply)
assert edit.connect_material_expressions(color,'',multiply,'A')
assert edit.connect_material_expressions(noise,'',multiply,'B')
assert edit.connect_material_property(multiply,'',unreal.MaterialProperty.MP_BASE_COLOR)
roughness=edit.create_material_expression(stone,unreal.MaterialExpressionConstant)
roughness.set_editor_property('r',.86)
assert edit.connect_material_property(roughness,'',unreal.MaterialProperty.MP_ROUGHNESS)
edit.recompile_material(stone)
assert assets.save_loaded_asset(stone)
stone_slots=[]
for i,slot in enumerate(mesh.get_editor_property('static_materials')):
    if 'limestone' in str(slot.get_editor_property('material_slot_name')).lower():
        mesh.set_material(i,stone)
        stone_slots.append(i)
assert len(stone_slots)==1, 'Replace only the imported limestone material'
settings=mesh.get_editor_property('nanite_settings')
settings.set_editor_property('enabled',False)
mesh.set_editor_property('nanite_settings',settings)
assets.save_loaded_asset(mesh)
unreal.log(f'PHILLY_ARCH_FACADE_TRIANGLES native={mesh.get_num_triangles(0)} source={proof["triangles"]}')
assert mesh.get_num_triangles(0)==proof['triangles'], 'Native LOD0 must retain authored facade faces'
editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
all_actors=actors.get_all_level_actors()
assert any(a.actor_has_tag('ArchStreetOriginal') for a in all_actors)
label='Source-guided Arch Street facade detail 2740'
matches=[a for a in all_actors if a.get_actor_label()==label]
assert len(matches)<=1
meta=json.loads((HERE.parent/'Content/SourceData/manifest.json').read_text())
position=to_unreal(*proof['origin'],origin_height=meta['originHeight'])
actor=matches[0] if matches else actors.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(*position))
actor.set_actor_label(label)
actor.set_actor_location(unreal.Vector(*position),False,False)
actor.set_actor_rotation(unreal.Rotator(pitch=0,yaw=0,roll=0),False)
actor.static_mesh_component.set_static_mesh(mesh)
actor.static_mesh_component.set_collision_profile_name('NoCollision')
actor.static_mesh_component.set_collision_enabled(unreal.CollisionEnabled.NO_COLLISION)
actor.set_actor_enable_collision(False)
actor.set_editor_property('tags',[unreal.Name('ArchStreetFacadeDetails')])
assert editor.save_current_level()
report={'sourceSha256':proof['sha256'],'triangles':mesh.get_num_triangles(0),
        'mesh':mesh.get_path_name(),'positionCm':position,'sourceObjectId':2740,
        'status':'Additive facade depth imported; native visual review pending',
        'limits':proof['limits']}
(ROOT/'artifacts/unreal/arch-facade-import.json').write_text(json.dumps(report,indent=2)+'\n')
unreal.log('PHILLY_ARCH_FACADE_IMPORTED '+json.dumps(report))
