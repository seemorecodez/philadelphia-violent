"""Build the isolated native source-data evaluation. Never edits browser assets."""
import json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
PROJECT=Path(__file__).resolve().parents[1]
DEST='/Game/Philadelphia'
REPORT=ROOT/'artifacts/unreal/import-report.json'
REPORT.parent.mkdir(parents=True,exist_ok=True)
tools=unreal.AssetToolsHelpers.get_asset_tools()
assets=unreal.EditorAssetLibrary
registry=unreal.AssetRegistryHelpers.get_asset_registry()
report={'imports':[],'status':'running','limitations':['Native runtime evaluation; not final district artwork.']}


def persist(): REPORT.write_text(json.dumps(report,indent=2))


def import_glb(name,relative,skeletal=False):
    folder=DEST+'/Assets/'+name
    assets.make_directory(folder)
    previous=assets.list_assets(folder,recursive=True,include_folder=False)
    if not previous:
        pipeline=unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset',True)
        mesh=pipeline.get_editor_property('mesh_pipeline')
        mesh.set_editor_property('combine_static_meshes',not skeletal)
        mesh.set_editor_property('import_skeletal_meshes',skeletal)
        pipeline.get_editor_property('animation_pipeline').set_editor_property('import_animations',skeletal)
        parameters=unreal.ImportAssetParameters()
        parameters.set_editor_property('is_automated',True)
        parameters.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
        source=unreal.InterchangeManager.create_source_data(str(ROOT/relative))
        manager=unreal.InterchangeManager.get_interchange_manager_scripted()
        result=manager.import_asset(folder,source,parameters)
        unreal.log('PHILLY_IMPORT '+name+' '+str(result))
    imported=[]
    for path in assets.list_assets(folder,recursive=True,include_folder=False):
        obj=assets.load_asset(path)
        if obj:
            imported.append({'path':path,'class':obj.get_class().get_name()})
            assets.save_loaded_asset(obj,only_if_is_dirty=True)
    report['imports'].append({'name':name,'source':relative,'assets':imported})
    persist()
    expected='SkeletalMesh' if skeletal else 'StaticMesh'
    matches=[x for x in imported if x['class']==expected]
    if len(matches)!=1: raise RuntimeError(f'{name}: expected one {expected}, got {len(matches)}')
    return assets.load_asset(matches[0]['path'])


def main():
    mustang=import_glb('Mustang','public/models/mustang-2005.glb')
    source_city=import_glb('Chinatown','public/models/city/philly-0000.glb')
    human=import_glb('Human','public/models/character/human-motion.glb',True)
    material_path=DEST+'/Materials/M_SourceSurface'
    assets.make_directory(DEST+'/Materials')
    material=assets.load_asset(material_path) if assets.does_asset_exist(material_path) else None
    if not material:
        material=tools.create_asset('M_SourceSurface',DEST+'/Materials',unreal.Material,unreal.MaterialFactoryNew())
        color=unreal.MaterialEditingLibrary.create_material_expression(material,unreal.MaterialExpressionVertexColor)
        assert unreal.MaterialEditingLibrary.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR)
        rough=unreal.MaterialEditingLibrary.create_material_expression(material,unreal.MaterialExpressionConstant)
        rough.set_editor_property('r',.85)
        assert unreal.MaterialEditingLibrary.connect_material_property(rough,'',unreal.MaterialProperty.MP_ROUGHNESS)
        material.set_editor_property('two_sided',True)
        unreal.MaterialEditingLibrary.recompile_material(material)
        assets.save_loaded_asset(material)
    editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
    actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    map_path=DEST+'/Maps/ChinatownEvaluation'
    assets.make_directory(DEST+'/Maps')
    # Regeneration is restricted to this evaluation map in the new project.
    if assets.does_asset_exist(map_path):
        raise RuntimeError('Evaluation map already exists; inspect it before regenerating')
    if not editor.new_level(map_path): raise RuntimeError('Could not create evaluation map')
    metadata=json.loads((PROJECT/'Content/SourceData/manifest.json').read_text())
    district_class=unreal.load_class(None,'/Script/Philadelphia.PhillyDistrict')
    district=actors.spawn_actor_from_class(district_class,unreal.Vector(0,0,0))
    district.set_editor_property('surface_material',material)
    spawn=metadata['spawn']
    player=actors.spawn_actor_from_class(unreal.PlayerStart,unreal.Vector(*spawn),unreal.Rotator(pitch=0,yaw=90,roll=0))
    player.set_actor_label('Real 10th Street player start')
    vehicle_class=unreal.load_class(None,'/Script/Philadelphia.PhillyVehicle')
    vehicle=actors.spawn_actor_from_class(vehicle_class,unreal.Vector(spawn[0],spawn[1]-350,spawn[2]+15),unreal.Rotator(pitch=0,yaw=90,roll=0))
    vehicle.get_editor_property('visual').set_static_mesh(mustang)
    city=actors.spawn_actor_from_class(unreal.StaticMeshActor,unreal.Vector(*metadata['landmark']))
    city.static_mesh_component.set_static_mesh(source_city)
    city.set_actor_label('Retained source philly_0000 - historical reference')
    body=source_city.get_editor_property('body_setup')
    body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    assets.save_loaded_asset(source_city)
    sun=actors.spawn_actor_from_class(unreal.DirectionalLight,unreal.Vector(0,0,3000),unreal.Rotator(pitch=-45,yaw=-30,roll=0))
    sun.light_component.set_editor_property('intensity',3.0)
    sun.light_component.set_editor_property('light_color',unreal.Color(255,244,225))
    sky=actors.spawn_actor_from_class(unreal.SkyLight,unreal.Vector(0,0,2000))
    sky.light_component.set_editor_property('intensity',1.0)
    actors.spawn_actor_from_class(unreal.SkyAtmosphere,unreal.Vector(0,0,-10000))
    if not editor.save_current_level(): raise RuntimeError('Map save failed')
    report['humanMesh']=human.get_path_name()
    report['mustangBounds']=str(mustang.get_bounding_box())
    report['cityBounds']=str(source_city.get_bounding_box())
    report['map']=map_path
    report['status']='imported; runtime and visual checks pending'
    persist()


try:
    main()
except Exception as error:
    report['status']='failed'
    report['error']=str(error)
    persist()
    raise
