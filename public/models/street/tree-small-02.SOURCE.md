# Tree Small 02

Creator: **Rico Cilliers**, distributed by **Poly Haven**.

- [Official asset page](https://polyhaven.com/a/tree_small_02)
- [CC0 license statement](https://polyhaven.com/license)
- [Official public download manifest](https://api.polyhaven.com/files/tree_small_02)
- [1k Blender source](https://dl.polyhaven.org/file/ph-assets/Models/blend/1k/tree_small_02/tree_small_02_1k.blend)

Downloaded September 11, 2026 without an account or API key. All eleven source files matched the manifest's byte sizes and MD5 checksums; SHA-256 hashes were also recorded in `artifacts/source-street/tree-small-02/download-evidence.json`. The unmodified Blender file SHA-256 is `af3fef6da3eb97057d9d4d3c4281c5944696b8d518715deddd8500482d30b1bd`.

The runtime GLB derives from the creator's `tree_small_02_LOD1`, originally 495,533 triangles across its three materials. Blender 5.2.1 reduced that existing mesh by material to **126,863 triangles**: 6,999 trunk, 9,999 branches, and 109,865 leaves. UVs and source textures remain. Color/normal maps use the 1k source maps, with supported non-alpha images exported as JPEG quality 90; leaf opacity is retained in the embedded PNG. Leaf material uses glTF alpha masking with cutoff 0.4. The source trunk XY anchor remains; a 0.0241942313 m vertical offset places its lowest root at ground zero. glTF uses Y-up with metre units. Native displayed height is **4.5758485700935125 m**.

An initial 28,977-triangle experiment visibly lost too much canopy and was replaced. The final GLB was re-imported and rendered in Blender; `artifacts/source-street/tree-small-02/runtime-glb-preview.png` shows the actual exported mesh and materials. This verifies a textured tree silhouette and leaf transparency, not its in-city lighting or performance. The city uses at most the nearest 12 detailed trees within 80 m.

Runtime file: `tree-small-02.glb`, 14,840,160 bytes.

SHA-256: `bf13178b90779699b3a4d0c57211dbb1ee41df602ad1a6d3391eae2b125073df`.

Reproduction: `scripts/prepare-street-tree.py` downloads/validates the bounded source package. Run its `--inspect` and `--export` modes through installed Blender with `--background --factory-startup --disable-autoexec --python SCRIPT -- --export`. Source-file scripts are explicitly disabled. `preparation-status.json` records final export success; older `preparation-error.txt` is retained as a historical diagnostic, not the current status.

This mesh represents a small tree. Philadelphia inventory points, species labels and diameters are separate city data. The app does not claim that this asset reproduces each recorded tree's species, exact height or canopy. The model's height is a display dimension, and the trunk collider is a game approximation.
