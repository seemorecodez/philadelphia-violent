"""Repair confirmed import/rotation/sky defects in the isolated native evaluation."""
import json
from pathlib import Path
import unreal

ROOT = Path(__file__).resolve().parents[3]
assets = unreal.EditorAssetLibrary
report = {'materials': [], 'actors': []}
human = assets.load_asset('/Game/Philadelphia/Assets/Human/human-motion')
for slot in human.get_editor_property('materials'):
    material = slot.get_editor_property('material_interface')
    assert isinstance(material, unreal.Material), 'Unexpected source material type'
    material.set_editor_property('used_with_skeletal_mesh', True)
    unreal.MaterialEditingLibrary.recompile_material(material)
    assert material.get_editor_property('used_with_skeletal_mesh')
    assert assets.save_loaded_asset(material), 'Material save failed'
    report['materials'].append(material.get_path_name())

editor = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
assert editor.load_level('/Game/Philadelphia/Maps/ChinatownEvaluation')
actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
for actor in actors:
    name = actor.get_class().get_name()
    if name in ('PlayerStart', 'PhillyVehicle'):
        actor.set_actor_rotation(unreal.Rotator(pitch=0, yaw=90, roll=0), False)
    if isinstance(actor, unreal.DirectionalLight):
        actor.set_actor_rotation(unreal.Rotator(pitch=-45, yaw=-30, roll=0), False)
        actor.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
    if isinstance(actor, unreal.SkyLight):
        actor.light_component.set_mobility(unreal.ComponentMobility.MOVABLE)
        actor.light_component.set_editor_property('real_time_capture', True)
    report['actors'].append({'class': name, 'rotation': str(actor.get_actor_rotation())})
assert editor.save_current_level(), 'Map save failed'
report['status'] = 'Repaired asset settings; rendered validation still required'
(ROOT / 'artifacts/unreal/repair-report.json').write_text(json.dumps(report, indent=2))
unreal.log('PHILLY_REPAIRS_SAVED')
