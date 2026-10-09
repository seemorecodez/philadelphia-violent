"""Give the photographed courtyard wing physical window depth at source scale."""
import copy,hashlib,importlib.util,json,math,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
spec=importlib.util.spec_from_file_location('terrace_geometry',Path(__file__).with_name('build-museum-terrace.py'))
geo=importlib.util.module_from_spec(spec);spec.loader.exec_module(geo)
OUT=ROOT/'Unreal/Philadelphia/SourceAssets/Museum/wing'

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    source=ROOT/'public/models/city/source-2561.glb';raw=source.read_bytes();n=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+n]);binary=raw[28+n:];prim=doc['meshes'][0]['primitives'][0]
    def read(key,w):
        a=doc['accessors'][prim['attributes'][key]];v=doc['bufferViews'][a['bufferView']]
        return list(struct.iter_unpack('<'+'f'*w,binary[v['byteOffset']:v['byteOffset']+v['byteLength']]))
    p=read('POSITION',3);uv=[(u*4096,v*2048) for u,v in read('TEXCOORD_0',2)]
    normal=(.6927478,-.00005056,-.72118)
    faces=(2415,2416)
    def weights(t,q):
        a,b,c=uv[t*3:t*3+3];x,y=q
        den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
        s=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den
        v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den
        return s,v,1-s-v
    def point(q,depth=0):
        # Both measured source triangles lie on the same courtyard wall plane.
        t=max(faces,key=lambda t:min(weights(t,q)))
        return tuple(sum(p[t*3+i][k]*w for i,w in enumerate(weights(t,q)))+normal[k]*depth for k in range(3))
    def rect(x0,y0,x1,y1):return [(x0,y0),(x1,y0),(x1,y1),(x0,y1)]
    windows=[]
    for bay,y in enumerate([1059,1098,1137,1176,1214,1253,1292,1331,1369,1408,1447]):
        for row,(x0,x1,pane_rows) in enumerate([(2444,2467,3),(2489,2523,4),(2552,2567,2)]):
            window=rect(x0,y-7,x1,y+7)
            covered=sum(abs(geo.area(geo.clip(window,uv[t*3:t*3+3]))) for t in faces)
            assert abs(covered-abs(geo.area(window)))<.02,(bay,row)
            windows.append({'bay':bay,'row':row,'rect':window,'paneRows':pane_rows,'occludedInPhoto':bay in (3,4,5,6,7,8)})
    groups={key:{'p':[],'n':[],'uv':[]} for key in ['FacadeStone','WindowStone','Glass','Metal']}
    def emit(kind,vertices,coords,wanted):
        no=geo.cross(geo.sub(vertices[1],vertices[0]),geo.sub(vertices[2],vertices[0]))
        if sum(x*y for x,y in zip(no,wanted))<0:vertices=list(reversed(vertices));coords=list(reversed(coords))
        for j in range(1,len(vertices)-1):
            no=geo.cross(geo.sub(vertices[j],vertices[0]),geo.sub(vertices[j+1],vertices[0]));length=geo.norm(no)
            if length<1e-9:continue
            for i in [0,j,j+1]:groups[kind]['p'].extend(vertices[i]);groups[kind]['n'].extend(x/length for x in no);groups[kind]['uv'].extend(coords[i])
    def panel(kind,polygon,depth=0):
        emit(kind,[point(q,depth) for q in polygon],[(q[1]*.12,q[0]*.124) for q in polygon],normal)
    for t in faces:
        pieces=[uv[t*3:t*3+3]]
        for w in windows:pieces=[out for poly in pieces for out in geo.subtract(poly,w['rect'])]
        for poly in pieces:panel('FacadeStone',poly,.006)
    def ring(outer,inner,outer_depth,inner_depth,kind):
        center=tuple(sum(q[k] for q in inner)/4 for k in (0,1))
        for i in range(4):
            j=(i+1)%4
            verts=[point(outer[i],outer_depth),point(outer[j],outer_depth),point(inner[j],inner_depth),point(inner[i],inner_depth)]
            # Face the opening for recessed reveals; face outward for moulding.
            mid=tuple((verts[2][k]+verts[3][k])*.5 for k in range(3))
            wanted=geo.sub(point(center,inner_depth),mid) if inner_depth<outer_depth-.1 else normal
            emit(kind,verts,[(0,0),(1,0),(1,1),(0,1)],wanted)
    def solid(kind,polygon,back,front):
        panel(kind,polygon,front)
        middle=tuple(sum(point(q,0)[k] for q in polygon)/len(polygon) for k in range(3))
        for i,a in enumerate(polygon):
            b=polygon[(i+1)%len(polygon)]
            verts=[point(a,back),point(b,back),point(b,front),point(a,front)]
            outward=geo.sub(tuple((verts[0][k]+verts[1][k])*.5 for k in range(3)),middle)
            length=geo.norm(geo.sub(verts[1],verts[0]))
            emit(kind,verts,[(0,0),(length/2,0),(length/2,(front-back)/2),(0,(front-back)/2)],outward)
    for w in windows:
        opening=w['rect'];x0,y0=opening[0];x1,y1=opening[2]
        # Thin raised architrave, bevel, recessed jambs and projecting sill.
        outer=rect(x0-1.35,y0-1.2,x1+1.35,y1+1.2)
        bevel=rect(x0-.75,y0-.65,x1+.75,y1+.65)
        ring(outer,bevel,.012,.11,'WindowStone')
        ring(bevel,opening,.11,.065,'WindowStone')
        inner=rect(x0+.7,y0+.65,x1-.7,y1-.65)
        ring(opening,inner,.065,-.22,'WindowStone')
        panel('Glass',inner,-.225)
        solid('Metal',rect(x0+.7,(y0+y1)/2-.17,x1-.7,(y0+y1)/2+.17),-.225,-.17)
        for division in range(1,w['paneRows']):
            x=x0+.7+(x1-x0-1.4)*division/w['paneRows']
            solid('Metal',rect(x-.16,y0+.65,x+.16,y1-.65),-.225,-.17)
        # In this atlas increasing X runs down the elevation; the sill is here.
        solid('WindowStone',rect(x1-.1,y0-1.5,x1+1.1,y1+1.5),-.005,.19)
    blob=bytearray();views=[];accessors=[];primitives=[];materials=[]
    for kind,g in groups.items():
        attrs={}
        for key,semantic,width in [('p','POSITION',3),('n','NORMAL',3),('uv','TEXCOORD_0',2)]:
            off=len(blob);v=g[key];blob.extend(struct.pack('<'+'f'*len(v),*v))
            views.append({'buffer':0,'byteOffset':off,'byteLength':len(blob)-off,'target':34962})
            a={'bufferView':len(views)-1,'componentType':5126,'count':len(v)//width,'type':f'VEC{width}'}
            if key=='p':a.update(min=[min(v[k::3]) for k in range(3)],max=[max(v[k::3]) for k in range(3)])
            accessors.append(a);attrs[semantic]=len(accessors)-1
        primitives.append({'attributes':attrs,'material':len(materials)})
        materials.append({'name':kind,'pbrMetallicRoughness':{'baseColorFactor':[.5,.48,.42,1],'roughnessFactor':.8}})
    result={'asset':{'version':'2.0'},'scene':0,'scenes':[{'nodes':[0]}],'nodes':[{'mesh':0,'name':'MuseumCourtyardWing'}],'meshes':[{'primitives':primitives}],'materials':materials,'bufferViews':views,'accessors':accessors}
    model=OUT/'museum-courtyard-wing.glb';geo.glb(model,result,blob)
    retained_source=OUT.parent/'terrace/museum-terrace-retained.glb';r=retained_source.read_bytes();size=struct.unpack_from('<I',r,12)[0];rd=json.loads(r[20:20+size]);rb=bytearray(r[28+size:]);pr=rd['meshes'][0]['primitives'][0]
    ac=rd['accessors'][pr['indices']];v=rd['bufferViews'][ac['bufferView']];ids=list(struct.unpack_from('<'+'I'*ac['count'],rb,v['byteOffset']))
    filtered=[];removed=0
    for i in range(0,len(ids),3):
        tri=ids[i:i+3]
        if any(tri==list(range(t*3,t*3+3)) for t in faces):removed+=1
        else:filtered.extend(tri)
    assert removed==2
    off=len(rb);rb.extend(struct.pack('<'+'I'*len(filtered),*filtered));rd['bufferViews'].append({'buffer':0,'byteOffset':off,'byteLength':len(rb)-off,'target':34963});rd['accessors'].append({'bufferView':len(rd['bufferViews'])-1,'componentType':5125,'count':len(filtered),'type':'SCALAR'});pr['indices']=len(rd['accessors'])-1
    retained=OUT/'museum-wing-retained.glb';geo.glb(retained,rd,rb)
    proof={'sourceSha256':hashlib.sha256(raw).hexdigest(),'terraceRetainedSha256':hashlib.sha256(r).hexdigest(),'sourceFaces':faces,'windows':windows,'windowCount':len(windows),'recessMeters':.22,'retained':{'file':retained.name,'sha256':hashlib.sha256(retained.read_bytes()).hexdigest(),'triangles':len(filtered)//3},'mesh':{'file':model.name,'sha256':hashlib.sha256(model.read_bytes()).hexdigest(),'triangles':sum(len(g['p'])//9 for g in groups.values())},'limits':['Source window layout traced; tree-obscured bays interpreted from adjacent repeated bays','Reveal depth, moulding projection and material microstructure interpreted, not surveyed','Opaque reflective glazing; no building interior','Only source courtyard wing faces 2415/2416 replaced; other facade remains unfinished']}
    (OUT/'source.json').write_text(json.dumps(proof,indent=2)+'\n');print(json.dumps({k:proof[k] for k in ['sourceFaces','windowCount','retained','mesh']},indent=2))

if __name__=='__main__':main()
