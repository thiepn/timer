import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock, TimerEngine, buildInterval, buildEmom, buildCountdown, buildPyramid } from '../src/core.js';

test('interval compilation omits final rest by default', () => {
  const plan = buildInterval({ workMs: 40000, restMs: 20000, rounds: 3, prepareMs: 0 });
  assert.equal(plan.steps.length, 5);
  assert.deepEqual(plan.steps.map((s) => s.phase), ['work','rest','work','rest','work']);
});

test('timer reconciles across long stalls without drift', () => {
  const clock = new FakeClock(1000, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildInterval({ workMs: 10000, restMs: 5000, rounds: 2, prepareMs: 0 }));
  clock.advance(22000);
  engine.reconcile();
  const view = engine.view();
  assert.equal(view.current.phase, 'work');
  assert.equal(Math.round(view.current.remainingMs), 3000);
});

test('pause consumes no workout time', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 40000 }));
  clock.advance(10000);
  engine.pause();
  const before = engine.view().current.remainingMs;
  clock.advance(600000);
  engine.resume();
  assert.equal(Math.round(engine.view().current.remainingMs), Math.round(before));
});

test('EMOM done early becomes rest until original deadline', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildEmom({ minutes: 2, blockMs: 60000, labels: ['A','B'] }));
  clock.advance(35000);
  engine.completeManual();
  let view = engine.view();
  assert.equal(view.current.phase, 'rest');
  assert.equal(Math.round(view.current.remainingMs), 25000);
  clock.advance(25000);
  engine.reconcile();
  view = engine.view();
  assert.equal(view.current.label, 'B');
  assert.equal(view.current.round.current, 2);
});

test('pyramid expands symmetrically', () => {
  const plan = buildPyramid({ startMs: 20000, peakMs: 50000, stepMs: 10000, restMs: 0 });
  assert.deepEqual(plan.steps.map((s) => s.durationMs), [20000,30000,40000,50000,40000,30000,20000]);
});
