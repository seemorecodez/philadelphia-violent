# Huracan Performante exterior

`huracan-performante.glb` is a prepared derivative of George (`georgezaky108`)'s **Lamborghini Huracan Performante**, supplied under CC BY in the [creator's license listing](https://blendswap.com/blend/20021). The listing does not state a license version, so none has been invented. Preserve [the attribution notice](huracan-performante.LICENSE.txt) with redistribution. This third-party asset is separate from the application's MIT license.

The [original creator post](https://blenderartists.org/t/lamborghini-huracan-performante/692996) provides the freely accessible `car072.blend` attachment. The creator identifies this as their first car model and states that it has exterior geometry only. The public original, creator post JSON, license-page HTML, hash, and inspection records are kept under `artifacts/sourcevehicles/`; no account or API key was used.

## Runtime dimensions and orientation

- Length: 4.506 m, used as the normalization target.
- Width: 2.036245 m including the modeled mirrors.
- Height: 1.122458 m including the modeled wing.
- Axes: glTF +Y up, +Z forward; horizontal bounding-box center at the origin and minimum tire height at zero.
- Runtime scale: 1; runtime ground offset: 0.
- 43 mesh nodes, 711,690 triangles, 2,593,832 bytes with Draco compression.

The measured width and height follow the creator's proportions after uniform scaling. This is an artist's exterior model, not a factory CAD model. The original front and rear tire centers differ slightly in height; their measured positions are retained in the metadata. There is no invented cabin interior or working wheel rig. Wheel components contain multiple wheels per mesh; individual tire centers and radii are supplied in `huracan-performante.metadata.json` for future articulation.

## Preparation

`scripts/prepare-huracan.py` reproducibly loads the original source with automatic script execution disabled and checks its SHA-256. It evaluates the original body panels, mirrors, molded lamps, wheel spokes, tire tread, bevels, and thickness modifiers into mesh geometry.

- Removed `Plane.003`, the raised rear lettering, and `Plane.005`, the front shield badge.
- Removed the studio setup and camera-invisible rear-lettering deformation cage. Two loose source vertices behind the car had no faces and never rendered; unused vertices were removed before measuring scale.
- Used the source render subdivision levels, with a maximum of two. The already-dense wheel spoke and brake components use one level; individual modeled taillight bulbs use the existing source mesh without extra subdivision. The body silhouette and detailed modeled surfaces remain.
- Converted the source green paint to a clear-coated PBR material, preserving its pigment family. Converted the distinct dark trim, metal, rubber, mirrors and light materials individually. The exact material values and subdivision changes are recorded in the metadata.
- Retained real tread geometry. The old procedural tire micro-bump is not exported. Legacy view-dependent Cycles paint cannot transfer exactly into glTF metallic/roughness materials, so the PBR result is an approximation of the inspected source finish.
- Used dark opaque reflective cabin glass, consistent with the exterior-only model's appearance; lamp covers retain translucent surfaces. The resulting GLB contains no images or image textures. The source's packed logo and photographic modeling references are not included in the exported GLB.

Editable prepared asset: `assets/vehicles/huracan-performante.blend`. This contains the converted materials and evaluated mesh geometry. The untouched original `.blend` remains isolated under `artifacts/sourcevehicles/`.

## Reproduce and review

Run installed Blender in background mode with `--factory-startup --disable-autoexec --python <absolute-path-to-scripts/prepare-huracan.py> -- prepare render`. The Windows registered `blender-launcher.exe` alias works on this machine. The script writes success/errors and three local views under `artifacts/sourcevehicles/huracan-inspection/`, because the registered launcher does not forward stdout reliably.

Source and prepared front/rear/side renders were inspected in Blender. The prepared renders preserve the recognizable body and wheel detail, and the removed front/rear markings are absent. Actual Cesium rendering and driving performance remain separate checks; do not infer them from export success or these offline views.
