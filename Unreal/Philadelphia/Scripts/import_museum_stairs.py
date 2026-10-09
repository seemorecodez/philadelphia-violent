"""Install source-fitted stair surfaces in the actual native museum map."""
import hashlib,json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'Unreal/Philadelphia/SourceAssets/Museum'
proof=json.loads((SOURCE/'details/source.json').read_text())
assert hashlib.sha256((ROOT/'public/models/city/source-2561.glb').read_bytes()).hexdigest()==proof['sourceSha256']
textures_proof=json.loads((SOURCE/'stone/source.json').read_text())
assets=unreal.EditorAssetLibrary
asset_tools=unreal.AssetToolsHelpers.get_asset_tools()
edit=unreal.MaterialEditingLibrary

def import_mesh(filename,sha,triangles):
    source=SOURCE/'details'/filename
    assert hashlib.sha256(source.read_bytes()).hexdigest()==sha
    folder='/Game/Philadelphia/Assets/MuseumDetail/'+sha[:12]
    assets.make_directory(folder)
    if not assets.list_assets(folder,recursive=True,include_folder=False):
        pipeline=unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset',True)
        pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes',True)
        pipeline.get_editor_property('mesh_pipeline').set_editor_property('build_nanite',False)
        params=unreal.ImportAssetParameters()
        params.set_editor_property('is_automated',True)
        params.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
        data=unreal.InterchangeManager.create_source_data(str(source))
        assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,data,params)
    meshes=[]
    for path in assets.list_assets(folder,recursive=True,include_folder=False):
        obj=assets.load_asset(path)
        if isinstance(obj,unreal.StaticMesh):meshes.append(obj)
        assets.save_loaded_asset(obj,only_if_is_dirty=True)
    assert len(meshes)==1
    mesh=meshes[0]
    nanite=mesh.get_editor_property('nanite_settings');nanite.set_editor_property('enabled',False)
    mesh.set_editor_property('nanite_settings',nanite)
    mesh.get_editor_property('body_setup').set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    assert assets.save_loaded_asset(mesh)
    assert mesh.get_num_triangles(0)==triangles,(mesh.get_path_name(),mesh.get_num_triangles(0),triangles)
    return mesh

retained=import_mesh('museum-retained.glb',proof['retainedSha256'],proof['retainedTriangles'])
stairs=import_mesh('museum-stairs.glb',proof['detailSha256'],proof['detailTriangles'])
if 'collision' in proof:
    collision=proof['collision']
    collision_mesh=import_mesh(collision['file'],collision['sha256'],collision['triangles'])
    stairs.set_editor_property('complex_collision_mesh',collision_mesh)
    assert assets.save_loaded_asset(stairs)
texfolder='/Game/Philadelphia/Assets/MuseumDetail/Stone'
assets.make_directory(texfolder)
textures={}
for item in textures_proof['files']:
    path=SOURCE/'stone'/item['file']
    assert hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256']
    name=path.stem
    destination=texfolder+'/'+name
    if not assets.does_asset_exist(destination):
        # AssetTools' post-import browser sync requires Slate and crashes in a
        # headless commandlet. Direct Interchange uses the supported native path.
        pipeline=unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset',True)
        params=unreal.ImportAssetParameters()
        params.set_editor_property('is_automated',True)
        params.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
        data=unreal.InterchangeManager.create_source_data(str(path))
        assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(texfolder,data,params)
    texture=assets.load_asset(destination)
    assert isinstance(texture,unreal.Texture2D),destination
    kind='normal' if 'nor_dx' in name else 'roughness' if 'rough' in name else 'color'
    dimension=4096 if kind=='color' else 2048
    assert (texture.blueprint_get_size_x(),texture.blueprint_get_size_y())==(dimension,dimension)
    texture.set_editor_property('srgb',kind=='color')
    if kind=='normal':texture.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_NORMALMAP)
    elif kind=='roughness':texture.set_editor_property('compression_settings',unreal.TextureCompressionSettings.TC_MASKS)
    assert assets.save_loaded_asset(texture)
    textures[kind]=texture
material_path='/Game/Philadelphia/Materials/M_MuseumStone'
material=assets.load_asset(material_path) if assets.does_asset_exist(material_path) else asset_tools.create_asset('M_MuseumStone','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
edit.delete_all_material_expressions(material)
for kind,property_name in [('color',unreal.MaterialProperty.MP_BASE_COLOR),('normal',unreal.MaterialProperty.MP_NORMAL),('roughness',unreal.MaterialProperty.MP_ROUGHNESS)]:
    sample=edit.create_material_expression(material,unreal.MaterialExpressionTextureSample)
    sample.set_editor_property('texture',textures[kind])
    sample.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if kind=='normal' else unreal.MaterialSamplerType.SAMPLERTYPE_COLOR if kind=='color' else unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)
    assert edit.connect_material_property(sample,'R' if kind=='roughness' else 'RGB',property_name)
edit.recompile_material(material)
assert assets.save_loaded_asset(material)
assert len(stairs.get_editor_property('static_materials'))==1
stairs.set_material(0,material)
assert assets.save_loaded_asset(stairs)
editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
original=[a for a in actors.get_all_level_actors() if a.actor_has_tag('MuseumOriginal')]
assert len(original)==1
museum=original[0]
museum.static_mesh_component.set_static_mesh(retained)
museum.static_mesh_component.set_collision_profile_name('BlockAll')
position=museum.get_actor_location()
matches=[a for a in actors.get_all_level_actors() if a.actor_has_tag('MuseumStairDetail')]
assert len(matches)<=1
actor=matches[0] if matches else actors.spawn_actor_from_class(unreal.StaticMeshActor,position)
actor.set_actor_label('Museum east steps - source fitted stone')
actor.set_actor_location(position,False,False)
actor.set_actor_rotation(museum.get_actor_rotation(),False)
actor.static_mesh_component.set_static_mesh(stairs)
actor.static_mesh_component.set_collision_profile_name('BlockAll')
actor.set_editor_property('tags',[unreal.Name('MuseumStairDetail')])
assert editor.save_current_level()
report={'status':'Imported; native visual and walking verification pending','detailMesh':stairs.get_path_name(),'retainedMesh':retained.get_path_name(),'detailTriangles':stairs.get_num_triangles(0),'material':material.get_path_name(),'source':proof,'textureSource':textures_proof}
(ROOT/'artifacts/unreal/museum-stairs-import.json').write_text(json.dumps(report,indent=2)+'\n')
unreal.log('PHILLY_MUSEUM_STAIRS_IMPORTED '+json.dumps(report))
if (SOURCE/'terrace/source.json').exists():
    import runpy
    runpy.run_path(str(Path(__file__).with_name('import_museum_terrace.py')),run_name='__main__')
