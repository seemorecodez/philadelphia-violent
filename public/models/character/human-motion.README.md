# Detailed human motion

`human-motion.glb` extends the working `human-adult.glb` with an authored **Run** clip. Selected for runtime after Blender pose review and Cesium front/side Run playback checks. The original model and Blender file remain intact. Full gameplay cadence, transitions and foot placement remain under development.

The same seven detailed anatomical/clothing meshes, source skin weights, packed images, materials, alpha-masked hair, Idle action and Walk action are retained. `scripts/inspect-human-motion.py` compares their actual exported data with the working GLB; each retained-data check passes.

Run contains alternating contact, recoil, passing, toe-off and flight poses, opposing bent arms, an inclined torso, relaxed hands and an upward pelvis arc during flight. It is an in-place authored cycle, not motion capture. It does not provide foot IK, terrain adaptation, turning, start/stop clips or transitions.

| Clip | Authored duration | Measured full-cycle travel estimate |
| --- | ---: | ---: |
| Walk, retained unchanged | 1.0667 seconds | 0.94085 metres |
| Run | 0.6667 seconds | 2.50374 metres |

Travel is estimated from the actual deformed shoe's lowest contact patch. The patch changes during heel-to-toe roll, and the FK motion does not lock a foot in place. These values can inform distance-driven cadence; they are not guarantees against sliding.

The Run sole was sampled through a full cycle at 120 Hz. The lowest measured point stayed 2.299 mm above the inspection ground. A 10 mm clearance at authored frame samples allows for between-frame deformation; this is not collision-based foot placement in the city.

Editable candidate: `assets/characters/human-motion.blend`.

Reproducible authoring script: `scripts/animate-human.py`. Run with the installed Blender launcher, background mode, `--disable-autoexec`, and `-- render` for contact/recoil/passing/toe-off/flight/front inspection images. Preview rendering uses two CPU threads and 12 samples; previews support pose inspection, not final rendering-quality claims.

Validation and source measurements: `assets/characters/inspection/motion/`.

The underlying MakeHuman Community system assets are CC0 1.0; see `human-adult.LICENSE.txt` and `human-adult.README.md` for the pinned source and provenance. The new authored animation script and poses use the project's MIT license, SeemoreCodez 2026. This candidate does not establish AAA animation acceptance.
