export class CueManager {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.ctx = null;
    this.lastCountdown = null;
    this.lastStepId = null;
    this.muted = false;
  }

  async init() {
    try {
      if (!this.ctx) this.ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return true;
    } catch { return false; }
  }

  tone(freq = 880, duration = 0.08, gain = 0.08, type = 'sine') {
    const settings = this.getSettings();
    if (!settings.sound || this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  pattern(kind) {
    if (kind === 'work') {
      this.tone(980, 0.10, 0.1, 'square');
      setTimeout(() => this.tone(1180, 0.11, 0.1, 'square'), 120);
    } else if (kind === 'rest') {
      this.tone(560, 0.16, 0.085, 'sine');
    } else if (kind === 'finish') {
      [740, 920, 1180].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 0.1), i * 150));
    } else if (kind === 'countdown') {
      this.tone(820, 0.06, 0.07, 'square');
    } else if (kind === 'prepare') {
      this.tone(680, 0.09, 0.07);
    }
  }

  deliverTick(kind, view, snapshot, config, soundOverride = '') {
    const key = `${view.current?.id || 'session'}:${kind}`;
    if (this.delivered.has(key)) return false;
    this.delivered.add(key);
    void this.play(kind, config, soundOverride, this.generation);
    this.haptic(kind, config);
    return true;
  }

  tick(view, snapshot) {
    if (this.muted || !view?.current || view.status !== 'running') return;
    const step = snapshot?.plan?.kind === 'timeline' ? snapshot.plan.steps?.[snapshot.currentIndex] : view.current;
    const config = this.config(snapshot, step);
    const rem = view.current.remainingMs;
    const progress = view.current.progress;
    if (rem != null && rem > 0 && config.countdownCues && rem <= 3100) {
      const sec = Math.ceil(rem / 1000);
      if (sec >= 1 && sec <= 3) this.deliverTick(`countdown-${sec}`, view, snapshot, config, this.mappedSound(config, 'countdown') || 'countdown');
      return;
    }
    if (rem != null && config.warningSeconds > 3) {
      const target = config.warningSeconds * 1000;
      if (rem <= target && rem > Math.max(3100, target - 1600)) {
        if (this.deliverTick('warning', view, snapshot, config, this.mappedSound(config, 'warning') || 'warning') && config.voice && config.voiceVerbosity === 'detailed') this.speak(`${config.warningSeconds} seconds remaining.`, config);
        return;
      }
    }
    if (config.customPercent != null && progress != null) {
      const target = config.customPercent / 100;
      if (progress >= target && progress <= Math.min(1, target + .12)) {
        this.deliverTick(`custom-${config.customPercent}`, view, snapshot, config, config.customSound || this.mappedSound(config, 'halfway') || 'halfway');
        return;
      }
    }
    if (config.halfwayCue && progress != null && progress >= .5 && progress <= .62) {
      this.deliverTick('halfway', view, snapshot, config, this.mappedSound(config, 'halfway') || 'halfway');
    }
  }

  async test(kind = 'work', routineOverrides = {}) {
    const config = resolveCueConfig(this.getSettings?.() || {}, this.getProfiles?.() || [], routineOverrides, {});
    await this.play(kind, config, this.mappedSound(config, kind));
    this.haptic(kind, config);
  }

  async inspectAudioFile(file) {
    if (!file || file.size <= 0) throw new Error('Choose a valid audio file.');
    if (file.size > 2 * 1024 * 1024) throw new Error('Custom cue sounds must be 2 MB or smaller.');
    if (!String(file.type || '').startsWith('audio/')) throw new Error('Custom cue sounds must be audio files.');
    if (!await this.init()) throw new Error('Audio decoding is unavailable in this browser.');
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 15) throw new Error('Custom cue sounds must be 15 seconds or shorter.');
    return { data, durationMs: Math.round(buffer.duration * 1000), mimeType: file.type, size: file.size };
  }

  clearCustomSoundCache(id) { if (id) this.customBufferCache.delete(id); else this.customBufferCache.clear(); }
  toggleMute() { this.muted = !this.muted; if (this.muted) this.endSession(); return this.muted; }
}

export class WakeLockManager {
  constructor() { this.sentinel = null; }
  supported() { return typeof navigator !== 'undefined' && 'wakeLock' in navigator; }
  async acquire() {
    try {
      if (!this.supported() || document.visibilityState !== 'visible') return false;
      if (this.sentinel && !this.sentinel.released) return true;
      this.sentinel = await navigator.wakeLock.request('screen');
      this.sentinel.addEventListener('release', () => { this.sentinel = null; }, { once: true });
      return true;
    } catch { this.sentinel = null; return false; }
  }
  async release() {
    try { await this.sentinel?.release?.(); } catch {}
    this.sentinel = null;
  }
}

export async function requestNotificationPermission() {
  if (!('Notification' in globalThis)) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try { return await Notification.requestPermission(); }
  catch { return 'denied'; }
}

export async function showCompletionNotification(title, body = 'Timer complete') {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, { body, tag: 'timer-complete', icon: './icon.svg', badge: './icon.svg', renotify: true });
      return true;
    }
    new Notification(title, { body, icon: './icon.svg' });
    return true;
  } catch { return false; }
}
