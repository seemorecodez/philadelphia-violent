import {
  Viewer, Cartesian2, Cartesian3, Color, DirectionalLight, HeadingPitchRange,
  HeadingPitchRoll, ImageBasedLighting, Math as CesiumMath, Model, Transforms, ModelAnimationLoop,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createVehicleAnimator } from '../src/vehicle-animation.js';
import { wheelRigs } from '../src/wheel-rigs.js';

// Vite serves /cesium/ from the installed Cesium build. This diagnostic entry
// is outside public/ and is not an input to the production build.
const status = document.querySelector('#status');
const selection = new URLSearchParams(location.search).get('model') || 'mustang';
const isHuman=['human','motion'].includes(selection);
const modelUrl = { mustang: '/models/mustang-2005.glb', huracan: '/models/huracan-performante.glb', human: '/models/character/human-adult.glb', motion:'/models/character/human-motion.glb', character: '/models/character/walker.glb', original: '/models/car.glb' }[selection] || '/models/mustang-2005.glb';
function report(message, state = 'loading') {
  status.textContent = message;
  status.dataset.state = state;
}

try {
  const viewer = new Viewer('vehicle-view', {
    globe: false, baseLayer: false, geocoder: false, baseLayerPicker: false,
    animation: false, timeline: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, fullscreenButton: false, infoBox: false,
    selectionIndicator: false, skyBox: false, skyAtmosphere: false,
    scene3DOnly: true, shadows: false, requestRenderMode: false, shouldAnimate: true,
  });
  const scene = viewer.scene;
  scene.backgroundColor = Color.fromCssColorString('#18212b');
  if (scene.sun) scene.sun.show = false;
  if (scene.moon) scene.moon.show = false;
  scene.fog.enabled = false;
  scene.postProcessStages.fxaa.enabled = true;
  viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 1.5);
  viewer.targetFrameRate = 60;

  const origin = Cartesian3.fromDegrees(-75.1647, 39.9476, 0);
  const focus = Cartesian3.fromDegrees(-75.1647, 39.9476, isHuman?0.95:0.7);
  const modelMatrix = Transforms.headingPitchRollToFixedFrame(
    origin, new HeadingPitchRoll(-Math.PI / 2, 0, 0),
  );

  // A directional light follows the inspection camera. Constant diffuse
  // lighting fills dark surfaces without any environment image downloads.
  const light = new DirectionalLight({ direction: new Cartesian3(1, 0, 0), intensity: 2.0 });
  scene.light = light;
  scene.preRender.addEventListener(() => {
    Cartesian3.clone(viewer.camera.directionWC, light.direction);
  });
  const coefficients = Array.from({ length: 9 }, () => new Cartesian3(0, 0, 0));
  coefficients[0] = new Cartesian3(0.45, 0.45, 0.45);

  const views = {
    'three-quarter': [215, -22, 9.5],
    front: [180, -7, 8],
    rear: [0, -7, 8],
    side: [90, -8, 8],
  };
  function setView(name) {
    const [heading, pitch, viewRange] = views[name];
    const range=isHuman?viewRange*0.46:viewRange;
    // Keep the lookAt frame active so mouse gestures orbit the car.
    // https://cesium.com/learn/cesiumjs/ref-doc/Camera.html#lookAt
    viewer.camera.lookAt(focus, new HeadingPitchRange(
      CesiumMath.toRadians(heading), CesiumMath.toRadians(pitch), range,
    ));
  }
  const controller = scene.screenSpaceCameraController;
  controller.enableCollisionDetection = false;
  controller.enableTranslate = false;
  controller.minimumZoomDistance = 2;
  controller.maximumZoomDistance = 40;
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  setView('three-quarter');

  scene.renderError.addEventListener((_scene, error) => {
    report(`Renderer error: ${error.message || String(error)}`, 'error');
  });
  report(`Loading ${modelUrl} and creating WebGL resources…`);
  const model = await Model.fromGltfAsync({
    url: modelUrl, modelMatrix, scale: 1, minimumPixelSize: 0,
    // readyEvent then includes textures, rather than an early geometry-only
    // signal. See installed Model.js readyEvent docs and the official API:
    // https://cesium.com/learn/cesiumjs/ref-doc/Model.html#readyEvent
    incrementallyLoadTextures: false,
    imageBasedLighting: new ImageBasedLighting({
      imageBasedLightingFactor: new Cartesian2(1, 0),
      sphericalHarmonicCoefficients: coefficients,
    }),
    environmentMapOptions: { enabled: false },
  });
  model.errorEvent.addEventListener(error => {
    report(`Model error: ${error.message || String(error)}`, 'error');
  });
  model.readyEvent.addEventListener(() => {
    report('Model ready — geometry and textures are ready for rendering.', 'ready');
    if(wheelRigs[modelUrl]){
      const state={speed:0,steer:0};
      const animator=createVehicleAnimator(model,wheelRigs[modelUrl],()=>state);
      let previous=performance.now();
      scene.preUpdate.addEventListener(()=>{const now=performance.now();animator.tick((now-previous)/1000);previous=now;});
      for(const [label,update] of [
        ['Roll wheels',()=>{state.speed=state.speed?0:1;}],
        ['Steer right',()=>{state.steer=1;}],['Steer left',()=>{state.steer=-1;}],['Straighten',()=>{state.steer=0;}],
      ]){
        const button=document.createElement('button');button.textContent=label;
        button.addEventListener('click',update);document.querySelector('.controls').append(button);
      }
    }
    if(isHuman){
      for(const name of (selection==='motion'?['Idle','Walk','Run']:['Idle','Walk'])){
        const button=document.createElement('button');button.textContent=name;
        button.addEventListener('click',()=>{model.activeAnimations.removeAll();model.activeAnimations.add({name,loop:ModelAnimationLoop.REPEAT});});
        document.querySelector('.controls').append(button);
      }
      model.activeAnimations.add({name:'Idle',loop:ModelAnimationLoop.REPEAT});
    }
  });
  scene.primitives.add(model);
  if (model.ready) report('Model ready — geometry and textures are ready for rendering.', 'ready');
} catch (error) {
  report(`Vehicle check failed: ${error.message || String(error)}`, 'error');
  console.error(error);
}
