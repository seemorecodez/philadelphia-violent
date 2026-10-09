export const WALKER_SHAPE = Object.freeze({ length: 0.55, width: 0.55 });
export function moveOnFoot(state, input = {}, dt = 0) {
  const seconds = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.05));
  const turn = Number.isFinite(input.steer) ? Math.max(-1, Math.min(1, input.steer)) : 0;
  const forward = Number.isFinite(input.throttle) ? Math.max(-1, Math.min(1, input.throttle)) : 0;
  const heading = state.heading + turn * 2.25 * seconds;
  const speed = input.handbrake ? 0 : forward * (input.sprint && forward>0 ? 4.5 : 1.65);
  const distance = speed * seconds;
  return { ...state, heading, speed,
    longitude: state.longitude + Math.sin(heading) * distance / (111320 * Math.cos(state.latitude * Math.PI / 180)),
    latitude: state.latitude + Math.cos(heading) * distance / 111320,
    distance: state.distance + Math.abs(distance),
  };
}
export function groundDistance(a, b) {
  return Math.hypot((a.longitude - b.longitude) * 111320 * Math.cos(a.latitude * Math.PI / 180), (a.latitude - b.latitude) * 111320);
}

export function intersectsParkedCar(walker, car, shape, radius = WALKER_SHAPE.width / 2) {
  if (!car) return false;
  const east=(walker.longitude-car.longitude)*111320*Math.cos(car.latitude*Math.PI/180);
  const north=(walker.latitude-car.latitude)*111320;
  const along=east*Math.sin(car.heading)+north*Math.cos(car.heading);
  const across=east*Math.cos(car.heading)-north*Math.sin(car.heading);
  return Math.abs(along)<shape.length/2+radius && Math.abs(across)<shape.width/2+radius;
}
