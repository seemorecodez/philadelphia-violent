import { Matrix4, Model } from 'cesium';

/**
 * Own vehicle Model primitives directly. Cesium 1.145 ModelVisualizer can attach
 * a late URI load to a newer load of the same entity ID. This owner uses request
 * identity and destroys stale results instead of mutating an Entity model URI.
 *
 * Hidden Model.update still processes resources and raises readyEvent before
 * show gates draw-command submission (Cesium Model.js:1996,2111,2791). Keeping
 * preparation in the primitive collection therefore does not show an unready car.
 *
 * select(): true after ready swap, false after supersession/destruction; actual
 * preparation failures reject and retain the current vehicle. createModel is an
 * optional adapter for focused lifecycle tests. No initial load occurs here.
 */
export function createVehicleRenderer(viewer, {
  getMatrix, createModel = options => Model.fromGltfAsync(options), createAnimator = () => null,
} = {}) {
  if (typeof getMatrix !== 'function') throw new TypeError('getMatrix must be a function');
  const scene = viewer.scene;
  const primitives = scene.primitives;
  let generation = 0;
  let destroyed = false;
  let visible = false;
  let current = null;
  let pending = null;
  let previousUpdate = performance.now();

  const requestRender = () => { if (!destroyed && !scene.isDestroyed?.()) scene.requestRender(); };
  const live = job => !destroyed && pending === job && job.generation === generation && !job.settled;
  const isModelDestroyed = model => model.isDestroyed?.() === true;

  function updateMatrix(model, matrix = getMatrix()) {
    model.modelMatrix = Matrix4.clone(matrix, model.modelMatrix);
  }

  function removeListeners(job) {
    job?.removeReady?.(); job?.removeError?.();
    if (job) { job.removeReady = null; job.removeError = null; }
  }

  function dispose(job) {
    if (!job) return;
    removeListeners(job);
    const model = job.model;
    job.model = null;
    if (!model || isModelDestroyed(model)) return;
    model.show = false;
    if (job.added && !primitives.isDestroyed?.()) primitives.remove(model);
    // PrimitiveCollection usually owns destruction. Also cover collections
    // configured not to destroy children, or a result never added to the scene.
    if (!isModelDestroyed(model)) model.destroy();
  }

  function finish(job, value, error = null) {
    if (job.settled) return;
    job.settled = true;
    if (error) job.reject(error); else job.resolve(value);
  }

  function cancelPending() {
    const obsolete = pending;
    pending = null;
    if (!obsolete) return;
    dispose(obsolete);
    finish(obsolete, false);
  }

  function fail(job, error) {
    if (!live(job)) return;
    pending = null;
    dispose(job);
    finish(job, false, error instanceof Error ? error : new Error(String(error)));
    requestRender();
  }

  function swapReady(job) {
    if (!live(job) || !job.model?.ready) return;
    try {
      updateMatrix(job.model);
      job.animator = createAnimator(job.model, job.url);
      job.model.show = visible;
    } catch (error) { fail(job, error); return; }
    const previous = current;
    current = job;
    pending = null;
    removeListeners(job);
    dispose(previous);
    finish(job, true);
    requestRender();
  }

  async function prepare(job) {
    let model;
    try {
      model = await createModel({
        url: job.url, scene, modelMatrix: Matrix4.clone(getMatrix()),
        show: false, scale: 1, minimumPixelSize: 0,
        allowPicking: false, incrementallyLoadTextures: false,
      });
      if (!live(job)) {
        if (model && !isModelDestroyed(model)) model.destroy();
        return;
      }
      if (!model) throw new Error('Vehicle loader returned no model');
      job.model = model;
      model.show = false;
      updateMatrix(model);
      job.removeReady = model.readyEvent.addEventListener(() => swapReady(job));
      job.removeError = model.errorEvent.addEventListener(error => fail(job, error));
      primitives.add(model);
      job.added = true;
      if (model.ready) swapReady(job);
      requestRender();
    } catch (error) {
      // A cancelled request has already resolved false; its eventual rejection
      // is consumed here and cannot affect a newer request or the current car.
      if (live(job)) fail(job, error);
      else if (model && !isModelDestroyed(model)) model.destroy();
    }
  }

  // Host simulation runs in preUpdate. Apply the resulting body transform and
  // wheel state just before Cesium updates/draws this frame's primitives.
  const removePreRender = scene.preRender.addEventListener(() => {
    if (destroyed) return;
    const now = performance.now();
    const dt = Math.max(0, Math.min((now - previousUpdate) / 1000, 0.05));
    previousUpdate = now;
    const matrix = getMatrix();
    if (current?.model && !isModelDestroyed(current.model)) updateMatrix(current.model, matrix);
    if (visible) current?.animator?.tick(dt);
    if (pending?.model && !isModelDestroyed(pending.model)) updateMatrix(pending.model, matrix);
  });

  function select(url) {
    if (destroyed) return Promise.resolve(false);
    if (typeof url !== 'string' || !url.trim()) return Promise.reject(new TypeError('Vehicle URL must be a non-empty string'));
    if (pending?.url === url) return pending.promise;
    generation++;
    cancelPending();
    if (current?.url === url) return Promise.resolve(true);
    const job = { url, generation, model: null, added: false, settled: false, removeReady: null, removeError: null };
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject; });
    pending = job;
    void prepare(job);
    return job.promise;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    generation++;
    removePreRender();
    cancelPending();
    dispose(current); current = null;
  }

  return {
    select, destroy,
    get show() { return visible; },
    set show(value) {
      if (destroyed) return;
      visible = Boolean(value);
      if (current?.model) current.model.show = visible;
      // Pending must stay hidden even when the requested visibility is true.
      requestRender();
    },
  };
}
