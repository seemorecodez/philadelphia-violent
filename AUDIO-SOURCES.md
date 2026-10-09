# Recorded footsteps

`src/game-audio.js` is an opt-in controller for four real footstep recordings.
It contains no generated tone, engine loop, music, speech, or traffic audio.
The source and license are verified; listening quality is **unverified** because
the current tool session cannot ingest audio. This does not establish AAA sound
quality, accurate footwear/surface acoustics, or precise foot-contact sync.

## Source and conversion

- **Footsteps**, by **GboxMikeFozzy**, published April 14, 2022.
- Source: https://opengameart.org/content/footsteps-0
- License: CC0 1.0, https://creativecommons.org/publicdomain/zero/1.0/
- The author describes recording their own footsteps while walking through a
  subway and applying normalization/noise reduction. The exact footwear and
  floor material are not specified.
- Downloaded source files: `01-footstep_0.ogg`, `02-footstep.ogg`,
  `03-footstep.ogg`, `04-footstep.ogg`.
- Runtime files: `public/audio/footsteps/01-footstep.wav` through
  `04-footstep.wav`, decoded to mono 44.1 kHz 16-bit PCM using ffmpeg. No pitch
  shift, synthesis, added effects, or gain processing was applied.
- Runtime PCM data totals 86,076 bytes. Original recordings and temporary
  audition conversions are retained in `assets/audio-review/`.
- Exact source URLs, input/output SHA-256 values, durations and measured levels
  are in `public/audio/footsteps/source.json`.

## Integration contract

```js
import { createGameAudio } from './game-audio.js';

const audio = createGameAudio({
  onStatus: ({ status, muted }) => { /* update the explicit sound control */ },
});
// This must be called directly from a user click/key handler:
const enabled = await audio.enable();
// Each game update, after collision resolution:
audio.update({ mode, speed, distance, paused });
audio.setMuted(true); // Stop playing immediately; false restores the opt-in choice.
audio.destroy(); // Release sources, buffers, context and visibility listener.
```

`mode` is `driving`, `walking`, or `interior`. Other modes stay silent. `speed`
is actual velocity in metres per second; `distance` is actual cumulative travel
in metres. Prefer supplying distance so collision-stopped movement never emits
a step. When distance is absent the controller integrates speed with a 100 ms
elapsed-time cap. `vehicleId` and `input` are not needed by this footsteps-only
implementation.

The controller starts silent and does not instantiate an AudioContext or fetch
files before `enable()`. It stops voices immediately when paused, muted, hidden,
stationary, entering a car, or destroyed. It drops teleport/counter-reset
distance and never emits an accumulated burst after suspension. Walk/run cadence
uses half of the currently authored character stride lengths (0.47042 m and
1.25187 m); recorded pitch is unchanged. Exact bone-contact timing and surface
switching remain future work.

Statuses are `disabled`, `loading`, `ready`, `gesture-required`, `unavailable`,
and `destroyed`. Missing/undecodable recordings stay silent and report
`unavailable`; there is no synthesized fallback. Audio is opt-in, so the UI
must keep a clear mute control and must not label engine sound as available.

## Checkpoint evidence and remaining review

`node --test --test-isolation=none tests/game-audio.test.js`: **5 passed**.
They exercise opt-in loading, distance/collision cadence, sprint cadence,
pause/mute/visibility, teleport/mode resets, destruction during pending fetch,
and explicit failure with no substitute audio. The sandbox denied Node's default
test child-process spawn; running the same tests without process isolation passed.

PCM inspection confirms all four files decode, contain nonzero samples, and have
no full-scale clipping. These checks do not prove they sound appropriate. They
still need listening in the real game, including walking, sprinting, collision,
pause/resume, mute, tab hiding and entering a vehicle. Vehicle-specific engine,
gear changes, tires, indoor surface variation, outdoor ambience and NPC voices
remain absent.

## Engine candidate kept outside runtime

`assets/audio-review/enginehum3.ogg` is **Engine Sound** by **kurt**,
https://opengameart.org/content/engine-sound, CC BY 3.0,
https://creativecommons.org/licenses/by/3.0/. The author describes a recording
made while driving. The original OGG and a six-second mono WAV audition excerpt
are retained only as research candidates. The recording is generic ambience;
its vehicle, engine speed and load are not identified. It is not loaded by the
game, and no claim is made that it reproduces either current car.
