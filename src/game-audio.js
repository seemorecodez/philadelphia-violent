// Recorded footsteps only. No engine sound is implied by this module.
export const FOOTSTEP_AUDIO = Object.freeze([
  '/audio/footsteps/01-footstep.wav', '/audio/footsteps/02-footstep.wav',
  '/audio/footsteps/03-footstep.wav', '/audio/footsteps/04-footstep.wav',
]);

/**
 * Opt-in sound: call enable() synchronously from a click/key gesture.
 * update() accepts actual movement speed in m/s and cumulative distance in m.
 * Pass only time spent moving, not key pressure, so collisions stay silent.
 */
export function createGameAudio({
  createContext = () => new (globalThis.AudioContext ?? globalThis.webkitAudioContext)(),
  fetchAsset = (...args) => globalThis.fetch(...args),
  document = globalThis.document,
  now = () => globalThis.performance.now(),
  onStatus = () => {},
  volume = 0.8,
} = {}) {
  let context, output, buffers, loading, destroyed = false, muted = false;
  let status = 'disabled', lastMode, lastDistance, lastTime, walked = 0, variant = 0;
  const voices = new Map();
  const abort = new AbortController();
  const notify = (value) => { status = value; onStatus({ status, muted, available: 'footsteps' }); };
  const forgetMovement = () => { lastMode = lastDistance = lastTime = undefined; walked = 0; };
  function stopAll() {
    for (const [voice, gain] of voices) {
      voice.onended = null;
      try { voice.stop(); } catch { /* A just-ended one-shot is already stopped. */ }
      voice.disconnect();
      gain.disconnect();
    }
    voices.clear();
    forgetMovement();
  }
  function visibilityChanged() { if (document?.hidden) stopAll(); }
  document?.addEventListener('visibilitychange', visibilityChanged);

  async function enable() {
    if (destroyed) return false;
    try {
      // Resume before the first await, while the browser still has the gesture.
      if (!context) {
        context = createContext();
        output = context.createGain();
        output.gain.value = Math.max(0, Math.min(1, Number(volume) || 0));
        output.connect(context.destination);
      }
      const resumed = context.resume();
      if (!buffers && !loading) {
        notify('loading');
        loading = Promise.all(FOOTSTEP_AUDIO.map(async (url) => {
          const response = await fetchAsset(url, { signal: abort.signal });
          if (!response.ok) throw new Error(`Footstep asset unavailable (${response.status}).`);
          return context.decodeAudioData(await response.arrayBuffer());
        }));
      }
      const [decoded] = await Promise.all([buffers ?? loading, resumed]);
      if (destroyed) return false;
      if (context.state !== 'running') { notify('gesture-required'); return false; }
      buffers = decoded;
      forgetMovement();
      notify('ready');
      return true;
    } catch {
      if (!destroyed) { loading = null; stopAll(); notify('unavailable'); }
      return false;
    }
  }

  function step(running) {
    if (voices.size >= 3) return;
    const source = context.createBufferSource();
    source.buffer = buffers[variant++ % buffers.length];
    // Preserve recorded pitch. Run changes cadence rather than stretching audio.
    const gain = context.createGain();
    gain.gain.value = running ? 1 : 0.85;
    source.connect(gain); gain.connect(output);
    source.onended = () => { voices.delete(source); source.disconnect(); gain.disconnect(); };
    voices.set(source, gain);
    source.start();
  }

  function update({ mode, speed = 0, distance, paused = false } = {}) {
    if (destroyed) return;
    if (paused || muted || document?.hidden || status !== 'ready' || context?.state !== 'running'
      || !['walking', 'interior'].includes(mode) || !Number.isFinite(speed) || Math.abs(speed) < 0.05) {
      stopAll();
      return;
    }
    const time = now();
    let traveled = 0;
    if (mode === lastMode && lastTime !== undefined) {
      if (Number.isFinite(distance) && Number.isFinite(lastDistance)) traveled = distance - lastDistance;
      else traveled = Math.abs(speed) * Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    } else walked = 0;
    lastMode = mode; lastDistance = distance; lastTime = time;
    // Ignore teleports/reset counters, and never replay a backlog after a stall.
    if (traveled < 0 || traveled > 1.5 || !Number.isFinite(traveled)) { walked = 0; return; }
    walked += traveled;
    const running = speed > 2.3;
    const spacing = running ? 1.25187 : 0.47042;
    if (walked >= spacing) { walked %= spacing; step(running); }
  }

  function setMuted(value) {
    if (destroyed) return;
    muted = !!value;
    if (muted) stopAll();
    notify(status);
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    abort.abort(); stopAll();
    document?.removeEventListener('visibilitychange', visibilityChanged);
    output?.disconnect();
    context?.close().catch(() => {});
    buffers = undefined;
    notify('destroyed');
  }
  return { enable, update, setMuted, destroy, getStatus: () => ({ status, muted, available: 'footsteps' }) };
}
