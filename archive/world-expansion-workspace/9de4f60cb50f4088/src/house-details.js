import {Appearance,BoundingSphere,Cartesian2,Cartesian3,ComponentDatatype,Geometry,GeometryAttribute,
  GeometryInstance,Matrix4,PolygonPipeline,Primitive,PrimitiveType,ShowGeometryInstanceAttribute,Transforms} from 'cesium';
import {houseProfile} from './house-profile.js';
import {nearestNeighborhood} from './neighborhood-references.js';

// Interpreted detail on actual source footprints. This never creates a building
// where the municipal source did not supply one and never changes its height.
export function buildHouseGeometry(feature,{near=true}={}){
  if(feature.buildingName)return null; // Named source buildings require individual treatment.
  const profile=houseProfile(feature.id,feature.height,nearestNeighborhood(feature.longitude,feature.latitude));
  if(!profile||feature.height<2.6||feature.height>18||!Number.isFinite(feature.baseHeight))return null;
  const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(feature.longitude,feature.latitude,feature.baseHeight));
  const inverseFrame=Matrix4.inverseTransformation(frame,new Matrix4());
  const positions=[],normals=[],colors=[],uvs=[],indices=[];
  // Exact ellipsoid-to-local transform keeps the facade outside the original
  // wall; degree/metre approximations caused centimetre-scale grey occlusion.
  const point=p=>{const local=Matrix4.multiplyByPoint(inverseFrame,Cartesian3.fromDegrees(p[0],p[1],feature.baseHeight),new Cartesian3());return [local.x,local.y];};
  function quad(points,color,uv=null){
    const a=points[0],b=points[1],c=points[2];
    const ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
    const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
    const length=Math.hypot(...n);if(length<1e-8)return;
    const start=positions.length/3;
    points.forEach((p,i)=>{positions.push(...p);normals.push(...n.map(v=>v/length));colors.push(...color,near?1:0);uvs.push(...(uv?.[i]??[-1,-1]));});
    indices.push(start,start+1,start+2,start,start+2,start+3);
  }
  function panel(a,u,n,x,z,w,h,depth,color){
    const p=(xx,zz,dd)=>[a[0]+u[0]*xx+n[0]*dd,a[1]+u[1]*xx+n[1]*dd,zz];
    const front=[p(x,z,depth),p(x+w,z,depth),p(x+w,z+h,depth),p(x,z+h,depth)];
    quad(front,color);
    const back=[p(x,z,0.02),p(x+w,z,0.02),p(x+w,z+h,0.02),p(x,z+h,0.02)];
    for(let i=0;i<4;i++){const j=(i+1)%4;quad([back[i],back[j],front[j],front[i]],color.map(v=>v*.82));}
  }
  let edgeCount=0;
  for(const polygon of feature.polygons){
    const roofPoints=[],holes=[];
    polygon.forEach((ring,i)=>{if(i)holes.push(roofPoints.length);for(const coordinate of ring.slice(0,-1)){const p=point(coordinate);roofPoints.push(new Cartesian2(...p));}});
    const roofTriangles=PolygonPipeline.triangulate(roofPoints,holes);
    for(let i=0;i<roofTriangles.length;i+=3){
      const start=positions.length/3;
      for(let j=0;j<3;j++){const p=roofPoints[roofTriangles[i+j]];positions.push(p.x,p.y,feature.height+.012);normals.push(0,0,1);colors.push(...profile.roof,1);uvs.push(-1,-1);}
      indices.push(start,start+1,start+2);
    }
    for(let ringIndex=0;ringIndex<polygon.length;ringIndex++){
      const ring=polygon[ringIndex].map(point);if(ring.length>65)return null;
      const area=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
      // Small-scale detail is reserved for house-sized footprints, not stadiums.
      if(ringIndex===0&&(Math.abs(area)>700||Math.abs(area)<12))return null;
      for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if(length<.5)continue;
        const u=[(b[0]-a[0])/length,(b[1]-a[1])/length];
        const sign=(area>0?1:-1)*(ringIndex===0?1:-1),n=[u[1]*sign,-u[0]*sign];
        const p=(x,z,d=.012)=>[a[0]+u[0]*x+n[0]*d,a[1]+u[1]*x+n[1]*d,z];
        const bays=Math.min(16,Math.max(1,Math.floor((length-.65)/profile.baySpacing)));
        quad([p(0,0),p(length,0),p(length,feature.height),p(0,feature.height)],profile.wall,
          [[0,0],[bays,0],[bays,profile.floors],[0,profile.floors]]);
        if(!near){edgeCount++;continue;}
        panel(a,u,n,0,feature.height-.24,length,.19,profile.corniceDepth,profile.trim);
        panel(a,u,n,0,.05,length,.34,.055,profile.trim.map(v=>v*.72));
        const floorHeight=feature.height/profile.floors;
        const spacing=length/bays;
        for(let floor=0;floor<profile.floors;floor++){
          for(let bay=0;bay<bays;bay++){
            const width=Math.min(profile.windowWidth,spacing-.5),height=Math.min(profile.windowHeight,floorHeight-.9);
            if(width<.5||height<.6)continue;
            const x=(bay+.5)*spacing-width/2,z=floor*floorHeight+.68;
            const door=floor===0 && bay===(profile.seed%bays) && ringIndex===0 && length<14;
            const openingHeight=door?Math.min(2.15,floorHeight-.3):height;
            const bottom=door ? .05 : z;
            panel(a,u,n,x-.10,bottom-.06,width+.20,openingHeight+.15,.065,profile.trim);
            panel(a,u,n,x,bottom,width,openingHeight,.075,door?profile.door:[.13,.20,.24]);
            if(!door){
              panel(a,u,n,x-.14,bottom-.11,width+.28,.09,.17,profile.trim);
              panel(a,u,n,x+width/2-.022,bottom,.044,openingHeight,.10,profile.trim);
              panel(a,u,n,x,bottom+openingHeight*.51,width,.045,.10,profile.trim);
              panel(a,u,n,x-.12,bottom+openingHeight+.06,width+.24,.10,.10,profile.trim);
            }else{
              panel(a,u,n,x+.10,bottom+.25,width-.2,.62,.084,profile.door.map(v=>v*.7));
              panel(a,u,n,x+width-.15,.95,.045,.12,.12,[.62,.53,.33]);
            }
          }
        }
        edgeCount++;
      }
    }
  }
  if(!indices.length)return null;
  const geometry=new Geometry({attributes:{
    position:new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)}),
    normal:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(normals)}),
    color:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:4,values:new Float32Array(colors)}),
    st:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uvs)}),
  },indices:new (positions.length/3>65535?Uint32Array:Uint16Array)(indices),primitiveType:PrimitiveType.TRIANGLES,
  boundingSphere:BoundingSphere.fromVertices(positions)});
  return {geometry,profile,edgeCount,modelMatrix:frame};
}

function appearance(){return new Appearance({translucent:false,closed:false,renderState:{depthTest:{enabled:true},cull:{enabled:false}},
  vertexShaderSource:`in vec3 position3DHigh; in vec3 position3DLow; in vec3 normal; in vec4 color; in vec2 st; in float batchId;
    out vec3 v_normalEC; out vec4 v_color; out vec2 v_st;
    void main(){vec4 p=czm_computePosition(); v_normalEC=czm_normal*normal; v_color=color; v_st=st; gl_Position=czm_modelViewProjectionRelativeToEye*p;}`,
  fragmentShaderSource:`in vec3 v_normalEC; in vec4 v_color; in vec2 v_st;
    void main(){vec3 color=v_color.rgb;
      if(v_st.x>=0.0){vec2 metres=v_st*vec2(2.2,2.8);float row=floor(metres.y/.085); vec2 brick=vec2(fract(metres.x/.26+mod(row,2.0)*.5),fract(metres.y/.085));
        vec2 aa=max(fwidth(metres/vec2(.26,.085)),vec2(.002));
        float mortar=(1.0-smoothstep(.035-aa.x,.035+aa.x,brick.x))+(1.0-smoothstep(.08-aa.y,.08+aa.y,brick.y));
        float fade=1.0-smoothstep(.08,.45,max(aa.x,aa.y));
        color=mix(color,vec3(.49,.46,.40),clamp(mortar,0.0,1.0)*.6*fade);
        if(v_color.a<.5){vec2 w=fract(v_st);vec2 edge=max(fwidth(v_st),vec2(.002));
          float trim=smoothstep(.20-edge.x,.20+edge.x,w.x)*(1.0-smoothstep(.80-edge.x,.80+edge.x,w.x))*smoothstep(.17-edge.y,.17+edge.y,w.y)*(1.0-smoothstep(.84-edge.y,.84+edge.y,w.y));
          float glass=smoothstep(.25-edge.x,.25+edge.x,w.x)*(1.0-smoothstep(.75-edge.x,.75+edge.x,w.x))*smoothstep(.22-edge.y,.22+edge.y,w.y)*(1.0-smoothstep(.79-edge.y,.79+edge.y,w.y));
          color=mix(color,vec3(.66,.63,.55),trim);color=mix(color,vec3(.14,.20,.23),glass);}}
      float lighting=.62+.38*abs(dot(normalize(v_normalEC),normalize(czm_lightDirectionEC)));
      out_FragColor=vec4(color*lighting,1.0);}`,
});}

/** One nearby batch, bounded by houses and vertices; no thousands of tree/model objects. */
export function createHouseDetails(viewer){
  let primitive=null,signature='',visible=true,ids=new Map(),closeCount=0;
  const removed=new Set();
  function clear(){if(primitive)viewer.scene.primitives.remove(primitive);primitive=null;signature='';ids.clear();}
  function update(features,longitude,latitude){
    const sx=111320*Math.cos(latitude*Math.PI/180);
    const selected=features.filter(f=>!f.buildingName&&!removed.has(f.id)&&f.height>=2.6&&f.height<=18&&Number.isFinite(f.baseHeight))
      .map(f=>({f,d:Math.hypot((f.longitude-longitude)*sx,(f.latitude-latitude)*111320)}))
      .filter(x=>x.d<700).sort((a,b)=>a.d-b.d).slice(0,3000);
    const next=selected.map(x=>x.f.id+(x.d<110?'n':'m')).sort().join(',');if(next===signature)return;
    const instances=[];const nextIds=new Map();let vertices=0;
    closeCount=0;
    for(const {f:feature,d} of selected){
      const near=d<110&&vertices<400000;
      let built=buildHouseGeometry(feature,{near});if(!built)continue;
      const count=built.geometry.attributes.position.values.length/3;if(vertices+count>1000000)break;vertices+=count;
      if(near)closeCount++;
      const id={kind:'interpreted-house',objectid:feature.id,referenceId:built.profile.referenceId};
      instances.push(new GeometryInstance({id,geometry:built.geometry,modelMatrix:built.modelMatrix,attributes:{show:new ShowGeometryInstanceAttribute(true)}}));nextIds.set(feature.id,id);
    }
    clear();signature=next;ids=nextIds;
    if(instances.length)primitive=viewer.scene.primitives.add(new Primitive({geometryInstances:instances,asynchronous:false,appearance:appearance(),show:visible,allowPicking:false}));
    viewer.scene.requestRender();
  }
  function hide(id){removed.add(id);if(primitive?.ready&&ids.has(id)){const a=primitive.getGeometryInstanceAttributes(ids.get(id));if(a?.show)a.show=ShowGeometryInstanceAttribute.toValue(false,a.show);}else{clear();}}
  return {update,hide,clear(){clear();removed.clear();},destroy:clear,setVisible(value){visible=Boolean(value);if(primitive)primitive.show=visible;},getStats:()=>({houses:ids.size,closeHouses:closeCount,limit:3000})};
}
