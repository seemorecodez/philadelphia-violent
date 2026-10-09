"""Repair the confirmed unconnected vertex-color input; preserve all other art."""
import json
from pathlib import Path
import unreal

ROOT=Path(__file__).resolve().parents[3]
assets=unreal.EditorAssetLibrary
edit=unreal.MaterialEditingLibrary
material=assets.load_asset('/Game/Philadelphia/Materials/M_SourceSurface')
assert material
before=edit.get_material_property_input_node(material,unreal.MaterialProperty.MP_BASE_COLOR)
report={'before':before.get_class().get_name() if before else None}
if before is None:
    color=edit.create_material_expression(material,unreal.MaterialExpressionVertexColor)
    assert edit.connect_material_property(color,'',unreal.MaterialProperty.MP_BASE_COLOR), 'Default color pin connection failed'
    edit.recompile_material(material)
    assert assets.save_loaded_asset(material)
else:
    assert isinstance(before,unreal.MaterialExpressionVertexColor), 'Unexpected authored base-color connection; inspect before editing'
after=edit.get_material_property_input_node(material,unreal.MaterialProperty.MP_BASE_COLOR)
assert isinstance(after,unreal.MaterialExpressionVertexColor)
report['after']=after.get_class().get_name()
report['output']=edit.get_material_property_input_node_output_name(material,unreal.MaterialProperty.MP_BASE_COLOR)
(ROOT/'artifacts/unreal/surface-material-repair.json').write_text(json.dumps(report,indent=2))
unreal.log('PHILLY_SURFACE_MATERIAL '+json.dumps(report))
