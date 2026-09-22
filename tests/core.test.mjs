import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock, TimerEngine, buildInterval, buildEmom, buildCountdown, buildPyramid, buildBoxing, buildCustomRoutine, validateCustomRoutine, estimatePlanDuration } from '../src/core.js';

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


test('boxing omits final rest unless explicitly enabled', () => {
  const noFinal = buildBoxing({ rounds: 3, roundMs: 180000, restMs: 60000, prepareMs: 0, finalRest: false });
  assert.deepEqual(noFinal.steps.map((s) => s.phase), ['work','rest','work','rest','work']);

  const withFinal = buildBoxing({ rounds: 3, roundMs: 180000, restMs: 60000, prepareMs: 0, finalRest: true });
  assert.deepEqual(withFinal.steps.map((s) => s.phase), ['work','rest','work','rest','work','rest']);
});

test('ending while paused does not count paused wall time as active time', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 60000 }));
  clock.advance(10000);
  engine.pause();
  clock.advance(300000);
  engine.finish('user-ended');
  assert.equal(engine.elapsedMs(), 10000);
  assert.equal(engine.snapshot().pausedTotalMs, 300000);
  assert.equal(engine.snapshot().phaseTotals.work, 10000);
});

test('phase totals track actual time after adjustment and early finish', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 40000 }));
  clock.advance(10000);
  engine.adjust(20000);
  clock.advance(5000);
  engine.finish('user-ended');
  assert.equal(engine.snapshot().phaseTotals.work, 15000);
  assert.equal(engine.elapsedMs(), 15000);
});

test('EMOM phase totals split work and rest after early completion', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildEmom({ minutes: 1, blockMs: 60000, labels: ['Work'] }));
  clock.advance(35000);
  engine.completeManual();
  clock.advance(25000);
  engine.reconcile();
  const totals = engine.snapshot().phaseTotals;
  assert.equal(totals.work, 35000);
  assert.equal(totals.rest, 25000);
});


test('custom routine expands nested sections and repeats with source metadata', () => {
  const plan = buildCustomRoutine({
    title: 'Nested',
    nodes: [
      { id: 'warm', type: 'timed', label: 'Warm-up', phase: 'prepare', durationMs: 10000 },
      { id: 'main', type: 'section', label: 'Main', children: [
        { id: 'rounds', type: 'repeat', count: 2, children: [
          { id: 'work', type: 'timed', label: 'Push-ups', phase: 'work', durationMs: 40000 },
          { id: 'rest', type: 'timed', label: 'Rest', phase: 'rest', durationMs: 20000 }
        ]}
      ]}
    ]
  });
  assert.deepEqual(plan.steps.map((s) => s.label), ['Warm-up','Push-ups','Rest','Push-ups','Rest']);
  assert.equal(plan.steps[1].sourceNodeId, 'work');
  assert.deepEqual(plan.steps[1].sectionPath.map((s) => s.label), ['Main']);
  assert.deepEqual(plan.steps[1].repeatPath.map((r) => [r.current, r.total]), [[1,2]]);
  assert.equal(plan.steps[3].round.current, 2);
  assert.notEqual(plan.steps[1].id, plan.steps[3].id);
});

test('custom routine with uncapped manual step has variable estimated duration', () => {
  const plan = buildCustomRoutine({
    title: 'Manual',
    nodes: [
      { id: 'manual', type: 'manual', label: 'Pull-ups', phase: 'work' },
      { id: 'rest', type: 'timed', label: 'Rest', phase: 'rest', durationMs: 120000 }
    ]
  });
  assert.equal(estimatePlanDuration(plan), undefined);
  assert.equal(plan.steps[0].manual, true);
});

test('custom routine validation catches empty containers and duplicate IDs', () => {
  const issues = validateCustomRoutine({
    title: 'Broken',
    nodes: [
      { id: 'same', type: 'repeat', count: 2, children: [] },
      { id: 'same', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }
    ]
  });
  assert.ok(issues.some((x) => x.code === 'EMPTY_REPEAT'));
  assert.ok(issues.some((x) => x.code === 'DUPLICATE_ID'));
});

test('custom routine expansion is deterministic for persisted source IDs', () => {
  const config = {
    title: 'Deterministic',
    nodes: [{ id: 'r', type: 'repeat', count: 2, children: [{ id: 'w', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }] }]
  };
  const a = buildCustomRoutine(config);
  const b = buildCustomRoutine(config);
  assert.deepEqual(a.steps.map((x) => x.id), b.steps.map((x) => x.id));
});
