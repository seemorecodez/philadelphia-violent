import {
  Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute, GeometryInstance,
  PerInstanceColorAppearance, PolygonGeometry, PolygonHierarchy, Primitive,
  Request, RequestType, ShowGeometryInstanceAttribute, sampleTerrain,
} from 'cesium';

// City source metadata states all measurements are feet; approx_hgt is the
// supplied approximate height, not a surveyed facade or detailed roof model.
// https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Building_Footprints/FeatureServer/0
// base_elevation is retained in source attributes but not used: its vertical
// datum is unverified. The configured public terrain supplies display elevation.
const QUERY = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Building_Footprints/FeatureServer/0/query';
const DOWNTOWN = [-75.190418721, 39.940180742, -75.133563703, 39.969870911];
const FEET_TO_METRES = 0.3048;
const CELL_LATITUDE = 600 / 111320;
const CELL_LONGITUDE = 600 / (111320 * Math.cos(40 * Math.PI / 180));
const PAGE_SIZE = 2000;
const MAX_PAGES = 4; // A hard 8,000-record per-cell resource bound, reported if reached.
const MAX_CONCURRENT_CELLS = 2;
const TERRAIN_LEVEL = 14;
const FAILURE_COOLDOWN = 5 * 60 * 1000;
const COLOUR = Color.fromCssColorString('#b5afa1');
const BIN_LONGITUDE = CELL_LONGITUDE / 12;
const BIN_LATITUDE = CELL_LATITUDE / 12;
const HALF_LENGTH = 2.25;
const HALF_WIDTH = 2.193 / 2;
const COLLISION_MARGIN = 0.025;
const MAX_DESTRUCTIBLE_HEIGHT_FEET = 20;
const validHeightFeet = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

function cellAt(longitude, latitude) {
  return [Math.floor(longitude / CELL_LONGITUDE), Math.floor(latitude / CELL_LATITUDE)];
}
const cellKey = (x, y) => `${x}:${y}`;
const insideDowntown = (x, y) => x >= DOWNTOWN[0] && x <= DOWNTOWN[2]
  && y >= DOWNTOWN[1] && y <= DOWNTOWN[3];

function featureDetails(feature) {
  const geometry = feature?.geometry;
  const properties = feature?.properties;
  const id = properties?.objectid ?? feature?.id;
  const height = properties?.approx_hgt;
  const heightFeet = validHeightFeet(height);
  const maxHeightFeet = validHeightFeet(properties?.max_hgt);
  if (id === undefined || id === null) return null;
  const polygons = geometry?.type === 'Polygon' ? [geometry.coordinates]
    : geometry?.type === 'MultiPolygon' ? geometry.coordinates : null;
  if (!Array.isArray(polygons) || polygons.length === 0) return null;
  let west = Infinity; let south = Infinity; let east = -Infinity; let north = -Infinity;
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !Array.isArray(polygon[0]) || polygon[0].length < 4) return null;
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      const unique = new Set();
      for (const point of ring) {
        if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])
          || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null;
        unique.add(`${point[0]},${point[1]}`);
        west = Math.min(west, point[0]); east = Math.max(east, point[0]);
        south = Math.min(south, point[1]); north = Math.max(north, point[1]);
      }
      if (unique.size < 3) return null;
    }
  }
  return {
    id: String(id), polygons, longitude: (west + east) / 2, latitude: (south + north) / 2,
    buildingName: String(properties.building_name ?? '').trim(),
    bounds: [west, south, east, north],
    // A real footprint still blocks driving when its supplied height is absent.
    // Rendering requires a valid supplied height; no default extrusion is used.
    height: heightFeet === null ? null : heightFeet * FEET_TO_METRES,
    heightFeet, maxHeightFeet,
    heightEligible: heightFeet !== null && maxHeightFeet !== null
      && heightFeet <= MAX_DESTRUCTIBLE_HEIGHT_FEET && maxHeightFeet <= MAX_DESTRUCTIBLE_HEIGHT_FEET,
    baseHeight: null,
    // Preserve original source attribute alongside the rendered building ID.
    sourceBaseElevationFeet: properties.base_elevation,
  };
}

const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
function segmentsIntersect(a, b, c, d) {
  const epsilon = 1e-7;
  const on = (p, q, r) => Math.abs(cross(p, q, r)) <= epsilon
    && r[0] >= Math.min(p[0], q[0]) - epsilon && r[0] <= Math.max(p[0], q[0]) + epsilon
    && r[1] >= Math.min(p[1], q[1]) - epsilon && r[1] <= Math.max(p[1], q[1]) + epsilon;
  const abC = cross(a, b, c); const abD = cross(a, b, d);
  const cdA = cross(c, d, a); const cdB = cross(c, d, b);
  return ((abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0))
    || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}
function inRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]; const b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  function half(sequence) {
    const result = [];
    for (const point of sequence) {
      while (result.length > 1 && cross(result[result.length - 2], result[result.length - 1], point) <= 0) result.pop();
      result.push(point);
    }
    result.pop(); return result;
  }
  return [...half(sorted), ...half(sorted.slice().reverse())];
}
function intersectsFootprint(hull, polygons, project) {
  for (const polygon of polygons) {
    const rings = polygon.map(ring => ring.map(project));
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        for (let j = 0; j < hull.length; j++) {
          if (segmentsIntersect(ring[i], ring[(i + 1) % ring.length], hull[j], hull[(j + 1) % hull.length])) return true;
        }
      }
    }
    // With no boundary crossings, either shape is wholly contained. A car
    // inside a courtyard hole is free; touching a hole boundary blocks above.
    if ((inRing(hull[0], rings[0]) && !rings.slice(1).some(ring => inRing(hull[0], ring)))
      || inRing(rings[0][0], hull)) return true;
  }
  return false;
}

function collisionShape(shape) {
  const length = shape?.length ?? HALF_LENGTH * 2;
  const width = shape?.width ?? HALF_WIDTH * 2;
  if (![length, width].every(value => Number.isFinite(value) && value > 0 && value <= 20)) return null;
  return { halfLength: length / 2, halfWidth: width / 2 };
}

function sweptCar(from, to, shape) {
  const dimensions = collisionShape(shape);
  if (!dimensions) return null;
  const { halfLength, halfWidth } = dimensions;
  const scaleX = 111320 * Math.cos(from.latitude * Math.PI / 180);
  const scaleY = 111320;
  const dx = (to.longitude - from.longitude) * scaleX;
  const dy = (to.latitude - from.latitude) * scaleY;
  const turn = Math.atan2(Math.sin(to.heading - from.heading), Math.cos(to.heading - from.heading));
  // Normal simulation steps are below 2 m. Fail closed for a teleport rather
  // than traversing an unbounded number of index bins in a driving-frame check.
  if (Math.hypot(dx, dy) > 50) return null;
  const steps = Math.max(1, Math.ceil(Math.abs(turn) / (Math.PI / 60)));
  const points = [];
  for (let step = 0; step <= steps; step++) {
    const t = step / steps; const heading = from.heading + turn * t;
    const sin = Math.sin(heading); const cos = Math.cos(heading);
    for (const front of [-1, 1]) for (const right of [-1, 1]) {
      points.push([
        dx * t + sin * front * (halfLength + COLLISION_MARGIN) + cos * right * (halfWidth + COLLISION_MARGIN),
        dy * t + cos * front * (halfLength + COLLISION_MARGIN) - sin * right * (halfWidth + COLLISION_MARGIN),
      ]);
    }
  }
  // The hull includes swept corner segments and the full bumper/side faces,
  // catching thin walls and enclosed small footprints between endpoint poses.
  // Three-degree rotation subdivisions plus 2.5 cm margin cover corner arcs.
  const hull = convexHull(points);
  const xs = hull.map(p => p[0]); const ys = hull.map(p => p[1]);
  return {
    hull,
    bounds: [from.longitude + Math.min(...xs) / scaleX, from.latitude + Math.min(...ys) / scaleY,
      from.longitude + Math.max(...xs) / scaleX, from.latitude + Math.max(...ys) / scaleY],
    project: point => [(point[0] - from.longitude) * scaleX, (point[1] - from.latitude) * scaleY],
  };
}

function hierarchy(rings) {
  function positions(ring) {
    const coordinates = ring.slice();
    const first = coordinates[0]; const last = coordinates[coordinates.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) coordinates.pop();
    return Cartesian3.fromDegreesArray(coordinates.flatMap(point => [point[0], point[1]]));
  }
  return new PolygonHierarchy(positions(rings[0]), rings.slice(1).map(ring => new PolygonHierarchy(positions(ring))));
}

/**
 * Public footprint streaming: at most nine approximately 600 m cells, two cell
 * jobs, four 2,000-feature pages each. Ownership by each footprint's bounding-box
 * centre prevents duplicate rendering. Collision retains every real footprint
 * intersecting each query cell, including downtown and footprints without height.
 * Missing/invalid heights and downtown gaps are left empty by this renderer.
 * Ground is sampled at terrain level 14 at one representative point per building;
 * this is approximate display anchoring, not a surveyed vertical transformation.
 */
export function createPublicBuildings(viewer, { onStatus = () => {}, details = null } = {}) {
  const cells = new Map();
  const failures = new Map();
  // Session removals survive streaming-cell eviction, but an explicit clear or
  // disconnect restores source buildings. No permanent source records change.
  const removedFeatures = new Map();
  let queue = [];
  let active = 0;
  let destroyed = false;
  let visible = true;
  let lastWarningAt = -Infinity;
  let detailCenter = null;
  function refreshDetails() {
    if (!details || !detailCenter) return;
    const features=[];
    for(const cell of cells.values())for(const entry of cell.rendered.values())if(!removedFeatures.has(entry.feature.id))features.push(entry.feature);
    details.update(features,...detailCenter);
  }

  function warn(message) {
    const now = Date.now();
    if (now - lastWarningAt < 30_000) return;
    lastWarningAt = now;
    onStatus(message, 'warning');
  }
  const current = cell => !destroyed && cells.get(cell.key) === cell && !cell.controller.signal.aborted;

  function remove(cell) {
    cell.controller.abort();
    for (const request of cell.terrainRequests) request.cancel();
    cell.terrainRequests.clear();
    if (cell.primitive) viewer.scene.primitives.remove(cell.primitive);
    cells.delete(cell.key);
  }

  async function fetchCell(cell) {
    const features = new Map();
    let complete = false;
    let invalidGeometry = false;
    for (let page = 0; page < MAX_PAGES && current(cell); page++) {
      const params = new URLSearchParams({
        f: 'geojson', where: '1=1',
        geometry: JSON.stringify({
          xmin: cell.x * CELL_LONGITUDE, ymin: cell.y * CELL_LATITUDE,
          xmax: (cell.x + 1) * CELL_LONGITUDE, ymax: (cell.y + 1) * CELL_LATITUDE,
          spatialReference: { wkid: 4326 },
        }),
        geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
        spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true',
        outFields: 'objectid,building_name,base_elevation,approx_hgt,max_hgt',
        orderByFields: 'objectid ASC', resultOffset: String(page * PAGE_SIZE),
        resultRecordCount: String(PAGE_SIZE),
      });
      const response = await fetch(`${QUERY}?${params}`, {
        signal: cell.controller.signal, credentials: 'omit',
      });
      if (!response.ok) throw new Error(`Building service HTTP ${response.status}`);
      const data = await response.json();
      if (data.error || data.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
        throw new Error('Building service returned an invalid feature collection');
      }
      if (!current(cell)) return [];
      for (const feature of data.features) {
        const details = featureDetails(feature);
        if (!details) { invalidGeometry = true; continue; }
        features.set(details.id, details);
      }
      const more = data.exceededTransferLimit === true || data.properties?.exceededTransferLimit === true;
      if (data.features.length < PAGE_SIZE && !more) { complete = true; break; }
      if (page === MAX_PAGES - 1) {
        warn('A dense building cell reached its data limit. Building coverage may be incomplete.');
      }
    }
    if (current(cell)) {
      cell.features = [...features.values()];
      // 50 m bins bound per-frame candidate work, even in dense row-house cells.
      for (const feature of cell.features) {
        const [w, s, e, n] = feature.bounds;
        const minX = Math.max(cell.x * 12, Math.floor(w / BIN_LONGITUDE));
        const maxX = Math.min(cell.x * 12 + 11, Math.floor(e / BIN_LONGITUDE));
        const minY = Math.max(cell.y * 12, Math.floor(s / BIN_LATITUDE));
        const maxY = Math.min(cell.y * 12 + 11, Math.floor(n / BIN_LATITUDE));
        for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
          const key = cellKey(x, y);
          if (!cell.collisionIndex.has(key)) cell.collisionIndex.set(key, []);
          cell.collisionIndex.get(key).push(feature);
        }
      }
      // A complete fetch releases collision independently of terrain/GPU work.
      // Truncated or malformed data never becomes known-safe driving coverage.
      cell.collisionReady = complete && !invalidGeometry;
      if (invalidGeometry) warn('Some building footprints are invalid. Driving waits for complete collision data in this area.');
    }
    return [...features.values()];
  }

  async function addCell(cell) {
    const sourceFeatures = await fetchCell(cell);
    const features = sourceFeatures.filter(feature => {
      const [ownerX, ownerY] = cellAt(feature.longitude, feature.latitude);
      return !removedFeatures.has(feature.id) && feature.height !== null && !insideDowntown(feature.longitude, feature.latitude)
        && ownerX === cell.x && ownerY === cell.y;
    });
    if (!current(cell) || features.length === 0) return;
    const provider = viewer.terrainProvider;
    const positions = features.map(feature => {
      const position = Cartographic.fromDegrees(feature.longitude, feature.latitude);
      position.height = undefined; // Never let an unqueried position become a zero-height fallback.
      return position;
    });
    // sampleTerrain's public API has no AbortSignal. Forward cancelable Request
    // objects for best-effort cancellation where the provider supports them.
    // CustomHeightmapTerrainProvider ignores this Request argument; the public
    // terrain owner's dispose() cancels its downloads on disconnect instead.
    // Evicted/cleared results cannot render because cell identity is rechecked.
    const samplingProvider = {
      tilingScheme: provider.tilingScheme,
      requestTileGeometry(x, y, level) {
        if (!current(cell)) return Promise.reject(new Error('Building cell cancelled'));
        const request = new Request({ throttle: false, throttleByServer: false, type: RequestType.TERRAIN });
        cell.terrainRequests.add(request);
        let result;
        try { result = provider.requestTileGeometry(x, y, level, request); }
        catch (error) { cell.terrainRequests.delete(request); return Promise.reject(error); }
        if (!result) { cell.terrainRequests.delete(request); return undefined; }
        return Promise.resolve(result).finally(() => cell.terrainRequests.delete(request));
      },
    };
    await sampleTerrain(samplingProvider, TERRAIN_LEVEL, positions, false);
    if (!current(cell)) return;
    const instances = [];
    let missingGround = 0;
    features.forEach((feature, index) => {
      const ground = positions[index].height;
      if (!Number.isFinite(ground)) { missingGround++; return; }
      if (removedFeatures.has(feature.id)) return;
      feature.baseHeight = ground;
      const instanceIds = [];
      for (let part = 0; part < feature.polygons.length; part++) {
        const id = { kind: 'municipal-building', objectid: feature.id, part, sourceBaseElevationFeet: feature.sourceBaseElevationFeet };
        instanceIds.push(id);
        instances.push(new GeometryInstance({
          id,
          geometry: new PolygonGeometry({
            polygonHierarchy: hierarchy(feature.polygons[part]), height: ground,
            extrudedHeight: ground + feature.height, closeTop: true, closeBottom: true,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: { color: ColorGeometryInstanceAttribute.fromColor(COLOUR), show: new ShowGeometryInstanceAttribute(true) },
        }));
      }
      cell.rendered.set(feature.id, { feature, instanceIds });
    });
    if (missingGround) warn(`${missingGround} municipal buildings omitted because ground elevation was unavailable.`);
    if (!current(cell) || instances.length === 0) return;
    cell.primitive = viewer.scene.primitives.add(new Primitive({
      geometryInstances: instances, asynchronous: true, allowPicking: true, show: visible,
      appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
    }));
    refreshDetails();
    viewer.scene.requestRender();
  }

  function pump() {
    while (!destroyed && active < MAX_CONCURRENT_CELLS && queue.length) {
      const cell = queue.shift();
      if (!current(cell)) continue;
      active++;
      cell.state = 'loading';
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        cell.controller.abort();
        for (const request of cell.terrainRequests) request.cancel();
      }, 45_000);
      void addCell(cell).then(() => {
        if (timedOut && cells.get(cell.key) === cell) throw new Error('Building cell timed out');
        if (current(cell)) cell.state = 'ready';
      }).catch(error => {
        if (cells.get(cell.key) !== cell || destroyed || (cell.controller.signal.aborted && !timedOut)) return;
        cell.state = 'failed';
        console.warn('Philadelphia building cell failed:',error);
        failures.set(cell.key, Date.now() + FAILURE_COOLDOWN);
        while (failures.size > 64) failures.delete(failures.keys().next().value);
        warn('Some municipal buildings could not load. This area will remain incomplete; no replacement buildings were generated.');
      }).finally(() => {
        clearTimeout(timeout);
        active--;
        pump();
      });
    }
  }

  function update(longitude, latitude) {
    if (destroyed || !Number.isFinite(longitude) || !Number.isFinite(latitude)
      || Math.abs(longitude) > 180 || Math.abs(latitude) > 85) return;
    // Bound public-service requests to Philadelphia even when the map camera
    // is freely orbited or a caller supplies a distant location.
    if (longitude < -75.31 || longitude > -74.94 || latitude < 39.85 || latitude > 40.15) return;
    detailCenter = [longitude, latitude];
    const [x, y] = cellAt(longitude, latitude);
    const desired = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) desired.push({ x: x + dx, y: y + dy, distance: dx * dx + dy * dy });
    }
    desired.sort((a, b) => a.distance - b.distance);
    const keys = new Set(desired.map(cell => cellKey(cell.x, cell.y)));
    for (const cell of cells.values()) if (!keys.has(cell.key)) remove(cell);
    queue = queue.filter(current);
    for (const position of desired) {
      const key = cellKey(position.x, position.y);
      if (cells.has(key) || (failures.get(key) ?? 0) > Date.now()) continue;
      const cell = {
        ...position, key, state: 'queued', controller: new AbortController(),
        terrainRequests: new Set(), primitive: null, features: [],
        collisionReady: false, collisionIndex: new Map(), rendered: new Map(),
      };
      cells.set(key, cell);
      queue.push(cell);
    }
    pump();
    refreshDetails();
  }

  function clear() {
    queue = [];
    for (const cell of cells.values()) remove(cell);
    failures.clear(); // Explicit disconnect/retry releases the failure cooldown.
    removedFeatures.clear();
    details?.clear();
    viewer.scene.requestRender();
  }

  function setVisible(value) {
    visible = Boolean(value);
    for (const cell of cells.values()) if (cell.primitive) cell.primitive.show = visible;
    details?.setVisible(visible);
    viewer.scene.requestRender();
  }

  function cellsCover(bounds) {
    const [minX, minY] = cellAt(bounds[0], bounds[1]);
    const [maxX, maxY] = cellAt(bounds[2], bounds[3]);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) {
      if (!cells.get(cellKey(x, y))?.collisionReady) return false;
    }
    return !destroyed;
  }

  function hasCollisionData(longitude, latitude, shape) {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 85) return false;
    const dimensions = collisionShape(shape);
    if (!dimensions) return false;
    const radius = Math.hypot(dimensions.halfLength + COLLISION_MARGIN, dimensions.halfWidth + COLLISION_MARGIN);
    const x = radius / (111320 * Math.cos(latitude * Math.PI / 180));
    const y = radius / 111320;
    return cellsCover([longitude - x, latitude - y, longitude + x, latitude + y]);
  }

  function renderedFeature(id) {
    for (const cell of cells.values()) {
      const entry = cell.rendered.get(id);
      if (entry && cell.primitive) return { ...entry, primitive: cell.primitive };
    }
    return null;
  }

  function buildingDetails(feature, extra = {}) {
    const rendered = renderedFeature(feature.id);
    const source = rendered?.feature ?? feature;
    return {
      ...source,
      destroyable: source.heightEligible && !removedFeatures.has(source.id)
        && !insideDowntown(source.longitude, source.latitude) && rendered?.primitive.ready === true,
      ...extra,
    };
  }

  function candidates(bounds) {
    const [w, s, e, n] = bounds;
    const seen = new Set();
    const result = [];
    for (let x = Math.floor(w / BIN_LONGITUDE); x <= Math.floor(e / BIN_LONGITUDE); x++) {
      for (let y = Math.floor(s / BIN_LATITUDE); y <= Math.floor(n / BIN_LATITUDE); y++) {
        const cell = cells.get(cellKey(Math.floor(x / 12), Math.floor(y / 12)));
        for (const feature of cell?.collisionIndex.get(cellKey(x, y)) ?? []) {
          if (seen.has(feature.id) || removedFeatures.has(feature.id)) continue;
          seen.add(feature.id);
          if (overlaps(bounds, feature.bounds)) result.push(feature);
        }
      }
    }
    return result;
  }

  function getCollision(fromState, toState, shape) {
    const unknown = reason => ({ collides: true, knownCoverage: false, building: null, feature: null, reason });
    if (![fromState, toState].every(state => state && ['longitude', 'latitude', 'heading'].every(key => Number.isFinite(state[key]))
      && Math.abs(state.latitude) <= 85 && Math.abs(state.longitude) <= 180)) return unknown('invalid-state');
    const sweep = sweptCar(fromState, toState, shape);
    if (!sweep) return unknown('invalid-sweep');
    if (!cellsCover(sweep.bounds)) return unknown('unknown-coverage');
    for (const feature of candidates(sweep.bounds)) {
      if (intersectsFootprint(sweep.hull, feature.polygons, sweep.project)) {
        const building = buildingDetails(feature);
        return { collides: true, knownCoverage: true, building, feature: building, reason: 'building' };
      }
    }
    return { collides: false, knownCoverage: true, building: null, feature: null, reason: 'clear' };
  }

  function wouldCollide(fromState, toState, shape) {
    return getCollision(fromState, toState, shape).collides;
  }

  function getNearbyBuilding(state, maxDistance = 8) {
    if (!state || !Number.isFinite(state.longitude) || !Number.isFinite(state.latitude)
      || Math.abs(state.longitude) > 180 || Math.abs(state.latitude) > 85
      || !Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > 50) return null;
    const scaleX = 111320 * Math.cos(state.latitude * Math.PI / 180);
    const x = maxDistance / scaleX; const y = maxDistance / 111320;
    const bounds = [state.longitude - x, state.latitude - y, state.longitude + x, state.latitude + y];
    if (!cellsCover(bounds)) return null;
    let nearest = null;
    let closest = maxDistance;
    for (const feature of candidates(bounds)) {
      for (const polygon of feature.polygons) for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]; const b = ring[(i + 1) % ring.length];
          const ax = (a[0] - state.longitude) * scaleX; const ay = (a[1] - state.latitude) * 111320;
          const bx = (b[0] - state.longitude) * scaleX; const by = (b[1] - state.latitude) * 111320;
          const dx = bx - ax; const dy = by - ay;
          const lengthSquared = dx * dx + dy * dy;
          const t = lengthSquared > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
          const px = ax + dx * t; const py = ay + dy * t;
          const distance = Math.hypot(px, py);
          if (distance > closest) continue;
          closest = distance;
          nearest = buildingDetails(feature, {
            distance,
            // This is the nearest actual boundary, not evidence of a doorway.
            entrance: { longitude: state.longitude + px / scaleX, latitude: state.latitude + py / 111320 },
          });
        }
      }
    }
    return nearest;
  }

  function tryDestroy(id) {
    const key = String(id);
    if (removedFeatures.has(key)) return { destroyed: false, reason: 'already-destroyed', building: removedFeatures.get(key) };
    let feature = null;
    for (const cell of cells.values()) {
      feature = cell.features.find(candidate => candidate.id === key);
      if (feature) break;
    }
    if (!feature || destroyed) return { destroyed: false, reason: 'unknown-building', building: null };
    const building = buildingDetails(feature);
    if (!building.heightEligible) {
      const reason = building.heightFeet === null || building.maxHeightFeet === null ? 'unknown-height' : 'too-tall';
      return { destroyed: false, reason, building };
    }
    if (insideDowntown(feature.longitude, feature.latitude)) return { destroyed: false, reason: 'downtown-mesh', building };
    const rendered = renderedFeature(key);
    if (!rendered || rendered.primitive.ready !== true) return { destroyed: false, reason: 'not-rendered', building };
    // Resolve every part first so an unavailable part cannot produce a partially
    // hidden building while leaving its collision intact (or the reverse).
    let attributes;
    try {
      attributes = rendered.instanceIds.map(instanceId => rendered.primitive.getGeometryInstanceAttributes(instanceId));
    } catch {
      return { destroyed: false, reason: 'not-rendered', building };
    }
    if (attributes.some(attribute => !attribute?.show)) return { destroyed: false, reason: 'not-rendered', building };
    for (const attribute of attributes) attribute.show = ShowGeometryInstanceAttribute.toValue(false, attribute.show);
    details?.hide(key);
    const removed = { ...building, destroyable: false };
    removedFeatures.set(key, removed);
    viewer.scene.requestRender();
    return { destroyed: true, reason: 'destroyed', building: removed };
  }

  function destroy() {
    if (destroyed) return;
    clear();
    destroyed = true;
    failures.clear();
  }

  return { update, clear, destroy, setVisible, hasCollisionData, wouldCollide, getCollision, getNearbyBuilding, tryDestroy };
}
