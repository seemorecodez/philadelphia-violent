import {
  BoundingSphere, Cartesian2, Cartesian3, Cartographic, Color,
  ComponentDatatype, Geometry, GeometryAttribute,
  GeometryInstance, Material, MaterialAppearance, Matrix4, PolygonPipeline,
  Primitive, PrimitiveType, ShadowMode, Transforms,
} from 'cesium';
import { createSidewalkPhotoAtlasPool } from './sidewalk-photo-atlas.js';

// Source boundaries and source photographs are retained. The 8 cm relief,
// neutral slab edges and 6 m damage divisions are unsurveyed gameplay choices.
export const SIDEWALK_SOURCE = 'https://mapservices.pasda.psu.edu/server/rest/services/pasda/CityPhilly/MapServer/11/query';
const ORIGIN = [-75.2, 39.9];
const METRES_LAT = 111320;
const METRES_LON = METRES_LAT * Math.cos(40 * Math.PI / 180);
const SECTION = 6;
const RADIUS = 90;
const WINDOW = 140;
const LIMIT = 96;
const RECORD_LIMIT = 80;
const DEPTH = 0.08;
const validPoint = p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])
  && p[0] > -75.31 && p[0] < -74.93 && p[1] > 39.83 && p[1] < 40.17;
const toLocal = p => [(p[0] - ORIGIN[0]) * METRES_LON, (p[1] - ORIGIN[1]) * METRES_LAT];
export const sidewalkLocalToGeographic = p => [ORIGIN[0] + p[0] / METRES_LON, ORIGIN[1] + p[1] / METRES_LAT];
const toGeographic = sidewalkLocalToGeographic;
const area = ring => ring.reduce((sum, p, i) => {
  const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[1] - q[0] * p[1];
}, 0) / 2;
const samePoint = (p, q) => Math.abs(p[0] - q[0]) < 1e-8 && Math.abs(p[1] - q[1]) < 1e-8;

function contains(ring, p) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1])
        && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Group ArcGIS rings by containment, including multipart exteriors and islands. */
export function parseSidewalkSurface(feature) {
  const a = feature?.attributes ?? feature?.properties;
  const sourceId = a?.OBJECTID_1 ?? a?.objectid_1 ?? a?.OBJECTID ?? a?.objectid ?? feature?.id;
  const raw = feature?.geometry?.rings ?? (feature?.geometry?.type === 'Polygon'
    ? feature.geometry.coordinates : feature?.geometry?.type === 'MultiPolygon' ? feature.geometry.coordinates.flat() : null);
  if (Number(a?.FCODE ?? a?.fcode) !== 2210 || sourceId === undefined || sourceId === null
      || !Array.isArray(raw) || !raw.length || raw.length > 64
      || raw.reduce((n, ring) => n + (Array.isArray(ring) ? ring.length : 9000), 0) > 8192) return null;
  const rings = [];
  for (const ring of raw) {
    if (!Array.isArray(ring) || ring.some(p => !validPoint(p))) return null;
    const points = ring.map(toLocal).filter((p, i, all) => !i || !samePoint(p, all[i - 1]));
    if (points.length > 1 && samePoint(points[0], points.at(-1))) points.pop();
    const size = Math.abs(area(points));
    if (points.length < 3 || size < 0.0001) return null;
    rings.push({ points, size, parent: null, depth: 0 });
  }
  rings.sort((a, b) => b.size - a.size);
  for (let i = 0; i < rings.length; i++) {
    for (let j = i - 1; j >= 0; j--) {
      if (contains(rings[j].points, rings[i].points[0])) {
        rings[i].parent = rings[j]; rings[i].depth = rings[j].depth + 1; break;
      }
    }
  }
  const polygons = rings.filter(r => r.depth % 2 === 0).map(outer => ({
    outer: outer.points, holes: rings.filter(r => r.parent === outer && r.depth % 2 === 1).map(r => r.points),
  }));
  return { sourceId: String(sourceId), sourceObjectId: a.OBJECTID ?? a.objectid ?? null,
    source: SIDEWALK_SOURCE, sourceYear: 2015, polygons, sourceRingCount: rings.length,
    sourceShapeArea: a.Shape_Area ?? null, sourceShapeAreaUnit: 'unverified-service-field' };
}

// Clip convex pieces, after triangulating with holes. This avoids converting a
// clipped hole into a filled island or inventing a corridor width.
function clip(polygon, axis, limit, keepGreater) {
  const result = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]; const b = polygon[(i + 1) % polygon.length];
    const insideA = keepGreater ? a[axis] >= limit : a[axis] <= limit;
    const insideB = keepGreater ? b[axis] >= limit : b[axis] <= limit;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

export function distanceToSidewalkSection(section, state) {
  const p = toLocal([state.longitude, state.latitude]);
  let distance = Infinity;
  for (const piece of section.pieces) {
    if (contains(piece, p)) return 0;
    for (let i = 0; i < piece.length; i++) {
      const a = piece[i]; const b = piece[(i + 1) % piece.length];
      const dx = b[0] - a[0]; const dy = b[1] - a[1];
      const denominator = dx * dx + dy * dy;
      const t = denominator ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / denominator)) : 0;
      distance = Math.min(distance, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
    }
  }
  return distance;
}

/** Stable source-id/grid-id sections; clipping retains measured polygon area. */
export function sectionSidewalkSurface(surface, state, radius = WINDOW) {
  if (!surface || !validPoint([state?.longitude, state?.latitude])) return [];
  const center = toLocal([state.longitude, state.latitude]);
  const reach = Math.max(1, Math.min(WINDOW, Number.isFinite(radius) ? radius : WINDOW));
  const minX = Math.floor((center[0] - reach) / SECTION); const maxX = Math.floor((center[0] + reach) / SECTION);
  const minY = Math.floor((center[1] - reach) / SECTION); const maxY = Math.floor((center[1] + reach) / SECTION);
  const sections = new Map();
  for (const polygon of surface.polygons) {
    const points = [...polygon.outer]; const holes = [];
    for (const ring of polygon.holes) { holes.push(points.length); points.push(...ring); }
    const indices = PolygonPipeline.triangulate(points.map(p => new Cartesian2(...p)), holes);
    const expectedArea = Math.abs(area(polygon.outer)) - polygon.holes.reduce((sum, h) => sum + Math.abs(area(h)), 0);
    let triangleArea = 0;
    for (let i = 0; i < indices.length; i += 3) triangleArea += Math.abs(area(indices.slice(i, i + 3).map(index => points[index])));
    if (expectedArea <= 0 || Math.abs(triangleArea - expectedArea) > Math.max(0.001, expectedArea * 0.00001)) return [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = indices.slice(i, i + 3).map(index => points[index]);
      const x0 = Math.max(minX, Math.floor(Math.min(...triangle.map(p => p[0])) / SECTION));
      const x1 = Math.min(maxX, Math.floor(Math.max(...triangle.map(p => p[0])) / SECTION));
      const y0 = Math.max(minY, Math.floor(Math.min(...triangle.map(p => p[1])) / SECTION));
      const y1 = Math.min(maxY, Math.floor(Math.max(...triangle.map(p => p[1])) / SECTION));
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        let piece = clip(triangle, 0, x * SECTION, true);
        piece = clip(piece, 0, (x + 1) * SECTION, false);
        piece = clip(piece, 1, y * SECTION, true);
        piece = clip(piece, 1, (y + 1) * SECTION, false);
        if (piece.length < 3 || Math.abs(area(piece)) < 0.0001) continue;
        if (area(piece) < 0) piece.reverse();
        const id = `sidewalk-surface:${surface.sourceId}:${x}:${y}`;
        if (!sections.has(id)) {
          const [longitude, latitude] = toGeographic([(x + 0.5) * SECTION, (y + 0.5) * SECTION]);
          sections.set(id, { kind: 'sidewalk', id, sourceId: surface.sourceId, sourceObjectId: surface.sourceObjectId,
            source: surface.source, sourceYear: surface.sourceYear, sourceRingCount: surface.sourceRingCount,
            longitude, latitude, height: DEPTH, baseHeight: null, pieces: [], area: 0,
            dimension: { depth: DEPTH, maximumSectionSpan: SECTION }, dimensionsEstimated: true,
            boundaryBasis: 'source-polygon-clipped-for-gameplay', depthEstimated: true,
            materialBasis: 'source-2023-aerial-top-estimated-slab-edges', heightBasis: 'loaded-terrain-per-vertex' });
        }
        const section = sections.get(id);
        section.pieces.push(piece); section.area += Math.abs(area(piece));
      }
    }
  }
  return [...sections.values()].filter(section => distanceToSidewalkSection(section, state) <= reach);
}

/** Build actual boundary pieces over currently loaded terrain, never height zero. */
export function buildSidewalkGeometry(section, getHeight, { closeBottom = false, photoUv = null } = {}) {
  const position = []; const normal = []; const st = []; const indices = []; const heights = new Map();
  const originHeight = getHeight(section.longitude, section.latitude);
  if (!Number.isFinite(originHeight)) return null;
  const terrainSamples = [{ longitude: section.longitude, latitude: section.latitude, height: originHeight }];
  const frame = Transforms.eastNorthUpToFixedFrame(Cartesian3.fromDegrees(section.longitude, section.latitude, originHeight));
  const inverse = Matrix4.inverseTransformation(frame, new Matrix4());
  const local = (point, top) => {
    const key = `${point[0]}:${point[1]}`; const [longitude, latitude] = toGeographic(point);
    if (!heights.has(key)) {
      const height = getHeight(longitude, latitude);
      heights.set(key, height); terrainSamples.push({ longitude, latitude, height });
    }
    const height = heights.get(key);
    if (!Number.isFinite(height)) return null;
    return Matrix4.multiplyByPoint(inverse, Cartesian3.fromDegrees(longitude, latitude, height + (top ? DEPTH : 0)), new Cartesian3());
  };
  const addTriangle = (a, b, c, coordinates = null) => {
    const n = Cartesian3.cross(Cartesian3.subtract(b, a, new Cartesian3()), Cartesian3.subtract(c, a, new Cartesian3()), new Cartesian3());
    if (Cartesian3.magnitudeSquared(n) < 1e-14) return;
    Cartesian3.normalize(n, n);
    const start = position.length / 3;
    for (const [index, p] of [a, b, c].entries()) {
      position.push(p.x, p.y, p.z); normal.push(n.x, n.y, n.z);
      if (photoUv) st.push(...(coordinates?.[index] ?? [-1, -1]));
    }
    indices.push(start, start + 1, start + 2);
  };
  for (const piece of section.pieces) {
    const top = piece.map(point => local(point, true)); const bottom = piece.map(point => local(point, false));
    if (top.some(p => !p) || bottom.some(p => !p)) return null;
    const coordinates = photoUv ? piece.map(point => photoUv(...toGeographic(point))) : null;
    for (let i = 1; i < top.length - 1; i++) addTriangle(top[0], top[i], top[i + 1],
      coordinates ? [coordinates[0], coordinates[i], coordinates[i + 1]] : null);
    if (closeBottom) for (let i = 1; i < bottom.length - 1; i++) addTriangle(bottom[0], bottom[i + 1], bottom[i]);
    for (let i = 0; i < top.length; i++) {
      const j = (i + 1) % top.length;
      addTriangle(top[i], bottom[i], bottom[j]); addTriangle(top[i], bottom[j], top[j]);
    }
  }
  if (!indices.length) return null;
  section.baseHeight = originHeight;
  return { modelMatrix: frame, baseHeight: originHeight, terrainSamples, geometry: new Geometry({
    attributes: {
      position: new GeometryAttribute({ componentDatatype: ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: new Float64Array(position) }),
      normal: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 3, values: new Float32Array(normal) }),
      ...(photoUv ? { st: new GeometryAttribute({ componentDatatype: ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: new Float32Array(st) }) } : {}),
    }, indices: position.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices),
    primitiveType: PrimitiveType.TRIANGLES, boundingSphere: BoundingSphere.fromVertices(position),
  }) };
}

export function createSidewalkPhotoMaterial(canvas) {
  const material = new Material({ translucent: false, fabric: {
        // Fabric definitions are deeply cloned with `new value.constructor()`.
        // DOM canvases cannot be constructed that way. Assign the actual
        // canvas to the runtime uniform after the clonable template is built.
        type: 'PhiladelphiaSidewalkSourcePhoto', uniforms: { sourcePhoto: Material.DefaultImageId, edgeColor: Color.fromCssColorString('#9d9b95') },
        source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
          czm_material material = czm_getDefaultMaterial(materialInput);
          material.diffuse = materialInput.st.x < 0.0 ? edgeColor.rgb : texture(sourcePhoto, materialInput.st).rgb;
          material.alpha = 1.0;
          return material;
        }`,
  } });
  material.uniforms.sourcePhoto = canvas;
  return material;
}

function renderer(viewer, { photoPool = null, onStatus = () => {} } = {}) {
  let renderGeneration = 0;
  const photos = photoPool ?? createSidewalkPhotoAtlasPool({
    onError: error => {
      // At most one report per failed atlas (two builders), followed by the
      // pool's 30-second cooldown. Keep the real cause available for diagnosis.
      console.warn('Philadelphia sidewalk photo atlas failed:', error);
      onStatus('Sidewalk photographs are temporarily unavailable. The original ground image remains visible.', 'warning');
    },
    createResource: canvas => {
      const material = createSidewalkPhotoMaterial(canvas);
      try {
        // Cesium 1.145 stages canvas images on its first Material.update and
        // uploads them on the second. Prepare the shared texture before any
        // visible slab is created so a white default texture never covers it.
        material.update(viewer.scene.context); material.update(viewer.scene.context);
        return material;
      } catch (error) { material.destroy(); throw error; }
    },
    destroyResource: material => { if (!material.isDestroyed()) material.destroy(); },
  });
  const render = async section => {
    const run = renderGeneration;
    const photo = await photos.acquire(section.pieces.flat().map(toGeographic));
    if (run !== renderGeneration) { photo.release(); throw new DOMException('Sidewalk render cancelled.', 'AbortError'); }
    const getHeight = (lon, lat) => viewer.scene.globe?.getHeight(Cartographic.fromDegrees(lon, lat));
    let built;
    try { built = buildSidewalkGeometry(section, getHeight, { photoUv: photo.uv }); }
    catch (error) { photo.release(); throw error; }
    if (!built) { photo.release(); return null; }
    const addPrimitive = (geometry, show) => viewer.scene.primitives.add(new Primitive({
      geometryInstances: new GeometryInstance({ geometry: geometry.geometry }),
      // Source photographs already include illumination. Avoid tinting or
      // adding another diffuse-light pass to the observed sidewalk appearance.
      modelMatrix: geometry.modelMatrix, appearance: new MaterialAppearance({ material: photo.resource,
        materialSupport: MaterialAppearance.MaterialSupport.TEXTURED, flat: true, translucent: false, closed: false }),
      asynchronous: false, allowPicking: false, shadows: ShadowMode.RECEIVE_ONLY, show,
    }));
    let primitive;
    try { primitive = addPrimitive(built, true); }
    catch (error) { photo.release(); throw error; }
    let disposed = false; let visible = true; let pending = null; let sampleCursor = 0;
    let removePendingUpdate = null;
    function swapReady() {
      if (disposed || !visible || !pending?.primitive.ready) return;
      const old = primitive;
      primitive = pending.primitive; built = pending.built; pending = null;
      removePendingUpdate?.(); removePendingUpdate = null;
      primitive.show = visible; section.baseHeight = built.baseHeight; sampleCursor = 0;
      viewer.scene.primitives.remove(old); viewer.scene.requestRender();
    }
    function refreshTerrain() {
      if (disposed || !visible || !primitive.ready) return;
      if (pending) {
        // Cesium prepares Primitive geometry before its show gate. Keep the
        // old slab until the hidden replacement is ready, then swap together.
        swapReady();
        return;
      }
      let changed = false;
      const count = Math.min(16, built.terrainSamples.length);
      for (let i = 0; i < count; i++) {
        const sample = built.terrainSamples[sampleCursor];
        sampleCursor = (sampleCursor + 1) % built.terrainSamples.length;
        const height = getHeight(sample.longitude, sample.latitude);
        if (Number.isFinite(height) && Math.abs(height - sample.height) > 0.04) { changed = true; break; }
      }
      if (!changed) return;
      // A fresh full vertex sample preserves changing slope, not just a single
      // vertical offset. Missing terrain retains the previous valid surface.
      const replacement = buildSidewalkGeometry({ ...section }, getHeight, { photoUv: photo.uv });
      if (replacement) {
        pending = { primitive: addPrimitive(replacement, false), built: replacement };
        // Only pending replacements need a readiness check each frame. Terrain
        // probes remain on the bounded, slower controller schedule.
        removePendingUpdate = viewer.scene.preUpdate?.addEventListener(swapReady) ?? null;
        viewer.scene.requestRender();
      }
    }
    return { get ready() { return !disposed && primitive.ready === true; },
      refreshTerrain,
      show(value) {
        if (disposed) return;
        visible = Boolean(value); primitive.show = visible;
        if (!visible && pending) {
          removePendingUpdate?.(); removePendingUpdate = null;
          viewer.scene.primitives.remove(pending.primitive); pending = null;
        }
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        removePendingUpdate?.(); removePendingUpdate = null;
        if (pending) viewer.scene.primitives.remove(pending.primitive);
        pending = null; viewer.scene.primitives.remove(primitive); photo.release();
      } };
  };
  render.setVisible = value => { if (!value) { renderGeneration++; photos.cancelPending(); } };
  render.clear = () => { renderGeneration++; photos.clear(); };
  render.destroy = () => { renderGeneration++; photos.destroy(); };
  render.getPhotoStats = () => photos.getStats();
  return render;
}

export function sidewalkQueryUrl(state) {
  const deltaLon = WINDOW / METRES_LON; const deltaLat = WINDOW / METRES_LAT;
  return `${SIDEWALK_SOURCE}?${new URLSearchParams({ f: 'json', where: 'FCODE=2210',
    geometry: [state.longitude - deltaLon, state.latitude - deltaLat, state.longitude + deltaLon, state.latitude + deltaLat].join(','),
    geometryType: 'esriGeometryEnvelope', spatialRel: 'esriSpatialRelIntersects', inSR: '4326', outSR: '4326',
    outFields: 'OBJECTID,OBJECTID_1,FCODE,Shape_Area', returnGeometry: 'true', resultRecordCount: String(RECORD_LIMIT),
    orderByFields: 'OBJECTID_1' })}`;
}

/** One bounded public query at a time, nearest 96 ready sections within 90 m. */
export function createSidewalkSurfaces(viewer, { onStatus = () => {}, onDestroyed = () => {}, renderSection = null, photoPool = null } = {}) {
  const render = renderSection ?? renderer(viewer, { photoPool, onStatus });
  const records = new Map(); const removed = new Set();
  let center = null; let loadedKey = null; let active = null; let generation = 0;
  let visible = true; let destroyed = false; let nextRequest = 0; let nextDisplay = 0; let clock = 0;
  let nextTerrain = 0; let terrainCursor = 0;
  let limited = false; let sourceFeatures = 0; let nextWarning = 0;
  const requestRender = () => viewer.scene.requestRender();
  const warn = message => { if (Date.now() >= nextWarning) { nextWarning = Date.now() + 15000; onStatus(message, 'warning'); } };
  const dispose = record => { record.version++; record.handle?.dispose(); record.handle = null; record.rendering = false; };
  const isCurrent = job => !destroyed && active === job && generation === job.generation && !job.controller.signal.aborted;
  function refresh() {
    if (!visible || !center || destroyed) return;
    let starts = 0;
    for (const record of [...records.values()].sort((a, b) => distanceToSidewalkSection(a.object, center) - distanceToSidewalkSection(b.object, center))) {
      if (distanceToSidewalkSection(record.object, center) > RADIUS) { if (record.handle || record.rendering) dispose(record); continue; }
      if (removed.has(record.object.id) || record.handle || record.rendering || starts >= 4 || record.retryAt > Date.now()) continue;
      starts++; record.rendering = true;
      const version = ++record.version; const run = generation;
      void (async () => {
        try {
          const handle = await render(record.object);
          if (destroyed || run !== generation || records.get(record.object.id) !== record || version !== record.version
              || !visible || !center || distanceToSidewalkSection(record.object, center) > RADIUS) { handle?.dispose(); return; }
          record.handle = handle;
          if (handle) { handle.show(true); requestRender(); }
          else record.retryAt = Date.now() + 1500;
        } catch (error) {
          if (destroyed || run !== generation || records.get(record.object.id) !== record
              || version !== record.version || !visible) return;
          if (error.name === 'AbortError') { record.retryAt = 0; return; }
          record.retryAt = Date.now() + 60000;
          warn('A mapped sidewalk surface could not be displayed. It will retry after a pause.');
        } finally { if (version === record.version) record.rendering = false; }
      })();
    }
  }
  async function load(job) {
    const timeout = setTimeout(() => job.controller.abort(), 12000);
    try {
      const response = await fetch(sidewalkQueryUrl(job.center), { signal: job.controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error || !Array.isArray(data.features)) throw new Error('Invalid sidewalk response');
      if (!isCurrent(job)) return;
      const candidates = new Map(); let vertices = 0; let processed = 0;
      limited = data.exceededTransferLimit === true || data.features.length >= RECORD_LIMIT;
      sourceFeatures = data.features.length;
      for (const feature of data.features.slice(0, RECORD_LIMIT)) {
        // Release the UI between small batches. The real spawn response has
        // thousands of vertices; this conversion is not part of each frame.
        if (processed++ > 0 && processed % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
        if (!isCurrent(job)) return;
        vertices += feature.geometry?.rings?.reduce((count, ring) => count + ring.length, 0) ?? 0;
        if (vertices > 60000) { limited = true; break; }
        const surface = parseSidewalkSurface(feature);
        if (!surface) { limited = true; continue; }
        for (const object of sectionSidewalkSurface(surface, job.center)) {
          if (!removed.has(object.id)) candidates.set(object.id, object);
        }
      }
      if (!isCurrent(job)) return;
      const sorted = [...candidates.values()].sort((a, b) => distanceToSidewalkSection(a, center) - distanceToSidewalkSection(b, center));
      limited ||= sorted.length > LIMIT;
      const selected = new Map(sorted.slice(0, LIMIT).map(object => [object.id, object]));
      for (const [id, record] of records) if (!selected.has(id)) { dispose(record); records.delete(id); }
      for (const [id, object] of selected) if (!records.has(id)) records.set(id, { object, handle: null, version: 0, rendering: false, retryAt: 0 });
      loadedKey = job.key; nextRequest = Date.now() + 2500; refresh();
    } catch {
      if (destroyed || generation !== job.generation || active !== job || !visible) return;
      nextRequest = Date.now() + 60000;
      warn('Public sidewalk polygons are temporarily unavailable. Nearby surface coverage is incomplete.');
    } finally { clearTimeout(timeout); if (active === job) active = null; }
  }
  function update(longitude, latitude) {
    if (destroyed || !visible) return;
    if (!validPoint([longitude, latitude])) { clear(); return; }
    center = { longitude, latitude };
    const [x, y] = toLocal([longitude, latitude]).map(value => Math.floor(value / 40));
    const key = `${x}:${y}`;
    if (active || loadedKey === key || Date.now() < nextRequest) return;
    const [lon, lat] = toGeographic([(x + 0.5) * 40, (y + 0.5) * 40]);
    active = { key, center: { longitude: lon, latitude: lat }, generation, controller: new AbortController() };
    void load(active);
  }
  function tryDestroy(id) {
    const record = records.get(String(id));
    if (!visible || destroyed || !record || !record.handle?.ready || removed.has(id)) return { destroyed: false, object: record?.object ?? null };
    removed.add(record.object.id); dispose(record); onDestroyed(record.object); requestRender();
    return { destroyed: true, object: record.object };
  }
  function damageNearest(state, range = 4) {
    if (!visible || destroyed || !validPoint([state?.longitude, state?.latitude]) || !Number.isFinite(range) || range <= 0 || range > 20) return { destroyed: false, object: null };
    let nearest = null; let distance = range;
    for (const record of records.values()) {
      if (!record.handle?.ready || removed.has(record.object.id)
          || (Number.isFinite(state.height) && Math.abs(state.height - record.object.baseHeight) > 4)) continue;
      const next = distanceToSidewalkSection(record.object, state);
      if (next <= distance) { distance = next; nearest = record.object; }
    }
    return nearest ? tryDestroy(nearest.id) : { destroyed: false, object: null };
  }
  function tick(dt) {
    if (!visible || destroyed || !Number.isFinite(dt) || dt <= 0) return;
    clock += Math.min(0.1, dt);
    if (clock >= nextDisplay) { nextDisplay = clock + 0.25; refresh(); }
    if (clock >= nextTerrain) {
      nextTerrain = clock + 0.5;
      const candidates = [...records.values()].filter(record => record.handle?.ready && !removed.has(record.object.id));
      // Round-robin sampling prevents either a per-frame scan or starvation of
      // farther sections. Each handle inspects at most sixteen sample heights.
      for (let i = 0; i < Math.min(4, candidates.length); i++) {
        terrainCursor %= candidates.length;
        const record = candidates[terrainCursor++];
        try { record.handle.refreshTerrain?.(); }
        catch { warn('A mapped sidewalk could not follow updated terrain. Its previous surface is retained.'); }
      }
    }
  }
  function setVisible(value) {
    if (destroyed) return;
    visible = Boolean(value);
    if (!visible) { active?.controller.abort(); active = null; }
    for (const record of records.values()) { if (record.rendering) dispose(record); record.handle?.show(visible); }
    render.setVisible?.(visible);
    if (visible) { nextRequest = 0; refresh(); }
    requestRender();
  }
  function clear() {
    generation++; active?.controller.abort(); active = null;
    for (const record of records.values()) dispose(record);
    render.clear?.();
    records.clear(); removed.clear(); center = null; loadedKey = null; nextRequest = 0; limited = false; sourceFeatures = 0;
    nextTerrain = 0; terrainCursor = 0;
    requestRender();
  }
  function destroy() { if (!destroyed) { clear(); render.destroy?.(); destroyed = true; } }
  function getStats() { return { count: records.size, rendered: [...records.values()].filter(r => visible && r.handle?.ready).length,
    destroyed: removed.size, loading: Boolean(active), visible, limited, sourceFeatures, sectionSize: SECTION, radius: RADIUS, limit: LIMIT,
    photographs: render.getPhotoStats?.() ?? null }; }
  return { update, tick, setVisible, clear, destroy, tryDestroy, damageNearest, getStats,
    getCollision: () => ({ collides: false, object: null }) };
}
