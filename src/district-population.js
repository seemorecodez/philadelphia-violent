import {Cartesian3,Cartographic,HeadingPitchRoll,Transforms} from 'cesium';
import {localPoint,geographicPoint} from './district-geometry.js';
import {advanceAlongPath,createStreetGraph,sampleLane,chooseContinuation} from './district-navigation.js';
import {createVehicleRenderer} from './vehicle-renderer.js';
import {createVehicleAnimator} from './vehicle-animation.js';
import {wheelRigs} from './wheel-rigs.js';
import {createCharacterRenderer} from './character-renderer.js';
import {CHARACTER_MODEL} from './character.js';
const carUrl='/models/mustang-2005.glb';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function createDistrictPopulation(viewer,{surfaceAt,canOccupy,onStatus=()=>{}}){
  let enabled=false,visible=true,graph=null,paths=[],focus=null,player=null,time=0,spawnAt=0,sequence=0,epoch=0,failures=0;
  const cars=[],walkers=[];
  function locate(p){const [longitude,latitude]=geographicPoint([p.x,p.y]);const surface=surfaceAt(longitude,latitude),base=surface?.height;
    return Number.isFinite(base)&&surface?{longitude,latitude,height:base+surface.lift,heading:p.heading}:null;}
  const matrix=a=>Transforms.headingPitchRollToFixedFrame(Cartesian3.fromDegrees(a.geo.longitude,a.geo.latitude,a.geo.height+.03),new HeadingPitchRoll(a.geo.heading-Math.PI/2,0,0));
  function valid(p,kind){const geo=locate(p);if(!geo)return null;const surface=surfaceAt(geo.longitude,geo.latitude);
    if(kind==='car'&&!['road','parking'].includes(surface.kind))return null;
    if(kind==='ped'&&!['sidewalk','concrete','road'].includes(surface.kind))return null;
    return canOccupy(geo,kind)?geo:null;
  }
  function clear(){epoch++;for(const a of [...cars,...walkers])a.renderer.destroy();cars.length=0;walkers.length=0;focus=null;}
  function addCar(edge,d){const p=sampleLane(edge,d),geo=valid(p,'car');if(!geo||cars.some(a=>distance(a.p,p)<14))return;
    const a={edge,d,p,geo,speed:0,id:sequence++,renderer:null,ready:false,turns:0};
    a.renderer=createVehicleRenderer(viewer,{getMatrix:()=>matrix(a),createAnimator:(m,url)=>createVehicleAnimator(m,wheelRigs[url],()=>({speed:a.speed,steer:0}))});
    cars.push(a);a.renderer.select(carUrl).then(ok=>{a.ready=ok;a.renderer.show=ok&&enabled&&visible;}).catch(()=>{failures++;onStatus('A traffic vehicle failed to load.','warning');});
  }
  function addWalker(path,d){const p=advanceAlongPath(path.points,d),geo=valid(p,'ped');if(!geo||walkers.some(a=>distance(a.p,p)<8))return;
    const a={path,d,direction:1,p,geo,speed:0,id:sequence++,renderer:null};
    a.renderer=createCharacterRenderer(viewer,{modelUrl:CHARACTER_MODEL.url,getMatrix:()=>matrix(a),getShow:()=>enabled&&visible,getMoving:()=>a.speed>.05,getSpeed:()=>a.speed,strideLength:CHARACTER_MODEL.walkStrideLength,onError:()=>{failures++;}});walkers.push(a);
  }
  return {async setEnabled(value){enabled=Boolean(value);if(!enabled){clear();return;}if(graph)return;const run=epoch;
      const read=async url=>{const r=await fetch(url);if(!r.ok)throw Error('District population paths unavailable');return r.json();};
      const [streets,peds]=await Promise.all([read('/data/district/streets.geojson'),read('/data/district/pedestrian-paths.geojson')]);if(run!==epoch)return;
      graph=createStreetGraph(streets.features);
      paths=peds.features.filter(f=>f.properties.line_type===1&&f.properties.feat_type==='PATH'&&f.geometry.type==='LineString').map(f=>({id:f.properties.objectid,points:f.geometry.coordinates.map(localPoint)})).filter(p=>{try{p.length=advanceAlongPath(p.points,0).length;return p.length>12&&p.length<250;}catch{return false;}});
    },
    update(state){player=state;const p=localPoint([state.longitude,state.latitude]);focus={x:p[0],y:p[1]};},
    tick(dt,paused=false){
      if(!enabled||!graph||!focus)return;for(const a of cars)a.renderer.show=visible&&a.ready;
      if(paused||!visible){for(const a of [...cars,...walkers])a.speed=0;return;}time+=dt;
      for(const list of [cars,walkers])for(let i=list.length-1;i>=0;i--)if(distance(list[i].p,focus)>300){list[i].renderer.destroy();list.splice(i,1);}
      if(time-spawnAt>1.5){spawnAt=time;
        const edges=graph.edges.map(edge=>({edge,p:sampleLane(edge,edge.length*.55)})).filter(x=>x.edge.length>45&&distance(x.p,focus)>25&&distance(x.p,focus)<160).sort((a,b)=>distance(a.p,focus)-distance(b.p,focus));
        for(const {edge} of edges){if(cars.length>=4)break;if(!cars.some(c=>c.edge.id===edge.id))addCar(edge,edge.length*.55);}
        const nearby=paths.map(path=>({path,p:advanceAlongPath(path.points,path.length*.4)})).filter(x=>distance(x.p,focus)<90).sort((a,b)=>distance(a.p,focus)-distance(b.p,focus));
        for(const {path} of nearby){if(walkers.length>=4)break;if(!walkers.some(w=>w.path.id===path.id))addWalker(path,path.length*.4);}
      }
      for(const a of cars){
        if(!a.ready)continue;
        const gap=cars.some(b=>b!==a&&b.edge.id===a.edge.id&&b.d>a.d&&b.d-a.d<11);
        const ahead=distance(a.p,focus)<13&&((focus.x-a.p.x)*Math.sin(a.p.heading)+(focus.y-a.p.y)*Math.cos(a.p.heading))>0;
        const ped=walkers.some(w=>distance(w.p,a.p)<7);
        const speed=gap||ahead||ped?0:6.7; // 15mph district circulation; intersection AI remains limited.
        const nextD=Math.min(a.edge.length,a.d+speed*dt),p=sampleLane(a.edge,nextD),geo=valid(p,'car');
        if(!geo){a.speed=0;continue;}a.speed=speed;a.d=nextD;a.p=p;a.geo=geo;
        if(a.d>=a.edge.length){const edge=chooseContinuation(graph,a.edge,a.id+a.turns++);if(edge){a.edge=edge;a.d=0;}else a.speed=0;}
      }
      for(const a of walkers){
        let d=a.d+a.direction*1.25*dt;if(d>a.path.length||d<0){a.direction*=-1;d=Math.max(0,Math.min(a.path.length,d));}
        const p=advanceAlongPath(a.path.points,d);if(a.direction<0)p.heading+=Math.PI;
        const geo=valid(p,'ped'),blocked=distance(p,focus)<1.5||walkers.some(b=>b!==a&&distance(b.p,p)<1)||cars.some(b=>distance(b.p,p)<5);
        if(!geo||blocked){a.speed=0;if(!geo)a.direction*=-1;continue;}
        a.speed=1.25;a.d=d;a.p=p;a.geo=geo;
      }
    },
    collides(state,kind){const [x,y]=localPoint([state.longitude,state.latitude]);return cars.some(a=>a.ready&&distance({x,y},a.p)<(kind==='walking'?2.4:4.7));},
    setVisible(value){visible=value;for(const a of cars)a.renderer.show=value&&a.ready;},clear,destroy:clear,
    getStats:()=>({traffic:cars.filter(a=>a.ready).length,pedestrians:walkers.filter(a=>a.renderer.status==='ready').length,trafficLimit:4,pedestrianLimit:4,loadFailures:failures}),
  };
}
