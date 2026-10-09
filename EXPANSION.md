# Philadelphia interaction expansion

Current priority: animation and city detail. Storyline and customization are deferred. The full original GTA-style open-world target remains open; the current local prototype is far below its AAA quality bar.

## Implemented foundations

- Distinct detailed Mustang and Huracan bodies, visually checked with visible logos, badges, text, numbers and decals removed. Mustang wheel rotation and front steering use its existing mesh nodes. Huracan wheels remain static.
- Detailed clothed MakeHuman character, edited/exported in Blender, with named locomotion clips and distance-driven walking. The separate Run clip has passed Blender pose and Cesium playback review and is selected for runtime. Animation blending and terrain-aware foot placement remain needed.
- Vehicle exit/entry, outdoor movement and collision, a separate interior transition, furnished lobby/shop/apartment layouts and return through the exit. Editable Blender source accompanies runtime models. Layouts are authored game content, not actual surveyed rooms.
- Interior NPCs follow bounded routes and stop near the player. Only ready, visible models participate in collision or conversation. They currently share one character appearance; no outdoor crowds or deep behavior exists.
- Actual street-tree and pole records, detailed CC0 foliage, real sidewalk polygons with holes preserved, terrain anchoring, bounded streaming and selective destruction. Aerial pixels beneath removed objects remain unchanged.
- Building destruction requires positive approximate and maximum source heights no greater than 20 feet, ready separate geometry and matching collision removal. Tall/unknown-height buildings and the inseparable downtown I3S mesh remain protected.
- Actual gameplay recording/replay/local saving and a visible performance panel. CursorCore contributes CPU timing/budget design; no rendering speedup has been established.

## Remaining target work

1. Improve and visually validate animation transitions, running, foot contact, vehicle suspension and car entry/exit motion.
2. Replace missing plain facade detail with capable, verified assets or surveyed reconstruction. Real 2022 LiDAR can help roofs/bridges, but it does not supply facade textures; see CITY-DETAIL-NEXT.md.
3. Complete F-150, Camaro and Aventador models with verifiable reuse rights and visual inspection. No relabeled stand-ins.
4. Expand destruction beyond removal/short fragment effects, while preserving the protected-building rule. Verify additional actual neighborhoods and streamed state retention.
5. Profile a foreground game session, separate GPU time from CPU work and optimize measured bottlenecks while preserving required visual detail. Current frame cadence is uneven.

No traffic system, outdoor pedestrian population, complete citywide interiors, multiplayer or finished AAA gameplay is claimed. Source limitations and validation gaps are recorded in VERIFICATION.md. All project files remain attributable and uncommitted in the initially empty repository.
