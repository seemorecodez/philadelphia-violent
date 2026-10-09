# Reading Terminal original textured source cluster

`reading-terminal-block-original.glb` retains five photographed source records
from the same public Philadelphia I3S service as the recovered City Hall model.
It contains the Reading Terminal train-shed roof and adjoining photographed
buildings in their original relative positions, not generated replacements.

Source IDs: 2742, 2743, 2739, 2850, 2851. Total: 10,033 triangles and five embedded
original JPEG atlases (three 4096x2048, one 4096x4096, one 2048x4096).
The matching provenance JSON records source URLs, hashes, geometry ranges,
coordinate frames and texture dimensions. The combined GLB is 6,274,688 bytes;
SHA256 `a6834a23434668f2f143d7b05230c1f1f86158c4828bab38f614d841072ffda7`.

Object 2743 shares its source leaf with two unrelated objects. Its selected
inclusive face range is [40,1007]; all vertex attributes are sliced together.
The unrelated 40 triangles are excluded while the original atlas is preserved.
No mesh decimation, invented facades, texture recompression or de-lighting was
performed. Source data/photo terms remain separate from the code's MIT license.

The native asset is placed in ChinatownEvaluation at its geographic coordinates.
`artifacts/unreal/reading-terminal-block-import.json` verifies five distinct
material slots and all 10,033 triangles. `reading-terminal-native.png` shows the
actual textured cluster in Unreal. This is historical source recovery, not final
street art: dark photographed lighting, occluded faces and transient photo
objects remain. There are no authored interiors in this asset.

Browser inspection: run `npm run dev`, then open
`http://127.0.0.1:5173/diagnostics/city-hall.html?asset=reading-terminal`.
This separate preview preserves the existing browser game's streamed source.

Reproduction:

1. `py -3.11 scripts/capture-reading-terminal.py`
2. For each of the five IDs, run `node scripts/export-city-hall.mjs ID artifacts/city-source-audit/reading-terminal/source-meshes.json`.
3. `node scripts/assemble-city-hall.mjs reading-terminal`.
4. Run the native `Scripts/import_city_hall.py` commandlet with `-PhillyReadingTerminal`.

The native review flag is `-PhillyReadingTerminalReview`. A stationary asset
capture cannot establish walking, driving, streaming transitions or 60 FPS
gameplay acceptance. Preserve the original photographic files for later art work.
