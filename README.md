# Philadelphia Violent

Public source consolidation of the project historically named **Philadelphia Drive** in the local **GTA 7** workspace. This publication name follows the owner's October 9 request; native module and package names are preserved.

**Source publication, not a playable release:** Unreal Engine, downloaded models/textures, generated city geometry, compiled modules and saved editor state are excluded. This clone alone cannot run the native game. See [PUBLICATION.md](PUBLICATION.md) for scope, provenance, repair status and validation. Existing launch instructions below assume separately restored assets and tools.

> Production runtime: **Unreal Engine**, explicitly selected by Frank on September 13. Citywide Philadelphia remains the target. Browser/Cesium work below is retained reference history, not the native game's feature list.

# Philadelphia Drive

A local open-world game in development using **free public Philadelphia data without an API key or account**. The production target is native Unreal, approximately 1:1 Philadelphia, with world development first and storyline deferred. The browser prototype's features below are historical reference; they are not all implemented in Unreal. This is not yet an AAA-quality game.

## Run the native game

Open **Launch Unreal Philadelphia.cmd** (or **Launch Philadelphia Drive.cmd**).
This runs the local Unreal 5.7 development game directly and starts in the South
Philadelphia source pack. It does not open a browser. Requires the installed Unreal
engine and the compiled Philadelphia module; this is not a packaged shipping release.

**Launch Unreal Museum.cmd** starts at the Museum of Art approach in the same native
map. This location imports the original historical museum mesh and photograph
material. Separate starting locations do not prove a continuous drive between them.

WASD moves, mouse looks, Shift runs, Space jumps/brakes, F enters/exits the nearby
car, and F5/F9 save/load. Source streets and interpreted houses are still in
development. Native city packs and retained landmark assets do not establish a
finished AAA city. See NATIVE-EVALUATION.md for evidence and limits.

Build native changes with `Unreal/Philadelphia/Tools/build.ps1`.

## Archived browser prototype: reference only

Requires Node.js 22.12+ (developed with 24.18):

```powershell
npm.cmd ci
npm.cmd run dev
```

Open http://127.0.0.1:5173/ only to inspect the retained browser reference. Keep the terminal running; Ctrl+C stops it. The project launchers now run Unreal.

Choose a neighborhood, click **Start exploring**, let the city load, then click a clear street to place the car. In placement mode, drag to pan, scroll/right-drag to zoom and Ctrl-drag to tilt.

- **WASD / arrows:** drive and steer. **S / down:** brake, then reverse.
- **Space:** handbrake. **C:** chase, hood or aerial camera.
- **P / Escape:** pause. **R:** return to your placed position.
- **F:** leave a stopped car or enter it within 5 metres. **Shift:** sprint forward on foot. The on-screen Sprint button toggles running for mouse control; pausing or interacting resets it.
- **E:** enter a building within 5 metres or return outside through the interior exit.
- **X:** break an eligible nearby street object or small building. Buildings over 20 feet and unknown heights stay protected. Detailed downtown meshes are currently protected because individual buildings cannot yet be separated.
- **G:** greet a nearby visible interior NPC. This is a basic interaction, without storyline or missions.
- **Record:** capture up to 60 seconds of the actual game canvas, without audio; replay and save locally. **Performance:** view measured frame cadence and CPU elapsed time, without telemetry.
- **Menu / Tab:** neighborhood, vehicle, controls and performance drawer. **Place car** returns to map exploration. Drag the view while playing to look around; scroll to adjust camera distance.
- **On-screen keys** in Menu shows driving buttons. **Footsteps** opts into recorded walking sounds; vehicle audio is still absent. The game pauses on focus loss; resume explicitly. Pause preserves velocity and freezes wheel motion.

## Actual sources and coverage

Local model assistance: `node scripts/local-city-review.mjs src/city-photo-recovery.js` uses the installed Ollama Qwen3-Coder as a bounded reviewer. It does not execute its own suggestions. See LOCAL-AGENT.md for the actual run, rejected recommendations, verified follow-up and input limits.

| Layer | Source and scope |
| --- | --- |
| Detailed buildings | City of Philadelphia/PASDA, publicly served by Esri. Center City, roughly 4.9 x 3.3 km. Mixed 2015 textured and 2010 untextured models. |
| Recovered original photographs | The matched Chinatown block `philly_0000` / source OBJECTID 2351 now uses its original PASDA photograph mesh, with an additional source-derived mesh retaining I3S-only surfaces. Menu's **Original building photos** button compares the result with the original untextured stream. This is one historical block, not full-city photographic recovery. |
| Buildings beyond downtown | Actual public city footprint polygons with supplied approximate heights. Bounded areas load as you explore; plain facades and extruded roofs. Missing heights are omitted. |
| Ground imagery | Original Philadelphia CityImagery_2023 photograph layer, restored to preserve actual detail. Selective cleanup/reconstruction of baked cars, trees and shadows is unfinished. |
| Terrain | Mapzen Terrain Tiles on AWS Open Data, including USGS 3DEP. A checked local tile cites 2010 USGS data; resolution varies. |
| Sidewalks | Actual Philadelphia FCODE 2210 polygons from PASDA, with holes and boundaries retained. Nearest 96 sections within 90 m; authored 8 cm relief and damage divisions; original 2023 aerial photographs mapped onto the tops. |
| Trees and poles | Public city inventory records; detailed CC0 tree model and authored pole geometry at recorded positions. Bounded nearby displays. See STREET-SOURCES.md. |

Sources and terms: [Philadelphia 3D models](https://www.pasda.psu.edu/uci/FullMetadataDisplay.aspx?file=Philadelphia_Building_3DModels.xml), [public Esri scene](https://www.arcgis.com/home/item.html?id=193e4225af0f49809cb97d0e995553a1), [city footprints](https://opendataphilly.org/datasets/building-footprints/), [aerial imagery](https://opendataphilly.org/datasets/aerial-photography/), [AWS open terrain](https://registry.opendata.aws/terrain-tiles/), [terrain attribution](https://github.com/tilezen/joerd/blob/master/docs/attribution.md), [USGS public data](https://www.usgs.gov/3d-elevation-program/about-3dep-products-services).

Public endpoint access and catalog terms were checked September 11, 2026. No account, key, subscription or billing setup was needed. The providers control continued availability; internet access is required. Visible data credits must remain readable. City data is provided as-is and keeps its own terms.

## Driving and fidelity limits

The detailed downtown scene is **not a photorealistic model of every Philadelphia neighborhood**. Outside it, real footprint shapes and source heights use plain materials. Invalid/missing data is reported and omitted; fictional replacement buildings are not generated.

Ground contact and collision checks are experimental. Terrain is a bare-earth elevation grid with detailed aerial imagery; it does not supply bridge decks, tunnel surfaces, lane rules or a semantic drivable-road network. Buildings, surface boundaries and terrain differ in age. The car aligns its rigid body to finite, locally sampled terrain; this is not suspension physics. Mustang wheels rotate and steer; Huracán wheel separation/animation is still pending. Suspension, traffic, outdoor crowds and multiplayer are not implemented.

The fleet currently contains distinct detailed, unmarked Mustang and Huracán bodies. F-150, Camaro and Aventador assets are still outstanding. The anatomical character and three furnished interiors have editable Blender sources. Interior layouts are game spaces, not surveyed Philadelphia rooms. Interior NPCs share the current character model and use short authored routes. Locomotion and destruction are early implementations, with animation blending, foot placement, varied NPC appearance and structural physics still outstanding.

Mapped sidewalk sections can be removed, and visible eligible building geometry is removed from collision at the same time. Aerial photographs remain beneath the geometry, including baked cars, trees and shadows. Their selective reconstruction/cleanup is unfinished. The attempted plain-color ground replacement failed Frank's detail-preservation target and is no longer used in the game. Source models remain retained; the verified Chinatown block switches to the original photographed source only after both replacement meshes and matching identity fields are ready. Small-building eligibility requires both positive approximate and maximum source heights at most 20 feet. See RECONSTRUCTION-TARGET.md for the governing fidelity requirement and GROUND-CLEANUP.md for the rejected experiment.

The app follows loaded terrain elevations, rejects abrupt height jumps and checks the whole car and its swept path against actual city building footprints. It waits for footprint coverage before allowing placement or movement. These are conservative 2D boundaries; they do not model overhangs or openings under buildings. Chase-camera clearance uses the same footprint data. A few successful drives cannot establish every street as drivable.

Elevations are displayed in a shared local orthometric frame. Detailed buildings declare EGM96 heights; USGS generally uses NAVD88. The residual datum difference is not survey-corrected. Municipal bases use active-terrain samples, since their source base_elevation datum is unverified. Supplied building heights use 0.3048 metres/foot. Ground anchoring uses one representative sample per building, not surveyed foundations.

## Verification and hosting

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview
```

Preview opens at http://127.0.0.1:4173/. Dev and preview proxy only numeric `/terrain/<z>/<x>/<y>.png` requests to the fixed AWS public bucket because it lacks browser CORS headers. A static-only deployment of dist needs the same narrowly scoped route. Local `/__capture` accepts same-origin WebM recordings only and stores them under `artifacts/videos`; it is not an upload to an external service. Do not open index.html directly.

Cesium workers/assets and the car are local. The renderer bundle is several MB; a size warning is expected. Performance depends on GPU acceleration and network access. Low bandwidth reduces native building/terrain detail and pixel resolution; all settings retain the actual source data. Terrain downloads stop at source level 15; finer grids resample that source and do not add measured detail. If a sandbox reports spawn EPERM, use an ordinary terminal; numerical tests can also run with `node --test --test-isolation=none tests/*.test.js`.

`/diagnostics/vehicle.html` is an isolated development-only car rendering check, with no city requests. Its script policy permits eval required by Cesium's local codecs; it is not a production build entry. Acceptance and verification status are in ACCEPTANCE.md and VERIFICATION.md.

Application source: MIT, copyright SeemoreCodez. See [project licensing](README-LICENSING.md). Cesium is Apache-2.0. Mustang: Ricy, CC BY 4.0; Huracán: George Zaky, CC BY; tree: Rico Cilliers/Poly Haven, CC0; character system assets: MakeHuman Community, CC0. Source rights and modifications are documented beside each model. The app does not relicense city data, request geolocation or include analytics. CursorCore's timing/budget design is adapted under MIT; see ENGINE-REUSE.md for its limited scope and why it is not a replacement 3D renderer.
## September 12 city expansion

The city now adds individualized ordinary-house facades on real footprints and heights, with close 3D windows/doors/roof-edge details and cheaper distant detail. Named landmarks retain their source geometry. In the game Menu, **Find a landmark** searches the locally retained city building, landmark and park records; the Art Museum is also a starting location. South, West and North Philadelphia house areas, Penn Treaty Park and East Fairmount Park have direct destinations.

Park woodland uses the existing city canopy polygons, public park boundaries and paving exclusions, plus locally reviewed photograph patches. Tree positions inferred within canopy are interpretations, not surveyed individual stems. Existing aerial photos and recognizable detailed downtown models remain. See [the expansion record](CITY-EXPANSION-2026-09-12.md) for actual coverage, local Ollama contributions, measurements and remaining work. This is an expanded prototype, not a completed AAA game.
