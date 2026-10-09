"""Editable Arch Street master: retained source and game detail in separate collections."""
from pathlib import Path
import bpy,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/city/blender/arch-street'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC';scene.unit_settings.scale_length=1.0
proof=json.loads((ROOT/'public/models/city/arch-street-facade-details.provenance.json').read_text())
receipts=[]
for name,filename in [('SOURCE_REFERENCE','source-2740.glb'),('GAME_DETAIL','arch-street-facade-details.glb')]:
    source=ROOT/'public/models/city'/filename
    before=set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(source))
    objects=set(bpy.data.objects)-before
    collection=bpy.data.collections.new(name);scene.collection.children.link(collection)
    for obj in objects:
        for existing in list(obj.users_collection):existing.objects.unlink(obj)
        collection.objects.link(obj)
        obj['source_object_id']='2740';obj['origin_lon_lat_height']=proof['origin']
        obj['classification']='Historical photo reference' if name=='SOURCE_REFERENCE' else 'Photo-guided architectural detail; not final art'
    receipts.append({'layer':name,'source':str(source.relative_to(ROOT)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'mesh_objects':sum(o.type=='MESH' for o in objects)})
scene['geographic_origin']=proof['origin']
scene['units_note']='Metres, local east/north/up after glTF import; Unreal exporter handles centimetres and axes.'
scene['acceptance']='Unaccepted editable master; preserve photo references and verify exported detail in native Unreal.'
text=bpy.data.texts.new('WORKFLOW.txt')
text.write('SOURCE_REFERENCE is retained evidence. Edit GAME_DETAIL only. Export that collection, not the photographic reference. Do not apply geographic offsets to vertices. Preserve the scene origin metadata. Verify scale, placement and same-camera appearance in Unreal. Ordinary neighborhood assets may be interpretations; this source-specific relief remains photo-guided. No aerial imagery acceptance is implied.')
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.collections['GAME_DETAIL'].objects:
    if obj.type=='MESH':obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'arch-street-master.blend'))
bpy.ops.export_scene.gltf(filepath=str(OUT/'arch-street-detail.glb'),export_format='GLB',use_selection=True,export_yup=True)
report={'classification':'Editable master and export only; native visual acceptance pending','origin':proof['origin'],'sources':receipts,'blend':'arch-street-master.blend','export':'arch-street-detail.glb'}
(OUT/'provenance.json').write_text(json.dumps(report,indent=2))
print('PHILLY_BLENDER_MASTER_READY')
