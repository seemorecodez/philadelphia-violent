import { Cartesian3, Matrix4, Model, ModelAnimationLoop } from 'cesium';

const validMatrix = matrix => matrix && Array.from({ length: 16 }, (_, index) => matrix[index]).every(Number.isFinite);

/** A single owned glTF actor, playing exactly one named locomotion clip. */
export function createCharacterRenderer(viewer, {
  modelUrl, getMatrix, getShow = () => true, getMoving = () => false,
  getSpeed = () => 1, strideLength = 0.9408476736610265, runStrideLength = null,
  onReady = () => {}, onError = () => {}, id,
  // Dependency injection keeps lifecycle/animation tests independent of WebGL.
  loadModel = options => Model.fromGltfAsync(options),
} = {}) {
  if (typeof modelUrl !== 'string' || !modelUrl) throw new TypeError('A character model URL is required.');
  if (typeof getMatrix !== 'function') throw new TypeError('A character model-matrix callback is required.');
  if(!Number.isFinite(strideLength) || strideLength<=0)throw new TypeError('A positive stride length is required.');
  const scene = viewer.scene;
  let model = null;
  let status = 'loading';
  let failure = null;
  let clip = null;
  let previousPosition = null;
  let gaitPhase = 0;
  let removeReady = null;
  let removeError = null;
  let removeUpdate = null;
  let resolveReady;
  let settled = false;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  function settle(value) {
    if (!settled) { settled = true; resolveReady(value); }
  }
  function detachModel() {
    removeReady?.(); removeReady = null;
    removeError?.(); removeError = null;
    if (!model) return;
    model.show = false;
    if (!scene.primitives.isDestroyed?.()) scene.primitives.remove(model);
    if (!model.isDestroyed?.()) model.destroy();
    model = null; clip = null;
  }
  function fail(error) {
    if (status === 'destroyed' || status === 'failed') return;
    failure = error instanceof Error ? error : new Error(String(error));
    status = 'failed';
    removeUpdate?.(); removeUpdate = null;
    detachModel(); settle(null);
    onError(failure);
  }
  function update() {
    if (!model || status === 'destroyed' || status === 'failed') return;
    if (model.isDestroyed?.()) { destroy(); return; }
    try {
      const matrix = getMatrix();
      const located = validMatrix(matrix);
      const position = located ? Matrix4.getTranslation(matrix,new Cartesian3()) : null;
      if (located) Matrix4.clone(matrix, model.modelMatrix);
      // Cesium processes the loader and raises readyEvent while show=false.
      // Hold visibility until both a usable position and the named clip exist.
      const visible = located && model.ready && Boolean(getShow());
      if (!visible) {
        previousPosition = null;
        model.show = false;
        if (model.ready && clip !== null) { model.activeAnimations.removeAll(); clip = null; }
        return;
      }
      const running=Number.isFinite(runStrideLength) && runStrideLength>0 && getSpeed()>2.3;
      const desired = getMoving() ? (running?'Run':'Walk') : 'Idle';
      if(desired!=='Idle' && previousPosition){
        // Drive gait from actual displacement, including collision stops and
        // slow frames. Repositioning is excluded; reverse travel reverses phase.
        const delta=Cartesian3.subtract(position,previousPosition,new Cartesian3());
        const distance=Cartesian3.magnitude(delta);
        // Terrain refinement can change height without a step. Measure travel
        // in the actor's local ground plane, retaining the 3D teleport guard.
        const up=new Cartesian3(matrix[8],matrix[9],matrix[10]);
        const upLength=Cartesian3.magnitude(up);
        if(distance<2 && upLength>0){
          Cartesian3.divideByScalar(up,upLength,up);
          const vertical=Cartesian3.dot(delta,up);
          const groundDistance=Math.sqrt(Math.max(0,distance*distance-vertical*vertical));
          gaitPhase += groundDistance/(running?runStrideLength:strideLength)*(getSpeed()<0?-1:1);
        }
      }
      previousPosition=position;
      if (desired !== clip) {
        model.activeAnimations.removeAll();
        model.activeAnimations.add({ name: desired, loop: ModelAnimationLoop.REPEAT,
          animationTime:desired!=='Idle'?()=>gaitPhase:undefined });
        clip = desired;
      }
      model.show = true;
    } catch (error) {
      // Missing named clips are a real asset/configuration error. Never play
      // every animation or silently substitute a different model or pose.
      fail(error);
    }
  }
  function markReady() {
    if (!model || status === 'destroyed' || status === 'failed') return;
    removeReady?.(); removeReady = null;
    status = 'ready';
    update();
    if (status !== 'ready') return;
    settle(model);
    onReady(model);
    scene.requestRender();
  }
  // Host movement runs in preUpdate. Synchronize immediately before Cesium
  // updates/draws primitives, so camera and actor use this frame's position.
  removeUpdate = scene.preRender.addEventListener(update);
  void Promise.resolve().then(() => loadModel({
    url: modelUrl, show: false, scale: 1, minimumPixelSize: 0,
    incrementallyLoadTextures: false, id,
  })).then(loaded => {
    if (status === 'destroyed' || status === 'failed' || scene.isDestroyed?.()) {
      if (!loaded.isDestroyed?.()) loaded.destroy();
      if (status !== 'destroyed' && status !== 'failed') destroy();
      return;
    }
    model = loaded;
    model.show = false;
    removeError = model.errorEvent.addEventListener(fail);
    removeReady = model.readyEvent.addEventListener(markReady);
    scene.primitives.add(model);
    update();
    if (model?.ready) markReady();
    scene.requestRender();
  }).catch(fail);

  function destroy() {
    if (status === 'destroyed') return;
    status = 'destroyed';
    removeUpdate?.(); removeUpdate = null;
    detachModel(); settle(null);
  }

  return { ready, update, destroy, get status() { return status; }, get error() { return failure; } };
}
