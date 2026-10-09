"""Inspect actual imported map/assets. This does not certify gameplay or fidelity."""
import json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
assets=unreal.EditorAssetLibrary
editor=unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
map_path='/Game/Philadelphia/Maps/ChinatownEvaluation'
assert editor.load_level(map_path), 'Evaluation map missing'
actor_system=unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
actors=actor_system.get_all_level_actors()
counts={}
for actor in actors:
    name=actor.get_class().get_name()
    counts[name]=counts.get(name,0)+1
for name in ('PhillyDistrict','PhillyVehicle','PlayerStart'):
    assert counts.get(name)==1, f'Expected one {name}'
mustang=assets.load_asset('/Game/Philadelphia/Assets/Mustang/mustang-2005')
nanite=mustang.get_editor_property('nanite_settings')
nanite.set_editor_property('enabled',False)
mustang.set_editor_property('nanite_settings',nanite)
assets.save_loaded_asset(mustang)
bounds=mustang.get_bounding_box()
assert abs(bounds.max.y-bounds.min.y-477)<.05, 'Vehicle metres-to-centimetres import failed'
human=assets.load_asset('/Game/Philadelphia/Assets/Human/human-motion')
assert human is not None
for slot in human.get_editor_property('materials'):
    assert slot.get_editor_property('material_interface').get_editor_property('used_with_skeletal_mesh'), 'Character material would fall back to gray'
surface=assets.load_asset('/Game/Philadelphia/Materials/M_SourceSurface')
surface_input=unreal.MaterialEditingLibrary.get_material_property_input_node(surface,unreal.MaterialProperty.MP_BASE_COLOR)
assert isinstance(surface_input,unreal.MaterialExpressionVertexColor), 'Road vertex colors are not connected'
for actor in actors:
    if actor.get_class().get_name() in ('PlayerStart','PhillyVehicle'):
        rotation=actor.get_actor_rotation()
        assert abs(rotation.pitch)<.001 and abs(rotation.roll)<.001, 'Spawn is pitched or rolled instead of headed along the street'
for name in ('Idle','Walk','Run'):
    animation=assets.load_asset('/Game/Philadelphia/Assets/Human/human-motion'+name)
    assert animation is not None, 'Animation missing: '+name
report={'status':'passed structural/import checks only','map':map_path,'actors':counts,
        'mustangLengthCm':bounds.max.y-bounds.min.y,
        'naniteDisabledForTransparentVehicle':True,
        'limitations':['No play test performed by this validator.','No final-art acceptance.']}
(ROOT/'artifacts/unreal/structural-validation.json').write_text(json.dumps(report,indent=2))
unreal.log('PHILLY_STRUCTURAL_VALIDATION '+json.dumps(report))
