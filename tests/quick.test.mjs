import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDurationInput, durationInputText, quickDurationDial, normalizeDurationList, pushRecentDuration, DEFAULT_QUICK_PRESETS, DEFAULT_QUICK_ADJUSTMENTS } from '../src/quick.js';

test('quick duration parser accepts the universal quick-entry formats', () => {
  assert.equal(parseDurationInput('90').ms, 90000);
  assert.equal(parseDurationInput('90s').ms, 90000);
  assert.equal(parseDurationInput('1:30').ms, 90000);
  assert.equal(parseDurationInput('3m').ms, 180000);
  assert.equal(parseDurationInput('1h 20m').ms, 4800000);
  assert.equal(parseDurationInput('1:02:03').ms, 3723000);
  assert.equal(parseDurationInput('1.5m').ms, 90000);
});

test('quick duration parser rejects ambiguous, malformed, zero and excessive values', () => {
  for (const value of ['', 'abc', '1:90', '1h20', '0', '-5s']) assert.equal(parseDurationInput(value).ok, false, value);
  assert.equal(parseDurationInput('8d').ok, false);
});

test('duration input text produces reusable unit notation', () => {
  assert.equal(durationInputText(90000), '1m 30s');
  assert.equal(durationInputText(3600000), '1h');
  assert.equal(durationInputText(90061000), '1d 1h 1m 1s');
});

test('recent durations are unique, newest first and bounded', () => {
  assert.deepEqual(pushRecentDuration([60000, 120000, 180000], 120000), [120000, 60000, 180000]);
  assert.deepEqual(pushRecentDuration([1000,2000,3000,4000], 5000, 3), [5000,1000,2000]);
});

test('duration list normalization filters duplicates and invalid entries', () => {
  assert.deepEqual(normalizeDurationList([30000, 30000, 0, '60000', Number.NaN], { limit: 6 }), [30000, 60000]);
  assert.equal(DEFAULT_QUICK_PRESETS.length, 6);
  assert.deepEqual([...DEFAULT_QUICK_ADJUSTMENTS], [10000, 30000, 60000]);
});


test('Quick Timer dial encodes minute position within the current hour', () => {
  assert.deepEqual(quickDurationDial(30 * 60 * 1000), { hours: 0, withinHourSeconds: 1800, sweepDegrees: 180 });
  assert.deepEqual(quickDurationDial(60 * 60 * 1000), { hours: 1, withinHourSeconds: 0, sweepDegrees: 360 });
  assert.deepEqual(quickDurationDial(80 * 60 * 1000), { hours: 1, withinHourSeconds: 1200, sweepDegrees: 120 });
  assert.equal(quickDurationDial(10 * 1000).sweepDegrees, 2);
});
