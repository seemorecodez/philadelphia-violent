# Existing neighborhood workflow: September 25 extension

## Scope and acceptance

This extends the retained West Philadelphia pack, centered near longitude
-75.2181672, latitude 39.9509475. It preserves the municipal footprint layout,
road surfaces, sidewalk/curb geometry, existing house generator, coordinate frame,
and 100m world cells. It does not introduce another world generator or replace
the Arch Street / landmark assets. No Ollama or AGPilot assignments are used.

The intended result is an aerial-off native Unreal neighborhood with street
furniture and vegetation, evaluated on the existing 150m route with a turn after
90m. The joint acceptance target remains convincing street-level art and stable
60 FPS at actual 1920x1080. Successful import or walking alone does not accept it.

## Exact integration changes

| File | Change |
| --- | --- |
| `src/neighborhood-references.js` | Adds street-tree scale/spacing, lamp spacing, and garden spacing to the existing South/West/North references; existing architectural palettes remain. |
| `src/street-objects.js` | Adds `buildNativeStreetDetails`: a native adapter to the existing street-object module. It indexes retained pavement/grass/parking triangles and real building polygons; uses deterministic world-aligned candidates; interpolates source terrain height; preserves pedestrian clearance; mounts mailboxes using the existing house-profile door bay; adds only supported utility spans and parking placements. Existing browser APIs remain unchanged. |
| `Unreal/Philadelphia/Tools/build-south-houses.mjs` | Appends optional `streetProps` arrays to existing cell JSON and a `streetDetails` summary to the pack manifest. Default generation still builds the existing houses. `--street-details-only` preserves their mesh files and updates dressing. |
| `scripts/create-neighborhood-street-kit.py` | Authors nine reusable, editable furniture collections and exports one GLB per type. A saved master is protected from regeneration unless `--rebuild` is given. `--export-only` exports the saved edited master. |
| `scripts/prepare-parked-vehicle.py` | Uses the retained unmarked car to bake a single-material parked variant with one 1024px albedo atlas. The original driveable car is untouched. |
| `scripts/prepare-street-tree.py` | Extends the existing tree-preparation script with `--native-impostor`: front, side, and overhead albedo/alpha views rendered from the retained 3D tree, assembled as a six-triangle distant LOD. Close and middle tree LODs remain actual tree meshes. |
| `Unreal/Philadelphia/Scripts/import_street_kit.py` | Extends the existing Interchange GLB import pattern: source-hash reimport, shared furniture material, explicit instanced-material support, three static-mesh LODs, simple collision proxies, metre/cm checks, and optional `SourceData/street-kit.json` registry. |
| `Unreal/Philadelphia/Source/Philadelphia/PhillyDistrict.h/.cpp` | Loads the reusable mesh registry and creates HISM components per cell/type. Placements remain local to their cell to retain precision. Components unload with cells. Older cell exports with no `streetProps` still load. Close facade detail uses the existing base/detail meshes with a 65m load / 100m unload distance measured from the cell footprint. The forward profile uses two shadow cascades over 180m; saved map lighting is untouched. |
| `Unreal/Philadelphia/Source/Philadelphia/PhillyMechanicsProbe.h/.cpp` | Retains real PlayerController input and adds failed-input diagnostics plus RHI draw/primitives and memory sampling during the walk. |
| `Unreal/Philadelphia/Tools/test-south.ps1` | Adds street-detail and legacy-budget comparisons, retains evidence, and disables viewport-focus key flushing for the automated walk only. |
| `tests/native-street-details.test.js` | Exercises terrain height, footprint/road exclusion, narrow sidewalks, cell-order determinism, duplicate transforms, and legacy cells. |

## Editable assets and placement contract

`assets/city/blender/neighborhood-street-kit/neighborhood-street-kit.blend`
contains named editable component objects in a collection for each furniture
type. Solo a collection to edit it: the reusable assets share a grounded origin.
Units are metres; +X faces the curb. The car has a separate
`parked-vehicle.blend`. Credits and differences from the source car are in
`assets/city/blender/neighborhood-street-kit/CREDITS.md`.

Each optional cell entry has `kind`, `position` (native centimetres), `yaw`
(degrees), `scale`, and an explicit interpretation `basis`. Utility segments
also have `pitch`; mailbox placements include `sourceBuildingId`. Historical or
named buildings do not receive inferred mailboxes. Trees use the existing CC0
asset; the placement does not claim an exact species or surveyed tree position.

The street kit contains lamps, hydrants, cart bins, utility poles, parking signs,
planters, garden railings, wall-mounted mailboxes and conductor segments. The
native registry also references the retained tree and baked parked car.
Planting follows mapped grass; fixtures follow pavement; cars require a mapped
parking polygon large enough to contain their body. Wiring requires aligned
poles over an uninterrupted supported route. Driveway/curb geometry remains the
existing source geometry; no speculative driveway cuts are created.

## Run the current pipeline

Run Node commands from the repository root:

```powershell
node Unreal/Philadelphia/Tools/build-south-houses.mjs west --street-details-only
```

Omit `--street-details-only` to run the original house generation as well.
The same optional dressing adapter runs for the other supported house packs;
only West has been exercised in the native game for this checkpoint.

Blender commands (use the installed Windows Blender launcher and absolute script
paths; scripts write their own logs because the Store launcher hides stderr):

```text
blender-launcher.exe --background --python scripts/create-neighborhood-street-kit.py -- --export-only
blender-launcher.exe --background --python scripts/prepare-parked-vehicle.py
blender-launcher.exe --background --disable-autoexec --python scripts/prepare-street-tree.py -- --native-impostor
```

For initial furniture authoring only, omit `--export-only`; if a master already
exists the script refuses to overwrite it unless `--rebuild` is explicitly given.
`prepare-parked-vehicle.py` is a reproducible source bake and regenerates its
parked output. Preserve any manual parked-vehicle edits separately before rerunning it.

Build with `Unreal/Philadelphia/Tools/build.ps1`, then run the existing Unreal
Python import mechanism using `Unreal/Philadelphia/Scripts/import_street_kit.py`.
The importer must complete before launching the game. Source imports cannot be
accepted merely because the commandlet exits; inspect `street-kit-import.json`.

```powershell
powershell -NoProfile -File Unreal/Philadelphia/Tools/test-south.ps1 -Neighborhood west -WalkMeters 150 -TurnMeters 90 -TurnYaw 9.5
```

For the original appearance/budget comparison add `-NoStreetDetails -LegacyDetailBudget`.
The test records power status, actual resolution, input result, same-route end
image, frame percentiles, GPU sample, RHI draw/primitives sample, and memory.
These are native development-game measurements, not packaged-release results.
The opt-in walk probe restores its held W key if desktop activity clears it,
and records each restoration. It never moves the pawn directly or disables
collision to pass a route.

For a separate stationary GPU breakdown, add `-NoWalk -GPUProfile`. Profiling
is rejected during a walk so its synchronization cannot contaminate traversal
timing. `-DepthMaskedFoliage` is a separate renderer experiment, not a default:
it requests Unreal's masked depth prepass and checks the engine's settings log.
Neither option changes the saved map or creates a second rendering pipeline.

## Verification and remaining production gaps

See the final evidence record appended below. Earlier rejected passes remain in
`artifacts/unreal`; do not treat them as the current result. Twenty relevant
placement, street-object, house and district tests pass.

Remaining gaps include authored facade/porch/roof variation that matches West
Philadelphia more closely, sidewalk wear and paving variation, dedicated shrub
assets, richer environmental storytelling, exact prop-layout cleanup, traffic,
pedestrians, destructibility, interior gameplay, night-light emission, and
longer drive/aerial checks. Existing curbs and driveways have not received new
source corrections. One tree species and one parked-car body are reused. The
parked car's opaque windows/material simplification need close visual review.
Simple collision is deliberately coarser than visible mesh detail.

The 65m facade LOD budget exposes the existing mismatch between detailed openings
and the shader-only distant facade; that transition still needs improvement.
HISM shares meshes, but cell/type groups and material sections still cost draws.
The current shared kit is preloaded at startup; it does not yet use asynchronous
asset handles. Texture allocation is recorded, not total physical VRAM residency.
No final-quality city percentage or AAA completion is claimed.
The distant canopy uses three intersecting masked views, not full leaf geometry.
It is generated from the same tree, with no ground/background in the texture.
Oblique view, shadow and LOD-transition quality still need broader review; the
overhead view prevents an edge-on canopy at city-view altitude. This does not
stand in for close-range tree geometry or establish an aerial-test pass.

## Native before/after evidence

Both views are from the same 150m source-road route, same 90m turn, same player
camera and 1920x1080 resolution, without aerial photographs. The before run
uses `-NoStreetDetails -LegacyDetailBudget`; this compares the original complete
rendering budget with the new complete budget, not the isolated cost of props.

- Before: `artifacts/unreal/west-20260925-181505/walk.png`.
- After: `artifacts/unreal/west-20260925-180808/walk.png`.
- Each folder retains `walk.txt`, `walk-frame.csv`, `walk-render.csv`, power and
  renderer settings, and the full native log. The before run records one held-W
  restoration caused by lost input; the after run records none.

The after view visibly adds tree canopies, lamp posts, wood poles, planters,
hydrants and bins along the existing physical street. Mailboxes, wiring, garden
railings and parked cars are imported/placed elsewhere in the pack; this single
camera does not visually validate each of those placements.

The route passes with a grounded stop, but the final art target fails visual
review: repeated plain building forms, uniform ground materials, empty road
markings and sparse activity remain conspicuous. The new objects do not make
this a shipping-quality neighborhood. Several-block driving and aerial LOD
transitions have not been accepted.

| Full 150m walk | Before | After |
| --- | ---: | ---: |
| Mean frame time | 19.037 ms | 26.695 ms |
| FPS computed from mean frame time | 52.5 | 37.5 |
| 95th-percentile frame time | 26.835 ms | 36.968 ms |
| 99th-percentile frame time | 32.343 ms | 38.236 ms |
| Mean RHI draw calls | 109.4 | 284.8 |
| Mean RHI primitives across passes | 2,963,185 | 1,908,417 |
| Process RAM | 4,502,790,144 bytes | 4,409,331,712 bytes |
| Allocated texture memory | 426,082,304 bytes | 423,460,864 bytes |

**The 60 FPS requirement fails.** RHI primitive counts include multiple rendering
passes; they are not a unique visible-triangle count. Allocated texture memory
is not total GPU memory. The native development executable is being measured,
not a packaged shipping build. Logs show audio-device changes during the before
run, so the difference is not a tightly isolated GPU-only benchmark.

The separate stationary profile at
`artifacts/unreal/west-20260925-181726/game.log` identifies 8.305ms of shadow
depth work and 8.568ms of base-pass material work in one 27.299ms GPU frame.
That sample motivates foliage/shadow optimization; it is not the route average.
Earlier sparse-tree, gray-material and black-material results are retained but
rejected. An invalid masked-depth trial is recorded in
`artifacts/unreal/west-20260925-182023/invalid-trial.json` and is excluded from
performance comparisons.

The corrected opt-in masked-depth trial
`artifacts/unreal/west-20260925-182220` confirms `r.EarlyZPass=2` and
`r.EarlyZPassOnlyMaterialMasking=1`. Its walk and endpoint image pass the same
bounded checks, but mean frame time is 34.562ms (28.9 FPS), p95 46.374ms and
p99 58.390ms. First-use shader/PSO stalls occurred. This trial does not establish
a steady-state gain and is **not promoted to the normal game launcher**.
The original default renderer settings remain intact. Do not select a faster
partial interval from `frame.csv` as the full-walk result; use `walk-frame.csv`.

Machine-readable checkpoint: `artifacts/unreal/neighborhood-block-20260925.json`.
The repository is still an uncommitted working tree; no commit, publication or
release is implied. This is a controlled incomplete checkpoint. The next
unfinished outcome is the same block's neighborhood-specific architectural and
ground-surface quality together with lower foliage/shadow cost, followed by the
same native visual and 1080p/60 traversal checks. No city expansion is counted
as final-quality work from this checkpoint.
