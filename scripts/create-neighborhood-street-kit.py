"""Editable street furniture for the existing source-cell/GLB/Unreal workflow.

Metres, grounded pivots, +X is the curb-facing direction. Export one joined mesh
per reusable type; retain the named component objects in the Blender master.
No roads, lots, houses, or geographic layout are created here.
"""
from pathlib import Path
import bpy, json, math, hashlib, sys, traceback
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
sys.stdout=(ROOT/'artifacts/blender-street-kit-python.log').open('w',buffering=1)
sys.stderr=sys.stdout
sys.excepthook=lambda kind,value,tb:traceback.print_exception(kind,value,tb,file=sys.stderr)
print('Blender script started',bpy.app.version_string)
OUT=ROOT/'assets/city/blender/neighborhood-street-kit'
OUT.mkdir(parents=True,exist_ok=True)
EXPORT_ONLY = "--export-only" in sys.argv
if (OUT/"neighborhood-street-kit.blend").exists() and not EXPORT_ONLY and "--rebuild" not in sys.argv:
    raise RuntimeError("Master already exists. Use --export-only to preserve edits or --rebuild to regenerate it.")
if EXPORT_ONLY: bpy.ops.wm.open_mainfile(filepath=str(OUT/"neighborhood-street-kit.blend"))
else: bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.unit_settings.system='METRIC'
scene.unit_settings.scale_length=1
material=bpy.data.materials.get('StreetKit_VertexPaint') or bpy.data.materials.new('StreetKit_VertexPaint')
material.use_nodes=True
shader=material.node_tree.nodes.get('Principled BSDF')
shader.inputs['Roughness'].default_value=.74
color=next((n for n in material.node_tree.nodes if n.type=='VERTEX_COLOR'),None) or material.node_tree.nodes.new('ShaderNodeVertexColor');color.layer_name='Color'
material.node_tree.links.new(color.outputs['Color'],shader.inputs['Base Color'])
iron=(.055,.065,.058,1);steel=(.32,.35,.36,1);red=(.39,.047,.027,1)
wood=(.24,.15,.09,1);green=(.055,.12,.075,1);rubber=(.026,.028,.025,1)
cream=(.74,.72,.65,1);soil=(.055,.043,.026,1)
active=None

def finish(obj,name,paint,bevel=0):
    obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    active.objects.link(obj)
    bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=obj.modifiers.new('Manufactured edge radius','BEVEL');m.width=bevel;m.segments=2
        bpy.ops.object.modifier_apply(modifier=m.name)
    attr=obj.data.color_attributes.new(name='Color',type='FLOAT_COLOR',domain='CORNER')
    for datum in attr.data:datum.color=paint
    obj.data.materials.append(material)
    return obj

def box(name,at,size,paint,bevel=.005):
    bpy.ops.mesh.primitive_cube_add(size=1,location=at)
    obj=bpy.context.object;obj.dimensions=size
    return finish(obj,name,paint,bevel)

def cylinder(name,at,radius,depth,paint,vertices=12,radius_top=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius_top is None else radius_top,depth=depth,location=at)
    obj=finish(bpy.context.object,name,paint)
    for p in obj.data.polygons:p.use_smooth=len(p.vertices)==4
    return obj

def bar(name,a,b,radius,paint,vertices=8):
    a,b=Vector(a),Vector(b)
    obj=cylinder(name,(a+b)/2,radius,(b-a).length,paint,vertices)
    obj.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler()
    return obj

def sphere(name,at,scale,paint):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,location=at)
    obj=bpy.context.object;obj.scale=scale
    return finish(obj,name,paint)

def collection(name):
    global active
    active=bpy.data.collections.new(name);scene.collection.children.link(active)
    active['role']='GAME_DETAIL';active['pivot']='grounded, metres, +X faces road'

if not EXPORT_ONLY:
    collection('lamp')
    cylinder('Cast pedestal',(0,0,.11),.22,.22,iron,8,radius_top=.16)
    cylinder('Fluted lower column',(0,0,.68),.125,1.16,iron,12,radius_top=.085)
    cylinder('Tapered galvanized mast',(0,0,3.78),.084,5.15,steel,12,radius_top=.043)
    for z in [.18,.3,1.22]:cylinder('Column collar',(0,0,z),.13,.045,iron)
    box('Access door',(.09,0,.68),(.025,.125,.35),iron)
    points=[(0,0,6.2),(.08,0,6.43),(.37,0,6.57),(1.1,0,6.6),(1.78,0,6.54)]
    for a,b in zip(points,points[1:]):bar('Curved cobra arm',a,b,.037,steel,10)
    box('Luminaire housing',(1.83,0,6.52),(.66,.28,.115),steel,.045)
    box('Prismatic lens',(1.9,0,6.456),(.45,.2,.018),cream,.008)
    for y in [-.10,.10]:box('Housing seam',(1.83,y,6.514),(.43,.012,.03),iron,.001)
    for x in [-.11,.11]:
        for y in [-.11,.11]:cylinder('Anchor bolt',(x,y,.23),.018,.03,steel,6)

    collection('hydrant')
    cylinder('Base flange',(0,0,.045),.20,.09,iron)
    cylinder('Barrel',(0,0,.40),.12,.64,red,16,radius_top=.105)
    for z in [.12,.59,.71]:cylinder('Bolted flange',(0,0,z),.145,.045,red,16)
    sphere('Bonnet',(0,0,.72),(.133,.133,.14),red)
    cylinder('Operating nut',(0,0,.868),.029,.045,steel,6)
    bar('Pumper nozzle',(0,0,.48),(.205,0,.48),.079,red,16)
    bar('Pumper cap',(.19,0,.48),(.236,0,.48),.09,iron,12)
    bar('Cap nut',(.232,0,.48),(.26,0,.48),.028,steel,6)
    for sign in [-1,1]:
        bar('Hose outlet',(0,0,.53),(0,.18*sign,.53),.05,red,12)
        bar('Hose cap',(0,.17*sign,.53),(0,.202*sign,.53),.065,iron,12)
    for a in range(8):
        x,y=.117*math.cos(a*math.tau/8),.117*math.sin(a*math.tau/8)
        cylinder('Flange bolt',(x,y,.744),.012,.023,steel,6)
    # An angular short chain is physical geometry, not a painted line.
    for a,b in zip([(.20,0,.44),(.19,.06,.34),(.09,.095,.30),(0,.1,.4)],[(.19,.06,.34),(.09,.095,.30),(0,.1,.4),(-.02,.1,.48)]):bar('Cap chain',a,b,.007,iron,6)

    collection('bin')
    box('Wheeled cart body',(0,0,.45),(.48,.53,.79),green,.035)
    box('Hinged lid',(.01,0,.88),(.55,.59,.055),iron,.02)
    box('Lid handle',(.22,0,.925),(.04,.17,.035),iron,.012)
    for y in [-.285,.285]:
        bar('Rubber wheel',(-.19,y-.032,.10),(-.19,y+.032,.10),.095,rubber,12)
        bar('Hub',(-.19,y-.035,.10),(-.19,y+.035,.10),.032,steel,10)
    for y in [-.22,-.11,0,.11,.22]:box('Moulded front rib',(.245,y,.44),(.024,.024,.62),green,.006)
    bar('Push handle',(-.265,-.2,.78),(-.265,.2,.78),.019,iron)
    box('Scuffed lid edge',(.281,-.11,.879),(.006,.08,.01),(.25,.28,.24,1),.001)

    collection('utility-pole')
    cylinder('Timber pole',(0,0,4.35),.15,8.7,wood,12,radius_top=.082)
    for z in [.5,1.3,6.9]:cylinder('Steel band',(0,0,z),.152 if z<2 else .105,.035,iron)
    box('Crossarm',(0,0,7.85),(.13,1.55,.12),wood,.015)
    for y in [-.6,0,.6]:
        bar('Insulator pin',(0,y,7.87),(0,y,8.07),.018,steel)
        for z in [8.05,8.085,8.12]:cylinder('Ceramic insulator',(0,y,z),.053,.028,cream)
    bar('Crossarm brace',(0,0,7.32),(0,.55,7.82),.015,steel)
    bar('Crossarm brace',(0,0,7.32),(0,-.55,7.82),.015,steel)
    box('Service plate',(.12,0,1.7),(.018,.10,.19),iron)

    collection('parking-sign')
    box('Galvanized U post',(0,0,1.47),(.044,.044,2.94),steel,.002)
    box('Sign panel',(.028,0,2.48),(.025,.40,.56),cream,.014)
    box('Green header',(.043,0,2.69),(.002,.35,.07),green,.001)
    # Plain parking symbol and directional arrow, no invented street name or rule.
    for at,size in [((.045,-.10,2.46),(.004,.025,.20)),((.045,-.04,2.55),(.004,.12,.025)),((.045,-.04,2.47),(.004,.12,.025)),((.045,.015,2.51),(.004,.025,.09))]:box('Parking glyph',at,size,green,.001)
    for z in [2.23,2.73]:bar('Sign fixing',(.035,0,z),(.053,0,z),.009,steel,6)

    collection('planter')
    box('Soil',(0,0,.29),(.64,.64,.47),soil,.01)
    for side in [-1,1]:
        for z in [.10,.25,.40]:
            box('Weathered cedar board',(0,side*.355,z),(.75,.035,.125),wood,.008)
            box('Weathered cedar board',(side*.355,0,z),(.035,.69,.125),wood,.008)
        for y in [-.29,.29]:box('Corner stake',(side*.29,y,.26),(.052,.052,.52),iron,.004)
    for i in range(17):
        a=i*2.39996;r=.22*math.sqrt((i+1)/17);x,y=r*math.cos(a),r*math.sin(a)
        bar('Perennial stem',(x,y,.51),(x*1.25,y*1.25,.66+(i%5)*.047),.006,green,5)
        leaf=box('Perennial leaf',(x*1.25,y*1.25,.66+(i%5)*.035),(.14,.05,.008),(.12,.22,.09,1),.015)
        leaf.rotation_euler=(0,.3,a)

    collection('garden-fence')
    for x in [-.75,.75]:
        box('Square end post',(x,0,.53),(.052,.052,1.06),iron,.006)
        sphere('Post cap',(x,0,1.08),(.044,.044,.044),iron)
    for z in [.22,.85]:box('Horizontal rail',(0,0,z),(1.5,.033,.036),iron,.003)
    for i in range(11):
        x=-.68+i*.136
        box('Picket',(x,0,.59),(.018,.018,.9),iron,.002)
        cylinder('Spear finial',(x,0,1.075),.025,.07,iron,4,radius_top=0)

    collection('mailbox')
    # Wall-mounted rowhouse box; placement requires a facade normal, never a
    # suburban roadside mailbox on a West Philadelphia pavement.
    box('Mailbox body',(0,0,.12),(.10,.26,.24),iron,.01)
    box('Rain flap',(.058,0,.21),(.025,.285,.065),iron,.008)
    box('Paper slot',(.073,0,.215),(.003,.20,.009),rubber,.001)

    collection('cable')
    bar('Overhead conductor',(0,0,0),(1,0,0),.009,rubber,6)

report={'classification':'Authored neighborhood furniture, interpreted rather than surveyed','units':'metres; GLB importer converts to Unreal centimetres','assets':[],'shared_material':'StreetKit_VertexPaint'}
for c in list(scene.collection.children):
    meshes=[o for o in c.objects if o.type=='MESH']
    if not meshes:continue
    bpy.ops.object.select_all(action='DESELECT')
    copies=[]
    for o in meshes:
        clone=o.copy();clone.data=o.data.copy();scene.collection.objects.link(clone);clone.select_set(True);copies.append(clone)
    bpy.context.view_layer.objects.active=copies[0]
    bpy.ops.object.join()
    mesh=bpy.context.object;mesh.name=c.name
    scene.cursor.location=(0,0,0);bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    mesh.data.calc_loop_triangles()
    path=OUT/(c.name+'.glb')
    print('Exporting',c.name)
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_yup=True)
    coords=[mesh.matrix_world@v.co for v in mesh.data.vertices]
    report['assets'].append({'kind':c.name,'file':str(path.relative_to(ROOT)).replace('\\','/'),'triangles':len(mesh.data.loop_triangles),'bounds_m':[[min(v[i] for v in coords) for i in range(3)],[max(v[i] for v in coords) for i in range(3)]],'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    bpy.data.objects.remove(mesh,do_unlink=True)
scene['workflow']='Edit named objects within collections. Run export with metre units, origin (0,0,0), +X facing curb. Existing native source cells own placements.'
scene['acceptance']='Native same-camera visual and traversal review required; the kit is not finished neighborhood art.'
instructions=bpy.data.texts.get('WORKFLOW.txt') or bpy.data.texts.new('WORKFLOW.txt')
instructions.clear()
instructions.write('Each named collection is one editable reusable asset at the origin, in metres. Solo a collection to edit it. Run this script with --export-only to export the saved master without regenerating geometry. --rebuild deliberately regenerates the authored kit. Geographic placement belongs to the existing source cells, not this file. Import with import_street_kit.py; source hashes detect changes. The car has its own parked-vehicle.blend and retained-source atlas bake. Validate appearance in the native game with aerial imagery off.')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'neighborhood-street-kit.blend'))
(OUT/'manifest.json').write_text(json.dumps(report,indent=2))
print('PHILLY_STREET_KIT_READY')
