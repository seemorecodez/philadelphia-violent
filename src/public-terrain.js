import { Credit, CustomHeightmapTerrainProvider, HeightmapTerrainData, WebMercatorTilingScheme } from 'cesium';

const TILE_SIZE = 256;
// Live verification: Philadelphia z15 exists; its z16 children return HTTP 404.
const MAX_SOURCE_LEVEL = 15;
const MAX_RENDER_LEVEL = 17;
const TERRAIN_CREDIT = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener noreferrer">Terrain Tiles / Mapzen</a> · United States 3DEP, GMTED2010 and SRTM data courtesy of the U.S. Geological Survey; ETOPO1 data NOAA · <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">Terrain sources and licenses</a>';

/** Terrarium RGB stores metres as R*256 + G + B/256 - 32768. */
export function decodeTerrariumPixels(rgba, width = TILE_SIZE, height = TILE_SIZE) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || rgba.length !== width * height * 4) {
    throw new Error('Terrain image has an invalid pixel count.');
  }
  const result = new Float32Array(width * height);
  for (let pixel = 0; pixel < result.length; pixel++) {
    const offset = pixel * 4;
    const elevation = rgba[offset] * 256 + rgba[offset + 1] + rgba[offset + 2] / 256 - 32768;
    // Transparent pixels and -32768 cannot represent valid terrestrial terrain.
    // Reject the tile instead of turning missing observations into a flat surface.
    if (rgba[offset + 3] !== 255 || !Number.isFinite(elevation) || elevation === -32768) {
      throw new Error(`Terrain image contains missing elevation at pixel ${pixel}.`);
    }
    result[pixel] = elevation;
  }
  return result;
}

/** Resample a requested descendant using only already observed parent heights. */
export function resampleTerrainParent(parent, childX, childY, levelsBelow, size = TILE_SIZE) {
  if (parent.length !== size * size || !Number.isInteger(levelsBelow) || levelsBelow < 0 || levelsBelow > 15) {
    throw new Error('Invalid parent terrain grid.');
  }
  const divisions = 2 ** levelsBelow;
  const localX = ((childX % divisions) + divisions) % divisions;
  const localY = ((childY % divisions) + divisions) % divisions;
  const result = new Float32Array(parent.length);
  for (let row = 0; row < size; row++) {
    const sourceY = (localY + row / (size - 1)) * (size - 1) / divisions;
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(y0 + 1, size - 1);
    const fy = sourceY - y0;
    for (let column = 0; column < size; column++) {
      const sourceX = (localX + column / (size - 1)) * (size - 1) / divisions;
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(x0 + 1, size - 1);
      const fx = sourceX - x0;
      const north = parent[y0 * size + x0] * (1 - fx) + parent[y0 * size + x1] * fx;
      const south = parent[y1 * size + x0] * (1 - fx) + parent[y1 * size + x1] * fx;
      result[row * size + column] = north * (1 - fy) + south * fy;
    }
  }
  return result;
}

function abortError() {
  return new DOMException('Terrain provider was disposed.', 'AbortError');
}

async function decodeImage(blob) {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    if (bitmap.width !== TILE_SIZE || bitmap.height !== TILE_SIZE) {
      throw new Error(`Expected a ${TILE_SIZE}×${TILE_SIZE} terrain tile.`);
    }
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(TILE_SIZE, TILE_SIZE)
      : Object.assign(document.createElement('canvas'), { width: TILE_SIZE, height: TILE_SIZE });
    const context = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
    if (!context) throw new Error('A 2D canvas is required to decode public terrain.');
    context.imageSmoothingEnabled = false;
    context.drawImage(bitmap, 0, 0);
    return decodeTerrariumPixels(context.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data);
  } finally {
    bitmap.close();
  }
}

/**
 * Key-free Mapzen Terrain Tiles. /terrain is a fixed-source same-origin proxy to
 * https://s3.amazonaws.com/elevation-tiles-prod/terrarium, since S3 omits CORS.
 * Source: https://registry.opendata.aws/terrain-tiles/ (no AWS account required).
 * These are bare-earth source elevations, not roofs, bridges or a road survey.
 * No geoid conversion is applied; source vertical datums can differ from I3S.
 * Native raster pixel centres are used as heightmap grid vertices. This leaves
 * up to half a source pixel of registration error at tile edges; Cesium skirts
 * hide cracks, but this is not a surveyed continuous street-contact surface.
 */
export async function createPublicTerrain({ maxConcurrent = 6, cacheTiles = 64, timeoutMs = 20000 } = {}) {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 16
      || !Number.isInteger(cacheTiles) || cacheTiles < 1 || cacheTiles > 256
      || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Invalid terrain resource limits.');
  }
  const cache = new Map();
  const pending = new Map();
  let disposed = false;

  function loadSource(x, y, level) {
    const key = `${level}/${x}/${y}`;
    if (cache.has(key)) {
      const heights = cache.get(key);
      cache.delete(key);
      cache.set(key, heights);
      return heights;
    }
    if (pending.has(key)) return pending.get(key).promise;
    // Returning undefined synchronously is Cesium's documented retry signal.
    if (pending.size >= maxConcurrent) return undefined;
    const controller = new AbortController();
    const entry = { controller, promise: undefined };
    const timer = setTimeout(() => controller.abort(new DOMException('Terrain request timed out.', 'TimeoutError')), timeoutMs);
    entry.promise = (async () => {
      try {
        const response = await fetch(`/terrain/${key}.png`, {
          signal: controller.signal,
          credentials: 'omit',
        });
        if (!response.ok) throw new Error(`Public terrain ${key} failed (HTTP ${response.status}).`);
        const heights = await decodeImage(await response.blob());
        if (disposed) throw abortError();
        cache.set(key, heights);
        while (cache.size > cacheTiles) cache.delete(cache.keys().next().value);
        return heights;
      } catch (error) {
        if (disposed) throw abortError();
        throw new Error(`Could not load public terrain ${key}: ${error.message}`, { cause: error });
      } finally {
        clearTimeout(timer);
        pending.delete(key);
      }
    })();
    pending.set(key, entry);
    return entry.promise;
  }

  function requestHeights(x, y, level) {
      if (disposed) return Promise.reject(abortError());
      if (!Number.isInteger(level) || level < 0 || level > 30
          || !Number.isInteger(x) || !Number.isInteger(y)
          || x < 0 || y < 0 || x >= 2 ** level || y >= 2 ** level) {
        return Promise.reject(new Error('Invalid public terrain tile coordinates.'));
      }
      const sourceLevel = Math.min(level, MAX_SOURCE_LEVEL);
      const divisions = 2 ** (level - sourceLevel);
      const result = loadSource(Math.floor(x / divisions), Math.floor(y / divisions), sourceLevel);
      if (result === undefined) return undefined;
      return Promise.resolve(result).then(heights => {
        if (disposed) throw abortError();
        // Heightmap workers may transfer/detach buffers. Never give them the cache.
        return level > sourceLevel
          ? resampleTerrainParent(heights, x, y, level - sourceLevel)
          : heights.slice();
      });
  }

  const provider = new CustomHeightmapTerrainProvider({
    width: TILE_SIZE,
    height: TILE_SIZE,
    tilingScheme: new WebMercatorTilingScheme(),
    credit: new Credit(TERRAIN_CREDIT, false),
    callback: requestHeights,
  });

  // Returning either true or false here lets Cesium refine UNLOADED tiles.
  // Unknown availability makes it wait for real terrain data and its child mask.
  provider.getTileDataAvailable = () => undefined;
  provider.requestTileGeometry = (x, y, level) => {
    const heights = requestHeights(x, y, level);
    if (heights === undefined) return undefined;
    return Promise.resolve(heights).then(buffer => new HeightmapTerrainData({
      buffer,
      width: TILE_SIZE,
      height: TILE_SIZE,
      childTileMask: level < MAX_RENDER_LEVEL ? 15 : 0,
    }));
  };
  // Imagery LOD also uses this error. In Cesium 1.145, zero becomes log(Infinity)
  // then integer zero, selecting world-level imagery. A fixed floor also never
  // converges. Preserve the positive native estimate at every level.
  // ** avoids the original provider's 32-bit shift overflow at deep levels.
  const levelZeroError = provider.getLevelMaximumGeometricError(0);
  provider.getLevelMaximumGeometricError = level => levelZeroError / 2 ** level;
  provider.maximumSourceLevel = MAX_SOURCE_LEVEL;
  provider.maximumRenderLevel = MAX_RENDER_LEVEL;
  provider.dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const { controller } of pending.values()) controller.abort();
    cache.clear();
  };
  return provider;
}
