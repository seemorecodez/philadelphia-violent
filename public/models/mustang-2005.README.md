# 2005 Mustang model: source and preparation

`mustang-2005.glb` derives from **2005 Ford Mustang GT** by **Ricy (@ngon_3d)**, licensed **Creative Commons Attribution 4.0 International (CC BY 4.0)**.

- Creator and original model: https://sketchfab.com/3d-models/2005-ford-mustang-gt-26b6b60cf2804370ac3c64424242dc1f
- Creator profile: https://sketchfab.com/ngon_3d
- License: https://creativecommons.org/licenses/by/4.0/
- Public redistribution used: https://raw.githubusercontent.com/nesdesignco/FormDrive/main/public/models/mustang-2005.glb
- Redistributor's attribution: https://raw.githubusercontent.com/nesdesignco/FormDrive/main/public/models/MUSTANG-LICENSE.md
- Retrieved: 2026-09-11, without an account or API key.
- Unmodified source is isolated at `artifacts/sourcevehicles/mustang-2005.original.glb` and is not copied to the public directory.
- Source SHA-256: `50028ce61dd4f6b210d710d354d2312f0a2cac0d24056d09d20f039abaaa243b`.

The source GLB embeds the original author, source URL, title, and CC BY 4.0 license in `asset.extras`. Those credits remain in the derivative. The third-party asset is not relicensed under the application's MIT license. No endorsement by the manufacturer or model creator is claimed.

## Changes made

The front pony, rear medallion, steering-wheel emblem, four wheel-cap lettering meshes, and door-sill lettering overlay were detached after inspecting their texture content and geometric bounds. The front honeycomb grille is a separate detailed mesh and is preserved.

The 40 embedded source images were inspected. Texture bindings containing lettering, logos, numbers, control symbols, or warning decals were removed from their individual surface materials. Those surfaces use matching plain rubber, plastic, or visor colours; the source roughness and metallic properties are preserved. Eight unmarked source textures remain active: headlamp, taillamp, tire tread, brushed panel, speaker grille, amber marker, rear side lamp, and overhead-light assembly. This preserves the body panels, light housings, grille geometry, wheels, seats, dashboard, switches, and their unmarked materials. The file retains the unchanged original compressed binary chunk, including unused texture data and detached mesh data, but these are not referenced by the active scene/materials.

The model was uniformly scaled to **4.77 m long**, horizontally centred, and moved so its lowest tire vertices sit at height zero. It is **2.13785 m wide including mirrors** and **1.40864 m high**. The active model has **78,531 triangles**. glTF axes are **+Y up, +Z forward**; Cesium's default model conversion makes these **+Z up, +X forward**. Use runtime scale **1** and ground offset **0**.

Preparation is reproducible with `node scripts/prepare-mustang.mjs`. The script requires the exact source hash and uses the installed Cesium/Draco libraries to measure every decoded POSITION vertex. `mustang-2005.metadata.json` records exact bounds, scale, hashes, detached nodes, material changes, and each wheel's source node roots, centre, and radius. Wheels remain static; adding animation requires transforming the recorded global pivots into the appropriate source node frame.

## Verification boundary

Verified: source identity/license metadata, texture inventory and marking identification, decoded geometry bounds, separate emblem meshes, 4.77 m normalization, embedded buffers, and retained author/license attribution.

Prepared for visual review: front, rear, side, wheel, and interior appearance in the application's renderer. Full absence of visible markings and final material quality require that visual review. This model has not been installed as the app's active car by this preparation script.
