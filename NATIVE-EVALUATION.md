# Philadelphia native development — Unreal production target

September 13: Frank explicitly selected Unreal-only production. This supersedes
the historical migration/engine-choice restrictions below. Those experiments
remain evidence with their original limits. Current production entry points are
Launch Unreal Philadelphia.cmd and Launch Philadelphia Drive.cmd; both run Unreal.
Citywide native coverage, finished architecture and 1080p/60 FPS remain unmet.

The full goal remains the attached goal-objective.md and ACCEPTANCE.md: a convincing
Chinatown/Reading Terminal district followed by expansion across real Philadelphia.
Frank selected **stable 60 FPS at 1920×1080** on this computer. Walking, driving,
collision, intersections, pedestrians, interiors, actual persistence, aerial LOD,
architecture, destruction, atmosphere and city expansion all remain required.

## Current boundary

### September 13: graphics-first courtyard wing pass

Frank explicitly redirected this session away from further walking-mechanics work
and toward source-scale realism. Graphics remain the active outcome. The new
courtyard wing has physical window recesses, stone architraves, solid projecting
sills and metal glazing divisions at the original source location. Only source
wall faces 2415/2416 are replaced. Its 33 opening positions follow the retained
atlas; tree-obscured bays follow neighboring repetition. Recess depth (22 cm),
profiles, pane divisions and material microstructure are interpreted, not surveyed.

The first uniform masonry material was visually rejected: see
`artifacts/unreal/museum-20260913-131114/walk.png`. It looked too plain and lost the
photographed stone character. The final candidate uses a built-in image-generation
cleanup of the retained public photograph, with native UV registration, physical
openings and normal/roughness treatment. Original GLB and photograph are unchanged.
The generated material is reconstructed artwork, not original survey imagery;
some shading and minor architectural details differ. The full prompt, input crop
and boundaries are recorded in
`Unreal/Philadelphia/SourceAssets/Museum/wing/materials/PROVENANCE.md`.
The workspace texture is `materials/cleaned-facade-v1.png` in that same wing folder.
Do not show the standalone generated texture as if it were a game screenshot.

**Actual native graphics comparison:**

- Before wing: `artifacts/unreal/museum-20260913-130044/walk.png`.
- Rejected uniform wall: `artifacts/unreal/museum-20260913-131114/walk.png`.
- Revised wing: `artifacts/unreal/museum-20260913-132454/player.png`.

The final view uses the saved player pose from the before image:
(-172957.311,-168657.821,1600.623) cm, yaw -140, pitch -6. It is a fixed third-person
camera in the actual native map, explicitly **visual-only**. It is not a traversal
pass. Reproduce with `test-south.ps1 -Neighborhood museum -ArtReview`.
The revised stone variation, relief and removal of the wing's baked tree imagery
are visible. The material is still below photorealistic acceptance; glazing,
lighting consistency, close-range details, portico and opposite wing need work.
Whole-city realism is not accepted by this museum detail pass.

Final fixed-view AC-powered 1080p native100% measurement: 2,175 frames, mean
13.793 ms (72.50 reciprocal FPS), p95 14.533 ms, p99 14.986 ms, process RAM
3,721,465,856 bytes. This measures only that fixed art view, not gameplay load or
the complete district. No full-city 60 FPS claim is made.

Traversal status correction: the earlier `130044` and `131114` 130 m probes passed,
but the later `132101` probe stalled at 111.377 m. Its cause is unresolved; there
was no forward obstacle hit in its retained trace. Do not claim the stair/input
path is universally fixed. Per Frank's steering, no further mechanics correction
was attempted; the graphics comparison used the explicit art-review camera.

The facade material's first import rejected its non-power-of-two dimensions.
The supported Interchange setting and Unreal's power-of-two texture build resize
resolved it without changing the source image. Final import reported zero errors
and warnings. The detail mesh has 2,330 triangles across four material slots;
the native retained museum derivative has 2,543 triangles. These counts establish
artifact identity, not art quality. Source receipts and hashes are in
`Unreal/Philadelphia/SourceAssets/Museum/wing/source.json` and the native import
record `artifacts/unreal/museum-wing-import.json`.

**Next unfinished graphics outcome:** close-range material/lighting and relief
review of this wing, then source-backed detail on the portico/opposite wing.
Indistinguishability from real life is an unmet target, not a delivered result.

### September 13: museum terrace, native art and traversal checkpoint

**Demonstrated improvement: the approach reaches a photo-traced stone terrace
and physical fountain rim. Final art and citywide gameplay remain unaccepted.**
The new surface follows the retained source photograph's pale grid, octagonal
surround, eight dark inlays and two meander border bands. It replaces 4,632.61 m2
of source ground with native geometry and stone PBR materials. The circular basin
has a separate translucent water surface with time-driven normal shading. This
check verifies its rendered appearance, not fountain animation or pool entry.
The source plan is traced; stone microstructure, simplified meanders and basin
vertical dimensions are interpretations. Fountain fixtures/jets are not modeled.
The museum facade still uses visibly limited source photography and needs work.

Preserved before: `artifacts/unreal/museum-20260913-112650/walk.png`.
After: `artifacts/unreal/museum-20260913-130044/walk.png`.
Both are actual third-person native views after the 130 m approach, with the same
camera settings and heading. Endpoint difference is approximately 18.3 cm in XY
and 1.3 cm in Z; this is a close matched view, not a pixel-identical camera pose.
The after image removes the blurry photographic marks from the replaced paving;
it still reveals flat-looking material response and unfinished facade detail.

Actual W-input traversal passed: 130.0222 m, grounded stop, about 11.752 m climb,
2.37 cm endpoint error from the prescribed -140-degree route. No walking teleport.
The spawn waits for real ground collision; the probe ignores incidental mouse
look and rejects a distance-only pass in the wrong direction. Startup and travel
timeouts are separate. Collision stall failures now retain position and hit data.

On AC power, battery 75%, native 1920x1080 at 100% internal resolution:

| Measure | Tested 130 m route |
| --- | --- |
| Walking frames | 5,128 |
| Mean frame time / reciprocal FPS | 14.254 ms / 70.16 FPS |
| p95 / p99 | 15.960 / 16.696 ms |
| Overlapping main sample GPU mean / p95 | 12.365 / 13.177 ms |
| Main sample process RAM | 3,691,802,624 bytes |
| Stable 60 FPS for final district | Not established |

The main sample's legacy `stationary_native_source_evaluation` label overlaps
walking and is not a stationary benchmark. The walking CSV measures the actual
route. The earlier before image was on battery, so no controlled before/after
performance delta is claimed. VRAM, draw calls, full traffic load, aerial LOD and
citywide travel are not established here. No resolution/power downgrade was used.

Failure evidence is retained. `123200` exposed a premature spawn before ground;
`123944` timed out. `124816` travelled away from the museum and is rejected despite
its old distance-only pass. `125125` stalled on the correct stairs; `125614`
identified a riser collision snag at 78.879 m. Detailed stone joints/bevels remain
byte-identical, while a 900-triangle collision mesh follows the same 72 horizontal
tread heights and bridges decorative gaps. It adds no collision ramp. The final
130 m run passed with that correction. High-FPS stepping is now tested on AC;
broader movement-direction coverage is still required.

The first terrace import failed because new vertices lacked matching COLOR_0
entries; interpolation corrected all attribute counts. The map was not saved by
that failed import. Final stair/terrace commandlet import succeeded with zero
errors and warnings. The immutable source GLB/JPEG and rendered stair mesh hashes
are unchanged. Partial clipping of only source faces 2343/2344 preserves every
outside piece; the retained mesh has 2,545 triangles, terrace 2,549 and water 126.
Source receipts: `Unreal/Philadelphia/SourceAssets/Museum/terrace/source.json`
and `details/source.json`; importer evidence: `artifacts/unreal/museum-terrace-import.json`.

AGPilot run `168910bb06714d1a` completed three text-only model turns after explicit
authorization. Accepted art guidance informed neutral grain/material choices;
Spark's incorrectly addressed technical assignment was rejected. The lead authored
and imported the assets and verified the game. A new corrective review is prepared
but blocked by automatic approval review; see `AGPILOT-TEAM.md`. Model activity is
not counted as city coverage or completed art.

**Next unfinished outcome:** inspect/polish the terrace and fountain at closer
walking distances, including borders and water motion; then improve source-backed
museum facade relief/material detail. Citywide expansion remains authorized and
unfulfilled. This checkpoint does not complete the museum or Frank's AAA target.

### September 13: source-fitted museum stairs

**Visual and bounded walking improvement; AAA art and 1080p/60 FPS are not accepted.**
The native approach now has physical stone treads, risers, millimetre bevels and
recessed joints. The original geographic museum GLB remains immutable. A native
derivative omits only twenty identified ramp/landing triangles; its other vertex
attributes and embedded photograph bytes are preserved exactly. A separate native
mesh supplies the new surfaces at the same registered location.

Five measured ramp/landing pairs and the measured terrace rise anchor the geometry.
The source's lowest ramp began about 85 cm above its landing, and its final terrace
rise was a one-metre wall. The reconstruction connects both. Its six flights have
72 treads, consistent with the [museum reference](https://press.philamuseum.org/faqs),
but individual tread spacing and stone joints are interpretations, not surveyed
replicas. Widths and elevations come from source 2561. The new stone uses
[Poly Haven Granite Tile 04](https://polyhaven.com/a/granite_tile_04), Amal Kumar,
[CC0](https://polyhaven.com/license): retained 4K colour and 2K normal/roughness maps.
This is a photographed material interpretation, not a scan of the museum's stone.

Player-camera evidence:

- Before: `artifacts/unreal/museum-20260913-103111/walk.png`.
- Successful 100 m comparison: `artifacts/unreal/museum-20260913-111932/walk.png`.
  Same spawn, heading, route and third-person camera; endpoint difference from the
  before run is approximately 3.9 cm horizontally and 1.7 cm vertically. This view
  precedes the additional upper terrace connection.
- Final 130 m traversal: `artifacts/unreal/museum-20260913-112650/walk.txt` and
  `walk.png`. Actual W input travelled 130.0291 m, climbed approximately 11.738 m,
  crossed the upper connection and stopped grounded. No teleport was used.

The final native mesh contains 57,724 detail triangles in one material section,
plus the 2,531 retained source triangles. Buried slab walls were removed while
visible treads, joints and bevels remained. The first 100 m attempt stopped at the
lowest flight (`111323`); the first 130 m attempt timed out at the uncorrected
terrace rise (`112135`). Both failures are retained. A headless texture import
initially crashed in editor-browser synchronization; direct Interchange import
resolved it. The original 4K normal transfers failed; the smaller retained maps
completed and imported at their verified dimensions.

Final 130 m walking measurements at 1920x1080, 100% internal resolution:

| Measure | Result |
| --- | --- |
| Sampled walk frames | 3,399 |
| Mean frame time / reciprocal FPS | 21.808 ms / 45.85 FPS |
| p95 / p99 frame time | 26.555 / 31.523 ms |
| Overlapping main sample GPU mean / p95 | 18.278 / 23.100 ms |
| Main sample process RAM | 3,589,402,624 bytes |
| Power | Battery; 14% charge reported during the preceding check |
| Stable 60 FPS acceptance | Failed in this measured run |

The battery reading prevents a controlled cost comparison with the older 74 FPS
museum walk. Neither the older result nor the new result accepts final district
performance. Draw calls, dedicated/shared GPU memory and district-wide LOD are
not established by these CSVs. No power settings or resolution were reduced.

Rebuild the authored mesh with `py -3.11 Unreal/Philadelphia/Tools/build-museum-stairs.py`;
import `Scripts/import_museum_stairs.py` through the Unreal Python commandlet.
The ordinary museum importer also retains these installed details on reimport.
Source receipts are in `SourceAssets/Museum/details/source.json` and
`SourceAssets/Museum/stone/source.json`; native import evidence is
`artifacts/unreal/museum-stairs-import.json`. The walking launcher now propagates
a failed probe as a command failure and records battery percentage on future runs.

**Next unfinished outcome:** improve the museum's terrace paving and façade at
player distance, preserving its recognizable design, and remeasure the detailed
approach on AC power. The final terrace image visibly retains blurry ground
photography and façade details; this is not accepted close-range art. There is no
new proof of citywide streaming, driving, population, interiors or finished city
coverage in this stair checkpoint. The world remains below Frank's AAA target.

Repository state remains controlled dirty: master has no initial commit, prior
project files are untracked, and this native asset slice is uncommitted. No release
or showcase submission was made.

### September 13: Museum of Art native expansion

The whole city remains the outcome. This checkpoint adds the original photographed
Museum of Art (source 2561) and a 500m by 500m pack of real approach surfaces to the
native world. The original GLB and JPEG are retained, with read-back verification;
The initial native import retained all 2,551 source triangles and the 4096 by 2048
photograph atlas; the subsequent stair reconstruction above replaces twenty floor
triangles in a native derivative while preserving the immutable original.
Native location selection supports South Philadelphia and the Museum; the original
Chinatown map and assets remain. This does not establish travel between locations.

Matched player-camera captures are retained in these directories:

- Before museum placement: `artifacts/unreal/museum-20260913-100607/player.png`.
- Rejected floating placement: `artifacts/unreal/museum-20260913-101316/player.png`.
- Corrected landing placement: `artifacts/unreal/museum-20260913-101925/player.png`.

The initial import assertion compared a Nanite fallback before disabling Nanite;
verification now checks the full native mesh after that conversion. The first
rendered import also exposed a height mismatch. Thirty vertices in the source's
lowest 15cm landing band were matched to the retained native ground at identical
XY positions. Their median vertical correction is -1127.212cm, with maximum
contact residual 9.450cm. This is an explicitly recorded local registration,
not a surveyed geoid conversion. Dimensions, XY placement, source geometry and
photographs remain unchanged. `museum/landmark-registration.json` records the
contacts, source hash, method and limits. The corrected player view visibly grounds
the main stair approach; side terraces and landscaping remain unfinished.

The corrected stationary native sample at 1920x1080 and 100% internal resolution
recorded 2,085 frames: mean 14.387ms (69.51 FPS), p95 20.994ms, p99 24.653ms.
GPU mean was 12.027ms; process RAM was 3,395,637,248 bytes. Power status reported
AC offline for both before and after captures. **This is not stable 60 FPS
acceptance**, nor a populated-district benchmark. VRAM and citywide streaming
performance remain unverified. The previous South result remains a separate
23 FPS failure; the museum view does not replace that result.

Unreal compilation, Python syntax checks, the three geographic-adapter tests and
four surface-cut tests passed. A first 100m walk exposed coarse terrain cutting
through the stairs. Ground is now clipped only under retained near-ground museum
surfaces, preserving the surrounding source terrain planes and source mesh. The
mask excludes roofs/elevated geometry more than 5m from terrain and retains curbs;
it is a local museum correction, not a universal bridge/terrain algorithm.
`prepare_museum.py` includes this cut so regeneration does not restore the overlap.
The integrated preparation was rerun; all 25 native cell SHA-256 hashes exactly
matched the geometry bytes used by the final gameplay check.

Final actual-input check: `artifacts/unreal/museum-20260913-103111/`. The character
walked 100.0207m through W input and finished grounded on the approach, climbing
6.6434m. `walk.png` was inspected: the earlier ground patches no longer cut through
the inspected stair view. The source's blurred stair photography and coarse geometry
remain visibly below the final art standard. This is a bounded approach check,
not a several-block walk, complete stair tour, interior or vehicle-driving test.

The final walk sample contains 4,188 frames: mean 13.526ms (73.93 FPS), p95 20.850ms,
p99 26.522ms, at 1920x1080, 100% internal resolution, AC offline. It still fails
stable 60 FPS acceptance. The run's separate main CSV inherits a stationary label
but overlaps the walk and must not be presented as a controlled stationary benchmark.
Before/after walk endpoints differ by under a metre due to physical movement; the
configured initial position and heading are identical, not pixel-locked walk views.

The museum retains historical photographic shading and simplified
source surfaces, with no authored interior. The plain surrounding ground,
missing vegetation/street furniture and unconnected city coverage fail the final
world standard. No final-quality district or whole-city completion is claimed.

Local Ollama reviewed three import/coordinate files on CPU, then unloaded before
the after captures. Its 650-token response was incomplete and established no
accepted code change. The reviewed assessment and raw response are retained under
`artifacts/local-agent/2026-09-13T14-08-44-720Z-*`; no quota savings are claimed.

Run `Launch Unreal Museum.cmd` for normal native play. Reproduce the matched
stationary check with `Tools/test-south.ps1 -Neighborhood museum -NoWalk`, or
the approach input check with `-Neighborhood museum -WalkMeters 100`.
The South preparation script now preserves other registered city packs instead
of resetting the registry to South alone. Its syntax was checked; the full South
geometry bake was not repeated in this checkpoint.

Trust state remains controlled dirty work on master with no initial commit.
No commit, push or release was performed. The next unfinished world outcome is
the museum's surrounding terrain/terraces and connected Parkway city coverage,
using retained source detail; citywide landmarks, bridges and neighborhoods remain
required at the full acceptance standard.

### September 13: South Philadelphia native neighborhood

Both root launchers now run Unreal development game mode with the South Philadelphia
spawn. This requires the installed UE 5.7 engine; it is not a packaged shipping build.
The native pack uses 25 real 100m source cells (500m by 500m), real street surfaces,
terrain-conforming sidewalks and curbs, and interpreted architecture on 1,355 real
building footprints. Twelve unsupported buildings remain omitted. Near-spawn walls
have brick shading and geometric windows, doors and trim; this is not final facade art.
The physical-detail radius is baked around the initial spawn, not adaptive runtime LOD.

Native C++ compilation and the four terrain-conform tests passed. The first runtime
capture exposed a material compile failure and inward-facing walls; that capture was
rejected. The material input and footprint winding were corrected and the native game
was tested again. The repaired screenshot was visually inspected, and its game log
contains no material compile errors. Actual W input moved the character 20.0262m with
a grounded stop. This proves only that bounded walk, not the several-block walk,
continuous drive, aerial transition or finished neighborhood acceptance tests.

Repaired run: `artifacts/unreal/south-20260913-005846/`.

| Measurement | Result |
| --- | --- |
| Display / internal rendering | 1920 x 1080 / 100% |
| Power at launch | AC online |
| Renderer | Forward, native development game |
| Main frame sample | 697 frames; mean 43.057ms; p95 43.910ms; p99 45.239ms |
| Average FPS from mean | 23.23 FPS; **fails 60 FPS** |
| GPU sample | mean 40.374ms; p95 42.254ms |
| Walk frame sample | 276 frames; mean 42.208ms; p95 45.173ms |
| Process RAM | 4,499,566,592 bytes (about 4.19 GiB) |

The main sample has the inherited stationary evaluation label; the combined run also
contains the bounded walk. It is not a controlled stationary-only renderer comparison.
GPU timing suggests a GPU bottleneck, but individual rendering passes still need
profiling. VRAM, draw calls, streaming latency and whole-world travel are not verified.

The streets still need convincing surface materials, furniture, vegetation, traffic
and pedestrians. House geometry currently uses collision and shared procedural mesh
materials; destruction and interiors are not implemented for this pack. The 267 MiB
JSON pack and approximately 964,000 house triangles also require optimization. Cells
load and unload around the player, but no claim of invisible boundaries or citywide
travel is made. Existing landmark assets and the original native district are retained.
This work adds a playable native neighborhood foundation; final district quality,
landmark expansion and the full Philadelphia game remain unfinished.

Reproduce with `Unreal/Philadelphia/Tools/test-south.ps1`; launch normal play with
`Launch Unreal Philadelphia.cmd`. The test stops only the process it started.

### Forward-renderer comparison: useful candidate, not accepted migration

The same Arch Street player view now has a valid native renderer comparison with
neutral exposure, actual 1920x1080 at 100% screen percentage, retained source meshes,
facade detail, streamed roads and distant backdrop. The saved project renderer
defaults remain unchanged. Forward is enabled only by a launch-time INI override.

| Stationary renderer | Frames | Mean | p95 | p99 | Average FPS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Deferred control | 608 | 49.305ms | 53.043ms | 56.066ms | 20.28 |
| Forward with atmospheric sky | 1,119 | 26.797ms | 28.490ms | 30.210ms | 37.32 |

Both captures have the player grounded, with final positions within 0.13cm of one
another. Both fail the 60 FPS target. These are individual stationary samples,
not performance acceptance across walking, driving, interiors, weather or the city.
Forward changes reflections/occlusion; installed engine code explicitly disables
desktop forward screen-space reflections. It cannot be promoted as feature-equivalent
or accepted just because its frame time is lower.

The first forward capture exposed a black sky. `Scripts/prepare_forward_sky.py`
creates an unlit IsSky material using SkyAtmosphereViewLuminance, and the optional
`-PhillyForwardSky` runtime dome samples the existing atmosphere. This restores
the visible sky without using a flat-color substitute. It has no navigation,
shadow-casting or collision role. Initial sky tests were rejected because the
mesh inherited its default collision and displaced the player. Engine inspection
confirmed that SetCollisionProfileName clears bUseDefaultCollision; the sky now
sets the NoCollision profile and disables actor collision. The same explicit
profile/actor correction is applied to the decorative facade import.

Stationary Arch Street reviews now lock pawn input and reject displacement beyond
25cm horizontally or 1m vertically before accepting performance. That guard caught
the collision failure in an actual run. The sampler now takes its screenshot and
GPU profile after the measured interval, avoiding screenshot readback overhead in
the timing average. Earlier captures in this document used the older procedure.
The review HUD labels locked controls; normal gameplay controls remain available
outside review mode. The label-only HUD build followed the saved comparison captures.

Evidence: `artifacts/unreal/daylight-renderer-verification.json`,
`forward-sky-player.png`, `forward-sky-frame.csv`, `forward-sky-gpu.csv`,
`forward-sky.log`, and matching `deferred-control-*` files. Invalid sky runs retain
their `invalid-position` and `collision-failed` filenames and are excluded. All
launched native test processes were stopped after evidence capture. Build and
Python syntax checks pass; the full district remains in a controlled dirty state
with no initial repository commit. No commit or push was performed.

Reproduce the candidate after preparing its sky material by launching the native
evaluation with `-PhillyArchStreetPlayerReview -PhillyForwardSky` and
`-ini:Engine:[/Script/Engine.RendererSettings]:r.ForwardShading=True`.
Both samples use `-game -windowed -ResX=1920 -ResY=1080 -ForceRes -NoVSync` and
`-ExecCmds="r.ScreenPercentage 100,t.MaxFPS 0,r.DynamicGlobalIlluminationMethod 0,r.ReflectionMethod 2,r.Shadow.Virtual.Enable 0,r.AntiAliasingMethod 2"`.
The deferred control omits the forward INI override and sky flag. These diagnostic
settings are not a final graphics preset. Continue source-guided facade/material
work and broader gameplay/aerial checks before any renderer-default decision.

### Daylight walking-camera exposure

The Arch Street player review had reused the aerial landmark's -2 EV compensation.
A controlled 0 EV comparison makes the character, physical piers and glazing
readable while retaining visible sunlit pavement detail. The actual walking camera
now uses that neutral manual daylight exposure; the Arch Street review defaults to
the same value and accepts `-PhillyReviewExposure=` for explicit comparisons.
The City Hall aerial review retains its separate -2 EV setting. This is a fixed
daylight evaluation profile, not the final weather/day-night exposure system.

`artifacts/unreal/street-exposure-neutral.png` is the actual same-position 1080p
comparison. Its stationary sample averages 51.582ms (19.386 FPS), p95 54.138ms,
p99 61.381ms. No performance win is attributed to exposure. Source photographs
remain blurry and contain baked shadows/obstructions; neutral exposure does not
recover missing image detail.

The real W-input walk with neutral exposure travels 20.077m and stops grounded,
with 36 cells ready at its start. Its 262-frame sample averages 44.675ms (22.384 FPS),
p95 47.438ms, p99 50.566ms at actual 1920x1080. Backdrop is enabled. See
`daylight-walk-player.png`, `daylight-walk-result.txt`, `daylight-walk-frame.csv` and
`daylight-walk.log` under `artifacts/unreal`. This passes only the bounded route;
the several-block acceptance route and stable 60 FPS remain unmet. The visible
blank/blurred facades remain a major art failure.

The post-sample GPU capture measures one graphics frame at 46.27ms with 119 draws
and 397,327 primitives across rendering passes (not unique scene triangles).
Deferred lighting takes 21.930ms inclusive, post-processing 7.930ms, base pass
3.520ms, shadow depths 1.876ms and depth prepass 1.260ms. Child pass times overlap
their parents and must not be added again. See `street-gpu-breakdown.json` and
`street-exposure-neutral.log`. The runtime reports AMD Radeon(TM) Graphics with
shared system memory. This capture identifies rendering cost, not a hardware
purchase requirement or an accepted engine migration.

### Arch Street player view and source-guided facade depth

The recovered Arch Street group adds nine original source pieces (7,552 triangles,
four shared photographic atlases) from the City Hall service. A reproducible review
position is now derived from retained Arch Street centerline object 13636 and road
triangle 5327 in cell 2_4. `-PhillyArchStreetPlayerReview` uses the possessed player
pawn, normal spring arm, collision and streaming at that position. The browser's
Arch Street Façade detail button uses eye height above the same road.

Actual street-height captures establish a source-quality limitation: the nearest
face is source 2740, 9.86m from the browser eye. The intersected triangle has only
14.49 texture pixels per metre; its sampled pixel is RGB 13/19/19. The original
photo contains dark shadows and obstructions. Importing it into Unreal does not
recover missing ground-floor detail. The native player is grounded on the road.

A separate 1,840-triangle detail asset adds projecting window surrounds, bronze
glazing divisions, stone sills and coursed piers on part of that facade. Upper
window rectangles are manually traced in the original atlas; obscured ground-floor
glazing and stonework are interpreted from visible pier alignment. Original City
Hall, Reading Terminal and Arch Street mesh hashes are unchanged. The browser has
an explicit Show/Hide physical façade detail comparison; the native map contains
the original source actor and a separate decorative detail actor.

`artifacts/unreal/arch-street-player-before.png` and `arch-street-player-after.png`
verify the partial physical treatment through the same actual 1920x1080 player
camera. This is visibly unfinished: adjacent photo-only wall remains blurry,
the whole facade has not been authored, materials lack final texture maps, and
shadowed street readability is too dark. It is not accepted building or district
quality. The after run averaged 51.422ms (19.447 FPS), p95 53.349ms, p99 57.931ms;
the before run averaged 50.509ms. Both use backdrop enabled and the same diagnostic
GI/reflection/shadow/AA settings. These stationary samples fail the 60 FPS target;
the small timing difference does not establish a performance regression or win.

The native import initially compared source triangles against an automatically
reduced Nanite fallback (1,615 faces). The importer now disables Nanite and saves
the mesh before its LOD0 integrity check; all 1,840 faces are retained. Failed logs
are preserved. Native build and script syntax checks pass. See
`public/models/city/arch-street.README.md` for reproduction and interpretation limits.

Ollama's 167.115-second CPU review produced 650 tokens and reached its limit. Its
byte-offset and asynchronous-lifetime claims did not match the supplied assembler;
none were applied. `artifacts/local-agent/arch-street-assessment.md` records the
rejection. No implementation credit or quota savings are claimed for that output.

### Street conformance and a bounded player-input walk

The visible jagged road patches had a confirmed geometry cause: roads and the
underlying terrain interpolated source elevation on different triangles. Before
repair, 85,855 of 207,532 road-face centroid samples were below the retained terrain,
up to 209.92cm. Roads, sidewalks, paint and curbs now follow the same existing 10m
terrain triangles. Their source XY footprints remain in place. Across 824 surface
groups the maximum projected-area difference is 0.000506 square metres.

The rebuilt roads have zero below-ground centroid samples out of 841,084; minimum
clearance is 2.399cm. `road-before-player.png` and `road-conformed-player.png` show
the large road patches disappear from the same player camera. This is a surface
repair, not final ground art. The ground grid itself is unchanged. Following that
grid moves some original pavement vertices vertically by up to 2.326m compared
with their former independent interpolation; it is not surveyed road/bridge-deck
accuracy. All 150 retained cells were rebuilt from the same six cached terrain
tiles. Original source data and City Hall/Reading Terminal mesh hashes are retained.

Splitting source surfaces increased their triangle count from 403,625 to 1,620,493
before curbs and base terrain. A native capture initially exposed float-coordinate
collapse in small collision triangles. Each streamed mesh now uses its cell centre
as local origin while retaining world positions and UVs. The actual walk run loaded
36 cells with zero duplicate-float triangle warnings and zero precision-rejected
faces. The guard matches the installed Chaos float-vertex/area checks; it does not
discard ordinary geometry to make the log quiet.

`-PhillyWalkProbe` now exercises W input on the existing player pawn without vehicle
or save actions. The run traveled 20.0405m and stopped grounded. Its 277-frame sample
at actual 1920x1080 averaged 42.204ms (23.69 FPS), p95 44.707ms, p99 45.500ms. It used
the same diagnostic GI/reflection/shadow/AA settings, with distant backdrop disabled.
This fails 60 FPS and is not the required several-block walk. The screenshot still
shows blurred and blank building facades, unfinished lighting and simple materials.

Evidence: `artifacts/unreal/street-conformance-verification.json`, road screenshots,
collision logs and the walk report. Four clipping/terrain tests and two backdrop
source-integrity tests pass. Native builds pass. The rebuilt atlas imported into
an empty texture-hash directory through direct Interchange, verifying the previously
unexercised fresh-import branch. Reproduce data with `Scripts/prepare_district.py`
then `Scripts/prepare_district_backdrop.py`; import the updated backdrop material.

Ollama produced two clipping-helper candidates (159.346s/1400 tokens and
81.435s/748 tokens). Both failed their contract and were rejected before execution.
The helper was implemented directly and checked against known and actual source
geometry. See `artifacts/local-agent/terrain-conform/assessment.md`; no local-model
implementation or quota savings are claimed for this assignment.

### Reading Terminal source buildings and distant ground coverage

The City Hall recovery path now also retains Reading Terminal's curved train-shed
roof and adjacent photographed buildings: source IDs 2742, 2743, 2739, 2850, 2851.
`public/models/city/reading-terminal-block-original.glb` has 10,033 triangles and
five original photo atlases. The native import preserves all triangles and five
distinct section materials. `artifacts/unreal/reading-terminal-native.png` is the
actual rendered native checkpoint; the source README records reproduction and
limitations. This adds recognizable architecture, not finished street facades.

The first view exposed missing ground beyond the near streaming radius. A merged
background now uses all 150 retained source terrain cells plus a 4096x4096 atlas
baked from mapped surface geometry. It has no photographic cars/trees, no new
building geometry and no collision. Nearby physical roads, curbs and collision
remain in the original streaming cells. The background terrain sits 5cm lower.
Coverage outside the retained cells remains absent, including part of City Hall;
there is an existing gap in the retained western cells. This is not a full aerial
LOD solution or a final ground-art replacement.

The first dense background was rejected after the same 1080p view dropped from
24.8 FPS to 16.8 FPS. Its 406,506 triangles are replaced by 30,000 actual terrain
triangles with the geometry-derived atlas. The rejected frame/log evidence is
retained under `reading-terminal-backdrop-*`. Latest atlas verification is
recorded in `artifacts/unreal/reading-terminal-coverage-verification.json`.

Final atlas sample: 576 frames, mean 52.121ms (19.19 FPS), p95 54.887ms, p99
59.432ms, RAM 3,846,397,952 bytes. The same-build no-backdrop control: 768 frames,
mean 39.072ms (25.59 FPS), p95 40.420ms, p99 42.824ms, RAM 3,764,162,560 bytes.
Both are actual 1920x1080 at 100% screen percentage with the existing diagnostic
GI/reflection/shadow/AA overrides. The additional coverage costs 13.049ms in these
stationary samples and remains an unaccepted evaluation, not a performance win.
GPU clocks/thermal state were not locked; no multi-block gameplay pass is implied.
The atlas removes much of the distant surface fragmentation, while nearby
geometry still shows overlapping surface artifacts that require investigation.

Build the new data with `py -3.11 Unreal/Philadelphia/Scripts/prepare_district_backdrop.py`,
then run `Scripts/import_district_backdrop.py` through the native Python commandlet.
`py -3.11 tests/test_district_backdrop.py` checks binary integrity, all source-cell
hashes and sampled retained faces across the district. It does not test gameplay.
The opt-out `-PhillyNoBackdrop` allows controlled rendering comparisons.

Local qwen3-coder:30b reviewed the initial loader in 69.959 seconds (946 prompt,
216 output tokens). All three suggested defects were contradicted by its input
code and rejected; see `artifacts/local-agent/district-backdrop/assessment.md`.
The review supplies no correctness proof or claimed quota savings. Ollama was
unloaded before native timing samples. A headless AssetTools texture import
crashed after saving its texture because it attempted Slate UI synchronization;
the importer now uses the direct Interchange path, and material creation succeeded.

### Building appearance takes priority over vehicle tuning

Frank subsequently identified the existing browser City Hall as his preferred
building-detail benchmark. Its two original textured source pieces have now been
recovered and visually checked together in Cesium, with a close facade view:
`public/models/city/city-hall-original.glb` and `city-hall.README.md`.
The recovered asset is now imported and placed in the native evaluation. The
planned philly_0056 facade construction was not started. City Hall establishes an
actual native textured-landmark checkpoint before resuming interpreted facades.

`artifacts/unreal/city-hall-native.png` shows both sections, clock tower, roof and
facade photography in Unreal. `city-hall-import.json` confirms 11,591 source and
native triangles, two 4096 x 4096 textures and section material slots [0,1]. The
first import failed because duplicate material names collapsed both sections
onto one slot. `scripts/assemble-city-hall.mjs` now assigns distinct source-ID
names and checks them; the corrected native assets live under
`/Game/Philadelphia/Assets/CityHallOriginal/DistinctSourceMaterials`. The earlier
failed assets are retained but are not assigned to the map actor.

The opt-in `-PhillyCityHallReview` camera frames the full source asset and uses
manual exposure compensation -2 (configurable by `-PhillyReviewExposure=`),
without changing the normal player camera. Its HUD identifies an asset review.
The original cropped/overbright capture is retained as `city-hall-first-native.png`.

Latest stationary native City Hall review: 818 frames, mean 36.682 ms (27.3 FPS),
p95 42.251 ms, p99 44.690 ms, process RAM 3,765,866,496 bytes. Native output is
1920 x 1080, screen percentage 100, with the same diagnostic GI=0, reflections=2,
virtual shadow maps=0 and AA=2 overrides. This fails 60 FPS. Different review
cameras/exposures are not a controlled performance-improvement comparison. The
runtime selects the AMD Radeon(TM) Graphics adapter, not the Basic Render Driver.
`city-hall-frame.csv`, `city-hall-gpu.csv`, `city-hall-native.log` and
`city-hall-visual-verification.json` retain the evidence. The surrounding geometry
is visibly incomplete; original photographed shading and vegetation remain.
No walking, driving, interior, city streaming or final-art acceptance is implied.

Vite's watcher crashed on a locked Unreal save temporary. `vite.config.js` now
excludes Unreal and artifacts from source watching. The local browser asset
preview was restarted and visually rechecked after the native run wrote files.
This repair preserves the browser source project during native development.

Frank's latest correction is that building texture/detail is the immediate gap.
Vehicle work is paused. The native evaluation is not visually equivalent to the
browser city and must not be presented as its replacement.

The live browser Chinatown street inspected on September 12 also showed blank
facades. `src/world.js` loads the mixed textured/untextured I3S source, whereas
`src/city-photo-assets.js` currently restores photographs for just philly_0000
(with its separate source-geometry remainder). The initial native imports contained
16 historical reference meshes, subsequently joined by City Hall and Reading Terminal.
These are different coverage paths; transferring
the browser source alone cannot guarantee complete textured street facades.
The browser follow-up pause/log inspection timed out, so this observation is a
captured view, not proof that every asynchronous texture request completed.

The next visual checkpoint must compare the same street and camera direction,
retain existing source detail, and distinguish missing source textures from
conversion/material defects. Close-range facade materials and architectural
geometry remain required even after source parity. Neither flat colors nor
blurred historical photo atlases meet that checkpoint. No new building art was
completed by this diagnosis.

The last native mechanics run was stopped for this visual priority. Its log
(`mechanics-paused-for-visuals.log`) reached real vehicle possession and throttle
after the occupancy fix; it did not complete the probe. The older failure report
in Saved must not be mistaken for the result of this interrupted run.

### UV correction and rendering-cost investigation

Latest corrected ordinary render: `artifacts/unreal/material-corrected-street.png`.
The repaired street distinguishes asphalt/sidewalk colors and visibly receives
building shadows. It still has unfinished flat materials, poor source facades,
blank surfaces, baked objects and incomplete coverage. It is not accepted game art.

Two measurements using the same diagnostic GI/reflection/shadow/AA settings and
native 1920×1080 at 100% screen percentage:

- After disabling Nanite on all 16 small source meshes: 1,431 samples, mean
  20.965 ms (47.7 FPS), p95 21.144 ms, p99 21.679 ms; GPU mean 19.350 ms.
- After restoring the missing road base-color connection: 1,321 samples, mean
  22.710 ms (44.0 FPS), p95 24.813 ms, p99 25.178 ms; GPU mean 21.135 ms,
  p95 23.400 ms; process RAM 4,004,454,400 bytes.

Both fail 60 FPS, and neither tests moving/streaming gameplay. Do not keep quoting
the faster sample as the final corrected-material result. Evidence lives in
`frame-static-source.csv`, `frame-material-corrected.csv`, matching GPU CSVs and
`runtime-*-profile.log`. The profiler showed Nanite shadow work disappear, with
ordinary shadow-depth work about .433 ms in the inspected static-mesh frame.

`material-inspection.json` confirms 16 source mesh actors, all Nanite-disabled,
with 4,005 native LOD0 triangles. Source totals are 4,008; the two differing source
meshes contain zero-area triangles (philly_0061 and philly_0066). Native triangle
counts are not a claim that every source corner survives engine import unchanged.

The requested engine normal-buffer view did not activate (`normal-view-not-entered.log`).
The direct, opt-in `-PhillyNormals` material capture did:
`surface-normals-up.png` shows upward road normals. No winding/normal change was
made. `M_SurfaceNormalsDiagnostic` is not assigned to the saved map.

The actual street-material defect was an unconnected base-color input. The initial
importer asked for a vertex-color output named `RGB`; this engine exposes the
combined output under the empty name, and the unchecked connection call failed.
`surface-material-repair.json` records the saved graph before (null) and after
(MaterialExpressionVertexColor). The importer now checks connection return values,
and the native validator verifies this actual connection, skeletal-material flags,
and upright spawn rotations. This restores the existing per-surface colors; it
does not invent new streets or replace source photography.

The nearby native facade failure was partly our conversion error. The retained
Nverse source puts facade ground vertices at V=1 and roof vertices around V=.124
in philly_0056; the inspected JPEG has ground at its bottom. The converter had
applied an additional V flip. Its earlier round-trip check merely verified that
chosen flip, not that the photograph aligned with the building.

`scripts/convert-city-source.py` now explicitly supports source UV origin, defaulting
to top-left for these retained Nverse atlases. `--source-uv-origin bottom-left`
can audit the earlier exports. The source DAE/KML/JPEG files are untouched. Native
corrected GLBs and their Unreal assets have distinct names/folders; the prior
versions remain available for comparison. Browser public GLBs have not yet been
regenerated; their correction and rendered verification remain outstanding.
The original native philly_0000 reference also still uses its earlier GLB; its
atlas-specific correction and rendered verification remain outstanding.

`tests/test_city_source_uv.py` checks independent physical facade-ground anchors
against the actual atlas convention and rejects the previous inverted result.
The Unreal capture `artifacts/unreal/uv-corrected.png` confirms correctly placed
storefronts/windows on the visible facade. It also exposes blank surfaces, low
texture resolution and baked objects. This fixes a mapping defect; it does not
complete the district's architecture or meet street-level visual acceptance.

The opt-in `-PhillyGPUProfile` flag captures the engine GPU pass breakdown after
frame sampling. In `runtime-uv-corrected-profile.log`, one diagnostic frame shows
about 6.694 ms in Nanite shadows, 7.680 ms in deferred lighting and 4.049 ms in
post-processing. These are scoped, nested GPU events, not independently additive
totals for every row. The 15 nearby meshes total only 2,516 source triangles, so
their Nanite settings and the original small reference are disabled while keeping
full source geometry. Performance and appearance require the next rendered check.

The stationary sampler now completes 60 actual game frames before starting its
20-second warm-up and 30-second measurement period. This avoids counting initial
asset compilation between BeginPlay and initial rendered frames as stationary
performance. It does not filter any hitch occurring inside the measured period.
Cold startup and streaming costs still need separate measurement.

### Latest native block comparison

The 15 nearby original source meshes (2,516 triangles, about 1.7 MB original
compressed texture payload) are imported at source coordinates and terrain
heights. There are now 16 historical reference mesh actors including philly_0000.
Conversion checks preserve source geometry, UVs and original JPEG bytes. Unreal's
Python lacked Pillow; terrain sampling now occurs in the external exporter and
the native importer reads explicit centimetre positions. Import completed with
zero errors/warnings after that repair.

**Visual rejection:** `artifacts/unreal/nearby-source-rejected.png` shows blurry,
stretched facade imagery, baked objects and unfinished streets. This is reference
coverage for the runtime evaluation, not final architecture or accepted district
progress. Source/UV/material mapping still needs close comparison before art
cleanup; do not assume every visible distortion is an unavoidable source defect.

The first render with these newly imported meshes incurred distance-field builds
and startup stalls during sampling. Its 163.201 ms wall-frame average is therefore
not a steady-state estimate. GPU samples averaged 62.714 ms, p95 70.914 ms. The
full-quality VSM warning returned with the source-building casters.

One separate full-resolution diagnostic disabled Lumen GI, used screen-space
reflections, conventional shadows and temporal AA. Exact command-line CVars are
retained in `artifacts/unreal/runtime-nearby-conventional.log`; project defaults
remain unchanged. At actual 1920×1080 and 100% screen percentage it measured:

- 959 stationary samples: mean 31.275 ms (about 32.0 FPS), p95 33.434 ms,
  p99 34.171 ms; process RAM 5,069,463,552 bytes.
- GPU mean 29.246 ms, p95 31.599 ms.
- Screenshot `artifacts/unreal/nearby-conventional-rejected.png`: brighter ground
  and character but inadequate shadows; historical facade problems persist.

This also fails the stable 60 FPS target. It is not a visual-quality substitute,
walk/drive test, engine migration decision or finished game. Renderer stage
profiling and a genuinely finished, source-guided street asset remain necessary.
The completed diagnostic game was closed after evidence capture. Desktop input
was not automated in this continuation; the user's earlier Computer Use stop was
respected. No local inference jobs remain running.

September 12 measured rendering checkpoint: the second stationary native run
averaged 69.862 ms (about 14.3 FPS), p95 72.673 ms, at a verified 1920×1080 viewport.
The third run averaged 60.669 ms (about 16.5 FPS), p95 68.515 ms. Both fail 60 FPS
and neither is a walk/drive acceptance test. Evidence is preserved under
`artifacts/unreal/frame-second-14fps.csv`, `frame-third-repaired.csv`, matching logs
and screenshots. The active GPU was logged as AMD Radeon(TM) Graphics, a UMA
adapter; the process used about 6.3 GB in the third sample.

The rendered third capture confirms that retaining and enabling the seven
original character materials removed the gray default-material appearance.
Python positional Rotator arguments had incorrectly pitched player/car spawns
90 degrees; named pitch/yaw/roll arguments now fix both map and importer. The
skylight now captures the sky. Broad ground cells receive but do not cast shadows,
removing their large non-Nanite VSM casting workload. Curbs share those cells and
currently do not cast their own shadows. Ground is still visually too dark and
the isolated native district still lacks sufficient architecture and gameplay.

`Scripts/extract_nearby_sources.py` uses the retained PASDA central directory and
KML/DAE archive to retrieve only original textures for meshes within 70 metres of
the actual spawn. Range responses, filenames, ZIP CRC, source hashes, UVs and
geometry are checked. Historical photo meshes remain reference assets requiring
transient-object/shadow cleanup and added observed detail before final-art use.

Local Ollama additionally reviewed the actual native tyre/suspension code (760
tokens, 89.6 seconds, CPU). Four claimed defects were contradicted by the code or
units; its wheel-slip suggestion also had a units error. No patch was accepted.
See `artifacts/local-agent/native-vehicle-review/assessment.md` and raw response.
The response's unsupported word "verified" must not be repeated as our finding.

The browser/Cesium game and its source assets are preserved. `Unreal/Philadelphia`
is an isolated native evaluation, not a committed migration. Code compiles against
the installed Unreal 5.7.2 and MSVC 14.44.35227. No commits or publication performed;
the repository still has no initial commit and pre-existing untracked work.

New native code implements a third-person character, retained Idle/Walk/Run clips,
a four-contact suspension vehicle, entry/exit collision checks, transform/possession
save and restore, and asynchronous source-cell loading. These implementations have
not passed gameplay acceptance. Current saving covers only the present player/car
state; inventory, destruction and interiors are not integrated.

The exporter converts all 150 retained district cells into centimetres, with real
Terrarium z15 elevation observations, preserved source hashes, and 16cm curbs. Six
terrain tiles were fetched from the same free source as the browser. There is no
fabricated flat terrain fallback. Native cells currently load within 330m and retire
beyond 480m. HLOD, a complete skyline and aerial transitions remain unfinished.

## Actual evidence and failures

- Native builds passed, including the latest consolidated-cell rendering code.
- The Mustang, philly_0000 historic Chinatown source and human GLBs imported into
  native assets. The vehicle measures 477cm long; all three human clips exist.
- Initial import created the map but exited 1 due to constructor-time physics
  initialization and a pre-creation material lookup. Both causes were corrected.
- First runtime loaded cells and generated a partial frame sample, then crashed
  with D3D12RHI/Slate EXCEPTION_ACCESS_VIOLATION. This is a failed runtime test.
- That partial sample averaged 44.077ms, p95 46.481ms, p99 441.259ms and approximately
  5.94GB process working memory. It includes startup/instability and is not a valid
  steady-state benchmark. Its resolution column was a requested value, not measured;
  the corrected sampler now reads the actual viewport and wall-clock frame interval.
- The first runtime exposed translucent vehicle materials on Nanite and excessive
  sections/collision cooks. Native cell geometry now uses one shared vertex-colour
  section and one collision cook, with sub-millimetre slivers rejected and counted.
  The vehicle component disallows Nanite; the structural validator also disables it
  on the copied asset. These fixes still require runtime verification.
- Blender Store launcher produced no worker; direct binary execution was denied.
  Native Interchange GLB import succeeded without altering original GLBs. The
  unused FBX export script is an unverified alternate path.

Evidence stays in `artifacts/unreal`, `Unreal/Philadelphia/Saved`, and
`artifacts/local-agent/unreal-geo`. Failed logs are preserved before reruns.

## Local Ollama contribution

`scripts/ollama-geo-agent.py` gives the installed qwen3-coder:30b a constrained
read/write/test loop. Only `Unreal/Philadelphia/Scripts/geo_frame.py` is writable;
the independent tests are read-only, and the host selects the test command. No
arbitrary shell execution is exposed. Candidate code is syntax/AST screened and
reviewed before production use. This is a task-specific restriction, not a general
security sandbox for arbitrary generated Python.

The first loop failed boolean-input tests and repeated the defect. A subsequent
directed repair completed read/edit/test/done and passed three independent tests
covering metre scale, centimetres, handedness, real landmark round-trip and invalid
arguments. The reviewed adapter is used by the native district exporter. This
establishes one bounded local-agent workflow; it does not demonstrate autonomous
game production or measured Codex quota savings.

## Resume and acceptance

Build with `Unreal/Philadelphia/Tools/build.ps1`. Re-export source cells with
`py -3.11 Unreal/Philadelphia/Scripts/prepare_district.py`. Run
`py -3.11 tests/test_unreal_geo.py` for the coordinate contract.

The imported evaluation map already exists. The importer deliberately refuses to
regenerate an existing map. Use `Scripts/validate_evaluation.py` through Unreal's
Python commandlet to inspect it and repair the known vehicle import setting.

Next: continue close street-level architecture and surface inspection, followed
by real multi-block walking/driving, collision and streaming verification. Source
landmark recovery and stationary images are insufficient architectural coverage
for the full runtime comparison. Do not call this the representative final-quality
district. The runtime decision is now Unreal; historical browser results do not
establish native feature completion.
