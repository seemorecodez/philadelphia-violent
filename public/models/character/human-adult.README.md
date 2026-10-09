# Clothed adult character

`human-adult.glb` is an assembled, skinned MakeHuman character with a detailed anatomical face and body, short hair, a blue collared shirt, jeans and brown leather shoes. All graphical source assets are MakeHuman's authored CC0 system assets. The anatomy, clothes and face are not placeholder primitive geometry.

The editable source is `assets/characters/human-adult.blend`. It contains seven separate mesh objects, their packed source textures, the original 163-bone MakeHuman skeleton and editable `Idle` / `Walk` actions. `scripts/prepare-human.py` reproduces the assembly in Blender 5.2.1 LTS without importing or executing MakeHuman application code.

## Source and license

- MakeHuman base mesh, default skeleton and skin weights: [official repository at commit a8bc2d54ff0ac92e78ff71431b1023eda42bf482](https://github.com/makehumancommunity/makehuman/tree/a8bc2d54ff0ac92e78ff71431b1023eda42bf482). Files: `makehuman/data/3dobjs/base.obj`, `makehuman/data/rigs/default.mhskel`, `makehuman/data/rigs/default_weights.mhw`.
- Clothing, hair and textures: [official system asset catalog](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), [CC0 archive](https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip). Only the selected source entries were downloaded using bounded HTTP range requests; no account or paid API was used.
- Selected authored assets: `male_casualsuit01`, `shoes01`, `short01`, `young_african_male`, `eyebrow001`, `eyelashes01`, `high-poly` eyes and `brown` eye material. Original attribution and CC0 notices remain in their source files under `assets/characters/source/system/`.
- [MakeHuman's official license](https://github.com/makehumancommunity/makehuman/blob/a8bc2d54ff0ac92e78ff71431b1023eda42bf482/LICENSE.md) explicitly separates application source code (AGPL) from graphical assets and exported output (CC0 1.0 Universal). This character contains the graphical assets. The full CC0 text is included in `human-adult.LICENSE.txt`. No endorsement by MakeHuman is implied.

Preparation changes: fitted the clothes and accessories using their source barycentric mappings; retained the authored anatomical topology; removed source modeling helpers and the body faces hidden under clothing; transferred original skin weights to accessories; normalized the assembled rest height to 1.78 metres; converted source materials to PBR; retained original color textures and outfit/shoe normal maps; authored simple idle and walk poses. The original source files and SHA-256 inventory remain under `assets/characters/source/`.

## Runtime contract

- Y up, +Z forward, metre units, scale 1. Rest-pose sole minimum is at ground zero. Animation includes a small vertical root correction for keyed shoe contact.
- 7 meshes, 163 bones, 41,586 triangles before glTF's UV/normal vertex splits.
- `Idle` and `Walk` are looping in-place clips, 1.0667 seconds each. Select a single action at a time. Translation through the city belongs to the runtime.
- Original default weights are normalized to the strongest four influences per vertex. There is no ragdoll, facial performance, lip sync or clothing simulation.
- The walk is a simple authored cycle, not motion capture. Ground correction is evaluated at the authored key poses; smooth playback, terrain slopes and foot sliding need in-world review.
- PBR conversion does not reproduce MakeHuman's legacy eye shader, all skin subsurface effects or cloth ambient-occlusion maps exactly. Hair uses alpha-masked authored cards. Outfit wear details come from the source texture.

Offline renders of the face, full body, contact pose and passing pose are in `assets/characters/inspection/`. The eye transparency was checked visually after conversion. These images establish the prepared appearance; actual Cesium rendering and animated movement remain separate acceptance checks. `human-adult.metadata.json` records the current derived asset hash and dimensions.
