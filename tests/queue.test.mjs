import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_STEP_ACTIONS,
  normalizeQueuePreset,
  queuePresetFromTimerIds,
  createQueueRun,
  queueCurrentItem,
  queueProgress,
  advanceQueueRun,
  reorderQueueItems
} from '../src/queue.js';

test('queue presets normalize timers, actions and order', () => {
  const queue = normalizeQueuePreset({
    id: 'q1',
    title: 'Morning',
    loop: true,
    items: [
      { id: 'a', savedTimerId: 't1', action: 'advance', order: 99 },
      { id: 'b', savedTimerId: 't2', action: 'overtime', order: 1 },
      { id: 'c', savedTimerId: '', action: 'repeat' }
    ]
  });
  assert.equal(queue.loop, true);
  assert.deepEqual(queue.items.map((x) => x.savedTimerId), ['t1','t2']);
  assert.deepEqual(queue.items.map((x) => x.order), [1,2]);
  assert.equal(queue.items[1].action, QUEUE_STEP_ACTIONS.OVERTIME);
});

test('queue can be created from selected timer IDs without duplicates', () => {
  const queue = queuePresetFromTimerIds(['a','b','a','c'], { id:'q', title:'Selected' });
  assert.deepEqual(queue.items.map((x) => x.savedTimerId), ['a','b','c']);
});

test('queue run advances and completes deterministically', () => {
  let run = createQueueRun(queuePresetFromTimerIds(['a','b'], { id:'q' }), { id:'run', now:10 });
  assert.equal(queueCurrentItem(run).savedTimerId, 'a');
  let result = advanceQueueRun(run, { now:20 });
  run = result.run;
  assert.equal(result.finished, false);
  assert.equal(queueCurrentItem(run).savedTimerId, 'b');
  assert.equal(run.completedSteps, 1);
  result = advanceQueueRun(run, { now:30 });
  assert.equal(result.finished, true);
  assert.equal(result.run.status, 'completed');
  assert.equal(result.run.completedSteps, 2);
});

test('looping queue restarts at first item and increments cycle', () => {
  let run = createQueueRun(queuePresetFromTimerIds(['a','b'], { id:'q', loop:true }), { id:'run' });
  run = advanceQueueRun(run).run;
  const result = advanceQueueRun(run);
  assert.equal(result.finished, false);
  assert.equal(result.looped, true);
  assert.equal(result.run.currentIndex, 0);
  assert.equal(result.run.cycle, 2);
});

test('skip increments skip count without completed count', () => {
  const run = createQueueRun(queuePresetFromTimerIds(['a','b'], { id:'q' }), { id:'run' });
  const result = advanceQueueRun(run, { skipped:true });
  assert.equal(result.run.skippedSteps, 1);
  assert.equal(result.run.completedSteps, 0);
  assert.equal(result.run.currentIndex, 1);
});

test('queue progress reports position and cycle', () => {
  let run = createQueueRun(queuePresetFromTimerIds(['a','b','c'], { id:'q' }), { id:'run' });
  run = advanceQueueRun(run).run;
  const progress = queueProgress(run);
  assert.equal(progress.current, 2);
  assert.equal(progress.total, 3);
  assert.equal(progress.completedSteps, 1);
  assert.equal(progress.percent, 1/3);
});

test('queue item reorder is deterministic', () => {
  const queue = queuePresetFromTimerIds(['a','b','c'], { id:'q' });
  const reordered = reorderQueueItems(queue.items, 2, 0);
  assert.deepEqual(reordered.map((x) => x.savedTimerId), ['c','a','b']);
  assert.deepEqual(reordered.map((x) => x.order), [1,2,3]);
});
