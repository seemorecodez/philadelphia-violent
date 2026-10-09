# CursorCore reuse assessment

CursorCore can contribute CPU-side timing, effect budgets and simulation architecture to Philadelphia Drive. Its renderer is a small **2D software compositor**; it cannot replace Cesium's 3D terrain, textured mesh, depth, lighting or globe renderer. No measured city-rendering speedup has been established. The concrete adaptation delivered here is `src/performance.js`, with tests and retained MIT attribution.

## Source inspected

Read-only source inspection on September 11, 2026 covered both actual repositories:

- Original: `<LOCAL_HOME>/Documents/kimi/workspace/cursorcore`.
- Newer character edition: `<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions`.

Both repository `AGENTS.md` files require evidence-backed claims and MIT public source. Neither repository was edited, built, benchmarked, or started. No signing material was opened. The citations below use the newer edition, which includes the expanded character pipeline.

| Finding | Source evidence | Consequence for this game |
| --- | --- | --- |
| Software surface stores ARGB pixels and loops over sprite pixels; transforms are 2D. | [software.rs:7](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/software.rs:7>), [software.rs:61](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/software.rs:61>) | Useful for small UI effects; no city-mesh triangle/depth pipeline exists here. |
| Windows uses a 256×256 surface and `UpdateLayeredWindow`. | [windows.rs:148](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/cpu/windows.rs:148>), [windows.rs:440](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/cpu/windows.rs:440>) | Native overlay code is not directly usable by the browser. Full-screen city pixels have a much larger workload. |
| `GpuRenderer.render()` calls its CPU compositor. | [gpu/mod.rs:58](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/gpu/mod.rs:58>) | The optional name and `wgpu` dependency do not demonstrate an implemented GPU accelerator. |
| Immutable frame layers separate simulation from presentation; the compositor has a dedicated worker and bounded queues, while render waits for completion. | [render/mod.rs:56](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/mod.rs:56>), [windows.rs:655](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/cpu/windows.rs:655>), [windows.rs:882](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/render/cpu/windows.rs:882>) | A useful worker/snapshot pattern if measured geography or collision processing blocks the browser thread. It is not an existing multicore 3D renderer. |
| Physics uses `Vec2`, lifetime-limited particles and springs. | [physics/mod.rs:1](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/physics/mod.rs:1>) | Potential bounded decorative effects; not vehicle dynamics, structural destruction or building interiors. |
| Theme cache evicts `HashMap.keys().next()`, then inserts an entire theme. | [theme/mod.rs:1812](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/theme/mod.rs:1812>), [theme/mod.rs:1840](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/theme/mod.rs:1840>) | Preserve the budgeting idea. Do not copy this as a proven LRU or a strict admission cap: access order is not tracked and an oversized individual theme can exceed the limit. |

## What was adapted

[FrameRateTracker](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/lib.rs:81>) counts observed frames in a one-second window. CursorCore also measures [render elapsed time separately](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/lib.rs:1847>) and reports [particle budgets and timing warnings](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/src/lib.rs:1865>). `src/performance.js` implements that narrow design in JavaScript. Rolling p50/p95 buffers, browser pause handling and the following API are additions for this game; no Rust library, native hook, IPC host or account is required.

```js
const monitor = createPerformanceMonitor({ windowSize: 180, targetFps: 60 });
monitor.frame(performance.now()); // once per observed Cesium frame callback
monitor.measure('simulation', updateSimulation);
monitor.measure('collision', queryCollision);
const token = monitor.begin('sceneRenderSubmission');
monitor.end(token); // end at the corresponding scene postRender hook
monitor.setBudget('trees', renderedTreeCount, treeLimit);
const snapshot = monitor.getStats();
```

Integration ownership remains with the game's world/UI code. `frame()` measures callback cadence; `sceneRenderSubmission` records CPU wall time between the chosen scene hooks. This is **not GPU completion time**, display scan-out, total process CPU usage or a speedup measurement. Collision timing may be nested inside simulation timing; these values are deliberately not added into a total. `measure()` surrounds synchronous work; async network time should not be treated as simulation CPU time.

Each metric retains at most 180 samples by default (configurable 2–600); percentile sorting happens only when a snapshot is requested. Missing measurements remain null. `setPaused(true)` suspends measurement and invalidates outstanding timers; resuming starts a fresh cadence window so hidden-tab or disconnected time is excluded. `reset()` discards a capture. The caller should invoke pause/resume for `visibilitychange` and connection state. Counts can cover at most 16 effect categories. Warnings report limits; the monitor never changes detail settings, schedules a timer, sends telemetry or measures other processes.

`node --test --test-isolation=none tests/performance.test.js` passes **five** tests covering measured cadence, bounded percentiles, nested/exception timing, pause/reset lifecycle and effect-budget snapshots. This verifies the adapter, not in-game FPS. The original [MIT license](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/LICENSE:1>) is retained in `public/licenses/CursorCore-MIT.txt` with SeemoreCodez's copyright.

## Existing evidence and practical next decision

The retained [Criterion results](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/benchmark-results.json:1>) are dated July 30, 2026 on a Ryzen 5 6600H. A two-sprite portal composition averages about **0.201 ms**. Its [actual benchmark](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/engine/benches/render_benchmark.rs:44>) uses a 72×72 portal and 48×48 cursor on a 256×256 software surface. That scope provides no city-rendering estimate.

The [isolated character result](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/cinematic/pilot/volt-segmented-v1/isolated-cpu-benchmark.json:1>) reports 0.263 ms average and 0.503 ms p99 for cached **128×128** Pillow composition, with 643.7 ms cold loading. Its [code](<<LOCAL_HOME>/Documents/Codex/2026-07-29/c-users-frank-documents-kimi-workspace/cursorcore-character-editions/cinematic/tools/benchmark_volt_pilot.py:31>) caches image frames before timing the warm loop; the result explicitly excludes installed compositor FPS. Its traced-memory number excludes those preloaded caches and does not measure total native process memory. The character pipeline also invokes Blender for offline production; it is not evidence of a CPU 3D runtime.

Use the new game capture to distinguish high collision/simulation wall time from scene submission and slow frame cadence. High CPU geography work can justify a bounded Web Worker plus immutable results; high render cost calls for measured mesh/texture/draw-call changes while preserving the requested visible detail. GPU-specific conclusions need GPU timing or a controlled browser profile. No data here supports replacing Cesium with CursorCore or claiming that the telemetry itself accelerates rendering.

## Runtime integration checkpoint

The adapter is connected to world.js and the optional Performance panel. It reports simulation, collision queries, scene-hook elapsed time and bounded tree/street/sidewalk counts. VERIFICATION.md records actual short-run samples and their limits. There is still no before/after rendering speedup result or GPU timing.
