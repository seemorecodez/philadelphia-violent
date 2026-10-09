import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio, FOOTSTEP_AUDIO } from '../src/game-audio.js';

function setup(overrides = {}) {
  const events = new Map(), voices = [], gains = [], fetches = [];
  let contexts = 0, clock = 0;
  const document = {
    hidden: false,
    addEventListener: (name, fn) => events.set(name, fn),
    removeEventListener: (name) => events.delete(name),
  };
  const context = {
    state: 'suspended', destination: {}, closed: false,
    resume() { this.state = 'running'; return Promise.resolve(); },
    close() { this.closed = true; this.state = 'closed'; return Promise.resolve(); },
    createGain() {
      const node = { gain: { value: 0 }, connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(node); return node;
    },
    decodeAudioData: async (value) => value,
    createBufferSource() {
      const voice = { connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; }, stop() { this.stopped = true; } };
      voices.push(voice); return voice;
    },
  };
  const audio = createGameAudio({ document, now: () => clock,
    createContext: () => { contexts++; return context; },
    fetchAsset: async (url) => { fetches.push(url); return { ok: true, arrayBuffer: async () => new ArrayBuffer(2) }; },
    ...overrides,
  });
  const walk = (distance, more = {}) => { clock += 50; audio.update({ mode: 'walking', speed: 1.65, distance, ...more }); };
  return { audio, context, document, events, voices, gains, fetches, walk, contexts: () => contexts };
}

test('audio stays opt-in, then fetches only local licensed recordings and follows distance', async () => {
  const h = setup();
  h.walk(0); h.walk(0.7);
  assert.equal(h.contexts(), 0);
  assert.equal(h.fetches.length, 0);
  assert.equal(await h.audio.enable(), true);
  assert.deepEqual(h.fetches, FOOTSTEP_AUDIO);
  h.walk(0); h.walk(.46); assert.equal(h.voices.length, 0);
  h.walk(.48); assert.equal(h.voices.length, 1);
  assert.equal(h.voices[0].started, true);
  h.walk(.48); assert.equal(h.voices.length, 1, 'holding against a collision adds no sound');
  h.audio.destroy();
});

test('pausing, muting and hiding immediately stop voices and clear accumulated steps', async () => {
  const h = setup(); await h.audio.enable();
  h.walk(0); h.walk(.5);
  h.audio.setMuted(true);
  assert.equal(h.voices[0].stopped, true);
  assert.equal(h.gains[1].disconnected, true);
  h.walk(1); assert.equal(h.voices.length, 1);
  h.audio.setMuted(false); h.walk(1); h.walk(1.5);
  assert.equal(h.voices.length, 2);
  h.walk(1.6, { paused: true }); assert.equal(h.voices[1].stopped, true);
  h.walk(2); h.walk(2.5);
  h.document.hidden = true; h.events.get('visibilitychange')();
  assert.equal(h.voices[2].stopped, true);
  h.walk(3); assert.equal(h.voices.length, 3);
  h.document.hidden = false; h.walk(500); assert.equal(h.voices.length, 3);
  h.audio.destroy();
});

test('sprint uses its measured stride, mode switches and teleports do not create catch-up sounds', async () => {
  const h = setup(); await h.audio.enable();
  h.walk(0, { speed: 4.5 }); h.walk(1, { speed: 4.5 });
  assert.equal(h.voices.length, 0);
  h.walk(1.3, { speed: 4.5 }); assert.equal(h.voices.length, 1);
  h.walk(80); assert.equal(h.voices.length, 1);
  h.walk(81, { mode: 'driving' }); assert.equal(h.voices[0].stopped, true);
  h.walk(82, { mode: 'interior' }); assert.equal(h.voices.length, 1);
  h.walk(82.5, { mode: 'interior' }); assert.equal(h.voices.length, 2);
  h.audio.destroy();
});

test('destroying while assets load prevents activation and unregisters visibility listener', async () => {
  let finish;
  const wait = new Promise(resolve => { finish = resolve; });
  const h = setup({ fetchAsset: () => wait });
  const pending = h.audio.enable();
  h.audio.destroy();
  finish({ ok: true, arrayBuffer: async () => new ArrayBuffer(2) });
  assert.equal(await pending, false);
  assert.equal(h.context.closed, true);
  assert.equal(h.events.size, 0);
  assert.equal(h.audio.getStatus().status, 'destroyed');
  assert.equal(await h.audio.enable(), false);
});

test('unavailable recordings fail explicitly and never generate a fallback sound', async () => {
  const h = setup({ fetchAsset: async () => ({ ok: false, status: 404 }) });
  assert.equal(await h.audio.enable(), false);
  assert.equal(h.audio.getStatus().status, 'unavailable');
  h.walk(0); h.walk(1);
  assert.equal(h.voices.length, 0);
  h.audio.destroy();
});
