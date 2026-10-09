"""Install photo-traced terrace stone and a physical fountain in native Unreal."""
import hashlib
import json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
SOURCE=ROOT/'Unreal/Philadelphia/SourceAssets/Museum/terrace'
proof=json.loads((SOURCE/'source.json').read_text())
assert hashlib.sha256((ROOT/'public/models/city/source-2561.glb').read_bytes()).hexdigest()==proof['sourceSha256']
assets=unreal.EditorAssetLibrary
edit=unreal.MaterialEditingLibrary
asset_tools=unreal.AssetToolsHelpers.get_asset_tools()

def import_mesh(item,source_directory=SOURCE):
    source=source_directory/item['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==item['sha256']
    folder='/Game/Philadelphia/Assets/MuseumDetail/'+item['sha256'][:12]
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
    nanite=mesh.get_editor_property('nanite_settings')
    nanite.set_editor_property('enabled',False)
    mesh.set_editor_property('nanite_settings',nanite)
    mesh.get_editor_property('body_setup').set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    assert mesh.get_num_triangles(0)==item['triangles'],(mesh.get_path_name(),mesh.get_num_triangles(0))
    assert assets.save_loaded_asset(mesh)
    return mesh

def material(name):
    path='/Game/Philadelphia/Materials/'+name
    m=assets.load_asset(path) if assets.does_asset_exist(path) else asset_tools.create_asset(name,'/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
    edit.delete_all_material_expressions(m)
    return m

def constant(m,value,prop):
    c=edit.create_material_expression(m,unreal.MaterialExpressionConstant)
    c.set_editor_property('r',value)
    assert edit.connect_material_property(c,'',prop)

def custom(m,code,connections):
    node=edit.create_material_expression(m,unreal.MaterialExpressionCustom)
    inputs=[]
    for name in connections:
        item=unreal.CustomInput();item.set_editor_property('input_name',name);inputs.append(item)
    node.set_editor_property('inputs',inputs)
    node.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    node.set_editor_property('code',code)
    for name,(source,output) in connections.items():
        assert edit.connect_material_expressions(source,output,node,name)
    return node

def stone(name,tint):
    m=material('M_MuseumTerrace_'+name)
    samples={}
    for key,file,sampler in [
        ('Color','granite_tile_04_diff_4k',unreal.MaterialSamplerType.SAMPLERTYPE_COLOR),
        ('Normal','granite_tile_04_nor_dx_2k',unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL),
        ('Rough','granite_tile_04_rough_2k',unreal.MaterialSamplerType.SAMPLERTYPE_MASKS)]:
        tex=assets.load_asset('/Game/Philadelphia/Assets/MuseumDetail/Stone/'+file)
        assert isinstance(tex,unreal.Texture2D)
        sample=edit.create_material_expression(m,unreal.MaterialExpressionTextureSample)
        sample.set_editor_property('texture',tex);sample.set_editor_property('sampler_type',sampler)
        samples[key]=sample
    # Retain photographed mineral grain, with restrained neutral colour variants.
    rgb=','.join(str(v) for v in tint)
    color=custom(m,'float g=dot(C,float3(.2126,.7152,.0722)); return saturate(float3('+rgb+')*(.68+g*.8));',{'C':(samples['Color'],'RGB')})
    assert edit.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR)
    normal=custom(m,'return normalize(float3(N.xy*.35,N.z));',{'N':(samples['Normal'],'RGB')})
    assert edit.connect_material_property(normal,'',unreal.MaterialProperty.MP_NORMAL)
    assert edit.connect_material_property(samples['Rough'],'R',unreal.MaterialProperty.MP_ROUGHNESS)
    edit.recompile_material(m);assert assets.save_loaded_asset(m)
    return m

retained=import_mesh(proof['retained'])
terrace=import_mesh(proof['meshes'][0])
water=import_mesh(proof['meshes'][1])
stone_materials={name:stone(name,tint) for name,tint in [
    ('FieldStone',(.30,.29,.27)),('PaleStone',(.65,.62,.56)),('InlayStone',(.20,.21,.20))]}
slots=[]
for i,slot in enumerate(terrace.get_editor_property('static_materials')):
    name=str(slot.get_editor_property('material_slot_name'))
    matches=[m for key,m in stone_materials.items() if key.lower() in name.lower()]
    assert len(matches)==1,name
    terrace.set_material(i,matches[0]);slots.append(name)
assert len(slots)==3
assert assets.save_loaded_asset(terrace)

wet=material('M_MuseumFountainWater')
wet.set_editor_property('blend_mode',unreal.BlendMode.BLEND_TRANSLUCENT)
wet.set_editor_property('translucency_lighting_mode',unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
color=edit.create_material_expression(wet,unreal.MaterialExpressionConstant3Vector)
color.set_editor_property('constant',unreal.LinearColor(.018,.12,.15,1))
assert edit.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR)
uv=edit.create_material_expression(wet,unreal.MaterialExpressionTextureCoordinate)
time=edit.create_material_expression(wet,unreal.MaterialExpressionTime)
normal=custom(wet,'float a=UV.x*5.7+UV.y*3.1+T*.65; float b=UV.x*11.3-UV.y*7.9-T*.93; return normalize(float3(.045*cos(a)+.025*cos(b),.035*sin(a)-.02*sin(b),1));',{'UV':(uv,''),'T':(time,'')})
assert edit.connect_material_property(normal,'',unreal.MaterialProperty.MP_NORMAL)
constant(wet,.16,unreal.MaterialProperty.MP_ROUGHNESS)
constant(wet,.68,unreal.MaterialProperty.MP_OPACITY)
constant(wet,.5,unreal.MaterialProperty.MP_SPECULAR)
edit.recompile_material(wet);assert assets.save_loaded_asset(wet)
water.set_material(0,wet);assert assets.save_loaded_asset(water)

editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
all_actors=actors.get_all_level_actors()
original=[a for a in all_actors if a.actor_has_tag('MuseumOriginal')]
assert len(original)==1
museum=original[0]
museum.static_mesh_component.set_static_mesh(retained)
museum.static_mesh_component.set_collision_profile_name('BlockAll')
assert len([a for a in all_actors if a.actor_has_tag('MuseumStairDetail')])==1,'Install stairs first'
for tag,label,mesh,collision in [
    ('MuseumTerraceDetail','Museum terrace - photo traced stone and fountain basin',terrace,'BlockAll'),
    ('MuseumFountainWater','Museum fountain - animated water surface',water,'NoCollision')]:
    matches=[a for a in all_actors if a.actor_has_tag(tag)]
    assert len(matches)<=1
    actor=matches[0] if matches else actors.spawn_actor_from_class(unreal.StaticMeshActor,museum.get_actor_location())
    actor.set_actor_label(label)
    actor.set_actor_location(museum.get_actor_location(),False,False)
    actor.set_actor_rotation(museum.get_actor_rotation(),False)
    actor.static_mesh_component.set_static_mesh(mesh)
    actor.static_mesh_component.set_collision_profile_name(collision)
    actor.static_mesh_component.set_editor_property('cast_shadow',collision!='NoCollision')
    actor.set_editor_property('tags',[unreal.Name(tag)])
assert editor.save_current_level()
report={'status':'Imported; native visual and walking verification pending','source':proof,'retainedMesh':retained.get_path_name(),'terraceMesh':terrace.get_path_name(),'waterMesh':water.get_path_name(),'stoneSlots':slots,'waterMaterial':wet.get_path_name(),'waterCollision':'NoCollision'}
(ROOT/'artifacts/unreal/museum-terrace-import.json').write_text(json.dumps(report,indent=2)+'\n')
unreal.log('PHILLY_MUSEUM_TERRACE_IMPORTED '+json.dumps(report))
if (SOURCE.parent/'wing/source.json').exists():
    import runpy
    wing=runpy.run_path(str(Path(__file__).with_name('import_museum_wing.py')))
    wing['install'](import_mesh,material,custom,constant,stone)
