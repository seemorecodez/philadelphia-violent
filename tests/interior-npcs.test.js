import test from 'node:test';
import assert from 'node:assert/strict';
import { Cartesian3, Matrix4 } from 'cesium';
import { createInteriorNpcs, INTERIOR_NPC_ROUTES } from '../src/interior-npcs.js';
import { LAYOUTS, interiorBlocked } from '../src/interiors.js';

function harness(kind, extraBlocked = () => false, initialStatus = 'ready') {
  const entities = new Set();
  const renderers = [];
  const layout = LAYOUTS[kind];
  assert.ok(layout, `missing production ${kind} layout`);
  const controller = createInteriorNpcs({ entities: {
    add(entity) { entities.add(entity); return entity; },
    remove(entity) { return entities.delete(entity); },
  } }, {
    kind, layout, modelUrl: '/models/character/human.glb',
    // The fixture retains local metre coordinates so actual entity callbacks
    // can be checked against the production floorplan without a WebGL context.
    world: (x, y, z) => new Cartesian3(x, y, z),
    blocked: (x, y, radius) => interiorBlocked(layout, x, y, radius) || extraBlocked(x, y, radius),
    rendererFactory(_viewer, options) {
      const entity = {
        position: { getValue: () => Matrix4.getTranslation(options.getMatrix(), new Cartesian3()) },
        model: { uri: options.modelUrl, runAnimations: { getValue: options.getMoving } },
      };
      entities.add(entity);
      const model = { ready: false, show: false, dead: false, isDestroyed() { return this.dead; } };
      const renderer = {
        status: initialStatus, model,
        setStatus(value) {
          this.status = value;
          model.ready = value === 'ready'; model.show = value === 'ready';
          if (value === 'ready') options.onReady(model);
        },
        destroy() { this.status = 'destroyed'; model.dead = true; model.show = false; entities.delete(entity); },
      };
      renderer.setStatus(initialStatus); renderers.push(renderer);
      return renderer;
    },
  });
  const positions = () => [...entities].map(entity => entity.position.getValue());
  return { controller, entities, positions, layout, renderers };
}

test('all authored routes stay in the shipped room geometry over a full walking interval', () => {
  for (const kind of ['home', 'shop', 'lobby']) {
    const { controller, entities, positions, layout } = harness(kind);
    assert.equal(entities.size, kind === 'lobby' ? 2 : 1);
    const initial = positions();
    let moved = false;
    for (let frame = 0; frame < 2400; frame++) {
      controller.tick(.05, false, null);
      const current = positions();
      for (const [index, point] of current.entries()) {
        assert.equal(interiorBlocked(layout, point.x, point.y, .34), false, `${kind} NPC crossed a wall or furnishing`);
        moved ||= Math.hypot(point.x - initial[index].x, point.y - initial[index].y) > .1;
      }
      if (current.length === 2) assert.ok(Math.hypot(current[0].x - current[1].x, current[0].y - current[1].y) >= .76);
    }
    assert.equal(moved, true, `${kind} route never advanced`);
    assert.ok([...entities].every(entity => entity.model.uri === '/models/character/human.glb' && !entity.box && !entity.ellipsoid));
    controller.destroy();
  }
});

test('paused ticks freeze position, animation and conversation time', () => {
  const { controller, positions, entities } = harness('home');
  const player = { x: -1.6, y: -3.7 };
  const spoken = controller.interact(player);
  assert.equal(spoken.nearbyName, 'Maya');
  assert.ok(spoken.dialogue.length > 20);
  const initial = positions();
  for (let frame = 0; frame < 400; frame++) {
    assert.equal(controller.tick(.05, true, player).dialogue, spoken.dialogue);
  }
  assert.deepEqual(positions(), initial);
  assert.ok([...entities].every(entity => entity.model.runAnimations.getValue() === false));
  controller.destroy();
});

test('the NPC stops before the player and the host can block player penetration', () => {
  const { controller, positions, entities } = harness('home');
  const player = { x: .20, y: -2.1 };
  for (let frame = 0; frame < 200; frame++) controller.tick(.05, false, player);
  const position = positions()[0];
  assert.ok(Math.hypot(position.x - player.x, position.y - player.y) >= 1.45);
  assert.equal([...entities][0].model.runAnimations.getValue(), false);
  assert.equal(controller.blocks(position.x, position.y), true);
  assert.equal(controller.blocks(0, -4.5), false);
  controller.destroy();
});

test('new route obstructions stop movement; unknown layouts create no fallback figures', () => {
  let obstacle = false;
  const { controller, positions } = harness('home', (x, _y, radius) => obstacle && x + radius > -.5);
  obstacle = true;
  for (let frame = 0; frame < 200; frame++) controller.tick(.05, false, null);
  assert.ok(positions()[0].x <= -.84 + 1e-9);
  controller.destroy();
  let added = 0;
  const unknown = createInteriorNpcs({ entities: { add() { added++; }, remove() {} } }, {
    kind: 'unmapped', layout: LAYOUTS.home,
    modelUrl: '/models/character/human-adult.glb',
    world: (x, y, z) => new Cartesian3(x, y, z), blocked: () => false,
  });
  assert.equal(added, 0);
  assert.deepEqual(unknown.tick(.05, false, { x: 0, y: 0 }), { nearbyName: null, dialogue: null });
  unknown.destroy();
});

test('conversation requires proximity and a clear route through the actual room', () => {
  let barrier = false;
  const { controller } = harness('home', (_x, y) => barrier && y < -2.7 && y > -3.0);
  const player = { x: -1.6, y: -3.7 };
  assert.equal(controller.interact(player).nearbyName, 'Maya');
  barrier = true;
  assert.deepEqual(controller.interact(player), { nearbyName: null, dialogue: null });
  assert.deepEqual(controller.interact({ x: 999, y: 999 }), { nearbyName: null, dialogue: null });
  controller.destroy();
});

test('time spikes and invalid inputs cannot jump routes, and disposal is idempotent', () => {
  const { controller, positions, entities } = harness('home');
  for (let frame = 0; frame < 20; frame++) controller.tick(.05, false, null);
  const before = positions()[0];
  controller.tick(10000, false, null);
  const after = positions()[0];
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) <= .72 * .05 + 1e-9);
  controller.tick(NaN, false, { x: NaN, y: Infinity });
  assert.deepEqual(positions()[0], after);
  assert.equal(INTERIOR_NPC_ROUTES.home.length, 1);
  controller.destroy(); controller.destroy();
  assert.equal(entities.size, 0);
  assert.deepEqual(controller.tick(.05, false, { x: 0, y: 0 }), { nearbyName: null, dialogue: null });
  assert.deepEqual(controller.interact({ x: 0, y: 0 }), { nearbyName: null, dialogue: null });
  assert.equal(controller.blocks(0, 0), false);
});

test('loading NPCs neither move nor collide nor talk; readiness enables normal behavior', () => {
  const { controller, positions, entities, renderers } = harness('home', () => false, 'loading');
  const initial = positions()[0];
  const player = { x: -1.6, y: -3.7 };
  for (let frame = 0; frame < 200; frame++) {
    assert.deepEqual(controller.tick(.05, false, player), { nearbyName: null, dialogue: null });
  }
  assert.deepEqual(positions()[0], initial);
  assert.equal(controller.blocks(initial.x, initial.y), false);
  assert.deepEqual(controller.interact(player), { nearbyName: null, dialogue: null });
  assert.equal([...entities][0].model.runAnimations.getValue(), false);
  renderers[0].setStatus('ready');
  assert.equal(controller.blocks(initial.x, initial.y), true);
  assert.equal(controller.interact(player).nearbyName, 'Maya');
  for (let frame = 0; frame < 100; frame++) controller.tick(.05, false, null);
  assert.ok(Math.hypot(positions()[0].x - initial.x, positions()[0].y - initial.y) > .1);
  controller.destroy();
});

test('failed or hidden NPCs immediately lose collision, conversation and movement', () => {
  for (const status of ['failed', 'hidden', 'destroyed-model']) {
    const { controller, positions, entities, renderers } = harness('home');
    const player = { x: -1.6, y: -3.7 };
    assert.equal(controller.interact(player).nearbyName, 'Maya');
    if (status === 'failed') renderers[0].setStatus('failed');
    else if (status === 'hidden') renderers[0].model.show = false;
    else renderers[0].model.dead = true;
    const initial = positions()[0];
    assert.equal(controller.blocks(initial.x, initial.y), false);
    assert.deepEqual(controller.interact(player), { nearbyName: null, dialogue: null });
    for (let frame = 0; frame < 100; frame++) assert.deepEqual(controller.tick(.05, false, player), { nearbyName: null, dialogue: null });
    assert.deepEqual(positions()[0], initial);
    assert.equal([...entities][0].model.runAnimations.getValue(), false);
    controller.destroy();
  }
});

test('a renderer that fails before first readiness never creates a gameplay participant', () => {
  const { controller, positions, renderers } = harness('home', () => false, 'loading');
  renderers[0].setStatus('failed');
  const initial = positions()[0];
  for (let frame = 0; frame < 200; frame++) controller.tick(.05, false, null);
  assert.deepEqual(positions()[0], initial);
  assert.equal(controller.blocks(initial.x, initial.y), false);
  assert.deepEqual(controller.interact({ x: initial.x, y: initial.y }), { nearbyName: null, dialogue: null });
  controller.destroy();
});
