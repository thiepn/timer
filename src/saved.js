export const SAVED_TIMER_SCHEMA_VERSION = 2;

export const DEFAULT_SAVED_TIMER_COLLECTIONS = Object.freeze([
  'Cooking',
  'Study',
  'Workout',
  'Church',
  'Music'
]);

export const SAVED_TIMER_ACCENTS = Object.freeze([
  'default',
  'blue',
  'green',
  'red',
  'purple',
  'orange',
  'teal',
  'pink'
]);

const DEFAULT_ICONS = Object.freeze({
  countdown: '⏳',
  stopwatch: '⏱',
  interval: '↔',
  tabata: '⚡',
  circuit: '◫',
  emom: '◷',
  amrap: '∞',
  'for-time': '◎',
  boxing: '◉',
  'run-walk': '⇄',
  ladder: '↗',
  pyramid: '△',
  custom: '≋'
});

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function defaultSavedTimerIcon(type) {
  return DEFAULT_ICONS[type] || '◷';
}

export function normalizeSavedTimerTags(values, { limit = 12 } = {}) {
  const source = Array.isArray(values) ? values : String(values ?? '').split(',');
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const tag = cleanText(raw, 28).replace(/^#+/, '');
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeSavedTimerCollections(values, { includeDefaults = false, limit = 40 } = {}) {
  const source = [
    ...(includeDefaults ? DEFAULT_SAVED_TIMER_COLLECTIONS : []),
    ...(Array.isArray(values) ? values : [])
  ];
  const out = [];
  const seen = new Set();
  for (const raw of source) {
    const name = cleanText(raw, 40);
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= limit) break;
  }
  return out;
}

export function normalizeSavedTimerRecord(record = {}) {
  const type = cleanText(record.type, 40) || 'interval';
  const accent = SAVED_TIMER_ACCENTS.includes(record.accent) ? record.accent : 'default';
  const icon = cleanText(record.icon, 8) || defaultSavedTimerIcon(type);
  return {
    ...record,
    savedTimerSchemaVersion: SAVED_TIMER_SCHEMA_VERSION,
    favorite: Boolean(record.favorite),
    pinned: Boolean(record.pinned),
    archived: Boolean(record.archived),
    icon,
    accent,
    description: cleanText(record.description, 500),
    collection: cleanText(record.collection, 40),
    tags: normalizeSavedTimerTags(record.tags),
    useCount: Math.max(0, Math.floor(Number(record.useCount) || 0))
  };
}

export function needsSavedTimerMigration(record = {}) {
  if (Number(record.savedTimerSchemaVersion) !== SAVED_TIMER_SCHEMA_VERSION) return true;
  if (!Array.isArray(record.tags)) return true;
  if (typeof record.pinned !== 'boolean' || typeof record.archived !== 'boolean') return true;
  if (typeof record.description !== 'string' || typeof record.collection !== 'string') return true;
  if (!record.icon || !SAVED_TIMER_ACCENTS.includes(record.accent || 'default')) return true;
  return false;
}

export function savedTimerSearchText(record = {}, typeName = '', summary = '') {
  const normalized = normalizeSavedTimerRecord(record);
  return [
    normalized.title,
    typeName,
    summary,
    normalized.description,
    normalized.collection,
    ...normalized.tags
  ].filter(Boolean).join(' ').toLocaleLowerCase();
}

export function savedTimerMatchesView(record = {}, view = 'all') {
  const r = normalizeSavedTimerRecord(record);
  if (view === 'archived') return r.archived;
  if (r.archived) return false;
  if (view === 'pinned') return r.pinned;
  if (view === 'favorites') return r.favorite;
  if (String(view).startsWith('collection:')) {
    const wanted = String(view).slice('collection:'.length).toLocaleLowerCase();
    return r.collection.toLocaleLowerCase() === wanted;
  }
  return true;
}

export function sortSavedTimers(records = [], mode = 'recent', durationOf = () => null) {
  const rows = [...records];
  const alpha = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), undefined, { sensitivity: 'base', numeric: true });
  rows.sort((a, b) => {
    if (mode === 'most-used') {
      const used = (Number(b.useCount) || 0) - (Number(a.useCount) || 0);
      if (used) return used;
      const recent = (Number(b.lastUsedAt) || 0) - (Number(a.lastUsedAt) || 0);
      return recent || alpha(a, b);
    }
    if (mode === 'alphabetical') return alpha(a, b);
    if (mode === 'duration') {
      const da = Number(durationOf(a));
      const db = Number(durationOf(b));
      const aFinite = Number.isFinite(da) && da >= 0;
      const bFinite = Number.isFinite(db) && db >= 0;
      if (aFinite && bFinite && da !== db) return da - db;
      if (aFinite !== bFinite) return aFinite ? -1 : 1;
      return alpha(a, b);
    }
    const recent = (Number(b.lastUsedAt) || Number(b.updatedAt) || Number(b.createdAt) || 0)
      - (Number(a.lastUsedAt) || Number(a.updatedAt) || Number(a.createdAt) || 0);
    return recent || alpha(a, b);
  });
  return rows;
}

export function duplicateSavedTimerRecord(record, { id, title, now = Date.now() } = {}) {
  if (!id) throw new Error('A new saved timer ID is required.');
  const source = normalizeSavedTimerRecord(record);
  return normalizeSavedTimerRecord({
    ...structuredClone(source),
    id,
    title: cleanText(title || `${source.title || 'Saved Timer'} Copy`, 120),
    archived: false,
    useCount: 0,
    lastUsedAt: undefined,
    lastParameterValues: undefined,
    createdAt: now,
    updatedAt: now,
    syncRevision: undefined,
    syncDeviceId: undefined
  });
}
