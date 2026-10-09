# September 12 city expansion

Frank authorized individualized ordinary houses based on surrounding/neighborhood photographs, while preserving real geography and individually recognizable landmarks. The entire city remains the target; the following is the implemented expansion, not an AAA completion claim.

## Implemented city layers

- Ordinary unnamed houses outside the existing detailed downtown extent use actual municipal polygon outlines, courtyard holes, supplied heights and terrain bases. Source-named buildings remain excluded from generated facades.
- Stable per-building IDs determine masonry shade, trim, door paint, window widths, spacing and cornice depth. Close houses have separate 3D frames, sills, lintels, doors and cornices; distant houses use cheaper facade shading. Roof outlines follow the source polygons. Exact ellipsoid transforms avoid the initial facade/old-wall overlap.
- Streaming selects the visible ground block rather than the camera's ground position. One batch contains up to 3,000 nearby house interpretations, with a one-million-vertex bound and closer detailed geometry limited to a 400,000-vertex budget. This is view-dependent coverage, not all Philadelphia simultaneously resident.
- Building damage removes the additional facade geometry with the original footprint extrusion and collision. The existing 20-foot protection rule is unchanged.
- Five locally retained 2023 city aerial photographs cover South, West, North Philadelphia, Penn Treaty Park and East Fairmount Park. Their observed roof spacing, setbacks and tree/clearing patterns guide the interpretation. They do not show unseen facades. Masonry ranges are authored, guided by the existing downtown photographic atlas, not claimed to be per-house measured colors.
- The local searchable directory contains all 5,061 returned named-building records, 1,147 landmark-point records and 507 public park boundaries. Search results navigate to their actual source locations. These inventories are not counts of newly authored landmark models. The Art Museum's existing photographed 3D model was visually verified through the directory.
- The existing 126,863-triangle source tree remains for close viewing. Blender derived a 21,199-triangle distance version with retained source texture material. The nearby display permits up to 64 trees within 180m, with model switching hysteresis.
- 72 interpreted stems in two manually reviewed photographed canopy patches are constrained by exact park polygons. A broader loader samples the city's 2018 Gain/No Change canopy polygons inside the 507 park boundaries, excludes mapped impervious surfaces and path clearance, and rejects building collisions. This permits woodland expansion wherever those sources return usable data. It does not establish exact individual stem positions, species, height or current canopy conditions.

## Existing free source provenance

- Buildings: City of Philadelphia Building_Footprints FeatureServer, fields objectid, building_name, approx_hgt and max_hgt. Named-building source polygons retained in artifacts/landmark-building-footprints.geojson.
- Landmarks and parks: the existing PASDA CityPhilly MapServer layer 32 and CityPhillyParks MapServer layer 5. Locally retained JSON includes every returned page; the landmark point endpoint truncates at 1,000, so it is explicitly paginated.
- Photographs: existing CityImagery_2023 tile service; exact URLs, tile bounds and SHA-256 hashes in public/data/neighborhoods/references.json.
- Woodland: the same Philadelphia ArcGIS organization, TreeCanopyChange_2008_2018/FeatureServer/0. CLASS_NAME Gain/No Change are used; Loss is excluded. A photographed woodland sample returned No Change; sampled road and river points returned no canopy feature. Impervious surfaces come from the existing PASDA CityPhilly layer 11. Historical canopy and interpreted stems remain distinct from present-day measurements.
- Tree: existing Rico Cilliers / Poly Haven CC0 source. Both original and derived models remain local. The 2018 canopy source and 2023 photographs are observations from different dates.

## Local Ollama work

The installed qwen3-coder:30b ran three bounded CPU coding jobs: a house profile candidate, a repair pass and a park-boundary function. Full prompts/results are in artifacts/local-agent. The first candidate incorrectly rejected string/zero IDs and returned the wrong reference identity; it was not integrated. The repair and boundary candidates were reviewed and corrected before use. Tests cover input handling, deterministic variation, courtyard/park holes, separate islands, source boundary constraints and destruction lifecycle.

Local model outputs are not authoritative visual inspections. These models do not process the reference pictures; picture inspection and final integration were performed by Codex. Codex orchestration still consumes account quota; no quota-saving percentage is claimed.

## Validation and unfinished scope

Production visual checks showed expanded South Philadelphia facades in overview and beside the placed Mustang. One stationary overview displayed 2,993 individual houses and 52 trees at approximately 50 FPS (180 frame samples; p50 interval 19ms, p95 37.4ms). This is a short sample, not a sustained driving benchmark or minimum frame-rate guarantee.

The real mapped-canopy ingestion path returned 160 candidate stems near East Fairmount Park in approximately 2.25 seconds, after park/canopy/pavement constraints. Candidate generation alone does not prove all stems rendered.

The subsequent real game view displayed 64 trees around the Fairmount park road and woodland, with both source and interpreted stems. Its short stationary sample measured approximately 34.4 FPS (180 frames, interval p50 29ms / p95 40.6ms). Vegetation remains representative and uneven in coverage, and the aerial ground retains baked vegetation. This is not a fully reconstructed forest.

Still unfinished: all-city landmark-by-landmark fidelity review/reconstruction, diverse photoreal facade assets, surveyed roof shapes, reliable bridges/tunnels, full forest validation, selective removal of baked vehicles/shadows/trees, and sustained performance/driving validation. Roads retain the original photographs and their known baked objects. House interpretations are a permitted expansion of the current game, not exact photographic replicas or a completed AAA city.

Repository state: controlled uncommitted work on master, no existing commits. No commit, push, publication or model download was performed. Existing source assets and rejected plain-ground experiment were preserved.

## Recorded result and additional visual checks

The actual running build was recorded for approximately 60 seconds at 1280 x 720, visiting East Fairmount Park, the Art Museum and South Philadelphia. The original capture is `artifacts/videos/philadelphia-drive-2026-09-12T08-01-02-786--6faa3433-efe2-481e-827b-29c791c0ed28.webm`. The playable H.264 copy is `artifacts/videos/philadelphia-city-expansion-2026-09-12.mp4`; its 30 FPS output repeats captured frames where needed without speeding up the tour or synthesizing motion. There is no audio. Frames at 4, 18, 35 and 56 seconds were visually reviewed in `artifacts/videos/city-tour-contact-sheet.jpg`. This is an overview tour, not evidence of sustained driving.

West and North Philadelphia were subsequently inspected in the live production view: the individualized house layer rendered in both neighborhoods. Larger buildings visibly retain plain municipal extrusions. Penn Treaty Park's river edge, lawns and paths were preserved, with the display reporting 64 nearby tree models and 1,359 house interpretations. Its short stationary sample was approximately 27.7 FPS. The UI reported incomplete mapped canopy loading there and in a later South view; existing inventory trees and locally prepared placements remain available. This is a known source/coverage limitation, not a completed forest. The latest browser error/warning log snapshot was empty, which does not negate the visible source-status warning.
