"""Compare the Run candidate's retained data to the working GLB, without Blender."""
import hashlib
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(name):
    content = (ROOT / 'public/models/character' / name).read_bytes()
    length = struct.unpack_from('<I', content, 12)[0]
    return json.loads(content[20:20 + length]), content[28 + length:]


def accessor(data, binary, index):
    item = data['accessors'][index]
    view = data['bufferViews'][item['bufferView']]
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}[item['type']]
    size = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}[item['componentType']] * components
    offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    stride = view.get('byteStride', size)
    raw = b''.join(binary[offset + i * stride:offset + i * stride + size] for i in range(item['count']))
    return {'componentType': item['componentType'], 'type': item['type'], 'count': item['count'],
            'sha256': hashlib.sha256(raw).hexdigest()}


def inventory(data, binary):
    meshes = {}
    for mesh in data['meshes']:
        meshes[mesh['name']] = [
            {'attributes': {name: accessor(data, binary, index) for name, index in p['attributes'].items()},
             'indices': accessor(data, binary, p['indices']),
             'material': data['materials'][p['material']]['name']}
            for p in mesh['primitives']]
    images = []
    for image in data['images']:
        view = data['bufferViews'][image['bufferView']]
        offset = view.get('byteOffset', 0)
        images.append(hashlib.sha256(binary[offset:offset + view['byteLength']]).hexdigest())
    clips = {}
    for clip in data['animations']:
        channels = {}
        for channel in clip['channels']:
            target = channel['target']
            sampler = clip['samplers'][channel['sampler']]
            channels[data['nodes'][target['node']]['name'] + ':' + target['path']] = {
                'input': accessor(data, binary, sampler['input']),
                'output': accessor(data, binary, sampler['output']),
                'interpolation': sampler.get('interpolation', 'LINEAR')}
        clips[clip['name']] = channels
    materials = {m['name']: m for m in data['materials']}
    return {'meshes': meshes, 'images': sorted(images), 'clips': clips, 'materials': materials}


original = inventory(*read('human-adult.glb'))
candidate_data, candidate_binary = read('human-motion.glb')
candidate = inventory(candidate_data, candidate_binary)
run = next(clip for clip in candidate_data['animations'] if clip['name'] == 'Run')
loop_error = 0
for sampler in run['samplers']:
    item = candidate_data['accessors'][sampler['output']]
    view = candidate_data['bufferViews'][item['bufferView']]
    components = {'VEC3': 3, 'VEC4': 4}[item['type']]
    offset = view.get('byteOffset', 0) + item.get('byteOffset', 0)
    stride = view.get('byteStride', components * 4)
    first = struct.unpack_from('<' + 'f' * components, candidate_binary, offset)
    last = struct.unpack_from('<' + 'f' * components, candidate_binary, offset + (item['count'] - 1) * stride)
    error = max(abs(a - b) for a, b in zip(first, last))
    if components == 4:
        error = min(error, max(abs(a + b) for a, b in zip(first, last)))
    loop_error = max(loop_error, error)
result = {'retainedMeshAttributesExact': original['meshes'] == candidate['meshes'],
          'retainedPackedImagesExact': original['images'] == candidate['images'],
          'retainedMaterialsExact': original['materials'] == candidate['materials'],
          'retainedIdleExact': original['clips']['Idle'] == candidate['clips']['Idle'],
          'retainedWalkExact': original['clips']['Walk'] == candidate['clips']['Walk'],
          'candidateClips': sorted(candidate['clips']),
          'maximumRunLoopEndpointDifference': loop_error,
          'runLoopClosed': loop_error < 1e-6}
destination = ROOT / 'assets/characters/inspection/motion/retained-data-validation.json'
destination.write_text(json.dumps(result, indent=2), encoding='utf-8')
print(json.dumps(result, indent=2))
if not all(value for key, value in result.items() if key.startswith('retained')):
    raise SystemExit('Candidate changed previously working asset data; inspect before promotion.')
if not result['runLoopClosed']:
    raise SystemExit('Run first and last samples do not close.')
