# Local Ollama review agent

September 12 native evaluation update: the local model now completed one bounded
read/edit/test task through `scripts/ollama-geo-agent.py`. Its reviewed coordinate
adapter is used by the Unreal source exporter. The initial attempt failed; a
directed repair passed the independent tests. See NATIVE-EVALUATION.md and raw
`artifacts/local-agent/unreal-geo` evidence. This does not supersede the limitations
of the earlier text-only helpers described below.

Frank authorized using the installed local model to help with the Philadelphia game. The helper at `scripts/local-city-review.mjs` sends selected project code only to `http://127.0.0.1:11434/api/chat`. It requires the already-installed `qwen3-coder:30b`, never pulls a model, runs CPU inference (`num_gpu: 0`), and requests unloading afterward (`keep_alive: 0`). Its text cannot run tools or change files. A root review decides which suggestions are supported by code and evidence.

Usage, with Ollama running:

```powershell
node scripts/local-city-review.mjs src/city-photo-recovery.js
```

Requests, source snapshots, model digest, raw responses and review text are recorded under `artifacts/local-agent/`. Keep assignments small: combined source input is limited to 12 KB. No external model endpoint is used by this helper. Codex orchestration and verification still use Codex; this does not make the whole task quota-free or establish measured quota savings.

## September 11 review

The first combined converter/runtime review exceeded Node's response-header timeout and produced no returned review. The narrower streaming runtime review returned in 217.126 seconds, with 1,496 prompt tokens and 650 generated tokens. It reached the output limit and is an incomplete review, not certification. Ollama's live process report showed `size_vram: 0`, confirming this run used CPU inference.

The returned claims about listener order, duplicate destruction and Y-up/ENU mismatch were rejected: listeners are registered before collection insertion; destruction is guarded before and after collection removal; actual Cesium axis conversion and the Blender comparison validate the axis settings. The proposed restore condition largely repeats the existing guard. The last point about per-frame hiding is unfinished and is not an accepted defect; the live before/after check shows the replacement is rendered.

The lifetime concerns prompted a further inspection of retained feature references. That inspection found an actual cleanup gap: old feature/content objects remained in the recovery owner's map after a tile unloaded. A `tileUnload` handler now releases those references, with a regression that verifies old features are not touched and newly loaded content is matched again. This is the verified follow-up change; it is not a blanket endorsement of the local model's review.

Installed model digest: `06c1097efce0431c2045fe7b2e5108366e43bee1b4603a7aded8f21689e90bca`.
## September 12 implementation assignments

The installed qwen3-coder:30b completed three CPU coding calls: house-profile draft (492 output tokens, 77.7s), requested repair (743 tokens, 97.351s), and park polygon gate (683 tokens, 71.437s). No model download or external inference was used. Candidates and raw results remain under artifacts/local-agent. Reviewed and corrected code is integrated in src/house-profile.js and src/park-boundary.js; deterministic variation, invalid inputs, polygon holes, separate islands, and placement restrictions have execution checks. The initial profile candidate was rejected, and remaining defects in the later outputs were repaired before integration. This is actual implementation assistance, not a claim that local model output needs no review or that Codex quota usage is zero.
