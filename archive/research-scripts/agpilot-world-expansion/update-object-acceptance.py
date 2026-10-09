from pathlib import Path
p=Path('ACCEPTANCE.md')
s=p.read_text(encoding='utf-8')
section='''## September 23: object evidence and aerial-off acceptance

This correction supersedes generated-house counts as a completion metric. A
building counts only when its specific game object is linked to a specific real
Philadelphia structure and its evidence packet has passed review. A source ID
alone, a generated mesh, or membership in a merged cell is insufficient.

Each packet must contain:
- Source dataset URL/version or retrieval date, retained source file hash, and
  original footprint ID/polygon; distinguish building parts from whole structures.
- Geographic coordinates and native transform, with coordinate system and units.
- Footprint dimensions (state the measurement method), height, base elevation,
  vertical datum or explicit unknown, and whether each value is observed,
  derived, terrain-sampled, estimated, or missing.
- Stable runtime object identity; for merged/instanced geometry, a recoverable
  source-to-instance or vertex/index-range mapping through every rendered LOD.
- Reconstruction evidence: retained images/source models, their provenance,
  which features they support, and which surfaces remain interpretations.
- Validation result and evidence paths for placement, dimensions, elevation,
  silhouette/detail, collision and native imagery-off inspection. Missing,
  untested, failed and passed results remain separate. Any required unknown or
  missing evidence keeps the object out of the accepted count.

Defining world test: disable the aerial/satellite photography layer completely
in native Unreal. Philadelphia must remain physically present as modeled roads,
sidewalks, curbs, buildings, vegetation and infrastructure at player level.
Photographs of parked cars, trees, shadows or buildings on a ground sheet cannot
satisfy that test. Legitimate facade/material textures are not the aerial layer.
Preserve reference imagery as source evidence; do not delete it to pass the test.

Report accepted objects separately from source records, generated objects and
unvalidated candidates. Do not use the former 2,993 individualized-house figure
as completion. City percentages require a defined geographic denominator and
accepted coverage; building counts alone do not establish area completion.
This remains an open-world game requirement, not a GIS-viewer deliverable.
The joint native gameplay, street-level fidelity and 1080p/60 FPS criteria remain.

'''
assert '## September 23: object evidence' not in s
s=s.replace('## Governing target:',section+'## Governing target:',1)
p.write_text(s,encoding='utf-8')
