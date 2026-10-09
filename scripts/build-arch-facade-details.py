"""Author depth on source 2740's photographed north facade.

Window rectangles are manually traced in original atlas pixels. The source mesh
and original photography remain unchanged; this is a separate game-detail mesh.
Obscured ground-floor stonework is interpreted, not a survey reconstruction.
"""
import hashlib
import json
import math
from pathlib import Path
import struct

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'public/models/city'
source = OUT/'source-2740.glb'
raw = source.read_bytes()
size = struct.unpack_from('<I', raw, 12)[0]
doc = json.loads(raw[20:20+size])
binary = raw[28+size:]
primitive = doc['meshes'][0]['primitives'][0]

def values(name, width):
    a = doc['accessors'][primitive['attributes'][name]]
    v = doc['bufferViews'][a['bufferView']]
    return [struct.unpack_from('<'+'f'*width, binary,
            v['byteOffset']+a.get('byteOffset',0)+i*width*4) for i in range(a['count'])]

points = values('POSITION',3)
uv = [(u*4096,v*2048) for u,v in values('TEXCOORD_0',2)]

def sub(a,b): return tuple(x-y for x,y in zip(a,b))
def add(a,b): return tuple(x+y for x,y in zip(a,b))
def scale(a,s): return tuple(x*s for x in a)
def cross(a,b): return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def unit(a): return scale(a,1/math.sqrt(sum(x*x for x in a)))

def surface(pixel):
    x,y = pixel
    for i in range(0,len(points),3):
        p = points[i:i+3]
        if max(v[2] for v in p)>-40: continue
        (ax,ay),(bx,by),(cx,cy) = uv[i:i+3]
        det = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(det)<1e-7: continue
        u = ((by-cy)*(x-cx)+(cx-bx)*(y-cy))/det
        v = ((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/det
        w = 1-u-v
        if min(u,v,w)>=-1e-6:
            return tuple(p[0][j]*u+p[1][j]*v+p[2][j]*w for j in range(3))
    raise ValueError(f'No north facade source triangle at atlas pixel {pixel}')

groups = {name:[] for name in ('limestone','bronze','glass')}
normals = {name:[] for name in groups}
receipts = []

def triangle(kind,p):
    c=cross(sub(p[1],p[0]),sub(p[2],p[0]))
    if sum(v*v for v in c)<1e-16:return
    normal=unit(c)
    if normal[2]>0:p=[p[0],p[2],p[1]];normal=scale(normal,-1)
    for vertex in p:
        groups[kind].extend(vertex);normals[kind].extend(normal)

def surface_patch(kind,rect,depth):
    """Clip the actual source triangles in UV space before adding surface depth.

    A quad connecting just four sampled corners cuts through stepped source
    walls. Piecewise projection preserves those source steps inside each panel.
    All pieces share one extrusion vector so adjacent triangle seams stay shut.
    """
    l,t,r,b=rect
    offset=(0,0,-depth)
    covered=0.0
    for i in range(0,len(points),3):
        p=points[i:i+3];coords=uv[i:i+3]
        if max(v[2] for v in p)>-40:continue
        if max(v[0] for v in coords)<l or min(v[0] for v in coords)>r:continue
        if max(v[1] for v in coords)<t or min(v[1] for v in coords)>b:continue
        poly=[(*q,*v) for q,v in zip(coords,p)]
        for axis,limit,sign in [(0,l,1),(0,r,-1),(1,t,1),(1,b,-1)]:
            out=[]
            for a,z in zip(poly,poly[1:]+poly[:1]):
                da=(a[axis]-limit)*sign;dz=(z[axis]-limit)*sign
                if da>=0:out.append(a)
                if (da>=0)!=(dz>=0):
                    f=da/(da-dz)
                    out.append(tuple(x+(y-x)*f for x,y in zip(a,z)))
            poly=out
            if len(poly)<3:break
        if len(poly)<3:continue
        covered+=abs(sum(a[0]*z[1]-z[0]*a[1] for a,z in zip(poly,poly[1:]+poly[:1])))*.5
        front=[add(v[2:],offset) for v in poly]
        for j in range(1,len(front)-1):triangle(kind,[front[0],front[j],front[j+1]])
    expected=(r-l)*(b-t)
    assert abs(covered-expected)<max(1e-5,expected*1e-6), f'Incomplete or overlapping source UV coverage: {rect}: {covered}/{expected}'

def quad(kind,p):
    normal = unit(cross(sub(p[1],p[0]),sub(p[2],p[0])))
    for i in (0,1,2,0,2,3):
        groups[kind].extend(p[i]); normals[kind].extend(normal)

def panel(kind,rect,depth):
    l,t,r,b = rect
    # Counterclockwise from outside. Original source images use downward V.
    base = [surface(q) for q in ((l,b),(r,b),(r,t),(l,t))]
    normal = unit(cross(sub(base[1],base[0]),sub(base[2],base[0])))
    # The source has angled returns beside its center bay (about 36 degrees).
    # Accept those photographed returns while rejecting back-facing panels.
    assert normal[2] < -.5, f'Detail must project away from north facade: {rect}, {normal}'
    front = [add(p,(0,0,-depth)) for p in base]
    surface_patch(kind,rect,depth)
    for i in range(4):
        j=(i+1)%4
        quad(kind,[base[j],base[i],front[i],front[j]])

def frame(rect, glazed=True, divisions=3):
    l,t,r,b = rect
    # 1.5 atlas pixels = approximately 9-12 cm on these observed facade bays.
    edge=1.5
    if glazed:
        panel('glass',(l+edge,t+edge,r-edge,b-edge),.035)
    panel('bronze',(l,t,r,t+edge),.11)
    panel('bronze',(l,b-edge,r,b),.11)
    panel('bronze',(l,t+edge,l+edge,b-edge),.11)
    panel('bronze',(r-edge,t+edge,r,b-edge),.11)
    # Raised stone sill projects past the frame; vertical reveals remain visible.
    panel('limestone',(l-1,b,r+1,b+2),.23)
    # Thin physical glazing subdivisions follow the visible source window banks.
    for k in range(1,divisions):
        mid=l+(r-l)*k/divisions
        panel('bronze',(mid-.35,t+edge,mid+.35,b-edge),.10)
    mid=(t+b)/2
    panel('bronze',(l+edge,mid-.35,r-edge,mid+.35),.10)
    receipts.append({'kind':'photo-traced window surround','atlasRectangle':rect})

# Trace the five broad banks separately: the center bays are narrower and have
# their own paired openings, rather than extending a generic tower window grid.
window_banks=[(126,164),(174,207),(299,337),(352,389),(412,434)]
for top,bottom in [(95,136),(164,208),(237,279),(310,348),(378,427),(452,493)]:
    for left,right in window_banks:
        frame((left,top,right,bottom))

def stone_courses(left,right,top,bottom,course=8,depth=.15):
    """Project physical masonry onto the observed plane, with open mortar joints."""
    y=top
    row=0
    while y<bottom:
        # Running bond, approximately 65cm blocks on this photograph's scale.
        cuts=[left]+[x for x in range(int(left)-8,math.ceil(right)+8,8)
                     if left<x+(4 if row%2 else 0)<right]+[right]
        cuts=[cuts[0]]+[x+(4 if row%2 else 0) for x in cuts[1:-1]]+[cuts[-1]]
        for a,b in zip(cuts,cuts[1:]):
            if b-a>.3:
                panel('limestone',(a+.07,y+.08,b-.07,min(y+course-.08,bottom)),depth)
        row+=1; y+=course

# Visible vertical pier positions and horizontal spandrel bands in the source.
# Their masonry joints are authored surface interpretation, not measured joints.
for left,right in [(103,124),(165.5,172.5),(208.5,229),(280,297.5),
                   (338.5,350.5),(390.5,410.5),(435,437)]:
    stone_courses(left,right,76,510,course=9,depth=.12)
for top,bottom in [(77,93),(139,162),(211,235),(282,308),(351,376),(430,450),(496,510)]:
    for left,right in [(125,208),(298,435)]:
        stone_courses(left,right,top,bottom,course=8,depth=.12)
    # Projecting trim catches real light and separates the photographed floors.
    for left,right in [(103,220),(290,437)]:
        panel('limestone',(left,bottom-1.2,right,bottom),.23)

# Central narrow window groups retain the building's distinct center strip.
for top,bottom in [(113,137),(184,209),(256,279),(326,349),(396,427),(466,493)]:
    for left,right in [(236,245),(251,260),(266,275)]:
        frame((left,top,right,bottom),divisions=1)
for left,right in [(230,234),(246.5,249.5),(261.5,264.5),(277,279)]:
    stone_courses(left,right,92,508,course=8,depth=.16)
for top,bottom in [(94,109),(140,181),(212,253),(282,323),(352,393),(430,463),(496,508)]:
    stone_courses(230,279,top,bottom,course=8,depth=.14)

# Roofline silhouette: cornice tiers and observed repeated short vertical fins.
for rect,depth in [((103,17,437,23),.35),((103,24,437,29),.24),
                   ((103,69,437,74),.32),((103,74,437,78),.21)]:
    panel('limestone',rect,depth)
for left,right in window_banks:
    frame((left,33,right,66),divisions=3)
    for x in range(left+3,right,8):
        panel('limestone',(x,30,x+2,48),.29)
receipts.append({'kind':'source-aligned north facade piers, window banks and cornice',
                 'basis':'Visible atlas north elevation; masonry joint spacing interpreted'})

# Ground level is partly hidden in the historical image. Reuse the visible pier
# alignment instead of copying its photographed roof/shadow onto new 3D objects.
for left,right in [(103,124),(165.5,172.5),(208.5,229),(280,297.5),
                   (338.5,350.5),(390.5,410.5),(435,437)]:
    stone_courses(left,right,519,638,course=8,depth=.19)
for left,right in [(103,229),(280,437)]:
    panel('limestone',(left,511,right,518),.28)
    panel('limestone',(left,635,right,640),.27)
for left,right in window_banks:
    # Glazing is reconstructed on the original dark ground-floor bay, keeping
    # its placement while adding real frames and depth. No interior is claimed.
    panel('glass',(left,527,right,636),.03)
    frame((left,527,right,636))
# Central entrance is an explicit interpretation of the occluded source base.
# Recessed double doors and transom give a human-scale entrance, no interior yet.
stone_courses(230,239,519,638,depth=.22)
stone_courses(269,279,519,638,depth=.22)
panel('limestone',(230,519,279,524),.35)
panel('limestone',(239,611,269,614),.22)
frame((240,527,268,609),divisions=2)
frame((240,615,254,638),divisions=1)
frame((255,615,268,638),divisions=1)
for x in (252,257):
    panel('bronze',(x,625,x+.45,632),.25)
panel('limestone',(239,638,269,640),.4)
receipts.append({'kind':'interpreted ground-floor piers, lintel and glazing',
                 'basis':'Visible upper pier/bay alignment; lower source photo is obscured',
                 'notSurveyed':True})

result = {'asset':{'version':'2.0','generator':'Philadelphia source-guided facade relief'},
          'scene':0,'scenes':[{'nodes':[0]}],
          'nodes':[{'name':'Source 2740 north facade physical detail','mesh':0}],
          'meshes':[{'primitives':[]}], 'buffers':[], 'bufferViews':[], 'accessors':[],
          'materials':[
              {'name':'Arch facade limestone','pbrMetallicRoughness':{'baseColorFactor':[.55,.50,.40,1],'roughnessFactor':.86,'metallicFactor':0}},
              {'name':'Arch facade dark bronze','pbrMetallicRoughness':{'baseColorFactor':[.07,.055,.035,1],'roughnessFactor':.38,'metallicFactor':.65}},
              {'name':'Arch facade recessed glazing','pbrMetallicRoughness':{'baseColorFactor':[.045,.085,.10,1],'roughnessFactor':.19,'metallicFactor':.4}}],
          'extras':{'origin':doc['extras']['origin'],'sourceObjectId':2740,
                    'status':'Source-guided physical detail; obscured ground floor interpreted'}}
chunks=[]; offset=0
for material,(kind,flat) in enumerate(groups.items()):
    attrs={}
    for name,array in [('POSITION',flat),('NORMAL',normals[kind])]:
        payload=struct.pack('<'+'f'*len(array),*array)
        view=len(result['bufferViews']); result['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':len(payload),'target':34962})
        chunks.append(payload); offset+=len(payload)
        accessor={'bufferView':view,'componentType':5126,'count':len(array)//3,'type':'VEC3'}
        if name=='POSITION':
            accessor['min']=[min(array[j::3]) for j in range(3)]
            accessor['max']=[max(array[j::3]) for j in range(3)]
        attrs[name]=len(result['accessors']); result['accessors'].append(accessor)
    result['meshes'][0]['primitives'].append({'attributes':attrs,'mode':4,'material':material})
result['buffers']=[{'byteLength':offset}]
js=json.dumps(result,separators=(',',':')).encode(); js+=b' '*((-len(js))%4)
binout=b''.join(chunks)
glb=struct.pack('<4sII',b'glTF',2,28+len(js)+len(binout))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binout),0x004e4942)+binout
output=OUT/'arch-street-facade-details.glb'; output.write_bytes(glb)
report={'output':str(output.relative_to(ROOT)),'sha256':hashlib.sha256(glb).hexdigest(),
        'originalMeshSha256':hashlib.sha256(raw).hexdigest(),'sourceObjectId':2740,
        'origin':doc['extras']['origin'],'triangles':sum(len(v)//9 for v in groups.values()),
        'sourceAtlasSize':[4096,2048],'details':receipts,
        'limits':['Separate additive geometry; original mesh and photographs unchanged',
                  'Ground-floor treatment is interpreted where the photo is obscured',
                  'No interiors or final surface texture maps; visual review required']}
output.with_suffix('.provenance.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='details'},indent=2))
