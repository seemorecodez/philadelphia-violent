"""Called by the terrace importer to preserve the source-fitted window relief."""
import hashlib,json
from pathlib import Path
import unreal

def install(import_mesh,make_material,custom,constant,stone):
    root=Path(__file__).resolve().parents[3]
    source=root/'Unreal/Philadelphia/SourceAssets/Museum/wing'
    proof=json.loads((source/'source.json').read_text())
    assert hashlib.sha256((root/'public/models/city/source-2561.glb').read_bytes()).hexdigest()==proof['sourceSha256']
    assert hashlib.sha256((source.parent/'terrace/museum-terrace-retained.glb').read_bytes()).hexdigest()==proof['terraceRetainedSha256']
    retained=import_mesh(proof['retained'],source)
    detail=import_mesh(proof['mesh'],source)
    assets=unreal.EditorAssetLibrary;edit=unreal.MaterialEditingLibrary
    wall=make_material('M_MuseumCourtyardLimestone')
    uv=edit.create_material_expression(wall,unreal.MaterialExpressionTextureCoordinate)
    texture_source=source/'materials/cleaned-facade-v1.png'
    texture_sha=hashlib.sha256(texture_source.read_bytes()).hexdigest()
    texture_folder='/Game/Philadelphia/Assets/MuseumDetail/'+texture_sha[:12]
    texture_path=texture_folder+'/cleaned-facade-v1'
    if not assets.does_asset_exist(texture_path):
        pipeline=unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset',True)
        pipeline.get_editor_property('material_pipeline').get_editor_property('texture_pipeline').set_editor_property('allow_non_power_of_two',True)
        params=unreal.ImportAssetParameters();params.set_editor_property('is_automated',True)
        params.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
        data=unreal.InterchangeManager.create_source_data(str(texture_source))
        assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(texture_folder,data,params)
    texture=assets.load_asset(texture_path);assert isinstance(texture,unreal.Texture2D)
    texture.set_editor_property('srgb',True)
    texture.set_editor_property('power_of_two_mode',unreal.TexturePowerOfTwoSetting.STRETCH_TO_POWER_OF_TWO)
    assert assets.save_loaded_asset(texture)
    color=edit.create_material_expression(wall,unreal.MaterialExpressionTextureSample)
    color.set_editor_property('texture',texture)
    color.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
    # Register the cleaned candidate back to the original opening geometry;
    # generation introduced a small vertical drift and lower-window stretch.
    mapping=custom(wall,'float x=UV.y/.124; float y=1059+(UV.x/.12-1059)*.994; if(x>2523 && x<=2552)x=lerp(2523,2553.8,(x-2523)/29); else if(x>2552 && x<=2567)x=lerp(2553.8,2571.7,(x-2552)/15); else if(x>2567)x=lerp(2571.7,2590,(x-2567)/23); return float2((x-2390)/200,(y-990)/510);',{'UV':(uv,'')})
    mapping.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT2)
    assert edit.connect_material_expressions(mapping,'',color,'UVs')
    assert edit.connect_material_property(color,'RGB',unreal.MaterialProperty.MP_BASE_COLOR)
    normal=edit.create_material_expression(wall,unreal.MaterialExpressionTextureSample)
    normal.set_editor_property('texture',assets.load_asset('/Game/Philadelphia/Assets/MuseumDetail/Stone/granite_tile_04_nor_dx_2k'))
    normal.set_editor_property('sampler_type',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL)
    bump=custom(wall,'return normalize(float3(N.xy*.22,N.z));',{'N':(normal,'RGB')})
    assert edit.connect_material_property(bump,'',unreal.MaterialProperty.MP_NORMAL)
    constant(wall,.76,unreal.MaterialProperty.MP_ROUGHNESS)
    edit.recompile_material(wall);assert assets.save_loaded_asset(wall)
    trim=stone('WindowLimestone',(.51,.475,.40))
    glass=make_material('M_MuseumCourtyardGlass')
    glass_color=edit.create_material_expression(glass,unreal.MaterialExpressionConstant3Vector)
    glass_color.set_editor_property('constant',unreal.LinearColor(.025,.047,.060,1))
    assert edit.connect_material_property(glass_color,'',unreal.MaterialProperty.MP_BASE_COLOR)
    constant(glass,.17,unreal.MaterialProperty.MP_ROUGHNESS)
    constant(glass,.55,unreal.MaterialProperty.MP_METALLIC)
    constant(glass,.8,unreal.MaterialProperty.MP_SPECULAR)
    edit.recompile_material(glass);assert assets.save_loaded_asset(glass)
    metal=make_material('M_MuseumCourtyardWindowFrame')
    frame_color=edit.create_material_expression(metal,unreal.MaterialExpressionConstant3Vector)
    frame_color.set_editor_property('constant',unreal.LinearColor(.052,.050,.043,1))
    assert edit.connect_material_property(frame_color,'',unreal.MaterialProperty.MP_BASE_COLOR)
    constant(metal,.36,unreal.MaterialProperty.MP_ROUGHNESS)
    constant(metal,.55,unreal.MaterialProperty.MP_METALLIC)
    edit.recompile_material(metal);assert assets.save_loaded_asset(metal)
    materials={'FacadeStone':wall,'WindowStone':trim,'Glass':glass,'Metal':metal}
    for i,slot in enumerate(detail.get_editor_property('static_materials')):
        key=str(slot.get_editor_property('material_slot_name'));assert key in materials,key
        detail.set_material(i,materials[key])
    assert assets.save_loaded_asset(detail)
    actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    all_actors=actors.get_all_level_actors()
    originals=[a for a in all_actors if a.actor_has_tag('MuseumOriginal')];assert len(originals)==1
    museum=originals[0];museum.static_mesh_component.set_static_mesh(retained)
    matches=[a for a in all_actors if a.actor_has_tag('MuseumCourtyardWing')];assert len(matches)<=1
    actor=matches[0] if matches else actors.spawn_actor_from_class(unreal.StaticMeshActor,museum.get_actor_location())
    actor.set_actor_location(museum.get_actor_location(),False,False)
    actor.set_actor_rotation(museum.get_actor_rotation(),False)
    actor.set_actor_label('Museum courtyard wing - source fitted window relief')
    actor.set_editor_property('tags',[unreal.Name('MuseumCourtyardWing')])
    actor.static_mesh_component.set_static_mesh(detail)
    actor.static_mesh_component.set_collision_profile_name('BlockAll')
    assert unreal.get_editor_subsystem(unreal.LevelEditorSubsystem).save_current_level()
    report={'status':'Imported; native visual verification pending','source':proof,'detailMesh':detail.get_path_name(),'retainedMesh':retained.get_path_name(),'texture':{'path':texture.get_path_name(),'sha256':texture_sha,'provenance':'Built-in image generation cleanup of retained public source photograph; reconstructed material interpretation, not new survey data'}}
    (root/'artifacts/unreal/museum-wing-import.json').write_text(json.dumps(report,indent=2)+'\n')
    unreal.log('PHILLY_MUSEUM_WING_IMPORTED '+json.dumps(report))
