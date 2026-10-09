import test from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceMonitor } from '../src/performance.js';

test('observed frame windows measure cadence instead of inferring FPS from CPU work', () => {
  const monitor = createPerformanceMonitor({ windowSize: 60 });
  assert.equal(monitor.getStats().fps, null);
  for (let i = 0; i <= 60; i++) { monitor.frame(i * 1000 / 60); monitor.record('simulation', 0.1); }
  const result = monitor.getStats();
  assert.equal(result.fps, 60);
  assert.equal(result.frameIntervalMs.samples, 60);
  assert.ok(Math.abs(result.frameIntervalMs.p95 - 1000 / 60) < 0.001);
  assert.equal(result.sectionsMs.simulation.p50, 0.1);
  assert.equal(result.gpuTimeMeasured, false);
  assert.equal(monitor.frame(900), false);
});

test('rolling percentiles stay bounded and old spikes are evicted', () => {
  const monitor = createPerformanceMonitor({ windowSize: 4 });
  for (const value of [1000, 1, 2, 3, 4]) monitor.record('collision', value);
  assert.deepEqual(monitor.getStats().sectionsMs.collision, {
    samples: 4, totalSamples: 5, latest: 4, mean: 2.5, p50: 2, p95: 4, max: 4,
  });
  assert.equal(monitor.record('collision', NaN), false);
  assert.equal(monitor.record('collision', -1), false);
  assert.equal(monitor.record('missing', 1), false);
});

test('nested section clocks remain separate and callback errors preserve behavior', () => {
  let time = 0;
  const monitor = createPerformanceMonitor({ now: () => time });
  monitor.measure('simulation', () => {
    time += 2;
    monitor.measure('collision', () => { time += 3; });
    time += 1;
  });
  assert.equal(monitor.getStats().sectionsMs.simulation.latest, 6);
  assert.equal(monitor.getStats().sectionsMs.collision.latest, 3);
  assert.throws(() => monitor.measure('sceneRenderSubmission', () => { time += 5; throw new Error('original failure'); }), /original failure/);
  assert.equal(monitor.getStats().sectionsMs.sceneRenderSubmission.latest, 5);
  const token = monitor.begin('collision'); time++;
  assert.equal(monitor.end(token), true); assert.equal(monitor.end(token), false);
});

test('pause and reset reject old timers and exclude hidden-tab time from cadence', () => {
  let time = 0;
  const monitor = createPerformanceMonitor({ now: () => time });
  monitor.frame(0); monitor.frame(20);
  const old = monitor.begin('simulation');
  monitor.setPaused(true); time = 10_000;
  assert.equal(monitor.frame(), false); assert.equal(monitor.end(old), false);
  monitor.setPaused(false); monitor.frame(); time += 20; monitor.frame();
  assert.equal(monitor.getStats().frameIntervalMs.samples, 1);
  assert.equal(monitor.getStats().frameIntervalMs.p95, 20);
  const stale = monitor.begin('collision'); monitor.reset(); time++;
  assert.equal(monitor.end(stale), false); assert.equal(monitor.getStats().totalFrames, 0);
});

test('effect-budget telemetry is bounded, detached from returned snapshots, and never changes quality', () => {
  const monitor = createPerformanceMonitor();
  assert.equal(monitor.setBudget('trees', 13, 12), true);
  const result = monitor.getStats();
  assert.equal(result.budgets.trees.exceeded, true);
  assert.match(result.warnings[0], /13 exceeds limit 12/);
  result.budgets.trees.count = 0;
  assert.equal(monitor.getStats().budgets.trees.count, 13);
  for (let i = 0; i < 20; i++) monitor.setBudget(`effect${i}`, 0, 12);
  assert.equal(Object.keys(monitor.getStats().budgets).length, 16);
});
