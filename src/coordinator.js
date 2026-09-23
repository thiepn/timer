import { BrowserClock, TimerEngine } from './core.js';

export const COMPLETION_ACTIONS = Object.freeze({
  STOP: 'stop',
  OVERTIME: 'overtime',
  REPEAT: 'repeat',
  START_NEXT: 'start-next'
});

const ACTION_VALUES = new Set(Object.values(COMPLETION_ACTIONS));
const uid = (prefix = 'timer') => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;

export function normalizeCompletionAction(value) {
  const action = String(value || COMPLETION_ACTIONS.STOP).toLowerCase();
  return ACTION_VALUES.has(action) ? action : COMPLETION_ACTIONS.STOP;
}

export class TimerCoordinator {
  constructor({ clockFactory = () => new BrowserClock(), runtimeIdFactory = () => uid('timer') } = {}) {
    this.clockFactory = clockFactory;
    this.runtimeIdFactory = runtimeIdFactory;
    this.runtimes = new Map();
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(type, detail = {}) {
    const event = { type, observedAt: Date.now(), ...detail };
    for (const listener of [...this.listeners]) listener(event);
    return event;
  }

  size() { return this.runtimes.size; }
  has(runtimeId) { return this.runtimes.has(runtimeId); }
  get(runtimeId) { return this.runtimes.get(runtimeId); }
  list() {
    return [...this.runtimes.values()].sort((a, b) => {
      const order = (Number(a.order) || 0) - (Number(b.order) || 0);
      if (order) return order;
      return (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    });
  }

  _runtimeRecord(runtime) {
    return {
      id: runtime.id,
      snapshot: runtime.engine.snapshot(),
      meta: structuredClone(runtime.meta || {}),
      completionAction: runtime.completionAction,
      cycle: runtime.cycle,
      order: Number(runtime.order) || 0,
      createdAt: runtime.createdAt,
      updatedAt: Date.now(),
      overtime: runtime.overtime ? {
        startedAt: runtime.overtime.startedAt,
        accumulatedMs: this._overtimeElapsed(runtime),
        checkpointWallAt: runtime.engine.clock.wallNow(),
        paused: Boolean(runtime.overtime.paused)
      } : undefined
    };
  }

  snapshot(runtimeId) {
    const runtime = this.get(runtimeId);
    return runtime ? structuredClone(this._runtimeRecord(runtime)) : null;
  }

  snapshots() { return this.list().map((runtime) => structuredClone(this._runtimeRecord(runtime))); }

  _attach(runtime) {
    runtime.unsubscribe?.();
    runtime.unsubscribe = runtime.engine.subscribe((engineEvent, snapshot) => {
      this.emit('engine-event', { runtimeId: runtime.id, engineEvent, snapshot, runtime: this._runtimeRecord(runtime) });
      if (engineEvent.type === 'session-completed') this._handleCompletion(runtime, snapshot, engineEvent);
      else if (engineEvent.type === 'session-cancelled') this.emit('runtime-terminal', { runtimeId: runtime.id, snapshot, cancelled: true, action: COMPLETION_ACTIONS.STOP });
    });
  }

  start(plan, meta = {}, options = {}) {
    const runtimeId = options.runtimeId || this.runtimeIdFactory();
    if (this.runtimes.has(runtimeId)) throw new Error(`Timer runtime ${runtimeId} already exists.`);
    const engine = new TimerEngine(options.clock || this.clockFactory());
    const runtime = {
      id: runtimeId,
      engine,
      meta: structuredClone(meta || {}),
      plan: structuredClone(plan),
      completionAction: normalizeCompletionAction(options.completionAction ?? meta?.completionAction),
      cycle: Math.max(1, Number(options.cycle) || 1),
      order: Number.isFinite(Number(options.order)) ? Number(options.order) : (this.list().reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1),
      createdAt: Number(options.createdAt) || Date.now(),
      overtime: null,
      unsubscribe: null
    };
    this.runtimes.set(runtimeId, runtime);
    this._attach(runtime);
    engine.start(plan, meta);
    this.emit('runtime-started', { runtimeId, runtime: this._runtimeRecord(runtime) });
    return runtime;
  }

  restore(records = []) {
    const restored = [];
    const orderedRecords = [...(records || [])].sort((a, b) => {
      const ao = Number(a?.order);
      const bo = Number(b?.order);
      const aHas = Number.isFinite(ao);
      const bHas = Number.isFinite(bo);
      if (aHas && bHas && ao !== bo) return ao - bo;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return (Number(a?.createdAt) || Number(a?.snapshot?.startedAt) || 0) - (Number(b?.createdAt) || Number(b?.snapshot?.startedAt) || 0);
    });
    for (const record of orderedRecords) {
      if (!record?.snapshot || (!record.overtime && ['completed', 'cancelled'].includes(record.snapshot.status))) continue;
      const runtimeId = record.id || record.runtimeId || this.runtimeIdFactory();
      if (this.runtimes.has(runtimeId)) continue;
      const engine = TimerEngine.restore(record.snapshot, this.clockFactory());
      const runtime = {
        id: runtimeId,
        engine,
        meta: structuredClone(record.meta || record.snapshot.meta || {}),
        plan: structuredClone(record.snapshot.plan),
        completionAction: normalizeCompletionAction(record.completionAction ?? record.meta?.completionAction),
        cycle: Math.max(1, Number(record.cycle) || 1),
        order: Number.isFinite(Number(record.order)) ? Number(record.order) : restored.length + 1,
        createdAt: Number(record.createdAt) || Number(record.snapshot.startedAt) || Date.now(),
        overtime: null,
        unsubscribe: null
      };
      if (record.overtime) {
        const startedAt = Number(record.overtime.startedAt) || engine.clock.wallNow();
        const paused = Boolean(record.overtime.paused);
        const persistedElapsed = Math.max(0, Number(record.overtime.accumulatedMs) || 0);
        const checkpointWallAt = Number(record.overtime.checkpointWallAt);
        const fallbackWallAt = Number(record.updatedAt);
        const wallAt = Number.isFinite(checkpointWallAt) ? checkpointWallAt : Number.isFinite(fallbackWallAt) ? fallbackWallAt : startedAt;
        const wallElapsed = paused ? persistedElapsed : persistedElapsed + Math.max(0, engine.clock.wallNow() - wallAt);
        runtime.overtime = {
          startedAt,
          accumulatedMs: wallElapsed,
          startedMonoAt: engine.clock.monoNow(),
          paused
        };
      }
      this.runtimes.set(runtimeId, runtime);
      this._attach(runtime);
      restored.push(runtime);
      this.emit('runtime-restored', { runtimeId, runtime: this._runtimeRecord(runtime) });
      if (!runtime.overtime && ['completed', 'cancelled'].includes(engine.view()?.status)) {
        queueMicrotask(() => {
          if (!this.runtimes.has(runtimeId)) return;
          if (engine.view()?.status === 'cancelled') this.emit('runtime-terminal', { runtimeId, snapshot: engine.snapshot(), cancelled: true, action: COMPLETION_ACTIONS.STOP });
          else this._handleCompletion(runtime, engine.snapshot(), { scheduledAt: engine.snapshot()?.endedAt });
        });
      }
    }
    return restored;
  }

  _handleCompletion(runtime, snapshot, engineEvent) {
    const action = runtime.completionAction;
    if (action === COMPLETION_ACTIONS.OVERTIME) {
      const startedAt = Number(engineEvent?.scheduledAt) || Number(snapshot.endedAt) || runtime.engine.clock.wallNow();
      runtime.overtime = {
        startedAt,
        accumulatedMs: 0,
        startedMonoAt: runtime.engine.clock.monoNow(),
        paused: false
      };
      this.emit('overtime-started', { runtimeId: runtime.id, snapshot, runtime: this._runtimeRecord(runtime) });
      return;
    }
    if (action === COMPLETION_ACTIONS.REPEAT) {
      const completedSnapshot = structuredClone(snapshot);
      this.emit('cycle-completed', { runtimeId: runtime.id, snapshot: completedSnapshot, cycle: runtime.cycle, action });
      runtime.unsubscribe?.();
      runtime.cycle += 1;
      runtime.overtime = null;
      runtime.engine = new TimerEngine(this.clockFactory());
      this._attach(runtime);
      runtime.engine.start(structuredClone(runtime.plan), structuredClone(runtime.meta));
      this.emit('cycle-restarted', { runtimeId: runtime.id, cycle: runtime.cycle, runtime: this._runtimeRecord(runtime) });
      return;
    }
    this.emit('runtime-terminal', {
      runtimeId: runtime.id,
      snapshot,
      cancelled: false,
      action,
      startNext: action === COMPLETION_ACTIONS.START_NEXT
    });
  }

  _overtimeElapsed(runtime) {
    const overtime = runtime?.overtime;
    if (!overtime) return 0;
    if (overtime.paused) return Math.max(0, Number(overtime.accumulatedMs) || 0);
    const mono = runtime.engine.clock.monoNow();
    const base = Math.max(0, Number(overtime.accumulatedMs) || 0);
    const startedMono = Number.isFinite(overtime.startedMonoAt) ? overtime.startedMonoAt : mono;
    return base + Math.max(0, mono - startedMono);
  }

  view(runtimeId) {
    const runtime = this.get(runtimeId);
    if (!runtime) return null;
    const base = runtime.engine.view();
    if (!runtime.overtime) return base ? { ...base, runtimeId, cycle: runtime.cycle, completionAction: runtime.completionAction } : null;
    const overtimeMs = this._overtimeElapsed(runtime);
    return {
      ...(base || {}),
      runtimeId,
      cycle: runtime.cycle,
      completionAction: runtime.completionAction,
      status: runtime.overtime.paused ? 'paused' : 'overtime',
      overtimeMs,
      current: {
        ...(base?.current || {}),
        label: base?.title || runtime.meta?.title || 'Timer',
        phase: 'custom',
        remainingMs: undefined,
        elapsedMs: overtimeMs,
        progress: undefined
      }
    };
  }

  pause(runtimeId) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    if (runtime.overtime) {
      if (runtime.overtime.paused) return false;
      runtime.overtime.accumulatedMs = this._overtimeElapsed(runtime);
      runtime.overtime.paused = true;
      this.emit('overtime-paused', { runtimeId, runtime: this._runtimeRecord(runtime) });
      return true;
    }
    return runtime.engine.pause();
  }

  resume(runtimeId) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    if (runtime.overtime) {
      if (!runtime.overtime.paused) return false;
      runtime.overtime.paused = false;
      runtime.overtime.startedMonoAt = runtime.engine.clock.monoNow();
      this.emit('overtime-resumed', { runtimeId, runtime: this._runtimeRecord(runtime) });
      return true;
    }
    return runtime.engine.resume();
  }

  togglePause(runtimeId) {
    const view = this.view(runtimeId);
    if (!view) return false;
    return view.status === 'paused' ? this.resume(runtimeId) : this.pause(runtimeId);
  }

  command(runtimeId, command, value) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    if (command === 'pause') return this.pause(runtimeId);
    if (command === 'resume') return this.resume(runtimeId);
    if (command === 'toggle-pause') return this.togglePause(runtimeId);
    if (command === 'stop') return this.finish(runtimeId, typeof value === 'string' ? value : 'user-ended', COMPLETION_ACTIONS.STOP);
    if (runtime.overtime) {
      if (command === 'finish' || command === 'cancel') return this.finish(runtimeId, command === 'cancel' ? 'cancelled' : 'overtime-finished');
      return false;
    }
    if (command === 'next') return runtime.engine.next();
    if (command === 'previous') return runtime.engine.previous();
    if (command === 'restart') return runtime.engine.restart();
    if (command === 'adjust') return runtime.engine.adjust(Number(value));
    if (command === 'manual') return runtime.engine.completeManual();
    if (command === 'lap') return runtime.engine.addLap();
    if (command === 'data') return runtime.engine.setData(value);
    if (command === 'finish') return runtime.engine.finish(typeof value === 'string' ? value : 'finished');
    if (command === 'cancel') return runtime.engine.cancel();
    return false;
  }

  finish(runtimeId, reason = 'finished', actionOverride = null) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    if (actionOverride) runtime.completionAction = normalizeCompletionAction(actionOverride);
    if (!runtime.overtime) return runtime.engine.finish(reason);
    const overtimeMs = this._overtimeElapsed(runtime);
    const snapshot = runtime.engine.snapshot();
    snapshot.status = reason === 'cancelled' ? 'cancelled' : 'completed';
    snapshot.completionReason = reason;
    snapshot.overtimeMs = overtimeMs;
    snapshot.finalElapsedMs = Math.max(0, Number(snapshot.finalElapsedMs) || 0) + overtimeMs;
    snapshot.endedAt = runtime.engine.clock.wallNow();
    this.emit('runtime-terminal', { runtimeId, snapshot, cancelled: reason === 'cancelled', action: actionOverride ? normalizeCompletionAction(actionOverride) : COMPLETION_ACTIONS.OVERTIME });
    return true;
  }

  updateRuntime(runtimeId, { meta = null, completionAction, order } = {}) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    if (meta && typeof meta === 'object') runtime.meta = { ...(runtime.meta || {}), ...structuredClone(meta) };
    if (completionAction !== undefined) runtime.completionAction = normalizeCompletionAction(completionAction);
    if (Number.isFinite(Number(order))) runtime.order = Number(order);
    this.emit('runtime-updated', { runtimeId, runtime: this._runtimeRecord(runtime) });
    return true;
  }

  reorder(runtimeIds = []) {
    const seen = new Set();
    const ordered = [];
    for (const id of runtimeIds || []) {
      const runtime = this.get(id);
      if (!runtime || seen.has(id)) continue;
      seen.add(id);
      ordered.push(runtime);
    }
    for (const runtime of this.list()) if (!seen.has(runtime.id)) ordered.push(runtime);
    ordered.forEach((runtime, index) => { runtime.order = index + 1; });
    this.runtimes = new Map(ordered.map((runtime) => [runtime.id, runtime]));
    this.emit('workspace-reordered', { runtimeIds: ordered.map((runtime) => runtime.id) });
    return ordered.map((runtime) => runtime.id);
  }

  move(runtimeId, delta = 0) {
    const ids = this.list().map((runtime) => runtime.id);
    const from = ids.indexOf(runtimeId);
    if (from < 0) return false;
    const to = Math.max(0, Math.min(ids.length - 1, from + Math.trunc(Number(delta) || 0)));
    if (to === from) return false;
    ids.splice(from, 1);
    ids.splice(to, 0, runtimeId);
    this.reorder(ids);
    return true;
  }

  pauseAll() {
    let changed = 0;
    for (const runtime of this.list()) if (this.pause(runtime.id)) changed += 1;
    return changed;
  }

  resumeAll() {
    let changed = 0;
    for (const runtime of this.list()) if (this.resume(runtime.id)) changed += 1;
    return changed;
  }

  reconcile(runtimeId) {
    const runtime = this.get(runtimeId);
    if (!runtime || runtime.overtime) return this.view(runtimeId);
    runtime.engine.reconcile();
    return this.view(runtimeId);
  }

  reconcileAll() {
    for (const runtime of this.list()) if (!runtime.overtime) runtime.engine.reconcile();
    return this.list().map((runtime) => this.view(runtime.id));
  }

  remove(runtimeId) {
    const runtime = this.get(runtimeId);
    if (!runtime) return false;
    runtime.unsubscribe?.();
    this.runtimes.delete(runtimeId);
    this.emit('runtime-removed', { runtimeId });
    return true;
  }

  clear() {
    for (const id of [...this.runtimes.keys()]) this.remove(id);
  }
}
