import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartographic, Event } from 'cesium';
import {
  buildSidewalkGeometry, createSidewalkSurfaces, distanceToSidewalkSection,
  parseSidewalkSurface, sectionSidewalkSurface, sidewalkQueryUrl,
} from '../src/sidewalk-surfaces.js';
import { sidewalkPhotoAtlasSpec, sidewalkPhotoUv } from '../src/sidewalk-photo-atlas.js';

const origin = { longitude: -75.16469, latitude: 39.94746, height: 12 };
const point = (x, y) => [origin.longitude + x / (111320 * Math.cos(40 * Math.PI / 180)), origin.latitude + y / 111320];
const state = (x, y) => ({ ...origin, longitude: point(x, y)[0], latitude: point(x, y)[1] });
const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(p => point(...p));
const feature = (rings = [square(-20, -20, 20, 20)], id = 1) => ({
  attributes: { OBJECTID: 123, OBJECTID_1: id, FCODE: 2210 }, geometry: { rings },
});
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

test('mapped rings retain holes, multipart exteriors and nested islands regardless of winding', () => {
  const parsed = parseSidewalkSurface(feature([
    square(-20, -20, 20, 20), square(-10, -10, 10, 10), square(-2, -2, 2, 2), square(30, 30, 40, 40),
  ]));
  assert.equal(parsed.sourceId, '1'); assert.equal(parsed.sourceRingCount, 4);
  assert.equal(parsed.polygons.length, 3); assert.equal(parsed.polygons[0].holes.length, 1);
  const sections = sectionSidewalkSurface(parsed, origin, 80);
  assert.ok(Math.abs(sections.reduce((sum, section) => sum + section.area, 0) - 1316) < 0.001);
  assert.ok(Math.min(...sections.map(section => distanceToSidewalkSection(section, state(5, 5)))) > 4);
  assert.equal(Math.min(...sections.map(section => distanceToSidewalkSection(section, state(0, 0)))), 0);
  assert.equal(parseSidewalkSurface(feature([[point(0, 0), null, point(2, 2)]])), null);
  assert.equal(parseSidewalkSurface({ ...feature(), attributes: { OBJECTID_1: 1, FCODE: 1000 } }), null);
});

test('triangulation and damage sections preserve the footprint area and stable identifiers', () => {
  const parsed = parseSidewalkSurface(feature([square(-20, -20, 20, 20), square(-10, -10, 10, 10)]));
  const sections = sectionSidewalkSurface(parsed, origin, 80);
  assert.ok(Math.abs(sections.reduce((sum, section) => sum + section.area, 0) - 1200) < 0.001);
  assert.ok(sections.every(section => section.area <= 36.00001));
  for (const section of sections) {
    const all = section.pieces.flat();
    assert.ok(Math.max(...all.map(p => p[0])) - Math.min(...all.map(p => p[0])) <= 6.000001);
    assert.ok(Math.max(...all.map(p => p[1])) - Math.min(...all.map(p => p[1])) <= 6.000001);
  }
  assert.deepEqual(new Set(sections.map(s => s.id)), new Set(sectionSidewalkSurface(parsed, state(3, 3), 80).map(s => s.id)));
  assert.ok(Math.min(...sections.map(section => distanceToSidewalkSection(section, origin))) > 9.99);
});

test('surface geometry follows loaded vertex terrain and refuses missing elevations', () => {
  const section = sectionSidewalkSurface(parseSidewalkSurface(feature()), origin)[0];
  let samples = 0;
  const built = buildSidewalkGeometry(section, (lon, lat) => { samples++; return 12 + (lat - origin.latitude) * 1113.2; });
  assert.ok(samples > 1); assert.ok(built.geometry.indices.length > 0);
  assert.ok([...built.geometry.attributes.position.values].every(Number.isFinite));
  assert.ok([...built.geometry.attributes.normal.values].every(Number.isFinite));
  assert.equal(buildSidewalkGeometry(section, () => undefined), null);
  assert.equal(section.depthEstimated, true); assert.equal(section.dimension.depth, 0.08);
});

function harness(t, options = {}) {
  const originalFetch = globalThis.fetch; const calls = []; const displays = [];
  globalThis.fetch = async (url, settings) => {
    calls.push({ url, settings }); await new Promise(resolve => setImmediate(resolve));
    return { ok: true, json: async () => ({ features: [feature()] }) };
  };
  const viewer = { scene: { requestRender() {}, globe: { getHeight: () => 12 } } };
  const layer = createSidewalkSurfaces(viewer, { renderSection: async object => {
    object.baseHeight = 12;
    const display = { object, ready: true, visible: true, disposed: 0,
      show(value) { this.visible = value; }, dispose() { this.disposed++; this.ready = false; } };
    displays.push(display); return display;
  }, ...options });
  t.after(() => { layer.destroy(); globalThis.fetch = originalFetch; });
  return { layer, calls, displays };
}

test('source requests are bounded and contain neither a key nor invented width', () => {
  const url = new URL(sidewalkQueryUrl(origin));
  assert.equal(url.searchParams.get('where'), 'FCODE=2210');
  assert.equal(url.searchParams.get('resultRecordCount'), '80');
  assert.equal(url.searchParams.get('outSR'), '4326');
  assert.equal(url.searchParams.has('token'), false);
  assert.equal(url.searchParams.has('width'), false);
});

test('nearby sections load with a cap; only ready visible sections can be destroyed', async t => {
  const h = harness(t); h.layer.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].settings.credentials, 'omit');
  assert.ok(h.layer.getStats().count <= 96); assert.ok(h.layer.getStats().rendered <= 4);
  const target = h.displays[0].object;
  assert.equal(h.layer.getCollision(origin, origin).collides, false);
  h.layer.setVisible(false);
  assert.equal(h.layer.getStats().rendered, 0); assert.equal(h.layer.tryDestroy(target.id).destroyed, false);
  h.layer.update(...point(200, 0)); await flush(); assert.equal(h.calls.length, 1);
  h.layer.setVisible(true);
  assert.equal(h.layer.tryDestroy(target.id).destroyed, true);
  assert.equal(h.displays[0].disposed, 1); assert.equal(h.layer.getStats().destroyed, 1);
  assert.equal(h.layer.tryDestroy(target.id).destroyed, false);
  assert.ok(h.layer.getStats().rendered > 0);
});

test('manual damage respects holes and height and removes one small section', async t => {
  const h = harness(t);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    features: [feature([square(-20, -20, 20, 20), square(-10, -10, 10, 10)])],
  }) });
  h.layer.update(origin.longitude, origin.latitude); await flush();
  assert.equal(h.layer.damageNearest(origin, 4).destroyed, false);
  assert.equal(h.layer.damageNearest({ ...h.displays[0].object, height: 100 }, 4).destroyed, false);
  const target = h.displays[0].object;
  const before = h.layer.getStats().rendered;
  assert.equal(h.layer.damageNearest({ ...target, height: 12 }, 4).destroyed, true);
  assert.equal(h.layer.getStats().rendered, before - 1);
});

test('clearing or hiding disposes late rendering and never resurrects a slab', async t => {
  const resolvers = []; let disposed = 0;
  const h = harness(t, { renderSection: () => new Promise(resolve => resolvers.push(resolve)) });
  h.layer.update(origin.longitude, origin.latitude); await flush();
  assert.ok(resolvers.length > 0);
  h.layer.clear();
  for (const resolve of resolvers) resolve({ ready: true, dispose() { disposed++; } });
  await flush(); assert.equal(disposed, resolvers.length); assert.equal(h.layer.getStats().count, 0);
});

test('clear aborts pending public data and ignores late network results', async t => {
  const h = harness(t); let resolve; let signal;
  globalThis.fetch = (url, options) => { signal = options.signal; return new Promise(done => { resolve = done; }); };
  h.layer.update(origin.longitude, origin.latitude); h.layer.clear();
  assert.equal(signal.aborted, true);
  resolve({ ok: true, json: async () => ({ features: [feature()] }) }); await flush();
  assert.equal(h.layer.getStats().count, 0); assert.equal(h.displays.length, 0);
});

test('hiding during atlas preparation does not impose a failure cooldown after returning outside', async t => {
  const pending = []; let cancelled = false; let attempts = 0;
  const render = object => {
    attempts++;
    if (!cancelled) return new Promise((resolve, reject) => pending.push(reject));
    object.baseHeight = 12;
    return Promise.resolve({ ready: true, show() {}, dispose() {} });
  };
  render.setVisible = value => {
    if (!value) { cancelled = true; pending.forEach(reject => reject(new DOMException('Cancelled', 'AbortError'))); }
  };
  const h = harness(t, { renderSection: render });
  h.layer.update(origin.longitude, origin.latitude); await flush();
  const before = attempts; assert.ok(before > 0);
  h.layer.setVisible(false); await flush();
  h.layer.setVisible(true); await flush();
  assert.ok(attempts > before, 'returning outside must retry cancelled preparations immediately');
  assert.ok(h.layer.getStats().rendered > 0);
});

test('terrain changes rebuild vertex slope, swap only when ready and never resurrect damage', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ features: [feature([square(-2, -2, 2, 2)])] }) });
  const primitives = new Set(); const removed = new Set(); const preUpdate = new Event();
  let offset = 0; let slope = 0; let reads = 0;
  const viewer = { scene: { preUpdate, requestRender() {}, globe: { getHeight(position) {
    reads++; return 12 + offset + (position.latitude - origin.latitude * Math.PI / 180) * 6378137 * slope;
  } }, primitives: {
    add(primitive) { primitives.add(primitive); return primitive; },
    remove(primitive) { removed.add(primitive); primitives.delete(primitive); return true; },
  } } };
  // The CPU lifecycle test injects an already prepared photograph resource;
  // shared atlas loading and geographic UV correctness have their own tests.
  const photoPool = { async acquire(points) {
    const spec = sidewalkPhotoAtlasSpec(points);
    return { resource: {}, uv: (lon, lat) => sidewalkPhotoUv(spec, lon, lat), release() {} };
  }, cancelPending() {}, clear() {}, destroy() {}, getStats: () => ({}) };
  const layer = createSidewalkSurfaces(viewer, { photoPool });
  t.after(() => { layer.destroy(); globalThis.fetch = originalFetch; });
  layer.update(origin.longitude, origin.latitude); await flush();
  for (let frame = 0; frame < 30; frame++) { layer.tick(.1); await flush(); }
  assert.ok(primitives.size > 0);
  for (const primitive of primitives) primitive._ready = true;
  const initial = [...primitives];
  offset = 2; slope = .1;
  for (let frame = 0; frame < 6; frame++) { layer.tick(.1); await flush(); }
  const replacements = [...primitives].filter(primitive => !initial.includes(primitive));
  assert.equal(replacements.length, initial.length);
  assert.ok(initial.every(primitive => primitive.show));
  assert.ok(replacements.every(primitive => !primitive.show));
  assert.ok(preUpdate.numberOfListeners > 0);
  for (const primitive of replacements) primitive._ready = true;
  preUpdate.raiseEvent();
  assert.ok(initial.every(primitive => removed.has(primitive)));
  assert.ok(replacements.every(primitive => primitive.show));
  assert.equal(preUpdate.numberOfListeners, 0);
  // Changing slope must alter the geometry, not only translate the old slab.
  for (let i = 0; i < initial.length; i++) {
    const before = initial[i].geometryInstances.geometry.attributes.position.values;
    const after = replacements[i].geometryInstances.geometry.attributes.position.values;
    assert.ok([...before].some((value, index) => Math.abs(value - after[index]) > .01));
  }
  const reference = [...primitives][0].modelMatrix;
  const anchor = Cartographic.fromCartesian({ x: reference[12], y: reference[13], z: reference[14] });
  assert.ok(anchor.height > 13);
  reads = 0;
  for (let frame = 0; frame < 6; frame++) { layer.tick(.1); await flush(); }
  assert.ok(reads <= 128, `unbounded steady-state probes: ${reads}`);
  const beforeDamage = primitives.size;
  const result = layer.damageNearest({ ...origin, height: 14 }, 4);
  assert.equal(result.destroyed, true); assert.equal(primitives.size, beforeDamage - 1);
  offset = 4;
  for (let frame = 0; frame < 12; frame++) { layer.tick(.1); await flush(); }
  assert.equal(layer.getStats().destroyed, 1);
  assert.equal(layer.tryDestroy(result.object.id).destroyed, false);
  layer.setVisible(false);
  assert.ok([...primitives].every(primitive => !primitive.show));
  assert.equal(primitives.size, beforeDamage - 1, 'hiding must dispose pending replacements');
  assert.equal(preUpdate.numberOfListeners, 0);
  layer.clear(); assert.equal(primitives.size, 0);
  preUpdate.raiseEvent(); assert.equal(primitives.size, 0);
});
