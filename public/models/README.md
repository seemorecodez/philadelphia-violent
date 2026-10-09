# Car model provenance

`car.glb` is a scene-only adaptation of **Toy Car**, from the Khronos glTF Sample Assets repository. The car geometry and embedded image data are the original artists' work. It is a stylized car asset, not a specific Philadelphia vehicle or a photorealistic vehicle scan.

- Original car: Guido Odendahl.
- Materials and scene composition: Eric Chadwick.
- License: **Creative Commons Zero v1.0 Universal (CC0)**, as stated in the upstream README and the GLB's own copyright field.
- Source: [Khronos ToyCar directory](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/ToyCar).
- Exact download URL: [ToyCar.glb](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/glTF-Binary/ToyCar.glb).
- Upstream source notes: `ToyCar.SOURCE.md`, downloaded without editing from [upstream README](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/ToyCar/README.md).
- License text: `CC0-1.0.txt`, downloaded from [Creative Commons](https://creativecommons.org/publicdomain/zero/1.0/legalcode.txt).
- Retrieved: 2026-09-11.
- Unmodified original: `ToyCar.original.glb`.
- Original SHA-256: `01a60862de55cd4b9f3acfab0b0def86451800f9c42467fcd61052c16cb9838c`.
- Derived SHA-256: `2e03c80f5ed640319f2d4c51b79b4326f1598263246af7f45c29fe622cb33684`.

## Adaptation

The active scene includes the original `ToyCar` and `Glass` meshes. The presentation fabric and sample cameras were removed from the scene. Unused embedded mesh and texture data remain in the file; the GLB binary chunk is unchanged. Only JSON scene structure, node transforms, and generator metadata were edited.

Both active nodes were uniformly scaled by `117.25031796609477` relative to their original node scale, making the full car length exactly **4.5 metres**. The ground contact point and horizontal bounding-box centre were moved to the origin. The resulting bounds are approximately **2.19346 m wide, 1.36294 m high, 4.5 m long**. Measurements use every POSITION vertex after its node rotation and scale, excluding the presentation fabric.

Use `/models/car.glb` with **model scale 1** and **ground height offset 0**. The glTF scene is **Y-up, +Z-front**. Cesium's default `upAxis: Axis.Y` / `forwardAxis: Axis.Z` transforms it to **Z-up, +X-front** in the model's local frame. The direction was checked by sampling the embedded emissive texture at vertices: the +Z end has white headlights, and the -Z end has red tail lights. Cesium's axis correction was checked against the installed `ModelUtility.getAxisCorrectionMatrix` implementation.

`car-metadata.json` contains exact dimensions, transforms, and integrity hashes. Binary and accessor checks establish model structure and dimensions. Final lighting, material support, wheel placement, and on-road appearance require inspection in the running app. Wheels are part of a static mesh and do not have separate animation nodes.
