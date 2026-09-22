const uid = (prefix = 'device') => `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function parseLaunchCommand(input, base = 'https://timer.local/') {
  let url;
  try { url = new URL(input || base, base); }
  catch { return { type: 'HOME' }; }
  const launch = String(url.searchParams.get('launch') || '').toLowerCase();
  const id = String(url.searchParams.get('id') || '').trim();
  if (!launch) return { type: 'HOME' };
  if (launch === 'quick') return { type: 'QUICK' };
  if (launch === 'stopwatch') return { type: 'STOPWATCH' };
  if (launch === 'favorites') return { type: 'FAVORITES' };
  if (launch === 'last') return { type: 'LAST_ROUTINE' };
  if (launch === 'active') return { type: 'ACTIVE_SESSION' };
  if (launch === 'display') return { type: 'DISPLAY' };
  if (launch === 'routine' && id) return { type: 'ROUTINE', id };
  if (launch === 'session' && id) return { type: 'SESSION', id };
  if (launch === 'timer') {
    const durationMs = Math.round(Number(url.searchParams.get('duration')) || 0);
    if (durationMs >= 1000 && durationMs <= 24 * 60 * 60 * 1000) return { type: 'TIMER', durationMs };
    return { type: 'INVALID', reason: 'Timer duration must be between 1 second and 24 hours.' };
  }
  return { type: 'HOME' };
}

export function launchURL(command = {}, base = './') {
  const url = new URL(base, 'https://timer.local/');
  const set = (name, value) => url.searchParams.set(name, String(value));
  if (command.type === 'QUICK') set('launch', 'quick');
  else if (command.type === 'STOPWATCH') set('launch', 'stopwatch');
  else if (command.type === 'FAVORITES') set('launch', 'favorites');
  else if (command.type === 'LAST_ROUTINE') set('launch', 'last');
  else if (command.type === 'ACTIVE_SESSION') set('launch', 'active');
  else if (command.type === 'DISPLAY') set('launch', 'display');
  else if (command.type === 'ROUTINE') { set('launch', 'routine'); set('id', command.id); }
  else if (command.type === 'SESSION') { set('launch', 'session'); set('id', command.id); }
  else if (command.type === 'TIMER') { set('launch', 'timer'); set('duration', Math.round(command.durationMs)); }
  const relative = `${url.pathname}${url.search}${url.hash}`;
  return base.startsWith('http') ? url.toString() : relative.replace(/^\//, './');
}

export function detectDeviceCapabilities(scope = globalThis) {
  const nav = scope.navigator || {};
  const doc = scope.document;
  let installedPwa = false;
  try { installedPwa = Boolean(scope.matchMedia?.('(display-mode: standalone)')?.matches || nav.standalone); } catch {}
  return {
    installedPwa,
    serviceWorker: Boolean(nav.serviceWorker),
    notifications: Boolean(scope.Notification && scope.ServiceWorkerRegistration?.prototype?.showNotification),
    notificationActions: Boolean(scope.Notification && 'maxActions' in scope.Notification),
    webLocks: Boolean(nav.locks?.request),
    broadcastChannel: typeof scope.BroadcastChannel === 'function',
    wakeLock: Boolean(nav.wakeLock?.request),
    mediaSession: Boolean(nav.mediaSession?.setActionHandler),
    share: Boolean(nav.share),
    launchHandler: Boolean(scope.launchQueue),
    fullscreen: Boolean(doc?.documentElement?.requestFullscreen),
    persistentStorage: Boolean(nav.storage?.persist),
    vibration: Boolean(nav.vibrate),
    homeWidget: false,
    exactLocalAlarm: false
  };
}

export class SessionOwnershipManager {
  constructor({
    name = 'thiepn-timer-runtime',
    channelName = 'thiepn-timer-runtime',
    locks = globalThis.navigator?.locks,
    storage = globalThis.localStorage,
    BroadcastChannelCtor = globalThis.BroadcastChannel,
    now = () => Date.now(),
    clientId = uid('client'),
    leaseMs = 6000,
    refreshMs = 2000
  } = {}) {
    this.name = name;
    this.locks = locks;
    this.storage = storage;
    this.now = now;
    this.clientId = clientId;
    this.leaseMs = leaseMs;
    this.refreshMs = refreshMs;
    this.owned = false;
    this.mode = null;
    this._releaseResolver = null;
    this._lockPromise = null;
    this._leaseTimer = 0;
    this._heartbeatTimer = 0;
    this.listeners = new Set();
    this.channel = typeof BroadcastChannelCtor === 'function' ? new BroadcastChannelCtor(channelName) : null;
    if (this.channel) {
      const handler = (event) => {
        const message = event?.data;
        if (!message || message.clientId === this.clientId) return;
        for (const listener of [...this.listeners]) listener(message);
      };
      if (this.channel.addEventListener) this.channel.addEventListener('message', handler);
      else this.channel.onmessage = handler;
      this._channelHandler = handler;
    }
  }

  isOwner() { return this.owned; }
  onMessage(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  post(type, payload = {}) {
    try { this.channel?.postMessage?.({ type, clientId: this.clientId, at: this.now(), ...payload }); } catch {}
  }

  async acquire() {
    if (this.owned) return true;
    if (this.locks?.request) return this._acquireWebLock();
    return this._acquireLease();
  }

  async _acquireWebLock() {
    let resolved = false;
    let resolveAcquired;
    const acquired = new Promise((resolve) => { resolveAcquired = resolve; });
    const hold = new Promise((resolve) => { this._releaseResolver = resolve; });
    try {
      this._lockPromise = this.locks.request(this.name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { resolved = true; resolveAcquired(false); return; }
        this.owned = true;
        this.mode = 'web-lock';
        resolved = true;
        resolveAcquired(true);
        this.post('OWNER_ANNOUNCE');
        await hold;
        this.owned = false;
        this.mode = null;
      }).catch(() => {
        if (!resolved) resolveAcquired(false);
        this.owned = false;
        this.mode = null;
      });
      return await acquired;
    } catch {
      this._releaseResolver = null;
      return false;
    }
  }

  _leaseKey() { return `${this.name}:lease`; }
  _readLease() {
    try { return JSON.parse(this.storage?.getItem?.(this._leaseKey()) || 'null'); }
    catch { return null; }
  }
  _writeLease() {
    try {
      this.storage?.setItem?.(this._leaseKey(), JSON.stringify({ clientId: this.clientId, expiresAt: this.now() + this.leaseMs }));
      return true;
    } catch { return false; }
  }
  _acquireLease() {
    if (!this.storage) return false;
    const current = this._readLease();
    if (current?.clientId && current.clientId !== this.clientId && Number(current.expiresAt) > this.now()) return false;
    if (!this._writeLease()) return false;
    const confirmed = this._readLease();
    if (confirmed?.clientId !== this.clientId) return false;
    this.owned = true;
    this.mode = 'lease';
    clearInterval(this._leaseTimer);
    this._leaseTimer = setInterval(() => { if (this.owned) this._writeLease(); }, this.refreshMs);
    this.post('OWNER_ANNOUNCE');
    return true;
  }

  startHeartbeat(getPayload, intervalMs = 1500) {
    this.stopHeartbeat();
    const send = () => {
      if (!this.owned) return;
      const payload = typeof getPayload === 'function' ? getPayload() : undefined;
      if (payload) this.post('ACTIVE_SNAPSHOT', payload);
      else this.post('OWNER_HEARTBEAT');
    };
    send();
    this._heartbeatTimer = setInterval(send, clamp(intervalMs, 500, 10000));
  }

  stopHeartbeat() { clearInterval(this._heartbeatTimer); this._heartbeatTimer = 0; }
  requestTakeover() { this.post('TAKEOVER_REQUEST'); }
  requestFocus() { this.post('FOCUS_REQUEST'); }

  async release() {
    this.stopHeartbeat();
    if (this.mode === 'web-lock') {
      const release = this._releaseResolver;
      this._releaseResolver = null;
      release?.();
      this.owned = false;
      this.mode = null;
      return;
    }
    if (this.mode === 'lease') {
      clearInterval(this._leaseTimer);
      this._leaseTimer = 0;
      const current = this._readLease();
      if (current?.clientId === this.clientId) {
        try { this.storage?.removeItem?.(this._leaseKey()); } catch {}
      }
      this.owned = false;
      this.mode = null;
    }
  }

  dispose() {
    this.release();
    try {
      if (this.channel?.removeEventListener && this._channelHandler) this.channel.removeEventListener('message', this._channelHandler);
      this.channel?.close?.();
    } catch {}
    this.listeners.clear();
  }
}

export class MediaSessionManager {
  constructor(nav = globalThis.navigator, MediaMetadataCtor = globalThis.MediaMetadata) {
    this.nav = nav;
    this.MediaMetadataCtor = MediaMetadataCtor;
    this.enabled = false;
  }

  supported() { return Boolean(this.nav?.mediaSession?.setActionHandler); }

  enable(handlers = {}) {
    if (!this.supported()) return false;
    const session = this.nav.mediaSession;
    const map = {
      play: handlers.play,
      pause: handlers.pause,
      nexttrack: handlers.next,
      previoustrack: handlers.previous,
      stop: handlers.stop
    };
    for (const [action, handler] of Object.entries(map)) {
      try { session.setActionHandler(action, typeof handler === 'function' ? handler : null); } catch {}
    }
    this.enabled = true;
    return true;
  }

  update(view = {}) {
    if (!this.enabled || !this.supported()) return;
    const session = this.nav.mediaSession;
    try {
      if (this.MediaMetadataCtor) {
        session.metadata = new this.MediaMetadataCtor({
          title: view.current?.label || view.title || 'Timer',
          artist: view.current?.round ? `Round ${view.current.round.current} of ${view.current.round.total}` : (view.status === 'paused' ? 'Paused' : 'Workout timer'),
          album: view.title || 'Timer'
        });
      }
    } catch {}
    try { session.playbackState = view.status === 'paused' ? 'paused' : view.status === 'running' ? 'playing' : 'none'; } catch {}
  }

  disable() {
    if (!this.supported()) return;
    const session = this.nav.mediaSession;
    for (const action of ['play','pause','nexttrack','previoustrack','stop']) {
      try { session.setActionHandler(action, null); } catch {}
    }
    try { session.metadata = null; } catch {}
    try { session.playbackState = 'none'; } catch {}
    this.enabled = false;
  }
}