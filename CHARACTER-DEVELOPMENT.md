# Character development — deferred production brief

Status: research and future acceptance criteria, not implemented gameplay.
World development remains the current priority. Read this file when character
development resumes; creating this brief does not authorize a phase switch or an
engine migration. ACCEPTANCE.md remains the governing game target.

## Desired result

Believable people inhabiting approximately 1:1 Philadelphia: natural movement,
convincing faces and clothing, grounded feet, responsive controls, and physical
interaction with streets, vehicles, doors and other people. Study GTA as a visual
and behavioral reference while building original assets and behavior. Comparable
techniques are research candidates, not a promise of identical GTA graphics.

Frank asked about simulating the equipment or "harnesses" used in character
production. Whether he meant actor-worn capture equipment, digital character rigs,
or both has not been confirmed. Preserve both possibilities for the later phase.

## Verified starting point

At the September 12 review, the native evaluation uses Unreal Engine 5.7.
APhillyCharacter in Unreal/Philadelphia/Source/Philadelphia/PhillyGameplay.cpp
loads the existing human-motion skeletal mesh and Idle, Walk and Run sequences.
Tick selects a sequence by speed, calls PlayAnimation when it changes, and adjusts
playback rate. This is a basic animation implementation; it does not demonstrate
blended starts/stops, turn transitions, foot placement, motion matching or facial
performance. The browser game and original character assets must be preserved.
Recheck the actual implementation before acting on this baseline.

## Production methods to evaluate

1. Digital rig and deformation: editable skeleton, usable posing controls, joint
   limits and clean skin weights. Inspect shoulders, elbows, hands, hips and knees
   in motion. A skeleton that imports successfully is not a deformation pass.
2. Locomotion: responsive starts, stops, turns, walk/run transitions and appropriate
   stride length. Evaluate blended animation and motion matching against the same
   player-input route; avoid replacing working motion merely to install a tool.
3. Environmental contact: foot placement on slopes and curbs, hand contact with
   doors and steering wheels, and alignment when entering vehicles. Evaluate IK
   and animation alignment where they solve visible contact errors.
4. Physical reactions: blend authored motion with bounded physical responses for
   impacts, balance, falls and recovery. A collapsing ragdoll alone does not prove
   a convincing reactive character or replicate Rockstar's proprietary systems.
5. Appearance: skin, eyes, hair and clothing with appropriate surface response,
   silhouette and deformation. Review at gameplay distance in the actual city
   lighting; portrait renders do not establish gameplay quality.
6. Performance capture: assess existing licensed motion first. For original
   performances, investigate supported phone/webcam workflows and the cleanup
   required. Actor-worn capture equipment records performance; a digital rig
   controls the resulting character. These are different parts of production.
7. Population cost: reserve expensive animation and physical simulation for nearby
   relevant characters. Validate distance-based animation/simulation with visible
   crowds before claiming that the system supports a populated district.

## Primary research references

- [Epic Game Animation Sample](https://www.unrealengine.com/blog/game-animation-sample):
  published sample with over 500 animations and motion-matching examples. Evaluate
  a version compatible with the selected runtime and review the asset terms before
  integration. It is not currently established as integrated into this project.
- [Unreal 5.7 Control Rig](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-in-unreal-engine?application_version=5.7):
  in-engine rigging and animation controls.
- [MetaHuman capture-device requirements](https://dev.epicgames.com/documentation/metahuman/metahuman-animator-capture-device-requirements):
  supported capture workflows differ by device, engine version and processing mode.
- [MetaHuman mono-video animation](https://dev.epicgames.com/documentation/metahuman/metahuman-animation-from-mono-video-capture-in-unreal-engine):
  the reviewed documentation identifies full-character markerless capture as an
  experimental UE 5.8 feature. Do not assume it exists in our UE 5.7 evaluation or
  upgrade the engine just because this newer documentation exists.
- [Physically based materials, UE 5.7](https://dev.epicgames.com/documentation/en-us/unreal-engine/physically-based-materials-in-unreal-engine?application_version=5.7):
  measured surface response, roughness and material variation.
- [Rockstar's GTA VI Trailer 2](https://www.rockstargames.com/VI/trailer-2):
  public visual reference. Trailer imagery does not reveal a reproducible internal
  production pipeline or prove equivalent interactive performance in our game.

Recheck availability, compatibility, requirements and terms when this phase starts.
No paid capture equipment, new model download, footage upload or engine migration
has been selected by this brief. Do not assume a capture workflow can run well on
the integrated GPU without testing it.

## First character acceptance sequence

Use the existing Philadelphia district, normal player controls, and repeatable
camera/lighting conditions. Record the initial behavior before editing.

- Start from idle, walk, turn in both directions, stop, run and return to idle.
- Cross a curb and a slope with stable foot contact and no conspicuous sliding.
- Enter and exit a vehicle with coherent hand/body alignment and control transfer.
- Compare appearance and deformation from front, side and rear during movement.
- Measure actual 1920x1080 frame times during movement and streaming, including
  nearby NPCs. Report p95/p99, stutter and population counts, not just average FPS.

Promote only the behavior that passes its real-path check. Record remaining
defects; a collection of animation clips is not finished character gameplay.
Keep local Ollama work bounded and sized to the task; review and test any accepted
output. A timed-out review or an installed tool produces no accepted gameplay.

## World dependency and current user feedback

Frank confirmed that the Arch Street before/after is the direction he wanted,
while explicitly saying its detail is still insufficient. This is acceptance of
direction, not acceptance of final art. Maintain real scale, source-guided identity
and the physical street environment while improving surfaces and geometry.

- Before: artifacts/hardware/plugged-current-20260912-212715/player.png
- After: artifacts/hardware/plugged-current-20260912-224845/player.png

The after image is a native game capture. Its battery-powered visual-only run does
not establish the full 1080p/60 FPS gameplay target. Continue world development;
keep this brief ready for character development later.
