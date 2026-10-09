import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Cartographic, Material, Matrix4 } from 'cesium';
import {
  SIDEWALK_PHOTO_LEVEL, createSidewalkPhotoAtlasPool, geographicPhotoTile, sidewalkPhotoAtlasSpec,
  sidewalkPhotoTileUrl, sidewalkPhotoUv,
} from '../src/sidewalk-photo-atlas.js';
import {
  buildSidewalkGeometry, createSidewalkPhotoMaterial, parseSidewalkSurface, sectionSidewalkSurface,
} from '../src/sidewalk-surfaces.js';

const origin = [-75.16469, 39.94746];
const point = (x, y) => [origin[0] + x / (111320 * Math.cos(40 * Math.PI / 180)), origin[1] + y / 111320];
const points = [point(-2, -2), point(2, -2), point(2, 2), point(-2, 2)];
const flush = () => new Promise(resolve => setImmediate(resolve));
const geoFromTile = (x, y, level = SIDEWALK_PHOTO_LEVEL) => [x / 2 ** level * 360 - 180,
  Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** level))) * 180 / Math.PI];

function harness(options = {}) {
  const requests = []; const canvases = []; const resources = []; const disposed = [];
  let active = 0; let peak = 0; let decoded = 0; let closed = 0;
  const pool = createSidewalkPhotoAtlasPool({
    async fetchTile(url, settings) {
      requests.push({ url, settings }); active++; peak = Math.max(peak, active);
      await flush(); active--;
      return { ok: true, blob: async () => new Blob([url], { type: 'image/jpeg' }) };
    },
    async decode(blob) { decoded++; return { width: 256, height: 256, url: await blob.text(), close() { closed++; } }; },
    createCanvas(width, height) {
      const canvas = { width, height, draws: [], getContext() { return {
        drawImage(image, x, y) { canvas.draws.push({ url: image.url, x, y }); },
      }; } };
      canvases.push(canvas); return canvas;
    },
    createResource(canvas) { const resource = { canvas }; resources.push(resource); return resource; },
    destroyResource(resource) { disposed.push(resource); },
    ...options,
  });
  return { pool, requests, canvases, resources, disposed,
    get peak() { return peak; }, get decoded() { return decoded; }, get closed() { return closed; } };
}

test('source UVs follow Web Mercator geography with north up and exact tile edges', () => {
  assert.deepEqual(geographicPhotoTile(0, 0), [1048576, 1048576]);
  const spec = sidewalkPhotoAtlasSpec(points);
  assert.equal(spec.width, 1536); assert.equal(spec.tiles, 6);
  const southwest = geoFromTile(spec.x, spec.y + spec.tiles);
  const northeast = geoFromTile(spec.x + spec.tiles, spec.y);
  const sw = sidewalkPhotoUv(spec, ...southwest); const ne = sidewalkPhotoUv(spec, ...northeast);
  assert.ok(Math.abs(sw[0]) < 1e-8 && Math.abs(sw[1]) < 1e-8);
  assert.ok(Math.abs(ne[0] - 1) < 1e-8 && Math.abs(ne[1] - 1) < 1e-8);
  assert.ok(sidewalkPhotoUv(spec, ...point(0, 1))[1] > sidewalkPhotoUv(spec, ...point(0, -1))[1]);
  assert.ok(sidewalkPhotoUv(spec, ...point(1, 0))[0] > sidewalkPhotoUv(spec, ...point(-1, 0))[0]);
  const url = new URL(sidewalkPhotoTileUrl(spec.level, spec.x, spec.y));
  assert.match(url.pathname, /CityImagery_2023\/MapServer\/tile\/21\/\d+\/\d+$/);
  assert.equal(url.search, '');
  assert.throws(() => geographicPhotoTile(NaN, 40));
  assert.throws(() => sidewalkPhotoTileUrl(22, 0, 0));
  assert.throws(() => sidewalkPhotoAtlasSpec([point(-1000, 0), point(1000, 0)]));
});

test('subsequent Cesium materials never clone a DOM canvas from the cached Fabric definition', t => {
  for (const name of ['HTMLCanvasElement', 'HTMLImageElement', 'ImageBitmap', 'OffscreenCanvas']) {
    const original = globalThis[name];
    globalThis[name] = class { constructor() { throw new TypeError('Illegal constructor'); } };
    t.after(() => { if (original === undefined) delete globalThis[name]; else globalThis[name] = original; });
  }
  const firstCanvas = Object.create(globalThis.HTMLCanvasElement.prototype);
  const secondCanvas = Object.create(globalThis.HTMLCanvasElement.prototype);
  const first = createSidewalkPhotoMaterial(firstCanvas);
  const second = createSidewalkPhotoMaterial(secondCanvas);
  try {
    assert.equal(first.uniforms.sourcePhoto, firstCanvas);
    assert.equal(second.uniforms.sourcePhoto, secondCanvas);
    assert.equal(first.fabric.uniforms.sourcePhoto, Material.DefaultImageId);
    assert.equal(second.fabric.uniforms.sourcePhoto, Material.DefaultImageId);
  } finally { first.destroy(); second.destroy(); }
});

test('96 adjacent sections share one complete atlas and material under the network cap', async () => {
  const h = harness({ maxRequests: 2 });
  try {
    const leases = await Promise.all(Array.from({ length: 96 }, () => h.pool.acquire(points)));
    assert.equal(h.requests.length, 36, 'requests must be shared rather than repeated for every section');
    assert.equal(new Set(h.requests.map(r => r.url)).size, 36);
    assert.ok(h.peak <= 2); assert.equal(h.resources.length, 1);
    assert.ok(leases.every(lease => lease.resource === leases[0].resource));
    assert.equal(h.canvases[0].draws.length, 36);
    assert.equal(h.decoded, 36); assert.equal(h.closed, 36);
    assert.ok(h.requests.every(r => r.settings.credentials === 'omit'));
    const spec = leases[0].spec;
    for (const draw of h.canvases[0].draws) {
      const [row, column] = draw.url.split('/').slice(-2).map(Number);
      assert.equal(draw.x, (column - spec.x) * 256);
      assert.equal(draw.y, (row - spec.y) * 256);
    }
    assert.equal(h.pool.getStats().leases, 96);
    leases.forEach(lease => { lease.release(); lease.release(); });
    assert.equal(h.pool.getStats().leases, 0);
  } finally { h.pool.destroy(); }
  assert.equal(h.disposed.length, 1);
  assert.equal(h.pool.getStats().cacheBytes, 0);
});

test('atlas LRU never destroys a material still used by visible sections', async () => {
  const h = harness({ maxAtlases: 1, maxCachedTiles: 2, maxCacheBytes: 1000 });
  try {
    const first = await h.pool.acquire(points);
    const spec = first.spec;
    const distant = [geoFromTile(spec.x + 10, spec.y + 2)];
    await assert.rejects(h.pool.acquire(distant), /occupied/);
    assert.equal(h.disposed.length, 0);
    first.release();
    const second = await h.pool.acquire(distant);
    assert.equal(h.disposed.length, 1);
    assert.ok(h.pool.getStats().tileCache <= 2);
    assert.ok(h.pool.getStats().cacheBytes <= 1000);
    second.release();
  } finally { h.pool.destroy(); }
  assert.equal(h.disposed.length, 2);
});

test('a completed atlas cannot be evicted before pending callers receive their leases', async () => {
  const spec = sidewalkPhotoAtlasSpec(points);
  const distant = [geoFromTile(spec.x + 10, spec.y + 2)];
  let competing;
  const h = harness({ maxAtlases: 1, createResource(canvas) {
    // This runs after the image is assembled, before buildAtlas's promise
    // continuation hands the first waiting section its completed material.
    queueMicrotask(() => { competing = h.pool.acquire(distant).then(
      lease => ({ lease }), error => ({ error }),
    ); });
    return { canvas };
  } });
  try {
    const lease = await h.pool.acquire(points);
    const other = await competing;
    assert.match(other.error?.message ?? '', /occupied/);
    assert.equal(h.disposed.length, 0); assert.equal(h.pool.getStats().leases, 1);
    lease.release();
  } finally { h.pool.destroy(); }
});

test('missing source photos reject the whole atlas without a partial or plain substitute', async () => {
  let warnings = 0;
  const h = harness({ fetchTile: async () => ({ ok: false, status: 503 }), onError: () => warnings++ });
  try {
    await assert.rejects(h.pool.acquire(points), /HTTP 503/);
    assert.equal(h.resources.length, 0); assert.equal(h.pool.getStats().ready, 0);
    assert.equal(h.canvases[0].width, 0); assert.equal(warnings, 1);
    await assert.rejects(h.pool.acquire(points), /cooling down/);
  } finally { h.pool.destroy(); }
});

test('clearing aborts pending source requests and late results cannot publish a material', async () => {
  const pending = [];
  const h = harness({ fetchTile: (url, settings) => new Promise(resolve => pending.push({ settings, resolve })) });
  const result = h.pool.acquire(points);
  const rejected = assert.rejects(result, /cancelled/);
  await flush(); assert.equal(pending.length, 4);
  h.pool.clear();
  assert.ok(pending.every(p => p.settings.signal.aborted));
  pending.forEach(p => p.resolve({ ok: true, blob: async () => new Blob(['late'], { type: 'image/jpeg' }) }));
  await rejected; await flush();
  assert.equal(h.resources.length, 0); assert.equal(h.pool.getStats().atlases, 0);
  assert.equal(h.pool.getStats().networkActive, 0); assert.equal(h.pool.getStats().cacheBytes, 0);
  h.pool.destroy();
});

test('hiding retains complete leased photographs but cancels incomplete atlases', async () => {
  const h = harness();
  try {
    const first = await h.pool.acquire(points);
    h.pool.cancelPending();
    const again = await h.pool.acquire(points);
    assert.equal(first.resource, again.resource); assert.equal(h.disposed.length, 0);
    first.release(); again.release();
  } finally { h.pool.destroy(); }
});

test('source photo UVs preserve mapped geometry, slope, and neutral edge assignment', () => {
  const ring = [...points, points[0]];
  const parsed = parseSidewalkSurface({ attributes: { FCODE: 2210, OBJECTID_1: 1 }, geometry: { rings: [ring] } });
  const section = sectionSidewalkSurface(parsed, { longitude: origin[0], latitude: origin[1] })[0];
  const spec = sidewalkPhotoAtlasSpec(points);
  const sampleHeight = (lon, lat) => 12 + (lat - origin[1]) * 2000;
  const plain = buildSidewalkGeometry(section, sampleHeight);
  const photo = buildSidewalkGeometry(section, sampleHeight, { photoUv: (lon, lat) => sidewalkPhotoUv(spec, lon, lat) });
  assert.deepEqual(photo.geometry.attributes.position.values, plain.geometry.attributes.position.values);
  assert.deepEqual(photo.geometry.indices, plain.geometry.indices);
  const positions = photo.geometry.attributes.position.values; const normals = photo.geometry.attributes.normal.values;
  const uv = photo.geometry.attributes.st.values;
  assert.equal(uv.length, positions.length / 3 * 2);
  let tops = 0; let edges = 0;
  for (let i = 0; i < positions.length / 3; i++) {
    if (normals[i * 3 + 2] > .8) {
      tops++;
      const p = Matrix4.multiplyByPoint(photo.modelMatrix, Cartesian3.fromArray(positions, i * 3), new Cartesian3());
      const g = Cartographic.fromCartesian(p);
      const expected = sidewalkPhotoUv(spec, g.longitude * 180 / Math.PI, g.latitude * 180 / Math.PI);
      assert.ok(Math.abs(uv[i * 2] - expected[0]) < 1e-6 && Math.abs(uv[i * 2 + 1] - expected[1]) < 1e-6);
    } else { edges++; assert.equal(uv[i * 2], -1); assert.equal(uv[i * 2 + 1], -1); }
  }
  assert.ok(tops > 0 && edges > 0);
});
