"""Render review views of an imported GLB without modifying its source file."""
import hashlib
from array import array
import json
import math
import os
from pathlib import Path
import struct
import sys
import threading
import time
import traceback

import bpy
from mathutils import Vector


def geometry_hash():
    result = hashlib.sha256()
    for obj in sorted((o for o in bpy.context.scene.objects if o.type == 'MESH'), key=lambda o: o.name):
        result.update(obj.name.encode())
        for vertex in obj.data.vertices:
            result.update(struct.pack('<3f', *vertex.co))
        for polygon in obj.data.polygons:
            result.update(struct.pack('<I', len(polygon.vertices)))
            result.update(struct.pack('<' + 'I' * len(polygon.vertices), *polygon.vertices))
        for row in obj.matrix_world:
            result.update(struct.pack('<4f', *row))
    return result.hexdigest()


def load(source):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    bpy.context.view_layer.update()
    points = []
    for obj in bpy.context.scene.objects:
        if obj.type == 'MESH':
            evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
            # Conservative bounds avoid altering evaluated skinned mesh data.
            # Framing is diagnostic, not a measured model-dimension claim.
            points.extend(evaluated.matrix_world @ Vector(corner) for corner in evaluated.bound_box)
    if not points:
        raise ValueError('Source contains no mesh geometry to preview.')
    low = Vector(tuple(min(p[axis] for p in points) for axis in range(3)))
    high = Vector(tuple(max(p[axis] for p in points) for axis in range(3)))
    center = (low + high) * .5
    extent = max(high - low)
    if not math.isfinite(extent) or extent <= 0:
        raise ValueError('Source bounds are invalid.')
    before = geometry_hash()
    # Cameras and illumination are review scaffolding; source geometry/materials stay intact.
    for obj in list(bpy.context.scene.objects):
        if obj.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.use_denoising = True
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('Workbench review lighting')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.085, .105, .13, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .65
    scene.view_settings.view_transform = 'AgX'
    for label, offset, power in [('Key', (2, -3, 3), 700), ('Fill', (-3, -1, 1), 450), ('Rim', (1, 3, 2), 650)]:
        lamp = bpy.data.lights.new(label, 'AREA')
        lamp.energy = power * extent * extent
        lamp.shape = 'DISK'
        lamp.size = extent * 2
        obj = bpy.data.objects.new(label, lamp)
        scene.collection.objects.link(obj)
        obj.location = center + Vector(offset) * extent
        obj.rotation_euler = (center - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('Review camera')
    camera = bpy.data.objects.new('Review camera', data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    data.type = 'ORTHO'
    data.ortho_scale = extent * 1.18
    data.clip_start = max(.0001, extent / 1000)
    data.clip_end = extent * 30
    return center, extent, before, list(high - low)


def nonblank_check(path):
    """Reject a nearly uniform render; this does not approve its appearance."""
    probe = bpy.data.images.load(path, check_existing=False)
    try:
        pixels = array('f', [0]) * len(probe.pixels)
        probe.pixels.foreach_get(pixels)
        stride = max(4, (len(pixels) // (4 * 4096)) * 4)
        luminance = [(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2])
                     for i in range(0, len(pixels) - 3, stride)]
        if not luminance:
            raise RuntimeError('Preview has no readable pixels.')
        span = max(luminance) - min(luminance)
        if span < .08:
            raise RuntimeError('Preview is nearly uniform; rejecting blank render before caching.')
        return {'sampled_luminance_range': span, 'visual_approval': False}
    finally:
        bpy.data.images.remove(probe)


def main(request):
    current = None
    directions = {'front': (0, -1, 0), 'back': (0, 1, 0), 'left': (-1, 0, 0), 'right': (1, 0, 0)}
    for item in request['steps']:
        started = time.perf_counter()
        if current != item['source']:
            center, extent, before, dimensions = load(item['source'])
            current = item['source']
        scene = bpy.context.scene
        scene.camera.location = center + Vector(directions[item['view']]) * extent * 4
        scene.camera.rotation_euler = (center - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
        scene.cycles.samples = item['samples']
        scene.render.resolution_x = scene.render.resolution_y = item['size']
        scene.render.resolution_percentage = 100
        scene.render.filepath = item['output']
        bpy.ops.render.render(write_still=True)
        pixels = nonblank_check(item['output'])
        after = geometry_hash()
        Path(item['receipt']).write_text(json.dumps({
            'blender_version': bpy.app.version_string, 'view': item['view'],
            'view_axes': 'Blender Z up; front is negative Y. Source orientation is not inferred.',
            'conservative_bounds_scene_units': dimensions, 'geometry_before': before, 'geometry_after': after,
            'bounds_limit': 'Camera-framing bounds; not a measurement of character height or replica accuracy.',
            'render_seconds_including_import_if_first': time.perf_counter() - started,
            'pixel_check': pixels,
            'source_saved': False, 'visual_approval': False,
            'limits': 'Static imported pose. No retargeting, animation authoring, identity fitting or replica claim.',
        }, indent=2), encoding='utf-8')
        if before != after:
            raise RuntimeError('Imported mesh geometry changed during preview.')


if __name__ == '__main__':
    request = json.loads(Path(sys.argv[sys.argv.index('--') + 1]).read_text(encoding='utf-8'))
    completion = Path(request['completion'])
    finished = threading.Event()

    def record(value):
        temporary = completion.with_suffix('.tmp')
        temporary.write_text(json.dumps(value), encoding='utf-8')
        temporary.replace(completion)

    def deadline():
        if not finished.wait(request['timeout_seconds']):
            record({'status': 'failed', 'error': 'Blender worker exceeded its local deadline.'})
            os._exit(124)

    threading.Thread(target=deadline, daemon=True).start()
    try:
        main(request)
        record({'status': 'complete', 'blender_version': bpy.app.version_string})
    except BaseException as exc:
        record({'status': 'failed', 'error': str(exc), 'traceback': traceback.format_exc()})
        raise
    finally:
        finished.set()
