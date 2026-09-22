import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLaunchCommand, launchURL, detectDeviceCapabilities, SessionOwnershipManager, MediaSessionManager } from '../src/device.js';

test('launch commands validate timer duration and entity IDs', () => {
  assert.deepEqual(parseLaunchCommand('https://x.test/?launch=timer&duration=180000'), { type: 'TIMER', durationMs: 180000 });
  assert.equal(parseLaunchCommand('https://x.test/?launch=timer&duration=-1').type, 'INVALID');
  assert.deepEqual(parseLaunchCommand('https://x.test/?launch=routine&id=abc'), { type: 'ROUTINE', id: 'abc' });
  assert.deepEqual(parseLaunchCommand('https://x.test/?launch=display'), { type: 'DISPLAY' });
});

test('launchURL emits stable query routes', () => {
  assert.equal(launchURL({ type: 'ACTIVE_SESSION' }, './'), './?launch=active');
  assert.equal(launchURL({ type: 'SESSION', id: 's1' }, './'), './?launch=session&id=s1');
});

test('capability detection is explicit about native-only features', () => {
  const scope = {
    navigator: { serviceWorker: {}, locks: { request() {} }, wakeLock: { request() {} }, mediaSession: { setActionHandler() {} }, storage: { persist() {} }, vibrate() {}, share() {} },
    Notification: function Notification() {}, ServiceWorkerRegistration: function ServiceWorkerRegistration() {}, BroadcastChannel: function BroadcastChannel() {}, launchQueue: {},
    document: { documentElement: { requestFullscreen() {} } }, matchMedia: () => ({ matches: true })
  };
  scope.ServiceWorkerRegistration.prototype.showNotification = () => {};
  const capabilities = detectDeviceCapabilities(scope);
  assert.equal(capabilities.installedPwa, true);
  assert.equal(capabilities.webLocks, true);
  assert.equal(capabilities.mediaSession, true);
  assert.equal(capabilities.homeWidget, false);
  assert.equal(capabilities.exactLocalAlarm, false);
});

test('lease fallback prevents two runtime owners and allows takeover after release', async () => {
  const map = new Map();
  const storage = { getItem: (k) => map.get(k) || null, setItem: (k,v) => map.set(k,v), removeItem: (k) => map.delete(k) };
  const a = new SessionOwnershipManager({ locks: null, storage, BroadcastChannelCtor: null, clientId: 'a', now: () => 1000 });
  const b = new SessionOwnershipManager({ locks: null, storage, BroadcastChannelCtor: null, clientId: 'b', now: () => 1000 });
  assert.equal(await a.acquire(), true);
  assert.equal(await b.acquire(), false);
  await a.release();
  assert.equal(await b.acquire(), true);
  await b.release();
});

test('media session manager registers and clears handlers safely', () => {
  const handlers = new Map();
  const mediaSession = { setActionHandler: (name, fn) => handlers.set(name, fn), metadata: null, playbackState: 'none' };
  class Metadata { constructor(value) { Object.assign(this, value); } }
  const manager = new MediaSessionManager({ mediaSession }, Metadata);
  let paused = 0;
  assert.equal(manager.enable({ pause: () => paused++ }), true);
  handlers.get('pause')();
  assert.equal(paused, 1);
  manager.update({ status: 'running', title: 'Circuit', current: { label: 'Push-ups', round: { current: 2, total: 4 } } });
  assert.equal(mediaSession.metadata.title, 'Push-ups');
  assert.equal(mediaSession.playbackState, 'playing');
  manager.disable();
  assert.equal(mediaSession.playbackState, 'none');
});
