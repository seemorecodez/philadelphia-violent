import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicTerrain, decodeTerrariumPixels, resampleTerrainParent } from '../src/public-terrain.js';

test('Terrarium decoding preserves sea level, negative height and documented fractional example', () => {
  const pixels = new Uint8ClampedArray([128, 0, 0, 255, 127, 255, 128, 255, 137, 219, 68, 255]);
  assert.deepEqual([...decodeTerrariumPixels(pixels, 3, 1)], [0, -0.5, 2523.265625]);
});

test('missing elevation and malformed pixel grids reject rather than fabricate flat terrain', () => {
  assert.throws(() => decodeTerrariumPixels(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1), /missing elevation/);
  assert.throws(() => decodeTerrariumPixels(new Uint8ClampedArray([128, 0, 0, 0]), 1, 1), /missing elevation/);
  assert.throws(() => decodeTerrariumPixels(new Uint8ClampedArray(3), 1, 1), /invalid pixel count/);
});

test('descendant terrain samples use the correct parent quadrant and preserve shared edges', () => {
  const parent = new Float32Array([0, 10, 20, 30]);
  const northwest = resampleTerrainParent(parent, 0, 0, 1, 2);
  const northeast = resampleTerrainParent(parent, 1, 0, 1, 2);
  const southeast = resampleTerrainParent(parent, 1, 1, 1, 2);
  assert.deepEqual([...northwest], [0, 5, 10, 15]);
  assert.deepEqual([...northeast], [5, 10, 15, 20]);
  assert.deepEqual([...southeast], [15, 20, 25, 30]);
  assert.equal(northwest[1], northeast[0]);
  assert.equal(northwest[3], northeast[2]);
  assert.deepEqual([...parent], [0, 10, 20, 30]);
});

test('provider bounds source detail and disposed requests reject', async () => {
  const provider = await createPublicTerrain();
  assert.equal(provider.width, 256);
  assert.equal(provider.height, 256);
  assert.equal(provider.getTileDataAvailable(0, 0, 0), undefined);
  assert.equal(provider.getTileDataAvailable(0, 0, 17), undefined);
  assert.equal(provider.getTileDataAvailable(0, 0, 18), undefined);
  assert.equal(provider.maximumSourceLevel, 15);
  assert.equal(provider.maximumRenderLevel, 17);
  for (let level = 1; level < 36; level++) {
    assert.equal(provider.getLevelMaximumGeometricError(level), provider.getLevelMaximumGeometricError(level - 1) / 2);
    assert.ok(provider.getLevelMaximumGeometricError(level) > 0);
  }
  provider.dispose();
  await assert.rejects(provider.requestTileGeometry(0, 0, 0), { name: 'AbortError' });
  provider.dispose();
});

test('real terrain data supplies terminal child masks without zeroing imagery resolution', async () => {
  const originalFetch = globalThis.fetch;
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  const requests = [];
  try {
    // Decoder fixture only: exercise the provider lifecycle, not a city substitute.
    const pixels = new Uint8ClampedArray(256 * 256 * 4);
    for (let i = 0; i < pixels.length; i += 4) { pixels[i] = 128; pixels[i + 3] = 255; }
    globalThis.fetch = async url => { requests.push(url); return { ok: true, blob: async () => new Blob() }; };
    globalThis.createImageBitmap = async () => ({ width: 256, height: 256, close() {} });
    globalThis.OffscreenCanvas = class {
      getContext() { return { drawImage() {}, getImageData() { return { data: pixels }; } }; }
    };
    const provider = await createPublicTerrain();
    const branch = await provider.requestTileGeometry(0, 0, 16);
    const leaf = await provider.requestTileGeometry(0, 0, 17);
    assert.equal(branch.isChildAvailable(0, 0, 0, 0), true);
    for (const [x, y] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      assert.equal(leaf.isChildAvailable(0, 0, x, y), false);
    }
    assert.deepEqual(requests, ['/terrain/15/0/0.png']);
    assert.ok(provider.getLevelMaximumGeometricError(17) > 0);
    provider.dispose();
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
  }
});

test('provider throttles, deduplicates, aborts and rejects HTTP failures', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  try {
    globalThis.fetch = (_url, { signal }) => {
      requests++;
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    };
    const provider = await createPublicTerrain({ maxConcurrent: 1 });
    const first = provider.requestTileGeometry(0, 0, 1);
    const same = provider.requestTileGeometry(0, 0, 1);
    assert.equal(requests, 1);
    assert.equal(provider.requestTileGeometry(1, 0, 1), undefined);
    provider.dispose();
    await assert.rejects(first, { name: 'AbortError' });
    await assert.rejects(same, { name: 'AbortError' });

    globalThis.fetch = async () => ({ ok: false, status: 404 });
    const failing = await createPublicTerrain();
    await assert.rejects(failing.requestTileGeometry(0, 0, 0), /HTTP 404/);
    failing.dispose();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
