export const QUEUE_SCHEMA_VERSION = 1;
export const QUEUE_STEP_ACTIONS = Object.freeze({ ADVANCE:'advance', OVERTIME:'overtime', REPEAT:'repeat', STOP:'stop' });
const ACTIONS = new Set(Object.values(QUEUE_STEP_ACTIONS));
const uid = (p='queue') => `${p}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
const text = (v='', n=160) => String(v ?? '').trim().slice(0,n);

export function normalizeQueueStepAction(v) {
  v = String(v || QUEUE_STEP_ACTIONS.ADVANCE).toLowerCase();
  return ACTIONS.has(v) ? v : QUEUE_STEP_ACTIONS.ADVANCE;
}

export function normalizeQueueItem(item={}, { index=0 }={}) {
  return {
    id: text(item.id) || uid('queue_item'),
    savedTimerId: text(item.savedTimerId || item.routineId),
    title: text(item.title,120),
    action: normalizeQueueStepAction(item.action),
    order: Math.max(0, Math.floor(Number(item.order) || index + 1))
  };
}

export function normalizeQueuePreset(queue={}) {
  const items = (Array.isArray(queue.items) ? queue.items : [])
    .map((item,index)=>normalizeQueueItem(item,{index}))
    .filter(item=>item.savedTimerId).slice(0,250)
    .map((item,index)=>({ ...item, order:index+1 }));
  return {
    ...queue, queueSchemaVersion:QUEUE_SCHEMA_VERSION,
    title:text(queue.title,120) || 'Timer Queue',
    description:text(queue.description,500),
    loop:Boolean(queue.loop), favorite:Boolean(queue.favorite), items
  };
}

export function queuePresetFromTimerIds(timerIds=[], { id=uid('queue'), title='Timer Queue', loop=false }={}) {
  const seen = new Set();
  const items = [];
  for (const raw of timerIds || []) {
    const savedTimerId = text(raw);
    if (!savedTimerId || seen.has(savedTimerId)) continue;
    seen.add(savedTimerId);
    items.push(normalizeQueueItem({ savedTimerId }, { index:items.length }));
  }
  return normalizeQueuePreset({ id,title,loop,items });
}

export function createQueueRun(queue, { id=uid('queue_run'), now=Date.now() }={}) {
  const q = normalizeQueuePreset(queue);
  if (!q.items.length) throw new Error('Queue needs at least one Saved Timer.');
  return {
    id, queueId:q.id || '', queueSchemaVersion:QUEUE_SCHEMA_VERSION, title:q.title,
    items:structuredClone(q.items), loop:q.loop, status:'running', currentIndex:0, cycle:1,
    completedSteps:0, skippedSteps:0, currentRuntimeId:'', startedAt:now, updatedAt:now
  };
}

export function normalizeQueueRun(run={}) {
  const items = (Array.isArray(run.items) ? run.items : [])
    .map((item,index)=>normalizeQueueItem(item,{index}))
    .filter(item=>item.savedTimerId)
    .map((item,index)=>({ ...item, order:index+1 }));
  return {
    ...run, queueSchemaVersion:QUEUE_SCHEMA_VERSION, title:text(run.title,120) || 'Timer Queue', items,
    loop:Boolean(run.loop),
    status:['running','paused','completed','stopped'].includes(run.status) ? run.status : 'running',
    currentIndex:items.length ? Math.max(0,Math.min(items.length-1,Math.floor(Number(run.currentIndex)||0))) : 0,
    cycle:Math.max(1,Math.floor(Number(run.cycle)||1)),
    completedSteps:Math.max(0,Math.floor(Number(run.completedSteps)||0)),
    skippedSteps:Math.max(0,Math.floor(Number(run.skippedSteps)||0)),
    currentRuntimeId:text(run.currentRuntimeId)
  };
}

export function queueCurrentItem(run={}) {
  const r = normalizeQueueRun(run);
  return r.items[r.currentIndex] || null;
}

export function queueProgress(run={}) {
  const r = normalizeQueueRun(run), total = r.items.length;
  const completedInCycle = total ? Math.min(total,r.currentIndex) : 0;
  return {
    current:total ? r.currentIndex+1 : 0, total, cycle:r.cycle,
    completedSteps:r.completedSteps, skippedSteps:r.skippedSteps,
    completedInCycle, percent:total ? completedInCycle/total : 0
  };
}

export function advanceQueueRun(run, { skipped=false, now=Date.now() }={}) {
  const r = normalizeQueueRun(structuredClone(run));
  if (!r.items.length || ['completed','stopped'].includes(r.status)) return { run:r, finished:true, looped:false };
  skipped ? r.skippedSteps++ : r.completedSteps++;
  r.currentRuntimeId = '';
  let looped = false;
  if (r.currentIndex + 1 < r.items.length) r.currentIndex++;
  else if (r.loop) { r.currentIndex=0; r.cycle++; looped=true; }
  else r.status='completed';
  if (r.status !== 'completed') r.status='running';
  r.updatedAt=now;
  return { run:r, finished:r.status==='completed', looped };
}

export function reorderQueueItems(items=[], fromIndex, toIndex) {
  const list = items.map((item,index)=>normalizeQueueItem(item,{index}));
  if (!list.length) return list;
  const clamp = n => Math.max(0,Math.min(list.length-1,Math.floor(Number(n)||0)));
  const from=clamp(fromIndex), to=clamp(toIndex);
  if (from!==to) { const [item]=list.splice(from,1); list.splice(to,0,item); }
  return list.map((item,index)=>({ ...item, order:index+1 }));
}
