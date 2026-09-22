export const PERFORMANCE_BUDGETS = Object.freeze({
  interactionMs: 200,
  criticalCommandPreferredMs: 50,
  warmLaunchMs: 500,
  coldCachedLaunchMs: 1500,
  recentSessionsQueryMs: 250,
  compile1000StepsMs: 200,
  analytics10000SessionsMs: 1200,
  liveAnimationFrameMs: 34
});

const now = (perf) => Number(perf?.now?.() ?? Date.now());

export class PerformanceMetrics {
  constructor(perf = globalThis.performance) {
    this.perf = perf;
    this.marks = new Map();
    this.measures = new Map();
    this.counters = new Map();
  }

  mark(name) {
    const value = now(this.perf);
    this.marks.set(name, value);
    try { this.perf?.mark?.(name); } catch {}
    return value;
  }

  measure(name, startName, endName) {
    const start = this.marks.get(startName);
    const end = this.marks.get(endName) ?? now(this.perf);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return undefined;
    const duration = Math.max(0, end - start);
    this.measures.set(name, duration);
    try { this.perf?.measure?.(name, { start: startName, end: endName }); } catch {}
    return duration;
  }

  counter(name, delta = 1) {
    const value = (this.counters.get(name) || 0) + delta;
    this.counters.set(name, value);
    return value;
  }

  setCounter(name, value) {
    this.counters.set(name, Number(value) || 0);
  }

  snapshot() {
    return {
      measures: Object.fromEntries(this.measures),
      counters: Object.fromEntries(this.counters)
    };
  }
}

export function reduceMotionEnabled(setting = 'system', matchMediaFn = globalThis.matchMedia?.bind(globalThis)) {
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  try { return Boolean(matchMediaFn?.('(prefers-reduced-motion: reduce)')?.matches); }
  catch { return false; }
}

export function liveSchedulerPolicy({
  visible = true,
  status = 'running',
  mode = 'generic',
  layout = 'focus',
  progressKnown = false,
  reducedMotion = false
} = {}) {
  if (!visible || status !== 'running') return { kind: 'idle', intervalMs: 0, minFrameMs: 0 };
  if (mode === 'stopwatch') return { kind: 'timeout', intervalMs: 100, minFrameMs: 0 };
  if (layout === 'wall' || reducedMotion || !progressKnown) return { kind: 'timeout', intervalMs: 250, minFrameMs: 0 };
  return { kind: 'animation', intervalMs: 0, minFrameMs: PERFORMANCE_BUDGETS.liveAnimationFrameMs };
}

const defaultSchedule = (fn, delay) => setTimeout(fn, delay);
const defaultCancel = (id) => clearTimeout(id);

export class MaintenanceCoordinator {
  constructor({ schedule = defaultSchedule, cancel = defaultCancel, requestIdle = globalThis.requestIdleCallback?.bind(globalThis) } = {}) {
    this.schedule = schedule;
    this.cancel = cancel;
    this.requestIdle = requestIdle;
    this.queue = [];
    this.suspensions = new Set();
    this.running = false;
    this.timer = null;
  }

  suspend(reason = 'busy') {
    this.suspensions.add(reason);
    if (this.timer != null) { this.cancel(this.timer); this.timer = null; }
  }

  resume(reason = 'busy') {
    this.suspensions.delete(reason);
    this.pump();
  }

  enqueue(id, task, { priority = 'idle', delay = 0 } = {}) {
    if (typeof task !== 'function') return;
    const existing = this.queue.findIndex((item) => item.id === id);
    if (existing >= 0) this.queue.splice(existing, 1);
    this.queue.push({ id, task, priority, delay: Math.max(0, Number(delay) || 0) });
    this.queue.sort((a, b) => (a.priority === 'soon' ? 0 : 1) - (b.priority === 'soon' ? 0 : 1));
    this.pump();
  }

  pending() { return this.queue.length + (this.running ? 1 : 0); }

  pump() {
    if (this.running || this.suspensions.size || !this.queue.length || this.timer != null) return;
    const item = this.queue.shift();
    const run = async () => {
      this.timer = null;
      if (this.suspensions.size) { this.queue.unshift(item); return this.pump(); }
      this.running = true;
      try { await item.task(); } catch {}
      finally { this.running = false; this.pump(); }
    };
    if (item.priority === 'idle' && this.requestIdle && item.delay === 0) {
      try { this.requestIdle(() => run(), { timeout: 2000 }); return; } catch {}
    }
    this.timer = this.schedule(run, item.delay);
  }
}
