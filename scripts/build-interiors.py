"""Author editable game interiors in Blender; export metre-scale glTF models.

Run through Blender --background --factory-startup --python <this file>.
The floorplans are authored game layouts, not surveyed Philadelphia rooms.
Every freestanding furnishing stays inside a declared furniture collider.
"""
import bpy
import json
import math
import random
import time
import traceback
from contextlib import contextmanager
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models' / 'interiors'
EDITABLE = ROOT / 'assets' / 'interiors'
OUT.mkdir(parents=True, exist_ok=True)
EDITABLE.mkdir(parents=True, exist_ok=True)
LOG = OUT / 'build.log'
START = time.time()
COLLECTION = None
M = {}

LAYOUTS = {
    'lobby': {
        'name': 'Lobby and rooms', 'width': 18, 'depth': 18, 'spawn': [0, -7.5],
        'walls': [[-4,-2,-4,9], [4,-2,4,9], [-9,-2,-5,-2], [-3,-2,3,-2], [5,-2,9,-2], [-4,4,-1,4], [1,4,4,4]],
        'furniture': [[-6.5,5,2.5,1.4], [6.5,5,2.5,1.4], [0,7,2,1]],
    },
    'shop': {
        'name': 'Shop and back room', 'width': 14, 'depth': 16, 'spawn': [0,-6.5],
        'walls': [[-7,3,-1,3], [1,3,7,3]],
        'furniture': [[-4,-1,1.2,6], [4,-1,1.2,6], [0,6,5,1.4]],
    },
    'home': {
        'name': 'Furnished apartment', 'width': 14, 'depth': 12, 'spawn': [0,-4.5],
        'walls': [[2,-6,2,-4], [2,-2.7,2,2], [2,3.2,2,6], [-7,1,-1,1], [0.5,1,2,1], [2,0,3.2,0], [4.4,0,7,0]],
        'furniture': [[-4.8,-2.8,3,1.6], [-4.8,-0.65,1.6,0.8], [-3.6,5,5,1.4], [-3.9,2.6,2.4,1.3], [4.6,3.85,3.4,3], [6.37,0.88,1.08,1.25], [5.9,-5.3,1.7,1.15], [5.92,-1.45,1.8,1.7], [3.45,-5.15,0.85,1.45]],
    },
}


def log(message):
    with LOG.open('a', encoding='utf-8') as output:
        output.write(f'{time.time()-START:7.2f}s {message}\n')


def rgba(hex_color):
    value = hex_color.lstrip('#')
    return tuple(int(value[i:i+2], 16) / 255 for i in (0, 2, 4)) + (1,)


def texture(name, kind, color='#aaaaaa', size=256):
    image = bpy.data.images.new(name, width=size, height=size, alpha=False)
    base = rgba(color)
    pixels = []
    rng = random.Random(7281)
    for y in range(size):
        for x in range(size):
            noise = rng.random()
            if kind == 'wood':
                plank = y // (size // 8)
                seam = y % (size // 8) < 1 or (x + plank * 61) % size < 2
                grain = math.sin(x * .15 + math.sin(y * .095) * 4) * .027
                value = .77 if seam else .91 + grain + noise * .09 + (plank % 3) * .018
            elif kind == 'stone':
                seam = x < 2 or y < 2
                chip = .16 if noise > .986 else (-.18 if noise < .023 else 0)
                value = .67 if seam else .92 + noise * .04 + chip
            elif kind == 'fabric':
                weave = ((x % 3) + (y % 3)) / 6
                value = .83 + weave * .12 + noise * .05
            elif kind == 'marble':
                vein = abs(math.sin(x * .022 + y * .047 + math.sin(y * .018) * 2.4))
                value = .72 + vein * .23 + noise * .05
            else:
                grout = x < 3 or y < 3
                value = .55 if grout else .94 + noise * .05
            pixels.extend((min(1, base[0]*value), min(1, base[1]*value), min(1, base[2]*value), 1))
    image.pixels.foreach_set(pixels)
    image.pack()
    return image


def material(name, color, roughness=.55, metallic=0, image=None, emission=0, alpha=1):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = rgba(color)[:3] + (alpha,)
    shader = mat.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = rgba(color)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    shader.inputs['Alpha'].default_value = alpha
    if emission:
        channel = shader.inputs.get('Emission Color') or shader.inputs.get('Emission')
        channel.default_value = rgba(color)
        strength = shader.inputs.get('Emission Strength')
        if strength:
            strength.default_value = emission
    if image:
        node = mat.node_tree.nodes.new('ShaderNodeTexImage')
        node.image = image
        mat.node_tree.links.new(node.outputs['Color'], shader.inputs['Base Color'])
    if alpha < 1:
        if hasattr(mat, 'surface_render_method'):
            mat.surface_render_method = 'DITHERED'
        elif hasattr(mat, 'blend_method'):
            mat.blend_method = 'BLEND'
    mat.use_backface_culling = False
    return mat


def materials():
    global M
    M = {
        'plaster': material('Warm mineral plaster', '#dfd7c6', .86),
        'trim': material('Satin ivory joinery', '#f4ece0', .42),
        'dark': material('Graphite powder coat', '#22282b', .5, .3),
        'black': material('Appliance black', '#101517', .28, .18),
        'metal': material('Brushed stainless steel', '#a7acaa', .28, .82),
        'brass': material('Aged brass details', '#b79351', .28, .78),
        'oak': material('Natural oak veneer', '#bb8858', .46, image=texture('Oak grain', 'wood', '#bd9061', 512)),
        'walnut': material('Walnut joinery', '#744d32', .42, image=texture('Walnut grain', 'wood', '#8a6343', 256)),
        'floor': material('Terrazzo floor tiles', '#c7c1af', .63, image=texture('Terrazzo aggregate and joints', 'stone', '#d7d0be', 512)),
        'tile': material('Porcelain bath tiles', '#b9c8c5', .38, image=texture('Porcelain tile and grout', 'tile', '#d0ded9', 256)),
        'stone': material('Honed stone worktop', '#636e68', .3, image=texture('Subtle stone veins', 'marble', '#89958c', 256)),
        'teal': material('Woven teal upholstery', '#3a686d', .93, image=texture('Teal fabric weave', 'fabric', '#527d80', 256)),
        'linen': material('Natural linen upholstery', '#c3b599', .96, image=texture('Linen fabric weave', 'fabric', '#d2c2a5', 256)),
        'rust': material('Clay textile', '#ae684b', .95, image=texture('Clay textile weave', 'fabric', '#be7b61', 256)),
        'ceramic': material('Glazed warm white ceramic', '#e5e7de', .2),
        'green': material('Bottle green glass', '#32594b', .24),
        'leaf': material('Living foliage', '#3c6541', .75),
        'paper': material('Unmarked packaging cream', '#d4c7a6', .86),
        'blue': material('Unmarked packaging blue', '#5c7987', .57),
        'red': material('Unmarked packaging terracotta', '#bb7356', .62),
        'glass': material('Clear shower glazing', '#aacbc7', .15, alpha=.2),
        'screen': material('Unlettered display glass', '#162c35', .17, emission=.08),
        'light': material('Warm luminous diffuser', '#fff1cd', .45, emission=1.5),
        'window': material('Diffuse blue daylight glazing', '#89a6aa', .38, emission=.18),
        'rug': material('Woven earth rug', '#857c63', .98, image=texture('Rug weave', 'fabric', '#a09b80', 256)),
    }


def place_in_collection(obj):
    if COLLECTION:
        for existing in list(obj.users_collection):
            existing.objects.unlink(obj)
        COLLECTION.objects.link(obj)
    return obj


def finish(obj, name, mat, bevel=0, segments=2):
    obj.name = name
    place_in_collection(obj)
    if mat:
        obj.data.materials.append(M[mat] if isinstance(mat, str) else mat)
    if bevel:
        modifier = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = 'ANGLE'
    return obj


def box(name, location, size, mat, bevel=.015, rotation=0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = rotation
    return finish(obj, name, mat, min(bevel, min(size)*.24) if bevel else 0)


def cylinder(name, location, radius, depth, mat, vertices=16, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = finish(bpy.context.object, name, mat, min(.008, radius*.1, depth*.12))
    if rotation:
        obj.rotation_euler = rotation
    return obj


def sphere(name, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return finish(obj, name, mat)


def cone(name, location, radius1, radius2, depth, mat):
    bpy.ops.mesh.primitive_cone_add(vertices=20, radius1=radius1, radius2=radius2, depth=depth, location=location)
    return finish(bpy.context.object, name, mat, .004)


def tube(name, points, radius, mat, cyclic=False):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(points)-1)
    for target, source in zip(spline.points, points):
        target.co = (*source, 1)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    return finish(obj, name, mat)


@contextmanager
def group(name, x=0, y=0, angle=0):
    global COLLECTION
    previous = COLLECTION
    COLLECTION = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(COLLECTION)
    selected = COLLECTION
    try:
        yield
    finally:
        # Blender defers matrix evaluation after assigning rotation/location.
        # Read evaluated matrices before applying the furniture-group transform.
        bpy.context.view_layer.update()
        transform = Matrix.Translation(Vector((x,y,0))) @ Matrix.Rotation(angle, 4, 'Z')
        for obj in selected.objects:
            obj.matrix_world = transform @ obj.matrix_world
        COLLECTION = previous


def planar_uv(obj, scale=1):
    mesh = obj.data
    uv = mesh.uv_layers.active or mesh.uv_layers.new(name='UVMap')
    for polygon in mesh.polygons:
        normal = polygon.normal
        for index in polygon.loop_indices:
            co = mesh.vertices[mesh.loops[index].vertex_index].co
            if abs(normal.z) > .5:
                pair = (co.x/scale, co.y/scale)
            elif abs(normal.y) > .5:
                pair = (co.x/scale, co.z/scale)
            else:
                pair = (co.y/scale, co.z/scale)
            uv.data[index].uv = pair


def wall(segment, height=2.9):
    ax, ay, bx, by = segment
    length = math.hypot(bx-ax, by-ay)
    angle = math.atan2(by-ay, bx-ax)
    cx, cy = (ax+bx)/2, (ay+by)/2
    box('Plaster wall', (cx,cy,height/2), (length,.18,height), 'plaster', .007, angle)
    box('Skirting with cap', (cx,cy,.085), (length,.20,.17), 'trim', .008, angle)
    box('Upper wall moulding', (cx,cy,2.66), (length,.205,.08), 'trim', .008, angle)
    box('Wall crown', (cx,cy,2.85), (length,.22,.09), 'trim', .008, angle)


def doorway(x, y, width=2, angle=0):
    with group('Doorway frame', x, y, angle):
        for side in [-1,1]:
            box('Door jamb', (side*(width/2-.045),0,1.29), (.09,.25,2.58), 'walnut', .009)
            box('Door casing', (side*(width/2-.045),-.145,1.30), (.12,.028,2.62), 'oak', .006)
        box('Door header', (0,0,2.55), (width,.25,.13), 'walnut', .009)
        box('Door top casing', (0,-.145,2.60), (width+.07,.028,.12), 'oak', .006)
        box('Flush threshold', (0,0,.008), (width-.12,.30,.016), 'brass', .004)


def wall_panel(x, y, width=2.4, angle=0, glazed=False):
    with group('Framed wall panel', x, y, angle):
        box('Inset panel backing', (0,0,1.52), (width,.025,1.44), 'window' if glazed else 'teal', .005)
        for side in [-1,1]:
            box('Panel upright trim', (side*(width/2+.025),-.01,1.52), (.055,.05,1.55), 'oak', .006)
            box('Panel horizontal trim', (0,-.01,1.52+side*.755), (width+.11,.05,.055), 'oak', .006)
        if glazed:
            box('Window mullion', (0,-.027,1.52), (.04,.05,1.44), 'trim', .004)
            box('Window sill', (0,-.09,.75), (width+.18,.23,.065), 'trim', .006)
        else:
            for offset in [-.6,0,.6]:
                box('Raised acoustic rib', (offset,-.018,1.52), (.014,.03,1.35), 'brass', .002)


def sconce(x, y, angle=0):
    with group('Warm wall sconce', x, y, angle):
        box('Sconce mounting plate', (0,0,1.91), (.19,.045,.32), 'brass', .015)
        box('Sconce diffuser', (0,-.068,1.91), (.14,.105,.26), 'light', .025)
        for z in [1.765,2.055]:
            box('Sconce metal cap', (0,-.065,z), (.18,.13,.025), 'brass', .004)


def rug(x,y,width,depth):
    obj = box('Low woven rug', (x,y,.014), (width,depth,.025), 'rug', .012)
    planar_uv(obj,.75)
    for side in [-1,1]:
        box('Rug stitched border', (x,y+side*(depth/2-.055),.029), (width-.07,.018,.004), 'linen', .001)


def plant(x,y,z=0,scale=1):
    cone('Ceramic planter', (x,y,z+.105*scale), .085*scale,.115*scale,.21*scale,'ceramic')
    cylinder('Dark potting soil', (x,y,z+.208*scale), .101*scale,.01*scale,'walnut')
    for index in range(7):
        angle = index*2.39996
        lx = x+math.cos(angle)*.095*scale
        ly = y+math.sin(angle)*.095*scale
        height = z+(.35+(index%3)*.055)*scale
        tube('Plant stem', [(x,y,z+.20*scale),(lx,ly,height)],.006*scale,'leaf')
        leaf = sphere('Sculpted leaf', (lx,ly,height), (.045*scale,.018*scale,.14*scale),'leaf')
        leaf.rotation_euler = (.35*math.cos(angle),.4*math.sin(angle),angle)


def sofa(width=2.5,depth=1.4):
    for x in [-width/2+.2,width/2-.2]:
        for y in [-depth/2+.19,depth/2-.19]:
            cylinder('Sofa turned foot',(x,y,.095),.045,.19,'walnut')
    box('Sofa underframe',(0,0,.23),(width-.1,depth-.09,.20),'walnut',.04)
    box('Upholstered sofa base',(0,0,.39),(width-.05,depth-.06,.29),'teal',.075)
    seat_width = (width-.46)/3
    for index in range(3):
        cx=(index-1)*(seat_width+.02)
        box('Individual seat cushion',(cx,-.07,.62),(seat_width,depth-.36,.22),'teal',.075)
        box('Individual back cushion',(cx,depth/2-.29,.97),(seat_width,.25,.57),'teal',.072)
        tube('Seat sewn piping',[(cx-seat_width/2+.05,-depth/2+.13,.722),(cx+seat_width/2-.05,-depth/2+.13,.722),(cx+seat_width/2-.05,depth/2-.30,.722),(cx-seat_width/2+.05,depth/2-.30,.722)],.006,'linen',True)
    box('Padded rear rail',(0,depth/2-.12,.89),(width-.06,.22,.72),'teal',.06)
    for side in [-1,1]:
        box('Rounded armrest',(side*(width/2-.105),-.015,.735),(.21,depth-.08,.58),'teal',.06)
        obj=box('Loose linen cushion',(side*(width/2-.51),depth/2-.35,1.08),(.39,.24,.40),'linen',.085)
        obj.rotation_euler=(.1,side*.12,side*.09)


def cup(x,y,z,mat='ceramic'):
    cone('Cup body',(x,y,z+.055),.048,.053,.11,mat)
    cylinder('Dark drink surface',(x,y,z+.111),.043,.004,'walnut')
    points=[]
    for index in range(15):
        angle=-math.pi/2+index*math.pi/14
        points.append((x+.053+math.cos(angle)*.028,y,z+.057+math.sin(angle)*.041))
    tube('Cup handle',points,.007,mat)


def reception():
    box('Reception toe recess',(0,.03,.105),(1.78,.76,.19),'dark',.01)
    box('Reception cabinet',(0,.01,.49),(1.92,.89,.71),'oak',.018)
    box('Stone counter edge',(0,0,.885),(1.99,.99,.08),'stone',.012)
    for x in [-.48,.48]:
        for z in [.30,.58]:
            box('Drawer front',(x,-.448,z),(.92,.035,.245),'walnut',.008)
            box('Drawer pull',(x,-.474,z+.055),(.23,.038,.015),'brass',.006)
    cylinder('Display pedestal',(-.27,.12,.96),.10,.025,'metal')
    box('Display upright',(-.27,.15,1.075),(.045,.045,.22),'metal',.006)
    box('Monitor bezel',(-.27,.18,1.25),(.60,.055,.34),'black',.012)
    box('Blank monitor glass',(-.27,.147,1.25),(.55,.009,.29),'screen',.005)
    box('Keyboard body',(-.24,-.24,.94),(.48,.16,.023),'dark',.008)
    for row in range(4):
        for column in range(11):
            box('Unlettered keyboard key',(-.45+column*.042,-.29+row*.034,.958),(.035,.026,.011),'black',.003)
    box('Mouse pad',(.27,-.24,.931),(.20,.20,.007),'teal',.004)
    sphere('Mouse',(.27,-.24,.956),(.035,.055,.024),'black')
    plant(.76,.28,.93,.62)
    cup(.65,-.25,.93)


def bottle(x,y,z,mat='green',height=.30):
    profile=[(.065,0),(.073,.015),(.073,.19),(.040,.235),(.025,.25),(.025,.29),(.031,.29),(.031,.31)]
    segments=12
    vertices=[]
    for radius,h in profile:
        for index in range(segments):
            angle=index*math.tau/segments
            vertices.append((x+radius*math.cos(angle),y+radius*math.sin(angle),z+h*height/.31))
    faces=[]
    for ring in range(len(profile)-1):
        for index in range(segments):
            following=(index+1)%segments
            faces.append((ring*segments+index,ring*segments+following,(ring+1)*segments+following,(ring+1)*segments+index))
    faces.extend([tuple(reversed(range(segments))),tuple((len(profile)-1)*segments+i for i in range(segments))])
    mesh=bpy.data.meshes.new('Turned glass bottle mesh')
    mesh.from_pydata(vertices,[],faces)
    mesh.update()
    obj=bpy.data.objects.new('Unmarked glass bottle',mesh)
    bpy.context.scene.collection.objects.link(obj)
    finish(obj,obj.name,mat)


def stocked_aisle():
    for sx in [-.535,.535]:
        for y in [-2.9,-1.45,0,1.45,2.9]:
            box('Shelf upright',(sx,y,.97),(.047,.047,1.94),'dark',.005)
    box('Shelf centre divider',(0,0,1.03),(.035,5.88,1.86),'oak',.004)
    for z in [.25,.72,1.19,1.66,1.92]:
        box('Double-sided oak shelf',(0,0,z),(1.16,5.94,.05),'oak',.007)
        for side in [-1,1]:
            box('Shelf retaining edge',(side*.575,0,z+.035),(.021,5.94,.033),'brass',.003)
    palette=['paper','blue','red','green']
    for level,z in enumerate([.279,.749,1.219]):
        for side in [-1,1]:
            for index in range(12):
                x=side*.32
                y=-2.66+index*.48
                kind=(level+index+(side==1))%4
                if kind==0:
                    for shift in [-.08,.08]:
                        bottle(x+shift,y,z,'green',.31)
                elif kind==1:
                    cylinder('Unmarked food tin',(x,y,z+.125),.115,.25,'metal')
                    cylinder('Tin lid bead',(x,y,z+.254),.118,.01,'brass')
                else:
                    box('Unmarked stocked package',(x,y,z+.16),(.24,.31,.32),palette[(index+level)%4],.009)
                    box('Folded package seam',(x,y,z+.321),(.24,.022,.012),'paper',.002)


def sink(x,y,z,width=.78,depth=.55):
    # Four rim strips surround a real recessed basin rather than covering a slab.
    for side in [-1,1]:
        box('Sink side rim',(x+side*width/2,y,z),(.028,depth+.045,.025),'metal',.007)
        box('Sink end rim',(x,y+side*depth/2,z),(width,.025,.025),'metal',.006)
    box('Basin bottom',(x,y,z-.17),(width-.07,depth-.07,.025),'metal',.025)
    for side in [-1,1]:
        box('Basin side',(x+side*(width/2-.027),y,z-.083),(.026,depth-.02,.17),'metal',.007)
        box('Basin end',(x,y+side*(depth/2-.027),z-.083),(width-.03,.026,.17),'metal',.007)
    cylinder('Sink drain',(x,y,z-.153),.040,.006,'dark')
    points=[(x,y+depth/2+.08,z),(x,y+depth/2+.08,z+.22)]
    for index in range(13):
        angle=index*math.pi/12
        points.append((x,y+depth/2+.08-.12*(1-math.cos(angle)),z+.22+.12*math.sin(angle)))
    tube('Curved mixer faucet',points,.018,'metal')
    cylinder('Mixer base',(x+.16,y+depth/2+.08,z+.035),.031,.07,'metal')
    box('Mixer lever',(x+.19,y+depth/2+.07,z+.078),(.10,.027,.023),'metal',.006)


def kitchen():
    # Overall extents stay inside the existing 5 x 1.4 metre collider.
    box('Fridge insulated body',(-1.91,.015,1.065),(1.02,1.20,2.10),'ceramic',.045)
    for cz,dh in [(1.62,.86),(.64,1.06)]:
        box('Fridge dark door gasket',(-1.91,-.596,cz),(.95,.028,dh),'black',.01)
        box('Fridge enamel door',(-1.91,-.622,cz),(.92,.063,dh-.04),'ceramic',.035)
        box('Fridge vertical handle',(-1.55,-.665,cz),(.034,.055,.41),'metal',.013)
    box('Fridge toe grille',(-1.91,-.604,.068),(.9,.018,.07),'dark',.008)
    for index in range(12):
        box('Fridge grille slot',(-2.30+index*.071,-.617,.068),(.014,.006,.056),'metal',.001)
    # Cabinet carcass has no top beneath the sink opening.
    box('Kitchen toe kick',(.59,.04,.10),(3.68,1.12,.19),'dark',.008)
    box('Kitchen bottom panel',(.59,.01,.23),(3.69,1.22,.065),'oak',.01)
    box('Kitchen back panel',(.59,.61,.56),(3.69,.035,.68),'oak',.008)
    for x in [-1.255,-.48,.30,1.10,1.87,2.435]:
        box('Cabinet vertical partition',(x,.015,.55),(.035,1.19,.68),'oak',.006)
    for cx,w in [(-.87,.70),(-.09,.72),(.69,.72),(2.15,.51)]:
        box('Inset oak cabinet door',(cx,-.61,.56),(w,.043,.63),'oak',.01)
        box('Brass cabinet pull',(cx,-.648,.79),(.22,.033,.014),'brass',.005)
    # Segmented worktop leaves the sink cavity genuinely open.
    sx=-.65; sy=.13; sw=.82; sd=.59
    left=-1.31; right=2.49; front=-.68; back=.68
    for cx,cy,w,d in [((left+sx-sw/2)/2,0,sx-sw/2-left,1.36),((sx+sw/2+right)/2,0,right-sx-sw/2,1.36),(sx,(front+sy-sd/2)/2,sw,sy-sd/2-front),(sx,(sy+sd/2+back)/2,sw,back-sy-sd/2)]:
        box('Honed stone worktop',(cx,cy,.93),(w,d,.068),'stone',.009)
    sink(sx,sy,.965,.78,.55)
    box('Oven stainless front',(1.49,-.635,.57),(.68,.052,.59),'metal',.014)
    box('Oven dark glass',(1.49,-.669,.51),(.54,.017,.35),'black',.018)
    box('Oven inner glass',(1.49,-.680,.51),(.44,.006,.25),'screen',.012)
    box('Oven door handle',(1.49,-.672,.77),(.48,.04,.027),'metal',.011)
    for x in [1.32,1.65]:
        for y in [-.25,.21]:
            cylinder('Cooktop ceramic ring',(x,y,.973),.131,.015,'black',24)
            cylinder('Cooktop inset',(x,y,.982),.094,.006,'dark',24)
    for x in [1.23,1.40,1.57,1.74]:
        cylinder('Unmarked cooker knob',(x,-.678,.82),.026,.028,'black',16,(math.pi/2,0,0))
    box('Microwave case',(.53,.37,1.17),(.90,.50,.39),'metal',.025)
    box('Microwave dark door',(.43,.109,1.18),(.63,.022,.28),'black',.015)
    box('Microwave glass',(.41,.094,1.18),(.48,.006,.19),'screen',.008)
    box('Microwave pull',(.74,.077,1.17),(.025,.045,.21),'metal',.009)
    for z in [1.09,1.17,1.25]:
        cylinder('Unlettered microwave button',(.89,.10,z),.015,.012,'black',12,(math.pi/2,0,0))
    box('Oak chopping board',(2.12,.20,.979),(.49,.58,.024),'walnut',.034)
    cup(2.07,.18,.992)
    bottle(-1.16,.38,.970,'green',.29)


def table(width=1.6,depth=.8,height=.47):
    box('Table softened oak top',(0,0,height),(width,depth,.07),'oak',.035)
    for x in [-width/2+.13,width/2-.13]:
        for y in [-depth/2+.12,depth/2-.12]:
            cylinder('Table tapered foot',(x,y,height/2),.029,height-.02,'dark')
    box('Closed unmarked book',(-.27,.05,height+.055),(.38,.27,.032),'blue',.007,rotation=.12)
    box('Book page block',(-.27,.05,height+.073),(.35,.245,.015),'paper',.003,rotation=.12)
    cup(.32,-.06,height+.04)


def chair(x,y,angle=0):
    with group('Dining chair',x,y,angle):
        for cx in [-.16,.16]:
            for cy in [-.15,.15]:
                box('Chair oak leg',(cx,cy,.23),(.039,.039,.46),'walnut',.009)
        box('Chair upholstered seat',(0,0,.46),(.43,.40,.075),'linen',.03)
        box('Chair upholstered back',(0,.167,.72),(.42,.075,.44),'teal',.028)


def table_lamp(x,y,z):
    cylinder('Lamp round base',(x,y,z+.015),.105,.03,'brass',24)
    cylinder('Lamp slim stem',(x,y,z+.18),.015,.31,'brass')
    cone('Linen lampshade',(x,y,z+.38),.17,.10,.23,'linen')
    cylinder('Warm lamp diffuser',(x,y,z+.269),.148,.015,'light',24)


def bed():
    for x in [-.76,.76]:
        for y in [-1,1]:
            cylinder('Bed timber foot',(x,y,.11),.045,.22,'walnut')
    box('Bed upholstered base',(0,0,.25),(1.94,2.36,.24),'teal',.06)
    box('Thick mattress',(0,-.035,.47),(1.80,2.24,.27),'linen',.095)
    box('Padded headboard',(0,1.18,.74),(2.01,.14,1.26),'teal',.075)
    for x in [-.48,0,.48]:
        box('Headboard upholstery seam',(x,1.102,.85),(.010,.008,.96),'linen',.002)
    # A shaped quilt surface with draped edges and shallow stitched channels.
    vertices=[]; faces=[]; count=28
    for row in range(count+1):
        for column in range(count+1):
            x=-.94+column*1.88/count
            y=-1.18+row*1.65/count
            drop=max(0,abs(x)-.80)*.72 + max(0,-y-1.04)*.60
            fold=.013*math.sin(x*18+y*6)+.006*math.sin(y*26+x*4)
            vertices.append((x,y,.635-drop+fold))
    for row in range(count):
        for column in range(count):
            p=row*(count+1)+column
            faces.append((p,p+1,p+count+2,p+count+1))
    mesh=bpy.data.meshes.new('Draped stitched quilt mesh')
    mesh.from_pydata(vertices,[],faces); mesh.update()
    obj=bpy.data.objects.new('Draped duvet',mesh)
    bpy.context.scene.collection.objects.link(obj)
    finish(obj,obj.name,'rust'); planar_uv(obj,.5)
    for polygon in mesh.polygons:
        polygon.use_smooth=True
    for side in [-1,1]:
        obj=box('Bed pillow',(side*.43,.76,.66),(.71,.43,.18),'linen',.095)
        obj.rotation_euler.z=side*.04
        box('Nightstand cabinet',(side*1.29,.77,.29),(.56,.62,.53),'oak',.02)
        box('Nightstand drawer',(side*1.29,.444,.35),(.49,.036,.22),'walnut',.008)
        cylinder('Nightstand drawer knob',(side*1.29,.418,.37),.019,.028,'brass',12,(math.pi/2,0,0))
        table_lamp(side*1.29,.78,.565)


def wardrobe():
    box('Tall oak wardrobe carcass',(0,0,1.11),(1.20,1.02,2.20),'oak',.025)
    for side in [-1,1]:
        box('Wardrobe recessed door',(side*.29,-.527,1.15),(.555,.035,2.03),'walnut',.012)
        box('Wardrobe inset linen panel',(side*.29,-.550,1.15),(.435,.016,1.83),'linen',.012)
        box('Wardrobe brass pull',(side*.054,-.575,1.1),(.020,.05,.31),'brass',.008)
    box('Wardrobe toe recess',(0,-.535,.061),(1.08,.016,.084),'dark',.006)


def vanity():
    box('Vanity cabinet',(0,0,.47),(1.61,1.04,.85),'oak',.03)
    for side in [-1,1]:
        box('Vanity door',(side*.394,-.534,.49),(.747,.030,.70),'walnut',.013)
        box('Vanity brass pull',(side*.394,-.558,.74),(.22,.027,.014),'brass',.005)
    box('Vanity stone top',(0,0,.926),(1.69,1.13,.07),'stone',.014)
    # Raised vessel sink has a genuinely open interior.
    sink(0,0,1.10,.76,.50)
    bottle(.59,.16,.968,'green',.22)
    box('Folded bath towel',(-.57,-.05,1.002),(.39,.43,.070),'linen',.034)


def shower():
    box('Shower low tray',(0,0,.078),(1.76,1.66,.145),'ceramic',.035)
    for side in [-1,1]:
        box('Shower tray rim',(side*.84,0,.17),(.055,1.60,.045),'ceramic',.012)
        box('Shower tray rim',(0,side*.79,.17),(1.70,.055,.045),'ceramic',.012)
    cylinder('Shower drain',(0,0,.154),.055,.007,'metal')
    for x in [-.85,.85]:
        for y in [-.80,.80]:
            box('Shower glazing post',(x,y,1.24),(.032,.032,2.2),'metal',.005)
    for x in [-.844,.844]:
        box('Shower side glass',(x,0,1.26),(.008,1.56,2.14),'glass',0)
    box('Shower rear glass',(0,.794,1.26),(1.66,.008,2.14),'glass',0)
    for x in [-.423,.423]:
        box('Shower sliding glass',(x,-.795,1.26),(.826,.008,2.14),'glass',0)
        box('Shower sliding handle',(x/5,-.83,1.18),(.021,.04,.28),'metal',.009)
    for y in [-.80,.80]:
        box('Shower header',(0,y,2.34),(1.73,.04,.04),'metal',.007)
    tube('Shower riser',[(.50,.74,.99),(.50,.74,2.19),(.50,.45,2.19)],.015,'metal')
    cylinder('Rain shower head',(.50,.44,2.17),.135,.035,'metal',24)
    cylinder('Shower mixer',(.50,.751,1.05),.065,.025,'metal',20,(math.pi/2,0,0))


def toilet():
    box('Toilet cistern',(0,.46,.73),(.62,.34,.69),'ceramic',.08)
    box('Cistern lid',(0,.46,1.09),(.66,.37,.045),'ceramic',.017)
    cylinder('Flush button',(0,.47,1.117),.033,.010,'metal')
    sphere('Toilet pedestal',(0,-.04,.29),(.24,.39,.28),'ceramic')
    sphere('Toilet bowl',(0,-.10,.46),(.345,.51,.19),'ceramic')
    sphere('Toilet dark bowl opening',(0,-.17,.608),(.224,.329,.027),'dark')
    points=[]
    for index in range(41):
        angle=index*math.tau/40
        points.append((math.cos(angle)*.284,-.12+math.sin(angle)*.416,.63))
    tube('Toilet seat ring',points,.037,'ceramic',True)


def architecture(key):
    layout=LAYOUTS[key]; w=layout['width']/2; d=layout['depth']/2
    with group('Architectural shell'):
        floor=box('Floor slab',(0,0,-.065),(layout['width'],layout['depth'],.13),'oak' if key=='home' else 'floor',.006)
        planar_uv(floor,2 if key=='home' else 1.5)
        exterior=[[-w,-d,-w,d],[w,-d,w,d],[-w,d,w,d],[-w,-d,-1,-d],[1,-d,w,-d]]
        for segment in exterior+layout['walls']:
            wall(segment)
        # A roof is intentionally absent for the existing overhead game camera.
    doorway(0,-d,2)
    if key=='lobby':
        for px in [-6.5,0,6.5]:
            wall_panel(px,d-.105,2.8,glazed=True)
        for px in [-6.5,6.5]:
            wall_panel(px,-d+.105,2.2,angle=math.pi)
        for px in [-4,4]:
            doorway(px,-2,2)
        doorway(0,4,2)
        for px in [-7.8,-2.8,2.8,7.8]:
            sconce(px,d-.12)
        rug(0,-4.6,5.2,3.5)
        rug(-6.5,4.7,4.1,4.2); rug(6.5,4.7,4.1,4.2)
    elif key=='shop':
        doorway(0,3,2)
        for px in [-4.8,4.8]:
            wall_panel(px,-d+.105,2.8,angle=math.pi,glazed=True)
            sconce(px,d-.12)
        rug(0,-6.4,2.5,1.1)
    else:
        for px,pw in [(-3.4,3.1),(4.7,2.4)]:
            wall_panel(px,d-.105,pw,glazed=True)
        wall_panel(-4.5,-d+.105,3.1,angle=math.pi,glazed=True)
        doorway(-.25,1,1.5)
        doorway(2,-3.35,1.3,math.pi/2)
        doorway(2,2.6,1.2,math.pi/2)
        doorway(3.8,0,1.2)
        rug(-4.8,-2.0,3.65,3.3)
        rug(4.6,3.8,3.8,3.5)
        with group('Bathroom finishes'):
            floor=box('Porcelain bathroom floor',(4.50,-3,.005),(4.78,5.78,.018),'tile',.002)
            planar_uv(floor,.8)
        wall_panel(5.90,-5.895,1.8,angle=math.pi,glazed=True)
        for px in [-6.2,.7,5.8]:
            sconce(px,d-.12)


def furnishings(key):
    if key=='lobby':
        for x in [-6.5,6.5]:
            with group('Detailed upholstered sofa',x,5):
                sofa()
        with group('Reception desk and equipment',0,7):
            reception()
    elif key=='shop':
        for x in [-4,4]:
            with group('Stocked shop aisle',x,-1):
                stocked_aisle()
        with group('Back room kitchenette',0,6):
            kitchen()
    else:
        with group('Living room sofa',-4.8,-2.8):
            sofa(3,1.6)
        with group('Coffee table and objects',-4.8,-.65):
            table()
        with group('Kitchen and appliances',-3.6,5):
            kitchen()
        with group('Dining table',-3.9,2.6):
            table(1.52,.68,.77)
        # Chairs are wholly within the dining group's 2.4 x 1.3 collider.
        chair(-4.85,2.6,math.pi/2)
        chair(-2.95,2.6,-math.pi/2)
        chair(-3.9,2.15,math.pi)
        chair(-3.9,3.05,0)
        with group('Bed nightstands and lamps',4.6,3.85):
            bed()
        with group('Bedroom wardrobe',6.37,.88,math.pi/2):
            wardrobe()
        with group('Bathroom vanity',5.9,-5.3,math.pi):
            vanity()
        with group('Shower enclosure',5.92,-1.45):
            shower()
        with group('Toilet fixture',3.45,-5.15,math.pi):
            toilet()


def lighting_and_camera(key):
    scene=bpy.context.scene
    if scene.world is None:
        scene.world=bpy.data.worlds.new('Interior preview environment')
    scene.world.color=(.25,.25,.25)
    scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.45,.54,.63,1)
    scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.5
    with group('Preview lighting and cameras'):
        for name,position,energy,size,color in [('Large soft daylight',(0,-1,12),2100,10,(1,.93,.80)),('Cool window fill',(-7,4,7),1300,8,(.77,.86,1)),('Warm room fill',(6,3,6),900,6,(1,.79,.56))]:
            data=bpy.data.lights.new(name,'AREA'); data.energy=energy; data.shape='DISK'; data.size=size; data.color=color
            obj=bpy.data.objects.new(name,data); bpy.context.scene.collection.objects.link(obj); place_in_collection(obj)
            obj.location=position
            obj.rotation_euler=(Vector((0,0,.3))-obj.location).to_track_quat('-Z','Y').to_euler()
        data=bpy.data.cameras.new('Interior overview camera')
        camera=bpy.data.objects.new('Interior overview camera',data)
        bpy.context.scene.collection.objects.link(camera); place_in_collection(camera)
        camera.location=(19,-24,28)
        camera.rotation_euler=(Vector((0,0,.7))-camera.location).to_track_quat('-Z','Y').to_euler()
        data.type='ORTHO'; data.ortho_scale=max(LAYOUTS[key]['width'],LAYOUTS[key]['depth'])*1.60
        scene.camera=camera
    scene.render.engine='CYCLES'
    scene.cycles.samples=24
    scene.cycles.use_denoising=True
    scene.render.threads_mode='FIXED'; scene.render.threads=4
    scene.render.resolution_x=1200; scene.render.resolution_y=960; scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG'
    scene.render.film_transparent=False
    scene.view_settings.view_transform='AgX'
    return camera


def export_model(key):
    bpy.ops.object.select_all(action='DESELECT')
    exportables=[obj for obj in bpy.context.scene.objects if obj.type in {'MESH','CURVE'}]
    for obj in exportables:
        obj.select_set(True)
    depsgraph=bpy.context.evaluated_depsgraph_get()
    triangles=0
    for obj in exportables:
        evaluated=obj.evaluated_get(depsgraph)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        triangles+=len(mesh.loop_triangles)
        evaluated.to_mesh_clear()
    if triangles>100000:
        raise RuntimeError(f'{key} exceeds 100,000 triangles: {triangles}')
    bpy.ops.wm.save_as_mainfile(filepath=str(EDITABLE/f'{key}.blend'))
    # Save the editable source first. Apply and join a transient export copy by
    # material to avoid hundreds of separate draw calls in Cesium.
    bpy.context.view_layer.objects.active=exportables[0]
    bpy.ops.object.convert(target='MESH')
    by_material={}
    for obj in [obj for obj in bpy.context.selected_objects if obj.type=='MESH']:
        name=obj.data.materials[0].name if obj.data.materials else 'None'
        by_material.setdefault(name,[]).append(obj)
    for name,objects in by_material.items():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active=objects[0]
        if len(objects)>1:
            bpy.ops.object.join()
        bpy.context.object.name=f'{key} / {name}'
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type=='MESH':
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT/f'{key}.glb'),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=False,export_texcoords=True,export_normals=True,export_materials='EXPORT',export_animations=False)
    record={'layout':key,'triangles':triangles,'materialGroups':len(by_material),'bytes':(OUT/f'{key}.glb').stat().st_size,'editable':f'assets/interiors/{key}.blend','model':f'public/models/interiors/{key}.glb'}
    (OUT/f'{key}.ready.json').write_text(json.dumps(record,indent=2),encoding='utf-8')
    log(f'EXPORTED {key}: {triangles} triangles, {len(by_material)} material groups')
    return record


def build():
    LOG.write_text('',encoding='utf-8')
    bpy.context.preferences.filepaths.save_version=0
    for marker in ['build-error.json','build-complete.json','models-ready.json']:
        (OUT/marker).unlink(missing_ok=True)
    (OUT/'layout-contract.json').write_text(json.dumps({'coordinateSystem':'metres, Blender X east / Y north / Z up; glTF Y-up conversion is exported','floorHeight':0,'wallHeight':2.9,'wallThickness':.18,'ceiling':'open for current overhead camera','entry':'south boundary, x=0, width=2 metres','source':'Authored game interiors, not surveyed interiors','layouts':LAYOUTS},indent=2),encoding='utf-8')
    records=[]
    for key in ['lobby','shop','home']:
        log(f'BUILD {key}')
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system='METRIC'
        materials(); architecture(key); furnishings(key); lighting_and_camera(key)
        bpy.context.view_layer.update()
        records.append(export_model(key))
    (OUT/'models-ready.json').write_text(json.dumps({'blender':bpy.app.version_string,'models':records,'seconds':time.time()-START},indent=2),encoding='utf-8')
    log('ALL MODELS EXPORTED; starting visual previews')
    for key in ['lobby','shop','home']:
        bpy.ops.wm.open_mainfile(filepath=str(EDITABLE/f'{key}.blend'))
        bpy.context.scene.render.filepath=str(OUT/f'{key}-preview.png')
        bpy.ops.render.render(write_still=True)
        log(f'RENDERED {key} overview')
    (OUT/'build-complete.json').write_text(json.dumps({'ok':True,'blender':bpy.app.version_string,'models':records,'seconds':time.time()-START},indent=2),encoding='utf-8')
    log('COMPLETE')


try:
    build()
except Exception:
    error=traceback.format_exc()
    log(error)
    (OUT/'build-error.json').write_text(json.dumps({'error':error,'seconds':time.time()-START},indent=2),encoding='utf-8')
    raise
