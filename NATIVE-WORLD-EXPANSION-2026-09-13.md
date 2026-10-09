# Native Philadelphia expansion checkpoint

Current outcome: extend real Philadelphia coverage into retained neighborhood
reference areas and verify the new West Philadelphia streets in the native game.
This is unfinished world coverage, not AAA art or a completed city.

The project remains on master with no initial commit. Existing user assets and
source work were preserved. No commit, publication, purchased credit, or usage
reset was performed.

## Coverage delivered to the native source pipeline

Four 500 by 500 metre areas retain their public source observations and coordinate
frame. Together these are approximately 1 square kilometre of additional source
coverage, separated by still-unbuilt areas; they are not a connected city route.

| Pack | Source cells | Supplied footprints | Exported interpreted houses | Exported house triangles |
| --- | ---: | ---: | ---: | ---: |
| West Philadelphia | 25 | 698 | 659 | 852861 |
| North Philadelphia | 25 | 1267 | 1191 | 716748 |
| Penn Treaty waterfront | 25 | 70 | 49 | 87896 |
| East Fairmount Park | 25 | 1 | 0 | 0 |

Counts are source/conversion evidence, not finished building acceptance. Boundary
filtering, invalid source heights, and buildings unsuitable for the existing house
generator explain the difference from supplied footprints. Fairmount currently
contains source terrain and streets; woodland and its supplied building remain
unmodeled. Major/named buildings skipped by this generator need appropriate assets.

`SourceAssets/<pack>/manifest.json` preserves public source URLs, retained photo
references, source hashes and bounds. The overhead photos guide layout and broad
neighborhood interpretation, and do not establish unseen facades. Photography is
not applied to these street surfaces as a substitute for objects.

## Native verification

The Unreal 5.7 PhiladelphiaEditor Development build succeeded. Three coordinate
contract tests passed; the changed export scripts passed syntax checks.

West Philadelphia same-pose native comparison:

- Ground-only comparison: `artifacts/unreal/west-20260913-153722/player.png`.
- Buildings enabled: `artifacts/unreal/west-20260913-153907/player.png`.
- Both use longitude -75.21816723496553, latitude 39.95094750568931, yaw -80.5.
- This is a controlled buildings-disabled comparison on newly converted terrain,
  not a claim that this exact ground-only area existed in the previous build.

The inspected after view shows real 3D rows, openings, masonry, source streets and
shadows. It also shows repetitive facade treatments, simple glazing, sparse street
detail and absent trees/population. It fails the final visual target.

At actual 1920 by 1080, 100 percent internal resolution, the buildings-enabled
stationary sample measured 33.297 ms mean (about 30 FPS), 38.456 ms p95,
45.236 ms p99, and 4,398,325,760 bytes process RAM. The ground-only comparison
measured 19.700 ms mean, 26.754 ms p95 and 32.397 ms p99. Both reported battery
power, not AC. Neither establishes stable 60 FPS or district gameplay acceptance.
See the respective settings, frame and GPU CSV files for the exact workload.

Walking verification is in progress; record its real input-path result before
claiming walkability. North, waterfront and Fairmount are exported/registered but
have not received native visual or gameplay acceptance in this checkpoint.

## Reproduce and continue

`Launch Unreal West Philadelphia.cmd` opens the native development game in the
new West Philadelphia area. WASD moves, mouse looks, and F enters/exits the car.
Vehicle traversal in the new area is not yet verified.

The new fetcher and preparer are `Unreal/Philadelphia/Tools/fetch-neighborhoods.mjs`
and `Unreal/Philadelphia/Scripts/prepare_expansion_sources.py`. The existing
`build-south-houses.mjs` now accepts west, north, river and fairmount. Native game
startup reads the selected pack's position and name; the existing cell streamer
loads the registered areas. No browser runtime deliverable was substituted.

Failures retained: Node's initial fetch crashed in undici; bounded standard HTTPS
resolved it. The initial waterfront/park start search incorrectly assumed the
Center City street bearing; searching verified road surfaces at other bearings
resolved it without inventing a street. Failed logs remain in
`artifacts/agpilot-world-expansion`.

The next unfinished outcome is convincing street-level architecture and street
detail in this expanded world, with connected traversal, native LOD review and
plugged-in performance verification. The current isolated packs do not satisfy a
continuous drive across Philadelphia or completed landmarks/bridges/forests.

## Model usage and review boundary

Frank authorized this conversation to exceed its default 10 percentage point
AGPilot budget for remaining included game development allowance. The ledger was
extended to 100 points for this conversation only. The account later reported
100 percent core weekly usage. The reset credit remains unused.

Spark run `9de4f60cb50f4088` was prepared but automatic review rejected its launch:
the seven selected private source files require specific approval for transfer
to the managed Spark model. No Spark worker started. That approval remains
pending, and local lead work proceeded independently. No Ollama work ran during
this checkpoint. Previously accepted local-agent house-profile code was reused;
no new agent output or quota savings are claimed.

Because local implementation changed `build-south-houses.mjs` after the frozen
Spark task was created, reconcile that input or create a linked successor once
authorized. Do not apply the stale task blindly or bypass the rejected transfer.

## September 14 facade streaming work — unfinished

The previous goal turn was no progress. This continuation implemented player-relative
facade detail streaming in PhillyDistrict.cpp/.h and build-south-houses.mjs.
Previously the exporter permanently chose detailed geometry only within 125m of
initial spawn. Now the West pack exports base geometry plus detailed sidecars for
all 659 supported houses. Runtime requests detail within 130m of cell bounds and
releases it beyond 180m, keeping base collision active and retaining base visuals
until detail is ready. Other packs have not been regenerated.

Unreal Development compilation succeeded. West export succeeded after repairing
an array-spread argument overflow exposed by large detailed buildings. Native log
artifacts/unreal/west-20260913-202905/game.log confirms detailed meshes loaded.
This is implemented, incomplete enabling work, NOT accepted art or added finished
city percentage. No same-camera after image has yet been inspected.

Material limitations: the 25 detail JSON files total 932203521 bytes. Convert to a
compact binary mesh payload and decode off the game thread before expansion.
Horizontal-only LOD does not yet provide altitude-aware aerial transitions.
The 150m walk probe failed by timeout after approximately 66m; the log spans an
overnight clock discontinuity. Concurrent local CPU inference further invalidates
performance comparison. Do not claim 1080p60, continuous traversal or visual pass.

AGPilot existing coding run 9de4f60cb50f4088 remains ready, unstarted; preserve its
prior private-source transfer rejection. New source-free text review 6ef6f2dd147845f0
in .agpilot/world-expansion-20260913 failed preflight: requested Spark model ID not
currently visible. No model result was generated. Budget status was inspected;
no reset redeemed. Local qwen3-coder:30b exporter review actually started via
scripts/local-city-review.mjs but timed out with no returned review; no output accepted.

Repository remains uncommitted master with pre-existing project files untracked.
No commit or publication. Next outcome: compact facade streaming without stalls,
then repeat native same-camera visual review and walk/drive/aerial acceptance with
no competing inference workload. Preserve full citywide and 15% quality target.

## September 14 compact facade checkpoint

Implemented PHLYHSE1 binary detail meshes in Tools/house-mesh-binary.mjs and
build-south-houses.mjs; PhillyDistrict.cpp now decodes and validates detail arrays
on a worker thread. UObject mesh creation remains on the game thread. Existing
base collision stays active during visual swaps. No geometry was simplified.

All 25 West detail meshes were converted and checked against retained JSON:
7319011 vertices; every index, normal, RGBA and UV preserved to float32; maximum
position roundtrip error 0.0001953125 cm. Payload 932203521 -> 395178700 bytes.
Original JSON remains as comparison evidence, so total disk usage has not shrunk.
Evidence: artifacts/agpilot-world-expansion/binary-facade-validation.json and
convert-verify-west.mjs. Other packs remain unchanged.

Unreal native Development compilation passed. The plugged-in stationary 1920x1080
100% internal-resolution run completed at artifacts/unreal/west-20260914-095508:
mean 20.929ms (~47.8 FPS), p95 21.874ms, p99 22.393ms, process RAM4596146176 bytes.
Inspected player.png at the same spawn camera against west-20260913-153907/player.png:
near facade openings and trim remain present, distant detail changes are visible;
repetitive architecture, simplistic glazing and sparse streets still fail final art.
This is a stationary sample only, not stable60 or walk/drive/aerial acceptance.
No causal speedup claim versus the earlier battery or CPU-contended runs.

Earlier test session89924 reached terminal timeout; no live job was restarted based
on an observation timeout alone. AGPilot review6ef6f2dd147845f0 status rechecked:
failed, no workers/answer, requested Spark model not visible. No replacement model
was silently used. No new Ollama call this pass; its prior timeout remains a failure.

Trust state: controlled dirty, uncommitted master; no publication. Enabling work
and real native visual/performance evidence delivered; no completed city percentage
added. Next: prove facade transitions while moving, reduce remaining render cost,
and improve source-guided facade/street art before calling any district finished.

## September 14 traversal diagnosis and source-route check

West 150m straight input run artifacts/unreal/west-20260914-095754 failed at
13186.5cm against a visible building wall. Inspected walk.png: modeled window/trim
beyond the former spawn-only detail radius; collision remains active. Walking
sample (includes failed/stopped segment) mean16.187ms,p9520.731,p9921.744 at1080p.
Not stable60; not a passed150m route. No world geometry/collision removed.

Source-road analysis find-west-turn.mjs identified turns at86-93m; chosen90m turn
to native yaw9.5 has sampled road clearance in retained source triangles.
Added optional PhillyWalkTurnMeters/PhillyWalkTurnYaw to native probe and matching
TurnMeters/TurnYaw test-south.ps1 options. Cumulative leg distance retains150m goal;
look direction changes through PlayerController; W remains the real input path.
Compiled successfully. This is verification tooling, not new city or gameplay.
Active check session47303, native PID19336, artifacts/unreal/west-20260914-100223:
150m with turn90m/yaw9.5. Re-poll this handle before restarting; result pending.

AGPilot read-only discovery visible-models.json confirms Spark absent. Disclosed
source-free Luna successor cb5aef898afa4daa created; run stopped before inference:
'A tracked usage window disappeared; cannot safely continue'. No budget guard
bypass, private-source transfer, new accepted model output or reset redemption.
The original source-transfer rejection remains intact. Next: inspect native turn
result and facade load/unload evidence; preserve failed-route evidence separately.

## September 14 source-turn result — bounded walking verified

Session47303 completed successfully. artifacts/unreal/west-20260914-100223/walk.txt
records 15001.31cm cumulative travel, a turn at9002.36cm to yaw9.5, and grounded=1.
Inspected walk.png: detailed facades remain visible along the cross street. Real
PlayerController W input plus the source-backed look-direction change were used.
Walking frame sample mean18.099ms (~55.3FPS), p9521.040,p9921.991 at1920x1080.
This passes only the bounded150m route, not stable60, citywide traversal, driving,
aerial transitions, load/unload cycles, or final street-level art. The prior straight
route failure remains retained. No additional city area counted as finished.

Material review: Scripts/prepare_house_material.py uses authored vertex palette,
procedural brick colour, constant roughness0.82 across all surfaces, and no normal
relief. src/neighborhood-references.js explicitly says facade colours are authored
ranges; retained west.jpg is overhead only and cannot establish exact facades.
Do not label a palette change as photograph-matched architecture. The inspected
cross-street image remains repetitive, sparse, and visibly unfinished. Next art
outcome must use retained facade imagery or an explicitly identified interpretation,
with same-camera native comparison. Terrain/background ends remain visible in the
expanded pack: no seamless citywide coverage claim.

## September 14 material experiment — rejected

Tested shallow world-space mortar bump and distinct glass roughness in native
M_SouthHouse. Unreal import succeeded. Same-camera capture inspected at
artifacts/unreal/west-20260914-100748/player.png. Insufficient visible improvement;
stationary mean21.844ms,p9523.152,p9923.680 at1080p. No final art/60FPS acceptance.
No causal performance claim from the difference between short samples.

Candidate preserved as artifacts/agpilot-world-expansion/prepare_house_material-relief-rejected.py.
Restored original prepare_house_material.py from retained before copy and reran
Unreal material generation; restoration log restore-house-material.log.
This pass delivered a rejected experiment, not a player-visible improvement.
Do not repeat tiny procedural shader tweaks as a substitute for source-guided
facade forms, quality materials and actual street furniture/vegetation assets.
Native streaming and verified150m source-turn route remain the retained checkpoint.
AGPilot current guard failure remains recorded; no model output claimed.

## September 14 retained photographic expansion — import active

After closing the rejected shader experiment, extended extract_nearby_sources.py
with bounded --radius and separate --output options. Defaults preserve Nearby;
DowntownExpansion excludes its previously extracted15 sources. Retrieved25 more
historical source references within140m using8266460 bytes of original textures
from the established PASDA source. Geometry/UV checks and ZIP CRC checks passed.
This is enabling source work, not finished city coverage.

New import_expansion_assets.py stages24 assets separately in Unreal, excluding
already-used philly_0000. No map actors changed. Import verifies one mesh and each
source texture count; visual/placement acceptance remains pending. Active native
import session76840, log artifacts/agpilot-world-expansion/import-expansion-assets.log,
partial report artifacts/unreal/downtown-expansion-import.json. Re-poll handle;
do not restart solely because observation timed out. Several meshes confirmed staged.

Next required work: finish native import, inspect source appearance and overlap
with existing original/newer clusters, then place suitable assets at verified
coordinates and compare in game. Retained photographic shadows/occlusion and
historical-date limitations remain. No area counted as final AAA or15% complete.

Native import session76840 completed with exit0 and PHILLY_EXPANSION_STAGING_COMPLETE24.
All24 selected photographic meshes and texture-count checks passed native import.
They remain staged assets; no actor placement or player-visible expansion delivered
by this checkpoint. Next is overlap/appearance review before scene integration.

## September23 Blender production restart

User discontinued Ollama/AGPilot and clarified ordinary houses need neighborhood
identity, not exact individual facades; historical/significant buildings remain
individual assets. Updated ACCEPTANCE.md and AGENTS.md accordingly.
Created editable assets/city/blender/arch-street/arch-street-master.blend using
installed Blender5.2.2 (the5.2.1 hint was stale). Separate SOURCE_REFERENCE and
GAME_DETAIL collections preserve source2740 and existing photo-traced relief.
Detail-only GLB exported. Roundtrip check passed29924 triangles and bounding error
0.000000652129m with identity node transforms. Initial checker assumed indexed
triangles; corrected to support the original unindexed GLB. No game changes or
visual improvement claimed: this is enabling work toward the authorized workflow.
No agents launched. Next is authored architectural improvement and same-camera
native verification using this master; not wholesale generic city generation.

## September 25 existing neighborhood pipeline extension

User-directed outcome: extend the existing Blender-to-Unreal neighborhood block
workflow, preserving world architecture, roads, source footprints, existing house
generation, exports and backwards compatibility. The active West pack is the
bounded native test location (-75.2181672, 39.9509475). No Ollama/AGPilot used.

Implemented optional source-supported streetProps through src/street-objects.js
and build-south-houses.mjs. The current neighborhood style table governs spacing
and scale. Authored editable Blender furniture, retained detailed tree with a
source-rendered distant LOD, and a one-material parked variant of the retained
unmarked car. Unreal imports reusable meshes/LODs/simple collision and streams
HISM groups through existing world cells. Existing houses and source roads remain.
Detailed file changes, commands, asset masters, credits, and gaps are in
BLENDER-UNREAL-NEIGHBORHOOD-BLOCK.md.

Twenty relevant tests, native build/import, and the actual 150m W-input walk pass.
Native before/after views were inspected with aerial imagery off:
artifacts/unreal/west-20260925-181505/walk.png and
artifacts/unreal/west-20260925-180808/walk.png. New trees, lamps, poles, planters,
hydrants and bins are visible. This is a visible street-dressing improvement,
not final neighborhood art. Current houses and ground surfaces remain too generic.

Performance FAIL: retained full-walk mean26.695ms (37.5FPS), p95 36.968ms,
1920x1080. Legacy before mean19.037ms (52.5FPS) also misses stable60. The separate
GPU profile identifies material/base-pass and shadow-depth cost. A masked-depth
experiment did not establish a gain and is not the default. Failed visual imports,
invalid trials, and earlier timing results remain retained, not erased.
Full record: artifacts/unreal/neighborhood-block-20260925.json.

Checkpoint remains incomplete and uncommitted. Next: improve this block's authored
West Philadelphia architecture and surfaces, reduce foliage/shadow cost, then
repeat native same-camera review and the 1080p/60 traversal requirement. Longer
driving, aerial transitions, activity, and citywide acceptance remain unproven.
