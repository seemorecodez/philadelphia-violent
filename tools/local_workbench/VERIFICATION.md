# Local Workbench verification

September 11, 2026. Scope: a local job runner with dependency planning, content-based caching, compact review context, a Blender adapter, an FFmpeg adapter and a native GLB inspector. This is enabling work for Frank's broader efficiency and precision goal, not proof of an automatic replica generator or a completed general AI orchestration platform.

## Actual application checks

- The real Philadelphia character input was `public/models/character/human-motion.glb`, 17,439,780 bytes, SHA-256 `57350f4cb3ec61a82864baf17e6947858823ae871ac57898c09681edcc470361`.
- The six-step job inspected the GLB, rendered front/back/left/right in one Blender process, and assembled a 2x2 contact sheet using FFmpeg.
- Actual execution used Blender 5.2.1 LTS, CPU Cycles, two threads, 512x512 views, 16 samples per view. FFmpeg came from the existing imageio_ffmpeg installation; nothing was installed or downloaded.
- The source hash was checked before and after. Source bytes remained identical; the importer-side geometry fingerprint also remained unchanged across review renders. This is not an import/export equivalence, material-accuracy or real-person resemblance claim.
- Original-resolution review showed the detailed character, clothing, hair, face, hands and shoes in all four views. These are diagnostic static views, not an animation review, final artwork approval or AAA acceptance.
- Render receipts explicitly label the bounding values as conservative camera-framing bounds, not measured character height. This prevents the importer's conservative bounds from becoming a false precision claim.

## Recorded execution and reuse

The final complete run recorded **23.6294 seconds**, six executed steps, one Blender batch, and 2,181 captured log bytes. Its repeated job recorded **0.6332 seconds**, six cache hits, zero executed application steps, zero Blender batches and no new tool logs. Source preservation was true in both.

Evidence paths beneath the project:

- `artifacts/local-workbench/runs/20260911-143030-7ca430f7/report.json`
- `artifacts/local-workbench/runs/20260911-143121-a5887609/report.json`

These samples use the final runner and worker. The final contact sheet was viewed at original resolution. They show reuse of already-created artifacts, not faster first-time rendering, account-quota savings or lower measured energy consumption. Machine load, file hashing, launcher startup and rendering all contribute to wall time. No statistical benchmark or concurrent-workload comparison was performed. Independently rerendered PNGs need not be byte-identical; cached reuse validates and returns the exact existing artifact bytes.

The compact context packet measured 754 UTF-8 bytes in a recorded full run, versus its explicit 4,096-byte summary ceiling. Its byte/4 token estimate is only a rough context-size estimate. The runner makes no model API calls. The surrounding Codex conversation and tool use still consume account usage. Quota savings, electricity and carbon fields remain null.

## Mechanical checks

`py -3.11 -m unittest discover -s tools/local_workbench -p test_workbench.py -v` passed **12 tests**. Checks cover actual GLB container validation, external resource rejection, local path boundaries, unsupported tools, dependency ordering/cycles, cache reuse, changed-source and corrupt-artifact invalidation, dependency/tool/parameter fingerprints, Blender batch grouping, failure without completion, and bounded context without automatic model selection.

Fixtures only test mechanics. The actual Blender/FFmpeg run above supplies integration evidence.

## Failure and recovery evidence

Direct execution of the Microsoft Store package's `blender.exe` was denied, including outside the initial sandbox. The installed application's registered launcher was discovered from its manifest and used successfully. No permissions or installation files were changed. The worker emits its own completion receipt because the launcher can return before rendering ends.

An automatically sized image preview appeared blank during review. Pixel inspection and original-resolution viewing confirmed character content in the rendered files and contact sheet. A nearly-uniform-image rejection check was added to the Blender worker as a basic guard; it does not replace visual comparison. No blank-image result is being claimed as an established Blender rendering defect.

## Boundaries and continuation

Implemented: local validated adapters, dependency-aware execution, batch preview rendering, cache integrity, input preservation, full evidence plus small next-decision context.

Not implemented: automatic model/provider routing, quota billing integration, energy measurements, learned reasoning policies, arbitrary desktop applications, source model editing, rig retargeting, animation generation, accurate identity reconstruction, or one-to-one replica validation against scans/references. The job format is an extension point, not proof of those capabilities.

Repository baseline: existing uncommitted Philadelphia work on master with no commits. This side task added only `tools/local_workbench/` and its own ignored `artifacts/local-workbench/` outputs. It did not edit the game, its models, its server, or Blender settings.

Proposed commit scope: `tools/local_workbench/workbench.py`, `blender_worker.py`, `test_workbench.py`, `character-review.json`, `inspect-character.json`, `README.md`, and this verification file. Proposed message: `Add local Blender and FFmpeg asset job runner with verified caching`. No commit or publication was requested or performed.

Next development boundary: add one actual candidate-edit or animation-review operation with a precise preservation contract, then verify it against the source asset and real game renderer before broadening the tool set.
