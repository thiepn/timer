import { canonicalStringify, hashCanonical } from './resilience.js';
import { DEFAULT_QUICK_PRESETS, DEFAULT_QUICK_ADJUSTMENTS } from './quick.js';

const DB_NAME = 'thiepn-timer';
const DB_VERSION = 6;
const SYNC_STORES = new Set(['routines', 'blocks', 'cueProfiles', 'customSounds', 'sessions']);
const ALL_STORES = ['routines', 'blocks', 'cueProfiles', 'customSounds', 'customSoundMeta', 'sessions', 'settings', 'active', 'activeSessions', 'recovery', 'quarantine', 'changes', 'tombstones', 'meta'];

const uid = (prefix = 'id') => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
});

const transactionDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
});

function arrayBufferToBase64(value) {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value instanceof Uint8Array ? value : new Uint8Array(value?.buffer || []);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToArrayBuffer(value) {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(String(value || ''), 'base64');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function customSoundMetadata(sound = {}) {
  const { data, dataBase64, ...meta } = sound || {};
  return structuredClone(meta);
}

function normalizeSelection(selection = {}) {
  return {
    routines: selection.routines !== false,
    blocks: selection.blocks !== false,
    cueProfiles: selection.cueProfiles !== false,
    customSounds: selection.customSounds !== false,
    sessions: selection.sessions !== false,
    settings: selection.settings !== false
  };
}

export const defaultSettings = {
  theme: 'dark',
  accent: 'blue',
  layout: 'focus',
  adjustmentMs: 15000,
  keepAwake: true,
  sound: true,
  voice: false,
  haptics: true,
  countdownCues: true,
  cueProfileId: 'standard',
  soundPack: 'clean',
  soundWork: '', soundRest: '', soundPrepare: '', soundCountdown: '', soundWarning: '', soundHalfway: '', soundFinish: '',
  warningSeconds: 10,
  halfwayCue: false,
  voiceVerbosity: 'normal',
  voiceRate: 1.05,
  voiceVolume: 0.9,
  voiceURI: '',
  masterVolume: 1,
  profileGain: 1,
  notifications: false,
  activeNotifications: false,
  mediaControls: false,
  language: 'system',
  timeFormat: 'system',
  numberSystem: 'system',
  textScale: 'normal',
  highContrast: false,
  largeControls: false,
  reduceMotion: 'system',
  screenReaderOptimized: false,
  quickPresets: [...DEFAULT_QUICK_PRESETS],
  quickRecentDurations: [],
  quickAdjustments: [...DEFAULT_QUICK_ADJUSTMENTS],
  startPresetImmediately: false, // retained for backup compatibility; v2.2 pinned durations are always one-tap starts
  wallAutoHide: true
};

export class TimerDB {
  constructor() {
    this.db = null;
    this.memory = null;
    this.deviceId = null;
    this.activeWriteChain = Promise.resolve();
    this.activeSessionWriteChains = new Map();
  }

  async open() {
    if (!('indexedDB' in globalThis)) {
      this.memory = Object.fromEntries(ALL_STORES.map((name) => [name, new Map()]));
      await this.ensureDeviceIdentity();
      return this;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('routines')) {
        const s = db.createObjectStore('routines', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        s.createIndex('favorite', 'favorite');
      }
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('startedAt', 'startedAt');
        s.createIndex('mode', 'mode');
        s.createIndex('routineId', 'routineId');
      }
      if (!db.objectStoreNames.contains('blocks')) {
        const s = db.createObjectStore('blocks', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        s.createIndex('title', 'title');
      }
      if (!db.objectStoreNames.contains('cueProfiles')) {
        const s = db.createObjectStore('cueProfiles', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        s.createIndex('title', 'title');
      }
      if (!db.objectStoreNames.contains('customSounds')) {
        const s = db.createObjectStore('customSounds', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
        s.createIndex('title', 'title');
      }
      if (!db.objectStoreNames.contains('customSoundMeta')) {
        const meta = db.createObjectStore('customSoundMeta', { keyPath: 'id' });
        meta.createIndex('updatedAt', 'updatedAt');
        meta.createIndex('title', 'title');
        if (db.objectStoreNames.contains('customSounds')) {
          const source = req.transaction.objectStore('customSounds');
          source.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            meta.put(customSoundMetadata(cursor.value));
            cursor.continue();
          };
        }
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('active')) db.createObjectStore('active', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('activeSessions')) {
        const activeSessions = db.createObjectStore('activeSessions', { keyPath: 'id' });
        activeSessions.createIndex('updatedAt', 'updatedAt');
        if (db.objectStoreNames.contains('active')) {
          const legacyActive = req.transaction.objectStore('active');
          const legacyGet = legacyActive.get('current');
          legacyGet.onsuccess = () => {
            const legacy = legacyGet.result;
            if (!legacy?.snapshot?.id || ['completed', 'cancelled'].includes(legacy.snapshot.status)) return;
            activeSessions.put({
              id: legacy.snapshot.id,
              snapshot: legacy.snapshot,
              meta: legacy.meta || legacy.snapshot.meta || {},
              completionAction: legacy.meta?.completionAction || 'stop',
              cycle: 1,
              createdAt: legacy.snapshot.startedAt || legacy.updatedAt || Date.now(),
              updatedAt: legacy.updatedAt || Date.now(),
              sequence: Number(legacy.sequence ?? legacy.snapshot.sequence) || 0,
              migratedFromSingleton: true
            });
            legacyActive.delete('current');
          };
        }
      }
      if (!db.objectStoreNames.contains('recovery')) {
        const s = db.createObjectStore('recovery', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('kind', 'kind');
      }
      if (!db.objectStoreNames.contains('quarantine')) {
        const s = db.createObjectStore('quarantine', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('entityType', 'entityType');
      }
      if (!db.objectStoreNames.contains('changes')) {
        const s = db.createObjectStore('changes', { keyPath: 'id' });
        s.createIndex('changedAt', 'changedAt');
        s.createIndex('entityId', 'entityId');
        s.createIndex('storeName', 'storeName');
      }
      if (!db.objectStoreNames.contains('tombstones')) {
        const s = db.createObjectStore('tombstones', { keyPath: 'id' });
        s.createIndex('deletedAt', 'deletedAt');
        s.createIndex('storeName', 'storeName');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
    };
    this.db = await request(req);
    await this.ensureDeviceIdentity();
    return this;
  }

  store(name, mode = 'readonly') {
    const tx = this.db.transaction(name, mode);
    return { tx, store: tx.objectStore(name) };
  }

  async _getRaw(name, key) {
    if (this.memory) return structuredClone(this.memory[name]?.get(key));
    const { store } = this.store(name);
    return request(store.get(key));
  }

  async _putRaw(name, value) {
    if (this.memory) { this.memory[name].set(value.id, structuredClone(value)); return value; }
    const { tx, store } = this.store(name, 'readwrite');
    store.put(value);
    await transactionDone(tx);
    return value;
  }

  async _deleteRaw(name, key) {
    if (this.memory) { this.memory[name].delete(key); return; }
    const { tx, store } = this.store(name, 'readwrite');
    store.delete(key);
    await transactionDone(tx);
  }

  async _clearRaw(name) {
    if (this.memory) { this.memory[name].clear(); return; }
    const { tx, store } = this.store(name, 'readwrite');
    store.clear();
    await transactionDone(tx);
  }

  async get(name, key) { return this._getRaw(name, key); }

  async put(name, value, { journal = true } = {}) {
    if (!value?.id) throw new Error(`Cannot save ${name} record without id.`);
    if (!journal || !SYNC_STORES.has(name)) {
      const result = await this._putRaw(name, value);
      if (name === 'customSounds') await this._putRaw('customSoundMeta', customSoundMetadata(value));
      return result;
    }
    const previous = await this._getRaw(name, value.id).catch(() => null);
    const baseRevision = Math.max(0, Number(previous?.syncRevision) || 0);
    const incomingRevision = Math.max(0, Number(value.syncRevision) || 0);
    const syncRevision = previous ? Math.max(baseRevision + 1, incomingRevision) : Math.max(1, incomingRevision);
    const normalized = { ...value, syncRevision, syncDeviceId: this.deviceId || undefined };
    await this._putRaw(name, normalized);
    if (name === 'customSounds') await this._putRaw('customSoundMeta', customSoundMetadata(normalized));
    await this._deleteRaw('tombstones', `${name}:${value.id}`).catch(() => {});
    await this.appendChange({ storeName: name, entityId: value.id, operation: previous ? 'update' : 'create', baseRevision, resultingRevision: syncRevision, content: normalized });
    return normalized;
  }

  async delete(name, key, { journal = true } = {}) {
    const previous = await this._getRaw(name, key).catch(() => null);
    await this._deleteRaw(name, key);
    if (name === 'customSounds') await this._deleteRaw('customSoundMeta', key).catch(() => {});
    if (journal && SYNC_STORES.has(name) && previous) {
      const deletedAt = Date.now();
      const baseRevision = Math.max(0, Number(previous.syncRevision) || 0);
      const tombstone = { id: `${name}:${key}`, storeName: name, entityId: key, deletedAt, deviceId: this.deviceId, baseRevision };
      await this._putRaw('tombstones', tombstone);
      await this.appendChange({ storeName: name, entityId: key, operation: 'delete', baseRevision, resultingRevision: baseRevision + 1, content: tombstone });
    }
  }

  async clear(name, { journal = true } = {}) {
    if (journal && SYNC_STORES.has(name)) {
      const rows = await this.all(name);
      for (const row of rows) await this.delete(name, row.id, { journal: true });
      return;
    }
    const result = await this._clearRaw(name);
    if (name === 'customSounds') await this._clearRaw('customSoundMeta').catch(() => {});
    return result;
  }

  async all(name) {
    if (this.memory) return [...this.memory[name].values()].map((value) => structuredClone(value));
    const { store } = this.store(name);
    return request(store.getAll());
  }

  async count(name) {
    if (this.memory) return this.memory[name]?.size || 0;
    const { store } = this.store(name);
    return request(store.count());
  }

  async listCustomSoundMetadata() {
    return this.all('customSoundMeta');
  }

  async ensureDeviceIdentity() {
    const existing = await this._getRaw('meta', 'device').catch(() => null);
    if (existing?.deviceId) { this.deviceId = existing.deviceId; return existing; }
    const record = { id: 'device', deviceId: uid('device'), createdAt: Date.now(), displayName: 'This device' };
    await this._putRaw('meta', record);
    this.deviceId = record.deviceId;
    return record;
  }

  async appendChange({ storeName, entityId, operation, baseRevision = 0, resultingRevision = 0, content }) {
    if (!this.deviceId) await this.ensureDeviceIdentity();
    const changedAt = Date.now();
    let contentHash = '';
    try { contentHash = await hashCanonical(content); } catch {}
    return this._putRaw('changes', {
      id: uid('change'), storeName, entityId, operation, baseRevision, resultingRevision,
      changedAt, deviceId: this.deviceId, contentHash
    });
  }

  async loadSettings() {
    const saved = await this.get('settings', 'settings').catch(() => null);
    return { ...defaultSettings, ...(saved?.value || {}) };
  }

  async saveSettings(value) {
    return this._putRaw('settings', { id: 'settings', value: { ...defaultSettings, ...value }, updatedAt: Date.now() });
  }

  _queueActiveWrite(task) {
    const run = this.activeWriteChain.then(task, task);
    this.activeWriteChain = run.catch(() => {});
    return run;
  }

  async saveActive(snapshot, meta = {}) {
    if (!snapshot?.id) throw new Error('Active-session snapshot is missing its session ID.');
    const incoming = {
      id: 'current', snapshot: structuredClone(snapshot), meta: structuredClone(meta),
      updatedAt: Date.now(), sequence: Number(snapshot.sequence) || 0
    };
    return this._queueActiveWrite(async () => {
      const current = await this._getRaw('active', 'current').catch(() => null);
      if (current?.snapshot?.id === snapshot.id && Number(current.sequence) > incoming.sequence) return current;
      if (current?.snapshot?.id && current.snapshot.id !== snapshot.id) {
        const currentStart = Number(current.snapshot.startedAt) || 0;
        const incomingStart = Number(snapshot.startedAt) || 0;
        if (currentStart > incomingStart) return current;
      }
      return this._putRaw('active', incoming);
    });
  }

  async getActive() { return this.get('active', 'current'); }
  async clearActive(expectedSessionId = null) {
    return this._queueActiveWrite(async () => {
      if (expectedSessionId) {
        const current = await this._getRaw('active', 'current').catch(() => null);
        if (current?.snapshot?.id && current.snapshot.id !== expectedSessionId) return false;
      }
      await this._deleteRaw('active', 'current');
      return true;
    });
  }

  _queueActiveSessionWrite(runtimeId, task) {
    const previous = this.activeSessionWriteChains.get(runtimeId) || Promise.resolve();
    const run = previous.then(task, task);
    const guarded = run.catch(() => {});
    this.activeSessionWriteChains.set(runtimeId, guarded);
    guarded.finally(() => {
      if (this.activeSessionWriteChains.get(runtimeId) === guarded) this.activeSessionWriteChains.delete(runtimeId);
    });
    return run;
  }

  async saveActiveSession(record) {
    if (!record?.id || !record?.snapshot?.id) throw new Error('Active timer record is incomplete.');
    const runtimeId = String(record.id);
    const incoming = {
      ...structuredClone(record),
      id: runtimeId,
      updatedAt: Date.now(),
      sequence: Number(record.snapshot.sequence) || 0
    };
    return this._queueActiveSessionWrite(runtimeId, async () => {
      const current = await this._getRaw('activeSessions', runtimeId).catch(() => null);
      if (current?.snapshot?.id === incoming.snapshot.id && Number(current.sequence) > incoming.sequence) return current;
      return this._putRaw('activeSessions', incoming);
    });
  }

  async getActiveSession(runtimeId) { return this.get('activeSessions', runtimeId); }

  async getActiveSessions() {
    const rows = await this.all('activeSessions');
    return rows
      .filter((row) => row?.snapshot && (row.overtime || !['completed', 'cancelled'].includes(row.snapshot.status)))
      .sort((a, b) => (a.createdAt || a.snapshot.startedAt || 0) - (b.createdAt || b.snapshot.startedAt || 0));
  }

  async clearActiveSession(runtimeId, expectedSessionId = null) {
    if (!runtimeId) return false;
    runtimeId = String(runtimeId);
    return this._queueActiveSessionWrite(runtimeId, async () => {
      if (expectedSessionId) {
        const current = await this._getRaw('activeSessions', runtimeId).catch(() => null);
        if (current?.snapshot?.id && current.snapshot.id !== expectedSessionId) return false;
      }
      await this._deleteRaw('activeSessions', runtimeId);
      return true;
    });
  }

  async clearAllActiveSessions() {
    const pending = [...this.activeSessionWriteChains.values()];
    if (pending.length) await Promise.allSettled(pending);
    await this.clear('activeSessions');
  }

  async recentSessions(limit = 50) {
    limit = Math.max(0, Math.floor(Number(limit) || 0));
    if (!limit) return [];
    if (this.memory) {
      const rows = [...this.memory.sessions.values()].map((value) => structuredClone(value));
      return rows.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
    }
    const { store } = this.store('sessions');
    const index = store.index('startedAt');
    return new Promise((resolve, reject) => {
      const rows = [];
      const req = index.openCursor(null, 'prev');
      req.onerror = () => reject(req.error || new Error('Session query failed'));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || rows.length >= limit) return resolve(rows);
        rows.push(cursor.value);
        cursor.continue();
      };
    });
  }

  async saveRoutine(routine) {
    const now = Date.now();
    const previous = routine?.id ? await this.get('routines', routine.id).catch(() => null) : null;
    return this.put('routines', {
      favorite: false,
      createdAt: previous?.createdAt || routine?.createdAt || now,
      useCount: previous?.useCount || 0,
      ...routine,
      updatedAt: now
    });
  }

  async saveBlock(block) {
    const now = Date.now();
    const previous = block?.id ? await this.get('blocks', block.id).catch(() => null) : null;
    return this.put('blocks', {
      ...block,
      createdAt: previous?.createdAt || block?.createdAt || now,
      revision: previous ? Math.max(1, Number(previous.revision) || 1) + 1 : Math.max(1, Number(block?.revision) || 1),
      updatedAt: now
    });
  }

  async saveCueProfile(profile) {
    const now = Date.now();
    const previous = profile?.id ? await this.get('cueProfiles', profile.id).catch(() => null) : null;
    return this.put('cueProfiles', {
      ...profile,
      createdAt: previous?.createdAt || profile?.createdAt || now,
      updatedAt: now
    });
  }

  async saveCustomSound(sound) {
    const now = Date.now();
    const previous = sound?.id ? await this.get('customSounds', sound.id).catch(() => null) : null;
    return this.put('customSounds', {
      ...sound,
      createdAt: previous?.createdAt || sound?.createdAt || now,
      updatedAt: now
    });
  }

  async exportData({ selection } = {}) {
    const selected = normalizeSelection(selection);
    const [routines, blocks, cueProfiles, customSounds, sessions, settings] = await Promise.all([
      selected.routines ? this.all('routines') : Promise.resolve([]),
      selected.blocks ? this.all('blocks') : Promise.resolve([]),
      selected.cueProfiles ? this.all('cueProfiles') : Promise.resolve([]),
      selected.customSounds ? this.all('customSounds') : Promise.resolve([]),
      selected.sessions ? this.all('sessions') : Promise.resolve([]),
      selected.settings ? this.loadSettings() : Promise.resolve(null)
    ]);
    const portableSounds = customSounds.map((sound) => ({
      ...sound,
      data: undefined,
      dataBase64: sound.data ? arrayBufferToBase64(sound.data) : ''
    }));
    return {
      format: 'thiepn-timer-backup',
      version: 4,
      exportedAt: new Date().toISOString(),
      selection: selected,
      routines,
      blocks,
      cueProfiles,
      customSounds: portableSounds,
      sessions,
      settings
    };
  }

  async importData(data, { replace = false, selection = null, quarantine = [] } = {}) {
    if (!data || data.format !== 'thiepn-timer-backup' || ![1, 2, 3, 4].includes(Number(data.version))) throw new Error('Unsupported backup format.');
    if (!Array.isArray(data.routines) || !Array.isArray(data.sessions)) throw new Error('Backup is incomplete.');
    const available = data.version >= 4 && data.selection ? data.selection : { routines: true, blocks: true, cueProfiles: true, customSounds: true, sessions: true, settings: true };
    const requested = normalizeSelection(selection || available);
    const selected = Object.fromEntries(Object.keys(requested).map((key) => [key, Boolean(requested[key] && available[key] !== false)]));
    const blocks = data.version >= 2 && Array.isArray(data.blocks) ? data.blocks : [];
    const cueProfiles = data.version >= 3 && Array.isArray(data.cueProfiles) ? data.cueProfiles : [];
    const customSounds = data.version >= 3 && Array.isArray(data.customSounds) ? data.customSounds : [];

    if (replace) {
      if (selected.routines) await this._clearRaw('routines');
      if (selected.blocks) await this._clearRaw('blocks');
      if (selected.cueProfiles) await this._clearRaw('cueProfiles');
      if (selected.customSounds) { await this._clearRaw('customSounds'); await this._clearRaw('customSoundMeta').catch(() => {}); }
      if (selected.sessions) await this._clearRaw('sessions');
    }

    if (selected.blocks) for (const block of blocks) if (block?.id && block?.title && Array.isArray(block?.nodes)) await this.put('blocks', block);
    if (selected.cueProfiles) for (const profile of cueProfiles) if (profile?.id && profile?.title) await this.put('cueProfiles', profile);
    if (selected.customSounds) for (const sound of customSounds) {
      if (!sound?.id || !sound?.title || !sound?.dataBase64) continue;
      const { dataBase64, ...rest } = sound;
      await this.put('customSounds', { ...rest, data: base64ToArrayBuffer(dataBase64) });
    }
    if (selected.routines) for (const routine of data.routines) if (routine?.id && routine?.type && routine?.config) await this.put('routines', routine);
    if (selected.sessions) for (const session of data.sessions) if (session?.id && Number.isFinite(session?.startedAt)) await this.put('sessions', session);
    if (selected.settings && data.settings) await this.saveSettings({ ...defaultSettings, ...data.settings });
    for (const item of quarantine || []) await this.quarantineRecord(item);
    return { selected, counts: { routines: data.routines.length, blocks: blocks.length, cueProfiles: cueProfiles.length, customSounds: customSounds.length, sessions: data.sessions.length } };
  }

  async createRecoverySnapshot({ kind = 'manual', label = '', payload = null } = {}) {
    const data = payload || await this.exportData();
    const record = {
      id: uid('recovery'), kind, label: label || kind, createdAt: Date.now(),
      payload: data,
      counts: {
        routines: data.routines?.length || 0, blocks: data.blocks?.length || 0,
        cueProfiles: data.cueProfiles?.length || 0, customSounds: data.customSounds?.length || 0,
        sessions: data.sessions?.length || 0
      },
      sizeEstimate: canonicalStringify(data).length
    };
    await this._putRaw('recovery', record);
    await this.pruneRecoverySnapshots();
    return record;
  }

  async listRecoverySnapshots() {
    return (await this.all('recovery')).sort((a, b) => b.createdAt - a.createdAt);
  }

  async restoreRecoverySnapshot(id) {
    const snapshot = await this.get('recovery', id);
    if (!snapshot?.payload) throw new Error('Recovery snapshot was not found.');
    await this.importData(snapshot.payload, { replace: true });
    return snapshot;
  }

  async ensureDailyRecoverySnapshot() {
    const day = new Date().toISOString().slice(0, 10);
    const existing = (await this.listRecoverySnapshots()).find((item) => item.kind === 'daily' && new Date(item.createdAt).toISOString().slice(0, 10) === day);
    if (existing) return existing;
    return this.createRecoverySnapshot({ kind: 'daily', label: `Daily ${day}` });
  }

  async pruneRecoverySnapshots() {
    const rows = await this.listRecoverySnapshots();
    const limits = { daily: 7, 'pre-restore': 3, 'pre-import': 3, manual: 5 };
    const kept = new Map();
    for (const row of rows) {
      const limit = limits[row.kind] ?? 3;
      const count = kept.get(row.kind) || 0;
      if (count < limit) kept.set(row.kind, count + 1);
      else await this._deleteRaw('recovery', row.id);
    }
  }

  async quarantineRecord({ source = 'unknown', entityType = 'unknown', entityId = '', reason = 'Invalid data', record = null } = {}) {
    return this._putRaw('quarantine', {
      id: uid('quarantine'), source, entityType, entityId, reason, record: structuredClone(record), createdAt: Date.now()
    });
  }

  async listQuarantine() { return (await this.all('quarantine')).sort((a, b) => b.createdAt - a.createdAt); }
  async clearQuarantine() { return this._clearRaw('quarantine'); }

  async dataHealth() {
    const [routines, blocks, profiles, sounds, sessions, recovery, quarantine, changes, tombstones] = await Promise.all([
      this.count('routines'), this.count('blocks'), this.count('cueProfiles'), this.count('customSoundMeta'), this.count('sessions'),
      this.count('recovery'), this.count('quarantine'), this.count('changes'), this.count('tombstones')
    ]);
    return {
      counts: { routines, blocks, cueProfiles: profiles, customSounds: sounds, sessions },
      recoveryCount: recovery, quarantineCount: quarantine, pendingChanges: changes, tombstoneCount: tombstones,
      deviceId: this.deviceId
    };
  }

  async pruneTombstones(maxAgeMs = 90 * 86400000) {
    const cutoff = Date.now() - maxAgeMs;
    for (const item of await this.all('tombstones')) if (item.deletedAt < cutoff) await this._deleteRaw('tombstones', item.id);
  }
}

export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return Boolean(await navigator.storage.persist());
  } catch { return false; }
}

export async function storageEstimate() {
  try { return await navigator.storage?.estimate?.(); }
  catch { return undefined; }
}
