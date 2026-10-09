# Neighborhood street kit

The lamp, hydrant, cart bin, utility pole, parking sign, planter, railing, mailbox,
and conductor were authored for this project with the editable Blender script
`scripts/create-neighborhood-street-kit.py`. Their appearance is an interpretation,
not evidence of surveyed Philadelphia prop locations.

The separately retained **Tree Small 02** is by **Rico Cilliers / Poly Haven**,
CC0-1.0. The existing source, modifications, and checksums are documented in
`public/models/street/tree-small-02.SOURCE.md`. Native import reuses that GLB and
its textures; the Unreal importer adds LODs, instancing support, and trunk collision.
`tree-far-lod.blend`, its GLB, and the three `tree-lod-*.png` views are albedo/alpha
renders of that same CC0 tree used only as its distant canopy LOD.

`parked-vehicle.blend`, `parked-car.glb`, and `parked-car-albedo.png` derive from
**2005 Ford Mustang GT**, by **Ricy (@ngon_3d)**, **CC BY 4.0**.

- Original: https://sketchfab.com/3d-models/2005-ford-mustang-gt-26b6b60cf2804370ac3c64424242dc1f
- Creator: https://sketchfab.com/ngon_3d
- License: https://creativecommons.org/licenses/by/4.0/
- Retained source and earlier unmarked-model preparation: `public/models/mustang-2005.README.md`.
- Full license: `public/models/mustang-2005.LICENSE.txt`.

This pass joined the active source meshes, retained the existing removal of
markings, baked their base colors/textures into one 1024px atlas, applied the
inherited transforms, and grounded the tires. The parked variant uses opaque
windows and a shared roughness value; it does not preserve every original
material response. The original playable vehicle is unchanged. Unreal adds
three LODs and a simple body collider. These third-party assets are not relicensed
under the repository's MIT code license. No creator or manufacturer endorsement
is implied. Keep this attribution with the derived assets.
