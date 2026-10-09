# Chinatown / Reading Terminal gameplay conversion

## Governing outcome

The latest user specification in ACCEPTANCE.md governs: approximately meter-for-meter Philadelphia as an open-world video game, with one substantial district brought to final gameplay quality before expanding the systems across the city. The Art Museum and existing source/model work remain. The former keep-aerial-visible requirement is superseded. Aerial photographs are a retained reference, not road/vehicle/vegetation geometry.

**Current trust state: controlled uncommitted development, not an accepted final-quality district.** Walk, normal-speed continuous drive, aerial LOD and complete performance/fidelity gates remain open.

## Implemented behavior

- The default launch selects Chinatown. Play Philadelphia connects the existing world and starts the car at the middle of real southbound N 10th Street segment 440944, longitude -75.15599476 / latitude 39.95493557. Aerial imagery is hidden. Other location/search controls and original city assets remain available.
- A local district pack covers approximately 1.24 x 1.06 km, bounding box [-75.1625,39.951,-75.148,39.9605]. Actual source surface boundaries become triangulated road, sidewalk, concrete, parking, grass, earth and gravel meshes. The implementation partitions these into 150 available 100m cells; up to 36 nearby cells reside at once. It is not seamless whole-city final-detail coverage.
- Asphalt/concrete finish is authored. Sidewalks have 16cm gameplay relief and source-boundary curb faces. Holes and cell clipping preserve source area. Marked source pedestrian crossings guide 3m-wide paint geometry; unmarked/unknown crossings stay unpainted. Double yellow paint on two-way source streets is an authored treatment, not a verified lane inventory.
- Geometry loads locally with two concurrent preparation jobs and one mesh upload per frame. Actual source heightmaps are sampled asynchronously at level 15; 5m cached height grids support player/NPC/street-object contact. No fabricated zero-height fallback is permitted. Bridge codes are excluded from ground pavement; bridge gameplay remains unfinished.
- The directed street graph preserves FT/TF/B direction and source node connectivity, excluding expressways, ramps, non-traversable classes and walking-only arcs. Initial traffic uses up to four existing Mustang assets with wheel animation. It follows the source street graph, stops for nearby actors/vehicles, and despawns at distance. It does not yet have proper signal control, negotiated intersections, smooth lane-change/turn trajectories or robust multi-lane driving.
- Up to four existing animated MakeHuman actors follow retained pedestrian PATH centerlines, pause for nearby actors/cars, reverse at their current path ends and despawn at distance. This is limited path following; multi-block pedestrian routing, crossings, broader appearance variety, schedules and interaction AI are unfinished.
- The performance panel counts actual WebGL draw submissions and submitted triangles, reports JS heap when exposed, local mesh-buffer estimates, cell-ready latency, resident/pending cells and population. Total process RAM and VRAM are explicitly unavailable; buffer estimates and browser heap must not be labeled VRAM or total RAM.

## Source and local-model evidence

The existing [Philadelphia/PASDA impervious surface source](https://mapservices.pasda.psu.edu/server/rest/services/pasda/CityPhilly/MapServer/11) supplied 2,079 returned surface records. The [Philadelphia Street Centerline source](https://services.arcgis.com/fLeGjb7u4uXqeF9q/ArcGIS/rest/services/Street_Centerline/FeatureServer/0) supplied 360 segments. The existing DVRPC pedestrian network supplied 1,033 path/crossing records. Full geometry, source metadata, query URLs and hashes are retained under public/data/district. These are inventories, not counts of finished assets. Source years differ.

The installed qwen3-coder:30b completed a local route-helper assignment in 72.6 seconds, 924 output tokens. Its candidate used the wrong coordinate contract, reversed the north heading and returned the wrong total length. It was not integrated unchanged. The reviewed implementation and independent actual-one-way test are in district-navigation.js and game-district.test.js; prompts/results/review remain in artifacts/local-agent/district-route-*.

## Validation and failures

The first full tests stalled. Isolated geometry preparation and a single cell/material rendered, but the controller with real terrain stalled while flat terrain succeeded. Cesium Globe.getHeight ray-tests rendered terrain; invoking it for thousands of mesh vertices caused excessive CPU work. The implementation now bulk-samples the heightmap through sampleTerrain and uses cached contact heights.

After that fix, the isolated actual-terrain controller rendered more than 2,000 frames with all 36 cells ready, zero failed cells, approximately 123,600 submitted district mesh triangles and a last-observed cell latency of 123.7ms. This is an isolated diagnostic, not a driving benchmark.

The full game then automatically reached street level with aerial imagery off. A screenshot visibly showed the Mustang, asphalt, raised sidewalks/curbs and a pedestrian. Live counters reported four traffic models, four pedestrian models and 36 ready cells. One paused snapshot reported 241 WebGL draws, 4,425,875 submitted triangles, 565.4MiB JS heap and 22.6MiB district mesh-buffer estimate. Its timing included earlier loading stalls and is not a steady-state performance claim. Later changes cache actor/camera/street-object terrain contact and preserve paused frame measurements.

139 regression checks passed; build passed. These establish code/source contracts, not the user's game-quality gate. Attempts to automate continuous input encountered browser-control timeouts; no successful several-block walk or normal-speed continuous drive is claimed yet. The observed district still has many plain source walls, incomplete furniture, limited population behavior, missing parked traffic assets, missing traffic signals and no accepted HLOD/aerial transition. Surface residency currently ends near the streaming radius, which can expose unfinished ground at higher altitude. No final-fidelity or citywide-completion percentage is claimed.

## Changed scope and next boundary

New runtime modules: district-geometry, game-district, district-navigation, district-population, render-counters. Integration: world, main, performance, performance-panel and street-objects. New source/build scripts and district diagnostic; tests/game-district.test.js exercises polygon holes, clipping, terrain sampling, geometric relief, coordinate scale and one-way direction. ACCEPTANCE.md and RECONSTRUCTION-TARGET.md retain the superseding target. Existing model/source assets were not deleted. The earlier overview video remains an older build and must not represent this district conversion.

The next acceptance work is to complete representative street facades/entrances, stabilize actual continuous movement and population, establish genuine surface/architecture LOD and HLOD, and run the walk/drive/aerial tests with fresh performance captures. Do not expand this system to all Philadelphia or call the district final quality until those gates pass. No commit, push or publication was performed; the repository remains on master with no initial commit and attributable untracked project work.

## Final checkpoint

Final production build: index-Ci86onom.js / world-BF6CL68x.js. Final regression: 139 passed, zero failures. A late auto-spawn check briefly showed street surfaces before the city buildings appeared; the final spawn now also waits for city/terrain tile readiness and the overview loading interval. The fresh final launch visually confirmed the car on 10th Street with the city buildings present and aerial imagery off. The saved view is artifacts/district/street-level-no-aerial.png; its plain facades visibly fail final architectural quality. The browser-control input attempts did not produce a successful continuous driving or walking record, so those tests remain unverified. The earlier failures and plain-wall quality gap are retained above.

Final basic interaction check: the real F key successfully left the stopped car, changed the HUD to WALK, rendered the player on the imagery-free street beside a separate NPC, and exposed the nearby protected building entrance action. Saved evidence: artifacts/district/on-foot-no-aerial.png. This verifies vehicle-to-foot transition, not continuous several-block walking. The subsequent held-input automation still timed out; no continuous walk or drive pass is claimed.
