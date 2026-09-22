import test from 'node:test';
import assert from 'node:assert/strict';
import {
  comparisonFingerprint, analyzeSession, comparableSessions, objectiveRecord,
  amrapScore, lapStats, summarizeRange, monthCalendar, sessionsToCsv
} from '../src/analytics.js';
import { buildInterval, buildForTime, buildAmrap, buildStopwatch } from '../src/core.js';

function session(overrides = {}) {
  return {
    id: 's1', title: 'Routine', mode: 'interval', startedAt: 1000, endedAt: 62000,
    activeDurationMs: 60000, pausedMs: 1000, workMs: 40000, restMs: 20000, otherMs: 0,
    completionReason: 'finished', plan: buildInterval({ workMs: 20000, restMs: 10000, rounds: 2, prepareMs: 0 }),
    events: [], data: {}, ...overrides
  };
}

test('comparison fingerprint ignores title and cue-only metadata but changes with execution structure', () => {
  const a = session({ title: 'A', cueOverrides: { profileId: 'gym' } });
  const b = session({ id: 's2', title: 'B', cueOverrides: { profileId: 'quiet' } });
  assert.equal(comparisonFingerprint(a), comparisonFingerprint(b));
  const c = session({ id: 's3', plan: buildInterval({ workMs: 30000, restMs: 10000, rounds: 2, prepareMs: 0 }) });
  assert.notEqual(comparisonFingerprint(a), comparisonFingerprint(c));
});

test('session analysis reports planned/actual actions and event timeline', () => {
  const s = session({ events: [
    { id: 'e1', type: 'session-started', observedAt: 1000 },
    { id: 'e2', type: 'session-paused', observedAt: 11000 },
    { id: 'e3', type: 'session-resumed', observedAt: 12000 },
    { id: 'e4', type: 'time-adjusted', observedAt: 13000, deltaMs: 15000 },
    { id: 'e5', type: 'step-skipped', observedAt: 20000, step: { label: 'Rest' } },
    { id: 'e6', type: 'step-restarted', observedAt: 25000, step: { label: 'Work' } }
  ] });
  const result = analyzeSession(s);
  assert.equal(result.plannedDurationMs, 50000);
  assert.equal(result.adjustments.count, 1);
  assert.equal(result.adjustments.netMs, 15000);
  assert.equal(result.skips, 1);
  assert.equal(result.restarts, 1);
  assert.equal(result.pauses, 1);
  assert.ok(result.timeline.some((e) => e.label === 'Added 15s'));
});

test('For Time record only uses completed comparable attempts', () => {
  const plan = buildForTime({ title: 'Fran', rounds: 1, movements: [{ target: '21', label: 'Thrusters' }] });
  const sessions = [
    session({ id: 'a', mode: 'for-time', plan, activeDurationMs: 300000, completionReason: 'finished' }),
    session({ id: 'b', mode: 'for-time', plan, activeDurationMs: 280000, completionReason: 'finished' }),
    session({ id: 'c', mode: 'for-time', plan, activeDurationMs: 240000, completionReason: 'time-cap' })
  ];
  const record = objectiveRecord(sessions, sessions[0]);
  assert.equal(record.sessionId, 'b');
  assert.equal(record.valueMs, 280000);
  assert.equal(record.sampleSize, 2);
});

test('AMRAP normalized score uses numeric movement targets', () => {
  const plan = buildAmrap({ durationMs: 600000, movements: [{ target: '5', label: 'Pull-ups' }, { target: '10', label: 'Push-ups' }] });
  const score = amrapScore(session({ mode: 'amrap', plan, data: { rounds: 3, reps: 4 } }));
  assert.equal(score.perRound, 15);
  assert.equal(score.normalized, 49);
});

test('lap statistics report fastest average median and range', () => {
  const stats = lapStats(session({ mode: 'stopwatch', plan: buildStopwatch(), data: { laps: [
    { lapDurationMs: 10000 }, { lapDurationMs: 12000 }, { lapDurationMs: 14000 }
  ] } }));
  assert.equal(stats.fastestMs, 10000);
  assert.equal(stats.averageMs, 12000);
  assert.equal(stats.medianMs, 12000);
  assert.equal(stats.rangeMs, 4000);
});

test('summary, calendar and CSV derive from raw sessions', () => {
  const now = new Date(2026, 8, 10, 12).getTime();
  const sessions = [
    session({ id: 'a', startedAt: now, activeDurationMs: 10000, workMs: 7000, restMs: 3000 }),
    session({ id: 'b', startedAt: now + 1000, activeDurationMs: 20000, workMs: 12000, restMs: 8000 })
  ];
  const summary = summarizeRange(sessions);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.activeMs, 30000);
  const cal = monthCalendar(sessions, 2026, 8);
  assert.equal(cal.counts.get(10), 2);
  const csv = sessionsToCsv(sessions);
  assert.match(csv, /comparisonFingerprint/);
  assert.match(csv, /2026-09-10/);
});

test('comparable sessions require identical normalized execution plans', () => {
  const base = session({ id: 'a' });
  const same = session({ id: 'b', title: 'Renamed' });
  const different = session({ id: 'c', plan: buildInterval({ workMs: 25000, restMs: 10000, rounds: 2, prepareMs: 0 }) });
  const found = comparableSessions([base, same, different], base);
  assert.deepEqual(new Set(found.map((s) => s.id)), new Set(['a','b']));
});
