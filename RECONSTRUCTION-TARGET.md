# Current governing specification

The latest district-first open-world GAME specification in ACCEPTANCE.md supersedes the earlier keep-aerial-visible restriction below. Preserve source assets, but provide real game roads/curbs/sidewalks and an imagery-off acceptance test. Ordinary architecture is neighborhood-based procedural geometry; landmarks retain individually recognizable hero assets. Whole-city expansion waits for the walk, drive, aerial, fidelity and performance gates of one representative district. Historical rejected material experiments remain evidence, not approved final surfaces.

# Philadelphia reconstruction target

September 12 superseding clarification: ordinary houses may now be individualized interpretations based on surrounding-house/neighborhood photographs, while retaining actual source footprints and supplied heights. This permission does not extend to generic landmark replacements or erasing observed ground detail. Use local images, preserve observed neighborhood patterns, and label facade details unavailable in overhead photos as interpreted. Include the Art Museum, other landmarks, parks, woods and Delaware waterfront in the city scope; do not equate source inventory entries with finished models. See ACCEPTANCE.md for the current full target.

Current source constraint: Frank explicitly requires using the free sources already available to the project. Source recovery below uses the existing PASDA archives and existing I3S service only. Missing observations are not permission to introduce invented buildings or require a paid provider.

September 11 recovery update: the original `philly_0000` photographed block has now been matched to I3S feature 2351, converted with original pixels and geometry preserved, and integrated with a source-derived remainder retaining geometric differences. In-game before/after comparison verified a visible photographic recovery for this block. The later paragraphs record the earlier reference-only checkpoint; see EDITOR-REVIEW.md and the match evidence for the newer state. Full-city fidelity, selective baked-object cleanup, and sustained runtime stability are still unfinished.

Frank's clarification on September 11, 2026 governs this work: the city must carry the same fidelity expectation as the detailed car models, preserve actual Philadelphia buildings and streets at real-world scale, and remove only unwanted objects and baked lighting from source imagery. Plain colors, generic facades, footprint extrusions or invented replacements do not meet that requirement.

## Immediate correction

Restore the original detailed ground imagery and preserve all existing building models. The rejected plain-ground rendering remains isolated as a diagnostic; the game must not silently substitute it for the detailed source. Restoring imagery restores its known baked cars, trees and shadows too. It corrects the loss of source detail, but does not complete the selective cleanup.

## What a faithful replacement must preserve

- Actual geographic position, real-world dimensions, footprint, roof profile and street/sidewalk boundaries.
- Recognizable facade layout, window and door placement, materials, ornament and permanent street markings supported by source photos/measurements.
- Separate 3D trees and vehicles; their appearance must not remain painted into the permanent street surface. Ground and facade materials should be separated from baked shadows so lighting can be rendered in the scene.
- Source provenance and visible comparisons from matching overhead and street-level views. Missing observations must stay recorded as unknown rather than being claimed as accurate reconstruction.

## Source and modeling boundary

The existing downtown I3S collection already contains true 3D geometry, with mixed textured/untextured coverage. The aerial ground layer is a photograph draped over elevation; it is not street-facing photography or a full 3D scan. Footprint polygons establish plan shape but do not provide detailed facade geometry. Available 2022 LiDAR may support measured roof/terrain/deck reconstruction, but the verified dataset lacks RGB and an independently classified building-point population.

A photograph cannot reveal pavement hidden beneath a car, a facade behind a tree, or the unseen sides of a building. Faithful reconstruction needs additional clean viewpoints or measurements. Image filling can create a plausible patch, but must not be labeled a measured one-to-one recovery. A source from 2015/2023 also does not establish the exact present-day city.

## Next implementation boundary

Use a bounded actual city block as the first source-verified reconstruction. Prefer existing textured geometry and original textures where available; combine measured geometry with properly licensed additional facade/oblique views. Author missing supported detail in Blender. Clean only supported permanent surfaces, compare the replacement against the retained reference, and integrate only when recognizable details, scale and geometry have been preserved. Citywide duplication of an inadequate sample is not progress.

Current status: photographic baseline restoration and source qualification. No new building reconstruction, clean texture, full-city photogrammetry, or one-to-one completion is claimed by this correction.

## Original textured reference now available

The original PASDA downtown sample `philly_0000` has been extracted with its matching original 2048x2048 JPEG atlas. The editable reference is `assets/city/reference/philly-0000/philly-0000-original-reference.blend`, created by `scripts/import-city-reference.py`. It preserves 1,172 source positions, 1,492 triangles, metre scale, source UVs and the exact original packed JPEG. Maximum float-storage position roundoff is under 0.000002 m. The KML origin is longitude -75.155179, latitude 39.955632; absolute elevation and building identity are unverified.

The rendered review visibly preserves facade windows, walls, roofs and the parking deck. It also visibly exposes baked parked cars, vegetation, shadows and stretched/occluded facade imagery. This is original historical source (DAE dated January 2009), not a newly modeled or cleaned block. Unlit materials are used for inspection so additional Blender lighting does not hide the source condition; final physically lit materials still need work. The model is not added to the game, avoiding duplicate buildings and false cleanup claims.

See `artifacts/city-source-audit/README.md` for exact primary sources, bounded range extraction and missing-photo evidence, and `assets/city/reference/philly-0000/reference-validation.json` for preservation checks. The global plain-ground experiment remains rejected. The next visual acceptance boundary is a source-supported clean reconstruction of this or another verified block, preserving visible detail and clearly identifying unobserved regions.
