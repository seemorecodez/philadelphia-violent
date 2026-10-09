// Timing separation, one-second frame windows and effect-budget reporting
// adapted from CursorCore (Copyright (c) 2026 SeemoreCodez, MIT).
// See ENGINE-REUSE.md and public/licenses/CursorCore-MIT.txt. Rolling percentile
// buffers and the browser-facing contract are additions for Philadelphia Drive.

const SECTIONS = Object.freeze(['simulation', 'collision', 'sceneRenderSubmission']);
const validTime = value => Number.isFinite(value) && value >= 0;

function rollingSamples(capacity) {
  const values = new Float64Array(capacity);
  let count = 0; let next = 0; let total = 0;
  return {
    push(value) { values[next] = value; next = (next + 1) % capacity; count = Math.min(capacity, count + 1); total++; },
    clear() { count = 0; next = 0; total = 0; },
    summary() {
      if (!count) return { samples: 0, totalSamples: total, latest: null, mean: null, p50: null, p95: null, max: null };
      const ordered = Array.from(values.subarray(0, count)).sort((a, b) => a - b);
      const percentile = p => ordered[Math.max(0, Math.ceil(p * count) - 1)];
      return {
        samples: count, totalSamples: total, latest: values[(next + capacity - 1) % capacity],
        mean: ordered.reduce((sum, value) => sum + value, 0) / count,
        p50: percentile(0.5), p95: percentile(0.95), max: ordered[count - 1],
      };
    },
  };
}

/**
 * Local instrumentation only. frame() observes Cesium render callbacks, never
 * scan-out or GPU completion. Timed sections measure synchronous CPU wall time;
 * nested collision time can also be included in simulation time, so do not sum
 * overlapping sections. No network, timers, hooks, quality changes or logging.
 */
export function createPerformanceMonitor({
  now = () => performance.now(), windowSize = 180, targetFps = 60,
} = {}) {
  const capacity = Number.isFinite(windowSize) ? Math.max(2, Math.min(600, Math.floor(windowSize))) : 180;
  const target = Number.isFinite(targetFps) && targetFps > 0 ? Math.min(240, targetFps) : 60;
  const frameBudgetMs = 1000 / target;
  const frameIntervals = rollingSamples(capacity);
  const sections = Object.fromEntries(SECTIONS.map(section => [section, rollingSamples(capacity)]));
  const budgets = new Map();
  const activeTokens = new WeakSet();
  let generation = 0; let paused = false;
  let previousFrame = null; let windowStarted = null; let windowFrames = 0;
  let totalFrames = 0; let slowFrames = 0; let fps = null;
  let pausedFrames=null;

  function frame(timestampMs = now()) {
    if (paused || !validTime(timestampMs) || (previousFrame !== null && timestampMs <= previousFrame)) return false;
    totalFrames++;
    if (previousFrame === null) {
      previousFrame = timestampMs; windowStarted = timestampMs; return true;
    }
    const interval = timestampMs - previousFrame;
    previousFrame = timestampMs;
    frameIntervals.push(interval);
    if (interval > frameBudgetMs * 1.5) slowFrames++;
    windowFrames++;
    const elapsed = timestampMs - windowStarted;
    if (elapsed >= 1000) {
      fps = windowFrames * 1000 / elapsed;
      windowStarted = timestampMs; windowFrames = 0;
    }
    return true;
  }

  function record(section, milliseconds) {
    if (paused || !Object.hasOwn(sections, section) || !validTime(milliseconds)) return false;
    sections[section].push(milliseconds); return true;
  }

  function begin(section) {
    if (paused || !Object.hasOwn(sections, section)) return null;
    const start = now();
    if (!validTime(start)) return null;
    const token = Object.freeze({ section, start, generation });
    activeTokens.add(token); return token;
  }

  function end(token) {
    if (!token || !activeTokens.has(token)) return false;
    activeTokens.delete(token);
    if (token.generation !== generation || paused) return false;
    return record(token.section, now() - token.start);
  }

  function measure(section, work) {
    const token = begin(section);
    try { return work(); } finally { end(token); }
  }

  function setBudget(kind, count, limit) {
    if (typeof kind !== 'string' || !/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(kind)
        || !validTime(count) || !validTime(limit) || (!budgets.has(kind) && budgets.size >= 16)) return false;
    budgets.set(kind, { count, limit, exceeded: count > limit }); return true;
  }

  function resetFrameWindow() {
    previousFrame = null; windowStarted = null; windowFrames = 0; fps = null;
  }

  function setPaused(value) {
    const next = Boolean(value);
    if (next === paused) return;
    pausedFrames=next?{fps,interval:frameIntervals.summary()}:null;
    paused = next; generation++;
    resetFrameWindow();
    // Retain section history for inspection but do not mix a hidden-tab pause
    // into the next frame-interval window.
    frameIntervals.clear();
  }

  function reset() {
    pausedFrames=null;
    generation++; resetFrameWindow(); frameIntervals.clear();
    for (const section of Object.values(sections)) section.clear();
    totalFrames = 0; slowFrames = 0; budgets.clear();
  }

  function getStats() {
    const timing = Object.fromEntries(SECTIONS.map(section => [section, sections[section].summary()]));
    const effects = Object.fromEntries([...budgets].map(([kind, value]) => [kind, { ...value }]));
    const warnings = [];
    for (const [kind, budget] of budgets) if (budget.exceeded) warnings.push(`${kind}: ${budget.count} exceeds limit ${budget.limit}`);
    for (const [section, data] of Object.entries(timing)) {
      if (data.samples >= 5 && data.p95 > frameBudgetMs) warnings.push(`${section} CPU elapsed p95 exceeds the ${target} FPS frame budget`);
    }
    return {
      schemaVersion: 1, measurement: 'browser CPU wall time and observed Cesium frame callbacks',
      gpuTimeMeasured: false, processCpuMeasured: false, paused,
      targetFps: target, frameBudgetMs, windowCapacity: capacity,
      fps:pausedFrames?.fps??fps, totalFrames, slowFrames,
      frameIntervalMs: pausedFrames?.interval??frameIntervals.summary(), sectionsMs: timing, budgets: effects, warnings,
    };
  }

  return { frame, record, begin, end, measure, setBudget, getStats, reset, setPaused };
}
