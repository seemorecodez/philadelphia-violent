"""Import the inspected original Philadelphia COLLADA without inventing detail.

Run with Blender --background --factory-startup --python this_file.py.
This is an isolated textured source reference, never a cleaned game asset.
"""
import hashlib
import json
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts/city-source-audit/sample-philly-0000'
OUT = ROOT / 'assets/city/reference/philly-0000'
OUT.mkdir(parents=True, exist_ok=True)
dae = SOURCE / 'philly_0000.dae'
atlas = SOURCE / 'tmaps/pphilly_0000-0.jpg'
hash_file = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
original_hashes = {p.name: hash_file(p) for p in (dae, atlas, SOURCE / 'philly_0000.kml')}
root = ET.parse(dae).getroot()
assert root.find('asset/unit').get('meter') == '1'
assert root.findtext('asset/up_axis') == 'Z_UP'
nodes = root.findall('library_visual_scenes/visual_scene/node')
assert all(not any(n.findall(t) for t in ('matrix', 'translate', 'rotate', 'scale')) for n in nodes)
source_mesh = root.find('library_geometries/geometry/mesh')
sources = {}
for node in source_mesh.findall('source'):
    values = [float(x) for x in node.findtext('float_array').split()]
    stride = int(node.find('technique_common/accessor').get('stride'))
    sources[node.get('id')] = [tuple(values[i:i + stride]) for i in range(0, len(values), stride)]
vertex_source = source_mesh.find('vertices/input[@semantic="POSITION"]').get('source')[1:]
positions = sources[vertex_source]
faces, corner_uvs, corner_normals, material_ids = [], [], [], []
for group in source_mesh.findall('triangles'):
    inputs = {n.get('semantic'): (int(n.get('offset')), n.get('source')[1:]) for n in group.findall('input')}
    stride = max(offset for offset, _ in inputs.values()) + 1
    data = [int(x) for x in group.findtext('p').split()]
    assert len(data) == int(group.get('count')) * 3 * stride
    for start in range(0, len(data), 3 * stride):
        corners = [data[start + c * stride:start + (c + 1) * stride] for c in range(3)]
        faces.append(tuple(row[inputs['VERTEX'][0]] for row in corners))
        material_ids.append(0 if 'TEXCOORD' in inputs else 1)
        for row in corners:
            corner_uvs.append(sources[inputs['TEXCOORD'][1]][row[inputs['TEXCOORD'][0]]][:2] if 'TEXCOORD' in inputs else (0, 0))
            corner_normals.append(sources[inputs['NORMAL'][1]][row[inputs['NORMAL'][0]]])
assert len(positions) == 1172 and len(faces) == 1492

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
mesh = bpy.data.meshes.new('Original COLLADA positions and triangles')
mesh.from_pydata(positions, [], faces)
mesh.update()
obj = bpy.data.objects.new('philly_0000 — original textured source, NOT cleaned', mesh)
bpy.context.collection.objects.link(obj)
uv = mesh.uv_layers.new(name='CHANNEL1')
for loop, value in zip(uv.data, corner_uvs):
    loop.uv = value
mesh.normals_split_custom_set(corner_normals)

image = bpy.data.images.load(str(atlas), check_existing=False)
image.pack()
def source_material(name, color=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs['Strength'].default_value = 1
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    if color is None:
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = image
        mat.node_tree.links.new(tex.outputs['Color'], emission.inputs['Color'])
    else:
        emission.inputs['Color'].default_value = color
    return mat
mesh.materials.append(source_material('Original photograph — unlit inspection only'))
mesh.materials.append(source_material('Original green diffuse — unlit inspection only', (0.41176, 0.71373, 0.11373, 1)))
for poly, material_index in zip(mesh.polygons, material_ids):
    poly.material_index = material_index
obj['source_longitude'] = -75.155179
obj['source_latitude'] = 39.955632
obj['source_altitude_mode'] = 'clampToGround; absolute elevation unverified'
obj['source_units'] = 'metres; Z_UP; source positions retained without recentering'
obj['status'] = 'ORIGINAL SOURCE REFERENCE — baked objects/lighting retained; not an AAA reconstruction'
obj['source_dae_sha256'] = original_hashes[dae.name]
obj['source_atlas_sha256'] = original_hashes[atlas.name]

position_error = max(abs(mesh.vertices[i].co[j] - p[j]) for i, p in enumerate(positions) for j in range(3))
uv_error = max(abs(uv.data[i].uv[j] - p[j]) for i, p in enumerate(corner_uvs) for j in range(2))
assert position_error < 0.00001 and uv_error < 0.000001
assert [tuple(p.vertices) for p in mesh.polygons] == faces
assert hashlib.sha256(bytes(image.packed_file.data)).hexdigest() == original_hashes[atlas.name]
assert original_hashes == {p.name: hash_file(p) for p in (dae, atlas, SOURCE / 'philly_0000.kml')}

scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 8
scene.render.resolution_x = 1200
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.color = (0.055, 0.065, 0.08)
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
camera_data = bpy.data.cameras.new('Reference inspection camera')
camera = bpy.data.objects.new('Reference inspection camera', camera_data)
scene.collection.objects.link(camera)
camera.location = (135, -145, 108)
camera.rotation_euler = (Vector((0, 0, 13)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera_data.type = 'ORTHO'
camera_data.ortho_scale = 145
camera_data.clip_end = 1000
scene.camera = camera
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
scene.render.filepath = str(OUT / 'original-source-review.png')
report = {
    'status': 'source reference only; not cleaned or integrated',
    'source_files_sha256': original_hashes,
    'source_origin_lon_lat': [-75.155179, 39.955632],
    'source_units': 'metres, Z_UP', 'vertices': len(positions), 'triangles': len(faces),
    'max_position_roundoff_metres': position_error, 'max_uv_roundoff': uv_error,
    'triangle_order_preserved': True, 'packed_jpeg_identical': True,
    'material_note': 'Source photograph shown with emission for inspection; not final PBR or de-lit material.',
    'limitations': ['Historical capture', 'Building identity unverified', 'Baked cars, vegetation and shadows',
                    'Occluded and stretched facade areas', 'No new geometry or cleanup'],
}
(OUT / 'reference-validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'philly-0000-original-reference.blend'))
bpy.ops.render.render(write_still=True)
print(json.dumps(report))
