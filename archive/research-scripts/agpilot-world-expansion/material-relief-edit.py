from pathlib import Path
p=Path('Unreal/Philadelphia/Scripts/prepare_house_material.py')
s=p.read_text()
old="""    roughness=edit.create_material_expression(material,unreal.MaterialExpressionConstant)
    roughness.set_editor_property('r',.82)
    assert edit.connect_material_property(roughness,'',unreal.MaterialProperty.MP_ROUGHNESS)
"""
new="""    # The current generator reserves this exact linear colour for window panes.
    # UV-negative trim/doors stay matte; wall UVs remain the masonry discriminator.
    roughness=edit.create_material_expression(material,unreal.MaterialExpressionCustom)
    rough_inputs=[]
    for name in ['Color','UV']:
        item=unreal.CustomInput();item.set_editor_property('input_name',name);rough_inputs.append(item)
    roughness.set_editor_property('inputs',rough_inputs)
    roughness.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT1)
    roughness.set_editor_property('code','return UV.x<0 && distance(Color.rgb,float3(.13,.20,.24))<.003 ? .12 : .82;')
    assert edit.connect_material_expressions(color,'',roughness,'Color')
    assert edit.connect_material_expressions(uv,'',roughness,'UV')
    assert edit.connect_material_property(roughness,'',unreal.MaterialProperty.MP_ROUGHNESS)

    # Surface-gradient bump in world space preserves arbitrary footprint bearings.
    # 1.5mm relief shades the existing masonry; it changes no silhouette/collision.
    world=edit.create_material_expression(material,unreal.MaterialExpressionWorldPosition)
    normal=edit.create_material_expression(material,unreal.MaterialExpressionVertexNormalWS)
    relief=edit.create_material_expression(material,unreal.MaterialExpressionCustom)
    relief_inputs=[]
    for name in ['UV','Position','Normal']:
        item=unreal.CustomInput();item.set_editor_property('input_name',name);relief_inputs.append(item)
    relief.set_editor_property('inputs',relief_inputs)
    relief.set_editor_property('output_type',unreal.CustomMaterialOutputType.CMOT_FLOAT3)
    relief.set_editor_property('code','''
float3 n=normalize(Normal);
float2 m=UV*float2(2.2,2.8);
float row=floor(m.y/.085);
float2 b=frac(float2(m.x/.26+fmod(row,2)*.5,m.y/.085));
float2 aa=max(fwidth(m/float2(.26,.085)),.0001);
float joint=max(1-smoothstep(.035-aa.x,.035+aa.x,b.x),1-smoothstep(.08-aa.y,.08+aa.y,b.y));
float fade=1-smoothstep(.08,.4,max(aa.x,aa.y));
float h=UV.x>=0 ? -.15*joint*fade : 0;
float3 dx=ddx(Position),dy=ddy(Position);
float3 r1=cross(dy,n),r2=cross(n,dx);
float det=dot(dx,r1);
float3 grad=r1*ddx(h)+r2*ddy(h);
return abs(det)>1e-6 ? normalize(n-grad/det) : n;
''')
    assert edit.connect_material_expressions(uv,'',relief,'UV')
    assert edit.connect_material_expressions(world,'',relief,'Position')
    assert edit.connect_material_expressions(normal,'',relief,'Normal')
    material.set_editor_property('tangent_space_normal',False)
    assert edit.connect_material_property(relief,'',unreal.MaterialProperty.MP_NORMAL)
"""
assert old in s
Path('artifacts/agpilot-world-expansion/prepare_house_material-before-relief.py').write_text(s)
p.write_text(s.replace(old,new))
