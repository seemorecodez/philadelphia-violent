import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartographic, Rectangle, Request, Resource } from 'cesium';
import { createGroundImagery } from '../src/ground-imagery.js';
import { SOURCES } from '../src/sources.js';

function intercept(t) {
  const posts = [];
  const decodes = [];
  const bitmap = { width: 512, height: 512, closed: 0, close() { this.closed++; } };
  const state = {
    response: () => Promise.resolve(new Blob(['test tile'], { type: 'image/png' })),
    decode: () => Promise.resolve(bitmap),
  };
  t.mock.method(Resource.prototype, 'post', function (body, options) {
    posts.push({ url: this.url, request: this.request, body, options });
    return state.response();
  });
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true, writable: true,
    value: (...args) => { decodes.push(args); return state.decode(...args); },
  });
  t.after(() => {
    if (originalBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalBitmap);
    else delete globalThis.createImageBitmap;
  });
  return { posts, decodes, state, bitmap };
}

test('solid global base keeps bounded municipal overlays from stretching outside Philadelphia', () => {
  const [base, water, pavement] = createGroundImagery();
  assert.equal(base.url, '/materials/neutral-ground.png');
  assert.ok(Rectangle.equals(base.rectangle, Rectangle.MAX_VALUE));
  assert.equal(base.tileWidth, 2);
  assert.equal(base.tileHeight, 2);
  const cityBounds = Rectangle.fromDegrees(-75.30, 39.86, -74.94, 40.15);
  for (const layer of [water, pavement]) {
    assert.ok(Rectangle.equals(layer.rectangle, cityBounds));
    assert.ok(Rectangle.contains(layer.rectangle, Cartographic.fromDegrees(-75.16469, 39.94746)));
    assert.equal(Rectangle.contains(layer.rectangle, Cartographic.fromDegrees(-76, 40)), false);
    assert.equal(layer.enablePickFeatures, false);
    assert.equal(layer.hasAlphaChannel, true);
    const sw = layer.tilingScheme.positionToTileXY(Rectangle.southwest(layer.rectangle), layer.minimumLevel);
    const ne = layer.tilingScheme.positionToTileXY(Rectangle.northeast(layer.rectangle), layer.minimumLevel);
    assert.equal((ne.x - sw.x + 1) * (sw.y - ne.y + 1), 4);
  }
  assert.equal(water.url, `${SOURCES.hydrography}/export`);
  assert.equal(pavement.url, `${SOURCES.ground}/export`);
});

test('Broad Street pavement exports the full source classification by POST with the correct projected bbox', async t => {
  const h = intercept(t);
  const [, , pavement] = createGroundImagery();
  const request = new Request({ throttle: true, throttleByServer: true });
  const image = await pavement.requestImage(38169, 49646, 17, request);
  assert.equal(image, h.bitmap);
  assert.equal(h.posts.length, 1);
  const posted = h.posts[0];
  assert.equal(posted.url, `${SOURCES.ground}/export`);
  assert.equal(posted.url.includes('?'), false);
  assert.equal(posted.request, request);
  assert.equal(posted.options.responseType, 'blob');
  assert.equal(posted.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const fields = new URLSearchParams(posted.body);
  assert.equal(fields.get('bboxSR'), '3857');
  assert.equal(fields.get('imageSR'), '3857');
  assert.equal(fields.get('size'), '512,512');
  assert.equal(fields.get('f'), 'image');
  assert.equal(fields.get('transparent'), 'true');
  assert.deepEqual(fields.get('bbox').split(',').map(Number), [
    -8367408.612321675, 4858031.769692661, -8367102.864208534, 4858337.517805804,
  ]);
  const [layer] = JSON.parse(fields.get('dynamicLayers'));
  assert.deepEqual(layer.source, { type: 'mapLayer', mapLayerId: 11 });
  assert.equal(layer.drawingInfo.showLabels, false);
  const renderer = layer.drawingInfo.renderer;
  assert.equal(renderer.field1, 'FCODE');
  const byCode = Object.fromEntries(renderer.uniqueValueInfos.map(entry => [entry.value, entry.symbol]));
  assert.deepEqual(Object.keys(byCode).map(Number), [
    1000, 1010, 1020, 1200, 1210, 1220, 2200, 2210, 2220, 2230, 2240, 2250, 2260, 2300, 2310, 9999,
  ]);
  assert.deepEqual(byCode[1000].color, [66, 71, 75, 255]);
  assert.deepEqual(byCode[2210].color, [173, 168, 154, 255]);
  assert.deepEqual(byCode[9999].color, [98, 117, 79, 255]);
  assert.deepEqual(renderer.defaultSymbol.color, [0, 0, 0, 0]);
  assert.ok(Object.values(byCode).every(symbol => symbol.type === 'esriSFS' && symbol.outline === null));
  assert.deepEqual(h.decodes[0][1], {
    imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none',
  });
});

test('minimum-level water export uses actual layer 9 and throttling preserves the Cesium request token', async t => {
  const h = intercept(t);
  const [, water] = createGroundImagery();
  const request = new Request({ throttle: true, throttleByServer: true });
  h.state.response = () => undefined;
  assert.equal(water.requestImage(149, 193, 9, request), undefined);
  assert.equal(h.posts[0].request, request);
  assert.equal(h.decodes.length, 0);
  const fields = new URLSearchParams(h.posts[0].body);
  assert.deepEqual(fields.get('bbox').split(',').map(Number), [
    -8375052.315150192, 4852834.05176927, -8296780.798186172, 4931105.56873329,
  ]);
  const [layer] = JSON.parse(fields.get('dynamicLayers'));
  assert.deepEqual(layer.source, { type: 'mapLayer', mapLayerId: 9 });
  assert.equal(layer.drawingInfo.renderer.type, 'simple');
  h.state.response = () => Promise.resolve(new Blob(['tile'], { type: 'image/png' }));
  assert.equal(await water.requestImage(149, 193, 9, request), h.bitmap);
  assert.equal(h.posts[1].request, request);
});

test('HTTP failure and non-image or oversized responses reject instead of displaying invalid terrain imagery', async t => {
  const h = intercept(t);
  const [, , pavement] = createGroundImagery();
  const failure = new Error('HTTP 404');
  h.state.response = () => Promise.reject(failure);
  await assert.rejects(pavement.requestImage(38169, 49646, 17), error => error === failure);
  h.state.response = () => Promise.resolve(new Blob(['<html>error</html>'], { type: 'text/html' }));
  await assert.rejects(pavement.requestImage(38169, 49646, 17), /bounded image/);
  h.state.response = () => Promise.resolve({ type: 'image/png', size: 8 * 1024 * 1024 + 1 });
  await assert.rejects(pavement.requestImage(38169, 49646, 17), /bounded image/);
  assert.equal(h.decodes.length, 0);
});

test('decode errors propagate and wrong-sized bitmaps are closed before rejecting', async t => {
  const h = intercept(t);
  const [, water] = createGroundImagery();
  h.state.decode = () => Promise.reject(new Error('Invalid PNG'));
  await assert.rejects(water.requestImage(149, 193, 9), /Invalid PNG/);
  h.bitmap.width = 511;
  h.state.decode = () => Promise.resolve(h.bitmap);
  await assert.rejects(water.requestImage(149, 193, 9), /dimensions/);
  assert.equal(h.bitmap.closed, 1);
});
