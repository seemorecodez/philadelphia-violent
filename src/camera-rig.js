const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Third-person framing in metres; orbit changes the view, never actor heading. */
export function createCameraRig({ reducedMotion = false } = {}) {
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  let idle = 0;
  let dragging = false;
  return {
    begin() { dragging = true; idle = 0; },
    end() { dragging = false; },
    drag(dx, dy) {
      if (!dragging || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      yaw = Math.atan2(Math.sin(yaw - dx * 0.006), Math.cos(yaw - dx * 0.006));
      pitch = clamp(pitch + dy * 0.004, -0.14, 0.85);
      idle = 0;
    },
    scroll(delta) {
      if (!Number.isFinite(delta)) return;
      zoom = clamp(zoom * Math.exp(clamp(delta, -300, 300) * 0.001), 0.7, 2.3);
    },
    reset() { yaw = 0; pitch = 0; zoom = 1; idle = 0; dragging = false; },
    sample({ mode = 'driving', camera = 'chase', speed = 0, dt = 0, paused = false } = {}) {
      const seconds = Number.isFinite(dt) ? clamp(dt, 0, 0.1) : 0;
      idle += seconds;
      if (!dragging && !paused && Math.abs(speed) > 0.3 && idle > 1.8 && !reducedMotion) {
        const decay = Math.exp(-2.5 * seconds);
        yaw *= decay; pitch *= decay;
      }
      if (camera === 'hood' && mode === 'driving') {
        return { yaw: 0, back: -0.45, height: 1.45, ahead: 24, targetHeight: 1.35, side: 0, fov: 65 };
      }
      const walking = mode === 'walking';
      const aerial = camera === 'aerial' && !walking;
      const back = aerial ? 22 : walking ? 3.8 : 8.4 + Math.min(Math.abs(speed) * 0.075, 2.4);
      const height = aerial ? 35 : walking ? 2.1 : 2.9;
      const targetHeight = 1.05;
      const radius = Math.hypot(back, height - targetHeight) * zoom;
      const elevation = clamp(Math.atan2(height - targetHeight, back) + pitch, 0.035, 1.3);
      return {
        yaw, back: Math.cos(elevation) * radius,
        height: targetHeight + Math.sin(elevation) * radius,
        ahead: aerial ? 0 : (walking ? 0.5 : 1.8) * Math.max(0, 1 - Math.abs(yaw) / 0.35),
        targetHeight, side: walking ? 0.4 : 0,
        fov: reducedMotion || walking || aerial ? 60 : 60 + Math.min(Math.abs(speed) * 0.25, 8),
      };
    },
  };
}
