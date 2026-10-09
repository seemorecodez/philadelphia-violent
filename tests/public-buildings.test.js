import test from 'node:test';
import assert from 'node:assert/strict';
import { GeographicTilingScheme, HeightmapTerrainData } from 'cesium';
import { createPublicBuildings } from '../src/public-buildings.js';

// Synthetic geometry fixtures exercise collision behavior, not city accuracy.
// The production module parses/indexes the GeoJSON and runs its actual CPU path.
// Downtown placement makes WebGL and terrain access unnecessary for these tests.
const LONGITUDE = -75.1647;
const LATITUDE = 39.955;
const METRES_PER_LONGITUDE = 111320 * Math.cos(LATITUDE * Math.PI / 180);
const coordinate = ([x, y]) => [LONGITUDE + x / METRES_PER_LONGITUDE, LATITUDE + y / 111320];
const state = (x, y, heading = 0) => ({
  longitude: LONGITUDE + x / METRES_PER_LONGITUDE,
  latitude: LATITUDE + y / 111320,
  heading,
});
const rectangle = (west, south, east, north) => [
  [west, south], [east, south], [east, north], [west, north], [west, south],
].map(coordinate);
const footprint = (rings, height = 20, id = 1) => ({
  type: 'Feature', id, properties: { objectid: id, approx_hgt: height },
  geometry: { type: 'Polygon', coordinates: rings },
});

async function withFootprints(features, check, { render = false, longitude = LONGITUDE, ready = true } = {}) {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, json: async () => ({ type: 'FeatureCollection', features }) };
  };
  const renderedPrimitives = [];
  const viewer = {
    scene: {
      primitives: {
        add(primitive) {
          if (!render) throw new Error('Downtown CPU checks must not render fallback buildings');
          // Run the real geometry-instance creation path without a WebGL context.
          const attributes = new Map(primitive.geometryInstances.map(instance => [instance.id, {
            show: instance.attributes.show.value.slice(),
          }]));
          const result = { primitive, attributes, ready, show: primitive.show, getGeometryInstanceAttributes: id => attributes.get(id) };
          renderedPrimitives.push(result);
          return result;
        },
        remove(primitive) { primitive.primitive.destroy(); },
      },
      requestRender() {},
    },
    get terrainProvider() {
      if (!render) throw new Error('Downtown collision readiness must not depend on terrain');
      // Synthetic height only for checking source height thresholds and the
      // display-base handoff. This fixture is not Philadelphia terrain evidence.
      return {
        tilingScheme: new GeographicTilingScheme(),
        requestTileGeometry: async () => new HeightmapTerrainData({
          buffer: new Float32Array([13, 13, 13, 13]), width: 2, height: 2,
        }),
      };
    },
  };
  const buildings = createPublicBuildings(viewer);
  try {
    assert.equal(buildings.hasCollisionData(longitude, LATITUDE), false);
    buildings.update(longitude, LATITUDE);
    // Flush the bounded fetch queue without timing-sensitive arbitrary sleeps.
    for (let i = 0; i < 100; i++) await Promise.resolve();
    assert.equal(requests, 9);
    assert.equal(buildings.hasCollisionData(longitude, LATITUDE), true);
    await check(buildings, () => requests, renderedPrimitives);
  } finally {
    buildings.destroy();
    globalThis.fetch = originalFetch;
  }
}

test('actual collision path stops the car rectangle at a footprint and allows nearby clear road', async () => {
  await withFootprints([footprint([rectangle(4, -4, 6, 4)])], buildings => {
    assert.equal(buildings.wouldCollide(state(0, 0), state(1, 0)), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(3, 0)), true);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 0)), false);
  });
});

test('swept bumper catches a thin footprint between clear endpoint poses, even without height', async () => {
  await withFootprints([footprint([rectangle(4, -0.1, 4.05, 0.1)], null)], buildings => {
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 0)), false);
    assert.equal(buildings.wouldCollide(state(8, 0), state(8, 0)), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(8, 0)), true);
  });
});

test('courtyard holes stay open and their wall boundaries block the car', async () => {
  await withFootprints([footprint([rectangle(-10, -10, 10, 10), rectangle(-5, -5, 5, 5)])], buildings => {
    assert.equal(buildings.wouldCollide(state(0, 0), state(1, 0)), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(4, 0)), true);
  });
});

test('swept rotating corner catches a wall missed by both endpoint rectangles', async () => {
  await withFootprints([footprint([rectangle(2.33, 0.7, 2.4, 0.9)])], buildings => {
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 0)), false);
    assert.equal(buildings.wouldCollide(state(0, 0, Math.PI / 2), state(0, 0, Math.PI / 2)), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 0, Math.PI / 2)), true);
  });
});

test('a rejected forward step leaves room to reverse away from the wall buffer', async () => {
  await withFootprints([footprint([rectangle(-4, 4, 4, 6)])], buildings => {
    const stopped = state(0, 1.7);
    assert.equal(buildings.wouldCollide(stopped, state(0, 1.9)), true);
    // The caller retains the stopped state after rejecting the forward step.
    assert.equal(buildings.wouldCollide(stopped, state(0, 1)), false);
  });
});

test('unknown coverage and long teleports fail closed; distant map positions trigger no city queries', async () => {
  await withFootprints([], (buildings, requests) => {
    const before = requests();
    buildings.update(0, 0);
    assert.equal(requests(), before);
    assert.equal(buildings.wouldCollide(state(0, 0), state(100, 0)), true);
    buildings.clear();
    assert.equal(buildings.hasCollisionData(LONGITUDE, LATITUDE), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 0)), true);
  });
});

test('avatar shape fits a narrow gap that blocks the default car; invalid sizes fail closed', async () => {
  const features = [footprint([rectangle(-6, -6, -0.5, 6)]), footprint([rectangle(0.5, -6, 6, 6)], 20, 2)];
  await withFootprints(features, buildings => {
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 1)), true);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 1), { length: 0.6, width: 0.6 }), false);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 1), { width: NaN }), true);
    assert.equal(buildings.wouldCollide(state(0, 0), state(0, 1), { length: -1 }), true);
  });
});

test('collision result distinguishes unknown data, clear space, and a real feature', async () => {
  await withFootprints([footprint([rectangle(4, -4, 6, 4)], null, 17)], buildings => {
    const hit = buildings.getCollision(state(0, 0), state(3, 0));
    assert.equal(hit.collides, true);
    assert.equal(hit.knownCoverage, true);
    assert.equal(hit.building.id, '17');
    assert.equal(hit.feature, hit.building);
    assert.equal(hit.building.destroyable, false);
    assert.equal(buildings.getCollision(state(0, 0), state(0, 0)).reason, 'clear');
    buildings.clear();
    const missing = buildings.getCollision(state(0, 0), state(0, 0));
    assert.equal(missing.collides, true);
    assert.equal(missing.knownCoverage, false);
    assert.equal(missing.building, null);
  });
});

test('nearby lookup chooses the closest footprint boundary instead of building centre', async () => {
  await withFootprints([footprint([rectangle(4, -4, 100, 4)], 20, 7), footprint([rectangle(-8, -2, -7, 2)], 20, 8)], buildings => {
    const nearby = buildings.getNearbyBuilding(state(0, 0));
    assert.equal(nearby.id, '7');
    assert.ok(Math.abs(nearby.distance - 4) < 1e-6);
    assert.ok(Math.abs(nearby.entrance.longitude - coordinate([4, 0])[0]) < 1e-12);
    assert.ok(Math.abs(nearby.entrance.latitude - LATITUDE) < 1e-12);
    assert.equal(buildings.getNearbyBuilding(state(0, 0), 3), null);
    assert.equal(buildings.getNearbyBuilding(state(0, 0), Infinity), null);
  });
});

const OUTSIDE_LONGITUDE = LONGITUDE - 0.05;
const outsideState = (x, y, heading = 0) => ({ ...state(x, y, heading), longitude: state(x, y).longitude - 0.05 });
function outsideFeature(id, approximateHeight = 20, maximumHeight = 20, multipart = false) {
  const rings = [rectangle(4, -4, 6, 4).map(([longitude, latitude]) => [longitude - 0.05, latitude])];
  return {
    type: 'Feature', id,
    properties: { objectid: id, approx_hgt: approximateHeight, max_hgt: maximumHeight, base_elevation: 42 },
    geometry: multipart ? { type: 'MultiPolygon', coordinates: [rings, [rectangle(8, -4, 10, 4).map(([longitude, latitude]) => [longitude - 0.05, latitude])]] }
      : { type: 'Polygon', coordinates: rings },
  };
}
const renderedOptions = { render: true, longitude: OUTSIDE_LONGITUDE };

test('both heights exactly 20 feet allow all rendered parts to disappear and stop colliding', async () => {
  await withFootprints([outsideFeature(21, 20, 20, true)], (buildings, _requests, rendered) => {
    assert.equal(rendered.length, 1);
    const nearby = buildings.getNearbyBuilding(outsideState(0, 0));
    assert.equal(nearby.heightFeet, 20);
    assert.equal(nearby.maxHeightFeet, 20);
    assert.equal(nearby.destroyable, true);
    assert.equal(nearby.baseHeight, 13);
    assert.equal(nearby.sourceBaseElevationFeet, 42);
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), true);
    const result = buildings.tryDestroy(21);
    assert.equal(result.destroyed, true);
    assert.equal(result.building.baseHeight, 13);
    assert.equal(rendered[0].attributes.size, 2);
    assert.ok([...rendered[0].attributes.values()].every(attribute => attribute.show[0] === 0));
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(9, 0)), false);
    assert.equal(buildings.getNearbyBuilding(outsideState(0, 0)), null);
    assert.equal(buildings.tryDestroy(21).reason, 'already-destroyed');
  }, renderedOptions);
});

test('either height above 20 feet or any unknown/invalid height blocks destruction', async () => {
  const heights = [[20, 20.001], [20.001, 20], [20, null], [null, 20], [20, '20'], [NaN, 20], [20, Infinity], [20, 0], [-1, 20]];
  const features = heights.map(([approx, max], index) => outsideFeature(index + 30, approx, max));
  await withFootprints(features, (buildings, _requests, rendered) => {
    for (const feature of features) {
      const result = buildings.tryDestroy(feature.id);
      assert.equal(result.destroyed, false, `unexpected removal for ${JSON.stringify(feature.properties)}`);
      assert.equal(result.building.destroyable, false);
      assert.ok(['too-tall', 'unknown-height'].includes(result.reason));
    }
    assert.ok(rendered.flatMap(primitive => [...primitive.attributes.values()]).every(attribute => attribute.show[0] === 1));
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), true);
  }, renderedOptions);
});

test('downtown and not-yet-ready municipal geometry cannot be removed', async () => {
  const downtown = footprint([rectangle(4, -4, 6, 4)], 20, 51);
  downtown.properties.max_hgt = 20;
  await withFootprints([downtown], buildings => {
    assert.equal(buildings.tryDestroy(51).reason, 'downtown-mesh');
    assert.equal(buildings.getNearbyBuilding(state(0, 0)).destroyable, false);
  });
  await withFootprints([outsideFeature(52)], buildings => {
    assert.equal(buildings.tryDestroy(52).reason, 'not-rendered');
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), true);
  }, { ...renderedOptions, ready: false });
});

test('cell eviction preserves removal and explicit clear restores source geometry', async () => {
  await withFootprints([outsideFeature(61)], async (buildings, _requests, rendered) => {
    assert.equal(buildings.tryDestroy(61).destroyed, true);
    buildings.update(OUTSIDE_LONGITUDE - 0.04, LATITUDE);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    buildings.update(OUTSIDE_LONGITUDE, LATITUDE);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    assert.equal(buildings.hasCollisionData(OUTSIDE_LONGITUDE, LATITUDE), true);
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), false);
    assert.equal(rendered.length, 1, 'a removed feature must not be rendered again during streaming');
    buildings.clear();
    buildings.update(OUTSIDE_LONGITUDE, LATITUDE);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), true);
    assert.equal(rendered.length, 2);
    assert.equal(buildings.tryDestroy(61).destroyed, true);
  }, renderedOptions);
});

test('visibility toggles current and future primitives without clearing collision data', async () => {
  await withFootprints([outsideFeature(71)], async (buildings, _requests, rendered) => {
    assert.equal(rendered[0].show, true);
    buildings.setVisible(false);
    assert.equal(rendered[0].show, false);
    assert.equal(buildings.hasCollisionData(OUTSIDE_LONGITUDE, LATITUDE), true);
    assert.equal(buildings.wouldCollide(outsideState(0, 0), outsideState(3, 0)), true);
    buildings.clear();
    buildings.update(OUTSIDE_LONGITUDE, LATITUDE);
    for (let i = 0; i < 100; i++) await Promise.resolve();
    assert.equal(rendered[1].show, false);
    buildings.setVisible(true);
    assert.equal(rendered[1].show, true);
  }, renderedOptions);
});
