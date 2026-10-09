import {Appearance,BoundingSphere,Cartesian3,Cartographic,ComponentDatatype,Geometry,GeometryAttribute,GeometryInstance,Matrix4,Primitive,PrimitiveType,Transforms,sampleTerrain} from 'cesium';
import {localPoint,geographicPoint,pointInTriangle,CELL_SIZE} from './district-geometry.js';
import {createCitySurfaceLoader} from './city-surface-loader.js';
import {planningDistrictAt} from './planning-districts.js';
const palette={road:[.12,.135,.145,0],parking:[.16,.17,.18,0],sidewalk:[.58,.56,.52,1],concrete:[.49,.48,.45,1],grass:[.25,.32,.16,2],earth:[.34,.28,.20,2],gravel:[.32,.32,.30,2],paint:[.85,.84,.76,4],yellow:[.84,.65,.12,4]};
const lift=kind=>kind==='sidewalk'?.16:kind==='concrete'?.08:['paint','yellow'].includes(kind)?.04:.025;
export function buildDistrictCell(data,getHeight){
  const center=geographicPoint([(data.x+.5)*CELL_SIZE,(data.y+.5)*CELL_SIZE]),height=getHeight(...center);if(!Number.isFinite(height))return null;
  const frame=Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(...center,height)),inverse=Matrix4.inverseTransformation(frame,new Matrix4());
  const positions=[],normals=[],colors=[],uvs=[],indices=[],samples=new Map();let missing=false;
  function position(x,y,z){
    const key=`${x},${y}`;let h=samples.get(key);const geo=geographicPoint([x,y]);
    if(h===undefined){h=getHeight(...geo);samples.set(key,h);}
    if(!Number.isFinite(h)){missing=true;return new Cartesian3();}
    return Matrix4.multiplyByPoint(inverse,Cartesian3.fromDegrees(...geo,h+z),new Cartesian3());
  }
  function triangle(points,colour){
    const local=points.map(p=>position(...p));
    const normal=Cartesian3.cross(Cartesian3.subtract(local[1],local[0],new Cartesian3()),Cartesian3.subtract(local[2],local[0],new Cartesian3()),new Cartesian3());
    if(Cartesian3.magnitudeSquared(normal)<1e-12)return;Cartesian3.normalize(normal,normal);
    for(let i=0;i<3;i++){const p=local[i];indices.push(positions.length/3);positions.push(p.x,p.y,p.z);normals.push(normal.x,normal.y,normal.z);colors.push(...colour);uvs.push(points[i][0],points[i][1]);}
  }
  for(const [kind,flat] of Object.entries(data.groups))for(let i=0;i<flat.length;i+=6)triangle([[flat[i],flat[i+1],lift(kind)],[flat[i+2],flat[i+3],lift(kind)],[flat[i+4],flat[i+5],lift(kind)]],palette[kind]);
  for(let i=0;i<data.curbs.length;i+=4){const [x,y,u,v]=data.curbs.slice(i,i+4),a=[x,y,.025],b=[u,v,.025],c=[u,v,.16],d=[x,y,.16];triangle([a,b,c],[.46,.45,.42,3]);triangle([a,c,d],[.46,.45,.42,3]);}
  if(missing||!indices.length)return null;
  return {frame,height,triangles:indices.length/3,bytes:positions.length*8+(normals.length+colors.length+uvs.length+indices.length)*4,geometry:new Geometry({attributes:{
    position:new GeometryAttribute({componentDatatype:ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:new Float64Array(positions)}),
    normal:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:3,values:new Float32Array(normals)}),
    color:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:4,values:new Float32Array(colors)}),
    st:new GeometryAttribute({componentDatatype:ComponentDatatype.FLOAT,componentsPerAttribute:2,values:new Float32Array(uvs)}),
  },indices:new Uint32Array(indices),primitiveType:PrimitiveType.TRIANGLES,boundingSphere:BoundingSphere.fromVertices(positions)})};
}
export async function sampleDistrictHeights(data,sample){
  const keys=new Map(),key=(lon,lat)=>`${lon.toFixed(9)},${lat.toFixed(9)}`;
  const add=(x,y)=>{const [lon,lat]=geographicPoint([x,y]);keys.set(key(lon,lat),Cartographic.fromDegrees(lon,lat));};
  add((data.x+.5)*CELL_SIZE,(data.y+.5)*CELL_SIZE);
  for(let x=data.x*CELL_SIZE;x<=(data.x+1)*CELL_SIZE;x+=5)for(let y=data.y*CELL_SIZE;y<=(data.y+1)*CELL_SIZE;y+=5)add(x,y);
  for(const values of Object.values(data.groups))for(let i=0;i<values.length;i+=2)add(values[i],values[i+1]);
  for(let i=0;i<data.curbs.length;i+=2)add(data.curbs[i],data.curbs[i+1]);
  const points=[...keys.values()];await sample(points);
  if(points.some(p=>!Number.isFinite(p.height)))throw Error(`Terrain heights missing for district cell ${data.id}`);
  const heights=new Map([...keys.keys()].map((k,i)=>[k,points[i].height]));
  return (lon,lat)=>heights.get(key(lon,lat));
}
export function districtMaterial(){return new Appearance({translucent:false,closed:false,renderState:{depthTest:{enabled:true},cull:{enabled:false}},vertexShaderSource:`
  in vec3 position3DHigh;in vec3 position3DLow;in vec3 normal;in vec4 color;in vec2 st;in float batchId;
  out vec3 v_normal;out vec4 v_color;out vec2 v_uv;
  void main(){v_normal=czm_normal*normal;v_color=color;v_uv=st;gl_Position=czm_modelViewProjectionRelativeToEye*czm_computePosition();}`,
  fragmentShaderSource:`in vec3 v_normal;in vec4 v_color;in vec2 v_uv;
  float grain(vec2 p){uvec2 q=uvec2(ivec2(p));uint h=q.x*1664525u+q.y*1013904223u;h^=h>>16;h*=2246822519u;h^=h>>13;return float(h&65535u)/65535.0;}
  void main(){vec3 c=v_color.rgb;float fine=1.0-smoothstep(.015,.08,length(fwidth(v_uv)));
    c*=.94+.12*grain(floor(v_uv*36.0))*fine;
    if(v_color.a>.5&&v_color.a<1.5){vec2 slab=abs(fract(v_uv/1.5)-.5);vec2 aa=max(fwidth(v_uv/1.5),vec2(.0001));
      float seam=max(smoothstep(.493-aa.x,.493+aa.x,slab.x),smoothstep(.493-aa.y,.493+aa.y,slab.y));
      c=mix(c,c*.57,seam*(1.0-smoothstep(.02,.2,length(aa))));}
    float light=.64+.36*abs(dot(normalize(v_normal),normalize(czm_lightDirectionEC)));
    out_FragColor=vec4(c*light,1.0);}`});}

/** Local source-backed 100m cells; one mesh upload per frame, bounded residency. */
export function createGameDistrict(viewer,{onStatus=()=>{}}={}){
  const cityLoader=createCitySurfaceLoader();let localCells=new Map();
  const scene=viewer.scene,cells=new Map();let manifest=null,enabled=false,visible=true,epoch=0,focus=null,clock=0,inFlight=0,latency=0,failures=0,transitions=0;
  async function loadManifest(){if(manifest)return;const r=await fetch('/data/district/manifest.json');if(!r.ok)throw Error('District manifest unavailable');manifest=await r.json();localCells=new Map(manifest.cells.map(c=>[c.id,c]));}
  function clear(){epoch++;for(const c of cells.values()){c.abort?.abort();if(c.pending)scene.primitives.remove(c.pending);if(c.mesh)scene.primitives.remove(c.mesh);}cityLoader.destroy();cells.clear();focus=null;}
  function update(longitude,latitude){if(enabled)focus=localPoint([longitude,latitude]);}
  function tick(dt){
    if(!enabled||!manifest||!focus)return;clock+=dt;
    const candidates=[],cx=Math.floor(focus[0]/CELL_SIZE),cy=Math.floor(focus[1]/CELL_SIZE);
    // The actual city source is queried only around the player/camera. Existing
    // authored district cells take precedence; the rest are built in a worker.
    if(planningDistrictAt(...geographicPoint(focus)))for(let x=cx-4;x<=cx+4;x++)for(let y=cy-4;y<=cy+4;y++){
      const id=`${x}_${y}`,d=Math.hypot((x+.5)*CELL_SIZE-focus[0],(y+.5)*CELL_SIZE-focus[1]);
      if(d<380)candidates.push({...localCells.get(id),id,x,y,d,local:localCells.has(id)});
    }
    const wanted=candidates.sort((a,b)=>a.d-b.d).slice(0,36);
    const keep=new Set(wanted.map(c=>c.id));
    for(const [id,c] of cells)if(!keep.has(id)){c.abort?.abort();if(c.pending)scene.primitives.remove(c.pending);if(c.mesh)scene.primitives.remove(c.mesh);cells.delete(id);transitions++;}
    for(const info of wanted){
      if(inFlight>=2)break;if(cells.has(info.id))continue;
      const abort=new AbortController(),c={...info,abort,started:performance.now(),data:null,mesh:null,ready:false,retryAt:0},run=epoch;cells.set(c.id,c);inFlight++;
      const request=info.local?fetch(`/data/district/cells/${c.id}.json`,{signal:abort.signal}).then(r=>{if(!r.ok)throw Error(`Cell ${c.id}: ${r.status}`);return r.json();}):cityLoader.load(c.x,c.y,abort.signal);
      void request.then(async data=>{
        if(run!==epoch||cells.get(c.id)!==c)return;
        if(!Object.values(data.groups).some(v=>v.length)){c.data=data;c.empty=true;c.ready=true;return;}
        const heights=await sampleDistrictHeights(data,points=>sampleTerrain(viewer.terrainProvider,15,points));
        if(run===epoch&&cells.get(c.id)===c){c.data=data;c.getHeight=heights;}
      }).catch(e=>{if(e.name!=='AbortError'&&run===epoch&&cells.get(c.id)===c){failures++;c.retryAt=clock+10;onStatus(`District surface ${c.id} could not load. Movement waits for its surface.`,'warning');}}).finally(()=>{inFlight--;});
    }
    for(const c of cells.values())if(c.retryAt&&clock>c.retryAt){cells.delete(c.id);break;}
    // Source level 15 is the provider's finest observed raster. Bulk heightmap
    // interpolation avoids Globe.getHeight's per-vertex terrain-mesh ray tests.
    for(const info of wanted){const c=cells.get(info.id);if(!c?.data||c.empty)continue;
      if(c.pending){if(c.pending.ready){if(c.mesh)scene.primitives.remove(c.mesh);c.mesh=c.pending;c.pending=null;c.mesh.show=visible;c.ready=true;}continue;}
      if(c.mesh)continue;
      const built=buildDistrictCell(c.data,c.getHeight);if(!built)break;
      const p=scene.primitives.add(new Primitive({geometryInstances:new GeometryInstance({geometry:built.geometry,modelMatrix:built.frame}),appearance:districtMaterial(),asynchronous:false,allowPicking:false,show:!c.mesh&&visible}));
      c.height=built.height;c.triangles=built.triangles;c.bytes=built.bytes;
      if(c.mesh)c.pending=p;else{c.mesh=p;c.ready=true;latency=performance.now()-c.started;transitions++;}
      scene.requestRender();break;
    }
  }
  function surfaceAt(longitude,latitude){
    if(!enabled)return null;const p=localPoint([longitude,latitude]),c=cells.get(`${Math.floor(p[0]/CELL_SIZE)}_${Math.floor(p[1]/CELL_SIZE)}`);
    if(!c?.data||!c.mesh?.ready)return null;
    const x=Math.floor(p[0]/5)*5,y=Math.floor(p[1]/5)*5,fx=(p[0]-x)/5,fy=(p[1]-y)/5;
    const a=c.getHeight(...geographicPoint([x,y])),b=c.getHeight(...geographicPoint([x+5,y])),d=c.getHeight(...geographicPoint([x,y+5])),e=c.getHeight(...geographicPoint([x+5,y+5]));
    const height=(a*(1-fx)+b*fx)*(1-fy)+(d*(1-fx)+e*fx)*fy;
    for(const kind of ['sidewalk','concrete','road','parking','gravel','earth','grass']){const a=c.data.groups[kind]??[];
      for(let i=0;i<a.length;i+=6)if(pointInTriangle(p,[[a[i],a[i+1]],[a[i+2],a[i+3]],[a[i+4],a[i+5]]]))return {kind,lift:lift(kind),height};}
    return {kind:'unclassified',lift:0,height};
  }
  return {async setEnabled(value){enabled=Boolean(value);if(!enabled){clear();return;}try{await loadManifest();}catch(e){enabled=false;onStatus(e.message,'error');throw e;}},
    get enabled(){return enabled;},update,tick,surfaceAt,
    contains(lon,lat){return Boolean(manifest&&planningDistrictAt(lon,lat));},
    setVisible(value){visible=value;for(const c of cells.values())if(c.mesh)c.mesh.show=value;},clear,destroy:clear,
    getStats(){const loaded=[...cells.values()].filter(c=>c.mesh?.ready),empty=[...cells.values()].filter(c=>c.empty).length;return {enabled,loadedCells:loaded.length,pendingCells:cells.size-loaded.length-empty,emptyCells:empty,citywideSource:true,triangles:loaded.reduce((s,c)=>s+c.triangles,0),meshBufferBytes:loaded.reduce((s,c)=>s+c.bytes,0),lastCellLatencyMs:latency,failures,transitions};},
  };
}
