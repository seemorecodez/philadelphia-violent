"""Author a review-only Run action on the existing detailed MakeHuman asset.

The geometry, source skin weights, packed materials, Idle and Walk are retained.
Run with Blender --background --factory-startup --disable-autoexec --python this-file.
Use -- render to also render contact, passing and flight inspection images.
"""
import hashlib
import json
import math
import struct
import sys
import traceback
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets/characters'
PUBLIC = ROOT / 'public/models/character'
INSPECTION = ASSETS / 'inspection/motion'
STATUS = ASSETS / 'human-motion-status.json'
SOURCE = ASSETS / 'human-adult.blend'


def record(path, data):
    path.write_text(json.dumps(data, indent=2), encoding='utf-8')


def pose_rotation(rig, name, rotation):
    # Same world-axis-to-rest-basis conversion as the existing source script.
    bone = rig.pose.bones[name]
    basis = rig.data.bones[name].matrix_local.to_quaternion()
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = basis.inverted() @ rotation @ basis


def rx(degrees):
    return Quaternion((1, 0, 0), math.radians(degrees))


def source_palm(rig, side):
    bones = rig.data.bones
    across = bones['finger2-1.' + side].head_local - bones['finger5-1.' + side].head_local
    forward = bones['finger3-1.' + side].tail_local - bones['wrist.' + side].head_local
    return across.cross(forward).normalized() * (-1 if side == 'L' else 1)


def orient_bone(rig, name, direction, palm_normal=None, source_normal=None):
    """Aim a limb along an authored world direction, compensating its parent."""
    bpy.context.view_layer.update()
    bone = rig.pose.bones[name]
    rest = rig.data.bones[name]
    basis = rest.matrix_local.to_quaternion()
    direction = direction.normalized()
    desired_delta = (rest.tail_local - rest.head_local).normalized().rotation_difference(direction)
    if palm_normal is not None:
        current = desired_delta @ source_normal
        current = (current - direction * current.dot(direction)).normalized()
        target = (palm_normal - direction * palm_normal.dot(direction)).normalized()
        twist = math.atan2(direction.dot(current.cross(target)), current.dot(target))
        desired_delta = Quaternion(direction, twist) @ desired_delta
    parent_delta = Quaternion()
    if bone.parent:
        parent_delta = bone.parent.matrix.to_quaternion() @ bone.parent.bone.matrix_local.to_quaternion().inverted()
    bone.rotation_quaternion = basis.inverted() @ parent_delta.inverted() @ desired_delta @ basis


def relaxed_fingers(rig, side):
    # The source skeleton contains three anatomical phalanges per finger.
    # Curl toward the source palm normal, retaining a loose hand rather than
    # intersecting the palm in a tightly closed fist.
    for number in range(2, 6):
        for segment, angle in [(1, 40), (2, 50), (3, 30)]:
            name = f'finger{number}-{segment}.{side}'
            bone = rig.data.bones[name]
            # Determine the curl axis from the finger direction and the
            # forward-facing source palm plane in the original A pose.
            axis = (bone.tail_local - bone.head_local).normalized().cross(source_palm(rig, side))
            if axis.length > 1e-6:
                pose_rotation(rig, name, Quaternion(axis.normalized(), math.radians(angle)))


def shoe_vertices(shoes):
    bpy.context.view_layer.update()
    evaluated = shoes.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    return points


def action_curves(action):
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                yield from bag.fcurves


def author_run(rig, shoes):
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start, scene.frame_end = 1, 21
    action = bpy.data.actions.new('Run')
    action.use_fake_user = True
    rig.animation_data.action = action
    # Each key is (left hip/knee/foot pitch, right hip/knee/foot pitch,
    # body lean, shoulder twist, flight clearance). Blender front is -Y.
    # Contact -> recoil -> passing -> push -> flight -> opposite contact.
    half = [
        (-35, 25, 0,   35, 80, 30,  18, -5, 0),
        (-22, 55, 0,   20, 110, 25, 20, -3, 0),
        (0, 35, 0,     -30, 110, 10, 18, 0, 0),
        (28, 15, 28,   -55, 75, 0,  16, 4, 0),
        (30, 85, 30,   -45, 35, -5, 15, 5, .055),
    ]
    poses = half + [(rh, rk, rf, lh, lk, lf, lean, -twist, lift)
                    for lh, lk, lf, rh, rk, rf, lean, twist, lift in half] + [half[0]]
    metrics = []
    for frame in range(1, 22):
        scene.frame_set(frame)
        index = (frame - 1) / 2
        lo = int(index)
        fraction = index - lo
        # Smooth key-pose interpolation, then bake at 30 Hz for glTF.
        fraction = fraction * fraction * (3 - 2 * fraction)
        values = poses[lo] if lo == 10 else [a + (b - a) * fraction for a, b in zip(poses[lo], poses[lo + 1])]
        lh, lk, lf, rh, rk, rf, lean, twist, lift = values
        for bone in rig.pose.bones:
            bone.rotation_mode = 'QUATERNION'
            bone.rotation_quaternion = Quaternion()
            bone.location = (0, 0, 0)
        pose_rotation(rig, 'spine05', rx(lean * .45))
        pose_rotation(rig, 'spine03', rx(lean * .35))
        pose_rotation(rig, 'spine01', rx(lean * .2) @ Quaternion((0, 0, 1), math.radians(twist)))
        pose_rotation(rig, 'neck01', rx(-lean * .55))
        pose_rotation(rig, 'neck03', rx(-lean * .35))
        for side, hip, knee, foot in [('L', lh, lk, lf), ('R', rh, rk, rf)]:
            sign = 1 if side == 'L' else -1
            pose_rotation(rig, 'upperleg01.' + side, rx(hip))
            pose_rotation(rig, 'lowerleg01.' + side, rx(knee))
            pose_rotation(rig, 'foot.' + side, rx(-hip - knee + foot))
            # Opposite arm drives the forward knee. Relaxed elbows retain a
            # flexed silhouette instead of the almost-straight walk arms.
            swing = -hip * .65
            angle = math.radians(swing)
            orient_bone(rig, 'upperarm01.' + side,
                        Vector((.07 * sign, math.sin(angle), -math.cos(angle))))
            forearm = math.radians(swing - 82)
            orient_bone(rig, 'lowerarm01.' + side,
                        Vector((.035 * sign, math.sin(forearm), -math.cos(forearm))),
                        Vector((-sign, 0, 0)), source_palm(rig, side))
            orient_bone(rig, 'wrist.' + side,
                        Vector((.035 * sign, math.sin(forearm), -math.cos(forearm))),
                        Vector((-sign, 0, 0)), source_palm(rig, side))
            relaxed_fingers(rig, side)
        rig.location = (0, 0, 0)
        points = shoe_vertices(shoes)
        rig.location.z = .010 + lift - min(point.z for point in points)
        rig.keyframe_insert('location', frame=frame, group='Ground contact and flight')
        for bone in rig.pose.bones:
            bone.keyframe_insert('rotation_quaternion', frame=frame, group=bone.name)
        points = shoe_vertices(shoes)
        feet = {}
        for side, sign in [('L', 1), ('R', -1)]:
            vertices = [p for p in points if p.x * sign > 0]
            floor = min(p.z for p in vertices)
            contact = [p for p in vertices if p.z < floor + .012]
            feet[side] = {'lowestZ': floor, 'contactY': sum(p.y for p in contact) / len(contact)}
        metrics.append({'frame': frame, 'time': (frame - 1) / 30, 'flightClearance': lift,
                        'rootZ': rig.location.z, 'feet': feet})
    # During flight keep the pelvis on an upward arc between the preceding
    # toe-off and next contact, rather than pulling the body downward merely
    # because both knees lifted the shoes. This makes the flight actual body
    # motion, instead of a raised-foot pose with a sinking center of mass.
    for start, end in [(7, 11), (17, 21)]:
        start_z, end_z = metrics[start - 1]['rootZ'], metrics[end - 1]['rootZ']
        for frame in range(start + 1, end):
            scene.frame_set(frame)
            phase = (frame - start) / (end - start)
            rig.location.z = start_z + (end_z - start_z) * phase + .035 * math.sin(math.pi * phase)
            lowest = min(p.z for p in shoe_vertices(shoes))
            if lowest < .010:
                rig.location.z += .010 - lowest
            rig.keyframe_insert('location', frame=frame, group='Ground contact and flight')
    for curve in action_curves(action):
        for point in curve.keyframe_points:
            point.interpolation = 'LINEAR'
    for row in metrics:
        scene.frame_set(row['frame'])
        row['rootZ'] = rig.location.z
        points = shoe_vertices(shoes)
        row['minimumSoleClearance'] = min(p.z for p in points)
        row.pop('flightClearance')
        for side, sign in [('L', 1), ('R', -1)]:
            vertices = [p for p in points if p.x * sign > 0]
            floor = min(p.z for p in vertices)
            contact = [p for p in vertices if p.z < floor + .012]
            row['feet'][side] = {'lowestZ': floor, 'contactY': sum(p.y for p in contact) / len(contact)}
    # Validate the actual skinned sole at 120 Hz, including between baked keys.
    minimum = float('inf')
    minimum_frame = None
    for quarter in range(81):
        frame = 1 + quarter / 4
        scene.frame_set(int(frame), subframe=frame % 1)
        floor = min(p.z for p in shoe_vertices(shoes))
        if floor < minimum:
            minimum, minimum_frame = floor, frame
    if minimum < 0:
        raise RuntimeError(f'Run sole crosses ground by {-minimum:.4f} m at frame {minimum_frame}')
    track = rig.animation_data.nla_tracks.new()
    track.name = 'Run'
    track.strips.new('Run', 1, action)
    track.mute = True
    # Contact-to-toe-off movement provides a measured cadence estimate only:
    # in-place FK does not lock a particular sole patch through its stance.
    stance_distance = metrics[6]['feet']['L']['contactY'] - metrics[0]['feet']['L']['contactY']
    return action, {'sampleHz': 120, 'minimumSoleZ': minimum, 'minimumSoleFrame': minimum_frame,
                    'frames': metrics, 'durationSeconds': 20 / 30,
                    'stanceContactYTravelMetres': stance_distance,
                    'estimatedStrideMetres': stance_distance / .3,
                    'strideEstimateLimit': 'Contact samples select the lowest sole patch; heel-to-toe roll and FK variation mean this is a cadence estimate, not exact foot locking.'}


def measure_walk(rig, shoes):
    rig.animation_data.action = bpy.data.actions['Walk']
    frames = []
    for frame in range(1, 34):
        bpy.context.scene.frame_set(frame)
        points = shoe_vertices(shoes)
        feet = {}
        for side, sign in [('L', 1), ('R', -1)]:
            vertices = [p for p in points if p.x * sign > 0]
            floor = min(p.z for p in vertices)
            contact = [p for p in vertices if p.z < floor + .012]
            feet[side] = {'lowestZ': floor, 'contactY': sum(p.y for p in contact) / len(contact)}
        frames.append({'frame': frame, 'time': (frame - 1) / 30, 'feet': feet})
    travel = frames[16]['feet']['L']['contactY'] - frames[0]['feet']['L']['contactY']
    return {'durationSeconds': 32 / 30, 'frames': frames,
            'leftContactToOppositeContactTravelMetres': travel,
            'estimatedStrideMetres': travel * 2,
            'limit': 'Original FK Walk and changing lowest sole patch; approximate cadence estimate, not exact planted-foot motion.'}


def patch_alpha(destination):
    contents = destination.read_bytes()
    length = struct.unpack_from('<I', contents, 12)[0]
    data = json.loads(contents[20:20 + length])
    for material in data.get('materials', []):
        if material.get('name') in {'Human short hair', 'Human eyebrows', 'Human eyelashes'}:
            material['alphaMode'], material['alphaCutoff'], material['doubleSided'] = 'MASK', .4, True
    encoded = json.dumps(data, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * ((-len(encoded)) % 4)
    tail = contents[20 + length:]
    destination.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(tail))
                            + struct.pack('<I4s', len(encoded), b'JSON') + encoded + tail)
    return data


def render_preview(rig, action):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 2
    scene.cycles.samples = 12
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 640, 800
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Run inspection world')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (.22, .25, .3, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = .55
    for index, position in enumerate([(3, -4, 5), (-3, -2, 3), (1, 4, 4)]):
        light = bpy.data.lights.new(f'Run inspection light {index}', 'AREA')
        light.energy, light.shape, light.size = 300, 'DISK', 3
        obj = bpy.data.objects.new(light.name, light)
        scene.collection.objects.link(obj)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, 1)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.mesh.primitive_plane_add(size=200)
    floor = bpy.context.object
    floor.name = 'Inspection only ground'
    floor.location.z = -.003
    mat = bpy.data.materials.new('Inspection floor')
    mat.diffuse_color = (.14, .16, .18, 1)
    floor.data.materials.append(mat)
    camera = bpy.data.cameras.new('Run inspection camera')
    camera.type, camera.ortho_scale = 'ORTHO', 2.2
    obj = bpy.data.objects.new(camera.name, camera)
    scene.collection.objects.link(obj)
    scene.camera = obj
    rig.animation_data.action = action
    for label, frame, position in [('contact', 1, (4, -.5, 1.7)),
                                    ('recoil', 3, (4, -.5, 1.7)),
                                    ('passing', 5, (4, -.5, 1.7)),
                                    ('push', 7, (4, -.5, 1.7)),
                                    ('flight', 9, (4, -.5, 1.7)),
                                    ('front-contact', 1, (0, -5, 1.5))]:
        scene.frame_set(frame)
        obj.location = position
        obj.rotation_euler = (Vector((0, 0, .9)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = str(INSPECTION / f'run-{label}.png')
        bpy.ops.render.render(write_still=True)
        record(STATUS, {'status': 'rendering', 'finished': label})


def main():
    INSPECTION.mkdir(parents=True, exist_ok=True)
    record(STATUS, {'status': 'loading'})
    original_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False)
    rig, shoes = bpy.data.objects['HumanRig'], bpy.data.objects['Human leather shoes']
    if 'inspect' in sys.argv:
        record(INSPECTION / 'source-hand-bones.json', {
            bone.name: {'head': list(bone.head_local), 'tail': list(bone.tail_local)}
            for bone in rig.data.bones if bone.name.startswith(('finger', 'wrist', 'lowerarm'))})
        return
    original_actions = [a.name for a in bpy.data.actions]
    if set(original_actions) != {'Idle', 'Walk'}:
        raise RuntimeError(f'Expected unchanged original Idle and Walk, found {original_actions}')
    action, measurements = author_run(rig, shoes)
    record(INSPECTION / 'run-measurements.json', measurements)
    walk = measure_walk(rig, shoes)
    record(INSPECTION / 'walk-measurements.json', walk)
    rig.animation_data.action = bpy.data.actions['Idle']
    bpy.context.scene.frame_set(1)
    bpy.context.scene['motionCandidate'] = 'Authored Run extension; isolated for review. Existing Idle and Walk retained.'
    for obj in bpy.context.scene.objects:
        obj.select_set(obj.type in {'ARMATURE', 'MESH'})
    bpy.context.view_layer.objects.active = rig
    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / 'human-motion.blend'), check_existing=False)
    destination = PUBLIC / 'human-motion.glb'
    bpy.ops.export_scene.gltf(filepath=str(destination), export_format='GLB', use_selection=True,
                             export_yup=True, export_animations=True, export_animation_mode='ACTIONS',
                             export_frame_range=False, export_force_sampling=True,
                             export_cameras=False, export_lights=False, export_extras=True,
                             export_copyright='MakeHuman Community system assets, CC0 1.0 Universal; authored Run by SeemoreCodez')
    gltf = patch_alpha(destination)
    names = [a['name'] for a in gltf.get('animations', [])]
    if set(names) != {'Idle', 'Walk', 'Run'}:
        raise RuntimeError(f'Unexpected exported actions: {names}')
    metadata = {'sourceBlend': str(SOURCE.relative_to(ROOT)), 'sourceBlendSha256': original_hash,
                'sourceLicense': 'CC0-1.0 MakeHuman system assets', 'authoredAnimationLicense': 'MIT SeemoreCodez',
                'animations': names, 'outputBytes': destination.stat().st_size,
                'derivedSha256': hashlib.sha256(destination.read_bytes()).hexdigest(),
                'preserved': 'Same anatomical mesh, source skin weights, packed skin/clothes/eye materials, alpha-masked hair, Idle and Walk.',
                'runDurationSeconds': measurements['durationSeconds'],
                'runStrideEstimateMetres': measurements['estimatedStrideMetres'],
                'walkStrideEstimateMetres': walk['estimatedStrideMetres'],
                'minimumRunSoleZ': measurements['minimumSoleZ'],
                'contactValidation': 'Actual deformed shoe mesh sampled every 1/120 second for a complete Run cycle.',
                'limits': 'Authored in-place FK cycle, not motion capture. No foot IK, turning, start/stop or slope adaptation. Requires visual review and live-game cadence/transition testing; not AAA acceptance.',
                'status': 'candidate awaiting visual review'}
    record(PUBLIC / 'human-motion.metadata.json', metadata)
    record(STATUS, {'status': 'export-complete', **metadata})
    if '--' in sys.argv and 'render' in sys.argv[sys.argv.index('--') + 1:]:
        render_preview(rig, action)
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != original_hash:
        raise RuntimeError('Original source blend changed unexpectedly')
    record(STATUS, {**metadata, 'status': 'complete'})


try:
    main()
except Exception:
    record(STATUS, {'status': 'error', 'traceback': traceback.format_exc()})
    raise
