# Local Workbench

A working first version of Frank's tool for reducing repeated application work and keeping AI decision context small. The shared job runner currently connects **Blender**, **FFmpeg**, and a native GLB inspector. It performs local deterministic steps, records their dependencies, caches verified artifacts, and prepares a compact packet for the next review decision.

This is enabling tooling for the Philadelphia project. It does not create a precise character from missing references, guarantee AAA appearance, change Codex's model or reasoning settings, or demonstrate account-quota or carbon savings. No model API calls, cloud services, extra agents, or telemetry are part of the runner.

## Run the supplied character review

From the Philadelphia project directory:

```powershell
py -3.11 tools/local_workbench/workbench.py plan tools/local_workbench/character-review.json
py -3.11 tools/local_workbench/workbench.py run tools/local_workbench/character-review.json
```

The plan command is read-only. The run command writes only beneath `artifacts/local-workbench/`. It reads the existing `human-motion.glb` and never saves over it or modifies the game's files.

The six-step job is:

```text
Actual GLB source
  -> inventory
     -> front preview ┐
     -> back preview  ├ one Blender session
     -> left preview  │
     -> right preview ┘
        -> FFmpeg contact sheet
           -> compact review context + full local evidence
```

Re-running the same job checks the input, executable, implementation, parameters, dependencies and output hashes. Valid cached steps are reused without launching their application. A changed preview invalidates that step and its dependent contact sheet; unchanged sibling steps can still be reused. Changing the runner/worker implementation deliberately invalidates existing entries.

For an inspection without Blender or FFmpeg:

```powershell
py -3.11 tools/local_workbench/workbench.py run tools/local_workbench/inspect-character.json
```

Python 3.11 or newer is sufficient for the runner and its tests. Blender and FFmpeg are local executables. The runner checks PATH, the existing project's Blender runtime record, and the already-installed `imageio_ffmpeg` package for FFmpeg. Explicit paths are supported:

```powershell
py -3.11 tools/local_workbench/workbench.py run tools/local_workbench/character-review.json --blender "C:/path/to/blender.exe" --ffmpeg "C:/path/to/ffmpeg.exe" --timeout 180
```

Microsoft Store Blender uses `blender-launcher.exe`; the runner recognizes the existing Store installation and waits for a receipt from the actual Blender worker. Preview rendering uses two CPU threads and the job's sample/resolution settings. A per-process deadline terminates only that worker if it overruns; it does not enumerate or stop other Blender sessions. No permanent Blender preferences are changed.

## What is implemented

| Concern | Current behavior |
| --- | --- |
| Context | At most 4,096 UTF-8 bytes in the compact summary. Full logs and artifacts remain on disk. Byte/4 token estimates are explicitly not billing measurements. |
| Reasoning | Known steps execute locally. The report recommends visual review, inspection, or focused diagnosis after failure. It never treats a successful render as approval. |
| Model choices | Reports the capability needed for the next review. Automatic model selection and model calls are not implemented. |
| Task tree | Validates dependencies, rejects cycles, executes ready steps and reuses completed results. |
| Tools | GLB container inspection, four-direction Blender static previews, FFmpeg contact sheets. No arbitrary shell commands in job files. |
| Precision | Original source bytes are checked before/after. Imported mesh geometry is checked across preview rendering. This does not prove import/export equivalence or resemblance to a real person. |
| Repeated work | Content-addressed cache with artifact integrity checks; corrupt, missing or changed results are recomputed. |
| Resources | Reports wall time, application batches, reused steps and log size. Quota, energy and carbon values stay null because no meters are connected. |

Output paths are printed at completion:

- `report.json`: full step/artifact provenance and source hashes.
- `context-packet.json`: the bounded next-decision summary.
- `cache/<hash>/`: inspection data, review images and hashed completion receipts.
- Per-run application logs and Blender completion receipts, including errors.

The contact-sheet order is **front, back / left, right**, using Blender axes: Z up and negative Y forward. This is a declared view convention, not automatic recognition of every asset's intended front. Lighting and framing are diagnostic. The imported pose is static; existing animation clips are inventoried but not retargeted or authored by this version. An inexpensive pixel check rejects nearly uniform renders; visual review remains required.

## Job contract and additional applications

Job version 1 contains named local GLB inputs and steps with `id`, `tool`, optional `input`, `depends_on`, and `params`. Inputs resolve relative to the job file and must remain within the selected workspace. Each source is limited to 1 GiB; jobs have at most 32 inputs and 100 steps. External GLB image/buffer references are rejected so the cache cannot silently ignore a changed dependency. Packed GLB resources are supported.

Blender preview parameters are `view` (front/back/left/right), `size` (128–1,024 pixels), and `samples` (1–64). A contact sheet requires four same-sized preview dependencies. Timeouts are 10–600 seconds per application invocation, default 180.

To add another application, implement a named adapter with validated parameters, local input fingerprints, a bounded process invocation, explicit output receipts, and failure handling. Add real-path verification for that adapter. The existing dependency/cache/context layer is shared; there is no need to design a separate agent for each UI operation. This first version is not a universal desktop automation platform.

The next useful Blender extensions are reviewed batch edits on a separate candidate, named-animation review clips, and rig-specific motion transfer. Each needs its own visual checks and preservation contract before use on production assets. Automatic identity reconstruction, artistic judgment, and model/provider routing remain separate work.

## Verification

```powershell
py -3.11 -m unittest discover -s tools/local_workbench -p test_workbench.py -v
```

See `VERIFICATION.md` for actual application runs, failed experiments, timings and the source-preservation result. Test fixtures are solely mechanical checks and never supplied as game assets.

Source code: MIT, Copyright (c) 2026 SeemoreCodez, under the repository's existing LICENSE. Source models and external applications retain their own licenses. No publishing or source-project integration is performed by this tool.
