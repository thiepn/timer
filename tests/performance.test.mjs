import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { buildCustomRoutine, TimerEngine, FakeClock, buildInterval } from '../src/core.js';
import { summarizeRange } from '../src/analytics.js';
import { TimerDB } from '../src/db.js';
import { PERFORMANCE_BUDGETS, liveSchedulerPolicy, reduceMotionEnabled, MaintenanceCoordinator } from '../src/performance.js';

test('live scheduler stops while hidden or paused and throttles battery-heavy modes', () => {
  assert.equal(liveSchedulerPolicy({ visible: false, status: 'running', progressKnown: true }).kind, 'idle');
  assert.equal(liveSchedulerPolicy({ visible: true, status: 'paused', progressKnown: true }).kind, 'idle');
  assert.deepEqual(liveSchedulerPolicy({ visible: true, status: 'running', mode: 'stopwatch', progressKnown: true }), { kind: 'timeout', intervalMs: 100, minFrameMs: 0 });
  assert.equal(liveSchedulerPolicy({ visible: true, status: 'running', layout: 'wall', progressKnown: true }).intervalMs, 250);
  assert.equal(liveSchedulerPolicy({ visible: true, status: 'running', layout: 'focus', progressKnown: true, reducedMotion: false }).kind, 'animation');
});

test('reduce-motion policy honors explicit override before system preference', () => {
  const yes = () => ({ matches: true });
  const no = () => ({ matches: false });
  assert.equal(reduceMotionEnabled('on', no), true);
  assert.equal(reduceMotionEnabled('off', yes), false);
  assert.equal(reduceMotionEnabled('system', yes), true);
});

test('maintenance work waits while critical activity is suspended', async () => {
  const scheduled = [];
  const coordinator = new MaintenanceCoordinator({
    requestIdle: null,
    schedule(fn) { scheduled.push(fn); return scheduled.length; },
    cancel() {}
  });
  let ran = 0;
  coordinator.suspend('active-session');
  coordinator.enqueue('heavy', async () => { ran += 1; });
  assert.equal(scheduled.length, 0);
  coordinator.resume('active-session');
  assert.equal(scheduled.length, 1);
  await scheduled.shift()();
  assert.equal(ran, 1);
});

test('1000-step custom compilation stays inside release budget', () => {
  const start = performance.now();
  const plan = buildCustomRoutine({
    title: '1000-step benchmark',
    nodes: [{ id: 'repeat', type: 'repeat', count: 1000, children: [
      { id: 'work', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }
    ] }]
  });
  const elapsed = performance.now() - start;
  assert.equal(plan.steps.length, 1000);
  assert.ok(elapsed < PERFORMANCE_BUDGETS.compile1000StepsMs, `compile took ${elapsed.toFixed(1)}ms`);
});

test('10000-session summary stays inside release budget', () => {
  const base = Date.now();
  const sessions = Array.from({ length: 10000 }, (_, index) => ({
    id: `s-${index}`, title: 'Benchmark', mode: 'interval', startedAt: base - index * 60000,
    activeDurationMs: 60000, workMs: 40000, restMs: 20000, pausedMs: 0, completionReason: 'finished'
  }));
  const start = performance.now();
  const result = summarizeRange(sessions);
  const elapsed = performance.now() - start;
  assert.equal(result.sessions, 10000);
  assert.ok(elapsed < PERFORMANCE_BUDGETS.analytics10000SessionsMs, `analytics took ${elapsed.toFixed(1)}ms`);
});

test('recent-session query from a 10000-record memory fixture is bounded', async () => {
  const db = new TimerDB();
  await db.open();
  const base = Date.now();
  for (let index = 0; index < 10000; index++) {
    db.memory.sessions.set(`s-${index}`, { id: `s-${index}`, startedAt: base - index, title: 'Bench' });
  }
  const start = performance.now();
  const recent = await db.recentSessions(100);
  const elapsed = performance.now() - start;
  assert.equal(recent.length, 100);
  assert.ok(recent[0].startedAt >= recent.at(-1).startedAt);
  assert.ok(elapsed < PERFORMANCE_BUDGETS.recentSessionsQueryMs, `recent-session query took ${elapsed.toFixed(1)}ms`);
});

test('large deadline reconciliation remains timestamp-driven instead of tick-driven', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildInterval({ workMs: 1000, restMs: 1000, rounds: 10000, prepareMs: 0 }));
  const start = performance.now();
  clock.advance(19_998_500);
  engine.reconcile();
  const elapsed = performance.now() - start;
  const view = engine.view();
  assert.equal(view.current.phase, 'work');
  assert.ok(view.current.remainingMs <= 500);
  assert.ok(elapsed < 1000, `reconciliation took ${elapsed.toFixed(1)}ms`);
});

test('custom sound metadata excludes binary audio data', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveCustomSound({ id: 'sound-1', title: 'Large', mimeType: 'audio/wav', size: 4, durationMs: 100, data: new Uint8Array([1,2,3,4]).buffer });
  const rows = await db.listCustomSoundMetadata();
  assert.equal(rows.length, 1);
  assert.equal('data' in rows[0], false);
});

test('24-hour countdown remains exact under a single large clock jump', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start({ kind: 'timeline', title: '24h', steps: [{ id: 'day', label: 'Day', phase: 'work', durationMs: 24 * 3600000, manual: false }] });
  clock.advance(24 * 3600000 - 500);
  engine.reconcile();
  assert.equal(Math.round(engine.view().current.remainingMs), 500);
  clock.advance(500);
  engine.reconcile();
  assert.equal(engine.view().status, 'completed');
});
