import { estimatePlanDuration } from './core.js';

const DAY = 86400000;
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(input) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function normalizedStep(step = {}) {
  return {
    label: String(step.label || ''),
    phase: String(step.phase || 'custom'),
    manual: Boolean(step.manual),
    durationMs: step.manual ? undefined : num(step.durationMs),
    timeCapMs: step.manual ? (step.timeCapMs == null ? undefined : num(step.timeCapMs)) : undefined,
    completionBehavior: step.completionBehavior || 'advance',
    target: step.target == null ? undefined : String(step.target)
  };
}

export function normalizedComparablePlan(sessionOrPlan = {}) {
  const plan = sessionOrPlan.plan || sessionOrPlan;
  const mode = sessionOrPlan.mode || plan?.meta?.mode || sessionOrPlan.meta?.mode || 'generic';
  if (!plan) return { mode, kind: 'unknown' };
  if (plan.kind === 'timeline') return {
    mode,
    kind: 'timeline',
    steps: (plan.steps || []).map(normalizedStep)
  };
  if (plan.kind === 'timebox') return {
    mode,
    kind: 'timebox',
    durationMs: num(plan.durationMs),
    movements: (plan.meta?.movements || []).map((m) => ({ label: String(m.label || ''), target: m.target == null ? undefined : String(m.target) }))
  };
  return {
    mode,
    kind: 'open',
    timeCapMs: plan.timeCapMs == null ? undefined : num(plan.timeCapMs),
    rounds: plan.meta?.rounds == null ? undefined : num(plan.meta.rounds),
    movements: (plan.meta?.movements || []).map((m) => ({ label: String(m.label || ''), target: m.target == null ? undefined : String(m.target) }))
  };
}

export function comparisonFingerprint(sessionOrPlan) {
  return `cmp1-${fnv1a(stableStringify(normalizedComparablePlan(sessionOrPlan)))}`;
}

export function plannedDurationMs(session) {
  if (Number.isFinite(session?.plannedDurationMs)) return Number(session.plannedDurationMs);
  try { return estimatePlanDuration(session?.plan); } catch { return undefined; }
}

function eventAt(event) {
  return Number.isFinite(event?.scheduledAt) ? event.scheduledAt : num(event?.observedAt);
}

export function eventTimeline(session) {
  const startedAt = num(session?.startedAt);
  return (session?.events || []).filter((event) => event && event.type).map((event) => {
    const at = eventAt(event);
    const offsetMs = Math.max(0, at - startedAt);
    const stepLabel = event.step?.label || '';
    let label = event.type;
    if (event.type === 'session-started') label = 'Session started';
    else if (event.type === 'step-started') label = `Started ${stepLabel || 'step'}`;
    else if (event.type === 'step-completed') label = `Completed ${stepLabel || 'step'}`;
    else if (event.type === 'step-skipped') label = `Skipped ${stepLabel || 'step'}`;
    else if (event.type === 'step-restarted') label = `Restarted ${stepLabel || 'step'}`;
    else if (event.type === 'manual-completed') label = `Done early · ${stepLabel || 'step'}`;
    else if (event.type === 'session-paused') label = 'Paused';
    else if (event.type === 'session-resumed') label = 'Resumed';
    else if (event.type === 'time-adjusted') label = `${num(event.deltaMs) >= 0 ? 'Added' : 'Removed'} ${Math.abs(num(event.deltaMs)) / 1000}s`;
    else if (event.type === 'lap-recorded') label = `Lap ${event.lap?.index || ''}`.trim();
    else if (event.type === 'session-completed') label = 'Session completed';
    else if (event.type === 'session-cancelled') label = 'Session cancelled';
    else if (event.type === 'session-data-changed') return null;
    return { id: event.id, type: event.type, at, offsetMs, label, stepLabel, event };
  }).filter(Boolean);
}

function repsPerRound(session) {
  const movements = session?.plan?.meta?.movements || [];
  if (!movements.length) return undefined;
  let total = 0;
  for (const movement of movements) {
    const target = Number(movement.target);
    if (!Number.isFinite(target)) return undefined;
    total += target;
  }
  return total > 0 ? total : undefined;
}

export function amrapScore(session) {
  const rounds = Math.max(0, Math.floor(num(session?.data?.rounds)));
  const reps = Math.max(0, Math.floor(num(session?.data?.reps)));
  const perRound = repsPerRound(session);
  return {
    rounds, reps, perRound,
    normalized: perRound ? rounds * perRound + reps : undefined,
    display: `${rounds} round${rounds === 1 ? '' : 's'} + ${reps}`
  };
}

export function lapStats(session) {
  const laps = (session?.data?.laps || []).map((lap) => num(lap.lapDurationMs)).filter((v) => v > 0);
  if (!laps.length) return undefined;
  const sorted = [...laps].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count: laps.length,
    fastestMs: sorted[0],
    slowestMs: sorted.at(-1),
    averageMs: laps.reduce((a, b) => a + b, 0) / laps.length,
    medianMs: median,
    rangeMs: sorted.at(-1) - sorted[0]
  };
}

export function analyzeSession(session) {
  const events = session?.events || [];
  const planned = plannedDurationMs(session);
  const active = num(session?.activeDurationMs);
  const wall = Number.isFinite(session?.wallDurationMs) ? num(session.wallDurationMs) : Math.max(0, num(session?.endedAt) - num(session?.startedAt));
  const adjustments = events.filter((e) => e.type === 'time-adjusted');
  const skips = events.filter((e) => e.type === 'step-skipped');
  const restarts = events.filter((e) => e.type === 'step-restarted');
  const pauses = events.filter((e) => e.type === 'session-paused');
  const manualDone = events.filter((e) => e.type === 'manual-completed');
  const earlyRests = manualDone.map((e) => num(e.remainingMs)).filter((v) => v >= 0);
  const phase = session?.phaseTotals || {
    work: num(session?.workMs), rest: num(session?.restMs), prepare: 0, recovery: 0, cooldown: 0, custom: num(session?.otherMs)
  };
  const mode = session?.mode || session?.plan?.meta?.mode || 'generic';
  const result = {
    id: session?.id,
    mode,
    fingerprint: session?.comparisonFingerprint || comparisonFingerprint(session),
    activeDurationMs: active,
    wallDurationMs: wall,
    plannedDurationMs: planned,
    pausedMs: num(session?.pausedMs),
    completionPercent: planned ? clamp(active / planned, 0, 1) : undefined,
    phaseTotals: {
      work: num(phase.work), rest: num(phase.rest), prepare: num(phase.prepare), recovery: num(phase.recovery), cooldown: num(phase.cooldown), custom: num(phase.custom)
    },
    adjustments: { count: adjustments.length, netMs: adjustments.reduce((sum, e) => sum + num(e.deltaMs), 0) },
    skips: skips.length,
    restarts: restarts.length,
    pauses: pauses.length,
    timeline: eventTimeline(session)
  };
  if (mode === 'amrap') result.amrap = amrapScore(session);
  if (mode === 'stopwatch') result.laps = lapStats(session);
  if (mode === 'emom') result.emom = {
    earlyDoneCount: earlyRests.length,
    averageRemainingRestMs: earlyRests.length ? earlyRests.reduce((a, b) => a + b, 0) / earlyRests.length : undefined,
    minRemainingRestMs: earlyRests.length ? Math.min(...earlyRests) : undefined,
    maxRemainingRestMs: earlyRests.length ? Math.max(...earlyRests) : undefined
  };
  return result;
}

export function comparableSessions(sessions, session, { limit = 20 } = {}) {
  const fp = session?.comparisonFingerprint || comparisonFingerprint(session);
  return (sessions || []).filter((item) => (item.comparisonFingerprint || comparisonFingerprint(item)) === fp).sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
}

export function objectiveRecord(sessions, session) {
  const comparable = comparableSessions(sessions, session, { limit: 10000 });
  if (comparable.length < 2) return undefined;
  if (session.mode === 'for-time') {
    const finished = comparable.filter((s) => s.completionReason === 'finished' && num(s.activeDurationMs) > 0);
    if (!finished.length) return undefined;
    const best = [...finished].sort((a, b) => a.activeDurationMs - b.activeDurationMs)[0];
    return { type: 'for-time', label: 'Fastest comparable time', sessionId: best.id, valueMs: best.activeDurationMs, isCurrent: best.id === session.id, sampleSize: finished.length };
  }
  if (session.mode === 'amrap') {
    const scores = comparable.map((s) => ({ session: s, score: amrapScore(s) }));
    scores.sort((a, b) => {
      if (a.score.normalized != null && b.score.normalized != null) return b.score.normalized - a.score.normalized;
      return (b.score.rounds - a.score.rounds) || (b.score.reps - a.score.reps);
    });
    const best = scores[0];
    return { type: 'amrap', label: 'Best comparable score', sessionId: best.session.id, display: best.score.display, isCurrent: best.session.id === session.id, sampleSize: scores.length };
  }
  if (session.mode === 'stopwatch') {
    const laps = comparable.flatMap((s) => (s.data?.laps || []).map((lap) => ({ sessionId: s.id, durationMs: num(lap.lapDurationMs) }))).filter((x) => x.durationMs > 0);
    if (!laps.length) return undefined;
    laps.sort((a, b) => a.durationMs - b.durationMs);
    return { type: 'stopwatch', label: 'Fastest comparable lap', sessionId: laps[0].sessionId, valueMs: laps[0].durationMs, isCurrent: laps[0].sessionId === session.id, sampleSize: comparable.length };
  }
  return undefined;
}

export function factualTrend(sessions, session, limit = 3) {
  const comparable = comparableSessions(sessions, session, { limit: 20 }).filter((s) => s.id !== session.id || true).slice(0, limit).reverse();
  if (comparable.length < 3) return undefined;
  if (session.mode === 'for-time') return { type: 'times', values: comparable.map((s) => s.activeDurationMs) };
  if (session.mode === 'amrap') return { type: 'scores', values: comparable.map((s) => amrapScore(s).display) };
  return undefined;
}

export function summarizeRange(sessions, { from = -Infinity, to = Infinity } = {}) {
  const selected = (sessions || []).filter((s) => s.startedAt >= from && s.startedAt < to);
  return {
    sessions: selected.length,
    activeMs: selected.reduce((a, s) => a + num(s.activeDurationMs), 0),
    workMs: selected.reduce((a, s) => a + num(s.workMs), 0),
    restMs: selected.reduce((a, s) => a + num(s.restMs), 0),
    pausedMs: selected.reduce((a, s) => a + num(s.pausedMs), 0),
    modes: selected.reduce((map, s) => { map[s.mode || 'other'] = (map[s.mode || 'other'] || 0) + 1; return map; }, {})
  };
}

export function startOfLocalDay(timestamp = Date.now()) {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function startOfLocalWeek(timestamp = Date.now(), weekStartsMonday = true) {
  const d = new Date(startOfLocalDay(timestamp));
  const day = d.getDay();
  const offset = weekStartsMonday ? (day + 6) % 7 : day;
  return d.getTime() - offset * DAY;
}

export function monthCalendar(sessions, year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const counts = new Map();
  for (const session of sessions || []) {
    const d = new Date(session.startedAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    counts.set(d.getDate(), (counts.get(d.getDate()) || 0) + 1);
  }
  return {
    year, month,
    firstWeekday: first.getDay(),
    days: last.getDate(),
    counts
  };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function sessionsToCsv(sessions) {
  const header = ['id','startedAt','endedAt','title','mode','completionReason','activeDurationMs','pausedMs','workMs','restMs','otherMs','comparisonFingerprint','rounds','extraReps'];
  const rows = (sessions || []).map((s) => [
    s.id, new Date(s.startedAt).toISOString(), s.endedAt ? new Date(s.endedAt).toISOString() : '', s.title, s.mode, s.completionReason,
    s.activeDurationMs, s.pausedMs, s.workMs, s.restMs, s.otherMs, s.comparisonFingerprint || comparisonFingerprint(s), s.data?.rounds ?? '', s.data?.reps ?? ''
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n');
}
