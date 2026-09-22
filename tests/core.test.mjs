import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock, TimerEngine, buildInterval, buildEmom, buildCountdown, buildPyramid, buildBoxing, buildStopwatch, buildCustomRoutine, validateCustomRoutine, estimatePlanDuration, evaluateFormula, validateFormula, createSeededRandom, collectCustomParameterRefs, formulaVariableName } from '../src/core.js';

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

test('custom routine resolves duration and repeat parameters at launch', () => {
  const parameters = [
    { id: 'work', type: 'duration', label: 'Work', defaultMs: 40000, minMs: 10000, maxMs: 120000 },
    { id: 'rounds', type: 'number', label: 'Rounds', defaultValue: 3, min: 1, max: 10, integer: true }
  ];
  const plan = buildCustomRoutine({
    title: 'Parameterized',
    parameters,
    parameterValues: { work: 55000, rounds: 2 },
    nodes: [{ id: 'repeat', type: 'repeat', countParamId: 'rounds', count: 3, children: [
      { id: 'work-step', type: 'timed', label: 'Work', phase: 'work', durationParamId: 'work', durationMs: 40000 }
    ] }]
  });
  assert.deepEqual(plan.steps.map((item) => item.durationMs), [55000, 55000]);
  assert.deepEqual(plan.steps.map((item) => item.round.current), [1, 2]);
  assert.equal(plan.meta.parameterValues.work, 55000);
  assert.equal(plan.meta.parameterValues.rounds, 2);
});

test('custom parameter values enforce configured bounds', () => {
  assert.throws(() => buildCustomRoutine({
    title: 'Bounded',
    parameters: [{ id: 'rounds', type: 'number', label: 'Rounds', defaultValue: 3, min: 1, max: 5, integer: true }],
    parameterValues: { rounds: 8 },
    nodes: [{ id: 'repeat', type: 'repeat', countParamId: 'rounds', count: 3, children: [
      { id: 'work', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }
    ] }]
  }), /at most 5/);
});

test('linked reusable blocks expand with local parameter overrides', () => {
  const blocks = [{
    id: 'block-a', title: 'Work Block', revision: 4,
    parameters: [{ id: 'duration', type: 'duration', label: 'Duration', defaultMs: 30000, minMs: 1000, maxMs: 120000 }],
    nodes: [{ id: 'block-work', type: 'timed', label: 'Block Work', phase: 'work', durationParamId: 'duration', durationMs: 30000 }]
  }];
  const plan = buildCustomRoutine({
    title: 'Blocks', blocks,
    nodes: [
      { id: 'ref-one', type: 'block', blockId: 'block-a', parameterValues: { duration: 45000 } },
      { id: 'ref-two', type: 'block', blockId: 'block-a', parameterValues: { duration: 60000 } }
    ]
  });
  assert.deepEqual(plan.steps.map((item) => item.durationMs), [45000, 60000]);
  assert.notEqual(plan.steps[0].id, plan.steps[1].id);
  assert.equal(plan.steps[0].blockPath[0].revision, 4);
  assert.equal(plan.meta.blockRevisions['block-a'], 4);
});

test('circular reusable blocks are rejected', () => {
  const blocks = [
    { id: 'a', title: 'A', revision: 1, nodes: [{ id: 'a-ref', type: 'block', blockId: 'b' }] },
    { id: 'b', title: 'B', revision: 1, nodes: [{ id: 'b-ref', type: 'block', blockId: 'a' }] }
  ];
  assert.throws(() => buildCustomRoutine({
    title: 'Cycle', blocks,
    nodes: [{ id: 'root-ref', type: 'block', blockId: 'a' }]
  }), /Circular reusable block reference/);
});


test('formula engine evaluates safe arithmetic and rejects unknown capabilities', () => {
  assert.equal(evaluateFormula('clamp(base + (round - 1) * 5, 10, 60)', { base: 30, round: 4 }), 45);
  assert.equal(evaluateFormula('max(10, 30 - 5 * 6)', {}), 10);
  assert.equal(validateFormula('window.alert(1)', []).ok, false);
  assert.throws(() => evaluateFormula('constructor()', {}), /Unsupported formula function/);
  assert.throws(() => evaluateFormula('1 / 0', {}), /Division by zero/);
});

test('custom formulas can use launch parameters and repeat context', () => {
  const parameters = [
    { id: 'p-work', type: 'duration', label: 'Work time', variable: 'workTime', defaultMs: 40000, minMs: 1000, maxMs: 120000 },
    { id: 'p-rounds', type: 'number', label: 'Set count', variable: 'setCount', defaultValue: 3, min: 1, max: 10, integer: true }
  ];
  const plan = buildCustomRoutine({
    title: 'Formula routine', parameters,
    parameterValues: { 'p-work': 40000, 'p-rounds': 3 },
    nodes: [{ id: 'repeat', type: 'repeat', count: 1, countFormula: 'setCount', children: [
      { id: 'work', type: 'timed', label: 'Work', phase: 'work', durationMs: 30000, durationFormula: 'workTime + (round - 1) * 5' }
    ] }]
  });
  assert.deepEqual(plan.steps.map((item) => item.durationMs), [40000, 45000, 50000]);
});

test('progression generator expands formula-driven work and rest', () => {
  const plan = buildCustomRoutine({
    title: 'Progressive',
    nodes: [{
      id: 'prog', type: 'progression', count: 3,
      workLabel: 'Push', workBaseMs: 30000, workFormula: 'base + (round - 1) * 5',
      restLabel: 'Rest', restBaseMs: 20000, restFormula: 'max(10, base - (round - 1) * 5)', finalRest: false
    }]
  });
  assert.deepEqual(plan.steps.map((item) => [item.phase, item.durationMs]), [
    ['work', 30000], ['rest', 20000], ['work', 35000], ['rest', 15000], ['work', 40000]
  ]);
  assert.equal(plan.steps[2].generatorPath[0].type, 'progression');
  assert.equal(plan.steps[2].round.current, 2);
});

test('seeded random generator is reproducible and source-aware', () => {
  const nodes = [{ id: 'rng', type: 'random', mode: 'choose', count: 8, allowRepeats: true, avoidImmediateRepeat: true, children: [
    { id: 'a', type: 'timed', label: 'A', phase: 'work', durationMs: 1000 },
    { id: 'b', type: 'timed', label: 'B', phase: 'work', durationMs: 1000 },
    { id: 'c', type: 'timed', label: 'C', phase: 'work', durationMs: 1000 }
  ] }];
  const a = buildCustomRoutine({ title: 'Random', nodes, seed: 'same-seed' });
  const b = buildCustomRoutine({ title: 'Random', nodes, seed: 'same-seed' });
  const c = buildCustomRoutine({ title: 'Random', nodes, seed: 'another-seed' });
  assert.deepEqual(a.steps.map((item) => item.label), b.steps.map((item) => item.label));
  assert.notDeepEqual(a.steps.map((item) => item.label), c.steps.map((item) => item.label));
  assert.ok(a.steps.every((item) => item.generatorPath?.[0]?.type === 'random'));
  for (let i = 1; i < a.steps.length; i++) assert.notEqual(a.steps[i].label, a.steps[i - 1].label);
  assert.equal(a.meta.randomSeed, 'same-seed');
});

test('random generator without repeats never selects more than one copy of a pool item', () => {
  const plan = buildCustomRoutine({
    title: 'Shuffle subset', seed: 'subset',
    nodes: [{ id: 'rng', type: 'random', mode: 'choose', count: 3, allowRepeats: false, children: [
      { id: 'a', type: 'timed', label: 'A', phase: 'work', durationMs: 1000 },
      { id: 'b', type: 'timed', label: 'B', phase: 'work', durationMs: 1000 },
      { id: 'c', type: 'timed', label: 'C', phase: 'work', durationMs: 1000 }
    ] }]
  });
  assert.equal(new Set(plan.steps.map((item) => item.label)).size, 3);
});

test('duration scaling and target fitting produce explicit deterministic totals', () => {
  const nodes = [
    { id: 'a', type: 'timed', label: 'A', phase: 'work', durationMs: 30000 },
    { id: 'b', type: 'timed', label: 'B', phase: 'rest', durationMs: 30000 }
  ];
  const scaled = buildCustomRoutine({ title: 'Scale', nodes, durationScale: 2 });
  assert.equal(estimatePlanDuration(scaled), 120000);
  const fitted = buildCustomRoutine({ title: 'Fit', nodes, targetDurationMs: 90000 });
  assert.equal(estimatePlanDuration(fitted), 90000);
  assert.deepEqual(fitted.steps.map((item) => item.durationMs), [45000, 45000]);
  assert.equal(fitted.meta.targetDurationMs, 90000);
});

test('target duration refuses uncapped manual steps', () => {
  assert.throws(() => buildCustomRoutine({
    title: 'Cannot fit', targetDurationMs: 60000,
    nodes: [{ id: 'manual', type: 'manual', label: 'Done when ready', phase: 'work' }]
  }), /uncapped manual steps/);
});

test('malicious or unknown formula variables are rejected during routine validation', () => {
  const issues = validateCustomRoutine({
    title: 'Bad formula',
    nodes: [{ id: 'x', type: 'timed', label: 'X', phase: 'work', durationMs: 1000, durationFormula: 'fetch(1)' }]
  });
  assert.ok(issues.some((issue) => issue.code === 'INVALID_FORMULA'));
});

test('seeded PRNG returns same sequence for same seed', () => {
  const a = createSeededRandom('abc');
  const b = createSeededRandom('abc');
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});


test('formula parameter references are preserved for copy/extract dependency tracking', () => {
  const parameters = [
    { id: 'p-work', type: 'duration', label: 'Work time', variable: 'workTime', defaultMs: 30000, minMs: 1000, maxMs: 120000 },
    { id: 'p-rounds', type: 'number', label: 'Rounds setting', variable: 'roundCount', defaultValue: 4, min: 1, max: 20, integer: true }
  ];
  const refs = collectCustomParameterRefs([{ id: 'r', type: 'repeat', count: 1, countFormula: 'roundCount', children: [
    { id: 'w', type: 'timed', label: 'Work', phase: 'work', durationMs: 30000, durationFormula: 'workTime + round' }
  ] }], parameters);
  assert.deepEqual(new Set(refs), new Set(['p-work', 'p-rounds']));
});

test('legacy parameter labels derive non-reserved formula variables', () => {
  assert.equal(formulaVariableName({ label: 'Rounds' }), 'roundsValue');
  assert.equal(formulaVariableName({ label: 'Work time' }), 'workTime');
});

test('custom compiled steps preserve per-step cue overrides', () => {
  const plan = buildCustomRoutine({ title: 'Cue override', nodes: [{ id: 'x', type: 'timed', label: 'Sprint', phase: 'work', durationMs: 10000, cueOverrides: { transitionSound: 'off', voiceMode: 'custom', voiceText: 'Sprint now', warningSeconds: 5, halfway: 'on' } }] });
  assert.deepEqual(plan.steps[0].cueOverrides, { transitionSound: 'off', voiceMode: 'custom', voiceText: 'Sprint now', warningSeconds: 5, halfway: 'on' });
});

test('session snapshots retain bounded semantic event history and EMOM remaining rest', () => {
  const clock = new FakeClock(0, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildEmom({ minutes: 1, blockMs: 60000, labels: ['Work'] }));
  clock.advance(20000);
  engine.completeManual();
  const events = engine.snapshot().events;
  assert.ok(events.some((event) => event.type === 'session-started'));
  const done = events.find((event) => event.type === 'manual-completed');
  assert.equal(done.remainingMs, 40000);
});


test('foreground wall-clock jumps do not change active countdown time', () => {
  const clock = new FakeClock(1_000_000, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 60000 }));
  clock.advance(10000);
  const before = engine.view().current.remainingMs;
  clock.advanceWall(3 * 3600000);
  engine.reconcile();
  const afterForward = engine.view().current.remainingMs;
  assert.equal(Math.round(afterForward), Math.round(before));
  clock.advanceMono(5000);
  engine.reconcile();
  assert.equal(Math.round(engine.view().current.remainingMs), Math.round(before - 5000));
  clock.advanceWall(-5 * 3600000);
  engine.reconcile();
  assert.equal(Math.round(engine.view().current.remainingMs), Math.round(before - 5000));
});

test('pause/resume uses monotonic pause duration when wall clock changes', () => {
  const clock = new FakeClock(1_000_000, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 60000 }));
  clock.advance(10000);
  engine.pause();
  assert.equal(engine.elapsedMs(), 10000);
  clock.advanceWall(2 * 3600000);
  clock.advanceMono(30000);
  engine.resume();
  assert.equal(engine.elapsedMs(), 10000);
  assert.equal(engine.snapshot().pausedTotalMs, 30000);
  assert.equal(Math.round(engine.view().current.remainingMs), 50000);
});

test('manual finish preserves monotonic active duration across wall-clock jumps', () => {
  const clock = new FakeClock(1_000_000, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildStopwatch());
  clock.advanceMono(15000);
  clock.advanceWall(4 * 3600000);
  engine.finish('finished');
  assert.equal(engine.elapsedMs(), 15000);
  assert.equal(engine.snapshot().finalElapsedMs, 15000);
});
