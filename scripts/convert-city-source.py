"""Convert the inspected original PASDA COLLADA/KML/JPEG format to GLB.

Pure Python, no downloads or source edits. Triangle order, source corner normals,
UV mapping, metre positions, and embedded JPEG bytes are verified by reading the
finished GLB back. Supports one untransformed Z-up metre mesh with triangles and
diffuse image/color materials; unsupported source constructs fail explicitly.

Run: py -3.11 scripts/convert-city-source.py
Verify existing output: add --validate-only
Optional Blender visual check: Blender --background --factory-startup --python
this_file.py -- --render-check (imports the GLB, not the source COLLADA).
"""
import argparse
import hashlib
import json
import math
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / 'artifacts/city-source-audit/sample-philly-0000'
DEFAULT_OUTPUT = ROOT / 'public/models/city/philly-0000.glb'
SOURCE_URL = 'https://www.pasda.psu.edu/download/philacity/data/3D_Models/2010/'
TERMS_URL = 'https://www.pasda.psu.edu/uci/FullMetadataDisplay.aspx?file=Philadelphia_Building_3DModels.xml'


def check(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def jpeg_dimensions(data):
    check(data[:2] == b'\xff\xd8', 'Original image is not a JPEG.')
    cursor = 2
    while cursor < len(data):
        check(data[cursor] == 255, 'Invalid original JPEG marker.')
        while data[cursor] == 255:
            cursor += 1
        marker = data[cursor]; cursor += 1
        if marker in (0xD9, 0xDA):
            break
        length = struct.unpack_from('>H', data, cursor)[0]
        check(length >= 2 and cursor + length <= len(data), 'Invalid JPEG segment length.')
        if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
            height, width = struct.unpack_from('>HH', data, cursor + 3)
            return [width, height]
        cursor += length
    raise ValueError('No JPEG frame dimensions found.')


def xml(path):
    root = ET.parse(path).getroot()
    for element in root.iter():
        element.tag = element.tag.split('}')[-1]
    return root


def xyz_to_gltf(p):
    return (p[0], p[2], -p[1])


def xyz_to_source(p):
    return (p[0], -p[2], p[1])


def load_source(folder):
    folder = folder.resolve()
    dae_files = sorted(folder.glob('*.dae'))
    check(len(dae_files) == 1, 'Expected exactly one source COLLADA file.')
    dae = dae_files[0]
    kml = dae.with_suffix('.kml')
    root = xml(dae)
    check(root.find('asset/unit').get('meter') == '1' and root.findtext('asset/up_axis') == 'Z_UP',
          'Only source metres and Z_UP are supported.')
    nodes = root.findall('library_visual_scenes/visual_scene/node')
    check(len(nodes) == 1 and len(list(nodes[0])) == 1 and nodes[0][0].tag == 'instance_geometry',
          'Expected one untransformed mesh node, with no nested nodes.')
    check(root.find('library_animations') is None and root.find('library_controllers') is None,
          'Animated/skinned source data is outside this converter.')
    meshes = root.findall('library_geometries/geometry')
    check(len(meshes) == 1 and nodes[0][0].get('url') == '#' + meshes[0].get('id'), 'Unexpected geometry binding.')
    mesh = meshes[0].find('mesh')
    check(all(n.tag in ('source', 'vertices', 'triangles') for n in mesh), 'Unsupported non-triangle geometry.')
    sources = {}
    for source in mesh.findall('source'):
        values = [float(v) for v in source.findtext('float_array').split()]
        accessor = source.find('technique_common/accessor')
        stride = int(accessor.get('stride'))
        check(accessor.get('offset', '0') == '0' and len(values) == int(accessor.get('count')) * stride,
              'Unsupported source accessor offset/count.')
        check(all(math.isfinite(v) for v in values), 'Nonfinite source geometry.')
        sources[source.get('id')] = [tuple(values[i:i + stride]) for i in range(0, len(values), stride)]
    vertices = mesh.find('vertices')
    check(len(list(vertices)) == 1 and vertices[0].get('semantic') == 'POSITION', 'Unsupported vertex source.')
    positions = sources[vertices[0].get('source')[1:]]
    check(all(len(p) == 3 for p in positions), 'Expected XYZ positions.')
    images = {n.get('id'): n.findtext('init_from') for n in root.findall('library_images/image')}
    effects = {n.get('id'): n for n in root.findall('library_effects/effect')}
    material_targets = {n.get('symbol'): n.get('target')[1:]
                        for n in nodes[0].findall('instance_geometry/bind_material/technique_common/instance_material')}
    materials = {n.get('id'): n for n in root.findall('library_materials/material')}
    groups = []
    for group in mesh.findall('triangles'):
        inputs = {n.get('semantic'): (int(n.get('offset')), n.get('source')[1:]) for n in group.findall('input')}
        check(set(inputs) in ({'VERTEX', 'NORMAL'}, {'VERTEX', 'NORMAL', 'TEXCOORD'}), 'Unsupported triangle attributes.')
        check(inputs['VERTEX'][1] == vertices.get('id'), 'Unexpected triangle vertex binding.')
        stride = max(offset for offset, _ in inputs.values()) + 1
        indices = [int(v) for v in group.findtext('p').split()]
        check(len(indices) == int(group.get('count')) * 3 * stride, 'Triangle count does not match source indices.')
        material_id = material_targets[group.get('material')]
        effect = effects[materials[material_id].find('instance_effect').get('url')[1:]]
        diffuse = effect.find('profile_COMMON/technique/phong/diffuse')
        check(diffuse is not None and len(list(diffuse)) == 1, 'Expected a single diffuse source material.')
        texture = diffuse.find('texture')
        if texture is not None:
            sampler = next(n for n in effect.findall('.//newparam') if n.get('sid') == texture.get('texture'))
            surface = next(n for n in effect.findall('.//newparam') if n.get('sid') == sampler.findtext('sampler2D/source'))
            image_path = (folder / images[surface.findtext('surface/init_from')]).resolve()
            check(image_path.is_relative_to(folder.resolve()) and image_path.suffix.lower() in ('.jpg', '.jpeg'),
                  'Expected an original JPEG inside the source folder.')
            check('TEXCOORD' in inputs, 'Textured material has no source UVs.')
            appearance = {'image': image_path, 'color': None}
        else:
            color = [float(v) for v in diffuse.findtext('color').split()]
            check(len(color) == 4 and all(0 <= v <= 1 for v in color), 'Invalid source diffuse color.')
            appearance = {'image': None, 'color': color}
        corners = []
        for start in range(0, len(indices), stride):
            row = indices[start:start + stride]
            p = positions[row[inputs['VERTEX'][0]]]
            n = sources[inputs['NORMAL'][1]][row[inputs['NORMAL'][0]]]
            check(len(n) == 3 and abs(math.sqrt(sum(v * v for v in n)) - 1) < 0.0001,
                  'Source normal is not unit length within source precision.')
            uv = sources[inputs['TEXCOORD'][1]][row[inputs['TEXCOORD'][0]]] if 'TEXCOORD' in inputs else None
            check(uv is None or len(uv) == 2, 'Expected two source UV components.')
            corners.append((p, n, uv))
        groups.append({'material': material_id, 'corners': corners, **appearance})
    placement = xml(kml).find('.//Model')
    check(placement is not None and placement.findtext('Link/href') == dae.name, 'KML model link mismatch.')
    orientation = {k: float(placement.findtext('Orientation/' + k)) for k in ('heading', 'tilt', 'roll')}
    scale = {k: float(placement.findtext('Scale/' + k)) for k in ('x', 'y', 'z')}
    check(all(v == 0 for v in orientation.values()) and all(v == 1 for v in scale.values()),
          'This converter requires original zero KML orientation and unit scale.')
    check(placement.findtext('altitudeMode') == 'clampToGround', 'Unsupported source KML altitude mode.')
    location = {k: float(placement.findtext('Location/' + k)) for k in ('longitude', 'latitude', 'altitude')}
    inputs = {dae, kml, *(group['image'] for group in groups if group['image'])}
    return {'name': dae.stem, 'positions': positions, 'groups': groups,
            'placement': {**location, 'altitudeMode': 'clampToGround', 'orientation': orientation, 'scale': scale},
            'hashes': {str(p.relative_to(folder)).replace('\\', '/'): sha(p.read_bytes()) for p in sorted(inputs)},
            'created': root.findtext('asset/created'), 'author': root.findtext('asset/contributor/author')}


def convert(source, source_uv_origin='top-left'):
    check(source_uv_origin in ('top-left', 'bottom-left'), 'Unknown source UV origin')
    uv_mapping = '(u,v) -> (u,v)' if source_uv_origin == 'top-left' else '(u,v) -> (u,1-v)'
    data = bytearray()
    doc = {'asset': {'version': '2.0', 'generator': 'SeemoreCodez original COLLADA preservation converter'},
           'extensionsUsed': ['KHR_materials_unlit'], 'extensionsRequired': ['KHR_materials_unlit'],
           'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'name': source['name'], 'mesh': 0}],
           'meshes': [{'name': source['name'], 'primitives': []}], 'materials': [], 'images': [], 'textures': [],
           'samplers': [{'magFilter': 9729, 'minFilter': 9729, 'wrapS': 10497, 'wrapT': 10497}],
           'bufferViews': [], 'accessors': [],
           'extras': {'sourcePlacement': source['placement'], 'sourceHashesSha256': source['hashes'],
                      'sourceToGltf': '(x,y,z) -> (x,z,-y); UV ' + uv_mapping,
                      'sourceUVOrigin': source_uv_origin,
                      'cesiumAxes': {'upAxis': 'Y', 'forwardAxis': 'X'},
                      'status': 'Original historical source, not cleaned or reconstructed',
                      'sourceTerms': TERMS_URL}}

    def view(payload, target=None):
        data.extend(b'\0' * (-len(data) % 4))
        entry = {'buffer': 0, 'byteOffset': len(data), 'byteLength': len(payload)}
        if target is not None:
            entry['target'] = target
        doc['bufferViews'].append(entry)
        data.extend(payload)
        return len(doc['bufferViews']) - 1

    def accessor(rows, kind, component=5126, target=34962):
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[kind]
        flattened = [v for row in rows for v in row]
        code = {5126: 'f', 5123: 'H', 5125: 'I'}[component]
        payload = struct.pack('<' + code * len(flattened), *flattened)
        rounded = list(struct.unpack('<' + code * len(flattened), payload))
        doc['accessors'].append({'bufferView': view(payload, target), 'componentType': component,
                                 'count': len(rows), 'type': kind,
                                 'min': [min(rounded[i::width]) for i in range(width)],
                                 'max': [max(rounded[i::width]) for i in range(width)]})
        return len(doc['accessors']) - 1

    image_indices = {}
    for group in source['groups']:
        material = {'name': group['material'], 'doubleSided': True,
                    'extensions': {'KHR_materials_unlit': {}},
                    'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 1}}
        if group['image']:
            if group['image'] not in image_indices:
                index = len(doc['images']); image_indices[group['image']] = index
                doc['images'].append({'name': group['image'].name, 'mimeType': 'image/jpeg',
                                      'bufferView': view(group['image'].read_bytes())})
                doc['textures'].append({'sampler': 0, 'source': index})
            material['pbrMetallicRoughness']['baseColorTexture'] = {'index': image_indices[group['image']], 'texCoord': 0}
        else:
            material['pbrMetallicRoughness']['baseColorFactor'] = group['color']
        doc['materials'].append(material)
        vertices = []; indices = []; seen = {}
        for corner in group['corners']:
            if corner not in seen:
                seen[corner] = len(vertices); vertices.append(corner)
            indices.append((seen[corner],))
        attributes = {'POSITION': accessor([xyz_to_gltf(p) for p, _, _ in vertices], 'VEC3'),
                      'NORMAL': accessor([xyz_to_gltf(n) for _, n, _ in vertices], 'VEC3')}
        if group['image']:
            attributes['TEXCOORD_0'] = accessor([(uv[0], uv[1] if source_uv_origin == 'top-left' else 1-uv[1]) for _, _, uv in vertices], 'VEC2')
        doc['meshes'][0]['primitives'].append({'attributes': attributes, 'mode': 4,
                                              'material': len(doc['materials']) - 1,
                                              'indices': accessor(indices, 'SCALAR', 5123 if len(vertices) <= 65536 else 5125, 34963)})
    doc['buffers'] = [{'byteLength': len(data)}]
    encoded = json.dumps(doc, separators=(',', ':'), ensure_ascii=True).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    data.extend(b'\0' * (-len(data) % 4))
    length = 12 + 8 + len(encoded) + 8 + len(data)
    return struct.pack('<4sII', b'glTF', 2, length) + struct.pack('<I4s', len(encoded), b'JSON') + encoded \
        + struct.pack('<I4s', len(data), b'BIN\0') + data


def verify(payload, source, source_uv_origin='top-left'):
    check(source_uv_origin in ('top-left', 'bottom-left'), 'Unknown source UV origin')
    magic, version, length = struct.unpack_from('<4sII', payload)
    check(magic == b'glTF' and version == 2 and length == len(payload), 'Invalid GLB header.')
    json_length, json_kind = struct.unpack_from('<I4s', payload, 12)
    check(json_kind == b'JSON', 'Missing GLB JSON chunk.')
    doc = json.loads(payload[20:20 + json_length])
    bin_length, bin_kind = struct.unpack_from('<I4s', payload, 20 + json_length)
    check(bin_kind == b'BIN\0', 'Missing binary chunk.')
    binary = payload[28 + json_length:]
    check(len(binary) == bin_length and len(binary) - doc['buffers'][0]['byteLength'] in range(4), 'Invalid buffer length.')

    def read_accessor(index):
        acc = doc['accessors'][index]; bv = doc['bufferViews'][acc['bufferView']]
        width = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[acc['type']]
        code = {5126: 'f', 5123: 'H', 5125: 'I'}[acc['componentType']]
        start = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        check(start % 4 == 0, 'Accessor alignment error.')
        values = struct.unpack_from('<' + code * acc['count'] * width, binary, start)
        return list(zip(*[iter(values)] * width))

    errors = {'position_metres': 0, 'normal_components': 0, 'uv_components': 0}
    primitive_counts = []; embedded_images = []
    primitives = doc['meshes'][0]['primitives']
    check(len(primitives) == len(source['groups']), 'Source material groups changed.')
    for primitive, group in zip(primitives, source['groups']):
        attributes = {key: read_accessor(index) for key, index in primitive['attributes'].items()}
        indices = read_accessor(primitive['indices'])
        check(len(indices) == len(group['corners']) and primitive['mode'] == 4, 'Triangle order/count changed.')
        for (index,), (p, n, uv) in zip(indices, group['corners']):
            for key, source_value, output in [('position_metres', p, xyz_to_source(attributes['POSITION'][index])),
                                              ('normal_components', n, xyz_to_source(attributes['NORMAL'][index]))]:
                errors[key] = max(errors[key], *(abs(a - b) for a, b in zip(source_value, output)))
            if group['image']:
                mapped = attributes['TEXCOORD_0'][index]
                recovered_v = mapped[1] if source_uv_origin == 'top-left' else 1-mapped[1]
                errors['uv_components'] = max(errors['uv_components'], abs(uv[0] - mapped[0]), abs(uv[1] - recovered_v))
        material = doc['materials'][primitive['material']]['pbrMetallicRoughness']
        if group['image']:
            image = doc['images'][doc['textures'][material['baseColorTexture']['index']]['source']]
            bv = doc['bufferViews'][image['bufferView']]
            image_bytes = binary[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]
            check(image_bytes == group['image'].read_bytes(), 'Original JPEG bytes changed.')
            embedded_images.append({'name': image['name'], 'bytes': len(image_bytes),
                                    'dimensions_pixels': jpeg_dimensions(image_bytes), 'sha256': sha(image_bytes)})
        else:
            check(material['baseColorFactor'] == group['color'], 'Original diffuse color changed.')
        primitive_counts.append({'material': group['material'], 'triangles': len(indices) // 3,
                                 'gltf_attribute_vertices': len(attributes['POSITION'])})
    check(errors['position_metres'] < 1e-5 and errors['normal_components'] < 1e-6 and errors['uv_components'] < 1e-6,
          'Conversion changed source attributes beyond float32 storage precision.')
    check(doc['extras']['sourcePlacement'] == source['placement'], 'KML placement changed.')
    minimum = [min(p[i] for p in source['positions']) for i in range(3)]
    maximum = [max(p[i] for p in source['positions']) for i in range(3)]
    return {'status': 'verified original-source conversion; visual integration and identity remain unverified',
            'source_directory_url': SOURCE_URL, 'source_terms_url': TERMS_URL,
            'source_terms_note': 'Original City/PASDA data terms remain applicable; application MIT license does not relicense photographs.',
            'source_created': source['created'], 'source_author': source['author'],
            'source_files_sha256': source['hashes'], 'output_bytes': len(payload), 'output_sha256': sha(payload),
            'source_position_entries': len(source['positions']), 'triangles': sum(g['triangles'] for g in primitive_counts),
            'primitives': primitive_counts, 'source_bounds_xyz_metres': {'min': minimum, 'max': maximum},
            'dimensions_xyz_metres': [hi - lo for lo, hi in zip(minimum, maximum)],
            'max_roundoff': errors, 'triangle_corner_order_preserved': True, 'embedded_images': embedded_images,
            'source_placement': source['placement'],
            'placement_contract': {'glb_up_axis': 'Y', 'cesium_upAxis': 'Axis.Y', 'cesium_forwardAxis': 'Axis.X',
                                   'matrix': 'Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(source longitude, source latitude, loaded terrain height))',
                                   'scale': 1, 'recentered': False, 'absolute_elevation_verified': False,
                                   'source_to_gltf': '(x,y,z) -> (x,z,-y)',
                                   'cesium_axis_recovery': '(x,z,-y) -> (x,y,z), preserving source east/north/up',
                                   'source_uv_origin': source_uv_origin,
                                   'uv_conversion': '(u,v) -> (u,v)' if source_uv_origin == 'top-left' else '(u,v) -> (u,1-v)'},
            'material_note': 'Original diffuse photograph/color shown unlit and double-sided for reference, matching the existing source inspection; not de-lit or production PBR.',
            'limitations': ['Historical source; building identity and present-day condition unverified',
                            'Original baked vehicles, vegetation, shadows and stretched/occluded facade pixels retained',
                            'No added geometry, cleanup, decimation, normal recomputation or image recompression',
                            'Unified glTF indices duplicate source positions at normal/UV seams without changing triangles']}


def render_check(output):
    import bpy
    from mathutils import Vector
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(output))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 8
    scene.render.resolution_x = 1200; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'; scene.world.color = (.055, .065, .08)
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0; scene.view_settings.gamma = 1
    camera_data = bpy.data.cameras.new('Original-reference comparison camera')
    camera = bpy.data.objects.new('Original-reference comparison camera', camera_data)
    scene.collection.objects.link(camera); camera.location = (135, -145, 108)
    camera.rotation_euler = (Vector((0, 0, 13)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera_data.type = 'ORTHO'; camera_data.ortho_scale = 145; camera_data.clip_end = 1000; scene.camera = camera
    scene.render.filepath = str(output.with_name(output.stem + '-glb-review.png'))
    bpy.ops.render.render(write_still=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=DEFAULT_SOURCE)
    parser.add_argument('--out', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--render-check', action='store_true')
    parser.add_argument('--source-uv-origin', choices=('top-left', 'bottom-left'), default='top-left',
                        help='Retained Nverse atlases use top-left UVs; bottom-left supports auditing earlier exports.')
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    if args.render_check:
        render_check(args.out)
        return
    source = load_source(args.source)
    payload = args.out.read_bytes() if args.validate_only else convert(source, args.source_uv_origin)
    report = verify(payload, source, args.source_uv_origin)
    check(source['hashes'] == load_source(args.source)['hashes'], 'Original files changed during conversion.')
    if not args.validate_only:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_bytes(payload)
        check(verify(args.out.read_bytes(), source, args.source_uv_origin) == report, 'Written GLB differs from verified payload.')
        args.out.with_suffix('.verification.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
