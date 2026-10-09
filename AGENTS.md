# Codex Project Policy

This repository uses the SeemoreCodez default licensing and commercialization posture.

## Licensing

- Keep the public code under the MIT License.
- Keep `LICENSE` as standard MIT text with `Copyright (c) 2026 SeemoreCodez`.
- Do not add custom commercial, contributor, trademark, equity, revenue-share, or sale-proceeds clauses to `LICENSE`.
- Put custom contributor and commercial terms in separate policy files.

## Founder Authority

- SeemoreCodez is the copyright holder and founder steward.
- Frank/SeemoreCodez retains final authority over official releases, roadmap, package publishing, security posture, institutional relationships, paid offerings, domains, marks, and official channels.
- Maintainer permissions are delegated, limited, and revocable.

## Open-Core Commercial Model

- The public core remains MIT open source.
- Paid support, institutional onboarding, private campus packs, hosted/private hubs, custom adapters, training, SLAs, procurement support, and security review assistance may be commercial.
- Do not imply that open-source contribution grants ownership or commercial rights.

## Contributor Terms

- Contributions are accepted under the same MIT terms as the project unless a separate written agreement says otherwise.
- Contributors must have the right to submit their contributions.
- Accepted contributions do not create employment, partnership, ownership, equity, compensation, governance, revenue-share, or sale-proceeds rights.
- The top-contributor upside program lives only in `CONTRIBUTOR_UPSIDE_PROGRAM.md` and requires a separate signed agreement before any rights exist.

## Codex Instructions

When creating or modifying repository policy files, preserve this structure:

- `LICENSE`
- `NOTICE.md`
- `CONTRIBUTOR_TERMS.md`
- `CONTRIBUTOR_UPSIDE_PROGRAM.md`
- `GOVERNANCE.md`
- `TRADEMARK_POLICY.md`
- `AUTHORS.md`
- `README-LICENSING.md`
- `.codex/PROJECT_POLICY.md`

When in doubt, keep the license boring and the governance explicit.

## Philadelphia acceptance target

Preserve Frank's request for real 3D Philadelphia and actual driving using free public data with no API key. His keyless-source correction supersedes the original Google request. Follow ACCEPTANCE.md. Do not substitute a generated city, flat-map-only environment, screenshot, or mock tiles. Builds, isolated car diagnostics and numerical tests are enabling work until the real city and driving path are visually and behaviorally validated. Use acceptance-target-guardian for these checks.

## Delivery discipline: September 12 correction

The existing acceptance rules did not prevent too much infrastructure work without a convincing playable district. Enforce them through the following work and evidence boundaries, not additional planning systems:

- Begin each implementation session with one concrete player-visible outcome, the exact district location or behavior it changes, and the in-game check that will establish it. Read the prior unfinished outcome before choosing another. User steering takes precedence.
- Keep the current outcome in focus until it is demonstrated or a specific dependency prevents progress. Tooling, benchmarks and research must resolve a named obstacle to that outcome; do not open unrelated workstreams because they are easier to measure.
- After two unsuccessful attempts at the same obstacle, summarize the failure evidence and change approach. Do not repeat an unchanged experiment or create more diagnostics without explaining what new uncertainty they resolve. Continue independent authorized work without requiring Frank to manage routine decisions.
- For visual changes, preserve a before view and inspect the after view at the same player camera in the actual game. An isolated asset gallery is supplementary. For mechanics, exercise the actual input and gameplay path. Do not substitute screenshots for functional checks.
- End each session with the demonstrated change, evidence location, failures or limitations, and the next unfinished outcome. If no player-visible or playable improvement was delivered, say that directly and identify the work as enabling work.
- Judge progress by the playable result, never lines of code, file counts, elapsed time, model activity or tests alone. Local Ollama assignments must have bounded deliverables; report accepted output and rejected output honestly, without invented quota savings.
- Preserve the joint visual and 1080p/60 FPS target. The September 12 plugged-in result of about 83 FPS applies only to the tested unfinished stationary street view; it does not accept the district, traffic, driving or final art.
- Current user-directed outcome: expand real Philadelphia world coverage at approximately 1:1 scale, including recognizable monuments, landmarks and bridges; ordinary houses may be individualized interpretations guided by neighborhood photographs. The latest citywide-expansion request supersedes the earlier instruction to finish source 2740 or the representative district before extending coverage. Retain the Arch Street improvement and its unfinished-detail record; do not call broad coverage final-quality art or gameplay.
- September 13 explicit user decision: production development targets Unreal only. The browser/Cesium project is retained as source/reference work, not the game deliverable. Bring reusable city data and assets into Unreal and demonstrate changes in the native game. This supersedes the former prohibition on committing to the Unreal runtime. Citywide expansion is authorized; the representative district remains the quality and gameplay benchmark in ACCEPTANCE.md.
- Frank accepted the Arch Street before/after as the right direction, explicitly not the final detail level. Keep world development first. Read CHARACTER-DEVELOPMENT.md when character work resumes; that deferred brief is not implemented gameplay or permission to switch the current focus.


## Latest user direction: Blender and neighborhood identity

Do not use Ollama or AGPilot for new project assignments. Use editable Blender
assets and native Unreal validation. Ordinary buildings retain real layout and
approximate dimensions but need neighborhood identity, not exact facades. Landmarks
and historically significant structures require individual recognizable treatment.
This supersedes earlier per-house reconstruction and agent-usage requirements.
