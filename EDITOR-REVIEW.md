# Philadelphia editorial pass — September 11, 2026

Frank's acceptance target remains a faithful, detailed Philadelphia driving/walking game using free public data, with story work deferred. This pass addresses real experience and rendering defects. It does not certify AAA quality or complete one-to-one reconstruction.

## Current acceptance status

**Below target; live stability failed.** The last preview reported a native browser page crash after city placement. Its cause is unresolved. The source-photograph sidewalk renderer is implemented but its alignment, destruction and sustained runtime are unverified. A proposed lower-memory atlas redesign was not implemented. Neither the build nor automated tests establish city fidelity or runtime stability.

Frank resumed work after questioning its quota cost and reiterated that every building must match the actual city. Preserve that full-city requirement. Reviewing sources is enabling work only; no new reconstructed building or citywide fidelity improvement has been delivered by that review.

## Subsequent recovery from existing free sources

The next pass recovered actual photographs for the existing Chinatown block `philly_0000` (I3S OBJECTID 2351). Original COLLADA geometry, UVs, normals and the unchanged 2048-pixel JPEG atlas were converted to a 1.30 MB GLB. A separate 3 KB mesh preserves 14 source-only triangles. Identity and geometry were compared with the existing stream, including all eight LOD ancestors; source-version checks prevent replacing a changed dataset silently. The published source placement is used without moving only this block to a different height datum.

Live development-preview comparisons showed the original gray block, then its real facade and roof photographs at the same camera position. The menu toggle restored the gray source and re-enabled the photographs. A car was placed beside the block and the recovered facade was visible from street level. The subsequent driving-input check timed out; it is not a passed driving test. These comparisons used the diagnostic that omits raised sidewalk primitives, while preserving the original photographic globe. They do not resolve the earlier native crash or validate the normal sidewalk renderer.

The production build includes the recovery by default; **Chinatown** is now a destination and **Original building photos** is the comparison control. This is one recovered historical block, not a full-city reconstruction, new capture, or cleaned photographic material. Other source buildings remain as supplied. Baked cars, trees, shadows and photographic distortions are still present.

Frank's local Ollama `qwen3-coder:30b` was used for a bounded code review. Its unsupported recommendations were rejected. A follow-up lifetime inspection added cleanup for unloaded tile feature references, with a regression test. The local response reached its output limit; see LOCAL-AGENT.md for the complete disposition and the first request's timeout. This helper uses only the localhost model; Codex verification still consumes Codex usage.

Attributable paths: `src/city-photo-{recovery,assets}.js`, integration in `src/world.js` and `src/main.js`, the Chinatown entry in `src/locations.js`, original/remainder assets and provenance in `public/models/city/`, `scripts/convert-city-source.py`, `scripts/source-match-*.mjs`, `scripts/local-city-review.mjs`, and `tests/city-photo-recovery.test.js`. Original source files were preserved. Build and test results are recorded in VERIFICATION.md. Repository remains a controlled dirty state with no commit baseline; overall fidelity and stability acceptance remain unmet.

## Implemented changes

- Replaced the permanent control panels with an Explore menu, compact instruments and context actions. Original data attribution remains visible. Source notices remain inspectable in the menu instead of overwriting driving instructions.
- Reframed driving and walking closer to the actual assets. Drag the scene to orbit, scroll to change distance; moving resumes a gradual forward view. Reduced-motion preference disables automatic orbit return and speed-dependent field of view.
- Added a stable daylight atmosphere and bounded shadows from live models in the explicit High setting. Balanced retains the original shadow-free rendering budget. Original city-photo lighting/shadows are retained; detailed I3S meshes do not cast another shadow layer.
- Restored original 2023 photographs onto mapped sidewalk tops using geographic UVs and shared L21 tile atlases. Source pixels are mosaicked unchanged, not generated or repainted. The 8 cm slab depth remains an authored approximation. Missing photo data leaves original ground visible. Shared atlas cost is bounded but substantial: up to approximately 162 MiB CPU/GPU pixel allocations plus source JPEGs and overhead.
- High detail now requests available source detail without Cesium's additional dynamic horizon coarsening. This cannot invent absent facade data. Ground-level props begin streaming after car placement, reducing competition with the initial overview.
- Car and character transforms now update after the current frame's movement. Vertical terrain corrections no longer advance the walking gait.
- Interior traversal waits for a ready, visible character, preserves speed across 10/20/60 FPS through bounded substeps, and retains an escape route after room/character loading errors. Old room callbacks no longer modify a newly entered interior.
- Pause preserves velocity while stopping simulation, wheel motion and footsteps. Paused menus request rendering only when the scene changes, and pause intervals are excluded from performance samples. A failed visual city tile no longer permanently locks movement/Resume; ground and independently loaded building-boundary checks still gate travel.
- Both cars can align their rigid bodies to nine observed terrain samples. Missing, steep or discontinuous terrain preserves the previous valid pose. This is visual terrain alignment, not suspension, tire deformation, or surveyed wheel contact.
- Added opt-in recorded CC0 footsteps. Recordings are loaded locally and stop for pause, hidden tabs, collisions/stationary movement, vehicle entry and mute. No generic engine sound was substituted. Source/license and decoding verified; listening quality remains unverified in this tool environment.

## Findings that remain unresolved

The city itself is the largest visual gap. Much of the downtown source genuinely lacks textures; outer neighborhoods still use measured footprint massing with approximate heights. Existing photo atlases are automatically rendered where present. There is no missing global texture switch.

Baked trees, stationary cars and shadows in aerial/source photos still require selective, source-supported reconstruction. Removing those pixels without observations does not establish an exact reconstruction of what was underneath. The rejected plain-ground experiment remains inactive.

The game still lacks road/bridge deck geometry, lane-aware traffic, outdoor crowds, full collision/vehicle physics, animation blending/turn/start/stop/foot IK, diverse authored NPCs, a broad vehicle fleet, complete furnished interiors, destruction-quality physics and a sustained performance target. Indoor cameras remain the authored layout view. Huracan wheel animation is still unfinished. Storyline remains intentionally deferred.

## Verification

- Production build passes; Cesium remains a large bundle. No deployment or publication performed.
- The prior full test suite reported 121 passes; the subsequently added camera regression passed separately. This is not a fresh aggregate run of the current source. Five tests concern the inactive ground experiment. Test counts do not establish graphics fidelity.
- Earlier live checks in this pass confirmed street driving to 19 mph, braking, pause retaining 17 mph across separate observations, leaving the car, walking, free-look camera movement and recorded-footstep asset readiness.
- Final source-photo alignment, damage, interior traversal, terrain-pose and sustained stability checks remain unfinished. The later native crash prevents acceptance of the combined build.

No commit baseline exists in this repository. Files remain untracked; no commit or remote push was requested.
