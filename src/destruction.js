import {
  Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, HeadingPitchRoll,
  Transforms, CallbackProperty, GeometryInstance, Matrix3, Matrix4,
  PerInstanceColorAppearance, Primitive, Quaternion,
} from 'cesium';
import { buildSidewalkGeometry, sidewalkLocalToGeographic } from './sidewalk-surfaces.js';

const SIDEWALK_LIMIT = 24;
const FRAGMENTS_PER_SECTION = 12;
const SIDEWALK_LIFETIME = 2.4;
const triangleArea = ([a,b,c]) => Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])) / 2;
const longestEdge = triangle => {
  let index=0, length=0;
  for(let i=0;i<3;i++) {
    const a=triangle[i],b=triangle[(i+1)%3],next=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(next>length){index=i;length=next;}
  }
  return {index,length};
};

/** Cuts inside actual clipped pieces; holes never become filled debris. */
export function sidewalkFragments(section) {
  if(section?.kind!=='sidewalk' || section.boundaryBasis!=='source-polygon-clipped-for-gameplay'
      || !Array.isArray(section.pieces) || !section.pieces.length || section.pieces.length>1024) return [];
  const seeds=[];
  for(const piece of section.pieces) {
    if(!Array.isArray(piece) || piece.length<3 || piece.length>12
        || piece.some(p=>!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return [];
    for(let i=1;i<piece.length-1;i++) {
      const triangle=[piece[0],piece[i],piece[i+1]].map(point=>[...point]);
      if(triangleArea(triangle)>0.005 && longestEdge(triangle).length<=8.6) seeds.push(triangle);
    }
  }
  // Bound CPU subdivision even for unusually complex source features. These
  // twelve displayed chunks are an effect, not conserved material volume.
  seeds.sort((a,b)=>triangleArea(b)-triangleArea(a));
  const work=seeds.slice(0,24), fragments=[];
  let iterations=0;
  while(work.length && iterations++<2048 && fragments.length<512) {
    const triangle=work.pop(),edge=longestEdge(triangle);
    if(edge.length<=1.35) {fragments.push(triangle);continue;}
    const a=triangle[edge.index],b=triangle[(edge.index+1)%3],c=triangle[(edge.index+2)%3];
    const middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
    work.push([a,middle,c],[middle,b,c]);
  }
  const count=Math.min(FRAGMENTS_PER_SECTION,fragments.length);
  return Array.from({length:count},(_,index)=>{
    const triangle=fragments[Math.floor(index*fragments.length/count)];
    const midpoint=[triangle.reduce((sum,p)=>sum+p[0],0)/3,triangle.reduce((sum,p)=>sum+p[1],0)/3];
    const [longitude,latitude]=sidewalkLocalToGeographic(midpoint);
    return {triangle,longitude,latitude,sourceId:section.sourceId,sectionId:section.id};
  });
}

export function sidewalkDebrisPose(age,index=0) {
  const time=Math.max(0,Number.isFinite(age)?age:0);
  const phase=(index*.61803398875)%1,flight=.62+phase*.2,peak=.18+phase*.18;
  const u=Math.min(1,time/flight);
  const bounce=time<flight?4*peak*u*(1-u):.045*Math.exp(-(time-flight)*5)*Math.abs(Math.sin((time-flight)*16));
  const spread=.05+.09*phase,angle=index*2.399963;
  return {x:Math.cos(angle)*spread*u,y:Math.sin(angle)*spread*u,z:bounce,
    tilt:Math.sin(Math.PI*u)*(.16+phase*.16),
    alpha:Math.max(0,Math.min(1,(SIDEWALK_LIFETIME-time)/.65))};
}

function renderSidewalk(viewer,section,fragment,id) {
  const built=buildSidewalkGeometry({...section,longitude:fragment.longitude,latitude:fragment.latitude,pieces:[fragment.triangle]},
    (lon,lat)=>viewer.scene.globe?.getHeight(Cartographic.fromDegrees(lon,lat)),{closeBottom:true});
  if(!built)return null;
  const colour=Color.fromCssColorString('#aaa79f');
  const primitive=viewer.scene.primitives.add(new Primitive({
    geometryInstances:new GeometryInstance({id,geometry:built.geometry,
      attributes:{color:ColorGeometryInstanceAttribute.fromColor(colour)}}),
    modelMatrix:Matrix4.clone(built.modelMatrix),
    appearance:new PerInstanceColorAppearance({translucent:true,closed:true}),
    asynchronous:false,allowPicking:false,
  }));
  let disposed=false,attributes=null;
  return {
    get ready(){return !disposed && primitive.ready===true;},
    show(value){if(!disposed)primitive.show=value;},
    update(pose){
      if(disposed)return;
      const rotation=Matrix3.fromQuaternion(Quaternion.fromAxisAngle(Cartesian3.UNIT_X,pose.tilt));
      primitive.modelMatrix=Matrix4.multiply(built.modelMatrix,
        Matrix4.fromRotationTranslation(rotation,new Cartesian3(pose.x,pose.y,pose.z)),primitive.modelMatrix);
      if(primitive.ready){
        attributes??=primitive.getGeometryInstanceAttributes(id);
        colour.alpha=pose.alpha;
        attributes.color=ColorGeometryInstanceAttribute.toValue(colour,attributes.color);
      }
    },
    dispose(){if(!disposed){disposed=true;viewer.scene.primitives.remove(primitive);}},
  };
}

// A bounded game effect derived from the destroyed building's actual wall edges.
// This is animated debris, not a structural engineering simulation.
export function createDebris(viewer,{renderSidewalkFragment=null}={}) {
  const pieces=[];
  const sidewalkPieces=[];
  let visible=true,destroyed=false,sequence=0;
  function clear(){
    for(const p of pieces)viewer.entities.remove(p.entity);pieces.length=0;
    for(const p of sidewalkPieces)p.handle.dispose();sidewalkPieces.length=0;
    visible=true;
  }
  function addBuilding(building) {
    if(destroyed)return;
    const ground=building.baseHeight;
    if(!Number.isFinite(ground))return;
    const edges=[];
    for(const polygon of building.polygons) for(const ring of polygon) {
      for(let i=0;i<ring.length-1;i++) {
        const a=ring[i],b=ring[i+1];
        const dx=(b[0]-a[0])*111320*Math.cos(a[1]*Math.PI/180),dy=(b[1]-a[1])*111320;
        if(Math.hypot(dx,dy)>0.4)edges.push({a,b,length:Math.hypot(dx,dy),angle:Math.atan2(dx,dy)});
      }
    }
    edges.sort((a,b)=>b.length-a.length);
    for(const edge of edges.slice(0,12)) {
      while(pieces.length>=48)viewer.entities.remove(pieces.shift().entity);
      const height=Math.min(building.heightFeet*0.3048,6.096);
      const p={age:0,entity:null};
      const lon=(edge.a[0]+edge.b[0])/2,lat=(edge.a[1]+edge.b[1])/2;
      const position=()=>Cartesian3.fromDegrees(lon,lat,ground+0.15+height/2*Math.cos(Math.min(1,p.age/1.4)*Math.PI/2));
      p.entity=viewer.entities.add({show:visible,position:new CallbackProperty(position,false),
        orientation:new CallbackProperty(()=>Transforms.headingPitchRollQuaternion(position(),new HeadingPitchRoll(edge.angle,Math.min(1,p.age/1.4)*Math.PI/2,0)),false),
        box:{dimensions:new Cartesian3(0.25,Math.min(edge.length,8),height),material:Color.fromCssColorString('#a69e8f')},
      });pieces.push(p);
    }
  }
  function addSidewalk(section){
    if(destroyed || !Number.isFinite(section?.baseHeight))return 0;
    let added=0;
    for(const [index,fragment] of sidewalkFragments(section).entries()) {
      const id=`sidewalk-debris:${section.id}:${sequence++}`;
      const handle=renderSidewalkFragment?renderSidewalkFragment(section,fragment,id):renderSidewalk(viewer,section,fragment,id);
      if(!handle)continue;
      while(sidewalkPieces.length>=SIDEWALK_LIMIT)sidewalkPieces.shift().handle.dispose();
      handle.show(visible);sidewalkPieces.push({handle,age:0,waiting:0,index});added++;
    }
    viewer.scene?.requestRender();return added;
  }
  function tick(dt){
    if(destroyed || !visible || !Number.isFinite(dt) || dt<=0)return;
    const seconds=Math.min(.1,dt);
    for(let i=pieces.length-1;i>=0;i--){pieces[i].age+=seconds;if(pieces[i].age>18){viewer.entities.remove(pieces[i].entity);pieces.splice(i,1);}}
    for(let i=sidewalkPieces.length-1;i>=0;i--){
      const piece=sidewalkPieces[i];
      // Start its brief effect when rendered, rather than spending its whole
      // lifetime waiting for the first geometry upload.
      if(!piece.handle.ready){
        piece.waiting+=seconds;
        if(piece.waiting>=5){piece.handle.dispose();sidewalkPieces.splice(i,1);}
        continue;
      }
      piece.age+=seconds;
      if(piece.age>=SIDEWALK_LIFETIME){piece.handle.dispose();sidewalkPieces.splice(i,1);}
      else piece.handle.update(sidewalkDebrisPose(piece.age,piece.index));
    }
    if(sidewalkPieces.length)viewer.scene?.requestRender();
  }
  function setVisible(value){visible=Boolean(value);for(const piece of pieces)piece.entity.show=visible;for(const piece of sidewalkPieces)piece.handle.show(visible);}
  function destroy(){if(!destroyed){clear();destroyed=true;}}
  return {addBuilding,addSidewalk,tick,clear,destroy,setVisible};
}
