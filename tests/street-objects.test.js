import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreetObjects, parseStreetFeature, intersectsStreetObject } from '../src/street-objects.js';

const origin = { longitude: -75.16469, latitude: 39.94746, height: 12, heading: 0 };
const east = metres => origin.longitude + metres / (111320 * Math.cos(origin.latitude * Math.PI / 180));
const north = metres => origin.latitude + metres / 111320;
const pole = (id = 1, x = 0, height = 45) => ({
  attributes: { objectid: id, type: 'SLA', height, nlumin: 1 },
  geometry: { x: east(x), y: origin.latitude },
});
const sidewalk = (id = 2, width = 6) => ({
  attributes: { objectid: id, line_type: 1, material: 'CONCRETE', width },
  geometry: { paths: [[[east(15), north(-8)], [east(15), north(8)]]] },
});
const tree = (id = 3, x = 30) => ({ attributes: { objectid: id, tree_name: 'GINKGO BILOBA', tree_dbh: 36, year: '2025' },
  geometry: { x: east(x), y: origin.latitude } });
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

function harness(t, data = {}, options = {}) {
  const originalFetch = globalThis.fetch;
  const calls = []; const displays = []; let pending = 0; let maxPending = 0;
  globalThis.fetch = async (url, settings) => {
    calls.push({ url, settings }); pending++; maxPending = Math.max(maxPending, pending);
    await new Promise(resolve => setImmediate(resolve)); pending--;
    const kind = url.includes('Street_Poles') ? 'pole' : url.includes('pedestriannetwork') ? 'sidewalk' : 'tree';
    return { ok: true, json: async () => ({ features: data[kind] ?? [], spatialReference: { wkid: 4326 } }) };
  };
  const viewer = { scene: { globe: { getHeight: () => 12 }, requestRender() {} } };
  const app = createStreetObjects(viewer, { treeModelHeight: 4.6,
    renderObject: async object => {
      const display = { object, ready: true, visible: true, disposed: 0, angles: [],
        show(value) { this.visible = value; }, tip(angle) { this.angles.push(angle); }, dispose() { this.disposed++; this.ready = false; } };
      displays.push(display); return display;
    }, ...options });
  t.after(() => { app.destroy(); globalThis.fetch = originalFetch; });
  return { app, viewer, calls, displays, get maxPending() { return maxPending; } };
}

test('source parsing preserves measured values and marks unknown dimensions', () => {
  const measured = parseStreetFeature('sidewalk', sidewalk());
  assert.equal(measured.dimension.width, 6 * 0.3048);
  assert.equal(measured.widthBasis, 'source-width-feet');
  assert.equal(parseStreetFeature('sidewalk', sidewalk(2, null)).dimension.width, null);
  const knownClass = parseStreetFeature('pole', { ...pole(), attributes: { objectid: 1, type: 'C13', height: 45 } });
  assert.equal(knownClass.height, 13 * 0.3048);
  assert.equal(knownClass.heightBasis, 'source-class');
  assert.equal(parseStreetFeature('pole', pole(2, 0, null)).height, null);
  const inventoried = parseStreetFeature('tree', tree());
  assert.equal(inventoried.height, null);
  assert.equal(inventoried.sourceDiameter, 36);
  assert.equal(inventoried.sourceDiameterUnit, 'unverified');
  assert.equal(parseStreetFeature('sidewalk', { ...sidewalk(), geometry: { paths: [[null, [0, 0]]] } }), null);
  const projected = parseStreetFeature('pole', { ...pole(), geometry: { x: -8377994.7342831343, y: 4848027.4916224079 } }, { wkid: 3857 });
  assert.ok(projected.longitude > -75.3 && projected.longitude < -75);
  assert.ok(projected.latitude > 39.8 && projected.latitude < 40.2);
});

test('swept car body catches thin poles between endpoints; sidewalks stay traversable', () => {
  const object = { ...parseStreetFeature('pole', pole()), baseHeight: 12 };
  const from = { ...origin, longitude: east(-6), heading: Math.PI / 2 };
  const to = { ...from, longitude: east(6) };
  assert.equal(intersectsStreetObject(object, from, from), false);
  assert.equal(intersectsStreetObject(object, to, to), false);
  assert.equal(intersectsStreetObject(object, from, to), true);
  assert.equal(intersectsStreetObject(object, { ...from, latitude: north(4) }, { ...to, latitude: north(4) }), false);
  assert.equal(intersectsStreetObject(object, { ...from, height: 30 }, { ...to, height: 30 }), false);
  assert.equal(intersectsStreetObject({ ...parseStreetFeature('sidewalk', sidewalk()), baseHeight: 12 }, from, to), false);
  assert.equal(intersectsStreetObject(object, { ...origin, longitude: east(0.4) }, { ...origin, longitude: east(0.4) }, { radius: 0.35, height: 1.8 }), true);
});

test('nearby loading stays sequential and destruction removes only its collision', async t => {
  const h = harness(t, { pole: [pole()], sidewalk: [sidewalk()], tree: [tree()] });
  h.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.calls.length, 3); assert.equal(h.maxPending, 1);
  for (const call of h.calls) {
    const url = new URL(call.url);
    assert.equal(url.searchParams.get('resultRecordCount'), '160');
    assert.equal(call.settings.credentials, 'omit');
    assert.equal(url.searchParams.has('token'), false);
  }
  assert.equal(h.app.getStats().rendered, 3);
  const collision = h.app.getCollision(origin, origin);
  assert.equal(collision.object.id, 'pole:1');
  assert.equal(h.app.tryDestroy(collision.object.id).destroyed, true);
  assert.equal(h.app.getCollision(origin, origin).collides, false);
  assert.equal(h.app.tryDestroy('pole:1').reason, 'already-destroyed');
  h.app.tick(0.1); assert.ok(h.displays[0].angles[0] > 0);
  const damage = h.app.damageNearest({ ...origin, longitude: east(15) });
  assert.equal(damage.object.kind, 'sidewalk');
  assert.equal(h.displays.find(display => display.object.kind === 'sidewalk').disposed, 1);
  h.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.calls.length, 3);
});

test('missing dimensions cannot starve later valid objects or create invisible colliders', async t => {
  const unknown = Array.from({ length: 10 }, (_, index) => pole(index, index / 10, null));
  const h = harness(t, { pole: [...unknown, pole(99, 2)], sidewalk: [sidewalk(2, null)] });
  h.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.app.getStats().rendered, 1);
  assert.equal(h.displays[0].object.id, 'pole:99');
  assert.equal(h.app.tryDestroy('pole:0').reason, 'not-rendered');
  assert.equal(h.app.tryDestroy('sidewalk:2').reason, 'not-rendered');
});

test('hiding retains damage and data', async t => {
  const h = harness(t, { pole: [pole()] });
  h.app.update(origin.longitude, origin.latitude); await flush();
  h.app.setVisible(false);
  assert.equal(h.displays[0].visible, false);
  assert.equal(h.app.getCollision(origin, origin).collides, false);
  h.app.update(east(150), origin.latitude); await flush();
  assert.equal(h.calls.length, 3);
  h.app.setVisible(true);
  assert.equal(h.app.getCollision(origin, origin).collides, true);
  h.app.tryDestroy('pole:1'); h.app.setVisible(false); h.app.setVisible(true);
  assert.equal(h.app.getCollision(origin, origin).collides, false);
  assert.equal(h.app.getStats().destroyed, 1);
  h.app.clear(); assert.equal(h.app.getStats().count, 0);
});

test('late render completion is disposed after clear', async t => {
  let finish; let disposed = 0;
  const delayed = harness(t, { pole: [pole()] }, { renderObject: () => new Promise(resolve => { finish = resolve; }) });
  delayed.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(typeof finish, 'function');
  delayed.app.clear();
  finish({ ready: true, dispose() { disposed++; } }); await flush();
  assert.equal(disposed, 1); assert.equal(delayed.app.getStats().count, 0);
  assert.equal(delayed.app.getCollision(origin, origin).collides, false);
});

test('detailed trees display nearest first and dropping out of the cap removes collision', async t => {
  const h = harness(t, { tree: [tree(1, 0), tree(2, 20), tree(3, 40), tree(4, 90)] }, { maxVisibleTrees: 2 });
  h.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.app.getStats().renderedTrees, 2);
  assert.equal(h.app.getCollision(origin, origin, { radius: 0.35 }).collides, true);
  h.app.update(east(45), origin.latitude); h.app.tick(0.1); await flush();
  assert.equal(h.app.getStats().renderedTrees, 2);
  assert.equal(h.app.getCollision(origin, origin, { radius: 0.35 }).collides, false);
  assert.equal(h.displays.find(display => display.object.id === 'tree:1').disposed, 1);
  assert.equal(h.app.getCollision({ ...origin, longitude: east(40) }, { ...origin, longitude: east(40) }, { radius: 0.35 }).object.id, 'tree:3');
  h.app.tryDestroy('tree:3');
  for (let i = 0; i < 45; i++) h.app.tick(0.1);
  await flush();
  assert.ok(h.app.getStats().renderedTrees <= 2);
  assert.equal(h.app.getCollision({ ...origin, longitude: east(40) }, { ...origin, longitude: east(40) }, { radius: 0.35 }).collides, false);
});

test('clear aborts an outstanding query and ignores its late response', async t => {
  const h = harness(t); let resolve; let signal;
  globalThis.fetch = (url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  h.app.update(origin.longitude, origin.latitude);
  h.app.clear(); assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => ({ features: [pole()] }) }); await flush();
  assert.equal(h.app.getStats().count, 0); assert.equal(h.displays.length, 0);
});

test('population and display radius stay bounded under dense source responses', async t => {
  const manyPoles = Array.from({ length: 160 }, (_, i) => pole(i, 20 + i / 10));
  const manyTrees = Array.from({ length: 160 }, (_, i) => tree(i, 40 + i / 10));
  const manyWalks = Array.from({ length: 160 }, (_, i) => sidewalk(i));
  const h = harness(t, { pole: manyPoles, tree: manyTrees, sidewalk: manyWalks });
  h.app.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.app.getStats().count, 300); assert.equal(h.app.getStats().limited, true);
  assert.ok(h.app.getStats().rendered <= 8);
  for (const display of h.displays) assert.ok(Math.abs(display.object.longitude - origin.longitude) < 0.003);
});
