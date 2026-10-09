# Publication scope — Philadelphia Violent

Prepared 2026-10-09 from the owner's existing Philadelphia project. The publication name is Philadelphia Violent; earlier files use Philadelphia Drive, the workspace alias GTA 7, and the native module Philadelphia. No module/package rename or game architecture replacement was performed. This is an independent project; no Rockstar affiliation or rights are claimed.

## Included source and provenance

- Current canonical native C++ module, Unreal project/configuration, Python editor/import scripts and PowerShell build/probe scripts under Unreal/Philadelphia.
- Browser/Cesium reference implementation, behavior tests, geographic/asset generation tools, editable asset creation scripts, package manifest/lock, and project documentation.
- Existing authored source metadata and third-party attribution/license documents. These documents do not grant rights beyond their original terms.
- Historical world-expansion source workspace under archive/world-expansion-workspace; distinct research scripts under archive/research-scripts. These are historical alternatives and experiments, not the active implementation.
- Isolated possession/input candidate under archive/input-reentry and its patch in archive/checkpoint-tools; native test launcher/helpers retained separately, with a pause marker.
- Street-kit auto-import candidate and patches under repairs/street-kit-auto-import.

publication/source-inventory.json records original SHA256, published SHA256, origin, path, duplicate decisions and excluded-category totals. Originals were read only. Matching September baseline and native-slot source files are represented as hash-verified duplicates of the canonical source, not copied over it. Differing variants remain separate. Seven world-expansion source files remain archived, even where an older algorithm differs from the current implementation.

Discovery checked the existing project inventory and local project directories under the ChatGPT projects, Codex workspaces and kimi workspace. The configured desktop directory did not exist. This is a bounded local-source inventory, not a claim about disconnected disks, cloud-only files or inaccessible conversation history. Courtroom, EidolonAccord and Starforge projects are separate and excluded. The generically named existing Unknown-game GitHub repository contained a Reddit image-upload archive, not this source project, and was left untouched.

## Exclusions and public-copy transformations

This is a **code-only publication, not a runnable game distribution**. Excluded: Unreal Engine and installed packages; third-party/downloaded models and textures; generated city cell/house geometry and bulk datasets; .uasset/.umap/.blend exports; binaries, caches, build outputs, editor saves/settings, databases, logs, local history and screenshots. Existing generation/import scripts and source/attribution metadata remain. No custom Blueprint-named assets or custom plugin source tree were found in the inventoried project. Engine plugins referenced by the .uproject must be supplied by an appropriate Unreal installation.

Unrelated AGPilot application/install backups, machine power experiments and an unmodified upstream MakeHuman AGPL download-script reference are excluded from project-owned source. The custom CC0 asset-fetch script and the existing MakeHuman notices are retained. Existing CursorCore-derived Philadelphia performance code retains its MIT attribution; the separate CursorCore repository is not published here.

A machine-specific Android file-server SecurityToken was blanked in the two published engine configurations. Local user-account path prefixes in six files were generalized; the archived street-kit verifier now requires an explicit local project argument. README gained this publication context. The source inventory records transformed hashes. No original credentials, original files, original repository history or unrelated private repository contents were uploaded.

The existing SeemoreCodez MIT LICENSE and notices are preserved verbatim. The license applies to project-owned code as already documented; external data/assets retain their own terms. No new license was selected. Bulk assets must be restored or regenerated separately, with their terms reviewed before distribution. The retained native launch instructions assume a complete local asset tree and built module; opening this source-only clone does not reproduce that environment.

## Repair status

- Input re-entry: candidate resets vehicle input across possession changes. Preserved as an unapplied, native-runtime-unverified candidate; it is not the default source. Its earlier probe-build result does not validate the candidate fix.
- Street-kit auto-import: valid runtime JSON was mistakenly offered to Unreal's DataTable importer. Candidate excludes SourceData/*.json from that importer while retaining normal asset imports. October4 checks covered338 JSON paths,12 mesh references and12 source tests. Patches are retained, NOT applied to the main config. The saved-settings patch is for later offline reconciliation only; never apply it to a running user's editor. verify_static.py expects the original local assets, installed engine and captured settings hashes.
- Historical experiments and old Ollama/AGPilot scripts are retained as source history only; current project instructions prohibit new work through those tools.

## Publication validation and limits

On October9, with Node24.18 and the existing local Cesium dependency and planning-boundary dataset supplied read-only,147 source tests ran:146 passed; one could not open intentionally omitted public/data/district/streets.geojson. An initial dependency-free run passed27 checks and could not load19 Cesium-dependent files. A dependency-only follow-up stopped after17 passing checks on the omitted planning-boundary JSON; these environment/data failures were retained in the local receipt.

Nine PowerShell files parsed without errors. All152 JSON/project files present at that check parsed. All419 originally selected canonical files retained their original hashes in the source workspace. No engine, GPU, game, desktop-control or heavy native build was run for publication. The prior Python3.11 launcher was unavailable in this environment, so no new Python/runtime success is claimed.

Every staged text file was scanned for private keys, provider token formats, credential assignments, credential-bearing URLs and private local/history paths, followed by manual review of credential-related hits. One actual token was removed from both copies; remaining matching terms were variables, parser tokens, documentation or public metadata. No findings remained after sanitization. This is a scoped scan and review, not a universal security certification.

A fresh Git history is used, containing only the reviewed publication tree. No unknown historical commits are imported. Publication does not establish completed gameplay, continuous city coverage, visual quality, native performance, or release readiness.
