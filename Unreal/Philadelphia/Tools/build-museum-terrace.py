"""Trace the retained museum photograph into native paving and a fountain basin.

Atlas coordinates are manually traced from source 2561, not a generated layout.
Only the observed terrace polygon is replaced; source faces outside it survive.
Pool vertical dimensions and micro-scale stone treatment are interpretations.
"""
from pathlib import Path
import hashlib,json,math,struct

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'Unreal/Philadelphia/SourceAssets/Museum/terrace'
SOURCE=ROOT/'public/models/city/source-2561.glb'
OUTLINE=[(508,1492),(508,1042),(648,902),(901,902),(1078,1042),(1078,1492)]
OCTAGON=[(737,1057),(850,1059),(931,1144),(931,1257),(852,1345),(740,1345),(652,1264),(652,1149)]
CENTER=(792,1202)
RIM_OUTER=82
RIM_INNER=76
GROUND_IDS=(2343,2344)

def area(p):return sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(p,p[1:]+p[:1]))*.5
def ccw(p):return p if area(p)>0 else list(reversed(p))
def half(poly,a,b,inside=True):
    result=[]
    def d(p):return ((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]))*(1 if inside else -1)
    for p,q in zip(poly,poly[1:]+poly[:1]):
        x,y=d(p),d(q)
        if x>=0:result.append(p)
        if (x>=0)!=(y>=0):result.append(tuple(v+(w-v)*x/(x-y) for v,w in zip(p,q)))
    return result
def clip(poly,bound):
    bound=ccw(bound)
    for a,b in zip(bound,bound[1:]+bound[:1]):
        if len(poly)<3:return []
        poly=half(poly,a,b)
    return poly if abs(area(poly))>1e-8 else []
def subtract(poly,bound):
    if not clip(poly,bound):return [poly]
    pieces=[];bound=ccw(bound)
    for a,b in zip(bound,bound[1:]+bound[:1]):
        if len(poly)<3:break
        out=half(poly,a,b,False)
        if len(out)>=3 and abs(area(out))>1e-8:pieces.append(out)
        poly=half(poly,a,b)
    return pieces
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def norm(v):return math.sqrt(sum(x*x for x in v))
def glb(path,doc,binary):
    binary+=b'\0'*((-len(binary))%4);doc['buffers']=[{'byteLength':len(binary)}]
    j=json.dumps(doc,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binary))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binary),0x004e4942)+binary)

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    raw=SOURCE.read_bytes();sha=hashlib.sha256(raw).hexdigest()
    assert sha=='bfec34ce9fe3f767f2cf655ee891d3c8def3831ca5198195ed8340fbe02b7de6'
    size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+size]);original=raw[28+size:]
    primitive=doc['meshes'][0]['primitives'][0]
    def values(name,width):
        a=doc['accessors'][primitive['attributes'][name]];v=doc['bufferViews'][a['bufferView']]
        return list(struct.iter_unpack('<'+'f'*width,original[v['byteOffset']:v['byteOffset']+v['byteLength']]))
    positions=values('POSITION',3);normals=values('NORMAL',3);coords=values('TEXCOORD_0',2);colors=values('COLOR_0',4)
    pixels=[(u*4096,v*2048) for u,v in coords]
    def weights(t,p):
        a,b,c=pixels[t*3:t*3+3];x,y=p
        d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        f=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d
        g=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d
        return f,g,1-f-g
    def project(t,p):return tuple(sum(positions[t*3+i][k]*w for i,w in enumerate(weights(t,p))) for k in range(3))
    def ground(p):
        for t in GROUND_IDS:
            if min(weights(t,p))>=-1e-5:return project(t,p)
        raise ValueError(('Point outside measured terrace ground',p))
    footprint=ccw(OUTLINE);octagon=ccw(OCTAGON)
    covered=sum(abs(area(clip(pixels[t*3:t*3+3],footprint))) for t in GROUND_IDS)
    assert abs(covered-abs(area(footprint)))<.01,(covered,area(footprint))
    # Partial replacement keeps all unselected triangle attributes unchanged.
    hidden=set(json.loads((OUT.parent/'details/source.json').read_text())['removedTriangleIds'])
    index=[];cuts=[]
    for t in range(len(positions)//3):
        if t in hidden:continue
        if t not in GROUND_IDS:
            index.extend(range(t*3,t*3+3));continue
        source_poly=pixels[t*3:t*3+3]
        inside=clip(source_poly,footprint)
        remains=subtract(source_poly,footprint)
        assert abs(sum(abs(area(p)) for p in remains)+abs(area(inside))-abs(area(source_poly)))<.01
        cuts.append({'triangle':t,'removedAtlasPixelArea':abs(area(inside)),'outsideAtlasPixelArea':sum(abs(area(p)) for p in remains)})
        for piece in remains:
            start=len(positions)
            for p in piece:
                q=project(t,p);w=weights(t,p)
                positions.append(q);coords.append((p[0]/4096,p[1]/2048))
                no=tuple(sum(normals[t*3+i][k]*f for i,f in enumerate(w)) for k in range(3));length=norm(no)
                normals.append(tuple(f/length for f in no))
                colors.append(tuple(sum(colors[t*3+i][k]*f for i,f in enumerate(w)) for k in range(4)))
            for j in range(1,len(piece)-1):index.extend([start,start+j,start+j+1])
    binary=bytearray(original)
    assert len(positions)==len(normals)==len(coords)==len(colors)
    for name,data,width in [('POSITION',positions,3),('NORMAL',normals,3),('TEXCOORD_0',coords,2),('COLOR_0',colors,4)]:
        off=len(binary);flat=[v for p in data for v in p];binary.extend(struct.pack('<'+'f'*len(flat),*flat))
        doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(binary)-off,'target':34962})
        a={'bufferView':len(doc['bufferViews'])-1,'componentType':5126,'count':len(data),'type':f'VEC{width}'}
        if name=='POSITION':a.update(min=[min(p[k] for p in data) for k in range(3)],max=[max(p[k] for p in data) for k in range(3)])
        doc['accessors'].append(a);primitive['attributes'][name]=len(doc['accessors'])-1
    off=len(binary);binary.extend(struct.pack('<'+'I'*len(index),*index))
    doc['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(binary)-off,'target':34963})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5125,'count':len(index),'type':'SCALAR'})
    primitive['indices']=len(doc['accessors'])-1
    retained=OUT/'museum-terrace-retained.glb';glb(retained,doc,binary)
    rr=retained.read_bytes();nn=struct.unpack_from('<I',rr,12)[0]
    assert rr[28+nn:28+nn+len(original)]==original
    groups={k:{'p':[],'n':[],'uv':[]} for k in ['FieldStone','PaleStone','InlayStone','Water']}
    def face(kind,ps,tex=None,wanted=(0,1,0)):
        if len(ps)<3:return
        if tex is None:tex=[(p[0]/2,p[2]/2) for p in ps]
        no=cross(sub(ps[1],ps[0]),sub(ps[2],ps[0]))
        if sum(a*b for a,b in zip(no,wanted))<0:ps=list(reversed(ps));tex=list(reversed(tex))
        for j in range(1,len(ps)-1):
            ids=[0,j,j+1];no=cross(sub(ps[j],ps[0]),sub(ps[j+1],ps[0]));length=norm(no)
            if length<1e-9:continue
            no=tuple(x/length for x in no)
            for i in ids:groups[kind]['p'].extend(ps[i]);groups[kind]['n'].extend(no);groups[kind]['uv'].extend(tex[i])
    circle=ccw([(CENTER[0]+RIM_OUTER*math.cos(i*math.tau/128),CENTER[1]+RIM_OUTER*math.sin(i*math.tau/128)) for i in range(128)])
    def surface(poly,kind,offset=.012,holes=(circle,)):
        poly=clip(poly,footprint)
        if not poly:return
        pieces=[poly]
        for hole in holes:pieces=[out for p in pieces for out in subtract(p,hole)]
        for p in pieces:
            for t in GROUND_IDS:
                piece=clip(p,pixels[t*3:t*3+3])
                if not piece:continue
                ps=[project(t,q) for q in piece]
                face(kind,[(v[0],v[1]+offset,v[2]) for v in ps],[(q[0]/16,q[1]/16) for q in piece])
    # Pale structural grid and individually clipped panel fields follow traced
    # photo lines. The photographic people and their shadows are never reused.
    surface(footprint,'PaleStone')
    xs=[512+46*i for i in range(14)];ys=[902+49.2*i for i in range(14)]
    for x0,x1 in zip(xs,xs[1:]):
        for y0,y1 in zip(ys,ys[1:]):
            surface([(x0+1,y0+1),(x1-1,y0+1),(x1-1,y1-1),(x0+1,y1-1)],'FieldStone',.015,holes=(octagon,))
    surface(octagon,'PaleStone',.019)
    # Eight photographed trapezoidal stone inlays around the circular pool.
    for i in range(8):
        theta=-math.pi/2+i*math.tau/8
        radial=(math.cos(theta),math.sin(theta));tangent=(-radial[1],radial[0])
        def pt(r,s):return (CENTER[0]+radial[0]*r+tangent[0]*s,CENTER[1]+radial[1]*r+tangent[1]*s)
        surface([pt(128,-37),pt(128,37),pt(94,23),pt(94,-23)],'InlayStone',.022)
    # The two pale meander bands have distinct observed paths and are not a
    # rectangular border invented around the entire courtyard.
    left=[(508,1393),(508,1042),(648,902),(681,918),(560,1060),(560,1393)]
    right=[(1021,1393),(1021,1060),(879,918),(901,902),(1078,1042),(1078,1393)]
    surface(left,'PaleStone',.024);surface(right,'PaleStone',.024)
    def ribbon(path,width=2.0):
        for a,b in zip(path,path[1:]):
            d=sub(b,a);length=math.hypot(*d)
            if length<1e-5:continue
            nx=-d[1]/length*width*.5;ny=d[0]/length*width*.5
            surface([(a[0]+nx,a[1]+ny),(b[0]+nx,b[1]+ny),(b[0]-nx,b[1]-ny),(a[0]-nx,a[1]-ny)],'InlayStone',.027)
    for a,b in [((535,1392),(535,1050)),((535,1050),(657,925)),((1050,1392),(1050,1050)),((1050,1050),(891,925))]:
        d=sub(b,a);length=math.hypot(*d);along=(d[0]/length,d[1]/length);side=(-along[1],along[0])
        count=max(1,round(length/24));step=length/count
        for i in range(count):
            def p(t,s):return (a[0]+along[0]*(i*step+t)+side[0]*s,a[1]+along[1]*(i*step+t)+side[1]*s)
            ribbon([p(0,-9),p(step-2,-9),p(step-2,9),p(4,9),p(4,-3),p(step-8,-3),p(step-8,3)],1.9)
    # Photographic plan dimensions are measured. The shallow basin/rim profile
    # is explicitly interpreted because a nadir photo does not measure height.
    center=ground(CENTER);base=center[1];segments=128
    rings=[]
    for radius,height in [(82,base-.03),(82,base+.20),(81.6,base+.24),(76.4,base+.24),(76,base+.20),(76,base-.50)]:
        ring=[]
        for i in range(segments):
            theta=math.tau*i/segments;q=ground((CENTER[0]+radius*math.cos(theta),CENTER[1]+radius*math.sin(theta)))
            ring.append((q[0],height,q[2]))
        rings.append(ring)
    for band,(a,b) in enumerate(zip(rings,rings[1:])):
        for i in range(segments):
            j=(i+1)%segments;mid=tuple((a[i][k]+a[j][k])*.5 for k in range(3))
            wanted=(0,1,0) if band in (1,2,3) else (mid[0]-center[0],0,mid[2]-center[2])
            if band==4:wanted=tuple(-x for x in wanted)
            tex=[(i*.5,0),(j*.5,0),(j*.5,.2),(i*.5,.2)] if band in (0,4) else None
            face('PaleStone',[a[i],a[j],b[j],b[i]],tex,wanted)
    face('PaleStone',rings[-1])
    water=[(q[0],base+.10,q[2]) for q in rings[-1]]
    face('Water',water)
    def export(name,kinds):
        binary=bytearray();views=[];acs=[];prims=[];materials=[]
        for kind in kinds:
            data=groups[kind];attrs={}
            for key,semantic,width in [('p','POSITION',3),('n','NORMAL',3),('uv','TEXCOORD_0',2)]:
                off=len(binary);flat=data[key];binary.extend(struct.pack('<'+'f'*len(flat),*flat))
                views.append({'buffer':0,'byteOffset':off,'byteLength':len(binary)-off,'target':34962})
                a={'bufferView':len(views)-1,'componentType':5126,'count':len(flat)//width,'type':f'VEC{width}'}
                if key=='p':a.update(min=[min(flat[k::3]) for k in range(3)],max=[max(flat[k::3]) for k in range(3)])
                acs.append(a);attrs[semantic]=len(acs)-1
            prims.append({'attributes':attrs,'material':len(materials)})
            materials.append({'name':kind,'pbrMetallicRoughness':{'baseColorFactor':[.5,.48,.4,1],'metallicFactor':0,'roughnessFactor':.8}})
        d={'asset':{'version':'2.0','generator':'Philadelphia museum photo-traced terrace'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':name}],'meshes':[{'primitives':prims}],'materials':materials,'bufferViews':views,'accessors':acs}
        path=OUT/(name+'.glb');glb(path,d,binary)
        return {'file':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'triangles':sum(len(groups[k]['p'])//9 for k in kinds)}
    meshes=[export('museum-terrace',['FieldStone','PaleStone','InlayStone']),export('museum-fountain-water',['Water'])]
    worldarea=0
    for t in GROUND_IDS:
        poly=clip(pixels[t*3:t*3+3],footprint);p=[project(t,q) for q in poly]
        worldarea+=abs(area([(q[0],q[2]) for q in p]))
    receipt={'sourceSha256':sha,'sourceImageDimensions':[4096,2048],'outlineAtlasPixels':OUTLINE,'octagonAtlasPixels':OCTAGON,'fountainCenterAtlasPixels':CENTER,'fountainOuterRadiusAtlasPixels':RIM_OUTER,'poolVerticalProfileMeters':{'rimAboveSourceCenter':.24,'waterAboveSourceCenter':.10,'bottomBelowSourceCenter':.50,'measured':False},'partialSourceCuts':cuts,'allOutsideFacesAndOriginalPhotoPreserved':True,'sourceGroundAreaReplacedM2':worldarea,'retained':{'file':retained.name,'sha256':hashlib.sha256(retained.read_bytes()).hexdigest(),'triangles':len(index)//3},'meshes':meshes,'limits':['Photographic plan traced; material microstructure, meander simplification and basin height interpreted','No claim of surveyed fountain rim height','Central fountain fixture and jets not reconstructed','Facade and surrounding landscape remain unfinished','Native visual, collision and performance checks required']}
    (OUT/'source.json').write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps({'areaM2':worldarea,'meshes':meshes,'retainedTriangles':len(index)//3},indent=2))

if __name__=='__main__':main()
