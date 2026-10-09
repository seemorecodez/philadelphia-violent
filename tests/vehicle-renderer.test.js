import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Event, Matrix4 } from 'cesium';
import { createVehicleRenderer } from '../src/vehicle-renderer.js';
import { createVehicleAnimator, wheelLocalMatrix } from '../src/vehicle-animation.js';
import { wheelRigs } from '../src/wheel-rigs.js';

const flush = () => new Promise(resolve => setImmediate(resolve));
function model() {
  return {
    ready: false, show: true, modelMatrix: new Matrix4(), readyEvent: new Event(), errorEvent: new Event(), destroyed: 0,
    isDestroyed() { return this.destroyed > 0; }, destroy() { this.destroyed++; },
    becomeReady() { this.ready = true; this.readyEvent.raiseEvent(this); },
  };
}
function fixture(t, { createAnimator } = {}) {
  const items = new Set(); const requests = [];
  const scene = { preUpdate: new Event(), preRender: new Event(), requestRender() {}, primitives: {
    add(item) { items.add(item); return item; },
    remove(item) { const removed = items.delete(item); if (removed) item.destroy(); return removed; },
  } };
  let x = 0;
  const renderer = createVehicleRenderer({ scene }, {
    getMatrix: () => Matrix4.fromTranslation(new Cartesian3(x, 0, 0)),
    createModel: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })),
    createAnimator,
  });
  t.after(() => renderer.destroy());
  return { renderer, scene, items, requests, setPosition(value) { x = value; }, move(value) { x = value; scene.preRender.raiseEvent(); } };
}

test('ready swap preserves old car until hidden replacement finishes and uses latest matrix', async t => {
  const h = fixture(t);
  assert.equal(h.requests.length, 0);
  h.renderer.show = true;
  const first = h.renderer.select('/mustang.glb'); const mustang = model();
  h.requests[0].resolve(mustang); await flush();
  assert.equal(mustang.show, false);
  mustang.becomeReady(); assert.equal(await first, true); assert.equal(mustang.show, true);
  const next = h.renderer.select('/huracan.glb'); const huracan = model();
  h.requests[1].resolve(huracan); await flush();
  assert.equal(mustang.show, true); assert.equal(huracan.show, false);
  h.move(7); assert.equal(huracan.modelMatrix[12], 7); assert.equal(mustang.modelMatrix[12], 7);
  huracan.becomeReady(); assert.equal(await next, true);
  assert.equal(mustang.destroyed, 1); assert.equal(huracan.show, true); assert.deepEqual([...h.items], [huracan]);
});

test('late old URI result is destroyed and cannot overwrite a newer selection', async t => {
  const h = fixture(t); h.renderer.show = true;
  const first = h.renderer.select('/mustang.glb');
  const second = h.renderer.select('/huracan.glb');
  assert.equal(await first, false);
  const huracan = model(); h.requests[1].resolve(huracan); await flush(); huracan.becomeReady();
  assert.equal(await second, true);
  const mustang = model(); h.requests[0].resolve(mustang); await flush();
  assert.equal(mustang.destroyed, 1); assert.deepEqual([...h.items], [huracan]); assert.equal(huracan.show, true);
});

test('load rejection and preparation error keep current model and clean listeners', async t => {
  const h = fixture(t); h.renderer.show = true;
  const first = h.renderer.select('/mustang.glb'); const mustang = model(); mustang.ready = true;
  h.requests[0].resolve(mustang); assert.equal(await first, true);
  const failure = h.renderer.select('/missing.glb');
  const rejected = assert.rejects(failure, /404/); h.requests[1].reject(new Error('404')); await rejected;
  assert.equal(mustang.show, true); assert.equal(mustang.destroyed, 0);
  const bad = h.renderer.select('/bad-texture.glb'); const pending = model();
  h.requests[2].resolve(pending); await flush();
  const errorHandled = assert.rejects(bad, /texture/); pending.errorEvent.raiseEvent(new Error('texture')); await errorHandled;
  assert.equal(pending.destroyed, 1); assert.equal(pending.readyEvent.numberOfListeners, 0);
  assert.equal(pending.errorEvent.numberOfListeners, 0); assert.deepEqual([...h.items], [mustang]);
});

test('destroy during primitive preparation and during asynchronous loading releases all results', async t => {
  const h = fixture(t);
  const first = h.renderer.select('/first.glb'); const firstModel = model();
  h.requests[0].resolve(firstModel); await flush();
  const second = h.renderer.select('/second.glb');
  assert.equal(await first, false); assert.equal(firstModel.destroyed, 1);
  h.renderer.destroy(); assert.equal(await second, false);
  assert.equal(h.scene.preRender.numberOfListeners, 0);
  const late = model(); h.requests[1].resolve(late); await flush();
  assert.equal(late.destroyed, 1); assert.equal(h.items.size, 0);
  assert.equal(await h.renderer.select('/third.glb'), false);
});

test('reselecting current car cancels its pending replacement and preserves visibility', async t => {
  const h = fixture(t);
  const first = h.renderer.select('/mustang.glb'); const mustang = model(); mustang.ready = true;
  h.requests[0].resolve(mustang); await first;
  assert.equal(mustang.show, false);
  const pending = h.renderer.select('/huracan.glb');
  assert.equal(h.renderer.select('/huracan.glb'), pending);
  assert.equal(await h.renderer.select('/mustang.glb'), true); assert.equal(await pending, false);
  h.renderer.show = true; assert.equal(mustang.show, true);
  const late = model(); h.requests[1].resolve(late); await flush(); assert.equal(late.destroyed, 1);
  assert.equal(h.requests.length, 2);
});

test('car and measured wheels use this frame of simulation; paused retained speed cannot spin wheels', async t => {
  let now=1000; t.mock.method(performance,'now',()=>now);
  let speed=0; let paused=false;
  const rig=wheelRigs['/models/mustang-2005.glb'];
  const nodes=new Map(rig.flatMap(wheel=>wheel.nodes.map(part=>[part.name,{matrix:null}])));
  const h=fixture(t,{createAnimator:loaded=>createVehicleAnimator(loaded,rig,()=>({speed:paused?0:speed,steer:0}))});
  h.renderer.show=true;
  const selected=h.renderer.select('/models/mustang-2005.glb');const car=model();car.ready=true;
  car.getNode=name=>nodes.get(name);
  h.requests[0].resolve(car);assert.equal(await selected,true);
  // Registered after the renderer, as in world.js. Both visual systems must
  // consume its results rather than whichever values existed last frame.
  h.scene.preUpdate.addEventListener(()=>{h.setPosition(9);speed=3;});
  now+=40;h.scene.preUpdate.raiseEvent();h.scene.preRender.raiseEvent();
  assert.equal(car.modelMatrix[12],9);
  for(const wheel of rig)for(const part of wheel.nodes){
    const expected=wheelLocalMatrix(part,wheel.center,3*.04/wheel.radius,0);
    assert.ok(Matrix4.equalsEpsilon(nodes.get(part.name).matrix,expected,1e-8));
  }
  const previous=new Map([...nodes].map(([name,node])=>[name,Matrix4.clone(node.matrix)]));
  paused=true;now+=40;h.scene.preUpdate.raiseEvent();h.scene.preRender.raiseEvent();
  assert.equal(speed,3); // World retains physical speed for resume.
  for(const [name,node] of nodes)assert.ok(Matrix4.equalsEpsilon(node.matrix,previous.get(name),1e-8));
  h.renderer.destroy();assert.equal(h.scene.preRender.numberOfListeners,0);
});
