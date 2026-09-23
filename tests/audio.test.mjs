import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_CUE_PROFILES, SOUND_PACKS, CueManager, cueProfileById, profileSettings, resolveCueConfig, soundRecipe, speechForStep } from '../src/audio.js';

test('built-in cue profiles are complete and resolvable', () => {
  for (const id of ['standard','quiet','voice-coach','loud-gym','silent']) {
    const profile = cueProfileById(id, []);
    assert.equal(profile.id, id);
    assert.ok(SOUND_PACKS[profile.soundPack]);
  }
});

test('routine cue profile overrides global profile while step overrides remain final', () => {
  const settings = { cueProfileId: 'standard', sound: true, voice: false, haptics: true, countdownCues: true, soundPack: 'clean', warningSeconds: 10, halfwayCue: false, voiceVerbosity: 'normal', voiceRate: 1.05, masterVolume: .8 };
  const resolved = resolveCueConfig(settings, [], { profileId: 'voice-coach', soundPack: 'retro' }, { transitionSound: 'off', voiceMode: 'custom', voiceText: 'Explode', warningSeconds: 5, halfway: 'off' });
  assert.equal(resolved.voice, true);
  assert.equal(resolved.soundPack, 'retro');
  assert.equal(resolved.transitionSound, 'off');
  assert.equal(resolved.voiceText, 'Explode');
  assert.equal(resolved.warningSeconds, 5);
  assert.equal(resolved.halfwayCue, false);
  assert.equal(resolved.masterVolume, .8);
});

test('custom cue profiles override built-in IDs through explicit lookup', () => {
  const custom = [{ id: 'mine', title: 'Mine', sound: true, voice: true, soundPack: 'calm', warningSeconds: 15 }];
  assert.equal(cueProfileById('mine', custom).title, 'Mine');
  assert.equal(profileSettings(cueProfileById('mine', custom)).soundPack, 'calm');
});

test('sound packs provide recipes for all important cue kinds', () => {
  for (const pack of Object.keys(SOUND_PACKS)) {
    for (const kind of ['work','rest','prepare','finish','countdown','warning','halfway']) assert.ok(soundRecipe(pack, kind).length > 0);
  }
});

test('speech verbosity is deterministic and step override can silence/customize it', () => {
  const step = { label: 'Push-ups', phase: 'work', durationMs: 40000, round: { current: 2, total: 5 } };
  assert.equal(speechForStep(step, { voiceVerbosity: 'minimal', voiceMode: 'inherit' }), 'Push-ups');
  assert.match(speechForStep(step, { voiceVerbosity: 'detailed', voiceMode: 'inherit' }, { label: 'Rest' }), /Round 2 of 5/);
  assert.match(speechForStep(step, { voiceVerbosity: 'detailed', voiceMode: 'inherit' }, { label: 'Rest' }), /Next, Rest/);
  assert.equal(speechForStep(step, { voiceVerbosity: 'normal', voiceMode: 'off' }), '');
  assert.equal(speechForStep(step, { voiceVerbosity: 'normal', voiceMode: 'custom', voiceText: 'Go now' }), 'Go now');
});

test('screen reader optimization suppresses app speech even when routine profile enables voice', () => {
  const config = resolveCueConfig({ cueProfileId: 'voice', voice: true, screenReaderOptimized: true }, [], { voice: true }, {});
  assert.equal(config.voice, false);
});


test('custom audio decode cache is bounded with LRU eviction', async () => {
  const source = () => ({ connect() { return this; }, addEventListener() {}, start() {}, stop() {} });
  const manager = new CueManager(() => ({ sound: true }), () => [], async (id) => ({ id, data: new Uint8Array([1,2,3]).buffer }));
  manager.ctx = {
    state: 'running', destination: {},
    decodeAudioData: async () => ({}),
    createBufferSource: source,
    createGain: () => ({ gain: { value: 1 }, connect() { return this; } })
  };
  manager.init = async () => true;
  const config = { sound: true, masterVolume: 1, profileGain: 1 };
  for (let i = 0; i < 6; i++) await manager.customSound(`sound-${i}`, config);
  assert.equal(manager.customBufferCache.size, 4);
  assert.equal(manager.customBufferCache.has('sound-0'), false);
  assert.equal(manager.customBufferCache.has('sound-5'), true);
});

test('cue generations are isolated per timer runtime', () => {
  const cue = new CueManager(() => ({ sound: false, voice: false, haptics: false }));
  cue.beginSession({}, 'timer-a');
  cue.beginSession({}, 'timer-b');
  const a = cue.generationFor('timer-a');
  const b = cue.generationFor('timer-b');
  cue.onEvent({ type: 'step-restarted' }, { plan: { kind: 'open' }, meta: {} }, 'timer-a');
  assert.equal(cue.generationFor('timer-a'), a + 1);
  assert.equal(cue.generationFor('timer-b'), b);
});

test('tick de-duplication namespaces identical step ids by timer runtime', () => {
  const cue = new CueManager(() => ({ sound: false, voice: false, haptics: false, countdownCues: true }));
  cue.beginSession({}, 'a');
  cue.beginSession({}, 'b');
  const view = { status: 'running', current: { id: 'same-step', remainingMs: 2500 } };
  cue.tick(view, { plan: { kind: 'open' }, meta: {} }, 'a');
  cue.tick(view, { plan: { kind: 'open' }, meta: {} }, 'b');
  assert.ok(cue.delivered.has('a:same-step:countdown-3'));
  assert.ok(cue.delivered.has('b:same-step:countdown-3'));
});
