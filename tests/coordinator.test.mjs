import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock, buildCountdown } from '../src/core.js';
import { COMPLETION_ACTIONS, TimerCoordinator, normalizeCompletionAction } from '../src/coordinator.js';

function coordinatorWithClocks() {
  const clocks = [];
  const coordinator = new TimerCoordinator({
    clockFactory: () => { const clock = new FakeClock(1_000_000, 0); clocks.push(clock); return clock; },
    runtimeIdFactory: (() => { let i = 0; return () => `timer-${++i}`; })()
  });
  return { coordinator, clocks };
}

test('completion actions normalize to safe primitives', () => {
  assert.equal(normalizeCompletionAction('repeat'), COMPLETION_ACTIONS.REPEAT);
  assert.equal(normalizeCompletionAction('nonsense'), COMPLETION_ACTIONS.STOP);
});

test('twenty timers run independently and pausing one leaves the others running', () => {
  const { coordinator, clocks } = coordinatorWithClocks();
  const ids = [];
  for (let i = 0; i < 20; i++) ids.push(coordinator.start(buildCountdown({ durationMs: 60_000 + i * 1000 }), { title: `T${i}` }).id);
  assert.equal(coordinator.size(), 20);
  clocks.forEach((clock) => clock.advance(10_000));
  coordinator.pause(ids[3]);
  clocks.forEach((clock) => clock.advance(5_000));
  assert.equal(coordinator.view(ids[3]).status, 'paused');
  assert.equal(coordinator.get(ids[3]).engine.elapsedMs(), 10_000);
  assert.equal(coordinator.get(ids[4]).engine.elapsedMs(), 15_000);
});

test('multiple coordinator snapshots restore together', () => {
  const first = coordinatorWithClocks();
  const a = first.coordinator.start(buildCountdown({ durationMs: 30_000 }), { title: 'A' });
  const b = first.coordinator.start(buildCountdown({ durationMs: 45_000 }), { title: 'B' });
  first.clocks[0].advance(5_000);
  first.clocks[1].advance(7_000);
  const records = first.coordinator.snapshots();
  const second = coordinatorWithClocks();
  second.coordinator.restore(records);
  assert.equal(second.coordinator.size(), 2);
  assert.equal(second.coordinator.get(a.id).engine.snapshot().meta.title, 'A');
  assert.equal(second.coordinator.get(b.id).engine.snapshot().meta.title, 'B');
});

test('overtime is a coordinator state and can be paused and finished', () => {
  const { coordinator, clocks } = coordinatorWithClocks();
  const runtime = coordinator.start(buildCountdown({ durationMs: 10_000 }), { title: 'Tea' }, { completionAction: 'overtime' });
  clocks[0].advance(10_000);
  coordinator.reconcile(runtime.id);
  assert.equal(coordinator.view(runtime.id).status, 'overtime');
  clocks[0].advance(3_000);
  assert.equal(coordinator.view(runtime.id).overtimeMs, 3_000);
  coordinator.pause(runtime.id);
  clocks[0].advance(5_000);
  assert.equal(coordinator.view(runtime.id).overtimeMs, 3_000);
  let terminal;
  coordinator.subscribe((event) => { if (event.type === 'runtime-terminal') terminal = event; });
  coordinator.finish(runtime.id);
  assert.equal(terminal.snapshot.overtimeMs, 3_000);
  assert.equal(terminal.snapshot.finalElapsedMs, 13_000);
});

test('repeat action starts a fresh cycle under the same runtime id', () => {
  const { coordinator, clocks } = coordinatorWithClocks();
  const runtime = coordinator.start(buildCountdown({ durationMs: 5_000 }), { title: 'Repeat' }, { completionAction: 'repeat' });
  const originalSession = runtime.engine.snapshot().id;
  clocks[0].advance(5_000);
  coordinator.reconcile(runtime.id);
  const current = coordinator.get(runtime.id);
  assert.equal(current.cycle, 2);
  assert.notEqual(current.engine.snapshot().id, originalSession);
  assert.equal(current.engine.view().status, 'running');
});

test('running overtime survives a persisted restore and includes offline elapsed wall time', () => {
  const firstClock = new FakeClock(5_000, 0);
  const first = new TimerCoordinator({ clockFactory: () => firstClock, runtimeIdFactory: () => 'timer-overtime' });
  const runtime = first.start(buildCountdown({ durationMs: 1_000 }), { title: 'Oven' }, { completionAction: 'overtime' });
  firstClock.advance(1_000);
  first.reconcile(runtime.id);
  firstClock.advance(2_000);
  const record = first.snapshot(runtime.id);
  assert.equal(record.overtime.accumulatedMs, 2_000);

  const restoredClock = new FakeClock(11_000, 0);
  const second = new TimerCoordinator({ clockFactory: () => restoredClock });
  second.restore([record]);
  assert.equal(second.view(runtime.id).status, 'overtime');
  assert.equal(second.view(runtime.id).overtimeMs, 5_000);
});

test('start-next completion is surfaced as a terminal orchestration intent', () => {
  const { coordinator, clocks } = coordinatorWithClocks();
  const runtime = coordinator.start(buildCountdown({ durationMs: 1_000 }), { title: 'First' }, { completionAction: 'start-next' });
  let terminal;
  coordinator.subscribe((event) => { if (event.type === 'runtime-terminal') terminal = event; });
  clocks[0].advance(1_000);
  coordinator.reconcile(runtime.id);
  assert.equal(terminal.action, COMPLETION_ACTIONS.START_NEXT);
  assert.equal(terminal.startNext, true);
});

test('overtime restore after pause and resume excludes the paused wall interval', () => {
  let wall = 100000;
  let mono = 0;
  const makeClock = () => ({
    wallNow: () => wall,
    monoNow: () => mono
  });
  const coordinator = new TimerCoordinator({ clockFactory: makeClock, runtimeIdFactory: () => 'overtime-pause-runtime' });
  coordinator.start(buildCountdown({ durationMs: 10000 }), { title: 'Overtime' }, { completionAction: COMPLETION_ACTIONS.OVERTIME });
  wall += 10000; mono += 10000;
  coordinator.reconcile('overtime-pause-runtime');
  wall += 5000; mono += 5000;
  coordinator.pause('overtime-pause-runtime');
  wall += 20000; mono += 20000;
  coordinator.resume('overtime-pause-runtime');
  wall += 3000; mono += 3000;
  const checkpoint = coordinator.snapshot('overtime-pause-runtime');
  assert.equal(Math.round(checkpoint.overtime.accumulatedMs), 8000);

  // Simulate the process being absent for another 4 seconds after the checkpoint.
  wall += 4000;
  mono = 0;
  const restored = new TimerCoordinator({ clockFactory: makeClock });
  restored.restore([checkpoint]);
  assert.equal(Math.round(restored.view('overtime-pause-runtime').overtimeMs), 12000);
});


test('workspace ordering, metadata and completion settings survive snapshots and restore', () => {
  const first = coordinatorWithClocks();
  const a = first.coordinator.start(buildCountdown({ durationMs: 30_000 }), { title: 'A' });
  const b = first.coordinator.start(buildCountdown({ durationMs: 30_000 }), { title: 'B' });
  const c = first.coordinator.start(buildCountdown({ durationMs: 30_000 }), { title: 'C' });
  first.coordinator.updateRuntime(b.id, {
    meta: { workspaceTitle: 'Tea', workspaceGroup: 'Kitchen', workspaceColor: 'orange', completionNextRoutineId: 'routine-next' },
    completionAction: COMPLETION_ACTIONS.START_NEXT
  });
  first.coordinator.reorder([c.id, b.id, a.id]);
  assert.deepEqual(first.coordinator.list().map((runtime) => runtime.id), [c.id, b.id, a.id]);
  const bRecord = first.coordinator.snapshot(b.id);
  assert.equal(bRecord.order, 2);
  assert.equal(bRecord.meta.workspaceTitle, 'Tea');
  assert.equal(bRecord.meta.workspaceGroup, 'Kitchen');
  assert.equal(bRecord.completionAction, COMPLETION_ACTIONS.START_NEXT);

  const second = coordinatorWithClocks();
  second.coordinator.restore(first.coordinator.snapshots());
  assert.deepEqual(second.coordinator.list().map((runtime) => runtime.id), [c.id, b.id, a.id]);
  assert.equal(second.coordinator.get(b.id).meta.workspaceColor, 'orange');
  assert.equal(second.coordinator.get(b.id).meta.completionNextRoutineId, 'routine-next');
});

test('workspace move and bulk pause/resume operate independently of timer truth', () => {
  const { coordinator, clocks } = coordinatorWithClocks();
  const a = coordinator.start(buildCountdown({ durationMs: 60_000 }), { title: 'A' });
  const b = coordinator.start(buildCountdown({ durationMs: 60_000 }), { title: 'B' });
  const c = coordinator.start(buildCountdown({ durationMs: 60_000 }), { title: 'C' });
  assert.equal(coordinator.move(c.id, -2), true);
  assert.deepEqual(coordinator.list().map((runtime) => runtime.id), [c.id, a.id, b.id]);

  clocks.forEach((clock) => clock.advance(5_000));
  assert.equal(coordinator.pauseAll(), 3);
  clocks.forEach((clock) => clock.advance(10_000));
  assert.equal(coordinator.get(a.id).engine.elapsedMs(), 5_000);
  assert.equal(coordinator.resumeAll(), 3);
  clocks.forEach((clock) => clock.advance(2_000));
  assert.equal(coordinator.get(a.id).engine.elapsedMs(), 7_000);
});

test('explicit stop bypasses repeat and start-next completion actions', () => {
  const { coordinator } = coordinatorWithClocks();
  const repeat = coordinator.start(buildCountdown({ durationMs: 60_000 }), { title: 'Repeat' }, { completionAction: COMPLETION_ACTIONS.REPEAT });
  let terminal;
  coordinator.subscribe((event) => { if (event.type === 'runtime-terminal' && event.runtimeId === repeat.id) terminal = event; });
  assert.equal(coordinator.command(repeat.id, 'stop', 'user-ended'), true);
  assert.equal(terminal.action, COMPLETION_ACTIONS.STOP);
  assert.equal(terminal.snapshot.completionReason, 'user-ended');
  assert.equal(coordinator.get(repeat.id).cycle, 1);
});
