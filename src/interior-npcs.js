import { HeadingPitchRoll, Transforms } from 'cesium';
import { createCharacterRenderer } from './character-renderer.js';

const RADIUS = 0.34;
const WALK_SPEED = 0.72;
const PLAYER_STOP_DISTANCE = 1.45;
const TALK_DISTANCE = 2.4;
const ROUTE_STEP = 0.15;

// Original, explicitly authored paths for the shipped layout-contract.json.
// These positions describe game rooms, not activity in real Philadelphia homes.
export const INTERIOR_NPC_ROUTES = Object.freeze({
  home: [{ id: 'resident', name: 'Maya', route: [[-1.6,-2.1],[0.45,-2.1],[0.45,-0.5],[-1.6,-0.5]], dialogue: 'Welcome in. The kitchen is through the doorway, and the front door is behind you.' }],
  shop: [{ id: 'clerk', name: 'Sam', route: [[-2.6,4.55],[2.6,4.55]], dialogue: 'Take your time looking around. The way out is through the front of the shop.' }],
  lobby: [
    { id: 'visitor-west', name: 'Alex', route: [[-5.8,-5.5],[-5.8,-3.3],[-3.7,-3.3],[-3.7,-5.5]], dialogue: 'I am waiting for a friend. There is seating through those doorways.' },
    { id: 'visitor-east', name: 'Jordan', route: [[3.7,-5.3],[5.8,-5.3],[5.8,-3.3],[3.7,-3.3]], dialogue: 'Nice to have a quiet spot off the street. The front entrance is just over there.' },
  ],
});

const finitePosition = value => value && Number.isFinite(value.x) && Number.isFinite(value.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// CharacterRenderer.ready is a Promise, not a boolean. Its onReady callback
// supplies the actual model so a ready-but-hidden actor is also excluded.
const participating = npc => npc.renderer?.status === 'ready' && npc.model?.ready === true
  && npc.model.show === true && !npc.model.isDestroyed?.();

function segmentClear(from, to, radius, blocked) {
  const steps = Math.max(1, Math.ceil(distance(from, to) / ROUTE_STEP));
  for (let index = 0; index <= steps; index++) {
    const fraction = index / steps;
    if (blocked(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, radius)) return false;
  }
  return true;
}

function sweptDistance(from, to, other) {
  const dx = to.x - from.x; const dy = to.y - from.y;
  const square = dx * dx + dy * dy;
  const fraction = square ? Math.max(0, Math.min(1, ((other.x - from.x) * dx + (other.y - from.y) * dy) / square)) : 0;
  return Math.hypot(from.x + dx * fraction - other.x, from.y + dy * fraction - other.y);
}

/**
 * Small authored interior population using the supplied detailed human asset.
 * world(x,y,z) returns a Cartesian world position; blocked(x,y,radius) checks the
 * host layout. Missing or incompatible route data produces no substitute NPCs.
 */
export function createInteriorNpcs(viewer, {
  world, layout, kind, modelUrl, blocked, rendererFactory = createCharacterRenderer,
} = {}) {
  if (typeof world !== 'function' || typeof blocked !== 'function') {
    throw new TypeError('Interior NPCs require world(x,y,z) and blocked(x,y,radius) functions.');
  }
  if (!layout || !Number.isFinite(layout.width) || !Number.isFinite(layout.depth)) {
    throw new TypeError('Interior NPCs require a bounded authored room layout.');
  }
  if (typeof modelUrl !== 'string' || modelUrl.length === 0) throw new TypeError('A real character model URL is required.');
  const npcs = [];
  let destroyed = false;
  let conversation = null;
  const empty = () => ({ nearbyName: null, dialogue: null });
  const inLayout = (x, y, radius) => Math.abs(x) <= layout.width / 2 - radius
    && Math.abs(y) <= layout.depth / 2 - radius;
  const obstructed = (x, y, radius) => !inLayout(x, y, radius) || blocked(x, y, radius);
  for (const definition of INTERIOR_NPC_ROUTES[kind] ?? []) {
    const route = definition.route.map(([x, y]) => ({ x, y }));
    if (route.some((point, index) => !segmentClear(point, route[(index + 1) % route.length], RADIUS, obstructed))) continue;
    if (npcs.some(other => distance(route[0], other) < RADIUS * 2 + .08)) continue;
    const npc = { ...definition, route, ...route[0], target: 1, heading: 0, moving: false, wait: .6 + npcs.length * .5, model: null };
    const initial = route[1];
    npc.heading = Math.atan2(initial.x - npc.x, initial.y - npc.y);
    npc.renderer = rendererFactory(viewer, {
      id: `interior-npc-${kind}-${npc.id}`,
      modelUrl,
      getMatrix: () => Transforms.headingPitchRollToFixedFrame(world(npc.x, npc.y, .02), new HeadingPitchRoll(npc.heading - Math.PI / 2, 0, 0)),
      getShow: () => !destroyed,
      getMoving: () => npc.moving,
      onReady: model => { if (!destroyed) npc.model = model; },
    });
    npcs.push(npc);
  }

  function nearest(player) {
    if (destroyed || !finitePosition(player) || !inLayout(player.x, player.y, 0)) return null;
    let result = null; let closest = TALK_DISTANCE;
    for (const npc of npcs) {
      if (!participating(npc)) continue;
      const gap = distance(npc, player);
      // Furniture and partitions block conversation as well as walking routes.
      if (gap <= closest && segmentClear(player, npc, .03, obstructed)) { result = npc; closest = gap; }
    }
    return result;
  }

  function tick(dt, paused = false, player = null) {
    if (destroyed) return empty();
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(dt, .05)) : 0;
    for (const npc of npcs) {
      npc.moving = false;
      if (paused || seconds === 0 || !participating(npc)) continue;
      if (npc.wait > 0) { npc.wait = Math.max(0, npc.wait - seconds); continue; }
      if (finitePosition(player) && distance(npc, player) <= PLAYER_STOP_DISTANCE) continue;
      const target = npc.route[npc.target];
      const gap = distance(npc, target);
      if (gap < .015) { npc.target = (npc.target + 1) % npc.route.length; npc.wait = .65; continue; }
      const amount = Math.min(gap, WALK_SPEED * seconds);
      const next = { x: npc.x + (target.x - npc.x) / gap * amount, y: npc.y + (target.y - npc.y) / gap * amount };
      if (!segmentClear(npc, next, RADIUS, obstructed)) continue;
      if (finitePosition(player) && sweptDistance(npc, next, player) < PLAYER_STOP_DISTANCE) continue;
      if (npcs.some(other => other !== npc && participating(other) && sweptDistance(npc, next, other) < RADIUS * 2 + .08)) continue;
      const desired = Math.atan2(next.x - npc.x, next.y - npc.y);
      const turn = Math.atan2(Math.sin(desired - npc.heading), Math.cos(desired - npc.heading));
      npc.heading += turn * (1 - Math.exp(-seconds * 8));
      npc.x = next.x; npc.y = next.y; npc.moving = true;
    }
    const nearby = nearest(player);
    if (conversation) {
      if (!paused) conversation.remaining -= seconds;
      if (conversation.remaining <= 0 || nearby?.id !== conversation.id) conversation = null;
    }
    return { nearbyName: nearby?.name ?? null, dialogue: conversation?.text ?? null };
  }

  function interact(player) {
    const npc = nearest(player);
    if (!npc) { conversation = null; return empty(); }
    conversation = { id: npc.id, text: npc.dialogue, remaining: 7 };
    npc.moving = false;
    npc.wait = Math.max(npc.wait, 1);
    return { nearbyName: npc.name, dialogue: npc.dialogue };
  }

  // Optional host hook to keep the player from passing through a stationary NPC.
  function blocks(x, y, radius = .3) {
    if (destroyed || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(radius) || radius < 0) return false;
    return npcs.some(npc => participating(npc) && Math.hypot(x - npc.x, y - npc.y) < radius + RADIUS + .02);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true; conversation = null;
    for (const npc of npcs) npc.renderer.destroy();
    npcs.length = 0;
  }

  return { tick, interact, destroy, blocks };
}
