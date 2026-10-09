/** Geographic, dependency-free bicycle model. Heading is clockwise from north. */
const EARTH_RADIUS_METRES = 6_378_137;
const TAU = Math.PI * 2;
const WHEELBASE_METRES = 2.7;

export const DRIVING_LIMITS = Object.freeze({
  forwardSpeed: 32,
  reverseSpeed: 9,
  maxStepSeconds: 0.05,
});

export const degreesToRadians = (degrees) => degrees * Math.PI / 180;
export const radiansToDegrees = (radians) => radians * 180 / Math.PI;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const normalizeHeading = (value) => ((value % TAU) + TAU) % TAU;
const normalizeLongitude = (value) => ((value + 180) % 360 + 360) % 360 - 180;
const control = (value, min = 0, max = 1) => Number.isFinite(value) ? clamp(value, min, max) : 0;

function assertFinite(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
}

function validateState(state) {
  for (const key of ['longitude', 'latitude', 'height', 'heading', 'speed', 'distance']) {
    assertFinite(state[key], key);
  }
  if (Math.abs(state.latitude) > 90) throw new RangeError('latitude must be between -90 and 90 degrees.');
  if (state.distance < 0) throw new RangeError('distance cannot be negative.');
}

export function createVehicleState({ longitude, latitude, height = 0, heading = 0 }) {
  const state = { longitude, latitude, height, heading, speed: 0, distance: 0 };
  validateState(state);
  return { ...state, longitude: normalizeLongitude(longitude), heading: normalizeHeading(heading) };
}

export function stopVehicle(state) {
  validateState(state);
  return { ...state, speed: 0 };
}

/**
 * Advance at most 50 ms, so a suspended tab cannot teleport the vehicle.
 * Positive throttle selects forward; negative throttle selects reverse. Selecting
 * the opposite direction brakes to zero first; a following step can accelerate.
 * Positive steer turns right. Height is supplied by the renderer/terrain layer.
 * Invalid controls are treated as released; invalid state is rejected explicitly.
 */
export function stepVehicle(state, { throttle = 0, brake = 0, steer = 0, handbrake = false } = {}, dt = 0) {
  validateState(state);
  const seconds = control(dt, 0, DRIVING_LIMITS.maxStepSeconds);
  if (seconds === 0) return { ...state };

  throttle = control(throttle, -1, 1);
  brake = control(brake);
  steer = control(steer, -1, 1);
  const oldSpeed = clamp(state.speed, -DRIVING_LIMITS.reverseSpeed, DRIVING_LIMITS.forwardSpeed);
  const direction = Math.sign(oldSpeed);
  const changingDirection = direction !== 0 && throttle * direction < 0;
  const drag = oldSpeed === 0 ? 0 : 0.3 + 0.005 * oldSpeed * oldSpeed;
  const deceleration = drag + brake * 12 + (handbrake ? 18 : 0) + (changingDirection ? Math.abs(throttle) * 8 : 0);
  let speed;
  if (brake > 0 || handbrake || changingDirection || throttle === 0) {
    speed = direction * Math.max(0, Math.abs(oldSpeed) - deceleration * seconds);
  } else {
    const acceleration = throttle * (throttle > 0 ? 6 : 3);
    speed = oldSpeed + (acceleration - direction * drag) * seconds;
    // A small throttle must never let drag reverse the selected gear.
    if (Math.sign(speed) !== Math.sign(throttle)) speed = 0;
  }
  speed = clamp(speed, -DRIVING_LIMITS.reverseSpeed, DRIVING_LIMITS.forwardSpeed);

  const averageSpeed = (oldSpeed + speed) / 2;
  const steeringAngle = steer * 0.5 / (1 + Math.abs(averageSpeed) / 12);
  const turn = averageSpeed / WHEELBASE_METRES * Math.tan(steeringAngle) * seconds;
  const arcDistance = averageSpeed * seconds;
  const halfTurn = turn / 2;
  const chordDistance = arcDistance * (Math.abs(halfTurn) < 1e-8 ? 1 : Math.sin(halfTurn) / halfTurn);
  const bearing = state.heading + halfTurn;
  const angularDistance = chordDistance / EARTH_RADIUS_METRES;
  const latitude = degreesToRadians(state.latitude);
  const nextLatitude = Math.asin(clamp(
    Math.sin(latitude) * Math.cos(angularDistance)
      + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    -1, 1,
  ));
  const longitudeChange = Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
    Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude),
  );

  return {
    ...state,
    longitude: normalizeLongitude(state.longitude + radiansToDegrees(longitudeChange)),
    latitude: radiansToDegrees(nextLatitude),
    heading: normalizeHeading(state.heading + turn),
    speed,
    distance: state.distance + Math.abs(arcDistance),
  };
}
