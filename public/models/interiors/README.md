# Authored furnished interiors

These are original game-space interiors created for this project in Blender 5.2.1 LTS. They do not reproduce surveyed Philadelphia interiors. Geometry and packed texture images were authored by `scripts/build-interiors.py`; no third-party meshes, photographs, logos, or lettering were imported.

| Asset | Furnishings | Triangles | Material groups |
| --- | --- | ---: | ---: |
| `lobby.glb` | Upholstered sofas, reception workstation, small desk objects, framed wall panels, rugs | 29,352 | 18 |
| `shop.glb` | Stocked double-sided shelving, unmarked bottles/packages, kitchen cabinets, sink, refrigerator, oven and microwave | 67,504 | 20 |
| `home.glb` | Living room, dining area, kitchen, bed and nightstands, wardrobe, vanity, toilet and glazed shower | 47,856 | 22 |

The glTF files contain their geometry, PBR materials and texture images; they have no external buffer dependencies. Export geometry is joined by material to limit draw calls. The source files in `assets/interiors/` retain separate named objects, collections, bevel modifiers, materials and packed images for editing.

## Placement and collision contract

- Metres: Blender X is east, Y is north, Z is up. The glTF exporter performs its normal Y-up conversion. Place the resulting Cesium model at the existing east-north-up interior origin with scale 1.
- Floor top: Z = 0. Walls: height 2.9 m, thickness 0.18 m. A south doorway is centred at X = 0.
- Exact room dimensions, spawn positions, wall segments and furniture colliders are recorded in `layout-contract.json`.
- Lobby and shop use the existing application floorplans. The home contract adds four connected room areas.
- Ceilings are deliberately open for the application's overhead camera. These are furnished game models, not watertight architectural reconstructions.

## Evidence and limits

The three `*-preview.png` files are Blender Cycles renders inspected after correcting deferred transform evaluation. Room orientation, wall locations, doorway framing and furnished silhouettes were checked in those images. The preview lighting is saved in the editable Blender files; the GLBs contain emissive light fixtures and PBR materials, and use the game's actual lighting at runtime. Blender previews are not screenshots of the live game.

`build-complete.json` marks a completed export/render pass. `provenance.json` records file hashes. Browser walking, collision, lighting, and recording checks belong to the integrated application verification, not the asset triangle-count check.

Rebuild with the local Blender launcher:

```powershell
& '<LOCAL_HOME>/AppData/Local/Microsoft/WindowsApps/blender-launcher.exe' --background --factory-startup --python '<LOCAL_HOME>/OneDrive/Documents/ChatGPT/GTA 7/scripts/build-interiors.py'
```

The script records progress and failures in this directory because the Microsoft Store launcher may not forward standard output. It writes individual model-ready markers, then `models-ready.json`, then renders the previews and writes `build-complete.json`.
