"""Import the editable Blender kit through the existing Interchange GLB path.

Only street-kit assets are written. No map, road, house or retained hero asset
is regenerated. The registry is published only after every mesh is validated.
"""
from pathlib import Path
import json, hashlib, unreal
ROOT=Path(__file__).resolve().parents[3]
NATIVE=ROOT/'Unreal/Philadelphia'
SOURCE=ROOT/'assets/city/blender/neighborhood-street-kit/manifest.json'
REPORT=ROOT/'artifacts/unreal/street-kit-import.json'
assets=unreal.EditorAssetLibrary
unreal.load_module('StaticMeshEditor')
meshes=unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)
tools=unreal.AssetToolsHelpers.get_asset_tools()
entries=json.loads(SOURCE.read_text())['assets']
entries.append({'kind':'tree','file':'public/models/street/tree-small-02.glb','triangles':126863})
entries.append(json.loads((SOURCE.parent/'parked-car.json').read_text()))
entries.append(json.loads((SOURCE.parent/'tree-far-lod.json').read_text()))
report={'status':'running','assets':[],'classification':'Native asset import; visual/performance acceptance is separate'}
REPORT.write_text(json.dumps(report,indent=2))

def shared_material():
    folder='/Game/Philadelphia/Materials';name='M_StreetKit'
    mat=assets.load_asset(folder+'/'+name) if assets.does_asset_exist(folder+'/'+name) else tools.create_asset(name,folder,unreal.Material,unreal.MaterialFactoryNew())
    library=unreal.MaterialEditingLibrary
    library.delete_all_material_expressions(mat)
    color=library.create_material_expression(mat,unreal.MaterialExpressionVertexColor)
    assert library.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR)
    rough=library.create_material_expression(mat,unreal.MaterialExpressionConstant);rough.set_editor_property('r',.74)
    assert library.connect_material_property(rough,'',unreal.MaterialProperty.MP_ROUGHNESS)
    mat.set_editor_property('used_with_instanced_static_meshes',True)
    library.recompile_material(mat);assets.save_loaded_asset(mat)
    return mat

def collision_box(mesh,center,size):
    body=mesh.get_editor_property('body_setup')
    meshes.remove_collisions(mesh)
    box=unreal.KBoxElem()
    box.set_editor_property('center',unreal.Vector(*center))
    for prop,value in zip(['x','y','z'],size):box.set_editor_property(prop,value)
    aggregate=body.get_editor_property('agg_geom');aggregate.set_editor_property('box_elems',[box])
    body.set_editor_property('agg_geom',aggregate)
    body.set_editor_property('collision_trace_flag',unreal.CollisionTraceFlag.CTF_USE_SIMPLE_AS_COMPLEX)

try:
    material=shared_material()
    for entry in entries:
        kind=entry['kind'];folder='/Game/Philadelphia/Assets/StreetKit/'+('tree_full' if kind=='tree' else kind.replace('-','_'))
        assets.make_directory(folder)
        existing=assets.list_assets(folder,recursive=True,include_folder=False)
        source_hash=hashlib.sha256((ROOT/entry['file']).read_bytes()).hexdigest()
        old_mesh=next((obj for obj in (assets.load_asset(p) for p in existing) if isinstance(obj,unreal.StaticMesh)),None)
        if old_mesh is None or assets.get_metadata_tag(old_mesh,'StreetSourceSHA256')!=source_hash:
            pipeline=unreal.InterchangeGenericAssetsPipeline()
            pipeline.set_editor_property('use_source_name_for_asset',True)
            pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes',True)
            params=unreal.ImportAssetParameters();params.set_editor_property('is_automated',True)
            params.set_editor_property('replace_existing',True)
            params.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
            source=unreal.InterchangeManager.create_source_data(str(ROOT/entry['file']))
            assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,source,params),kind
        imported=[assets.load_asset(p) for p in assets.list_assets(folder,recursive=True,include_folder=False)]
        found=[o for o in imported if isinstance(o,unreal.StaticMesh)]
        assert len(found)==1,(kind,len(found))
        mesh=found[0]
        nanite=mesh.get_editor_property('nanite_settings');nanite.set_editor_property('enabled',False);mesh.set_editor_property('nanite_settings',nanite)
        if kind not in ['tree','parked-car','tree-far-lod']:
            for slot in range(len(mesh.get_editor_property('static_materials'))):mesh.set_material(slot,material)
        options=unreal.StaticMeshReductionOptions()
        settings=[]
        # Leave LOD2 absent for the custom canopy import. UE 5.7's
        # SetLodFromStaticMesh dereferences a null MeshDescription when asked
        # to overwrite an auto-reduced LOD; adding a new LOD creates it safely.
        levels=[(1.0,1.0),(.65,.38)] if kind=='tree' else [(1.0,1.0),(.45,.18),(.12,.055)]
        for percentage,screen in levels:
            setting=unreal.StaticMeshReductionSettings()
            setting.set_editor_property('percent_triangles',percentage);setting.set_editor_property('screen_size',screen)
            settings.append(setting)
        options.set_editor_property('reduction_settings',settings)
        options.set_editor_property('auto_compute_lod_screen_size',False)
        if kind!='tree-far-lod':meshes.set_lods(mesh,options)
        # Bounds-based collision would make the entire tree crown or lamp arm
        # solid. Use a single small trunk/post/body proxy instead.
        boxes={
            'tree':((0,0,160),(30,30,320)),
            'lamp':((0,0,300),(28,28,600)),
            'utility-pole':((0,0,420),(28,28,840)),
            'hydrant':((0,0,43),(36,36,86)),
            'bin':((0,0,46),(51,56,92)),
            'parking-sign':((0,0,145),(8,8,290)),
            'planter':((0,0,26),(75,75,52)),
            'garden-fence':((0,0,54),(154,7,108)),
            'mailbox':((0,0,12),(10,28,26)),
        }
        if kind=='parked-car':
            bounds=mesh.get_bounding_box()
            boxes[kind]=([(bounds.min.x+bounds.max.x)/2,(bounds.min.y+bounds.max.y)/2,(bounds.min.z+bounds.max.z)/2],[(bounds.max.x-bounds.min.x)*.94,(bounds.max.y-bounds.min.y)*.94,(bounds.max.z-bounds.min.z)*.85])
        if kind in boxes:collision_box(mesh,*boxes[kind])
        else:meshes.remove_collisions(mesh)
        assets.set_metadata_tag(mesh,'StreetSourceSHA256',source_hash)
        for obj in imported:
            if isinstance(obj,unreal.Material):
                obj.set_editor_property('used_with_instanced_static_meshes',True)
                unreal.MaterialEditingLibrary.recompile_material(obj)
            if obj:assets.save_loaded_asset(obj,only_if_is_dirty=True)
        assert assets.save_loaded_asset(mesh)
        bounds=mesh.get_bounding_box();height=bounds.max.z-bounds.min.z
        assert height>0,(kind,str(bounds))
        if kind=='lamp':assert 620<height<700,('metre/cm round trip',height)
        if kind=='tree':assert 400<height<500,('tree metre/cm round trip',height)
        if kind=='parked-car':assert 110<height<210,('car scale and grounded pivot',height,str(bounds))
        cull=20000 if kind=='tree' else 26000 if kind in ['lamp','utility-pole','cable'] else 18000 if kind=='parked-car' else 14000
        item={'kind':kind,'mesh':mesh.get_path_name(),'collision':kind in boxes,'cullDistanceCm':cull,'lods':meshes.get_lod_count(mesh),'materialSlots':len(mesh.get_editor_property('static_materials')),'heightCm':height,'boundsCm':[[bounds.min.x,bounds.min.y,bounds.min.z],[bounds.max.x,bounds.max.y,bounds.max.z]],'source':entry['file'],'sourceSha256':hashlib.sha256((ROOT/entry['file']).read_bytes()).hexdigest()}
        assert item['lods']==(1 if kind=='tree-far-lod' else 2 if kind=='tree' else 3),item
        report['assets'].append(item);REPORT.write_text(json.dumps(report,indent=2))
        unreal.log('PHILLY_STREET_IMPORTED '+kind)
    tree_item=next(a for a in report['assets'] if a['kind']=='tree')
    far_item=next(a for a in report['assets'] if a['kind']=='tree-far-lod')
    tree=assets.load_asset(tree_item['mesh']);far=assets.load_asset(far_item['mesh'])
    assert meshes.set_lod_from_static_mesh(tree,2,far,0,True)==2
    assert meshes.set_lod_screen_sizes(tree,[1.0,.38,.10])
    assets.save_loaded_asset(tree)
    tree_item['lods']=meshes.get_lod_count(tree);assert tree_item['lods']==3
    tree_item['materialSlots']=len(tree.get_editor_property('static_materials'))
    tree_item['farLodSource']=far_item['source'];tree_item['farLodTriangles']=6
    registry={'version':1,'assets':report['assets']}
    (NATIVE/'Content/SourceData/street-kit.json').write_text(json.dumps(registry,indent=2))
    report['status']='imported; native view and traversal required'
except Exception as error:
    report['status']='failed';report['error']=str(error)
    raise
finally:
    REPORT.write_text(json.dumps(report,indent=2))
