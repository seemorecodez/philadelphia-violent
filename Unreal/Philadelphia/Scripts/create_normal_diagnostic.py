"""Create only an opt-in diagnostic material; never assign it to the saved map."""
import unreal
import runpy
from pathlib import Path

assets=unreal.EditorAssetLibrary
path='/Game/Philadelphia/Materials/M_SurfaceNormalsDiagnostic'
material=assets.load_asset(path) if assets.does_asset_exist(path) else None
if not material:
    material=unreal.AssetToolsHelpers.get_asset_tools().create_asset(
        'M_SurfaceNormalsDiagnostic','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
    edit=unreal.MaterialEditingLibrary
    normal=edit.create_material_expression(material,unreal.MaterialExpressionPixelNormalWS)
    multiply=edit.create_material_expression(material,unreal.MaterialExpressionMultiply)
    multiply.set_editor_property('const_b',.5)
    add=edit.create_material_expression(material,unreal.MaterialExpressionAdd)
    add.set_editor_property('const_b',.5)
    edit.connect_material_expressions(normal,'',multiply,'A')
    edit.connect_material_expressions(multiply,'',add,'A')
    edit.connect_material_property(add,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    material.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
    material.set_editor_property('two_sided',True)
    edit.recompile_material(material)
    assert assets.save_loaded_asset(material)
unreal.log('PHILLY_NORMAL_DIAGNOSTIC_READY')
runpy.run_path(str(Path(__file__).with_name('inspect_materials.py')),run_name='__main__')
