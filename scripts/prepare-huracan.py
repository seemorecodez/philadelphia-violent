"""Inspect and prepare George Zaky's CC BY Huracan, using Blender background mode.

Run with -- inspect to record the untouched source before deciding on cleanup.
The source's scripts are never executed. All outputs stay in this workspace.
"""
import hashlib
import json
import sys
import math
import traceback
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / 'artifacts/sourcevehicles/huracan-performante.original.blend'
INSPECTION = PROJECT / 'artifacts/sourcevehicles/huracan-inspection'
INSPECTION.mkdir(parents=True, exist_ok=True)
STATUS = INSPECTION / 'status.json'
EXPECTED_HASH = 'e4dde07e57eeae3e1d093dd00c47d183db13285a94431325985fb53bca7f357f'


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')


def array(value):
    try:
        return list(value)
    except TypeError:
        return value


def bounds(obj):
    coords = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return {'min': [min(v[i] for v in coords) for i in range(3)],
            'max': [max(v[i] for v in coords) for i in range(3)]}


def inspect_source():
    objects = []
    for obj in bpy.data.objects:
        item = {'name': obj.name, 'type': obj.type,
                'hideRender': obj.hide_render,
                'hideViewport': obj.hide_viewport,
                'visible': obj.visible_get(),
                'cameraVisible': obj.visible_camera,
                'displayType': obj.display_type,
                'parent': obj.parent.name if obj.parent else None,
                'dimensions': list(obj.dimensions), 'bounds': bounds(obj),
                'materials': [slot.material.name if slot.material else None
                              for slot in obj.material_slots],
                'modifiers': [{'name': m.name, 'type': m.type,
                               'viewport': m.show_viewport, 'render': m.show_render,
                               'levels': getattr(m, 'levels', None),
                               'object': getattr(m, 'object', None).name if getattr(m, 'object', None) else None,
                               'renderLevels': getattr(m, 'render_levels', None)}
                              for m in obj.modifiers]}
        if obj.type == 'MESH':
            item.update(vertices=len(obj.data.vertices), polygons=len(obj.data.polygons))
        if obj.type == 'FONT':
            item['text'] = obj.data.body
        objects.append(item)
    materials = []
    for mat in bpy.data.materials:
        nodes = []
        if mat.node_tree:
            for node in mat.node_tree.nodes:
                nodes.append({'name': node.name, 'type': node.type,
                              'image': node.image.name if hasattr(node, 'image') and node.image else None,
                              'inputs': {s.name: array(s.default_value) for s in node.inputs
                                         if hasattr(s, 'default_value')},
                              'inputList': [{'name': s.name, 'identifier': s.identifier,
                                             'value': array(s.default_value)} for s in node.inputs
                                            if hasattr(s, 'default_value')],
                              'outputs': [{'name': s.name, 'links': [l.to_node.name for l in s.links]}
                                          for s in node.outputs]})
        materials.append({'name': mat.name, 'diffuse': list(mat.diffuse_color),
                          'nodes': nodes})
    images = []
    for index, image in enumerate(bpy.data.images):
        item = {'name': image.name, 'filepath': image.filepath,
                'size': list(image.size), 'packed': bool(image.packed_file)}
        if image.packed_file:
            extension = Path(image.filepath).suffix or '.bin'
            image_path = INSPECTION / f'image-{index:02d}{extension}'
            image_path.write_bytes(image.packed_file.data)
            item['extracted'] = str(image_path.relative_to(PROJECT))
        images.append(item)
    write_json(INSPECTION / 'source-inspection.json', {
        'blender': bpy.app.version_string,
        'scene': bpy.context.scene.name,
        'objects': objects, 'materials': materials, 'images': images,
        'textBlocks': [{'name': t.name, 'text': t.as_string()} for t in bpy.data.texts],
    })


ENVIRONMENT_OBJECTS = {'Area.001', 'BezierCircle', 'Camera', 'Circle.007',
                       'Plane.001', 'Plane.002', 'Plane.004'}
MARKING_OBJECTS = {'Plane.003': 'Raised rear Lamborghini lettering',
                   'Plane.005': 'Front shield badge and its logo texture'}


def prepare_geometry():
    """Freeze the creator's modeled surfaces, keeping helpers until evaluation."""
    scene = bpy.context.scene
    retained = [o for o in bpy.data.objects if o.type == 'MESH'
                and o.name not in ENVIRONMENT_OBJECTS and o.name not in MARKING_OBJECTS
                and o.visible_camera and not o.hide_render]
    changes = []
    for obj in retained:
        for modifier in obj.modifiers:
            if modifier.type == 'SUBSURF':
                # Dense wheel spokes and individual taillight bulbs already have
                # modeled curved geometry. Preserve one smoothing level on the
                # wheels and the source bulb mesh without multiplying hidden faces.
                level = min(modifier.render_levels, 2)
                if obj.name in {'Circle.001', 'Circle.003'}:
                    level = 1
                if obj.name == 'Cube.028':
                    level = 0
                if level != modifier.render_levels:
                    changes.append({'object': obj.name, 'sourceRenderSubdivision': modifier.render_levels,
                                    'exportSubdivision': level})
                modifier.levels = modifier.render_levels = level
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    measurements = []
    frozen = []
    # Build all evaluated copies before deleting objects: modifiers can refer to
    # other objects, and a raw bounding box rotated into world space overestimates
    # wheel bounds. Measure actual evaluated vertices instead.
    for obj in retained:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(evaluated, preserve_all_data_layers=True, depsgraph=depsgraph)
        mesh.transform(obj.matrix_world)
        # The source contains two loose vertices behind the car. They have no
        # faces and never render; remove all such unused vertices before bounds.
        bm = bmesh.new()
        bm.from_mesh(mesh)
        loose = [v for v in bm.verts if not v.link_faces]
        if loose:
            bmesh.ops.delete(bm, geom=loose, context='VERTS')
            bm.to_mesh(mesh)
        removed_loose = len(loose)
        bm.free()
        mesh.calc_loop_triangles()
        positions = [vertex.co for vertex in mesh.vertices]
        measurements.append({'name': obj.name, 'vertices': len(mesh.vertices),
                             'removedNonRenderingVertices': removed_loose,
                             'triangles': len(mesh.loop_triangles),
                             'min': [min(v[i] for v in positions) for i in range(3)],
                             'max': [max(v[i] for v in positions) for i in range(3)]})
        if obj.name in {'Circle.001', 'Circle.003'}:
            adjacency = [[] for _ in mesh.vertices]
            for edge in mesh.edges:
                a, b = edge.vertices
                adjacency[a].append(b)
                adjacency[b].append(a)
            unseen = set(range(len(mesh.vertices)))
            components = []
            while unseen:
                todo = [unseen.pop()]
                indices = []
                while todo:
                    index = todo.pop()
                    indices.append(index)
                    for neighbor in adjacency[index]:
                        if neighbor in unseen:
                            unseen.remove(neighbor)
                            todo.append(neighbor)
                coordinates = [mesh.vertices[i].co for i in indices]
                components.append({'vertices': len(indices),
                                   'min': [min(v[i] for v in coordinates) for i in range(3)],
                                   'max': [max(v[i] for v in coordinates) for i in range(3)]})
            write_json(INSPECTION / f'{obj.name}-components.json', components)
        frozen.append((obj.name, mesh))
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for name, mesh in frozen:
        obj = bpy.data.objects.new(name, mesh)
        scene.collection.objects.link(obj)
    write_json(INSPECTION / 'evaluated-geometry.json', {
        'objects': measurements, 'subdivisionChanges': changes,
        'removedMarkings': MARKING_OBJECTS,
        'removedEnvironment': sorted(ENVIRONMENT_OBJECTS),
        'removedCameraInvisibleHelper': 'Cube.004 (rear lettering deformation cage)',
    })
    return measurements, changes


def pbr_material(name, color, metallic=0, roughness=.4, coat=0, alpha=1, emission=None):
    material = bpy.data.materials.new(name + ' PBR')
    material.use_nodes = True
    node = material.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color, alpha)
    node.inputs['Metallic'].default_value = metallic
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Coat Weight'].default_value = coat
    node.inputs['Coat Roughness'].default_value = .14282864
    node.inputs['Alpha'].default_value = alpha
    if emission:
        node.inputs['Emission Color'].default_value = (*emission[0], 1)
        node.inputs['Emission Strength'].default_value = emission[1]
    if alpha < 1:
        material.surface_render_method = 'DITHERED'
    material.diffuse_color = (*color, alpha)
    return material


def prepare_materials():
    # These values translate the inspected creator shader colors and finish to
    # glTF's metallic/roughness model. Fresnel-mixed legacy Cycles paint cannot
    # transfer exactly; keep its green pigment and clear coat instead of dropping
    # every source shader to exporter-default white.
    specs = {
        'body': dict(color=(.15478794, .38852039, .11063433), metallic=.28, roughness=.28, coat=1),
        'blackside': dict(color=(.03310157,) * 3, metallic=.25, roughness=.37192366, coat=.3),
        'wheel rubber': dict(color=(.02166724,) * 3, roughness=.62),
        'brake': dict(color=(.08848069,) * 3, metallic=.85, roughness=.34716901),
        'brake bolt': dict(color=(.17687418,) * 3, metallic=.9, roughness=.34716901),
        'mirrir body': dict(color=(.02432159,) * 3, metallic=.3, roughness=.15491934, coat=.8),
        'mirrir body.001': dict(color=(.05496704,) * 3, metallic=.35, roughness=.1264911, coat=.8),
        'glass': dict(color=(.018, .025, .034), metallic=.3, roughness=.17, coat=1),
        'cover ': dict(color=(.48607406,) * 3, roughness=.21908903, coat=1, alpha=.12),
        'light box': dict(color=(.24619009,) * 3, metallic=.95, roughness=.08),
        'light line': dict(color=(.01884754,) * 3, metallic=.3, roughness=.52153617),
        'front light line': dict(color=(.61935914, .82996011, 1), roughness=.2,
                                emission=((.61935914, .82996011, 1), 3)),
        'head light': dict(color=(.8,) * 3, roughness=.16, emission=((.8,) * 3, 3)),
        'back light line': dict(color=(.55, .002, .004), roughness=.22,
                               emission=((1, 0, .00331329), .7)),
        'back light balls': dict(color=(.6, .004, .012), roughness=.2,
                                emission=((1, .01617468, .04320178), .55)),
        'Untitled': dict(color=(.03444321,) * 3, metallic=.75, roughness=.2),
    }
    converted = {name: pbr_material(name, **spec) for name, spec in specs.items()}
    mirror = pbr_material('Mirror face', (.8, .8, .8), metallic=1, roughness=.04)
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            if slot.material:
                name = slot.material.name
                if name not in converted:
                    raise RuntimeError(f'Unreviewed material on retained mesh: {obj.name}: {name}')
                slot.material = converted[name]
            elif obj.name == 'Circle.006':
                slot.material = mirror
            else:
                raise RuntimeError(f'Unexpected unassigned material: {obj.name}')
        if not obj.material_slots:
            raise RuntimeError(f'Retained mesh has no material: {obj.name}')
    for material in list(bpy.data.materials):
        if material.users == 0:
            bpy.data.materials.remove(material)
    # Packed images are source photographic modeling references and the removed
    # shield texture. None is used by the retained modeled car or converted PBR.
    for image in list(bpy.data.images):
        if image.name != 'Render Result':
            bpy.data.images.remove(image)
    for text in list(bpy.data.texts):
        bpy.data.texts.remove(text)
    return specs


def normalize_and_export(measurements, changes, specs):
    minimum = [min(o['min'][i] for o in measurements) for i in range(3)]
    maximum = [max(o['max'][i] for o in measurements) for i in range(3)]
    scale = 4.506 / (maximum[1] - minimum[1])
    center = Vector(((minimum[0] + maximum[0]) / 2,
                     (minimum[1] + maximum[1]) / 2, minimum[2]))
    transform = Matrix.Scale(scale, 4) @ Matrix.Translation(-center)
    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.data.transform(transform)
            obj.data.update()
            obj['sourceObject'] = obj.name
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    points = [vertex.co for obj in meshes for vertex in obj.data.vertices]
    normalized_min = [min(v[i] for v in points) for i in range(3)]
    normalized_max = [max(v[i] for v in points) for i in range(3)]
    dimensions = [normalized_max[i] - normalized_min[i] for i in range(3)]
    if abs(dimensions[1] - 4.506) > .00001 or abs(normalized_min[2]) > .00001:
        raise RuntimeError('Normalization verification failed.')
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.context.scene['attribution'] = 'Lamborghini Huracan Performante by George (georgezaky108), CC BY; https://blendswap.com/blend/20021'
    bpy.context.scene['modifications'] = 'Removed badges/lettering/studio helpers; converted legacy materials to PBR; normalized to 4.506 m; optimized redundant subdivisions.'
    editable = PROJECT / 'assets/vehicles/huracan-performante.blend'
    editable.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(editable), check_existing=False)
    destination = PROJECT / 'public/models/huracan-performante.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB',
                             use_selection=True, export_yup=True, export_animations=False,
                             export_cameras=False, export_lights=False, export_extras=True,
                             export_draco_mesh_compression_enable=True,
                             export_draco_mesh_compression_level=6,
                             export_draco_position_quantization=16,
                             export_draco_normal_quantization=12,
                             export_copyright=bpy.context.scene['attribution'])
    # Wheel meshes are supplied as four wheels within each component object;
    # record measured tire bounds for later articulation without claiming a rig.
    tire = bpy.data.objects['Circle']
    wheel_data = []
    for side in [1, -1]:
        for axle in [1, -1]:
            vertices = [v.co for v in tire.data.vertices
                        if v.co.x * side > 0 and v.co.y * axle > 0]
            lo = [min(v[i] for v in vertices) for i in range(3)]
            hi = [max(v[i] for v in vertices) for i in range(3)]
            c = [(lo[i] + hi[i]) / 2 for i in range(3)]
            wheel_data.append({'location': ('rear' if axle > 0 else 'front') + ('-left' if side > 0 else '-right'),
                               'centerMetres': [c[0], c[2], -c[1]],
                               'radiusMetres': (hi[2] - lo[2]) / 2})
    metadata = {
        'source': 'https://blenderartists.org/t/lamborghini-huracan-performante/692996',
        'licenseSource': 'https://blendswap.com/blend/20021',
        'author': 'George (georgezaky108)', 'license': 'CC BY (version unspecified in creator listing)',
        'sourceHash': EXPECTED_HASH, 'retrieved': '2026-09-11',
        'derivedHash': hashlib.sha256(destination.read_bytes()).hexdigest(),
        'outputBytes': destination.stat().st_size, 'blender': bpy.app.version_string,
        'axes': {'up': '+Y', 'forward': '+Z', 'evidence': 'Creator headlights lie at source -Y and tires at minimum source Z; Blender glTF Y-up conversion maps -Y to +Z.'},
        'dimensionsMetres': {'width': dimensions[0], 'length': dimensions[1], 'height': dimensions[2]},
        'boundsMetres': {'minimum': [normalized_min[0], normalized_min[2], -normalized_max[1]],
                         'maximum': [normalized_max[0], normalized_max[2], -normalized_min[1]]},
        'runtimeScale': 1, 'runtimeGroundOffset': 0,
        'sourceBounds': {'minimum': minimum, 'maximum': maximum},
        'normalizationScale': scale, 'normalizationSourceCenter': list(center),
        'activeTriangles': sum(o['triangles'] for o in measurements),
        'meshObjects': len(meshes), 'subdivisionChanges': changes,
        'removedMarkingObjects': MARKING_OBJECTS,
        'nonRenderingLooseVerticesRemoved': sum(o['removedNonRenderingVertices'] for o in measurements),
        'materialConversions': specs,
        'wheels': wheel_data,
        'wheelComponentNodes': ['Circle', 'Circle.001', 'Circle.002', 'Circle.003', 'Circle.005'],
        'wheelRig': 'None; each component node contains multiple wheels. Centers measured from actual tire vertices.',
        'interior': 'Exterior-only source; dark reflective cabin glass, no invented interior.',
        'materialLimits': 'Legacy view-dependent paint approximated by green PBR clear coat. Source procedural tire micro-bump is omitted; actual tread geometry retained. Lens covers use alpha blending; cabin glass is dark opaque reflective PBR as the exterior-only source appears.',
        'visualStatus': 'Original views inspected. Prepared GLB still needs front/rear/side/wheel visual review in Cesium.'
    }
    write_json(PROJECT / 'public/models/huracan-performante.metadata.json', metadata)
    write_json(STATUS, {'status': 'export-complete', 'output': str(destination),
                        'triangles': metadata['activeTriangles'], 'dimensions': metadata['dimensionsMetres']})
    return metadata


def create_preview(prefix):
    for obj in list(bpy.data.objects):
        if obj.name in ENVIRONMENT_OBJECTS and obj.type != 'CURVE':
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 960
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('Inspection studio')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.25, .3, .36, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .7
    for index, (location, power, size) in enumerate([
            ((-3, -4, 7), 1500, 5), ((5, 1, 5), 1000, 4), ((-4, 6, 5), 1300, 3)]):
        light = bpy.data.lights.new(f'Inspection light {index}', 'AREA')
        light.energy, light.shape, light.size = power, 'DISK', size
        obj = bpy.data.objects.new(light.name, light)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector((0, .2, .5)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    camera = bpy.data.cameras.new('Inspection camera')
    camera.type = 'ORTHO'
    camera.ortho_scale = 6.0 if prefix == 'prepared' else 8.0
    obj = bpy.data.objects.new(camera.name, camera)
    scene.collection.objects.link(obj)
    scene.camera = obj
    for label, location in [('front', (7, -10, 4)), ('rear', (-7, 10, 4)), ('side', (10, .2, 2))]:
        obj.location = location
        obj.rotation_euler = (Vector((0, .3, .5)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(INSPECTION / f'{prefix}-{label}.png')
        bpy.ops.render.render(write_still=True)
        write_json(STATUS, {'status': 'rendering', 'finished': label})


def main():
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != EXPECTED_HASH:
        raise RuntimeError('Original source hash does not match the inspected creator attachment.')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
    inspect_source()
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if 'render-original' in args:
        create_preview('original')
    if 'geometry' in args:
        prepare_geometry()
    if 'prepare' in args:
        measurements, changes = prepare_geometry()
        specs = prepare_materials()
        normalize_and_export(measurements, changes, specs)
        if 'render' in args:
            create_preview('prepared')
        write_json(STATUS, {'status': 'complete'})
        return
    write_json(STATUS, {'status': 'inspection-complete'})


try:
    main()
except Exception:
    write_json(STATUS, {'status': 'error', 'traceback': traceback.format_exc()})
    raise
