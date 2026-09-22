const DB_NAME = 'thiepn-timer';
const DB_VERSION = 2;

const request = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
});

const transactionDone = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
});

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
  notifications: false,
  quickPresets: [30000, 60000, 90000, 120000, 180000, 300000],
  startPresetImmediately: false,
  wallAutoHide: true
};

export class TimerDB {
  constructor() {
    this.db = null;
    this.memory = null;
  }

  async open() {
    if (!('indexedDB' in globalThis)) {
      this.memory = { routines: new Map(), blocks: new Map(), sessions: new Map(), settings: new Map(), active: new Map() };
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
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('active')) db.createObjectStore('active', { keyPath: 'id' });
    };
    this.db = await request(req);
    return this;
  }

  store(name, mode = 'readonly') {
    const tx = this.db.transaction(name, mode);
    return { tx, store: tx.objectStore(name) };
  }

  async get(name, key) {
    if (this.memory) return structuredClone(this.memory[name].get(key));
    const { store } = this.store(name);
    return request(store.get(key));
  }

  async put(name, value) {
    if (this.memory) { this.memory[name].set(value.id, structuredClone(value)); return value; }
    const { tx, store } = this.store(name, 'readwrite');
    store.put(value);
    await transactionDone(tx);
    return value;
  }

  async delete(name, key) {
    if (this.memory) { this.memory[name].delete(key); return; }
    const { tx, store } = this.store(name, 'readwrite');
    store.delete(key);
    await transactionDone(tx);
  }

  async clear(name) {
    if (this.memory) { this.memory[name].clear(); return; }
    const { tx, store } = this.store(name, 'readwrite');
    store.clear();
    await transactionDone(tx);
  }

  async all(name) {
    if (this.memory) return [...this.memory[name].values()].map((value) => structuredClone(value));
    const { store } = this.store(name);
    return request(store.getAll());
  }

  async loadSettings() {
    const saved = await this.get('settings', 'settings').catch(() => null);
    return { ...defaultSettings, ...(saved?.value || {}) };
  }

  async saveSettings(value) {
    return this.put('settings', { id: 'settings', value: { ...defaultSettings, ...value }, updatedAt: Date.now() });
  }

  async saveActive(snapshot, meta = {}) {
    return this.put('active', { id: 'current', snapshot, meta, updatedAt: Date.now(), sequence: snapshot?.sequence ?? 0 });
  }

  async getActive() { return this.get('active', 'current'); }
  async clearActive() { return this.delete('active', 'current'); }

  async recentSessions(limit = 50) {
    const rows = await this.all('sessions');
    return rows.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  async saveRoutine(routine) {
    const now = Date.now();
    return this.put('routines', {
      favorite: false,
      createdAt: now,
      useCount: 0,
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

  async exportData() {
    const [routines, blocks, sessions, settings] = await Promise.all([
      this.all('routines'), this.all('blocks'), this.all('sessions'), this.loadSettings()
    ]);
    return {
      format: 'thiepn-timer-backup',
      version: 2,
      exportedAt: new Date().toISOString(),
      routines,
      blocks,
      sessions,
      settings
    };
  }

  async importData(data, { replace = false } = {}) {
    if (!data || data.format !== 'thiepn-timer-backup' || ![1, 2].includes(data.version)) throw new Error('Unsupported backup format.');
    if (!Array.isArray(data.routines) || !Array.isArray(data.sessions) || !data.settings) throw new Error('Backup is incomplete.');
    const blocks = data.version >= 2 && Array.isArray(data.blocks) ? data.blocks : [];
    if (replace) {
      await Promise.all(['routines', 'blocks', 'sessions'].map((s) => this.clear(s)));
    }
    for (const block of blocks) {
      if (!block?.id || !block?.title || !Array.isArray(block?.nodes)) continue;
      await this.put('blocks', block);
    }
    for (const routine of data.routines) {
      if (!routine?.id || !routine?.type || !routine?.config) continue;
      await this.put('routines', routine);
    }
    for (const session of data.sessions) {
      if (!session?.id || !Number.isFinite(session?.startedAt)) continue;
      await this.put('sessions', session);
    }
    await this.saveSettings({ ...defaultSettings, ...data.settings });
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
