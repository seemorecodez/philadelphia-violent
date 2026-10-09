"""Import the source-geometry road atlas used only by distant terrain."""
import hashlib
import json
from pathlib import Path
import unreal

HERE = Path(__file__).resolve().parent
DATA = HERE.parent / 'Content/SourceData'
proof = json.loads((DATA/'district-backdrop.json').read_text())
png = DATA/'district-backdrop.png'
assert hashlib.sha256(png.read_bytes()).hexdigest() == proof['textureSha256']
folder = '/Game/Philadelphia/Assets/DistrictBackdrop/'+proof['textureSha256'][:12]
assets = unreal.EditorAssetLibrary
assets.make_directory(folder)
textures = [assets.load_asset(p) for p in assets.list_assets(folder,recursive=True,include_folder=False)]
textures = [t for t in textures if isinstance(t,unreal.Texture2D)]
if not textures:
    # AssetTools' post-import content-browser sync requires Slate and crashes
    # this headless commandlet. Use the same direct Interchange path as GLBs.
    pipeline = unreal.InterchangeGenericAssetsPipeline()
    pipeline.set_editor_property('use_source_name_for_asset',True)
    parameters = unreal.ImportAssetParameters()
    parameters.set_editor_property('is_automated',True)
    parameters.set_editor_property('override_pipelines',[unreal.SoftObjectPath(pipeline.get_path_name())])
    data = unreal.InterchangeManager.create_source_data(str(png))
    assert unreal.InterchangeManager.get_interchange_manager_scripted().import_asset(folder,data,parameters)
    textures = [assets.load_asset(p) for p in assets.list_assets(folder,recursive=True,include_folder=False)]
    textures = [t for t in textures if isinstance(t,unreal.Texture2D)]
assert len(textures)==1
texture = textures[0]
assert [texture.blueprint_get_size_x(),texture.blueprint_get_size_y()]==proof['textureSize']
texture.set_editor_property('srgb',True)
assets.save_loaded_asset(texture)
material_path = '/Game/Philadelphia/Materials/M_DistrictBackdrop'
material = assets.load_asset(material_path) if assets.does_asset_exist(material_path) else unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_DistrictBackdrop','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
edit = unreal.MaterialEditingLibrary
edit.delete_all_material_expressions(material)
sample = edit.create_material_expression(material,unreal.MaterialExpressionTextureSample)
sample.set_editor_property('texture',texture)
assert edit.connect_material_property(sample,'RGB',unreal.MaterialProperty.MP_BASE_COLOR)
rough = edit.create_material_expression(material,unreal.MaterialExpressionConstant)
rough.set_editor_property('r',1.0)
assert edit.connect_material_property(rough,'',unreal.MaterialProperty.MP_ROUGHNESS)
edit.recompile_material(material)
assert assets.save_loaded_asset(material)
unreal.log('PHILLY_BACKDROP_MATERIAL '+json.dumps({'texture':texture.get_path_name(),'material':material.get_path_name(),'size':proof['textureSize'],'textureSha256':proof['textureSha256']}))
