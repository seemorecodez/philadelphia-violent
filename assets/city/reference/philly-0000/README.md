# Original Philadelphia source reference

`philly-0000-original-reference.blend` is an editable import of original City of Philadelphia / PASDA geometry and its photograph atlas. It is not a finished game asset, a cleaned material, or a new AAA reconstruction. Source photos still include parked cars, trees, shadows and visibly stretched wall detail. No source geometry or image content was invented or removed.

`original-source-review.png` is a Blender render of that original data. The photograph and source diffuse color use unlit inspection materials; this does not remove baked lighting or establish production PBR materials. Windows/doors largely remain photographic detail rather than fully modeled architecture. Source metre coordinates, triangle order and UV mapping are retained with only Blender float-storage roundoff. The packed JPEG matches the downloaded original SHA-256.

Provenance: https://www.pasda.psu.edu/download/philacity/data/3D_Models/2010/ ; source metadata and conditions: https://www.pasda.psu.edu/uci/FullMetadataDisplay.aspx?file=Philadelphia_Building_3DModels.xml . The source data retains its original terms; the application's MIT license does not relicense the photographs. COLLADA metadata identifies Nverse Photo / Precision Lightworks Collada Exporter, January 16, 2009. The building/complex identity and present-day condition are not verified.

Rebuild with Blender 5.2 using `--background --factory-startup --python scripts/import-city-reference.py` from the repository root. Source extraction/evidence is under `artifacts/city-source-audit`. Validation is in `reference-validation.json`. The model is isolated from the game's renderer and remains a reference for faithful reconstruction work.
