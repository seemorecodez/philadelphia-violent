import test from 'node:test';
import assert from 'node:assert/strict';
import { createVehicleState, stepVehicle, stopVehicle, degreesToRadians, DRIVING_LIMITS } from '../src/driving.js';

const origin = (overrides = {}) => ({
  ...createVehicleState({ longitude: -75.1636, latitude: 39.9526, height: 12 }),
  ...overrides,
});
const drive = (state, controls, seconds, dt = 0.02) => {
  for (let i = 0; i < Math.round(seconds / dt); i++) state = stepVehicle(state, controls, dt);
  return state;
};

test('north and east headings move in the corresponding Philadelphia geographic directions', () => {
  const start = origin();
  const north = drive(start, { throttle: 1 }, 2);
  const east = drive(origin({ heading: Math.PI / 2 }), { throttle: 1 }, 2);
  assert.ok(north.latitude > start.latitude);
  assert.ok(Math.abs(north.longitude - start.longitude) < 1e-10);
  assert.ok(east.longitude > start.longitude);
  assert.ok(Math.abs(east.latitude - start.latitude) < 1e-8);
  assert.equal(north.height, 12);
  // One degree of longitude is shorter at Philadelphia's latitude.
  const metresEast = (east.longitude - start.longitude) * Math.PI / 180 * 6_378_137 * Math.cos(degreesToRadians(start.latitude));
  assert.ok(Math.abs(metresEast - east.distance) < 0.001);
});

test('reverse travels backward and reverses the effect of steering', () => {
  const start = origin();
  const reverse = drive(start, { throttle: -1 }, 1);
  assert.ok(reverse.speed < 0);
  assert.ok(reverse.latitude < start.latitude);
  assert.ok(reverse.distance > 0);
  const rightForward = stepVehicle(origin({ speed: 5 }), { steer: 1 }, 0.05);
  const rightReverse = stepVehicle(origin({ speed: -5 }), { steer: 1 }, 0.05);
  assert.ok(rightForward.heading > 0 && rightForward.heading < Math.PI);
  assert.ok(rightReverse.heading > Math.PI && rightReverse.heading < Math.PI * 2);
  assert.ok(Math.abs(rightForward.heading - (Math.PI * 2 - rightReverse.heading)) < 1e-10);
});

test('braking stops both directions without creating movement in the other direction', () => {
  for (const speed of [0.1, -0.1, 20, -8]) {
    const stopped = drive(origin({ speed }), { brake: 1, throttle: 1 }, 3);
    assert.equal(Math.abs(stopped.speed), 0);
    const again = stepVehicle(stopped, { brake: 1, throttle: -1 }, 0.05);
    assert.equal(Math.abs(again.speed), 0);
    assert.equal(again.distance, stopped.distance);
  }
});

test('opposite throttle reaches zero before selecting the new direction', () => {
  let state = stepVehicle(origin({ speed: 0.01 }), { throttle: -1 }, 0.05);
  assert.equal(Math.abs(state.speed), 0);
  state = stepVehicle(state, { throttle: -1 }, 0.05);
  assert.ok(state.speed < 0);
  state = stepVehicle(origin({ speed: -0.01 }), { throttle: 1 }, 0.05);
  assert.equal(Math.abs(state.speed), 0);
  assert.ok(stepVehicle(state, { throttle: 1 }, 0.05).speed > 0);
});

test('resting vehicle cannot turn and handbrake holds against throttle', () => {
  assert.deepEqual(stepVehicle(origin(), { steer: 1 }, 0.05), origin());
  const held = drive(origin(), { throttle: 1, steer: 1, handbrake: true }, 2);
  assert.deepEqual(held, origin());
});

test('coasting decreases speed and a tiny throttle never reverses its gear', () => {
  const coasting = drive(origin({ speed: 10 }), {}, 2);
  assert.ok(coasting.speed > 0 && coasting.speed < 10);
  assert.equal(Math.abs(stepVehicle(origin({ speed: 0.0001 }), { throttle: 0.0001 }, 0.05).speed), 0);
});

test('sustained input respects forward and reverse speed limits', () => {
  const forward = drive(origin(), { throttle: 1 }, 100);
  const reverse = drive(origin(), { throttle: -1 }, 100);
  assert.equal(forward.speed, DRIVING_LIMITS.forwardSpeed);
  assert.equal(reverse.speed, -DRIVING_LIMITS.reverseSpeed);
});

test('normal frame rates produce close travel distances and speeds', () => {
  const coarse = drive(origin(), { throttle: 1, steer: 0.15 }, 10, 0.05);
  const fine = drive(origin(), { throttle: 1, steer: 0.15 }, 10, 0.01);
  assert.ok(Math.abs(coarse.distance - fine.distance) < 0.4);
  assert.ok(Math.abs(coarse.speed - fine.speed) < 0.08);
  assert.ok(Math.abs(coarse.heading - fine.heading) < 0.005);
});

test('elapsed time spikes are bounded and invalid elapsed time does not advance', () => {
  const state = origin({ speed: 20 });
  assert.deepEqual(stepVehicle(state, { throttle: 1 }, 30), stepVehicle(state, { throttle: 1 }, 0.05));
  for (const dt of [0, -1, NaN, Infinity]) assert.deepEqual(stepVehicle(state, { throttle: 1 }, dt), state);
});

test('state is immutable, invalid controls release, and corrupt coordinates are rejected', () => {
  const state = Object.freeze(origin({ speed: 5 }));
  const next = stepVehicle(state, Object.freeze({ throttle: 1 }), 0.05);
  assert.notEqual(next, state);
  assert.equal(state.speed, 5);
  assert.deepEqual(stepVehicle(state, { throttle: NaN, steer: Infinity, brake: NaN }, 0.05), stepVehicle(state, {}, 0.05));
  const stopped = stopVehicle(state);
  assert.equal(stopped.speed, 0);
  assert.equal(state.speed, 5);
  assert.throws(() => createVehicleState({ longitude: NaN, latitude: 40 }), TypeError);
  assert.throws(() => createVehicleState({ longitude: -75, latitude: 91 }), RangeError);
  assert.throws(() => stepVehicle({ ...state, speed: NaN }, {}, 0.05), TypeError);
});

test('crossing the longitude boundary wraps while preserving continuous travel', () => {
  const state = origin({ longitude: 179.999999, heading: Math.PI / 2, speed: 20 });
  const next = stepVehicle(state, {}, 0.05);
  assert.ok(next.longitude >= -180 && next.longitude < -179.999);
  assert.ok(next.distance > 0.9 && next.distance < 1.1);
});
