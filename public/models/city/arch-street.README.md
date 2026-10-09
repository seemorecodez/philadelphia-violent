# Arch Street source buildings and physical facade work

`arch-street-original.glb` contains nine retained source pieces from the same public
I3S service used for the recovered City Hall. It has 7,552 triangles, four original
photo atlases and a 4,744,576-byte GLB. Nine records are not necessarily nine separate
buildings. The source IDs are 2731, 2732, 2740, 2833, 2746, 2741, 2745, 2770 and 2780.
Original geometry attributes and JPEG payloads remain unchanged. Source terms and
attribution apply separately from the MIT code license.

Reproduce the source asset with `scripts/capture-arch-street.py`, export each ID
using `scripts/export-city-hall.mjs`, then run
`node scripts/assemble-source-cluster.mjs arch-street`. The source manifest is
`artifacts/city-source-audit/arch-street/source-meshes.json`.

## Street-height evidence

`py -3.11 scripts/prepare-arch-street-review.py` projects a review location onto
retained Arch Street centerline object 13636 and intersects the actual exported
road triangles to obtain height. It fails if no road is present. The native player
uses that location with `-PhillyArchStreetPlayerReview`, retaining the real pawn,
spring arm, collision and district streaming. Stationary review input is locked;
the sampler rejects displacement beyond 25cm horizontally or 1m vertically. The
walking camera now uses neutral daylight exposure, also the review default;
`-PhillyReviewExposure=-2` reproduces the earlier dark comparison. Normal gameplay
input remains enabled outside this diagnostic mode. The browser asset preview uses an
eye 1.65m above that same road at
`/diagnostics/city-hall.html?asset=arch-street` (Façade detail button).

The original ground-floor view fails the desired close-up quality. The camera ray
hits source 2740 about 9.86m away; that triangle has approximately 14.49 texture
pixels per metre. The sampled source pixel is RGB 13/19/19. Dark photographed
shadows, occlusions and limited source resolution remain in both renderers.
The native player stood grounded on the road; the blurry wall is not evidence of
a missing texture or a player placed inside it.

## Physical facade detail in progress

`py -3.11 scripts/build-arch-facade-details.py` creates the separate
`arch-street-facade-details.glb` (29,924 triangles). Window surrounds and sills are
traced from original atlas rectangles and mapped onto source 2740's north facade.
These give the source's flat window image actual depth. Ground-floor stone courses
and glazing are interpreted using visible pier alignment where the photograph
is obscured. They are not recovered or surveyed ground-floor details.

The browser's Show/Hide physical façade detail button compares this additive mesh
against the unchanged original. The native import script is
`Unreal/Philadelphia/Scripts/import_arch_facade_details.py`. It preserves the
original source actor, adds a separate detail actor, and disables Nanite before
checking authored LOD0 triangle retention. Decorative relief has no collision;
the importer explicitly sets its NoCollision profile and disables actor collision
to prevent the static mesh's default collision profile from being inherited again.
The original building and street collision remain.

This is unfinished game art. Full material polish, facade joins and upper-elevation review,
doorway/interior interaction, photographic obstruction cleanup and complete
street-level quality remain outstanding. Source recovery and a partial facade
treatment do not establish a finished district or 1080p/60 FPS acceptance.


### Expanded north facade � September 12

The observed five broad window banks and narrow center windows now have physical
frames and glazing. Source-aligned piers, spandrels, coursed stone, roof trim and
an interpreted central double-door entrance extend the additive detail across
the north elevation. Doors are decorative; no interior interaction is claimed.
The native limestone material adds bounded world-space mineral color variation;
the portable GLB retains its base PBR material, so this shader detail is native-only.

A first player-camera render exposed original photography showing through a window
where the coarse source surface changed depth. The corrected generator clips each
panel against source triangles in atlas space; a coverage-area assertion checks
every panel for missing or overlapping UV coverage. The second native screenshot
confirms the visible photograph leak is removed. Remaining stepped joins, flat
glazing appearance, upper-elevation visual inspection and final art polish prevent
calling this a finished production facade.

Final source detail hash: 9331a2a497c620dcc773207958faa6670e8e56c11e7016ade4091b762062384a.
Before: artifacts/hardware/plugged-current-20260912-212715/player.png.
After: artifacts/hardware/plugged-current-20260912-224845/player.png.
Both views use the same game street camera at 1920x1080. The after run was on
battery and marked VisualOnly: its 65.55 FPS average and 24.696 ms p99 do not
establish stable 60 FPS or a comparable plugged-in performance improvement.
