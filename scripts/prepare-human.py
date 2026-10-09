"""Prepare a clothed CC0 MakeHuman adult using source anatomy and skin weights.

Run with installed Blender --background --factory-startup --disable-autoexec
--python <this-file>. Add -- render to write local inspection images.
No MakeHuman application code is imported or executed.
"""
import hashlib
import json
import math
import re
import struct
import sys
import traceback
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

PROJECT = Path(__file__).resolve().parents[1]
ASSETS = PROJECT / 'assets/characters'
SOURCE = ASSETS / 'source'
SYSTEM = SOURCE / 'system'
INSPECT = ASSETS / 'inspection'
INSPECT.mkdir(parents=True, exist_ok=True)
PUBLIC = PROJECT / 'public/models/character'
PUBLIC.mkdir(parents=True, exist_ok=True)
STATUS = ASSETS / 'human-status.json'
SOURCE_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'


def record(path, data):
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')


def read_obj(path):
    vertices, uvs, faces, groups = [], [], [], []
    group = ''
    for line in path.read_text(encoding='utf-8').splitlines():
        words = line.split()
        if not words:
            continue
        if words[0] == 'v':
            vertices.append(Vector(tuple(map(float, words[1:4]))))
        elif words[0] == 'vt':
            uvs.append(tuple(map(float, words[1:3])))
        elif words[0] == 'g':
            group = words[1]
        elif words[0] == 'f':
            face = []
            for word in words[1:]:
                indices = word.split('/')
                face.append((int(indices[0]) - 1,
                             int(indices[1]) - 1 if len(indices) > 1 and indices[1] else None))
            faces.append(face)
            groups.append(group)
    return vertices, uvs, faces, groups


def read_mapping(path, base_vertices):
    settings, mappings, deleted = {}, [], set()
    section = 'settings'
    for line in path.read_text(encoding='utf-8').splitlines():
        words = line.split()
        if not words or words[0].startswith('#'):
            continue
        if words[0] == 'verts':
            section = 'verts'
            continue
        if words[0] == 'delete_verts':
            section = 'delete'
            continue
        if section == 'settings':
            settings[words[0]] = words[1:]
        elif section == 'verts':
            if not re.match(r'^-?\d+$', words[0]):
                continue
            if len(words) == 1:
                mappings.append(([int(words[0])], [1], Vector((0, 0, 0))))
            elif len(words) == 9:
                mappings.append((list(map(int, words[:3])), list(map(float, words[3:6])),
                                 Vector(tuple(map(float, words[6:9])))))
            else:
                raise RuntimeError(f'Unknown vertex mapping format in {path.name}: {line}')
        else:
            index = 0
            while index < len(words):
                start = int(words[index])
                if index + 2 < len(words) and words[index + 1] == '-':
                    deleted.update(range(start, int(words[index + 2]) + 1))
                    index += 3
                else:
                    deleted.add(start)
                    index += 1
    scales = []
    for axis, name in enumerate(['x_scale', 'y_scale', 'z_scale']):
        a, b, distance = settings[name]
        scales.append(abs(base_vertices[int(a)][axis] - base_vertices[int(b)][axis]) / float(distance))
    positions = [sum((base_vertices[i] * weight for i, weight in zip(indices, weights)), Vector())
                 + Vector(tuple(offset[a] * scales[a] for a in range(3)))
                 for indices, weights, offset in mappings]
    return settings, mappings, deleted, positions


def create_mesh(name, vertices, uvs, faces, source_indices=None):
    used = sorted({index for face in faces for index, _uv in face})
    remap = {old: new for new, old in enumerate(used)}
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([vertices[i] for i in used], [], [[remap[i] for i, _uv in face] for face in faces])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name='Source UV')
    for polygon, source_face in zip(mesh.polygons, faces):
        polygon.use_smooth = True
        for loop, (_index, texture_index) in zip(polygon.loop_indices, source_face):
            if texture_index is not None:
                uv_layer.data[loop].uv = uvs[texture_index]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj['sourceVertexCount'] = len(vertices)
    return obj, used


def material_from_source(name, path, roughness=.65, masked=False):
    config = {}
    for line in path.read_text(encoding='utf-8').splitlines():
        words = line.split()
        if words and not words[0].startswith(('#', '//')):
            config[words[0]] = words[1:]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (.45, .35, .25, 1)
    principled = mat.node_tree.nodes['Principled BSDF']
    principled.inputs['Roughness'].default_value = roughness
    principled.inputs['Specular IOR Level'].default_value = .28
    if name == 'Human skin':
        principled.inputs['Subsurface Weight'].default_value = .05
    if 'diffuseTexture' not in config:
        raise RuntimeError(f'Source material has no authored color texture: {path}')
    texture_path = path.parent / config['diffuseTexture'][0]
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    mat.node_tree.links.new(node.outputs['Color'], principled.inputs['Base Color'])
    # The authored eye atlas includes a transparent corneal shell; treating it
    # as opaque covers the iris and sclera with the atlas's empty pixels.
    if masked or config.get('transparent', ['False'])[0].lower() == 'true':
        mat.surface_render_method = 'DITHERED'
        mat.node_tree.links.new(node.outputs['Alpha'], principled.inputs['Alpha'])
    if 'normalmapTexture' in config:
        normal = bpy.data.images.load(str(path.parent / config['normalmapTexture'][0]), check_existing=True)
        normal.colorspace_settings.name = 'Non-Color'
        normal.pack()
        texture = mat.node_tree.nodes.new('ShaderNodeTexImage')
        texture.image = normal
        normal_node = mat.node_tree.nodes.new('ShaderNodeNormalMap')
        normal_node.inputs['Strength'].default_value = float(config.get('normalmapIntensity', ['1'])[0])
        mat.node_tree.links.new(texture.outputs['Color'], normal_node.inputs['Color'])
        mat.node_tree.links.new(normal_node.outputs['Normal'], principled.inputs['Normal'])
    mat['sourceMaterial'] = str(path.relative_to(SOURCE))
    mat['maskedInGltf'] = masked
    return mat


def create_rig(definition, base_vertices, transform):
    joints = {name: transform @ (sum((base_vertices[i] for i in indices), Vector()) / len(indices))
              for name, indices in definition['joints'].items()}
    data = bpy.data.armatures.new('MakeHuman CC0 default skeleton')
    obj = bpy.data.objects.new('HumanRig', data)
    bpy.context.scene.collection.objects.link(obj)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode='EDIT')
    for name, spec in definition['bones'].items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = joints[spec['head']], joints[spec['tail']]
        if (bone.tail - bone.head).length < 1e-6:
            raise RuntimeError(f'Degenerate source bone: {name}')
        plane = definition['planes'][spec['rotation_plane']]
        p0, p1, p2 = [joints[j] for j in plane]
        normal = (p1 - p0).cross(p2 - p0)
        if normal.length > 1e-7:
            bone.align_roll(normal.normalized())
    for name, spec in definition['bones'].items():
        if spec['parent']:
            data.edit_bones[name].parent = data.edit_bones[spec['parent']]
    bpy.ops.object.mode_set(mode='OBJECT')
    obj.show_in_front = True
    return obj


def bind(obj, indices, weights, rig):
    groups = {name: obj.vertex_groups.new(name=name) for name in rig.data.bones.keys()}
    for output_index, source_index in enumerate(indices):
        values = sorted(((name, max(0, weight)) for name, weight in weights[source_index].items()
                         if name in groups and weight > 1e-7), key=lambda pair: pair[1], reverse=True)[:4]
        total = sum(value for _name, value in values)
        if total <= 0:
            raise RuntimeError(f'Missing source skin weights: {obj.name} vertex {source_index}')
        for name, value in values:
            groups[name].add([output_index], value / total, 'REPLACE')
    modifier = obj.modifiers.new('Source skeleton deformation', 'ARMATURE')
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)


def pose_rotation(rig, name, world_rotation):
    bone = rig.pose.bones[name]
    basis = rig.data.bones[name].matrix_local.to_quaternion()
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = basis.inverted() @ world_rotation @ basis


def create_actions(rig, shoes):
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 1, 33
    rig.animation_data_create()
    actions = {}
    # Authored contact, recoil, passing and high-point poses. The second half
    # swaps sides. This is a simple animation cycle, not motion capture.
    poses = [(-18, 4, 16, 7), (-10, 6, 10, 40), (0, 8, 0, 60), (10, 6, -12, 28),
             (16, 7, -18, 4), (10, 40, -10, 6), (0, 60, 0, 8), (-12, 28, 10, 6),
             (-18, 4, 16, 7)]
    for name in ['Idle', 'Walk']:
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        rig.animation_data.action = action
        actions[name] = action
        frames = [(1, (0, 3, 0, 3)), (33, (0, 3, 0, 3))] if name == 'Idle' else [(1 + i * 4, p) for i, p in enumerate(poses)]
        for frame, (lh, lk, rh, rk) in frames:
            scene.frame_set(frame)
            for bone in rig.pose.bones:
                bone.rotation_mode = 'QUATERNION'
                bone.rotation_quaternion = Quaternion()
                bone.location = (0, 0, 0)
            for side, hip, knee in [('L', lh, lk), ('R', rh, rk)]:
                sign = 1 if side == 'L' else -1
                pose_rotation(rig, 'upperleg01.' + side, Quaternion((1, 0, 0), math.radians(hip)))
                pose_rotation(rig, 'lowerleg01.' + side, Quaternion((1, 0, 0), math.radians(knee)))
                toe_off = max(0, hip - 7) if knee < 12 else 0
                pose_rotation(rig, 'foot.' + side, Quaternion((1, 0, 0), math.radians(-hip - knee + toe_off)))
                swing = -hip * .65
                arm = Quaternion((1, 0, 0), math.radians(swing)) @ Quaternion((0, 1, 0), math.radians(28 * sign))
                pose_rotation(rig, 'upperarm01.' + side, arm)
                pose_rotation(rig, 'lowerarm01.' + side, Quaternion((1, 0, 0), math.radians(20 - abs(swing) * .25)))
            rig.location = (0, 0, 0)
            bpy.context.view_layer.update()
            evaluated = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            lowest = min((evaluated.matrix_world @ v.co).z for v in mesh.vertices)
            evaluated.to_mesh_clear()
            rig.location.z = -lowest
            rig.keyframe_insert('location', frame=frame, group='Ground contact')
            for bone in rig.pose.bones:
                bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        track = rig.animation_data.nla_tracks.new()
        track.name = name
        track.strips.new(name, 1, action)
        track.mute = True
    rig.animation_data.action = actions['Idle']
    scene.frame_set(1)
    return actions


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base_vertices, base_uvs, base_faces, base_groups = read_obj(SOURCE / 'base.obj')
    skeleton = json.loads((SOURCE / 'default.mhskel').read_text())
    original_weights = json.loads((SOURCE / 'default_weights.mhw').read_text())['weights']
    base_weights = [defaultdict(float) for _ in base_vertices]
    for bone, entries in original_weights.items():
        for index, weight in entries:
            base_weights[index][bone] = weight
    selections = [
        ('Human casual outfit', 'clothes/male_casualsuit01/male_casualsuit01.mhclo', None, .8, False),
        ('Human leather shoes', 'clothes/shoes01/shoes01.mhclo', None, .55, False),
        ('Human short hair', 'hair/short01/short01.mhclo', None, .8, True),
        ('Human eyebrows', 'eyebrows/eyebrow001/eyebrow001.mhclo', None, .9, True),
        ('Human eyelashes', 'eyelashes/eyelashes01/eyelashes01.mhclo', None, .7, True),
        ('Human brown eyes', 'eyes/high-poly/high-poly.mhclo', 'eyes/materials/brown.mhmat', .23, False),
    ]
    deleted, components = set(), []
    for name, filename, material_override, roughness, masked in selections:
        source = SYSTEM / filename
        settings, mapping, hidden, positions = read_mapping(source, base_vertices)
        deleted.update(hidden)
        _original, uv, faces, _groups = read_obj(source.parent / settings['obj_file'][0])
        if len(positions) != len(_original):
            raise RuntimeError(f'Mesh mapping count mismatch: {name}')
        weights = []
        for source_indices, factors, _offset in mapping:
            weight = defaultdict(float)
            for source_index, factor in zip(source_indices, factors):
                for bone, influence in base_weights[source_index].items():
                    weight[bone] += factor * influence
            weights.append(weight)
        material = SYSTEM / material_override if material_override else source.parent / settings['material'][0]
        components.append((name, positions, uv, faces, weights, material, roughness, masked))
    visible_body = [face for face, group in zip(base_faces, base_groups)
                    if group == 'body' and not any(index in deleted for index, _uv in face)]
    components.insert(0, ('Human skin', base_vertices, base_uvs, visible_body, base_weights,
                          SYSTEM / 'skins/young_african_male/young_african_male.mhmat', .5, False))
    all_points = [positions[index] for _name, positions, _uv, faces, *_rest in components
                  for index in {index for face in faces for index, _uv in face}]
    lo = [min(v[a] for v in all_points) for a in range(3)]
    hi = [max(v[a] for v in all_points) for a in range(3)]
    scale = 1.78 / (hi[1] - lo[1])
    # Source MakeHuman is Y-up/+Z-front in decimetre-like units. Blender Z-up
    # with front -Y exports back to glTF +Y-up/+Z-front using export_yup.
    axis = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    transform = axis @ Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-(lo[0] + hi[0]) / 2, -lo[1], 0)))
    rig = create_rig(skeleton, base_vertices, transform)
    meshes = []
    for name, positions, uv, faces, weights, material_path, roughness, masked in components:
        obj, used = create_mesh(name, [transform @ v for v in positions], uv, faces)
        obj.data.materials.append(material_from_source(name, material_path, roughness, masked))
        bind(obj, used, weights, rig)
        meshes.append(obj)
    actions = create_actions(rig, bpy.data.objects['Human leather shoes'])
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.context.scene['assetLicense'] = 'MakeHuman system assets CC0 1.0 Universal'
    bpy.context.scene['assetSource'] = f'https://github.com/makehumancommunity/makehuman/tree/{SOURCE_COMMIT}'
    bpy.context.scene['preparation'] = 'Authored CC0 anatomy, clothing, hair, skin, eyes and skin weights; fitted by their source mappings; simple authored Idle and Walk poses.'
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / 'human-adult.blend'), check_existing=False)
    destination = PUBLIC / 'human-adult.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
                             export_frame_range=False, export_force_sampling=True,
                             export_cameras=False, export_lights=False, export_extras=True,
                             export_copyright='MakeHuman Community system assets, CC0 1.0 Universal')
    # glTF alpha masks preserve source hair cards without sorting every strand.
    contents = destination.read_bytes()
    json_length = struct.unpack_from('<I', contents, 12)[0]
    gltf = json.loads(contents[20:20 + json_length])
    for material in gltf.get('materials', []):
        if material.get('name') in {'Human short hair', 'Human eyebrows', 'Human eyelashes'}:
            material['alphaMode'], material['alphaCutoff'], material['doubleSided'] = 'MASK', .4, True
    encoded = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * ((-len(encoded)) % 4)
    tail = contents[20 + json_length:]
    destination.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(tail))
                            + struct.pack('<I4s', len(encoded), b'JSON') + encoded + tail)
    metadata = {'sourceCommit': SOURCE_COMMIT, 'sourceLicense': 'CC0-1.0',
                'heightMetresInRestPose': 1.78, 'axes': {'up': '+Y', 'forward': '+Z'},
                'meshObjects': len(meshes), 'bones': len(rig.data.bones),
                'vertices': sum(len(o.data.vertices) for o in meshes),
                'triangles': sum(len(poly.vertices) - 2 for o in meshes for poly in o.data.polygons),
                'animations': [a['name'] for a in gltf.get('animations', [])],
                'outputBytes': destination.stat().st_size,
                'derivedHash': hashlib.sha256(destination.read_bytes()).hexdigest(),
                'skinWeights': 'Original default weights, barycentric transfer through source clothing mappings, normalized to strongest four influences per vertex.',
                'animationLimits': 'Simple authored in-place 1.067-second walk cycle; not motion capture. Contact corrected at keyed poses; interpolation/foot sliding requires visual review.',
                'appearanceLimits': 'Authored anatomical topology with source color textures, outfit and shoe normal maps. Skin subsurface detail and cloth ambient-occlusion maps are not fully reproduced by glTF.',
                'visualStatus': 'Prepared; face, clothes, rig deformation and animated GLB require visual review.'}
    record(PUBLIC / 'human-adult.metadata.json', metadata)
    record(STATUS, {'status': 'export-complete', **metadata})
    if '--' in sys.argv and 'render' in sys.argv[sys.argv.index('--') + 1:]:
        render_preview(rig, actions)
    record(STATUS, {'status': 'complete', **metadata})


def render_preview(rig, actions):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 720, 960
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Human inspection world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.22, .25, .3, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    for index, location in enumerate([(3, -4, 5), (-3, -2, 3), (1, 4, 4)]):
        data = bpy.data.lights.new(f'Inspection light {index}', 'AREA')
        data.energy, data.shape, data.size = 300, 'DISK', 3
        obj = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.cameras.new('Human inspection camera')
    camera.type, camera.ortho_scale = 'ORTHO', 2.15
    camera_obj = bpy.data.objects.new(camera.name, camera)
    scene.collection.objects.link(camera_obj)
    scene.camera = camera_obj
    for name, action, frame, position, focus, zoom in [
            ('front', 'Idle', 1, (2, -7, 2.2), (0, 0, .9), 2.15),
            ('face', 'Idle', 1, (0, -5, 1.65), (0, 0, 1.59), .62),
            ('walk-contact', 'Walk', 1, (4, -6, 2.1), (0, 0, .9), 2.15),
            ('walk-passing', 'Walk', 9, (5, -1, 1.8), (0, 0, .9), 2.15)]:
        rig.animation_data.action = actions[action]
        scene.frame_set(frame)
        camera.ortho_scale = zoom
        camera_obj.location = position
        camera_obj.rotation_euler = (Vector(focus) - camera_obj.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(INSPECT / f'human-{name}.png')
        bpy.ops.render.render(write_still=True)
        record(STATUS, {'status': 'rendering', 'finished': name})


try:
    main()
except Exception:
    record(STATUS, {'status': 'error', 'traceback': traceback.format_exc()})
    raise
