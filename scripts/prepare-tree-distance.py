"""Distance model derived from the already licensed local tree; original retained."""
import bpy,json,traceback
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/models/street/tree-small-02-distance.glb'
try:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/models/street/tree-small-02.glb'))
    counts=[]
    for obj in list(bpy.context.scene.objects):
        if obj.type!='MESH': continue
        bpy.context.view_layer.objects.active=obj
        obj.data.calc_loop_triangles()
        before=len(obj.data.loop_triangles)
        target=18000 if 'leaves' in obj.name else 1800 if 'branches' in obj.name else 1400
        modifier=obj.modifiers.new('Distance geometry only','DECIMATE')
        modifier.ratio=min(1,target/max(1,before));modifier.use_collapse_triangulate=True
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.data.calc_loop_triangles()
        counts.append({'name':obj.name,'sourceTriangles':before,'distanceTriangles':len(obj.data.loop_triangles)})
    bpy.ops.export_scene.gltf(filepath=str(OUT),export_format='GLB',export_yup=True,export_animations=False,export_cameras=False,export_lights=False)
    (OUT.with_suffix('.json')).write_text(json.dumps({'source':'tree-small-02.glb','license':'CC0-1.0','author':'Rico Cilliers / Poly Haven','parts':counts,'bytes':OUT.stat().st_size,'status':'Geometry reduction for distant trees; visual review required'},indent=2))
except Exception:
    (ROOT/'artifacts/tree-distance-error.txt').write_text(traceback.format_exc());raise
