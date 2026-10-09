"""Bounded source download and Blender inspection; never executes source scripts."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import math
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'artifacts' / 'source-street' / 'tree-small-02'

def download():
    manifest = json.loads((ROOT / 'artifacts/tree-small-files.json').read_text(encoding='utf-8-sig'))
    blend = manifest['blend']['1k']['blend']
    files = {'tree_small_02_1k.blend': blend, **blend['include']}
    assert sum(entry['size'] for entry in files.values()) < 90_000_000
    records = []
    for relative, entry in files.items():
        destination = (SOURCE / relative).resolve()
        assert destination.is_relative_to(SOURCE.resolve())
        assert urlparse(entry['url']).hostname == 'dl.polyhaven.org'
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists() or hashlib.md5(destination.read_bytes()).hexdigest() != entry['md5']:
            subprocess.run(['curl.exe', '-4', '-f', '-L', '--silent', '--show-error', '--connect-timeout', '8', '--max-time', '120', entry['url'], '-o', str(destination)], check=True)
        content = destination.read_bytes()
        assert len(content) == entry['size']
        assert hashlib.md5(content).hexdigest() == entry['md5']
        record = {'path': relative, 'url': entry['url'], 'bytes': len(content), 'md5': entry['md5'], 'sha256': hashlib.sha256(content).hexdigest()}
        records.append(record)
        print(json.dumps(record), flush=True)
    (SOURCE / 'download-evidence.json').write_text(json.dumps(records, indent=2), encoding='utf-8')

def inspect():
    import bpy
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'tree_small_02_1k.blend'), load_ui=False, use_scripts=False)
    report = {'blender': bpy.app.version_string, 'collections': [], 'objects': [], 'images': [], 'node_groups': []}
    for collection in bpy.data.collections:
        report['collections'].append({'name': collection.name, 'objects': [obj.name for obj in collection.objects], 'hidden': collection.hide_viewport})
    for obj in bpy.data.objects:
        mods = []
        for modifier in obj.modifiers:
            info = {'name': modifier.name, 'type': modifier.type, 'viewport': modifier.show_viewport, 'render': modifier.show_render}
            if modifier.type == 'NODES':
                info['group'] = modifier.node_group.name if modifier.node_group else None
                try: info['inputs'] = {key: str(modifier[key]) for key in modifier.keys()}
                except TypeError: info['inputs'] = 'IDProperties unavailable in this Blender version'
            mods.append(info)
        report['objects'].append({'name': obj.name, 'type': obj.type, 'vertices': len(obj.data.vertices) if obj.type == 'MESH' else None,
            'polygons': len(obj.data.polygons) if obj.type == 'MESH' else None, 'dimensions': list(obj.dimensions), 'location': list(obj.location),
            'hidden': obj.hide_get(), 'hide_render': obj.hide_render, 'modifiers': mods,
            'materials': [slot.material.name if slot.material else None for slot in obj.material_slots]})
    for image in bpy.data.images:
        report['images'].append({'name': image.name, 'path': image.filepath, 'size': list(image.size)})
    for group in bpy.data.node_groups:
        if group.bl_idname == 'GeometryNodeTree':
            report['node_groups'].append({'name': group.name, 'inputs': [{'name': item.name, 'identifier': item.identifier, 'socket_type': getattr(item, 'socket_type', None), 'default': str(getattr(item, 'default_value', None))} for item in group.interface.items_tree if getattr(item, 'in_out', None) == 'INPUT']})
    (SOURCE / 'blender-inspection.json').write_text(json.dumps(report, indent=2), encoding='utf-8')

def export_tree():
    import bpy
    from mathutils import Vector
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE / 'tree_small_02_1k.blend'), load_ui=False, use_scripts=False)
    original = bpy.data.objects['tree_small_02_LOD1']
    original_copy = original.copy()
    original_copy.data = original.data.copy()
    original_copy.name = 'Tree_small_02_runtime'
    bpy.context.scene.collection.objects.link(original_copy)
    # Export a single existing tree, not the author's variant/example layout.
    for obj in list(bpy.data.objects):
        if obj != original_copy: bpy.data.objects.remove(obj, do_unlink=True)
    original_copy.hide_set(False)
    original_copy.hide_render = False
    original_copy.select_set(True)
    bpy.context.view_layer.objects.active = original_copy
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.separate(type='MATERIAL')
    bpy.ops.object.mode_set(mode='OBJECT')
    parts = list(bpy.context.selected_objects)
    evidence = {'source_object': 'tree_small_02_LOD1',
        'source': 'https://polyhaven.com/a/tree_small_02', 'license': 'CC0-1.0', 'author': 'Rico Cilliers', 'parts': []}
    for obj in parts:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        obj.data.calc_loop_triangles()
        before = len(obj.data.loop_triangles)
        material = obj.data.materials[0].name
        target = 110000 if 'leaves' in material else 7000 if 'trunk' in material else 10000
        modifier = obj.modifiers.new('Runtime detail reduction', 'DECIMATE')
        modifier.ratio = min(1.0, target / before)
        modifier.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.calc_loop_triangles()
        evidence['parts'].append({'material': material, 'source_triangles': before, 'runtime_triangles': len(obj.data.loop_triangles)})
        obj.name = material
    vertices = [obj.matrix_world @ vertex.co for obj in parts for vertex in obj.data.vertices]
    minimum = [min(v[i] for v in vertices) for i in range(3)]
    maximum = [max(v[i] for v in vertices) for i in range(3)]
    # Preserve the trunk's XY anchor; move only the lowest root onto local z=0.
    for obj in parts: obj.location.z -= minimum[2]
    bpy.context.view_layer.update()
    evidence['minimum_before_grounding'] = minimum
    evidence['maximum_before_grounding'] = maximum
    evidence['height_metres'] = maximum[2] - minimum[2]
    evidence['triangles'] = sum(part['runtime_triangles'] for part in evidence['parts'])
    output = ROOT / 'public/models/street/tree-small-02.glb'
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output), export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False,
        export_image_format='JPEG', export_jpeg_quality=90)
    # Alpha testing keeps the source leaf cut-outs without sorting every canopy
    # as a large transparent object. No pixels or texture coordinates change.
    import struct
    glb = output.read_bytes()
    json_size = struct.unpack_from('<I', glb, 12)[0]
    asset = json.loads(glb[20:20 + json_size])
    for material in asset.get('materials', []):
        if 'leaves' in material.get('name', ''):
            material['alphaMode'] = 'MASK'
            material['alphaCutoff'] = 0.4
    encoded = json.dumps(asset, separators=(',', ':')).encode('utf-8')
    encoded += b' ' * (-len(encoded) % 4)
    remainder = glb[20 + json_size:]
    output.write_bytes(struct.pack('<4sII', b'glTF', 2, 20 + len(encoded) + len(remainder))
        + struct.pack('<I4s', len(encoded), b'JSON') + encoded + remainder)
    evidence['bytes'] = output.stat().st_size
    evidence['sha256'] = hashlib.sha256(output.read_bytes()).hexdigest()
    evidence['leaf_alpha_mode'] = 'MASK'
    evidence['leaf_alpha_cutoff'] = 0.4
    (output.parent / 'tree-small-02.metadata.json').write_text(json.dumps(evidence, indent=2), encoding='utf-8')
    # Re-import the actual GLB for the preview so export/material failures show up.
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(output))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.65, 0.72, 0.8, 1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    bpy.ops.object.light_add(type='AREA', location=(3, -4, 7))
    bpy.context.object.data.energy = 550
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 4
    bpy.context.object.rotation_euler = (Vector((0, 0, 2)) - bpy.context.object.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.object.camera_add(location=(7, -10, 5))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((0, 0, 2.3)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 5.7
    scene.camera = camera
    scene.render.filepath = str(SOURCE / 'runtime-glb-preview.png')
    bpy.ops.render.render(write_still=True)
    (SOURCE / 'preparation-status.json').write_text(json.dumps({'success': True, 'output': str(output), 'sha256': evidence['sha256']}), encoding='utf-8')

def native_impostor():
    """Far LOD of the retained tree, not a substitute for its close 3D mesh."""
    import bpy,struct,traceback
    from mathutils import Vector
    out=ROOT/'assets/city/blender/neighborhood-street-kit'
    out.mkdir(parents=True,exist_ok=True)
    sys.stdout=(ROOT/'artifacts/tree-native-lod.log').open('w',buffering=1);sys.stderr=sys.stdout
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/street/tree-small-02.glb'))
    source=[o for o in bpy.context.scene.objects if o.type=='MESH']
    vertices=[o.matrix_world@v.co for o in source for v in o.data.vertices]
    low=Vector([min(v[i] for v in vertices) for i in range(3)])
    high=Vector([max(v[i] for v in vertices) for i in range(3)])
    center=(low+high)/2;size=max(high-low)*1.06
    # Bake source albedo with its real leaf alpha, without directional lighting
    # or a ground plane. Unreal will light the LOD in the game environment.
    originals={o.name:list(o.data.materials) for o in source}
    for o in source:
        for i,original in enumerate(list(o.data.materials)):
            mat=original.copy();o.data.materials[i]=mat
            nodes=mat.node_tree.nodes;links=mat.node_tree.links
            bsdf=next(n for n in nodes if n.type=='BSDF_PRINCIPLED')
            output=next(n for n in nodes if n.type=='OUTPUT_MATERIAL')
            emission=nodes.new('ShaderNodeEmission');transparent=nodes.new('ShaderNodeBsdfTransparent');mix=nodes.new('ShaderNodeMixShader')
            base=bsdf.inputs['Base Color'];alpha=bsdf.inputs['Alpha']
            if base.is_linked:links.new(base.links[0].from_socket,emission.inputs['Color'])
            else:emission.inputs['Color'].default_value=base.default_value
            if alpha.is_linked:links.new(alpha.links[0].from_socket,mix.inputs[0])
            else:mix.inputs[0].default_value=alpha.default_value
            links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);links.new(mix.outputs[0],output.inputs['Surface'])
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.cycles.device='CPU'
    scene.render.film_transparent=True;scene.render.resolution_x=1024;scene.render.resolution_y=1024;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.view_settings.view_transform='Standard'
    bpy.ops.object.camera_add();camera=bpy.context.object;camera.data.type='ORTHO';camera.data.ortho_scale=size;scene.camera=camera
    views=[]
    for name,direction in [('front',Vector((0,-1,0))),('side',Vector((1,0,0))),('top',Vector((0,0,1)))]:
        camera.location=center+direction*20;camera.rotation_euler=(-direction).to_track_quat('-Z','Y').to_euler()
        path=out/f'tree-lod-{name}.png';scene.render.filepath=str(path)
        bpy.ops.render.render(write_still=True)
        right=camera.rotation_euler.to_matrix()@Vector((1,0,0))
        up=camera.rotation_euler.to_matrix()@Vector((0,1,0))
        views.append((name,path,right,up))
    for o in source:
        for i,mat in enumerate(originals[o.name]):o.data.materials[i]=mat
        o.hide_render=True;o.hide_set(True)
    collection=bpy.data.collections.new('GAME_DETAIL_FAR_LOD');scene.collection.children.link(collection)
    planes=[]
    for name,path,right,up in views:
        points=[center+right*x*size/2+up*z*size/2 for x,z in [(-1,-1),(1,-1),(1,1),(-1,1)]]
        data=bpy.data.meshes.new('canopy-'+name);data.from_pydata(points,[],[(0,1,2,3)]);data.update()
        uv=data.uv_layers.new(name='UVMap')
        for loop,coordinate in zip(uv.data,[(0,0),(1,0),(1,1),(0,1)]):loop.uv=coordinate
        obj=bpy.data.objects.new('canopy-'+name,data);collection.objects.link(obj);planes.append(obj)
        mat=bpy.data.materials.new('TreeFar_'+name);mat.use_nodes=True
        mat.surface_render_method='DITHERED'
        shader=mat.node_tree.nodes.get('Principled BSDF');shader.inputs['Roughness'].default_value=.9
        texture=mat.node_tree.nodes.new('ShaderNodeTexImage');texture.image=bpy.data.images.load(str(path));texture.image.pack()
        mat.node_tree.links.new(texture.outputs['Color'],shader.inputs['Base Color']);mat.node_tree.links.new(texture.outputs['Alpha'],shader.inputs['Alpha'])
        data.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in planes:obj.select_set(True)
    bpy.context.view_layer.objects.active=planes[0]
    scene['role']='Far canopy LOD only. Nearby trees must remain the retained full 3D asset.'
    bpy.ops.wm.save_as_mainfile(filepath=str(out/'tree-far-lod.blend'))
    path=out/'tree-far-lod.glb'
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True)
    content=path.read_bytes();length=struct.unpack_from('<I',content,12)[0];gltf=json.loads(content[20:20+length])
    for mat in gltf['materials']:mat['alphaMode']='MASK';mat['alphaCutoff']=.35;mat['doubleSided']=True
    gltf['asset']['extras']={'source':'Tree Small 02 by Rico Cilliers / Poly Haven, CC0','usage':'Distant LOD rendered from retained 3D asset; not a close tree replacement'}
    encoded=json.dumps(gltf,separators=(',',':')).encode();encoded+=b' '*(-len(encoded)%4);tail=content[20+length:]
    path.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(encoded)+len(tail))+struct.pack('<I4s',len(encoded),b'JSON')+encoded+tail)
    (out/'tree-far-lod.json').write_text(json.dumps({'kind':'tree-far-lod','file':str(path.relative_to(ROOT)).replace('\\','/'),'triangles':6,'source':'public/models/street/tree-small-02.glb','sha256':hashlib.sha256(path.read_bytes()).hexdigest()},indent=2))
    print('PHILLY_TREE_FAR_LOD_READY')

if __name__ == '__main__':
    try:
        if '--native-impostor' in sys.argv: native_impostor()
        elif '--export' in sys.argv: export_tree()
        elif '--inspect' in sys.argv: inspect()
        else: download()
    except Exception:
        import traceback
        SOURCE.mkdir(parents=True, exist_ok=True)
        (SOURCE / 'preparation-error.txt').write_text(traceback.format_exc(), encoding='utf-8')
        raise
