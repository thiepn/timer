export const QUEUE_SCHEMA_VERSION = 1;
export const QUEUE_STEP_ACTIONS = Object.freeze({
  ADVANCE: 'advance',
  OVERTIME: 'overtime',
  REPEAT: 'repeat',
  STOP: 'stop'
});
const STEP_ACTION_VALUES = new Set(Object.values(QUEUE_STEP_ACTIONS));

const uid = (prefix = 'queue') => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;

function cleanText(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeQueueStepAction(value) {
  const action = String(value || QUEUE_STEP_ACTIONS.ADVANCE).toLowerCase();
  return STEP_ACTION_VALUES.has(action) ? action : QUEUE_STEP_ACTIONS.ADVANCE;
}

export function normalizeQueueItem(item = {}, { index = 0 } = {}) {
  const savedTimerId = cleanText(item.savedTimerId || item.routineId, 160);
  return {
    id: cleanText(item.id, 160) || uid('queue_item'),
    savedTimerId,
    title: cleanText(item.title, 120),
    action: normalizeQueueStepAction(item.action),
    order: Math.max(0, Math.floor(Number(item.order) || index + 1))
  };
}

export function normalizeQueuePreset(queue = {}) {
  const items = (Array.isArray(queue.items) ? queue.items : [])
    .map((item, index) => normalizeQueueItem(item, { index }))
    .filter((item) => item.savedTimerId)
    .slice(0, 250)
    .map((item, index) => ({ ...item, order: index + 1 }));
  return {
    ...queue,
    queueSchemaVersion: QUEUE_SCHEMA_VERSION,
    title: cleanText(queue.title, 120) || 'Timer Queue',
    description: cleanText(queue.description, 500),
    loop: Boolean(queue.loop),
    favorite: Boolean(queue.favorite),
    items
  };
}

export function queuePresetFromTimerIds(timerIds = [], { id = uid('queue'), title = 'Timer Queue', loop = false } = {}) {
  const seen = new Set();
  const items = [];
  for (const raw of timerIds || []) {
    const timerId = cleanText(raw, 160);
    if (!timerId || seen.has(timerId)) continue;
    seen.add(timerId);
    items.push(normalizeQueueItem({ savedTimerId: timerId }, { index: items.length }));
  }
  return normalizeQueuePreset({ id, title, loop, items });
}

export function createQueueRun(queue, { id = uid('queue_run'), now = Date.now() } = {}) {
  const preset = normalizeQueuePreset(queue);
  if (!preset.items.length) throw new Error('Queue needs at least one Saved Timer.');
  return {
    id,
    queueId: preset.id || '',
    queueSchemaVersion: QUEUE_SCHEMA_VERSION,
    title: preset.title,
    items: structuredClone(preset.items),
    loop: Boolean(preset.loop),
    status: 'running',
    currentIndex: 0,
    cycle: 1,
    completedSteps: 0,
    skippedSteps: 0,
    currentRuntimeId: '',
    startedAt: now,
    updatedAt: now
  };
}

export function normalizeQueueRun(run = {}) {
  const items = (Array.isArray(run.items) ? run.items : [])
    .map((item, index) => normalizeQueueItem(item, { index }))
    .filter((item) => item.savedTimerId)
    .map((item, index) => ({ ...item, order: index + 1 }));
  const maxIndex = Math.max(0, items.length - 1);
  return {
    ...run,
    queueSchemaVersion: QUEUE_SCHEMA_VERSION,
    title: cleanText(run.title, 120) || 'Timer Queue',
    items,
    loop: Boolean(run.loop),
    status: ['running','paused','completed','stopped'].includes(run.status) ? run.status : 'running',
    currentIndex: items.length ? Math.max(0, Math.min(maxIndex, Math.floor(Number(run.currentIndex) || 0))) : 0,
    cycle: Math.max(1, Math.floor(Number(run.cycle) || 1)),
    completedSteps: Math.max(0, Math.floor(Number(run.completedSteps) || 0)),
    skippedSteps: Math.max(0, Math.floor(Number(run.skippedSteps) || 0)),
    currentRuntimeId: cleanText(run.currentRuntimeId, 160)
  };
}

export function queueCurrentItem(run = {}) {
  const normalized = normalizeQueueRun(run);
  return normalized.items[normalized.currentIndex] || null;
}

export function queueProgress(run = {}) {
  const normalized = normalizeQueueRun(run);
  const total = normalized.items.length;
  const current = total ? normalized.currentIndex + 1 : 0;
  const completedInCycle = total ? Math.min(total, normalized.currentIndex) : 0;
  return {
    current,
    total,
    cycle: normalized.cycle,
    completedSteps: normalized.completedSteps,
    skippedSteps: normalized.skippedSteps,
    completedInCycle,
    percent: total ? completedInCycle / total : 0
  };
}

export function advanceQueueRun(run, { skipped = false, now = Date.now() } = {}) {
  const next = normalizeQueueRun(structuredClone(run));
  if (!next.items.length || ['completed','stopped'].includes(next.status)) return { run: next, finished: true, looped: false };
  if (skipped) next.skippedSteps += 1;
  else next.completedSteps += 1;
  next.currentRuntimeId = '';
  let looped = false;
  if (next.currentIndex + 1 < next.items.length) {
    next.currentIndex += 1;
    next.status = 'running';
  } else if (next.loop) {
    next.currentIndex = 0;
    next.cycle += 1;
    next.status = 'running';
    looped = true;
  } else {
    next.status = 'completed';
  }
  next.updatedAt = now;
  return { run: next, finished: next.status === 'completed', looped };
}

export function reorderQueueItems(items = [], fromIndex, toIndex) {
  const list = items.map((item, index) => normalizeQueueItem(item, { index }));
  const from = Math.max(0, Math.min(list.length - 1, Math.floor(Number(fromIndex))));
  const to = Math.max(0, Math.min(list.length - 1, Math.floor(Number(toIndex))));
  if (!list.length || !Number.isFinite(from) || !Number.isFinite(to) || from === to) return list.map((item,index)=>({ ...item, order:index+1 }));
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list.map((row, index) => ({ ...row, order: index + 1 }));
}
