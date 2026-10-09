# Clean Philadelphia ground — September 11, 2026

**Rejected visual replacement.** Frank clarified that the city must retain the detail of its actual buildings and streets, with the same fidelity expectation as the car models. Removing aerial imagery and substituting plain map colors fails that target. The active game has been restored to the original CityImagery_2023 layer. No building models or original external source imagery were deleted. The material-map implementation and its checks below are retained as an isolated diagnostic only; they are not accepted city-detail progress. Selective removal of photographed cars/trees/shadows remains unfinished. See RECONSTRUCTION-TARGET.md.

## Request and scope

Remove the flat photographed cars, trees and shadows from streets/sidewalks while retaining actual Philadelphia geography, the 3D buildings, real terrain and separate 3D objects. Storyline remains deferred. This surface correction does not satisfy the larger AAA city-detail target.

Baseline: master, empty Git history; existing project files are untracked but attributable to this task. No commit or publishing authorization. The change touches src/ground-imagery.js, src/sources.js, src/world.js, src/main.js and the acceptance/source/verification documentation. No source models or animations are replaced.

## Implemented source path

- City of Philadelphia / PASDA `CityPhilly/MapServer/11`: actual impervious and vegetated surface polygons, 2015 capture with subsequent source updates. FCODE 1000 travelways; 1010 medians; 1020 shoulders; 1200 road bridges; 1210 rail bridges; 1220 pedestrian bridges; 2200 parking; 2210 sidewalks; 2220 slabs/ditches; 2230 driveways; 2240 alleys; 2250 parking islands; 2260 pools; 2300 compacted earth; 2310 ballast/gravel; 9999 vegetated/natural ground.
- `CityPhillyWatersheds/MapServer/9`: City of Philadelphia 2025 hydrographic polygon features. Rendered underneath pavement to preserve mapped bridge footprints.
- Public ArcGIS read-only export via POST with explicit dynamic layers, solid-fill symbols, labels disabled and transparent PNG32. No API key, account, aerial image, car/tree symbol or satellite fallback. City/PASDA and the published Pictometry / Intergraph / Sanborn credits remain available in the game.
- Cesium terrain imagery uses 512px Web Mercator tiles, levels 9–20, bounded to [-75.30,39.86,-74.94,40.15]. Requests retain Cesium's request priority, cancellation and cache behavior. Responses must be images no larger than 8 MiB and decode to 512x512. A global 2px solid PNG occupies the base layer so Cesium cannot stretch edge-water pixels beyond the source rectangle. Unknown or absent ground remains neutral; failed tiles raise a visible status instead of restoring aerial imagery.
- Palette is authored asphalt/concrete/vegetation/water color, not a claim about measured material. It is a terrain surface map inside the existing 3D environment; it is not an independently collidable road mesh.

## Evidence

Live service metadata and small exports succeeded without credentials. Both services advertise dynamic-layer support and allowed the localhost browser origin. A full styled pavement GET (about 3.6KB URL) failed with HTTP 404 from the server's request filter; the identical form-encoded POST returned HTTP 200 and a 13,013-byte PNG. The implemented tile path therefore uses POST. A 2px PNG replaces an initial SVG that the browser bitmap decoder rejected. Diagnostic HTTP results are retained under artifacts/ground-check.

`node --test --test-isolation=none tests/*.test.js`: 88 passed, 0 failed, including five new tests for actual projected bounds/classifications, POST delivery, request throttling, invalid responses and bitmap cleanup. Production build passed after allowing Vite's required local subprocess outside the sandbox; the initial sandbox attempt failed with spawn EPERM. The final world chunk is about 4.284 MB raw / 1.163 MB gzip; the existing bundle warning remains.

Live production preview at localhost:4173 was refreshed from the old version. At Penn campus the overhead view showed the real road, path, parking and lawn boundaries around retained 3D buildings. At street level the final build displayed dark mapped asphalt, pale sidewalk surfaces, green planted areas and a separate detailed 3D tree. Photographed ground cars, trees and their shadows were absent. The Mustang accelerated through the page's actual controls to a displayed 3 mph. Source attribution remained visible. This was a bounded visual/behavioral check, not a full-city drive or a frame-rate benchmark.

Transient source export errors and delayed neutral tiles were observed during loading. The final integration retries a failed tile once before reporting incomplete coverage. One level-11 tile still failed after retry in the final build (597,775; no HTTP status exposed); the nearby campus road/path/lawn surfaces were visibly present. Existing street-object population limits were reported, and sidewalk source availability was intermittent earlier in the run. Source reliability, full water-coverage traversal, long-run resource use and sustained performance remain open. Do not treat the clean nearby view as a guarantee that every tile loaded.

Trust state: verified bounded ground cleanup in an uncommitted, attributable workspace. Proposed commit scope is the files listed above plus public/materials/neutral-ground.png and tests/ground-imagery.test.js; proposed message: `Replace aerial gameplay ground with mapped Philadelphia surfaces`. No commit or publication performed. Next target is detailed street materials/markings and accurate road/curb geometry, without treating this plain surface palette as AAA detail.

## Still required for a complete rendered city

1. Detailed, source-supported building exteriors and roofs beyond the mixed 2010/2015 downtown collection. Current outer-neighborhood buildings are measured footprint extrusions with plain walls.
2. Authored street materials and verified markings, intersections, ramps and curb profiles. Correct elevated bridge decks, tunnels and stacked-road collision need separate geometry.
3. Complete nearby 3D vegetation and street-furniture coverage with appropriate models. Existing tree/pole inventories and display budgets leave gaps; photographed objects were never substitutes for these objects.
4. Finished lighting, shadows and materials, plus building/ground alignment across different source dates and vertical datums.
5. Predictable streaming, cache/resource budgets and measured driving performance throughout representative neighborhoods. One clean view does not establish citywide playability.

Traffic, outdoor pedestrians, larger interior coverage and richer destruction/animation systems additionally make the city playable and reactive. The ground cleanup does not supply them. Retained building/roof textures can contain separate baked image detail; editing those assets is a distinct source-texture task. Removing a raised sidewalk still reveals the mapped ground material rather than an excavated hole.
