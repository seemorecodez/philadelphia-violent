import { SOURCES } from './sources.js';

// Use the same observed 2023 photographs as the globe. Level 21 is about
// 5.7 cm/pixel at Philadelphia, retaining the published 3-inch imagery detail.
// This tile resolution does not create finer information than the photographs.
export const SIDEWALK_PHOTO_LEVEL = 21;
const TILE_SIZE = 256;
const CORE_TILES = 4;
const BORDER_TILES = 1;
const ATLAS_TILES = CORE_TILES + BORDER_TILES * 2;
const MAX_BLOB_BYTES = 1024 * 1024;
const abortError = () => new DOMException('Sidewalk imagery request cancelled.', 'AbortError');

export function geographicPhotoTile(longitude, latitude, level = SIDEWALK_PHOTO_LEVEL) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
      || Math.abs(longitude) > 180 || Math.abs(latitude) >= 85
      || !Number.isInteger(level) || level < 0 || level > 22) throw new Error('Invalid photographic tile location.');
  const radians = latitude * Math.PI / 180;
  const count = 2 ** level;
  return [(longitude + 180) / 360 * count,
    (1 - Math.log(Math.tan(Math.PI / 4 + radians / 2)) / Math.PI) / 2 * count];
}

/** A shared four-tile cell plus a one-tile border keeps 6 m sections intact. */
export function sidewalkPhotoAtlasSpec(points) {
  if (!Array.isArray(points) || !points.length) throw new Error('Sidewalk imagery needs geographic vertices.');
  const tiles = points.map(point => geographicPhotoTile(point[0], point[1]));
  const minX = Math.min(...tiles.map(p => p[0])); const maxX = Math.max(...tiles.map(p => p[0]));
  const minY = Math.min(...tiles.map(p => p[1])); const maxY = Math.max(...tiles.map(p => p[1]));
  const coreX = Math.floor((minX + maxX) / 2 / CORE_TILES) * CORE_TILES;
  const coreY = Math.floor((minY + maxY) / 2 / CORE_TILES) * CORE_TILES;
  const x = coreX - BORDER_TILES; const y = coreY - BORDER_TILES;
  if (minX < x || maxX > x + ATLAS_TILES || minY < y || maxY > y + ATLAS_TILES
      || x < 0 || y < 0 || x + ATLAS_TILES > 2 ** SIDEWALK_PHOTO_LEVEL
      || y + ATLAS_TILES > 2 ** SIDEWALK_PHOTO_LEVEL) throw new Error('Sidewalk section exceeds its bounded photographic atlas.');
  return { key: `${SIDEWALK_PHOTO_LEVEL}/${coreX}/${coreY}`, level: SIDEWALK_PHOTO_LEVEL,
    x, y, tiles: ATLAS_TILES, width: TILE_SIZE * ATLAS_TILES, height: TILE_SIZE * ATLAS_TILES };
}

/** North-up source JPEGs are uploaded with Cesium's usual canvas Y flip. */
export function sidewalkPhotoUv(spec, longitude, latitude) {
  const [x, y] = geographicPhotoTile(longitude, latitude, spec.level);
  const u = (x - spec.x) / spec.tiles; const v = 1 - (y - spec.y) / spec.tiles;
  if (u < -1e-7 || u > 1 + 1e-7 || v < -1e-7 || v > 1 + 1e-7) throw new Error('Sidewalk vertex is outside its photographic atlas.');
  return [Math.max(0, Math.min(1, u)), Math.max(0, Math.min(1, v))];
}

export function sidewalkPhotoTileUrl(level, x, y) {
  const count = 2 ** level;
  if (level !== SIDEWALK_PHOTO_LEVEL || !Number.isInteger(x) || !Number.isInteger(y)
      || x < 0 || y < 0 || x >= count || y >= count) throw new Error('Invalid source photograph request.');
  return `${SOURCES.imagery}/tile/${level}/${y}/${x}`;
}

const defaultCanvas = (width, height) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
};
const defaultDecode = blob => createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });

/**
 * Shared original-photo atlases, never a request/material/texture per section.
 * At most nine 1536² atlases (~81 MiB GPU RGBA plus ~81 MiB retained canvas
 * pixels before driver overhead; no mipmaps requested), two atlas
 * builders, four network requests, and 8 MiB/128 entries of source JPEG cache.
 * Failed/incomplete atlases are never exposed to a renderer. Ready, leased
 * materials cannot be evicted; callers retain underlying globe imagery while
 * waiting. No photo pixels are recolored, synthesized, erased or repainted.
 */
export function createSidewalkPhotoAtlasPool({
  fetchTile = (...args) => fetch(...args), decode = defaultDecode, createCanvas = defaultCanvas,
  createResource = canvas => canvas, destroyResource = () => {},
  maxAtlases = 9, maxCachedTiles = 128, maxCacheBytes = 8 * 1024 * 1024,
  maxRequests = 4, timeoutMs = 12000, onError = () => {},
} = {}) {
  if (![maxAtlases, maxCachedTiles, maxCacheBytes, maxRequests, timeoutMs].every(n => Number.isInteger(n) && n > 0)
      || maxAtlases > 9 || maxCachedTiles > 128 || maxCacheBytes > 8 * 1024 * 1024 || maxRequests > 4) {
    throw new Error('Invalid sidewalk photo resource limits.');
  }
  const atlases = new Map(); const tileCache = new Map(); const tileJobs = new Map();
  let tileQueue = []; let atlasQueue = []; let networkActive = 0; let atlasActive = 0;
  let cacheBytes = 0; let epoch = 0; let closed = false; let failureUntil = 0;
  const live = job => !closed && job.epoch === epoch && !job.controller.signal.aborted;
  function removeAtlas(entry) {
    if (atlases.get(entry.spec.key) === entry) atlases.delete(entry.spec.key);
    entry.controller.abort();
    if (entry.resource) { destroyResource(entry.resource); entry.resource = null; }
    if (entry.canvas) { entry.canvas.width = 0; entry.canvas.height = 0; entry.canvas = null; }
  }
  function trimTiles() {
    while (tileCache.size > maxCachedTiles || cacheBytes > maxCacheBytes) {
      const [key, blob] = tileCache.entries().next().value;
      tileCache.delete(key); cacheBytes -= blob.size;
    }
  }
  function pumpTiles() {
    while (!closed && networkActive < maxRequests && tileQueue.length) {
      const job = tileQueue.shift();
      if (!live(job)) { job.reject(abortError()); if (tileJobs.get(job.key) === job) tileJobs.delete(job.key); continue; }
      networkActive++;
      void (async () => {
        const timer = setTimeout(() => job.controller.abort(), timeoutMs);
        try {
          const response = await fetchTile(job.url, { signal: job.controller.signal, credentials: 'omit' });
          if (!response.ok) throw new Error(`Sidewalk photograph HTTP ${response.status}`);
          const declaredSize = Number(response.headers?.get?.('content-length') ?? 0);
          if (declaredSize > MAX_BLOB_BYTES) throw new Error('Sidewalk photograph exceeds the byte limit.');
          const blob = await response.blob();
          if (!blob.type.startsWith('image/') || blob.size < 1 || blob.size > MAX_BLOB_BYTES) throw new Error('Invalid sidewalk photograph response.');
          if (!live(job)) throw abortError();
          tileCache.set(job.key, blob); cacheBytes += blob.size; trimTiles(); job.resolve(blob);
        } catch (error) { job.reject(error); }
        finally {
          clearTimeout(timer); networkActive--;
          if (tileJobs.get(job.key) === job) tileJobs.delete(job.key);
          pumpTiles();
        }
      })();
    }
  }
  function getTile(level, x, y) {
    const key = `${level}/${x}/${y}`;
    if (tileCache.has(key)) {
      const blob = tileCache.get(key); tileCache.delete(key); tileCache.set(key, blob); return Promise.resolve(blob);
    }
    if (tileJobs.has(key)) return tileJobs.get(key).promise;
    const job = { key, url: sidewalkPhotoTileUrl(level, x, y), epoch, controller: new AbortController() };
    job.promise = new Promise((resolve, reject) => Object.assign(job, { resolve, reject }));
    tileJobs.set(key, job); tileQueue.push(job); pumpTiles(); return job.promise;
  }
  async function buildAtlas(entry) {
    if (!live(entry) || Date.now() < failureUntil) throw abortError();
    const { spec } = entry;
    const canvas = createCanvas(spec.width, spec.height);
    entry.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Sidewalk photographs require a canvas.');
    context.imageSmoothingEnabled = false;
    let next = 0; let firstError = null;
    // Four workers per atlas bound decoded images and stop scheduling tiles
    // after a source failure. Shared tile jobs enforce the global network cap.
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (!firstError && live(entry)) {
        const index = next++; if (index >= spec.tiles * spec.tiles) return;
        const column = index % spec.tiles; const row = Math.floor(index / spec.tiles);
        let bitmap;
        try {
          const blob = await getTile(spec.level, spec.x + column, spec.y + row);
          if (!live(entry)) throw abortError();
          bitmap = await decode(blob);
          if (!live(entry)) throw abortError();
          if (bitmap.width !== TILE_SIZE || bitmap.height !== TILE_SIZE) throw new Error('Source sidewalk photograph has unexpected dimensions.');
          context.drawImage(bitmap, column * TILE_SIZE, row * TILE_SIZE);
        } catch (error) { firstError ??= error; }
        finally { bitmap?.close?.(); }
      }
    }));
    if (!live(entry)) throw abortError();
    if (firstError) throw firstError;
    entry.resource = createResource(canvas);
    entry.ready = true;
    return entry;
  }
  function pumpAtlases() {
    while (!closed && atlasActive < 2 && atlasQueue.length) {
      const entry = atlasQueue.shift(); atlasActive++;
      void buildAtlas(entry).then(entry.resolve, error => {
        removeAtlas(entry);
        if (error.name !== 'AbortError' && !closed && entry.epoch === epoch) {
          failureUntil = Date.now() + 30000; onError(error);
        }
        entry.reject(error);
      }).finally(() => { atlasActive--; pumpAtlases(); });
    }
  }
  async function acquire(points) {
    if (closed) throw abortError();
    const spec = sidewalkPhotoAtlasSpec(points);
    let entry = atlases.get(spec.key);
    if (!entry) {
      if (Date.now() < failureUntil) throw new Error('Sidewalk source photographs are cooling down after a failure.');
      if (atlases.size >= maxAtlases) {
        const unused = [...atlases.values()].find(value => value.ready && value.users === 0 && value.waiters === 0);
        if (!unused) throw new Error('The bounded sidewalk photo cache is occupied.');
        removeAtlas(unused);
      }
      entry = { spec, users: 0, waiters: 0, ready: false, resource: null, canvas: null, epoch, controller: new AbortController() };
      entry.promise = new Promise((resolve, reject) => Object.assign(entry, { resolve, reject }));
      atlases.set(spec.key, entry); atlasQueue.push(entry); pumpAtlases();
    } else { atlases.delete(spec.key); atlases.set(spec.key, entry); }
    // Protect the short interval between atlas completion and the awaiting
    // callers receiving their leases. A new cell must not evict those pixels.
    entry.waiters++;
    try {
      await entry.promise;
      if (closed || !entry.ready || entry.controller.signal.aborted || atlases.get(spec.key) !== entry) throw abortError();
      entry.users++;
      let released = false;
      return { spec: entry.spec, resource: entry.resource,
        uv: (longitude, latitude) => sidewalkPhotoUv(entry.spec, longitude, latitude),
        release() { if (!released) { released = true; entry.users--; } },
      };
    } finally { entry.waiters--; }
  }
  function cancelPending() {
    epoch++;
    for (const job of tileJobs.values()) job.controller.abort();
    for (const job of tileQueue) { job.reject(abortError()); if (tileJobs.get(job.key) === job) tileJobs.delete(job.key); }
    tileQueue = []; tileJobs.clear();
    for (const entry of atlases.values()) if (!entry.ready) { removeAtlas(entry); entry.reject(abortError()); }
    atlasQueue = [];
  }
  function clear() {
    cancelPending();
    for (const entry of atlases.values()) removeAtlas(entry);
    tileCache.clear(); cacheBytes = 0; failureUntil = 0;
  }
  return { acquire, cancelPending, clear,
    destroy() { if (!closed) { clear(); closed = true; } },
    getStats() { return { atlases: atlases.size, ready: [...atlases.values()].filter(e => e.ready).length,
      leases: [...atlases.values()].reduce((sum, e) => sum + e.users, 0),
      tileCache: tileCache.size, cacheBytes, networkActive, atlasActive }; },
  };
}
