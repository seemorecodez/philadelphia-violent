"""Read-only native asset and lighting inspection; no map or asset writes."""
import json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
report={}
assets=unreal.EditorAssetLibrary
for name,path in [('human','/Game/Philadelphia/Assets/Human/human-motion'),
                  ('car','/Game/Philadelphia/Assets/Mustang/mustang-2005')]:
    mesh=assets.load_asset(path)
    slots=mesh.get_editor_property('materials' if name=='human' else 'static_materials')
    report[name]=[]
    for slot in slots:
        material=slot.get_editor_property('material_interface')
        item={'slot':str(slot.get_editor_property('material_slot_name')),
              'material':material.get_path_name() if material else None}
        if material and isinstance(material,unreal.MaterialInstanceConstant):
            item['parent']=str(material.get_editor_property('parent'))
            item['textures']=[str(p) for p in material.get_editor_property('texture_parameter_values')]
            item['vectors']=[str(p) for p in material.get_editor_property('vector_parameter_values')]
        report[name].append(item)
editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
report['actors']=[]
for actor in actors:
    item={'label':actor.get_actor_label(),'class':actor.get_class().get_name(),
          'position':str(actor.get_actor_location()),'rotation':str(actor.get_actor_rotation())}
    if isinstance(actor,unreal.DirectionalLight):
        item['intensity']=actor.light_component.get_editor_property('intensity')
        item['atmosphereSunLight']=actor.light_component.get_editor_property('atmosphere_sun_light')
        item['shadowDistance']=actor.light_component.get_editor_property('dynamic_shadow_distance_movable_light')
        item['shadowCascades']=actor.light_component.get_editor_property('dynamic_shadow_cascades')
        item['castShadows']=actor.light_component.get_editor_property('cast_shadows')
    if isinstance(actor,unreal.StaticMeshActor):
        mesh=actor.static_mesh_component.get_editor_property('static_mesh')
        if mesh:
            item['mesh']=mesh.get_path_name()
            item['trianglesLOD0']=mesh.get_num_triangles(0)
            item['naniteEnabled']=mesh.get_editor_property('nanite_settings').get_editor_property('enabled')
    if isinstance(actor,unreal.SkyLight):
        item['intensity']=actor.light_component.get_editor_property('intensity')
        item['realtimeCapture']=actor.light_component.get_editor_property('real_time_capture')
    report['actors'].append(item)
(ROOT/'artifacts/unreal/material-inspection.json').write_text(json.dumps(report,indent=2))
unreal.log('PHILLY_MATERIAL_INSPECTION_COMPLETE')
