"""Author east stairs against five source ramps and the measured terrace rise.

Only the 20 measured ramp/landing triangles are replaced in a native derivative.
The immutable geographic source, its other vertex attributes and photo atlas stay
byte-for-byte intact. Individual tread spacing is an architectural interpretation.
"""
import hashlib,json,math,struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[3]
OUT=ROOT/'Unreal/Philadelphia/SourceAssets/Museum/details'
SOURCE=ROOT/'public/models/city/source-2561.glb'
FLIGHTS=[(64,66,14),(62,74,12),(56,86,13),(54,80,12),(52,96,14)]

def write_glb(path,doc,binary):
    binary+=b'\0'*((-len(binary))%4)
    doc['buffers']=[{'byteLength':len(binary)}]
    js=json.dumps(doc,separators=(',',':')).encode()
    js+=b' '*((-len(js))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(binary))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(binary),0x004e4942)+binary)

def mix(a,b,t):return tuple(x+(y-x)*t for x,y in zip(a,b))
def sub(a,b):return tuple(x-y for x,y in zip(a,b))
def cross(a,b):return (a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])
def norm(a):return math.sqrt(sum(x*x for x in a))

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    raw=SOURCE.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]);binary=bytearray(raw[28+n:])
    prim=doc['meshes'][0]['primitives'][0]
    assert 'indices' not in prim
    ac=doc['accessors'][prim['attributes']['POSITION']];view=doc['bufferViews'][ac['bufferView']]
    points=list(struct.iter_unpack('<fff',binary[view['byteOffset']:view['byteOffset']+view['byteLength']]))
    def quad(t):return [points[t*3+2],points[(t+1)*3+1],points[t*3],points[t*3+1]]
    removed=sorted({t+k for ramp,landing,_ in FLIGHTS for t in (ramp,landing) for k in (0,1)})
    indices=[i for i in range(len(points)) if i//3 not in removed]
    offset=len(binary);binary.extend(struct.pack('<'+'I'*len(indices),*indices))
    doc['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':4*len(indices),'target':34963})
    doc['accessors'].append({'bufferView':len(doc['bufferViews'])-1,'componentType':5125,'count':len(indices),'type':'SCALAR','min':[min(indices)],'max':[max(indices)]})
    prim['indices']=len(doc['accessors'])-1
    derivative=OUT/'museum-retained.glb';write_glb(derivative,doc,binary)
    # The original binary (all vertex attributes and embedded JPEG) is unchanged.
    out=derivative.read_bytes();jn=struct.unpack_from('<I',out,12)[0]
    assert out[28+jn:28+jn+offset]==raw[28+n:]
    pos=[];normal=[];uv=[];blocks=0;receipt=[];collision_levels={}
    def triangle(vertices,tex):
        c=cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0]));length=norm(c)
        if length<1e-10:return
        uvarea=(tex[1][0]-tex[0][0])*(tex[2][1]-tex[0][1])-(tex[2][0]-tex[0][0])*(tex[1][1]-tex[0][1])
        assert abs(uvarea)>1e-10, 'Normal mapping requires non-degenerate texture coordinates'
        no=tuple(v/length for v in c)
        for p,t in zip(vertices,tex):pos.extend(p);normal.extend(no);uv.extend(t)
    def face(vertices,tex,wanted):
        if sum(x*y for x,y in zip(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])),wanted))<0:
            vertices=list(reversed(vertices));tex=list(reversed(tex))
        for i in range(1,len(vertices)-1):triangle([vertices[0],vertices[i],vertices[i+1]],[tex[0],tex[i],tex[i+1]])
    def block(corners,height,bottom,tile_seed,front=True,ends=(False,False)):
        nonlocal blocks
        level=collision_levels.setdefault(round(height,7),{'height':height,'bottom':bottom,'points':[]})
        level['bottom']=min(level['bottom'],bottom)
        level['points'].extend((p[0],p[2]) for p in corners)
        # Real millimetre bevels and joints; one combined mesh, one material.
        center=tuple(sum(p[k] for p in corners)/4 for k in range(3))
        width=norm(sub(corners[1],corners[0]));depth=norm(sub(corners[3],corners[0]))
        inset=min(.008,depth*.06,width*.06);gap=.0015
        along=tuple(v/width for v in sub(corners[1],corners[0]))
        across=tuple(v/depth for v in sub(corners[3],corners[0]))
        outer=[];inner=[]
        for i,p in enumerate(corners):
            su=1 if i in (0,3) else -1;sv=1 if i in (0,1) else -1
            px=tuple(p[k]+gap*(su*along[k]+sv*across[k]) for k in range(3))
            outer.append((px[0],height-inset,px[2]))
            q=tuple(p[k]+(inset+gap)*(su*along[k]+sv*across[k]) for k in range(3))
            inner.append((q[0],height,q[2]))
        # Sample only the stone interior: photographed grout must not masquerade
        # as an extra physical joint on the authored tread.
        tx=(tile_seed%5)*.2+.018;ty=((tile_seed//5)%5)*.2+.018
        tex=[(tx,ty),(tx+.16,ty),(tx+.16,ty+.15),(tx,ty+.15)]
        innertex=[(tx+.003,ty+.003),(tx+.157,ty+.003),(tx+.157,ty+.147),(tx+.003,ty+.147)]
        face(inner,innertex,(0,1,0))
        for i in range(4):
            j=(i+1)%4;mid=mix(outer[i],outer[j],.5)
            outward=(mid[0]-center[0],.15,mid[2]-center[2])
            face([inner[i],outer[i],outer[j],inner[j]],[innertex[i],tex[i],tex[j],innertex[j]],outward)
            # Adjacent stones conceal the buried slab walls. Keep the visible
            # riser and flight ends, instead of shading four hidden walls each.
            if not ((i==0 and front) or (i==1 and ends[1]) or (i==3 and ends[0])):continue
            lo=[(outer[i][0],bottom,outer[i][2]),(outer[j][0],bottom,outer[j][2])]
            side=[(tx,ty),(tx,ty+.04),(tx+.16,ty+.04),(tx+.16,ty)]
            face([outer[i],lo[0],lo[1],outer[j]],side,(outward[0],0,outward[2]))
        blocks+=1
    # Landings retain the measured footprint. Their buried overlap with following
    # flights closes the ground without introducing another walkable ramp.
    previous=None
    for flight,(ramp_id,landing_id,count) in enumerate(FLIGHTS):
        ramp=quad(ramp_id);landing=quad(landing_id)
        ytop=sum(p[1] for p in landing)/4+.015
        ybottom=previous if previous is not None else sum(p[1] for p in ramp[:2])/2+.015
        if flight==0:
            # Source 64/65 starts 85 cm above the retained lowest landing. A
            # photographic ramp concealed that discontinuity; solid treads must
            # connect to the measured landing before the player can climb.
            ybottom=min(p[1] for p in points)+.015
            assert abs(ybottom-(-24.09158073425293))<.02
            for lo,hi in [(0,3),(1,2)]:
                delta=sub(ramp[hi],ramp[lo]);length=math.hypot(delta[0],delta[2])
                ramp[lo]=(ramp[lo][0]-3*delta[0]/length,ybottom,ramp[lo][2]-3*delta[2]/length)
        width=(norm(sub(ramp[1],ramp[0]))+norm(sub(ramp[2],ramp[3])))/2
        run=(norm((ramp[3][0]-ramp[0][0],0,ramp[3][2]-ramp[0][2]))+norm((ramp[2][0]-ramp[1][0],0,ramp[2][2]-ramp[1][2])))/2
        rise=(ytop-ybottom)/count
        assert .12<rise<.19 and run/count>.28,(flight,rise,run/count)
        columns=math.ceil(width/1.05)
        for step in range(count):
            low=[mix(ramp[0],ramp[3],step/count),mix(ramp[1],ramp[2],step/count)]
            high=[mix(ramp[0],ramp[3],(step+1)/count),mix(ramp[1],ramp[2],(step+1)/count)]
            for col in range(columns):
                corners=[mix(low[0],low[1],col/columns),mix(low[0],low[1],(col+1)/columns),mix(high[0],high[1],(col+1)/columns),mix(high[0],high[1],col/columns)]
                block(corners,ybottom+rise*(step+1),ybottom+rise*step-.04,col+step*17+flight*101,ends=(col==0,col==columns-1))
        rows=math.ceil(norm(sub(landing[3],landing[0]))/.82)
        cols=math.ceil(norm(sub(landing[1],landing[0]))/.82)
        for row in range(rows):
            lo=[mix(landing[0],landing[3],row/rows),mix(landing[1],landing[2],row/rows)]
            hi=[mix(landing[0],landing[3],(row+1)/rows),mix(landing[1],landing[2],(row+1)/rows)]
            for col in range(cols):
                corners=[mix(lo[0],lo[1],col/cols),mix(lo[0],lo[1],(col+1)/cols),mix(hi[0],hi[1],(col+1)/cols),mix(hi[0],hi[1],col/cols)]
                block(corners,ytop,ytop-.12,col+row*13+flight*47,front=False)
        receipt.append({'sourceRampTriangles':[ramp_id,ramp_id+1],'sourceLandingTriangles':[landing_id,landing_id+1],'lowerExtensionMeters':3 if flight==0 else 0,'treads':count,'riserMeters':rise,'treadDepthMeters':run/count,'widthMeters':width,'heightMeters':[ybottom,ytop]})
        previous=ytop
    # The last photographed rise is a vertical 1.02 m face (1747/1748), not a
    # walkable flight. Its measured upper edge fixes the final terrace connection.
    wall=points[1747*3:1749*3]
    left=wall[4];right=wall[2]
    across=sub(right,left);width=math.hypot(across[0],across[2])
    uphill=(across[2]/width,0,-across[0]/width)
    if uphill[0]*(-.7)+uphill[2]*(-.714)<0:uphill=tuple(-x for x in uphill)
    top=[tuple(p[k]+uphill[k]*.05 for k in range(3)) for p in (left,right)]
    foot=[tuple(p[k]-uphill[k]*2.8 for k in range(3)) for p in top]
    target=(left[1]+right[1])/2+.015;count=7;rise=(target-previous)/count
    assert .12<rise<.18
    columns=math.ceil(width/1.05)
    for step in range(count):
        lo=[mix(foot[i],top[i],step/count) for i in range(2)]
        hi=[mix(foot[i],top[i],(step+1)/count) for i in range(2)]
        for col in range(columns):
            corners=[mix(lo[0],lo[1],col/columns),mix(lo[0],lo[1],(col+1)/columns),mix(hi[0],hi[1],(col+1)/columns),mix(hi[0],hi[1],col/columns)]
            block(corners,previous+rise*(step+1),previous+rise*step-.04,col+step*23,ends=(col==0,col==columns-1))
    receipt.append({'sourceRiseTriangles':[1747,1748],'treads':count,'riserMeters':rise,'treadDepthMeters':.4,'widthMeters':width,'heightMeters':[previous,target],'interpretation':'2.8 m stair run in front of measured terrace rise'})
    binary=bytearray();views=[];accessors=[]
    for values,components in [(pos,3),(normal,3),(uv,2)]:
        off=len(binary);binary.extend(struct.pack('<'+'f'*len(values),*values))
        views.append({'buffer':0,'byteOffset':off,'byteLength':len(binary)-off,'target':34962})
        item={'bufferView':len(views)-1,'componentType':5126,'count':len(values)//components,'type':f'VEC{components}'}
        if values is pos:
            item['min']=[min(values[k::3]) for k in range(3)];item['max']=[max(values[k::3]) for k in range(3)]
        accessors.append(item)
    detail_doc={'asset':{'version':'2.0','generator':'Philadelphia source-fitted museum stair authoring'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'MuseumStoneStairs'}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'material':0}]}],'materials':[{'name':'MuseumStone','pbrMetallicRoughness':{'baseColorFactor':[.45,.42,.37,1],'metallicFactor':0,'roughnessFactor':.9}}],'bufferViews':views,'accessors':accessors}
    detail=OUT/'museum-stairs.glb';write_glb(detail,detail_doc,binary)
    # Walking collision follows the same 72 horizontal tread levels but bridges
    # millimetre mortar joints and bevels. Decorative slab edges must not catch
    # the character capsule, particularly at small high-FPS movement deltas.
    def hull(points):
        points=sorted(set(points))
        def turn(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        low=[];high=[]
        for p in points:
            while len(low)>1 and turn(low[-2],low[-1],p)<=1e-7:low.pop()
            low.append(p)
        for p in reversed(points):
            while len(high)>1 and turn(high[-2],high[-1],p)<=1e-7:high.pop()
            high.append(p)
        return low[:-1]+high[:-1]
    cp=[];cn=[]
    def collision_face(vertices,wanted):
        if sum(x*y for x,y in zip(cross(sub(vertices[1],vertices[0]),sub(vertices[2],vertices[0])),wanted))<0:vertices=list(reversed(vertices))
        for i in range(1,len(vertices)-1):
            tri=[vertices[0],vertices[i],vertices[i+1]]
            n=cross(sub(tri[1],tri[0]),sub(tri[2],tri[0]));length=norm(n)
            if length<1e-9:continue
            for p in tri:cp.extend(p);cn.extend(x/length for x in n)
    for level in collision_levels.values():
        polygon=hull(level['points'])
        top=[(x,level['height'],z) for x,z in polygon]
        bottom=[(x,level['bottom'],z) for x,z in polygon]
        collision_face(top,(0,1,0));collision_face(bottom,(0,-1,0))
        for i,a in enumerate(polygon):
            j=(i+1)%len(polygon);b=polygon[j]
            collision_face([top[i],bottom[i],bottom[j],top[j]],(b[1]-a[1],0,a[0]-b[0]))
    cb=bytearray(struct.pack('<'+'f'*len(cp),*cp));normal_offset=len(cb);cb.extend(struct.pack('<'+'f'*len(cn),*cn))
    cd={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'MuseumStairCollision'}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1}}]}],'bufferViews':[{'buffer':0,'byteOffset':0,'byteLength':normal_offset,'target':34962},{'buffer':0,'byteOffset':normal_offset,'byteLength':len(cb)-normal_offset,'target':34962}],'accessors':[{'bufferView':0,'componentType':5126,'count':len(cp)//3,'type':'VEC3','min':[min(cp[k::3]) for k in range(3)],'max':[max(cp[k::3]) for k in range(3)]},{'bufferView':1,'componentType':5126,'count':len(cn)//3,'type':'VEC3'}]}
    collision=OUT/'museum-stair-collision.glb';write_glb(collision,cd,cb)
    proof={'sourceSha256':hashlib.sha256(raw).hexdigest(),'removedTriangleIds':removed,'untouchedAttributesAndPhotoBytesPreserved':True,'retainedTriangles':len(indices)//3,'detailTriangles':len(pos)//9,'stoneBlocks':blocks,'flights':receipt,'retainedSha256':hashlib.sha256(derivative.read_bytes()).hexdigest(),'detailSha256':hashlib.sha256(detail.read_bytes()).hexdigest(),'limits':['Six reconstructed flights; tread count agrees with 72-step museum reference but individual spacing is not surveyed','Lowest and uppermost runs bridge source height discontinuities','Individual tread spacing and stone joints interpreted from measured ramp spans','Photographed CC0 granite is a material interpretation, not a museum stone scan','Remaining museum photography retains historical lighting and limited texel density']}
    proof['collision']={'file':collision.name,'sha256':hashlib.sha256(collision.read_bytes()).hexdigest(),'triangles':len(cp)//9,'treadLevels':len(collision_levels),'scope':'Continuous horizontal tread collision at existing rendered heights; bridges decorative joints, no ramp'}
    (OUT/'source.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps(proof,indent=2))

if __name__=='__main__':main()
