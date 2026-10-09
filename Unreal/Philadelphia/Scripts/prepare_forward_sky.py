"""Create an atmosphere-sampled sky material for the forward-renderer trial."""
import unreal

assets=unreal.EditorAssetLibrary
path='/Game/Philadelphia/Materials/M_ForwardAtmosphereSky'
material=assets.load_asset(path) if assets.does_asset_exist(path) else unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_ForwardAtmosphereSky','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
edit=unreal.MaterialEditingLibrary
edit.delete_all_material_expressions(material)
material.set_editor_property('shading_model',unreal.MaterialShadingModel.MSM_UNLIT)
material.set_editor_property('two_sided',True)
material.set_editor_property('is_sky',True)
sky=edit.create_material_expression(material,unreal.MaterialExpressionSkyAtmosphereViewLuminance)
assert edit.connect_material_property(sky,'',unreal.MaterialProperty.MP_EMISSIVE_COLOR)
edit.recompile_material(material)
assert assets.save_loaded_asset(material)
unreal.log('PHILLY_FORWARD_SKY_MATERIAL '+material.get_path_name())
