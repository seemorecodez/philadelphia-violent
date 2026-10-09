"""Blender conversion of retained Philadelphia assets for Unreal evaluation.

Source GLBs remain untouched. FBX is an interchange artifact, not new artwork.
"""
import hashlib
import json
from pathlib import Path
import bpy
import math

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'artifacts/unreal/assets'
OUT.mkdir(parents=True,exist_ok=True)
jobs=[('Mustang','public/models/mustang-2005.glb',False),
      ('ChinatownSource','public/models/city/philly-0000.glb',False),
      ('Human','public/models/character/human-motion.glb',True)]
receipts=[]
for name,relative,skeletal in jobs:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    source=ROOT/relative
    bpy.ops.import_scene.gltf(filepath=str(source))
    meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
    # Keep original geometry/materials; vehicle front is +Z glTF => -Y Blender.
    # Static geometry is joined for one predictable native asset name.
    if not skeletal:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes: obj.select_set(True)
        bpy.context.view_layer.objects.active=meshes[0]
        bpy.ops.object.join()
        obj=bpy.context.object
        obj.name=name
        if name=='Mustang':
            obj.rotation_euler.z += math.pi/2
            bpy.ops.object.transform_apply(location=False,rotation=True,scale=True)
    # Export packed source images as files alongside the FBX, preserving provenance.
    for image in bpy.data.images:
        if image.packed_file:
            image.filepath_raw=str(OUT/(name+'_'+image.name.replace('/','_')+'.png'))
            image.file_format='PNG'
            image.save()
    destination=OUT/f'{name}.fbx'
    bpy.ops.export_scene.fbx(filepath=str(destination),use_selection=False,
        object_types={'MESH','ARMATURE'} if skeletal else {'MESH'},
        axis_forward='-Y',axis_up='Z',use_mesh_modifiers=True,
        add_leaf_bones=False,bake_anim=skeletal,bake_anim_use_all_actions=skeletal,
        bake_anim_use_nla_strips=False,path_mode='COPY',embed_textures=True)
    receipts.append({'name':name,'source':relative,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
                     'output':str(destination),'outputSha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
                     'skeletal':skeletal,'actions':[a.name for a in bpy.data.actions]})
    print('EXPORTED',name,flush=True)
(OUT/'receipt.json').write_text(json.dumps(receipts,indent=2))
