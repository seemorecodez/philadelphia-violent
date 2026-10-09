import {
  Viewer, Cartesian2, Cartesian3, Cartographic, Color, Math as CesiumMath,
  HeadingPitchRoll, HeadingPitchRange, Transforms, Matrix4,
  ScreenSpaceEventHandler, ScreenSpaceEventType,
  I3SDataProvider, ArcGisMapServerImageryProvider,
  Credit, Globe, EllipsoidTerrainProvider, RequestScheduler, JulianDate, ShadowMode,
} from 'cesium';
import { createVehicleState, stepVehicle, stopVehicle, degreesToRadians } from './driving.js';
import { SOURCES } from './sources.js';
import { createPublicBuildings } from './public-buildings.js';
import { createHouseDetails } from './house-details.js';
import { createPublicTerrain } from './public-terrain.js';
import { vehicles } from './vehicles.js';
import { moveOnFoot, WALKER_SHAPE, groundDistance, intersectsParkedCar } from './walking.js';
import { createInterior } from './interiors.js';
import { createDebris } from './destruction.js';
import { createStreetObjects } from './street-objects.js';
import { createPerformanceMonitor } from './performance.js';
import { CHARACTER_MODEL } from './character.js';
import { createVehicleRenderer } from './vehicle-renderer.js';
import { createCharacterRenderer } from './character-renderer.js';
import { createVehicleAnimator } from './vehicle-animation.js';
import { wheelRigs } from './wheel-rigs.js';
import { createSidewalkSurfaces } from './sidewalk-surfaces.js';
import { createCameraRig } from './camera-rig.js';
import { fitVehicleGroundPose } from './vehicle-ground-pose.js';
import { createCityPhotoRecovery } from './city-photo-recovery.js';
import { CITY_PHOTO_ASSETS } from './city-photo-assets.js';
import { createGameDistrict } from './game-district.js';
import { createRenderCounters } from './render-counters.js';
import { createDistrictPopulation } from './district-population.js';

const STEP = 1 / 30;
const qualityOptions = {
  low: { maximumScreenSpaceError: 28, cacheBytes: 256 * 1024 * 1024 },
  balanced: { maximumScreenSpaceError: 24, cacheBytes: 512 * 1024 * 1024 },
  high: { maximumScreenSpaceError: 8, cacheBytes: 768 * 1024 * 1024,
    dynamicScreenSpaceError: false, foveatedTimeDelay: 0 },
};

export function createWorld(container, { onStatus, onFrame, onPause, onMotion = () => {} }) {
  const viewer = new Viewer(container, {
    globe: new Globe(), baseLayer: false, geocoder: false, baseLayerPicker: false,
    animation: false, timeline: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, skyBox: false,
    scene3DOnly: true, shadows: false, requestRenderMode: true, shouldAnimate: true,
    maximumRenderTimeChange: Infinity,
  });
  const scene = viewer.scene;
  const renderCounters=createRenderCounters(scene.canvas);
  const district=createGameDistrict(viewer,{onStatus:(message,type)=>onStatus(message,type,'source')});
  let aerialEnabled=true;
  let districtSpawn=null;
  const performanceMonitor=createPerformanceMonitor();
  let renderTimer;
  let performanceStats=null;
  let performanceAt=0;
  scene.canvas.tabIndex = 0;
  scene.backgroundColor = Color.fromCssColorString('#10171c');
  scene.globe.show = false;
  scene.globe.depthTestAgainstTerrain = true;
  scene.globe.baseColor = Color.fromCssColorString('#70746d');
  scene.postProcessStages.fxaa.enabled = true;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  viewer.targetFrameRate = 60;
  // A stable daylight session makes asset review independent of wall-clock time.
  // Source photos retain their original baked lighting; only live actors cast
  // new shadows. This does not remove shadows from the aerial photographs.
  viewer.clock.currentTime = JulianDate.fromIso8601('2026-06-21T19:00:00Z');
  scene.shadowMap.maximumDistance = 100;
  scene.shadowMap.size = 1024;
  scene.shadowMap.softShadows = true;
  scene.shadowMap.darkness = 0.45;
  const cameraRig = createCameraRig({ reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  let lookPointer = null;
  function endLook(event) {
    if (event && lookPointer !== null && event.pointerId !== lookPointer) return;
    lookPointer = null; cameraRig.end();
  }
  function beginLook(event) {
    if (![0,2].includes(event.button) || !['driving','walking'].includes(mode) || (cameraMode === 'hood' && mode === 'driving')) return;
    event.preventDefault(); lookPointer = event.pointerId;
    scene.canvas.setPointerCapture(event.pointerId); cameraRig.begin();
  }
  function moveLook(event) {
    if (event.pointerId === lookPointer) { cameraRig.drag(event.movementX, event.movementY); scene.requestRender(); }
  }
  function zoomLook(event) {
    if (!['driving','walking'].includes(mode) || (cameraMode === 'hood' && mode === 'driving')) return;
    event.preventDefault(); cameraRig.scroll(event.deltaY); scene.requestRender();
  }
  const contextMenu = event => { if (connected) event.preventDefault(); };
  scene.canvas.addEventListener('pointerdown', beginLook);
  scene.canvas.addEventListener('pointermove', moveLook);
  scene.canvas.addEventListener('pointerup', endLook);
  scene.canvas.addEventListener('lostpointercapture', endLook);
  scene.canvas.addEventListener('wheel', zoomLook, { passive: false });
  scene.canvas.addEventListener('contextmenu', contextMenu);
  RequestScheduler.requestsByServer['tiles.arcgis.com:443'] = 12;

  let state = createVehicleState({ longitude: -75.1647, latitude: 39.9476 });
  let spawn = null;
  let tileset = null;
  let city = null;
  let cityPhotos = null;
  let cityPhotosEnabled = true;
  let terrain = null;
  let connected = false;
  let mode = 'offline';
  let paused = false;
  let cameraMode = 'chase';
  let input = {};
  let locationHeading = degreesToRadians(9);
  let generation = 0;
  let previous = performance.now();
  let accumulator = 0;
  let hudTime = previous;
  let frames = 0;
  let fps = 0;
  let lastMessage = '';
  let tileError = false;
  let cameraPosition;
  let cameraProbeAt = 0;
  let cameraClearance = Infinity;
  let previousProbeAnchor;
  let previousProbeDirection;
  let loadStarted = 0;
  let vehicleFailed = false;
  let coverageTime = 0;
  let vehicle = vehicles[0];
  let parked = null;
  let outside = null;
  let interiorState = null;
  let interactionTime = 0;
  let nearbyBuilding = null;
  const interior = createInterior(viewer);
  const debris = createDebris(viewer);
  const streetObjects = createStreetObjects(viewer, {
    treeModelUrl:'/models/street/tree-small-02.glb', treeModelHeight:4.5758485700935125,
    treeDistanceModelUrl:'/models/street/tree-small-02-distance.glb', maxVisibleTrees:64, treeDisplayRadius:180,
    parkPlantingUrl:'/data/park-planting.json',
    mappedParkCanopy:true, canPlaceCanopy:object=>{
      const point={longitude:object.longitude,latitude:object.latitude,heading:0};
      return publicBuildings.hasCollisionData(point.longitude,point.latitude,{length:1.5,width:1.5})&&!publicBuildings.wouldCollide(point,point,{length:1.5,width:1.5});
    },
    includeSidewalks:false,
    getTerrainHeight:(lon,lat)=>groundHeight({longitude:lon,latitude:lat}),
    onStatus: (message,type) => { if(connected) onStatus(message,type,'source'); },
  });
  const sidewalks = createSidewalkSurfaces(viewer, {
    // Local crash isolation only: keep the photographed globe, omit raised
    // sidewalk primitives. Normal launches always use the source-photo path.
    renderSection: new URLSearchParams(window.location.search).get('diagnosticNoSidewalks')==='1' ? ()=>null : null,
    onStatus: (message,type) => { if(connected) onStatus(message,type,'source'); },
    onDestroyed: section => debris.addSidewalk(section),
  });
  const houseDetails = createHouseDetails(viewer);
  const publicBuildings = createPublicBuildings(viewer, { details: houseDetails, onStatus: (message, type) => {
    if (connected) onStatus(message, type, 'source');
  } });
  const population=createDistrictPopulation(viewer,{surfaceAt:district.surfaceAt,canOccupy:(p,kind)=>{
    const shape=kind==='car'?{length:4.77,width:2.14}:WALKER_SHAPE;
    return publicBuildings.hasCollisionData(p.longitude,p.latitude,shape)&&!publicBuildings.wouldCollide(p,p,shape);
  },onStatus:(m,t)=>onStatus(m,t,'source')});
  const sourceCredit = new Credit('City: Philadelphia / PASDA / Esri · Sidewalk data: Pictometry Intelligent Images; Intergraph Services Company; Sanborn Mapping Services · Terrain: Mapzen / USGS · Mustang: <a href="https://sketchfab.com/3d-models/2005-ford-mustang-gt-26b6b60cf2804370ac3c64424242dc1f">Ricy</a>, CC BY 4.0 · Huracán: George Zaky, CC BY · Tree: Rico Cilliers / Poly Haven, CC0 · Character: MakeHuman system assets, CC0 · Models modified', false);
  const mapCredit = new Credit('Philadelphia / PASDA · Esri · DVRPC · Mapzen / USGS',true);

  function status(message, type = '') {
    if (message === lastMessage) return;
    lastMessage = message;
    onStatus(message, type);
  }
  const toCartesian = (s, lift = 0) => Cartesian3.fromDegrees(s.longitude, s.latitude, s.height + lift);
  const carState = () => parked || state;
  const carShape = () => ({length:vehicle.length,width:vehicle.width});
  let groundPose = null; let poseAnchor = null; let poseVehicle = null; let poseAt = -Infinity;
  function vehicleMatrix() {
    const position = carState(); const now = performance.now();
    if (!poseAnchor || poseVehicle !== vehicle.id || groundDistance(position,poseAnchor)>4) {
      groundPose = null; poseAt = -Infinity;
    }
    if (now-poseAt>=100) {
      poseAt=now; poseAnchor={...position}; poseVehicle=vehicle.id;
      const measured = fitVehicleGroundPose(position,vehicle,(lon,lat)=>groundHeight({longitude:lon,latitude:lat}));
      if (measured) groundPose=measured;
    }
    const supportHeight = (parked && groundPose ? groundPose.centerHeight : position.height) + (groundPose?.verticalOffset ?? 0);
    return Transforms.headingPitchRollToFixedFrame(toCartesian({...position,height:supportHeight},0.04),
      new HeadingPitchRoll(position.heading-Math.PI/2,groundPose?.pitch ?? 0,groundPose?.roll ?? 0));
  }
  const car=createVehicleRenderer(viewer,{getMatrix:vehicleMatrix,createAnimator:(model,url)=>createVehicleAnimator(model,wheelRigs[url],()=>({
    speed:mode==='driving' && !paused ? state.speed : 0,
    steer:mode==='driving' && !paused ? input.steer : 0,
  }))});
  const actor={show:false};
  const actorRenderer=createCharacterRenderer(viewer,{
    modelUrl:CHARACTER_MODEL.url,
    strideLength:CHARACTER_MODEL.walkStrideLength,runStrideLength:CHARACTER_MODEL.runStrideLength,
    getMatrix:()=>Transforms.headingPitchRollToFixedFrame(toCartesian(state,0.025),new HeadingPitchRoll(state.heading-Math.PI/2,0,0)),
    getShow:()=>actor.show,
    getMoving:()=>mode==='walking' && !paused && Math.abs(state.speed)>0.01,
    getSpeed:()=>state.speed,
    onError:()=>status('The character model or animation could not load.','error'),
  });
  viewer.selectedEntityChanged.addEventListener(() => { viewer.selectedEntity = undefined; });
  // Verify local asset is available without requesting any city data.
  void car.select(vehicle.url).catch(()=>{vehicleFailed=true;status('The local vehicle model could not load.','error');});

  function setPaused(value) {
    paused = value;
    viewer.clock.shouldAnimate=!value;
    if(connected)scene.requestRenderMode=value;
    if (value) { input = {}; endLook(); }
    onPause(value);
    if (['driving','walking','interior'].includes(mode)) status(value ? 'Paused · Press P or Resume to continue.' : mode==='driving' ? 'WASD / arrows to drive · F to leave the car · Space to brake' : mode==='walking' ? 'WASD to walk · Shift to run · E to enter a nearby building · F to return to the car' : 'Explore the interior layout · Return to the green doorway and press E to leave.');
    scene.requestRender();
  }
  function enableMapControls(value) {
    scene.screenSpaceCameraController.enableInputs = value;
    scene.screenSpaceCameraController.enableCollisionDetection = true;
    container.style.cursor = value && connected ? 'crosshair' : 'default';
  }
  function groundHeight(s) {
    const surface=district.surfaceAt(s.longitude,s.latitude);if(Number.isFinite(surface?.height))return surface.height+surface.lift;
    const h=scene.globe.getHeight(Cartographic.fromDegrees(s.longitude, s.latitude));
    return h;
  }
  function followCamera(dt, snap = false) {
    if (!['driving','walking'].includes(mode)) return;
    const frame = Transforms.eastNorthUpToFixedFrame(toCartesian(state));
    const forward = new Cartesian3(Math.sin(state.heading), Math.cos(state.heading), 0);
    const framing = cameraRig.sample({ mode, camera: cameraMode, speed: state.speed, dt, paused });
    const orbit = state.heading + framing.yaw;
    const behind = framing.back;
    const height = framing.height;
    const ahead = framing.ahead;
    const orbitX = Math.sin(orbit); const orbitY = Math.cos(orbit);
    const desired = Matrix4.multiplyByPoint(frame,
      new Cartesian3(-orbitX * behind + orbitY * framing.side, -orbitY * behind - orbitX * framing.side, height), new Cartesian3());
    // Only chase/aerial are damped. Hood camera remains attached to the car.
    if (!cameraPosition || snap || cameraMode === 'hood') cameraPosition = Cartesian3.clone(desired);
    else Cartesian3.lerp(cameraPosition, desired, 1 - Math.exp(-8 * dt), cameraPosition);
    const target = Matrix4.multiplyByPoint(frame,
      new Cartesian3(forward.x * ahead, forward.y * ahead, framing.targetHeight), new Cartesian3());
    if (cameraMode !== 'hood') {
      const anchor = toCartesian(state, 1.3);
      const cameraDirection = Cartesian3.normalize(Cartesian3.subtract(cameraPosition, anchor, new Cartesian3()), new Cartesian3());
      const distance = Cartesian3.distance(anchor, cameraPosition);
      const now = performance.now();
      const cameraMoved = !previousProbeAnchor || Cartesian3.distance(anchor, previousProbeAnchor) > 0.5
        || Cartesian3.dot(cameraDirection, previousProbeDirection) < 0.999;
      if (snap || (cameraMoved && now - cameraProbeAt > 100)) {
        cameraProbeAt = now;
        previousProbeAnchor = Cartesian3.clone(anchor);
        previousProbeDirection = Cartesian3.clone(cameraDirection);
        const cartographic = Cartographic.fromCartesian(cameraPosition);
        const endpoint = { ...state, longitude: CesiumMath.toDegrees(cartographic.longitude), latitude: CesiumMath.toDegrees(cartographic.latitude) };
        cameraClearance = Infinity;
        if (publicBuildings.hasCollisionData(endpoint.longitude, endpoint.latitude)
          && publicBuildings.wouldCollide(state, endpoint, {length:0.4,width:0.4})) {
          // A conservative footprint corridor also protects the chase camera.
          // It avoids expensive synchronous GPU readbacks during driving.
          let low = 0; let high = 1;
          for (let i = 0; i < 6; i++) {
            const fraction = (low + high) / 2;
            const probe = { ...state,
              longitude: state.longitude + (endpoint.longitude - state.longitude) * fraction,
              latitude: state.latitude + (endpoint.latitude - state.latitude) * fraction,
            };
            if (publicBuildings.wouldCollide(state, probe,{length:0.4,width:0.4})) high = fraction;
            else low = fraction;
          }
          cameraClearance = Math.max(0.8, distance * low - 0.25);
        }
      }
      if (cameraClearance < distance) {
        cameraPosition = Cartesian3.add(anchor, Cartesian3.multiplyByScalar(cameraDirection, cameraClearance, new Cartesian3()), new Cartesian3());
      }
    }
    const cameraGroundPoint = Cartographic.fromCartesian(cameraPosition);
    const cameraGroundHeight = groundHeight({longitude:CesiumMath.toDegrees(cameraGroundPoint.longitude),latitude:CesiumMath.toDegrees(cameraGroundPoint.latitude)});
    if (Number.isFinite(cameraGroundHeight) && cameraGroundPoint.height < cameraGroundHeight + 0.3) {
      cameraGroundPoint.height = cameraGroundHeight + 0.3;
      cameraPosition = Cartesian3.fromRadians(cameraGroundPoint.longitude, cameraGroundPoint.latitude, cameraGroundPoint.height);
    }
    const direction = Cartesian3.normalize(Cartesian3.subtract(target, cameraPosition, new Cartesian3()), new Cartesian3());
    const up = Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame, Cartesian3.UNIT_Z, new Cartesian3()), new Cartesian3());
    viewer.camera.frustum.fov = degreesToRadians(framing.fov);
    viewer.camera.setView({ destination: cameraPosition, orientation: { direction, up } });
    car.show = mode==='walking' || cameraMode !== 'hood';
    actor.show = mode==='walking';
  }
  function placeAt(cartesian) {
    if (vehicleFailed) { status('The selected car model is unavailable. Restore its local model file and reload the app.', 'error'); return; }
    const position = Cartographic.fromCartesian(cartesian);
    const lat = CesiumMath.toDegrees(position.latitude);
    const lon = CesiumMath.toDegrees(position.longitude);
    // Restrict placement to the Philadelphia area; this box is not a city boundary map.
    if (lat < 39.85 || lat > 40.15 || lon < -75.31 || lon > -74.94) {
      status('Choose a street in the Philadelphia area, or use a neighborhood shortcut.', 'error'); return;
    }
    const placement = createVehicleState({ longitude: lon, latitude: lat, height: position.height, heading: locationHeading });
    if (!publicBuildings.hasCollisionData(lon, lat,carShape())) {
      publicBuildings.update(lon, lat);
      status('Building boundaries are still loading here. Wait a moment, then click the street again.');
      return;
    }
    if (publicBuildings.wouldCollide(placement, placement,carShape())) {
      status('The car needs more room. Choose a point farther from the building.');
      return;
    }
    state = placement;
    parked=null;
    actor.show=false;
    spawn = { ...state };
    mode = 'driving';
    input = {};
    accumulator = 0;
    car.show = true;
    enableMapControls(false);
    setPaused(false);
    streetObjects.update(lon,lat);
    if(!district.enabled)sidewalks.update(lon,lat);
    followCamera(STEP, true);
    scene.requestRender();
  }
  const clicks = new ScreenSpaceEventHandler(scene.canvas);
  clicks.setInputAction(movement => {
    if (mode !== 'placing' || !city || !scene.pickPositionSupported) return;
    const picked = scene.pick(movement.position);
    if (picked) {
      status('That is a building or object. Click a clear road on the terrain.'); return;
    }
    const ray = viewer.camera.getPickRay(movement.position);
    const hit = scene.globe.pick(ray, scene);
    if (hit) placeAt(hit);
    else status('No surface at that point yet. Wait for the street to load, then click again.');
  }, ScreenSpaceEventType.LEFT_CLICK);
  viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);

  function driveStep(dt) {
    if (!['driving','walking'].includes(mode) || paused) return;
    const shape=mode==='walking'?WALKER_SHAPE:carShape();
    const candidate = mode==='walking'?moveOnFoot(state,input,dt):stepVehicle(state, input, dt);
    if(mode==='walking' && intersectsParkedCar(candidate,parked,carShape())) {
      state={...state,heading:candidate.heading,speed:0};
      status('Walk around the car or press F to get in.');return;
    }
    if (Math.abs(candidate.speed) < 0.001 && Math.abs(state.speed) < 0.001) { state = candidate; return; }
    const height = groundHeight(candidate);
    if (!Number.isFinite(height)) {
      state = stopVehicle(state);
      status('Waiting for the street surface to load. Movement is held until ground is available.');
      return;
    }
    const movement = Cartesian3.distance(toCartesian(state), toCartesian(candidate));
    // Reject abrupt surface jumps rather than teleporting onto roofs or below the street.
    if (Math.abs(height - state.height) > Math.max(0.65, movement * 0.45)) {
      state = stopVehicle(state);
      status('Surface edge ahead · Reverse, steer away, or use Place car to choose a clear street.');
      return;
    }
    if (!publicBuildings.hasCollisionData(candidate.longitude, candidate.latitude,shape)) {
      state = stopVehicle(state);
      status('Loading nearby building boundaries before driving…');
      return;
    }
    if(district.enabled&&district.contains(candidate.longitude,candidate.latitude)&&!district.surfaceAt(candidate.longitude,candidate.latitude)){
      state=stopVehicle(state);status('Loading the next street surface…');return;
    }
    if(district.enabled&&population.collides(candidate,mode)){state=stopVehicle(state);status('Traffic ahead · Slow down or go around.');return;}
    const hit=performanceMonitor.measure('collision',()=>publicBuildings.getCollision(state,candidate,shape));
    if (hit.collides) {
      const result=mode==='driving' && Math.abs(state.speed)>=5 && hit.building ? publicBuildings.tryDestroy(hit.building.id) : null;
      if(result?.destroyed) debris.addBuilding(result.building);
      else { state=stopVehicle(state); status(hit.building?.heightFeet>20 || hit.building?.maxHeightFeet>20 ? 'This building is over 20 feet and stays intact.' : 'Building ahead · Reverse or steer clear.'); return; }
    }
    const streetHit=performanceMonitor.measure('collision',()=>streetObjects.getCollision(state,candidate,shape));
    if(streetHit?.collides){
      const result=mode==='driving' && Math.abs(state.speed)>=3?streetObjects.tryDestroy(streetHit.object.id):null;
      if(!result?.destroyed){state=stopVehicle(state);status('Street object ahead · Walk around it or use X nearby.');return;}
    }
    state = { ...candidate, height };
    if(mode==='driving')status('WASD / arrows to drive · F to leave the car · Space to brake');
  }

  function showOutside(value){
    if(city)city.show=value;
    cityPhotos?.setVisible(value);
    scene.globe.show=value;
    if(scene.skyAtmosphere)scene.skyAtmosphere.show=value;
    publicBuildings.setVisible(value);
    streetObjects.setVisible(value);
    sidewalks.setVisible(value);
    district.setVisible(value);
    population.setVisible(value);
    debris.setVisible(value);
  }
  function exitInterior(){
    if(!outside)return;
    interior.exit();interiorState=null;state={...outside,speed:0};outside=null;
    mode='walking';input={};showOutside(true);actor.show=true;car.show=true;
    cameraPosition=undefined;setPaused(false);followCamera(STEP,true);
  }
  function enterInterior(building){
    outside={...state,speed:0};state=stopVehicle(state);input={};mode='interior';
    actor.show=false;car.show=false;showOutside(false);
    const info=interior.enter(building,state);
    interiorState={...info,layoutName:info.name,nearExit:true};
    setPaused(false);status(`Building ${building.id} · ${info.name} · Authored interior layout. E at the doorway returns outside.`);
  }

  scene.preUpdate.addEventListener(() => {
    const now = performance.now();
    performanceMonitor.setPaused(!connected || document.hidden || paused);
    renderTimer=performanceMonitor.begin('sceneRenderSubmission');
    const dt = Math.max(0, Math.min((now - previous) / 1000, 0.1));
    previous = now;
    if (!connected) return;
    district.tick(dt);
    if(district.enabled){if(mode==='driving'||mode==='walking')population.update(state);population.tick(dt,paused||mode==='placing');}
    if(districtSpawn){
      const p=districtSpawn,h=groundHeight(p);
      if(Number.isFinite(h)&&district.surfaceAt(p.longitude,p.latitude)&&tileset?.tilesLoaded&&scene.globe.tilesLoaded&&now-loadStarted>2500&&publicBuildings.hasCollisionData(p.longitude,p.latitude,carShape())){
        districtSpawn=null;placeAt(Cartesian3.fromDegrees(p.longitude,p.latitude,h));
      }
    }
    if(!paused){
      debris.tick(dt);
      if(mode==='driving' || mode==='walking'){streetObjects.tick(dt);if(!district.enabled)sidewalks.tick(dt);}
      else if(mode==='placing')streetObjects.tick(dt);
    }
    if (now - coverageTime > 1500) {
      coverageTime = now;
      if (mode === 'driving' || mode==='walking') { publicBuildings.update(state.longitude, state.latitude); streetObjects.update(state.longitude,state.latitude); if(!district.enabled)sidewalks.update(state.longitude,state.latitude); district.update(state.longitude,state.latitude); }
      else if(mode==='interior') { /* Keep streamed outside state while exploring a separate room. */ }
      else {
        const ray=viewer.camera.getPickRay(new Cartesian2(scene.canvas.clientWidth/2,scene.canvas.clientHeight/2));
        const surface=ray?scene.globe.pick(ray,scene):null;
        const p = surface ? Cartographic.fromCartesian(surface) : viewer.camera.positionCartographic;
        publicBuildings.update(CesiumMath.toDegrees(p.longitude), CesiumMath.toDegrees(p.latitude));
        district.update(CesiumMath.toDegrees(p.longitude),CesiumMath.toDegrees(p.latitude));
        // Focus streamed detail on the viewed block rather than the ground
        // underneath a distant camera. Park trees appear during exploration too.
        if(surface&&viewer.camera.positionCartographic.height<650&&scene.globe.tilesLoaded)
          streetObjects.update(CesiumMath.toDegrees(p.longitude),CesiumMath.toDegrees(p.latitude));
      }
    }
    if (mode === 'interior') {
      interiorState=performanceMonitor.measure('simulation',()=>interior.tick(input,dt,paused));
      if(interiorState?.error)status(interiorState.error,'error');
      else if(!interiorState?.ready)status('Loading the furnished interior…');
      else if(!paused)status(interiorState.dialogue?`${interiorState.nearbyName}: ${interiorState.dialogue}`:interiorState.nearbyName?`${interiorState.nearbyName} · G to talk · E at the doorway returns outside.`:`${interiorState.layoutName} · Explore the rooms. E at the doorway returns outside.`);
      if(!paused)scene.requestRender();
    }
    else if (mode === 'driving' || mode==='walking') {
      // Keep a stationary car on the actual surface as finer terrain arrives.
      const currentGround = groundHeight(state);
      if (Number.isFinite(currentGround)) state = { ...state, height: currentGround };
      accumulator = Math.min(accumulator + dt, 0.1);
      performanceMonitor.measure('simulation',()=>{while (accumulator >= STEP) { driveStep(STEP); accumulator -= STEP; }});
      followCamera(dt);
      if(mode==='walking' && !paused && now-interactionTime>500){
        interactionTime=now;
        const nearby=publicBuildings.getNearbyBuilding(state,5);
        nearbyBuilding = nearby;
        if(nearby) status(`Building ${nearby.id} · ${Number.isFinite(nearby.heightFeet)?nearby.heightFeet.toFixed(0)+' ft':'height unknown'} · E to enter its game layout${nearby.destroyable?' · X to break':' · Protected structure'}`);
        else status('WASD to walk · Shift to run · E near a building · F near the car · X to break a nearby small object');
      }
      if(!paused)scene.requestRender();
    } else if (mode === 'placing') {
      if (!tileError && tileset?.tilesLoaded && scene.globe.tilesLoaded) status('Click a clear street to place your car. Drag to explore; right-drag to zoom.');
      else if (!tileError && now - loadStarted > 35000) status('City tiles are taking longer to load. Check your connection or try a lower 3D detail setting.');
    }
    onMotion({mode, paused, speed: mode==='interior' ? interiorState?.speed : state.speed,
      distance: mode==='interior' ? undefined : state.distance});
    if (now - hudTime > 250) {
      fps = frames / ((now - hudTime) / 1000);
      frames = 0;
      hudTime = now;
      if(now-performanceAt>1000){
          const props=streetObjects.getStats();
          const houses=houseDetails.getStats();
          performanceMonitor.setBudget('individualHouses',houses.houses,houses.limit);
        performanceMonitor.setBudget('detailedTrees',props.renderedTrees,props.treeLimit);
        performanceMonitor.setBudget('streetObjects',props.rendered,300);
        const surfaces=sidewalks.getStats();
        performanceMonitor.setBudget('sidewalkSections',surfaces.rendered,surfaces.limit);
        const pop=population.getStats();performanceMonitor.setBudget('traffic',pop.traffic,pop.trafficLimit);performanceMonitor.setBudget('pedestrians',pop.pedestrians,pop.pedestrianLimit);
        performanceStats={...performanceMonitor.getStats(),render:renderCounters.getStats(),district:district.getStats(),population:pop};performanceAt=now;
      }
      onFrame({...state,mode,paused,input,interior:interiorState,
        nearbyBuilding:mode==='walking' ? nearbyBuilding?.id : null,
        canEnterCar:mode==='walking' && parked && groundDistance(state,parked)<=5,
        vehicleId:vehicle.id,vehicleName:vehicle.name,performance:performanceStats}, fps);
    }
  });
  scene.preRender.addEventListener(()=>renderCounters.begin());
  scene.postRender.addEventListener(() => { renderCounters.end();frames++;performanceMonitor.end(renderTimer);performanceMonitor.frame(); });
  scene.renderError.addEventListener(() => {
    setPaused(true);
    status('3D rendering stopped. Disconnect and reload; lower detail may help on this computer.', 'error');
  });

  return {
    onRenderedFrame(callback) { return scene.postRender.addEventListener(callback); },
    async connect(quality) {
      if (!scene.sampleHeightSupported || !scene.pickPositionSupported) throw new Error('Surface picking unavailable');
      this.disconnect();
      viewer.resolutionScale = quality === 'low' ? 0.75 : quality === 'high' ? 1.25 : 1;
      viewer.shadows = quality === 'high';
      scene.shadowMap.size = quality === 'high' ? 2048 : 1024;
      scene.globe.maximumScreenSpaceError = quality === 'low' ? 6 : quality === 'high' ? 2 : 4;
      const current = ++generation;
      const options = { ...qualityOptions[quality] || qualityOptions.balanced,
          maximumCacheOverflowBytes: 128 * 1024 * 1024,
          showCreditsOnScreen: true, enableCollision: true,
          preloadWhenHidden: false, preloadFlightDestinations: false,
          shadows: ShadowMode.DISABLED,
      };
      // Display orthometric heights from the sources in a shared local frame.
      // I3S uses EGM96; local USGS terrain is NAVD88. Their residual vertical
      // difference is not survey-corrected; do not shift only one by 30m to ellipsoid.
      const resources = [
        I3SDataProvider.fromUrl(SOURCES.buildings, { name: 'Philadelphia public 3D buildings', cesium3dTilesetOptions: options, calculateNormals: true, showFeatures: true }),
        createPublicTerrain(),
        ArcGisMapServerImageryProvider.fromUrl(SOURCES.imagery, { enablePickFeatures: false }),
      ];
      const pending = Promise.all(resources);
      let timeout;
      try {
        const loaded = await Promise.race([pending, new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Connection timed out')), 35000);
        })]);
        if (current !== generation) { loaded[0].destroy(); throw new Error('Connection cancelled'); }
        [city, terrain] = loaded;
        tileset = city.layers[0].tileset;
        tileset.tileFailed.addEventListener(() => {
          tileError = true;
          // A failed visual tile must not permanently disable Resume. Movement
          // still requires independently loaded footprints and ground below.
          onStatus('A public 3D tile failed to load. Some city detail may be missing; reconnect to retry.', 'error', 'source');
        });
        scene.primitives.add(city);
        cityPhotos=createCityPhotoRecovery(viewer,city,CITY_PHOTO_ASSETS,{onStatus:(message,type)=>onStatus(message,type,'source')});
        cityPhotos.setEnabled(cityPhotosEnabled);
        viewer.terrainProvider = terrain;
        // Preserve the source detail until a faithful, selectively cleaned 3D
        // replacement passes visual comparison. Plain surface fills are an
        // isolated diagnostic, not an accepted replacement for these photos.
        loaded[2].errorEvent.addEventListener(error => {
          if (!connected || current !== generation) return;
          if (error.timesRetried === 0) { error.retry=true; return; }
          onStatus('A source imagery tile failed to load. Some ground detail may be missing; reconnect to retry.', 'error', 'source');
        });
        viewer.imageryLayers.addImageryProvider(loaded[2]).show=aerialEnabled;
        scene.globe.show = true;
        if(scene.skyAtmosphere)scene.skyAtmosphere.show=true;
        scene.frameState.creditDisplay.addStaticCredit(sourceCredit);
        scene.frameState.creditDisplay.addStaticCredit(mapCredit);
        connected = true;
        performanceMonitor.reset();
        scene.requestRenderMode = false;
        tileError = false;
        loadStarted = performance.now();
      } catch (error) {
        generation++;
        // Each source has an independent lifetime. Promise.all can reject after
        // another source succeeds, or time out before that source finishes.
        void resources[0].then(lateCity => {
          if (lateCity && !lateCity.isDestroyed()) {
            if (scene.primitives.contains(lateCity)) scene.primitives.remove(lateCity);
            else lateCity.destroy();
          }
        }, () => {});
        void resources[1].then(lateTerrain => lateTerrain?.dispose?.(), () => {});
        throw error;
      } finally { clearTimeout(timeout); }
    },
    disconnect() {
      generation++;
      cityPhotos?.destroy(); cityPhotos=null;
      viewer.camera.cancelFlight();
      connected = false;
      mode = 'offline';
      input = {};
      state = stopVehicle(state);
      car.show = false;
      spawn = null;
      parked=null;outside=null;interiorState=null;interior.exit();actor.show=false;
      streetObjects.clear();sidewalks.clear();debris.clear();district.clear();population.clear();districtSpawn=null;
      cameraPosition = undefined;
      cameraRig.reset(); endLook();
      previousProbeAnchor = undefined;
      previousProbeDirection = undefined;
      if (city) { scene.primitives.remove(city); city = null; tileset = null; }
      viewer.imageryLayers.removeAll();
      viewer.terrainProvider = new EllipsoidTerrainProvider();
      terrain?.dispose?.();
      terrain = null;
      scene.globe.show = false;
      if(scene.skyAtmosphere)scene.skyAtmosphere.show=false;
      publicBuildings.clear();
      publicBuildings.setVisible(true);streetObjects.setVisible(true);sidewalks.setVisible(true);
      scene.frameState.creditDisplay.removeStaticCredit(sourceCredit);
      scene.frameState.creditDisplay.removeStaticCredit(mapCredit);
      scene.requestRenderMode = true;
      enableMapControls(false);
      setPaused(false);
      scene.requestRender();
    },
    setCityPhotos(value) { cityPhotosEnabled=!!value; cityPhotos?.setEnabled(cityPhotosEnabled); },
    setAerialImagery(value){aerialEnabled=Boolean(value);for(let i=0;i<viewer.imageryLayers.length;i++)viewer.imageryLayers.get(i).show=aerialEnabled;scene.requestRender();},
    async startCityWorld(location){
      await district.setEnabled(true);sidewalks.clear();sidewalks.setVisible(false);this.setAerialImagery(false);
      await population.setEnabled(new URLSearchParams(window.location.search).get('districtNoPopulation')!=='1');
      this.changeLocation(location);district.update(location.longitude,location.latitude);
    },
    async startGameDistrict(){
      // Middle of actual N 10th Street segment 440944, traveling TF (south).
      const spawnPoint={name:'Chinatown / Reading Terminal · gameplay district',longitude:-75.15599476,latitude:39.95493557,heading:189.5};
      await this.startCityWorld(spawnPoint);
      districtSpawn=new URLSearchParams(window.location.search).get('districtNoAutoSpawn')==='1'?null:spawnPoint;
    },
    changeLocation(location) {
      if (!connected) return;
      districtSpawn=null;
      if(mode==='interior')exitInterior();
      viewer.camera.cancelFlight();
      mode = 'placing';
      car.show = false;
      spawn = null;
      parked=null;actor.show=false;
      state = createVehicleState({ ...location, heading: degreesToRadians(location.heading) });
      locationHeading = state.heading;
      cameraRig.reset();
      input = {};
      cameraPosition = undefined;
      loadStarted = performance.now();
      enableMapControls(true);
      setPaused(false);
      status(`Loading ${location.name}. Choose a clear street when the 3D scene appears.`);
      publicBuildings.update(location.longitude, location.latitude);
      viewer.camera.flyTo({
        destination: Cartesian3.fromDegrees(location.longitude, location.latitude - 0.0025, 320),
        orientation: { heading: 0, pitch: degreesToRadians(-48), roll: 0 },
        duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.4,
      });
    },
    startPlacement() {
      if (!connected) return;
      if(mode==='interior')exitInterior();
      input = {};
      state = stopVehicle(state);
      car.show = false;
      actor.show=false;parked=null;
      mode = 'placing';
      enableMapControls(true);
      setPaused(false);
      viewer.camera.lookAt(toCartesian(state), new HeadingPitchRange(state.heading, degreesToRadians(-60), 150));
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      status('Click a clear street to place your car. Avoid rooftops, trees and parked cars.');
    },
    reset() {
      if (!spawn || !connected) return;
      if(mode==='interior')exitInterior();
      state = { ...spawn };
      input = {};
      mode = 'driving';
      parked=null;actor.show=false;
      enableMapControls(false);
      setPaused(false);
      followCamera(STEP, true);
      status('Back at your placed position · WASD / arrows to drive.');
    },
    setInput(value) { input = value; },
    async setVehicle(id){
      const selected=vehicles.find(v=>v.id===id);
      if(!selected || !['offline','placing','driving'].includes(mode))return;
      if(mode==='driving' && (Math.abs(state.speed)>0.2 || publicBuildings.wouldCollide(state,state,selected))){status('Stop in a clear area before changing vehicles.');return;}
      if(selected.id===vehicle.id)return;
      const wasPaused=paused;
      const current=generation;
      state=stopVehicle(state);input={};setPaused(true);
      status(`Loading ${selected.name}…`);
      try {
        if(await car.select(selected.url)) {vehicle=selected;vehicleFailed=false;}
      } finally {if(current===generation)setPaused(wasPaused);scene.requestRender();}
    },
    toggleVehicle(){
      if(mode==='driving'){
        if(Math.abs(state.speed)>0.2){status('Stop the car before getting out.');return;}
        for(const side of [1,-1,0,2]){
          const angle=state.heading+Math.PI/2*side;
          const candidate={...state,longitude:state.longitude+Math.sin(angle)*3/ (111320*Math.cos(state.latitude*Math.PI/180)),latitude:state.latitude+Math.cos(angle)*3/111320,speed:0};
          const height=groundHeight(candidate);
          if(Number.isFinite(height) && !publicBuildings.wouldCollide(candidate,candidate,WALKER_SHAPE) && !streetObjects.getCollision(candidate,candidate,WALKER_SHAPE)?.collides){
            parked={...state};state={...candidate,height};mode='walking';actor.show=true;input={};cameraPosition=undefined;setPaused(false);followCamera(STEP,true);return;
          }
        }
        status('There is not enough clear space beside the car. Move it away from the wall.');
      }else if(mode==='walking' && parked){
        if(groundDistance(state,parked)>5){status('Walk back to within 5 metres of your car to get in.');return;}
        state={...parked};parked=null;mode='driving';actor.show=false;input={};cameraPosition=undefined;setPaused(false);followCamera(STEP,true);
      }
    },
    interact(){
      if(mode==='interior'){
        if(interiorState?.nearExit)exitInterior();else status('Return to the green doorway to leave this interior.');
      }else if(mode==='walking'){
        const building=publicBuildings.getNearbyBuilding(state,5);
        if(building)enterInterior(building);else status('Walk within 5 metres of a building to enter its layout.');
      }else status('Leave the car before entering a building.');
    },
    damage(){
      interactionTime=performance.now()+2500;
      if(mode!=='walking'){status('Leave the car and approach a small building or street object to break it.');return;}
      const street=streetObjects.damageNearest(state,4);
      if(street?.destroyed){status(`Destroyed ${street.object?.kind || 'street object'}.`);return;}
      // A building within reach is an explicit target; do not silently break
      // its adjacent pavement instead, especially when the height protects it.
      const building=publicBuildings.getNearbyBuilding(state,4);
      if(building){
        const result=publicBuildings.tryDestroy(building.id);
        if(result.destroyed){debris.addBuilding(result.building);status('Small building destroyed. Buildings over 20 feet remain intact.');}
        else status(result.reason==='too-tall'?'This building is over 20 feet and cannot be destroyed.':result.reason==='unknown-height'?'This building has no verified height and remains protected.':result.reason==='downtown-mesh'?'This detailed downtown mesh cannot yet be separated for destruction.':'This building is not ready for destruction.');
        return;
      }
      const surface=sidewalks.damageNearest(state,4);
      if(surface.destroyed){status('Sidewalk section broken.');return;}
      status('Move within 4 metres of a destructible object.');
    },
    talk(){if(mode==='interior'){input={};interior.talk();}},
    setCamera(value) { cameraMode = value; cameraRig.reset(); followCamera(STEP, true); },
    togglePause() { if (['driving','walking','interior'].includes(mode)) setPaused(!paused); },
    pause() { if (['driving','walking','interior'].includes(mode)) setPaused(true); },
    destroy() {
      this.disconnect();
      scene.canvas.removeEventListener('pointerdown',beginLook); scene.canvas.removeEventListener('pointermove',moveLook);
      scene.canvas.removeEventListener('pointerup',endLook); scene.canvas.removeEventListener('lostpointercapture',endLook);
      scene.canvas.removeEventListener('wheel',zoomLook); scene.canvas.removeEventListener('contextmenu',contextMenu);
      car.destroy();actorRenderer.destroy();interior.destroy();debris.destroy();streetObjects.destroy();sidewalks.destroy();district.destroy();population.destroy();renderCounters.destroy();publicBuildings.destroy(); clicks.destroy(); viewer.destroy();
    },
  };
}
