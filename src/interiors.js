import { Cartesian2, Cartesian3, HeadingPitchRoll, Transforms, Matrix4, Model, Axis, ImageBasedLighting } from 'cesium';
import { createInteriorNpcs } from './interior-npcs.js';
import { CHARACTER_MODEL } from './character.js';
import { createCharacterRenderer } from './character-renderer.js';

// Authored game-space layouts. These do not claim to reproduce real interiors.
export const LAYOUTS = Object.freeze({
  lobby: { name: 'Lobby and rooms', width: 18, depth: 18, spawn: [0, -7.5],
    walls: [[-4,-2,-4,9], [4,-2,4,9], [-9,-2,-5,-2], [-3,-2,3,-2], [5,-2,9,-2], [-4,4,-1,4], [1,4,4,4]],
    furniture: [[-6.5,5,2.5,1.4], [6.5,5,2.5,1.4], [0,7,2,1]],
  },
  shop: { name: 'Shop and back room', width: 14, depth: 16, spawn: [0,-6.5],
    walls: [[-7,3,-1,3], [1,3,7,3]],
    furniture: [[-4,-1,1.2,6], [4,-1,1.2,6], [0,6,5,1.4]],
  },
  home: { name: 'Furnished apartment', width: 14, depth: 12, spawn: [0,-4.5],
    walls: [[2,-6,2,-4],[2,-2.7,2,2],[2,3.2,2,6],[-7,1,-1,1],[0.5,1,2,1],[2,0,3.2,0],[4.4,0,7,0]],
    furniture: [[-4.8,-2.8,3,1.6],[-4.8,-0.65,1.6,0.8],[-3.6,5,5,1.4],[-3.9,2.6,2.4,1.3],[4.6,3.85,3.4,3],[6.37,0.88,1.08,1.25],[5.9,-5.3,1.7,1.15],[5.92,-1.45,1.8,1.7],[3.45,-5.15,0.85,1.45]],
  },
});

function segmentDistance(x, y, wall) {
  const [ax,ay,bx,by] = wall; const dx = bx-ax; const dy = by-ay;
  const t = Math.max(0, Math.min(1, ((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy || 1)));
  return Math.hypot(x-ax-dx*t, y-ay-dy*t);
}
export function interiorBlocked(layout, x, y, radius = 0.3) {
  if (Math.abs(x) > layout.width/2-radius || Math.abs(y) > layout.depth/2-radius) return true;
  if (layout.walls.some(w => segmentDistance(x,y,w) < radius+0.09)) return true;
  return layout.furniture.some(([cx,cy,w,d]) => Math.abs(x-cx)<w/2+radius && Math.abs(y-cy)<d/2+radius);
}

export function createInterior(viewer, {
  loadModel = options => Model.fromGltfAsync(options),
  rendererFactory = createCharacterRenderer,
  npcFactory = createInteriorNpcs,
} = {}) {
  let active = false; let layout; let frame; let origin; let building;
  let x=0; let y=0; let heading=0; let speed=0;
  let generation=0; let model; let roomReady=false; let error=''; let npcs; let actorRenderer; let actorModel;
  let removeRoomReady; let removeRoomError;
  const entities=[];
  const world = (east,north,height=0) => Matrix4.multiplyByPoint(frame,new Cartesian3(east,north,height),new Cartesian3());
  const playable = () => active && roomReady && !error && actorRenderer?.status==='ready'
    && actorModel?.ready===true && actorModel.show===true && !actorModel.isDestroyed?.();
  function exit() {
    generation++;
    removeRoomReady?.();removeRoomReady=undefined;
    removeRoomError?.();removeRoomError=undefined;
    npcs?.destroy();npcs=undefined;
    actorRenderer?.destroy();actorRenderer=undefined;
    actorModel=undefined;
    for(const entity of entities) viewer.entities.remove(entity);
    entities.length=0;
    if(model){viewer.scene.primitives.remove(model);if(!model.isDestroyed?.())model.destroy();}
    model=undefined; active=false; roomReady=false; error='';speed=0;
  }
  function enter(sourceBuilding, outside) {
    exit(); building=sourceBuilding;
    const kind=sourceBuilding.heightFeet<=20?'shop':sourceBuilding.heightFeet<=40?'home':'lobby';
    layout=LAYOUTS[kind];
    origin=Cartesian3.fromDegrees(outside.longitude,outside.latitude,outside.height);
    frame=Transforms.eastNorthUpToFixedFrame(origin);
    [x,y]=layout.spawn; heading=0; speed=0; active=true;
    const current=generation;
    const coefficients=Array.from({length:9},()=>new Cartesian3());
    coefficients[0]=new Cartesian3(0.6,0.6,0.6);
    void Promise.resolve().then(()=>loadModel({url:`/models/interiors/${kind}.glb`,modelMatrix:frame,scale:1,
      // Only undo glTF Y-up conversion. This keeps authored east/north coordinates
      // aligned with the same walls and furniture used by collision queries.
      upAxis:Axis.Y,forwardAxis:Axis.X,incrementallyLoadTextures:false,
      imageBasedLighting:new ImageBasedLighting({imageBasedLightingFactor:new Cartesian2(1,0),sphericalHarmonicCoefficients:coefficients}),
    })).then(loaded=>{
      if(current!==generation || !active){if(!loaded.isDestroyed?.())loaded.destroy();return;}
      model=loaded;
      const markReady=()=>{
        if(current!==generation || !active || model!==loaded || roomReady || error)return;
        roomReady=true;removeRoomReady?.();removeRoomReady=undefined;
        if(CHARACTER_MODEL.detailed)npcs=npcFactory(viewer,{world,layout,kind,modelUrl:CHARACTER_MODEL.url,blocked:(east,north,radius)=>interiorBlocked(layout,east,north,radius)});
      };
      removeRoomReady=loaded.readyEvent.addEventListener(markReady);
      removeRoomError=loaded.errorEvent.addEventListener(()=>{
        if(current===generation && active){roomReady=false;error='Interior could not render. Use Exit or E to return outside and try again.';}
      });
      viewer.scene.primitives.add(loaded);
      if(loaded.ready)markReady();
    }).catch(()=>{if(current===generation && active)error='Interior model could not load. Use Exit or E to return outside and try again.';});
    actorRenderer=rendererFactory(viewer,{
      modelUrl:CHARACTER_MODEL.url,
      strideLength:CHARACTER_MODEL.walkStrideLength,runStrideLength:CHARACTER_MODEL.runStrideLength,
      getMatrix:()=>Transforms.headingPitchRollToFixedFrame(world(x,y,0.025),new HeadingPitchRoll(heading-Math.PI/2,0,0)),
      getShow:()=>roomReady && active && !error,
      getMoving:()=>Math.abs(speed)>0.01,
      getSpeed:()=>speed,
      onReady:loaded=>{if(current===generation && active)actorModel=loaded;},
      onError:()=>{if(current===generation && active)error='The character animation could not load. Use Exit or E to return outside and try again.';},
    });tick({},0);
    return {name:layout.name,buildingId:building.id,layout};
  }
  function tick(input,dt,paused=false) {
    if(!active) return null;
    const ready=Boolean(playable());
    const seconds=Number.isFinite(dt)?Math.max(0,Math.min(dt,0.1)):0;
    const throttle=Number.isFinite(input?.throttle)?Math.max(-1,Math.min(1,input.throttle)):0;
    const steer=Number.isFinite(input?.steer)?Math.max(-1,Math.min(1,input.steer)):0;
    const stopped=paused||!ready;
    const desiredSpeed=stopped||input?.handbrake?0:throttle*(input?.sprint && throttle>0?4:1.65);
    // Consume the host's bounded frame interval in collision-safe steps instead
    // of discarding elapsed time when the city renders below 20 frames/second.
    const steps=Math.max(1,Math.ceil(seconds/(1/30)));const step=seconds/steps;
    let people={};
    for(let index=0;index<steps;index++){
      speed=desiredSpeed;
      if(!stopped)heading+=steer*2.25*step;
      const nx=x+Math.sin(heading)*speed*step;const ny=y+Math.cos(heading)*speed*step;
      if(!interiorBlocked(layout,nx,ny) && !npcs?.blocks(nx,ny)){x=nx;y=ny;}else speed=0;
      people=npcs?.tick(step,stopped,{x,y})??{};
    }
    // A room-scale overhead camera keeps the mapped layout readable and avoids
    // needing bespoke camera and entrance animations for each city building.
    const position=world(x-Math.sin(heading)*4,y-Math.cos(heading)*4,8);
    const target=world(x+Math.sin(heading)*1,y+Math.cos(heading)*1,0.8);
    viewer.camera.setView({destination:position,orientation:{
      direction:Cartesian3.normalize(Cartesian3.subtract(target,position,new Cartesian3()),new Cartesian3()),
      up:Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame,Cartesian3.UNIT_Z,new Cartesian3()),new Cartesian3()),
    }});
    return {x,y,heading,speed,ready,error,...(ready?people:{}),nearExit:Boolean(error)||Math.hypot(x-layout.spawn[0],y-layout.spawn[1])<2.2,layoutName:layout.name,buildingId:building.id};
  }
  return {enter,exit,tick,talk:()=>playable()?npcs?.interact({x,y}):undefined,destroy:exit,get active(){return active;}};
}
