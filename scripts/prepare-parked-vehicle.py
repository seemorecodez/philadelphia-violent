"""Bake the retained vehicle's 71 materials into one reusable parked mesh.

The playable car and source GLB are untouched. This uses Blender's actual source
materials, UVs and geometry; it does not replace the car with a primitive proxy.
"""
from pathlib import Path
import bpy, json, math, sys, traceback, hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/city/blender/neighborhood-street-kit'
sys.stdout=(ROOT/'artifacts/parked-vehicle-bake.log').open('w',buffering=1);sys.stderr=sys.stdout
sys.excepthook=lambda k,v,t:traceback.print_exception(k,v,t,file=sys.stderr)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/mustang-2005.glb'))
objects=[o for o in bpy.context.view_layer.objects if o.type=='MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objects:o.select_set(True)
bpy.context.view_layer.objects.active=objects[0]
bpy.ops.object.join();car=bpy.context.object;car.name='parked-car'
world=car.matrix_world.copy();car.parent=None;car.matrix_world=world
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
lowest=min(v.co.z for v in car.data.vertices)
for v in car.data.vertices:v.co.z-=lowest
scene=bpy.context.scene;scene.cursor.location=(0,0,0)
bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
# Explicitly retain the imported source UV layer for all texture samplers.
original_uv=car.data.uv_layers.active.name
for material in car.data.materials:
    if not material or not material.use_nodes:continue
    nodes=material.node_tree.nodes;links=material.node_tree.links
    for node in list(nodes):
        if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
            uv=nodes.new('ShaderNodeUVMap');uv.uv_map=original_uv;links.new(uv.outputs['UV'],node.inputs['Vector'])
car.data.uv_layers.new(name='ParkedAtlas')
car.data.uv_layers.active_index=len(car.data.uv_layers)-1
bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.008)
bpy.ops.object.mode_set(mode='OBJECT')
atlas=bpy.data.images.new('ParkedCar_Albedo',width=1024,height=1024,alpha=False)
for material in car.data.materials:
    if not material or not material.use_nodes:continue
    nodes=material.node_tree.nodes;links=material.node_tree.links
    principled=next((n for n in nodes if n.type=='BSDF_PRINCIPLED'),None)
    output=next((n for n in nodes if n.type=='OUTPUT_MATERIAL'),None)
    if not principled or not output:continue
    emission=nodes.new('ShaderNodeEmission')
    base=principled.inputs['Base Color']
    if base.is_linked:links.new(base.links[0].from_socket,emission.inputs['Color'])
    else:emission.inputs['Color'].default_value=base.default_value
    links.new(emission.outputs[0],output.inputs['Surface'])
    target=nodes.new('ShaderNodeTexImage');target.image=atlas;nodes.active=target
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=1
scene.render.bake.margin=4;scene.render.bake.use_clear=True
print('Baking retained car albedo to one atlas',len(car.data.polygons),'faces')
bpy.ops.object.bake(type='EMIT')
atlas.filepath_raw=str(OUT/'parked-car-albedo.png');atlas.file_format='PNG';atlas.save();atlas.pack()
mat=bpy.data.materials.new('ParkedCar_Atlas');mat.use_nodes=True
shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.38;shader.inputs['Metallic'].default_value=.18
texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=atlas
uv=mat.node_tree.nodes.new('ShaderNodeUVMap');uv.uv_map='ParkedAtlas'
mat.node_tree.links.new(uv.outputs['UV'],texture.inputs['Vector']);mat.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color'])
car.data.materials.clear();car.data.materials.append(mat)
for poly in car.data.polygons:poly.material_index=0
for layer in list(car.data.uv_layers):
    if layer.name!='ParkedAtlas':car.data.uv_layers.remove(layer)
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'parked-vehicle.blend'))
path=OUT/'parked-car.glb'
bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True)
car.data.calc_loop_triangles()
receipt={'kind':'parked-car','file':str(path.relative_to(ROOT)).replace('\\','/'),'triangles':len(car.data.loop_triangles),'materialSlots':1,'source':'public/models/mustang-2005.glb','sourceMaterialSlots':71,'classification':'Baked parked variant, near visual acceptance required','sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(OUT/'parked-car.json').write_text(json.dumps(receipt,indent=2))
print('PHILLY_PARKED_ATLAS_READY')
