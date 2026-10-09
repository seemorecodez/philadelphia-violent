import {
  BoxGeometry, Cartesian3, Cartographic, Color, ColorGeometryInstanceAttribute,
  CornerType, CorridorGeometry, CylinderGeometry, GeometryInstance, Matrix3,
  Matrix4, Model, PerInstanceColorAppearance, Primitive, Quaternion, Transforms,
} from 'cesium';
import {createParkCanopy} from './park-canopy.js';
import {localPoint as districtPoint,pointInTriangle} from './district-geometry.js';
import {houseProfile} from './house-profile.js';

// Real city positions, species, pole classes and pedestrian paths. The source
// does not supply individual tree meshes, lamp-arm bearings or sidewalk depths.
// Read STREET-SOURCES.md before treating display dimensions as measurements.
export const STREET_SOURCES = Object.freeze({
  tree: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/ppr_tree_inventory_2025/FeatureServer/0/query',
  pole: 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Street_Poles/FeatureServer/0/query',
  sidewalk: 'https://arcgis.dvrpc.org/portal/rest/services/transportation/pedestriannetwork_lines/FeatureServer/0/query',
});

const FIELDS = {
  tree: 'objectid,tree_name,tree_dbh,year,loc_x,loc_y',
  pole: 'objectid,pole_num,type,nlumin,lum_size,height,bulb_type',
  sidewalk: 'objectid,line_type,width,material,feat_type,captured',
};
const FEET = 0.3048;
const RADIUS = 200;
const MAX_OBJECTS = 300;
const PER_SOURCE = 160;
const CELL_METRES = 100;
const LAT_CELL = CELL_METRES / 111320;
const LON_CELL = CELL_METRES / (111320 * Math.cos(40 * Math.PI / 180));
const COOLDOWN_MS = 2500;
const FAILURE_COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const COLOURS = {
  metal: Color.fromCssColorString('#61676c'),
  dark: Color.fromCssColorString('#272d2d'),
  concrete: Color.fromCssColorString('#b7b4ac'),
  brick: Color.fromCssColorString('#94705d'),
  lamp: Color.fromCssColorString('#e8e3c6'),
};

const finitePositive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validCoordinate = point => Array.isArray(point) && point.length >= 2
  && Number.isFinite(point[0]) && Number.isFinite(point[1])
  && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const projection = latitude => 111320 * Math.cos(latitude * Math.PI / 180);
const localPoint = (point, origin) => [
  (point[0] - origin.longitude) * projection(origin.latitude),
  (point[1] - origin.latitude) * 111320,
];
const pointDistance = (a, b) => Math.hypot(
  (a.longitude - b.longitude) * projection(b.latitude),
  (a.latitude - b.latitude) * 111320,
);
const sourcePoint = (point, wkid) => !Array.isArray(point) ? null : wkid === 3857 || wkid === 102100
  ? [point[0] / 6378137 * 180 / Math.PI,
    (2 * Math.atan(Math.exp(point[1] / 6378137)) - Math.PI / 2) * 180 / Math.PI]
  : point;

function pointToSegment(point, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const denominator = dx * dx + dy * dy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / denominator));
  return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
}

export function distanceToStreetObject(object, state) {
  if (object.kind !== 'sidewalk') return Math.max(0, pointDistance(object, state) - object.radius);
  let closest = Infinity;
  for (const path of object.paths) {
    for (let i = 1; i < path.length; i++) {
      closest = Math.min(closest, pointToSegment([0, 0], localPoint(path[i - 1], state), localPoint(path[i], state)));
    }
  }
  return Math.max(0, closest - (object.dimension.width ?? 0) / 2);
}

/** Parse both ArcGIS JSON and GeoJSON without replacing missing positions. */
export function parseStreetFeature(kind, feature, {
  wkid = 4326, treeModelHeight = null, sidewalkWidthFallback = null,
} = {}) {
  const attributes = feature?.attributes ?? feature?.properties;
  const sourceId = attributes?.objectid ?? feature?.id;
  if (sourceId === undefined || sourceId === null || !attributes) return null;
  const id = `${kind}:${sourceId}`;
  if (kind === 'sidewalk') {
    if (attributes.line_type !== 1) return null;
    const geometry = feature.geometry;
    const rawPaths = geometry?.paths ?? (geometry?.type === 'LineString'
      ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : null);
    if (!Array.isArray(rawPaths) || rawPaths.length === 0 || rawPaths.length > 12) return null;
    const paths = rawPaths.map(path => Array.isArray(path)
      ? path.map(point => sourcePoint(point, geometry?.type ? 4326 : wkid)) : []);
    if (paths.some(path => path.length < 2 || path.length > 512 || path.some(point => !validCoordinate(point)))) return null;
    const first = paths[0][0];
    const widthMeasured = finitePositive(attributes.width) && attributes.width <= 200;
    const width = widthMeasured ? attributes.width * FEET
      : finitePositive(sidewalkWidthFallback) ? sidewalkWidthFallback : null;
    return {
      kind, id, sourceId: String(sourceId), longitude: first[0], latitude: first[1],
      height: 0.08, baseHeight: null, radius: 0, paths,
      dimension: { width, depth: 0.08 },
      widthFeet: widthMeasured ? attributes.width : null,
      dimensionsEstimated: !widthMeasured, depthEstimated: true,
      widthBasis: widthMeasured ? 'source-width-feet' : width === null ? 'unavailable' : 'explicit-display-estimate',
      material: String(attributes.material ?? ''), captureMethod: attributes.captured ?? null,
      source: STREET_SOURCES.sidewalk,
    };
  }
  if (kind !== 'tree' && kind !== 'pole') return null;
  const geometry = feature.geometry;
  let point = geometry?.type === 'Point' ? geometry.coordinates
    : geometry && Number.isFinite(geometry.x) && Number.isFinite(geometry.y)
      ? sourcePoint([geometry.x, geometry.y], wkid) : null;
  if (!point && kind === 'tree') point = [attributes.loc_x, attributes.loc_y];
  if (!validCoordinate(point)) return null;
  if (kind === 'tree') {
    return {
      kind, id, sourceId: String(sourceId), longitude: point[0], latitude: point[1],
      height: finitePositive(treeModelHeight) ? treeModelHeight : null,
      baseHeight: null, radius: 0.22, dimension: { trunkRadius: 0.22 },
      species: String(attributes.tree_name ?? ''), sourceDiameter: attributes.tree_dbh ?? null,
      sourceDiameterUnit: 'unverified', sourceYear: attributes.year ?? null,
      dimensionsEstimated: true, heightBasis: 'representative-model-native-height',
      source: STREET_SOURCES.tree,
    };
  }
  const poleType = String(attributes.type ?? '').toUpperCase();
  // PASDA names C13/C20 as 13'/20' posts. Other HEIGHT values are assumed feet,
  // explicitly marked below because the field documentation omits its unit.
  const classHeight = poleType === 'C13' ? 13 : poleType === 'C20' ? 20 : null;
  const sourceHeight = finitePositive(attributes.height) && attributes.height <= 200 ? attributes.height : null;
  const heightFeet = classHeight ?? sourceHeight;
  return {
    kind, id, sourceId: String(sourceId), longitude: point[0], latitude: point[1],
    height: heightFeet === null ? null : heightFeet * FEET, baseHeight: null,
    radius: 0.14, dimension: { diameter: 0.28, armLength: 1.6 },
    poleType, poleNumber: attributes.pole_num ?? null,
    luminaires: Number.isFinite(attributes.nlumin) ? Math.max(0, Math.min(2, attributes.nlumin)) : 1,
    bulbType: attributes.bulb_type ?? null, sourceHeight, sourceHeightUnit: classHeight ? 'feet-class-definition' : 'feet-assumed',
    dimensionsEstimated: true, heightBasis: classHeight ? 'source-class' : sourceHeight ? 'source-height-unit-assumed' : 'unavailable',
    source: STREET_SOURCES.pole,
  };
}

/** CPU sweep: sidewalks are traversable; trunks/poles use narrow round colliders. */
export function intersectsStreetObject(object, from, to, shape = {}) {
  if (!from || !to || !validCoordinate([from.longitude, from.latitude]) || !validCoordinate([to.longitude, to.latitude])) return false;
  if (object.kind === 'sidewalk' || !finitePositive(object.height) || !Number.isFinite(object.baseHeight)) return false;
  const delta = localPoint([to.longitude, to.latitude], from);
  const target = localPoint([object.longitude, object.latitude], from);
  const distance = Math.hypot(...delta);
  if (!Number.isFinite(distance) || distance > 50) return false;
  const startHeading = Number.isFinite(from.heading) ? from.heading : 0;
  const endHeading = Number.isFinite(to.heading) ? to.heading : startHeading;
  const turn = Math.atan2(Math.sin(endHeading - startHeading), Math.cos(endHeading - startHeading));
  const radius = finitePositive(shape.radius) ? shape.radius : null;
  const halfLength = finitePositive(shape.halfLength) ? shape.halfLength : 2.25;
  const halfWidth = finitePositive(shape.halfWidth) ? shape.halfWidth : 1.1;
  const actorHeight = finitePositive(shape.height) ? shape.height : 1.8;
  const reach = radius ?? Math.hypot(halfLength, halfWidth);
  if (pointToSegment(target, [0, 0], delta) > reach + object.radius + 0.15) return false;
  // Subdivide translation and rotation; extra margin covers swept corner arcs
  // between samples. The 50m guard prevents an unbounded teleport sweep.
  const steps = Math.max(1, Math.ceil(distance / 0.2), Math.ceil(Math.abs(turn) / (Math.PI / 60)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bottom = Number.isFinite(from.height) && Number.isFinite(to.height)
      ? from.height + (to.height - from.height) * t : object.baseHeight;
    if (bottom > object.baseHeight + object.height || bottom + actorHeight < object.baseHeight) continue;
    const dx = target[0] - delta[0] * t; const dy = target[1] - delta[1] * t;
    if (radius !== null) {
      if (Math.hypot(dx, dy) <= radius + object.radius + 0.11) return true;
    } else {
      const heading = startHeading + turn * t;
      const longitudinal = dx * Math.sin(heading) + dy * Math.cos(heading);
      const lateral = dx * Math.cos(heading) - dy * Math.sin(heading);
      const outsideX = Math.max(0, Math.abs(longitudinal) - halfLength);
      const outsideY = Math.max(0, Math.abs(lateral) - halfWidth);
      if (Math.hypot(outsideX, outsideY) <= object.radius + 0.11) return true;
    }
  }
  return false;
}

function geometryInstance(geometry, position, colour) {
  return new GeometryInstance({ geometry,
    modelMatrix: Matrix4.fromTranslation(position),
    attributes: { color: ColorGeometryInstanceAttribute.fromColor(colour) },
  });
}

function poleGeometry(object) {
  const h = object.height;
  const instances = [];
  const cylinder = (length, topRadius, bottomRadius, z, colour) => instances.push(geometryInstance(
    new CylinderGeometry({ length, topRadius, bottomRadius, slices: 12,
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), new Cartesian3(0, 0, z), colour));
  const box = (x, y, z, px, py, pz, colour) => instances.push(geometryInstance(
    BoxGeometry.fromDimensions({ dimensions: new Cartesian3(x, y, z),
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT }), new Cartesian3(px, py, pz), colour));
  const wood = object.poleType.startsWith('WP');
  const colour = wood ? Color.fromCssColorString('#665548') : COLOURS.metal;
  cylinder(h, 0.065, wood ? 0.14 : 0.105, h / 2, colour);
  if (!wood) cylinder(0.35, 0.14, 0.2, 0.175, COLOURS.dark);
  const postTop = /^(PT|CCP|CHP|FLP|PKY)/.test(object.poleType);
  for (let lamp = 0; lamp < object.luminaires; lamp++) {
    const direction = lamp === 0 ? 1 : -1;
    if (postTop) {
      box(0.3, 0.3, 0.38, 0, 0, h + 0.14, COLOURS.lamp);
      box(0.44, 0.44, 0.06, 0, 0, h + 0.36, COLOURS.dark);
      break;
    }
    box(1.6, 0.09, 0.09, direction * 0.8, 0, h - 0.12, colour);
    box(0.64, 0.28, 0.17, direction * 1.7, 0, h - 0.16, COLOURS.dark);
    box(0.5, 0.22, 0.025, direction * 1.7, 0, h - 0.255, COLOURS.lamp);
  }
  return instances;
}

function makeRenderer(viewer, options) {
  return async object => {
    let primitive;
    const origin = Cartesian3.fromDegrees(object.longitude, object.latitude, object.baseHeight);
    const frame = Transforms.eastNorthUpToFixedFrame(origin);
    if (object.kind === 'tree') {
      if (!options.treeModelUrl || !finitePositive(options.treeModelHeight)) return null;
      primitive = await Model.fromGltfAsync({
        url: object.distanceModel && options.treeDistanceModelUrl ? options.treeDistanceModelUrl : options.treeModelUrl, modelMatrix: frame, scale: object.displayScale ?? 1,
        minimumPixelSize: 0, allowPicking: false, incrementallyLoadTextures: false,
        maximumScale: object.displayScale ?? 1,
      });
    } else if (object.kind === 'pole') {
      primitive = new Primitive({ geometryInstances: poleGeometry(object), modelMatrix: frame,
        appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true, allowPicking: false,
      });
    } else {
      if (!finitePositive(object.dimension.width)) return null;
      const colour = object.material === 'BRICK' ? COLOURS.brick : COLOURS.concrete;
      primitive = new Primitive({
        geometryInstances: object.paths.map(path => new GeometryInstance({
          geometry: new CorridorGeometry({ positions: Cartesian3.fromDegreesArray(path.flatMap(point => point.slice(0, 2))),
            width: object.dimension.width, height: object.baseHeight + object.height,
            extrudedHeight: object.baseHeight, cornerType: CornerType.MITERED,
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }), attributes: { color: ColorGeometryInstanceAttribute.fromColor(colour) },
        })),
        appearance: new PerInstanceColorAppearance({ translucent: false, closed: true }),
        asynchronous: true, allowPicking: false,
      });
    }
    viewer.scene.primitives.add(primitive);
    let disposed = false;
    return {
      get ready() { return !disposed && primitive.ready === true; },
      show(value) { if (!disposed) primitive.show = value; },
      tip(angle) {
        if (disposed || object.kind === 'sidewalk') return;
        const rotation = Matrix3.fromQuaternion(Quaternion.fromAxisAngle(Cartesian3.UNIT_X, angle));
        primitive.modelMatrix = Matrix4.multiply(frame, Matrix4.fromRotationTranslation(rotation), new Matrix4());
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        viewer.scene.primitives.remove(primitive);
      },
    };
  };
}

/**
 * At most 300 displayed objects within 200m. One data window is fetched at a
 * time, with sequential source requests and a retry cooldown. clear() starts a
 * new session; setVisible(false) retains objects/damage and suspends loading.
 * A supplied GLB must be a licensed, upright, metre-scaled tree with base at 0.
 */
export function createStreetObjects(viewer, {
  onStatus = () => {}, onDestroyed = () => {}, treeModelUrl = null, treeModelHeight = null,
  treeDistanceModelUrl = null,
  parkPlantingUrl = null,
  mappedParkCanopy = false, canPlaceCanopy = null,
  sidewalkWidthFallback = null, renderObject = null, maxVisibleTrees = 12, treeDisplayRadius = 80, includeSidewalks = true, getTerrainHeight = null,
} = {}) {
  const options = { treeModelUrl, treeModelHeight, treeDistanceModelUrl, sidewalkWidthFallback };
  const render = renderObject ?? makeRenderer(viewer, options);
  const objects = new Map();
  const removedIds = new Set();
  const failures = new Map();
  const treeLimit = Number.isFinite(maxVisibleTrees) ? Math.max(0, Math.min(treeDistanceModelUrl ? 80 : 32, Math.floor(maxVisibleTrees))) : 12;
  const treeRadius = finitePositive(treeDisplayRadius) ? Math.min(RADIUS, treeDisplayRadius) : 80;
  let visibleTreeIds = new Set();
  let generation = 0;
  let destroyed = false;
  let visible = true;
  let center = null;
  let active = null;
  let loadedKey = null;
  let nextRequestAt = 0;
  let nowSeconds = 0;
  let nextDisplayAt = 0;
  let lastWarningAt = -Infinity;
  let limited = false;
  let parkPlanting = null;
  const canopy = mappedParkCanopy ? createParkCanopy({onStatus}) : null;

  function warn(message) {
    if (Date.now() - lastWarningAt < 15_000) return;
    lastWarningAt = Date.now();
    onStatus(message, 'warning');
  }
  const current = job => !destroyed && active === job && job.generation === generation && !job.controller.signal.aborted;
  function dispose(record) {
    record.renderVersion++;
    record.handle?.dispose();
    record.handle = null;
    record.rendering = false;
  }

  function addDisplay(record) {
    const object = record.object;
    if (record.handle || record.rendering || removedIds.has(object.id) || !visible || !center
        || !finitePositive(object.height) || distanceToStreetObject(object, center) > RADIUS
        || (object.kind === 'tree' && !visibleTreeIds.has(object.id))
        || (record.retryAt ?? 0) > Date.now()) return false;
    if (object.kind === 'tree' && !treeModelUrl && !renderObject) return false;
    if(object.interpretedCanopy && canPlaceCanopy && !canPlaceCanopy(object))return false;
    if (object.kind === 'sidewalk' && !finitePositive(object.dimension.width)) return false;
    // Reading loaded terrain avoids unbounded extra network requests. Missing
    // ground keeps this object absent, never at a fabricated zero elevation.
    const baseHeight = getTerrainHeight?getTerrainHeight(object.longitude,object.latitude):viewer.scene.globe?.getHeight(Cartographic.fromDegrees(object.longitude, object.latitude));
    if (!Number.isFinite(baseHeight)) return false;
    object.baseHeight = baseHeight;
    object.distanceModel = object.kind==='tree' && treeDistanceModelUrl && distanceToStreetObject(object,center)>45;
    record.rendering = true;
    const version = ++record.renderVersion;
    const run = generation;
    void (async () => { try {
      const handle = await render(object);
      if (destroyed || run !== generation || objects.get(object.id) !== record || version !== record.renderVersion) {
        handle?.dispose(); return;
      }
      record.handle = handle;
      if (!handle) record.retryAt = Date.now() + FAILURE_COOLDOWN_MS;
      if (!visible || !center || distanceToStreetObject(object, center) > RADIUS
          || (object.kind === 'tree' && !visibleTreeIds.has(object.id))) {
        dispose(record); return;
      }
      handle?.show(true);
      viewer.scene.requestRender();
    } catch (error) {
      record.retryAt = Date.now() + FAILURE_COOLDOWN_MS;
      if (run === generation && !destroyed) warn(`A mapped street object could not load: ${error.message}`);
    } finally {
      if (version === record.renderVersion) record.rendering = false;
    } })();
    return true;
  }

  function refreshDisplay() {
    if (!visible || !center || destroyed) return;
    // Keep the detailed authored canopy on a small nearby population. A falling
    // tree still occupies its slot until removed, so damage cannot exceed cap.
    visibleTreeIds = new Set([...objects.values()]
      .filter(record => record.object.kind === 'tree' && finitePositive(record.object.height)
        && (!removedIds.has(record.object.id) || record.handle)
        && distanceToStreetObject(record.object, center) <= treeRadius)
      .sort((a, b) => distanceToStreetObject(a.object, center) - distanceToStreetObject(b.object, center))
      .slice(0, treeLimit).map(record => record.object.id));
    let starts = 0;
    for (const record of objects.values()) {
      if(record.object.kind==='tree' && treeDistanceModelUrl && record.handle && record.brokenAt===null){
        const distance=distanceToStreetObject(record.object,center);
        // Hysteresis avoids repeatedly rebuilding a tree at one threshold.
        if((record.object.distanceModel && distance<38)||(!record.object.distanceModel && distance>55))dispose(record);
      }
      if (distanceToStreetObject(record.object, center) > RADIUS
          || (record.object.kind === 'tree' && !visibleTreeIds.has(record.object.id))) {
        dispose(record);
      } else if (starts < 8 && !record.handle && !record.rendering && !removedIds.has(record.object.id)) {
        if (addDisplay(record)) starts++;
      }
    }
  }

  function queryUrl(kind, position) {
    const reach = RADIUS + CELL_METRES;
    const dx = reach / projection(position.latitude); const dy = reach / 111320;
    const parameters = new URLSearchParams({
      f: 'json', where: kind === 'sidewalk' ? 'line_type=1' : '1=1',
      geometry: JSON.stringify({ xmin: position.longitude - dx, ymin: position.latitude - dy,
        xmax: position.longitude + dx, ymax: position.latitude + dy, spatialReference: { wkid: 4326 } }),
      geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', returnGeometry: 'true',
      outFields: FIELDS[kind], resultRecordCount: String(PER_SOURCE), orderByFields: 'objectid ASC',
    });
    return `${STREET_SOURCES[kind]}?${parameters}`;
  }

  async function fetchWindow(job) {
    const candidates = new Map();
    let anySource = false;
    let anyFailure = false;
    let missingWidths = 0;
    let truncated = false;
    for (const kind of (includeSidewalks ? ['pole', 'sidewalk', 'tree'] : ['pole', 'tree'])) {
      if (!current(job) || !visible) break;
      const sourceKey = `${job.key}:${kind}`;
      if ((failures.get(sourceKey) ?? 0) > Date.now()) { anyFailure = true; continue; }
      const controller = new AbortController();
      const abort = () => controller.abort();
      job.controller.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(queryUrl(kind, job.center), { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error.message ?? 'Source rejected the query');
        if (!Array.isArray(data.features)) throw new Error('Source returned no feature list');
        if (!current(job)) return;
        anySource = true;
        truncated ||= data.exceededTransferLimit === true || data.features.length >= PER_SOURCE;
        const wkid = data.spatialReference?.latestWkid ?? data.spatialReference?.wkid ?? 4326;
        for (const feature of data.features.slice(0, PER_SOURCE)) {
          const object = parseStreetFeature(kind, feature, { ...options, wkid });
          if (!object || removedIds.has(object.id) || distanceToStreetObject(object, job.center) > RADIUS + CELL_METRES) continue;
          if (object.kind === 'sidewalk' && !object.dimension.width) missingWidths++;
          candidates.set(object.id, object);
        }
      } catch (error) {
        if (!current(job)) return;
        anyFailure = true;
        failures.set(sourceKey, Date.now() + FAILURE_COOLDOWN_MS);
        warn(`Public ${kind} data is temporarily unavailable. Nearby street-object coverage is incomplete.`);
      } finally {
        clearTimeout(timer);
        job.controller.signal.removeEventListener('abort', abort);
      }
    }
    if (!current(job)) return;
    if(parkPlantingUrl||canopy){
      try{
        if(parkPlantingUrl&&!parkPlanting){const response=await fetch(parkPlantingUrl,{signal:job.controller.signal});if(!response.ok)throw new Error('Park planting unavailable');const data=await response.json();if(!Array.isArray(data)||data.length>5000)throw new Error('Invalid planting data');parkPlanting=data;}
        let mapped=[];
        if(canopy)try{mapped=await canopy.load(job.center,job.controller.signal);}catch(error){if(!current(job))return;anyFailure=true;warn('Mapped park canopy could not load completely. Existing trees remain available.');}
        if(!current(job))return;
        for(const entry of [...(parkPlanting??[]),...mapped]){
          if(!validCoordinate([entry.longitude,entry.latitude])||!finitePositive(entry.scale)||entry.scale>4)continue;
          const id=`tree:${entry.id}`;if(removedIds.has(id))continue;
          const object={kind:'tree',id,sourceId:entry.id,longitude:entry.longitude,latitude:entry.latitude,height:treeModelHeight*entry.scale,
            displayScale:entry.scale,interpretedCanopy:true,baseHeight:null,radius:.22*entry.scale,dimension:{trunkRadius:.22*entry.scale},
            dimensionsEstimated:true,positionBasis:entry.positionBasis,source:parkPlantingUrl,referenceId:entry.referenceId};
          if(distanceToStreetObject(object,job.center)>RADIUS)continue;
          // Prefer mapped individual stems where the inventory already covers
          // this canopy, rather than stacking two trees at the same position.
          if([...candidates.values()].some(other=>other.kind==='tree'&&distanceToStreetObject(other,object)<6))continue;
          candidates.set(id,object);anySource=true;
        }
      }catch(error){if(!current(job))return;warn('Local interpreted park vegetation could not load.');}
    }
    if (anySource) {
      // Retain nearby successful prior results when just one source fails.
      for (const [id, record] of objects) {
        if (!candidates.has(id) && !removedIds.has(id) && distanceToStreetObject(record.object, job.center) <= RADIUS + CELL_METRES) {
          candidates.set(id, record.object);
        }
      }
      const nearest = [...candidates.values()].sort((a, b) => distanceToStreetObject(a, job.center) - distanceToStreetObject(b, job.center));
      limited = truncated || nearest.length > MAX_OBJECTS;
      const selected = new Map(nearest.slice(0, MAX_OBJECTS).map(object => [object.id, object]));
      for (const [id, record] of objects) if (!selected.has(id)) { dispose(record); objects.delete(id); }
      for (const [id, object] of selected) if (!objects.has(id)) objects.set(id, {
        object, handle: null, rendering: false, renderVersion: 0, brokenAt: null,
      });
      refreshDisplay();
      if (limited) warn('The nearby street-object display reached its data limit. Some mapped objects are not shown.');
      else if (missingWidths) warn('Some mapped sidewalks have no width measurement and are not rendered.');
    }
    loadedKey = anyFailure ? null : job.key;
    // Bound cooldown bookkeeping while travelling through the city.
    while (failures.size > 30) failures.delete(failures.keys().next().value);
    nextRequestAt = Date.now() + (anyFailure ? FAILURE_COOLDOWN_MS : COOLDOWN_MS);
  }

  function update(longitude, latitude) {
    if (destroyed || !visible || !validCoordinate([longitude, latitude])) return;
    center = { longitude, latitude };
    if (longitude < -75.30 || longitude > -74.94 || latitude < 39.84 || latitude > 40.16) {
      clear(); return;
    }
    const x = Math.floor(longitude / LON_CELL); const y = Math.floor(latitude / LAT_CELL);
    const key = `${x}:${y}`;
    if (active || key === loadedKey || Date.now() < nextRequestAt) return;
    const job = { key, generation, center: { longitude: (x + 0.5) * LON_CELL, latitude: (y + 0.5) * LAT_CELL }, controller: new AbortController() };
    active = job;
    void fetchWindow(job).catch(() => {
      if (current(job)) {
        nextRequestAt = Date.now() + FAILURE_COOLDOWN_MS;
        warn('Nearby street-object data could not be processed. Loading will retry after a pause.');
      }
    }).finally(() => { if (active === job) active = null; });
  }

  function getCollision(from, to, shape = {}) {
    if (destroyed || !visible) return { collides: false, object: null };
    for (const record of objects.values()) {
      if (removedIds.has(record.object.id) || !record.handle?.ready) continue;
      if (intersectsStreetObject(record.object, from, to, shape)) return { collides: true, object: record.object };
    }
    return { collides: false, object: null };
  }

  function tryDestroy(id) {
    const record = objects.get(String(id));
    if (destroyed || !visible || !record) return { destroyed: false, object: null, reason: 'unavailable' };
    if (removedIds.has(record.object.id)) return { destroyed: false, object: record.object, reason: 'already-destroyed' };
    if (!record.handle?.ready) return { destroyed: false, object: record.object, reason: 'not-rendered' };
    removedIds.add(record.object.id);
    record.brokenAt = nowSeconds;
    if (record.object.kind === 'sidewalk') dispose(record);
    onDestroyed(record.object);
    viewer.scene.requestRender();
    return { destroyed: true, object: record.object, reason: 'destroyed' };
  }

  function damageNearest(state, range = 4) {
    if (!state || !validCoordinate([state.longitude, state.latitude]) || !finitePositive(range) || range > 50 || destroyed || !visible) return { destroyed: false, object: null };
    let nearest = null; let distance = range;
    for (const record of objects.values()) {
      if (removedIds.has(record.object.id) || !record.handle?.ready) continue;
      if (Number.isFinite(state.height) && Math.abs(state.height - record.object.baseHeight) > 4) continue;
      const next = distanceToStreetObject(record.object, state);
      if (next <= distance) { nearest = record; distance = next; }
    }
    return nearest ? tryDestroy(nearest.object.id) : { destroyed: false, object: null };
  }

  function tick(dt) {
    if (destroyed || !visible || !Number.isFinite(dt) || dt <= 0) return;
    nowSeconds += Math.min(dt, 0.1);
    for (const record of objects.values()) {
      if (record.brokenAt === null || !record.handle) continue;
      const age = nowSeconds - record.brokenAt;
      if (age > 4) dispose(record);
      else record.handle.tip(Math.min(Math.PI / 2, age * age * 1.4));
      viewer.scene.requestRender();
    }
    if (nowSeconds >= nextDisplayAt) {
      nextDisplayAt = nowSeconds + 0.5;
      refreshDisplay();
    }
  }

  function setVisible(value) {
    visible = Boolean(value);
    if (!visible && active) { active.controller.abort(); active = null; }
    for (const record of objects.values()) record.handle?.show(visible);
    if (visible) { nextRequestAt = 0; refreshDisplay(); }
    viewer.scene.requestRender();
  }

  function clear() {
    generation++;
    active?.controller.abort(); active = null;
    for (const record of objects.values()) dispose(record);
    objects.clear(); removedIds.clear(); failures.clear();
    visibleTreeIds.clear();
    center = null; loadedKey = null; nextRequestAt = 0;
    limited = false;
    viewer.scene.requestRender();
  }

  function destroy() { if (!destroyed) { clear(); destroyed = true; } }
  function getStats() {
    return {
      count: objects.size, rendered: [...objects.values()].filter(record => record.handle?.ready).length,
      destroyed: removedIds.size, loading: Boolean(active), visible, limited,
      tree: [...objects.values()].filter(record => record.object.kind === 'tree').length,
      pole: [...objects.values()].filter(record => record.object.kind === 'pole').length,
      sidewalk: [...objects.values()].filter(record => record.object.kind === 'sidewalk').length,
      renderedTrees: [...objects.values()].filter(record => record.object.kind === 'tree' && record.handle?.ready).length,
      treeLimit, treeDisplayRadius: treeRadius,
    };
  }
  return { update, getCollision, tryDestroy, damageNearest, tick, setVisible, clear, destroy, getStats };
}

// Native adapter for the same street-object system. Positions are centimetres
// in the existing east/south/up frame. Source pavement/grass and real footprints
// constrain placements; these are neighborhood interpretations, NOT a survey of
// individual street objects. No network calls or replacement road/lot geometry.
export function buildNativeStreetDetails(cells, features, reference) {
  const buckets=new Map(), footprints=new Map(), result=new Map();
  const bucket=1000, key=(x,y)=>`${Math.floor(x/bucket)},${Math.floor(y/bucket)}`;
  function index(map,bounds,item){
    for(let x=Math.floor(bounds[0]/bucket);x<=Math.floor(bounds[2]/bucket);x++)
      for(let y=Math.floor(bounds[1]/bucket);y<=Math.floor(bounds[3]/bucket);y++){
        const k=`${x},${y}`;if(!map.has(k))map.set(k,[]);map.get(k).push(item);
      }
  }
  for(const c of [...cells].sort((a,b)=>a.id.localeCompare(b.id))){
    result.set(c.id,[]);
    for(const kind of ['road','sidewalk','grass','parking']){
      const a=c.groups[kind]??[];
      for(let i=0;i<a.length;i+=9){
        const p=[[a[i],a[i+1]],[a[i+3],a[i+4]],[a[i+6],a[i+7]]];
        if(!p.flat().every(Number.isFinite))throw Error(`Invalid native ${kind} in ${c.id}`);
        index(buckets,[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))],{kind,p,z:[a[i+2],a[i+5],a[i+8]],cell:c.id});
      }
    }
  }
  for(const f of features)for(const polygon of f.polygons){
    const ring=polygon[0].map(p=>{const [x,y]=districtPoint(p);return [x*100,-y*100];});
    const bounds=[Math.min(...ring.map(p=>p[0]))-250,Math.min(...ring.map(p=>p[1]))-250,Math.max(...ring.map(p=>p[0]))+250,Math.max(...ring.map(p=>p[1]))+250];
    index(footprints,bounds,ring);
  }
  function surface(kind,x,y){
    for(const t of buckets.get(key(x,y))??[]){
      if(t.kind!==kind||!pointInTriangle([x,y],t.p))continue;
      const [a,b,c]=t.p,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
      if(Math.abs(d)<.001)continue;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d;
      const v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d;
      return {cell:t.cell,z:u*t.z[0]+v*t.z[1]+(1-u-v)*t.z[2]};
    }
    return null;
  }
  function clearBuilding(x,y,radius){
    for(const ring of footprints.get(key(x,y))??[]){
      let inside=false;
      for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const a=ring[j],b=ring[i],dx=b[0]-a[0],dy=b[1]-a[1];
        const u=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));
        if(Math.hypot(x-a[0]-u*dx,y-a[1]-u*dy)<radius)return false;
        if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
      }
      if(inside)return false;
    }
    return true;
  }
  function supported(kind,x,y,r){return [[0,0],[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dy])=>surface(kind,x+dx,y+dy));}
  function roadDirection(x,y){
    // Closest road sample determines the curb-facing direction, not a global
    // Manhattan-grid assumption. Reject intersection corners with roads on
    // both sides, leaving curb ramps and crossings free.
    for(const d of [100,160,220])for(let a=0;a<32;a++){
      const yaw=a*Math.PI/16,dx=Math.cos(yaw),dy=Math.sin(yaw);
      if(surface('road',x+dx*d,y+dy*d)){
        if(surface('road',x-dx*160,y-dy*160)||!surface('sidewalk',x-dx*170,y-dy*170))return null;
        return {yaw:a*11.25,dx,dy};
      }
    }
    return null;
  }
  const mix=(x,y)=>{let h=Math.imul(Math.round(x),73856093)^Math.imul(Math.round(y),19349663);h=Math.imul(h^(h>>>16),0x45d9f3b);return (h>>>0)/4294967296;};
  const pavement=[],gardens=[];
  // World-aligned candidates, then a stable priority order, independent of the
  // cell input order. Shared cell borders cannot create duplicate instances.
  const visited=new Set();
  for(const c of [...cells].sort((a,b)=>a.id.localeCompare(b.id))){
    const all=[...(c.groups.sidewalk??[]),...(c.groups.grass??[])];if(!all.length)continue;
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    for(let i=0;i<all.length;i+=3){x0=Math.min(x0,all[i]);x1=Math.max(x1,all[i]);y0=Math.min(y0,all[i+1]);y1=Math.max(y1,all[i+1]);}
    for(let x=Math.ceil(x0/240)*240;x<=x1;x+=240)for(let y=Math.ceil(y0/240)*240;y<=y1;y+=240){
      const id=`${x},${y}`;if(visited.has(id))continue;visited.add(id);
      if(!clearBuilding(x,y,160))continue;
      const grass=surface('grass',x,y);
      if(grass&&supported('grass',x,y,115)&&!surface('road',x,y))gardens.push({x,y,...grass,priority:mix(x,y)});
      const sidewalk=surface('sidewalk',x,y);
      if(sidewalk&&supported('sidewalk',x,y,32)&&!surface('road',x,y)){
        const direction=roadDirection(x,y);if(direction)pavement.push({x,y,...sidewalk,...direction,priority:mix(x,y)});
      }
    }
  }
  pavement.sort((a,b)=>a.priority-b.priority);gardens.sort((a,b)=>a.priority-b.priority);
  const placed=[],rules=reference.street??{treeSpacing:14,treeScale:1.2,lampSpacing:29,gardenSpacing:15};
  function add(kind,p,spacing,radius,scale=[1,1,1],yaw=p.yaw??p.priority*360){
    if(placed.some(q=>Math.hypot(q.x-p.x,q.y-p.y)<(q.kind===kind?spacing*100:Math.max(130,q.radius+radius))))return false;
    const object={kind,position:[p.x,p.y,Math.round(p.z*10)/10],yaw,scale,basis:'neighborhood interpretation on source surface'};
    result.get(p.cell).push(object);placed.push({...p,kind,radius,object});return true;
  }
  for(const p of pavement)add('lamp',p,rules.lampSpacing,30);
  for(const p of pavement)add('hydrant',p,70,28);
  for(const p of pavement)if(p.priority<.5)add('bin',p,38,40);
  for(const p of pavement)if(p.priority>.55)add('utility-pole',p,48,30);
  for(const p of pavement)if(p.priority>.85)add('parking-sign',p,68,20);
  for(const p of gardens){
    const s=rules.treeScale*(.86+p.priority*.28);
    // Trunks stand on planting surfaces and the original 4.58m tree scales to
    // a modest neighborhood canopy. No foliage is baked into ground imagery.
    if(clearBuilding(p.x,p.y,240))add('tree',p,rules.treeSpacing,140,[s,s,s]);
  }
  const atGardenEdge=p=>[0,1,2,3,4,5,6,7].some(a=>surface('sidewalk',p.x+Math.cos(a*Math.PI/4)*190,p.y+Math.sin(a*Math.PI/4)*190));
  for(const p of gardens)if(p.priority>.62&&atGardenEdge(p))add('planter',p,Math.max(12,rules.gardenSpacing),65);
  // A garden railing is only placed where every segment remains on grass;
  // it never cuts across a pavement or an inferred building entrance.
  for(const p of gardens)if(p.priority<.24&&atGardenEdge(p)&&supported('grass',p.x,p.y,170))add('garden-fence',p,14,160,[1,1,1],9.5);
  // Conductors only join roughly aligned poles on the same uninterrupted
  // pavement. Sample the span to avoid running through houses/intersections.
  // Each short sagged segment is another instance of the one metre cable mesh.
  const poles=placed.filter(p=>p.kind==='utility-pole'),links=new Set();
  for(const a of poles){
    const options=poles.filter(b=>b!==a&&Math.hypot(a.x-b.x,a.y-b.y)<6200)
      .sort((b,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(a.x-c.x,a.y-c.y));
    for(const b of options.slice(0,4)){
      const id=[`${a.x},${a.y}`,`${b.x},${b.y}`].sort().join('|');if(links.has(id))continue;
      const samples=Array.from({length:13},(_,i)=>{const t=i/12;return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t+812-38*Math.sin(t*Math.PI)};});
      if(!samples.every(p=>surface('sidewalk',p.x,p.y)&&clearBuilding(p.x,p.y,120)))continue;
      links.add(id);
      for(let i=0;i<samples.length-1;i++){
        const p=samples[i],q=samples[i+1],s=surface('sidewalk',p.x,p.y);
        const horizontal=Math.hypot(q.x-p.x,q.y-p.y),length=Math.hypot(horizontal,q.z-p.z);
        const object={kind:'cable',position:[p.x,p.y,p.z],scale:[length/100,1,1],yaw:Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI,pitch:Math.atan2(q.z-p.z,horizontal)*180/Math.PI,basis:'Interpreted utility span; not surveyed wiring'};
        result.get(s.cell).push(object);placed.push({...p,kind:'cable',radius:0,object});
      }
    }
  }
  // Use the existing house profile's door bay to mount one mailbox beside the
  // entrance on a road-facing exterior. Keep historical/named assets untouched.
  for(const f of features){
    if(f.buildingName||f.height<2.6||f.height>18)continue;
    const profile=houseProfile(f.id,f.height,reference);if(!profile)continue;
    let best=null;
    for(const poly of f.polygons){
      const ring=poly[0].map(p=>{const [x,y]=districtPoint(p);return [x*100,-y*100];});
      const sign=ring.reduce((s,p,i)=>{const q=ring[(i+1)%ring.length];return s+p[0]*q[1]-q[0]*p[1];},0)>0?1:-1;
      for(let i=0;i<ring.length-1;i++){
        const a=ring[i],b=ring[i+1],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<280||length>1200)continue;
        const ux=(b[0]-a[0])/length,uy=(b[1]-a[1])/length,nx=uy*sign,ny=-ux*sign;
        const bays=Math.min(16,Math.max(1,Math.floor((length/100-.65)/profile.baySpacing))),spacing=length/bays;
        const door=(profile.seed%bays+.5)*spacing,width=Math.min(profile.windowWidth*100,spacing-50);
        const along=Math.min(length-30,door+width/2+29),x=a[0]+ux*along+nx*6.4,y=a[1]+uy*along+ny*6.4;
        const support=surface('sidewalk',x+nx*45,y+ny*45)??surface('grass',x+nx*45,y+ny*45);if(!support)continue;
        for(let d=250;d<=1800;d+=250)if(surface('road',x+nx*d,y+ny*d)){
          if(!best||d<best.distance)best={x,y,z:support.z+112,cell:support.cell,yaw:Math.atan2(ny,nx)*180/Math.PI,distance:d};break;
        }
      }
    }
    if(best){const object={kind:'mailbox',position:[best.x,best.y,best.z],yaw:best.yaw,scale:[1,1,1],basis:'Interpreted entrance accessory on real footprint',sourceBuildingId:f.id};result.get(best.cell).push(object);placed.push({...best,kind:'mailbox',radius:15,object});}
  }
  // Reuse the retained vehicle only in positively mapped parking, with all
  // four tyres/body corners contained. Never invent parking in a travel lane.
  for(const c of [...cells].sort((a,b)=>a.id.localeCompare(b.id))){
    const a=c.groups.parking??[];
    for(let i=0;i<a.length;i+=9){
      const x=(a[i]+a[i+3]+a[i+6])/3,y=(a[i+1]+a[i+4]+a[i+7])/3,z=surface('parking',x,y);
      if(!z||!clearBuilding(x,y,240))continue;
      for(const yaw of [9.5,99.5]){
        const angle=yaw*Math.PI/180,cs=Math.cos(angle),sn=Math.sin(angle);
        if([[-245,-110],[-245,110],[245,-110],[245,110],[0,0]].every(([dx,dy])=>surface('parking',x+dx*cs-dy*sn,y+dx*sn+dy*cs)&&!surface('road',x+dx*cs-dy*sn,y+dx*sn+dy*cs))){add('parked-car',{x,y,...z},6,260,[1,1,1],yaw-90);break;}
      }
    }
  }
  return {cells:result,summary:{style:reference.id,classification:'Interpreted street dressing constrained by retained city geometry; not surveyed prop locations',counts:placed.reduce((a,p)=>(a[p.kind]=(a[p.kind]??0)+1,a),{}),units:'Unreal centimetres',version:1}};
}
