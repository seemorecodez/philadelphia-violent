"""Native masonry shader for interpreted houses, with physical opening geometry."""
import unreal
assets=unreal.EditorAssetLibrary
edit=unreal.MaterialEditingLibrary
path='/Game/Philadelphia/Materials/M_SouthHouse'
material=assets.load_asset(path) if assets.does_asset_exist(path) else None
if material is None:
    material=unreal.AssetToolsHelpers.get_asset_tools().create_asset('M_SouthHouse','/Game/Philadelphia/Materials',unreal.Material,unreal.MaterialFactoryNew())
edit.delete_all_material_expressions(material)
if material:
    color=edit.create_material_expression(material,unreal.MaterialExpressionVertexColor)
    uv=edit.create_material_expression(material,unreal.MaterialExpressionTextureCoordinate)
    custom=edit.create_material_expression(material,unreal.MaterialExpressionCustom)
    inputs=[]
    for name in ['Color','UV','Near']:
        item=unreal.CustomInput();item.set_editor_property('input_name',name);inputs.append(item)
    custom.set_editor_property('inputs',inputs)
    custom.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    custom.set_editor_property('code','''
float3 c=Color.rgb;
if(UV.x>=0) {
 float2 m=UV*float2(2.2,2.8);
 float row=floor(m.y/.085);
 float2 b=frac(float2(m.x/.26+fmod(row,2)*.5,m.y/.085));
 float2 aa=max(fwidth(m/float2(.26,.085)),.0001);
 float mortar=(1-smoothstep(.035-aa.x,.035+aa.x,b.x))+(1-smoothstep(.08-aa.y,.08+aa.y,b.y));
 float brick=frac(sin(dot(float2(floor(m.x/.26+fmod(row,2)*.5),row),float2(12.9898,78.233)))*43758.5453);
 c*=.92+.16*brick;
 c=lerp(c,float3(.38,.34,.29),saturate(mortar)*.65);
 if(Near<.5) {
  float2 w=frac(UV);float2 edge=max(fwidth(UV),.0001);
  float trim=smoothstep(.20-edge.x,.20+edge.x,w.x)*(1-smoothstep(.80-edge.x,.80+edge.x,w.x))*smoothstep(.17-edge.y,.17+edge.y,w.y)*(1-smoothstep(.84-edge.y,.84+edge.y,w.y));
  float glass=smoothstep(.25-edge.x,.25+edge.x,w.x)*(1-smoothstep(.75-edge.x,.75+edge.x,w.x))*smoothstep(.22-edge.y,.22+edge.y,w.y)*(1-smoothstep(.79-edge.y,.79+edge.y,w.y));
  c=lerp(c,float3(.66,.63,.55),trim);c=lerp(c,float3(.14,.20,.23),glass);
 }
}
return c;
''')
    assert edit.connect_material_expressions(color,'',custom,'Color')
    assert edit.connect_material_expressions(color,'A',custom,'Near')
    assert edit.connect_material_expressions(uv,'',custom,'UV')
    assert edit.connect_material_property(custom,'',unreal.MaterialProperty.MP_BASE_COLOR)
    roughness=edit.create_material_expression(material,unreal.MaterialExpressionConstant)
    roughness.set_editor_property('r',.82)
    assert edit.connect_material_property(roughness,'',unreal.MaterialProperty.MP_ROUGHNESS)
    edit.recompile_material(material)
    assert assets.save_loaded_asset(material)
unreal.log('PHILLY_NATIVE_HOUSE_MATERIAL_READY '+material.get_path_name())
