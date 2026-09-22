const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const uid = (prefix = 'id') => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;

export const PHASES = ['work', 'rest', 'prepare', 'recovery', 'cooldown', 'custom'];
const makePhaseTotals = () => Object.fromEntries(PHASES.map((phase) => [phase, 0]));

export class BrowserClock {
  wallNow() { return Date.now(); }
  monoNow() { return globalThis.performance?.now?.() ?? Date.now(); }
}

export class FakeClock {
  constructor(wall = 0, mono = 0) { this.wall = wall; this.mono = mono; }
  wallNow() { return this.wall; }
  monoNow() { return this.mono; }
  advance(ms) { this.wall += ms; this.mono += ms; }
  advanceWall(ms) { this.wall += ms; }
  advanceMono(ms) { this.mono += ms; }
  set(wall, mono = wall) { this.wall = wall; this.mono = mono; }
}

export function step({ id, label, phase = 'work', durationMs, manual = false, timeCapMs, completionBehavior = 'advance', round, target, sourceNodeId, sectionPath, repeatPath }) {
  return {
    id: id || uid('step'),
    label: String(label || (phase === 'rest' ? 'Rest' : 'Work')),
    phase: PHASES.includes(phase) ? phase : 'custom',
    durationMs: manual ? undefined : Math.max(1, Number(durationMs) || 1),
    manual: Boolean(manual),
    timeCapMs: manual && timeCapMs ? Math.max(1, Number(timeCapMs)) : undefined,
    completionBehavior,
    round,
    target,
    sourceNodeId,
    sectionPath: sectionPath ? structuredClone(sectionPath) : undefined,
    repeatPath: repeatPath ? structuredClone(repeatPath) : undefined
  };
}

export function buildCountdown({ durationMs, label = 'Timer' }) {
  return { kind: 'timeline', title: label, steps: [step({ label, phase: 'work', durationMs })] };
}

export function buildInterval({ workMs = 40000, restMs = 20000, rounds = 10, prepareMs = 10000, finalRest = false, workLabel = 'Work', restLabel = 'Rest' }) {
  const steps = [];
  rounds = clamp(Math.floor(Number(rounds) || 1), 1, 10000);
  if (prepareMs > 0) steps.push(step({ label: 'Get Ready', phase: 'prepare', durationMs: prepareMs }));
  for (let r = 1; r <= rounds; r++) {
    steps.push(step({ label: workLabel, phase: 'work', durationMs: workMs, round: { current: r, total: rounds } }));
    if (r < rounds || finalRest) steps.push(step({ label: restLabel, phase: 'rest', durationMs: restMs, round: { current: r, total: rounds } }));
  }
  return { kind: 'timeline', title: `${Math.round(workMs / 1000)}/${Math.round(restMs / 1000)} Interval`, steps };
}

export function buildCircuit({ title = 'Circuit', rounds = 3, prepareMs = 10000, betweenRoundsMs = 0, finalRoundRest = false, items = [] }) {
  const steps = [];
  rounds = clamp(Math.floor(Number(rounds) || 1), 1, 1000);
  if (prepareMs > 0) steps.push(step({ label: 'Get Ready', phase: 'prepare', durationMs: prepareMs }));
  const clean = items.length ? items : [
    { label: 'Work', phase: 'work', durationMs: 40000 },
    { label: 'Rest', phase: 'rest', durationMs: 20000 }
  ];
  for (let r = 1; r <= rounds; r++) {
    for (const item of clean) {
      steps.push(step({ ...item, round: { current: r, total: rounds } }));
    }
    if (betweenRoundsMs > 0 && (r < rounds || finalRoundRest)) {
      steps.push(step({ label: 'Round Rest', phase: 'recovery', durationMs: betweenRoundsMs, round: { current: r, total: rounds } }));
    }
  }
  return { kind: 'timeline', title, steps };
}

export function buildBoxing({ rounds = 8, roundMs = 180000, restMs = 60000, prepareMs = 10000, finalRest = false }) {
  const steps = [];
  rounds = clamp(Math.floor(Number(rounds) || 1), 1, 1000);
  if (prepareMs > 0) steps.push(step({ label: 'Get Ready', phase: 'prepare', durationMs: prepareMs }));
  for (let r = 1; r <= rounds; r++) {
    steps.push(step({ label: 'Box', phase: 'work', durationMs: roundMs, round: { current: r, total: rounds } }));
    if (restMs > 0 && (r < rounds || finalRest)) {
      steps.push(step({ label: 'Rest', phase: 'rest', durationMs: restMs, round: { current: r, total: rounds } }));
    }
  }
  return { kind: 'timeline', title: 'Boxing', steps, meta: { mode: 'boxing' } };
}

export function buildRunWalk({ rounds = 10, runMs = 120000, walkMs = 60000, warmupMs = 300000, cooldownMs = 300000, finalWalk = true }) {
  const steps = [];
  rounds = clamp(Math.floor(Number(rounds) || 1), 1, 10000);
  if (warmupMs > 0) steps.push(step({ label: 'Warm-up', phase: 'prepare', durationMs: warmupMs }));
  for (let r = 1; r <= rounds; r++) {
    steps.push(step({ label: 'Run', phase: 'work', durationMs: runMs, round: { current: r, total: rounds } }));
    if (r < rounds || finalWalk) steps.push(step({ label: 'Walk', phase: 'rest', durationMs: walkMs, round: { current: r, total: rounds } }));
  }
  if (cooldownMs > 0) steps.push(step({ label: 'Cooldown', phase: 'cooldown', durationMs: cooldownMs }));
  return { kind: 'timeline', title: 'Run / Walk', steps };
}

export function buildEmom({ minutes = 10, blockMs = 60000, labels = ['Work'], targets = [] }) {
  minutes = clamp(Math.floor(Number(minutes) || 1), 1, 10000);
  const steps = [];
  for (let i = 0; i < minutes; i++) {
    const idx = i % Math.max(1, labels.length);
    steps.push(step({
      label: labels[idx] || `Minute ${i + 1}`,
      phase: 'work',
      manual: true,
      timeCapMs: blockMs,
      completionBehavior: 'rest-until-deadline',
      round: { current: i + 1, total: minutes },
      target: targets[idx]
    }));
  }
  return { kind: 'timeline', title: blockMs === 60000 ? 'EMOM' : `Every ${Math.round(blockMs / 60000)} min`, steps, meta: { mode: 'emom' } };
}

export function buildAmrap({ durationMs = 900000, title = 'AMRAP', movements = [] }) {
  return { kind: 'timebox', title, durationMs: Math.max(1000, durationMs), meta: { mode: 'amrap', movements } };
}

export function buildForTime({ title = 'For Time', timeCapMs, rounds = 1, movements = [] }) {
  return { kind: 'open', title, timeCapMs: timeCapMs > 0 ? timeCapMs : undefined, meta: { mode: 'for-time', rounds, movements } };
}

export function buildStopwatch() {
  return { kind: 'open', title: 'Stopwatch', meta: { mode: 'stopwatch' } };
}

export function buildLadder({ title = 'Ladder', startMs = 20000, stepMs = 10000, levels = 5, restMs = 10000, direction = 'up' }) {
  levels = clamp(Math.floor(Number(levels) || 1), 1, 1000);
  const steps = [];
  for (let i = 0; i < levels; i++) {
    const k = direction === 'down' ? levels - 1 - i : i;
    const dur = Math.max(1000, startMs + stepMs * k);
    steps.push(step({ label: `Level ${i + 1}`, phase: 'work', durationMs: dur, round: { current: i + 1, total: levels } }));
    if (restMs > 0 && i < levels - 1) steps.push(step({ label: 'Rest', phase: 'rest', durationMs: restMs, round: { current: i + 1, total: levels } }));
  }
  return { kind: 'timeline', title, steps, meta: { mode: 'ladder' } };
}

export function buildPyramid({ title = 'Pyramid', startMs = 20000, peakMs = 60000, stepMs = 10000, restMs = 10000 }) {
  const vals = [];
  const safeStep = Math.max(1000, Math.abs(stepMs));
  for (let v = startMs; v <= peakMs; v += safeStep) vals.push(v);
  if (!vals.length || vals.at(-1) !== peakMs) vals.push(peakMs);
  const full = [...vals, ...vals.slice(0, -1).reverse()];
  const steps = [];
  full.forEach((dur, i) => {
    steps.push(step({ label: `Level ${i + 1}`, phase: 'work', durationMs: dur, round: { current: i + 1, total: full.length } }));
    if (restMs > 0 && i < full.length - 1) steps.push(step({ label: 'Rest', phase: 'rest', durationMs: restMs, round: { current: i + 1, total: full.length } }));
  });
  return { kind: 'timeline', title, steps, meta: { mode: 'pyramid' } };
}

export function validateCustomRoutine({ title = 'Custom Routine', nodes = [] } = {}) {
  const issues = [];
  const seenIds = new Set();
  const add = (code, message, path = []) => issues.push({ code, message, path });

  if (!String(title || '').trim()) add('MISSING_TITLE', 'Routine name is required.');
  if (!Array.isArray(nodes) || nodes.length === 0) {
    add('EMPTY_ROUTINE', 'Custom routine must contain at least one step.');
    return issues;
  }

  const walk = (children, path = [], depth = 0) => {
    if (!Array.isArray(children)) {
      add('INVALID_CHILDREN', 'A routine container has invalid children.', path);
      return;
    }
    if (depth > 32) {
      add('MAX_DEPTH', 'Custom routine nesting is too deep.', path);
      return;
    }
    children.forEach((node, index) => {
      const nodePath = [...path, index];
      if (!node || typeof node !== 'object') {
        add('INVALID_NODE', 'Routine contains an invalid item.', nodePath);
        return;
      }
      if (!node.id || typeof node.id !== 'string') add('MISSING_ID', 'Routine item is missing an ID.', nodePath);
      else if (seenIds.has(node.id)) add('DUPLICATE_ID', `Duplicate routine item ID: ${node.id}.`, nodePath);
      else seenIds.add(node.id);

      if (node.type === 'timed') {
        if (!Number.isFinite(node.durationMs) || node.durationMs <= 0) add('INVALID_DURATION', `${node.label || 'Timed step'} must have a positive duration.`, nodePath);
      } else if (node.type === 'manual') {
        if (node.timeCapMs != null && (!Number.isFinite(node.timeCapMs) || node.timeCapMs <= 0)) add('INVALID_CAP', `${node.label || 'Manual step'} has an invalid time cap.`, nodePath);
      } else if (node.type === 'repeat') {
        if (!Number.isInteger(node.count) || node.count < 1 || node.count > 1000) add('INVALID_REPEAT', 'Repeat count must be an integer from 1 to 1000.', nodePath);
        if (!Array.isArray(node.children) || node.children.length === 0) add('EMPTY_REPEAT', 'Repeat block must contain at least one item.', nodePath);
        else walk(node.children, nodePath, depth + 1);
      } else if (node.type === 'section') {
        if (!String(node.label || '').trim()) add('MISSING_SECTION_NAME', 'Section name is required.', nodePath);
        if (!Array.isArray(node.children) || node.children.length === 0) add('EMPTY_SECTION', `${node.label || 'Section'} must contain at least one item.`, nodePath);
        else walk(node.children, nodePath, depth + 1);
      } else {
        add('UNKNOWN_NODE', `Unsupported custom routine item type: ${String(node.type)}.`, nodePath);
      }
    });
  };

  walk(nodes);
  return issues;
}

function customRuntimeId(nodeId, repeatPath) {
  const suffix = repeatPath.length ? repeatPath.map((r) => `${r.nodeId}:${r.current}`).join('/') : 'base';
  return `${nodeId}@${suffix}`;
}

export function buildCustomRoutine({ title = 'Custom Routine', nodes = [] } = {}) {
  const issues = validateCustomRoutine({ title, nodes });
  if (issues.length) {
    const error = new Error(issues.map((issue) => issue.message).join(' '));
    error.name = 'CustomRoutineValidationError';
    error.issues = issues;
    throw error;
  }

  const steps = [];
  const MAX_STEPS = 50000;
  const compileNodes = (children, context = { sectionPath: [], repeatPath: [] }) => {
    for (const node of children) {
      if (steps.length > MAX_STEPS) throw new Error('Custom routine expands to too many steps.');
      if (node.type === 'section') {
        compileNodes(node.children, {
          ...context,
          sectionPath: [...context.sectionPath, { id: node.id, label: node.label }]
        });
        continue;
      }
      if (node.type === 'repeat') {
        for (let r = 1; r <= node.count; r++) {
          compileNodes(node.children, {
            ...context,
            repeatPath: [...context.repeatPath, { nodeId: node.id, current: r, total: node.count }]
          });
        }
        continue;
      }

      const innerRound = context.repeatPath.at(-1);
      const common = {
        id: customRuntimeId(node.id, context.repeatPath),
        sourceNodeId: node.id,
        label: node.label,
        phase: PHASES.includes(node.phase) ? node.phase : 'custom',
        target: node.target,
        sectionPath: context.sectionPath,
        repeatPath: context.repeatPath,
        round: innerRound ? { current: innerRound.current, total: innerRound.total } : undefined
      };
      if (node.type === 'manual') {
        steps.push(step({ ...common, manual: true, timeCapMs: node.timeCapMs }));
      } else {
        steps.push(step({ ...common, durationMs: node.durationMs }));
      }
    }
  };

  compileNodes(nodes);
  if (steps.length > MAX_STEPS) throw new Error('Custom routine expands to too many steps.');
  return { kind: 'timeline', title: String(title || 'Custom Routine'), steps, meta: { mode: 'custom' } };
}

export function estimatePlanDuration(plan) {
  if (!plan) return undefined;
  if (plan.kind === 'timebox') return plan.durationMs;
  if (plan.kind === 'open') return plan.timeCapMs;
  let total = 0;
  for (const s of plan.steps || []) {
    if (s.manual && !s.timeCapMs) return undefined;
    total += s.manual ? s.timeCapMs : s.durationMs;
  }
  return total;
}

export function validatePlan(plan) {
  const errors = [];
  if (!plan || !['timeline', 'timebox', 'open'].includes(plan.kind)) errors.push('Unsupported timer plan.');
  if (plan?.kind === 'timeline') {
    if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push('This routine has no steps.');
    if (plan.steps?.length > 50000) errors.push('This routine expands to too many steps.');
    for (const s of plan.steps || []) {
      if (!s.manual && (!Number.isFinite(s.durationMs) || s.durationMs <= 0)) errors.push(`${s.label || 'Step'} has an invalid duration.`);
      if (s.manual && s.timeCapMs != null && (!Number.isFinite(s.timeCapMs) || s.timeCapMs <= 0)) errors.push(`${s.label || 'Manual step'} has an invalid time cap.`);
    }
  }
  if (plan?.kind === 'timebox' && (!Number.isFinite(plan.durationMs) || plan.durationMs <= 0)) errors.push('Timebox duration must be positive.');
  if (plan?.kind === 'open' && plan.timeCapMs != null && (!Number.isFinite(plan.timeCapMs) || plan.timeCapMs <= 0)) errors.push('Time cap must be positive.');
  return errors;
}

export class TimerEngine {
  constructor(clock = new BrowserClock()) {
    this.clock = clock;
    this.session = null;
    this.listeners = new Set();
    this.anchorWall = clock.wallNow();
    this.anchorMono = clock.monoNow();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(type, detail = {}) {
    if (!this.session) return;
    const event = {
      id: `${this.session.id}:evt:${++this.session.sequence}`,
      type,
      sessionId: this.session.id,
      observedAt: this.clock.wallNow(),
      ...detail
    };
    for (const fn of [...this.listeners]) fn(event, this.snapshot());
  }

  logicalNow() { return this.anchorWall + (this.clock.monoNow() - this.anchorMono); }
  rebaseToWall() { this.anchorWall = this.clock.wallNow(); this.anchorMono = this.clock.monoNow(); }

  start(plan, meta = {}) {
    const errors = validatePlan(plan);
    if (errors.length) throw new Error(errors.join(' '));
    const now = this.clock.wallNow();
    this.rebaseToWall();
    this.session = {
      id: uid('session'),
      status: 'running',
      plan: structuredClone(plan),
      meta: structuredClone(meta),
      data: structuredClone(meta.data || {}),
      currentIndex: plan.kind === 'timeline' ? 0 : undefined,
      startedAt: now,
      endedAt: undefined,
      pausedTotalMs: 0,
      sequence: 0,
      completionReason: undefined,
      currentStartedAt: now,
      currentEndsAt: undefined,
      currentManualResting: false,
      phaseTotals: makePhaseTotals(),
      segmentPhase: plan.kind === 'timeline' ? (plan.steps[0]?.phase || 'custom') : 'work',
      segmentStartedAt: now,
      sessionEndsAt: plan.kind === 'timebox' ? now + plan.durationMs : (plan.kind === 'open' && plan.timeCapMs ? now + plan.timeCapMs : undefined)
    };
    if (plan.kind === 'timeline') this.beginTimelineStep(now);
    this.emit('session-started');
    if (plan.kind === 'timeline') this.emit('step-started', { step: this.currentStep() });
    return this.snapshot();
  }

  currentStep() {
    if (this.session?.plan?.kind !== 'timeline') return undefined;
    return this.session.plan.steps[this.session.currentIndex];
  }

  beginTimelineStep(at) {
    const s = this.currentStep();
    if (!s) return;
    this.session.currentStartedAt = at;
    this.session.currentManualResting = false;
    this.session.segmentStartedAt = at;
    this.session.segmentPhase = PHASES.includes(s.phase) ? s.phase : 'custom';
    this.session.currentEndsAt = s.manual ? (s.timeCapMs ? at + s.timeCapMs : undefined) : at + s.durationMs;
  }

  snapshot() { return this.session ? structuredClone(this.session) : null; }

  static restore(snapshot, clock = new BrowserClock()) {
    const engine = new TimerEngine(clock);
    engine.session = structuredClone(snapshot);
    if (engine.session) {
      if (!engine.session.phaseTotals) {
        engine.session.phaseTotals = makePhaseTotals();
        if (engine.session.plan?.kind === 'timeline') {
          const completed = engine.session.plan.steps?.slice(0, engine.session.currentIndex || 0) || [];
          for (const item of completed) {
            const phase = PHASES.includes(item.phase) ? item.phase : 'custom';
            const duration = item.manual ? (item.timeCapMs || 0) : (item.durationMs || 0);
            engine.session.phaseTotals[phase] += Math.max(0, duration);
          }
        }
      }
      if (!engine.session.segmentPhase) {
        const current = engine.session.plan?.kind === 'timeline' ? engine.currentStep() : null;
        engine.session.segmentPhase = engine.session.currentManualResting ? 'rest' : (current?.phase || 'work');
      }
      if (!Number.isFinite(engine.session.segmentStartedAt)) {
        engine.session.segmentStartedAt = engine.session.currentStartedAt || engine.session.startedAt || clock.wallNow();
      }
    }
    engine.rebaseToWall();
    if (engine.session?.status === 'running') engine.reconcile();
    return engine;
  }

  recordSegment(at = this.logicalNow()) {
    const s = this.session;
    if (!s || !Number.isFinite(s.segmentStartedAt) || !Number.isFinite(at)) return;
    const end = Math.max(s.segmentStartedAt, at);
    const phase = PHASES.includes(s.segmentPhase) ? s.segmentPhase : 'custom';
    if (!s.phaseTotals) s.phaseTotals = makePhaseTotals();
    s.phaseTotals[phase] = (s.phaseTotals[phase] || 0) + Math.max(0, end - s.segmentStartedAt);
    s.segmentStartedAt = end;
  }

  reconcile() {
    const s = this.session;
    if (!s || s.status !== 'running') return this.view();
    const now = this.logicalNow();
    if (s.plan.kind === 'timeline') {
      let guard = 0;
      while (guard++ < 100000) {
        const cur = this.currentStep();
        if (!cur) return this.complete('finished');
        if (!s.currentEndsAt || now < s.currentEndsAt) break;
        const boundary = s.currentEndsAt;
        this.recordSegment(boundary);
        this.emit('step-completed', { step: cur, scheduledAt: boundary, delayed: now > boundary + 50 });
        s.currentIndex += 1;
        if (s.currentIndex >= s.plan.steps.length) return this.complete('finished', boundary);
        this.beginTimelineStep(boundary);
        this.emit('step-started', { step: this.currentStep(), scheduledAt: boundary, delayed: now > boundary + 50 });
        if (this.currentStep()?.manual && !s.currentEndsAt) break;
      }
      if (guard >= 100000) throw new Error('Timer reconciliation exceeded safety limit.');
    } else if (s.sessionEndsAt != null && now >= s.sessionEndsAt) {
      this.recordSegment(s.sessionEndsAt);
      return this.complete(s.plan.kind === 'open' ? 'time-cap' : 'finished', s.sessionEndsAt);
    }
    return this.view();
  }

  pause() {
    if (!this.session || this.session.status !== 'running') return false;
    this.reconcile();
    if (this.session.status !== 'running') return false;
    const now = this.logicalNow();
    this.recordSegment(now);
    this.session.status = 'paused';
    this.session.pausedAt = this.clock.wallNow();
    this.session.pauseState = {
      currentRemainingMs: this.session.currentEndsAt != null ? Math.max(0, this.session.currentEndsAt - now) : undefined,
      manualElapsedMs: this.session.plan.kind === 'timeline' ? Math.max(0, now - this.session.currentStartedAt) : undefined,
      sessionRemainingMs: this.session.sessionEndsAt != null ? Math.max(0, this.session.sessionEndsAt - now) : undefined
    };
    this.emit('session-paused');
    return true;
  }

  resume() {
    if (!this.session || this.session.status !== 'paused') return false;
    const nowWall = this.clock.wallNow();
    const pausedFor = Math.max(0, nowWall - (this.session.pausedAt || nowWall));
    this.session.pausedTotalMs += pausedFor;
    this.rebaseToWall();
    const now = this.logicalNow();
    if (this.session.pauseState?.currentRemainingMs != null) this.session.currentEndsAt = now + this.session.pauseState.currentRemainingMs;
    if (this.session.plan.kind === 'timeline' && this.session.pauseState?.manualElapsedMs != null) this.session.currentStartedAt = now - this.session.pauseState.manualElapsedMs;
    if (this.session.pauseState?.sessionRemainingMs != null) this.session.sessionEndsAt = now + this.session.pauseState.sessionRemainingMs;
    this.session.status = 'running';
    this.session.pausedAt = undefined;
    this.session.pauseState = undefined;
    this.session.segmentStartedAt = now;
    this.session.segmentPhase = this.session.currentManualResting ? 'rest' : (this.currentStep()?.phase || 'work');
    this.emit('session-resumed');
    return true;
  }

  next() {
    if (!this.session || this.session.status === 'completed' || this.session.status === 'cancelled' || this.session.plan.kind !== 'timeline') return false;
    if (this.session.status === 'paused') this.resume();
    const cur = this.currentStep();
    const now = this.logicalNow();
    this.recordSegment(now);
    this.emit(cur?.manual ? 'step-completed' : 'step-skipped', { step: cur });
    this.session.currentIndex += 1;
    if (this.session.currentIndex >= this.session.plan.steps.length) return this.complete('finished');
    this.beginTimelineStep(now);
    this.emit('step-started', { step: this.currentStep() });
    return true;
  }

  previous() {
    if (!this.session || this.session.plan.kind !== 'timeline' || this.session.currentIndex <= 0 || ['completed', 'cancelled'].includes(this.session.status)) return false;
    if (this.session.status === 'paused') this.resume();
    const now = this.logicalNow();
    this.recordSegment(now);
    this.session.currentIndex -= 1;
    this.beginTimelineStep(now);
    this.emit('step-started', { step: this.currentStep(), reason: 'previous' });
    return true;
  }

  restart() {
    if (!this.session || this.session.plan.kind !== 'timeline' || ['completed', 'cancelled'].includes(this.session.status)) return false;
    if (this.session.status === 'paused') this.resume();
    const now = this.logicalNow();
    this.recordSegment(now);
    this.beginTimelineStep(now);
    this.emit('step-restarted', { step: this.currentStep() });
    return true;
  }

  adjust(deltaMs) {
    if (!this.session || this.session.status !== 'running' || !Number.isFinite(deltaMs) || deltaMs === 0) return false;
    const now = this.logicalNow();
    if (this.session.plan.kind === 'timeline' && this.session.currentEndsAt != null) {
      this.session.currentEndsAt += deltaMs;
      this.emit('time-adjusted', { deltaMs, step: this.currentStep() });
      if (this.session.currentEndsAt <= now) this.reconcile();
      return true;
    }
    if (this.session.sessionEndsAt != null) {
      this.session.sessionEndsAt += deltaMs;
      this.emit('time-adjusted', { deltaMs });
      if (this.session.sessionEndsAt <= now) this.reconcile();
      return true;
    }
    return false;
  }

  completeManual() {
    const cur = this.currentStep();
    if (!this.session || this.session.status !== 'running' || !cur?.manual) return false;
    if (cur.completionBehavior === 'rest-until-deadline' && this.session.currentEndsAt != null) {
      if (this.session.currentManualResting) return false;
      const now = this.logicalNow();
      this.recordSegment(now);
      this.session.currentManualResting = true;
      this.session.segmentStartedAt = now;
      this.session.segmentPhase = 'rest';
      this.emit('manual-completed', { step: cur });
      return true;
    }
    return this.next();
  }

  setData(patch) {
    if (!this.session || !patch || typeof patch !== 'object') return false;
    this.session.data = { ...this.session.data, ...structuredClone(patch) };
    this.emit('session-data-changed', { data: this.session.data });
    return true;
  }

  addLap() {
    if (!this.session || this.session.plan.kind !== 'open' || this.session.status !== 'running') return false;
    const elapsed = this.elapsedMs();
    const laps = this.session.data.laps || [];
    const last = laps.at(-1)?.sessionElapsedMs || 0;
    laps.push({ index: laps.length + 1, sessionElapsedMs: elapsed, lapDurationMs: elapsed - last });
    this.session.data.laps = laps;
    this.emit('lap-recorded', { lap: laps.at(-1) });
    return true;
  }

  finish(reason = 'finished') {
    if (!this.session || ['completed', 'cancelled'].includes(this.session.status)) return false;
    const nowWall = this.clock.wallNow();
    if (this.session.status === 'running') {
      this.recordSegment(this.logicalNow());
    } else if (this.session.status === 'paused') {
      const pausedFor = Math.max(0, nowWall - (this.session.pausedAt || nowWall));
      this.session.pausedTotalMs += pausedFor;
      this.session.pausedAt = undefined;
      this.session.pauseState = undefined;
    }
    this.session.status = reason === 'cancelled' ? 'cancelled' : 'completed';
    this.session.completionReason = reason;
    this.session.endedAt = nowWall;
    this.emit(reason === 'cancelled' ? 'session-cancelled' : 'session-completed', { reason });
    return true;
  }

  complete(reason = 'finished', at) {
    if (!this.session || ['completed', 'cancelled'].includes(this.session.status)) return this.view();
    if (this.session.status === 'running') this.recordSegment(at ?? this.logicalNow());
    this.session.status = 'completed';
    this.session.completionReason = reason;
    this.session.endedAt = at ?? this.clock.wallNow();
    this.emit('session-completed', { reason });
    return this.view();
  }

  cancel() { return this.finish('cancelled'); }

  elapsedMs() {
    if (!this.session) return 0;
    const end = this.session.endedAt ?? (this.session.status === 'paused' ? this.session.pausedAt : this.logicalNow());
    return Math.max(0, end - this.session.startedAt - this.session.pausedTotalMs);
  }

  view() {
    const s = this.session;
    if (!s) return null;
    const now = s.status === 'paused' ? (s.pausedAt || this.clock.wallNow()) : this.logicalNow();
    const elapsed = this.elapsedMs();
    const view = {
      id: s.id,
      status: s.status,
      title: s.plan.title || s.meta?.title || 'Timer',
      planKind: s.plan.kind,
      mode: s.plan.meta?.mode || s.meta?.mode || 'generic',
      elapsedMs: elapsed,
      completionReason: s.completionReason,
      data: structuredClone(s.data || {}),
      current: undefined,
      next: undefined,
      sessionRemainingMs: s.sessionEndsAt != null ? Math.max(0, s.sessionEndsAt - now) : undefined
    };
    if (s.plan.kind === 'timeline') {
      const cur = this.currentStep();
      const next = s.plan.steps[s.currentIndex + 1];
      if (cur) {
        let remaining;
        if (s.status === 'paused' && s.pauseState?.currentRemainingMs != null) remaining = s.pauseState.currentRemainingMs;
        else if (s.currentEndsAt != null) remaining = Math.max(0, s.currentEndsAt - now);
        const effectivePhase = s.currentManualResting ? 'rest' : cur.phase;
        const effectiveLabel = s.currentManualResting ? 'Rest' : cur.label;
        const total = cur.manual ? cur.timeCapMs : cur.durationMs;
        const stepElapsed = total != null && remaining != null ? Math.max(0, total - remaining) : Math.max(0, now - s.currentStartedAt);
        view.current = {
          ...structuredClone(cur),
          label: effectiveLabel,
          phase: effectivePhase,
          remainingMs: remaining,
          elapsedMs: stepElapsed,
          progress: total ? clamp(stepElapsed / total, 0, 1) : undefined,
          restingUntilDeadline: s.currentManualResting
        };
      }
      if (next) view.next = structuredClone(next);
      view.stepIndex = s.currentIndex;
      view.stepCount = s.plan.steps.length;
    } else {
      const total = s.plan.kind === 'timebox' ? s.plan.durationMs : s.plan.timeCapMs;
      view.current = {
        label: s.plan.title || 'Timer',
        phase: 'work',
        remainingMs: view.sessionRemainingMs,
        elapsedMs: elapsed,
        progress: total ? clamp(elapsed / total, 0, 1) : undefined
      };
    }
    return view;
  }
}

export function formatClock(ms, { tenths = false, countUp = false } = {}) {
  ms = Math.max(0, Number(ms) || 0);
  if (!countUp && !tenths) ms = Math.ceil(ms / 1000) * 1000;
  const totalSeconds = countUp ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  if (tenths) return `${base}.${Math.floor((ms % 1000) / 100)}`;
  return base;
}

export function durationLabel(ms) {
  if (ms == null) return 'Varies';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}
