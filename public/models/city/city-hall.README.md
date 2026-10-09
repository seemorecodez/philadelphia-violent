# Original Philadelphia City Hall source asset

Frank identified the browser's City Hall rendering as the desired building-detail
reference. This is that source geometry and photography, recovered locally rather
than replaced with a newly generated landmark.

## Files

- `city-hall-original.glb`: assembled City Hall, 11,591 triangles, 5,522,056 bytes.
- `city-hall-2849.glb`: northern section and clock tower, 6,960 triangles.
- `city-hall-2422.glb`: southern section, 4,631 triangles.
- Two original 4096 x 4096 JPEG atlases are embedded in the assembly unchanged.
- Matching `.provenance.json` files identify the source, hashes, coordinate origin,
  material mapping, checks, and limitations.

The GLB is portable and can be imported into Blender or Unreal. It is now imported
at source coordinates in the native ChinatownEvaluation map. The native capture
`artifacts/unreal/city-hall-native.png` verifies the complete landmark and both
photo materials; native LOD0 retains all 11,591 triangles. Each source material
must have a distinct name: Unreal collapsed the original duplicate names onto
one texture slot. The assembly exporter now enforces distinct source-ID names.
The original browser source remains
enabled and unchanged; this recovery does not replace its live streamed features.

## Exact source

The browser loads this public, keyless City of Philadelphia / PASDA / Esri service:

https://tiles.arcgis.com/tiles/z2tnIkrLQ2BRzr6P/arcgis/rest/services/philadelphia_Bldgs_text_untex/SceneServer/layers/0

Source version: `661CEFCA-6729-484D-8D30-2AFC7F274213`.
Object 2849: node index 641, mesh/material resource 640.
Object 2422: node index 640, mesh/material resource 639.
Their blank ObjName and zero CenterLon/CenterLat fields made filename/attribute
search insufficient. They were located by original geometry bounds and then
identified visually from the clock tower, courtyard and building wings.

These objects use textured material definition 2 and per-vertex atlas regions.
Ordinary untextured source objects use material definition 0. Copying those plain
objects into a stronger engine cannot produce City Hall's photographic detail.

The original source-data terms and attribution remain applicable independently of
the project's MIT code license. This extraction does not grant new photo rights.

## Reproduce and inspect

1. `py -3.11 scripts/locate-city-hall-source.py`
2. `py -3.11 scripts/capture-city-hall-mesh.py`
3. `node scripts/export-city-hall.mjs 2849`
4. `node scripts/export-city-hall.mjs 2422`
5. `node scripts/assemble-city-hall.mjs`
6. `npm run dev`, then open `/diagnostics/city-hall.html` on that local server.

The node metadata, raw geometry and original JPEGs are retained under
`artifacts/city-source-audit/city-hall`. No source mesh decimation, invented faces,
texture generation, atlas recompression, or texture cleanup was performed.
The original ENU frames are reconciled by per-part node transforms in the GLB.
The original triangle order, UV-region mapping, source normals and JPEG bytes are
preserved. Float32 conversion introduces less than 0.00001 m local storage error.
This storage bound is not a claim of survey accuracy.

## Visual checkpoint

`recovered-city-hall.png` and `recovered-city-hall-facade.png` in the audit folder
show the actual local assembled GLB rendered in Cesium. The assembly is
recognizable and its facade imagery aligns with the clock tower and roof forms.
This is an asset-recovery checkpoint, not completion of a game district.
Source photographic shadows, dark/occluded faces and photographed vegetation
remain. Close street-level refinement, interiors, collision, native materials,
streaming integration and the 1080p/60 FPS gameplay target remain outstanding.
The native asset is currently a placed landmark, not a completed streamed district.
