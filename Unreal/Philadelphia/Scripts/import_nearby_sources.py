"""Place original nearby source references into the isolated native evaluation map."""
import json
from pathlib import Path
import unreal

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]

manifest = json.loads((HERE.parent/'SourceAssets/Nearby/manifest.json').read_text())
assert len(manifest['assets']) == 15, 'Wait for complete bounded source extraction'
assets = unreal.EditorAssetLibrary
editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actor_system = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
existing = {a.get_actor_label(): a for a in actor_system.get_all_level_actors()}
report = {'classification': 'Historical reference meshes; not final district art', 'actors': []}
for item in manifest['assets']:
    folder = '/Game/Philadelphia/Assets/NearbyUVCorrected/'+item['id']
    label = 'Historical source '+item['id']
    if not assets.does_directory_exist(folder):
        assets.make_directory(folder)
    imported = assets.list_assets(folder, recursive=True, include_folder=False)
    if not imported:
        pipeline = unreal.InterchangeGenericAssetsPipeline()
        pipeline.set_editor_property('use_source_name_for_asset', True)
        pipeline.get_editor_property('mesh_pipeline').set_editor_property('combine_static_meshes', True)
        parameters = unreal.ImportAssetParameters()
        parameters.set_editor_property('is_automated', True)
        parameters.set_editor_property('override_pipelines', [unreal.SoftObjectPath(pipeline.get_path_name())])
        source = unreal.InterchangeManager.create_source_data(str(ROOT/item['glb']))
        assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder, source, parameters)
    meshes = []
    for path in assets.list_assets(folder, recursive=True, include_folder=False):
        asset = assets.load_asset(path)
        if isinstance(asset, unreal.StaticMesh):
            meshes.append(asset)
        assets.save_loaded_asset(asset, only_if_is_dirty=True)
    assert len(meshes) == 1
    mesh = meshes[0]
    # These retained sources contain only tens/hundreds of triangles each.
    # Keep their complete source mesh; virtualized geometry adds no useful LOD here.
    nanite = mesh.get_editor_property('nanite_settings')
    nanite.set_editor_property('enabled', False)
    mesh.set_editor_property('nanite_settings', nanite)
    mesh.get_editor_property('body_setup').set_editor_property('collision_trace_flag', unreal.CollisionTraceFlag.CTF_USE_COMPLEX_AS_SIMPLE)
    assets.save_loaded_asset(mesh)
    # Height sampling happens in the exporter; Unreal's bundled Python needs no PIL.
    position = item['position_cm']
    actor = existing.get(label)
    if not actor:
        actor = actor_system.spawn_actor_from_class(unreal.StaticMeshActor, unreal.Vector(*position))
        actor.set_actor_label(label)
    actor.static_mesh_component.set_static_mesh(mesh)
    report['actors'].append({'id': item['id'], 'position_cm': position, 'mesh': mesh.get_path_name()})

# Correct daytime readability in this evaluation. This remains a lighting test,
# and must be assessed in the rendered capture rather than treated as final art.
for actor in actor_system.get_all_level_actors():
    if actor.get_actor_label().startswith('Retained source philly_0000'):
        mesh = actor.static_mesh_component.get_editor_property('static_mesh')
        nanite = mesh.get_editor_property('nanite_settings')
        nanite.set_editor_property('enabled', False)
        mesh.set_editor_property('nanite_settings', nanite)
        assets.save_loaded_asset(mesh)
    if isinstance(actor, unreal.DirectionalLight):
        actor.light_component.set_editor_property('intensity', 10.0)
    if isinstance(actor, unreal.SkyLight):
        actor.light_component.set_editor_property('intensity', 3.0)
assert editor.save_current_level()
(ROOT/'artifacts/unreal/nearby-import-report.json').write_text(json.dumps(report, indent=2))
unreal.log('PHILLY_NEARBY_SOURCE_IMPORT_COMPLETE')
