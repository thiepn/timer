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

  haptic(pattern = 'short') {
    const settings = this.getSettings();
    if (!settings.haptics || this.muted || !navigator.vibrate) return;
    try {
      const p = pattern === 'double' ? [60, 50, 60] : pattern === 'finish' ? [120, 70, 180] : [60];
      navigator.vibrate(p);
    } catch {}
  }

  speak(text) {
    const settings = this.getSettings();
    if (!settings.voice || this.muted || !('speechSynthesis' in globalThis) || !text) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      u.volume = 0.9;
      speechSynthesis.speak(u);
    } catch {}
  }

  onEvent(event) {
    if (event.type === 'step-started') {
      const phase = event.step?.phase;
      this.pattern(phase === 'rest' || phase === 'recovery' || phase === 'cooldown' ? 'rest' : phase === 'prepare' ? 'prepare' : 'work');
      this.haptic(phase === 'work' ? 'double' : 'short');
      if (event.step?.label && phase !== 'prepare') this.speak(event.step.label);
      this.lastCountdown = null;
      this.lastStepId = event.step?.id;
    }
    if (event.type === 'session-completed') {
      this.pattern('finish');
      this.haptic('finish');
      this.speak('Complete');
      this.lastCountdown = null;
    }
    if (event.type === 'session-paused') speechSynthesis?.cancel?.();
  }

  tick(view) {
    const settings = this.getSettings();
    if (!settings.countdownCues || !view?.current || view.status !== 'running') return;
    const rem = view.current.remainingMs;
    if (rem == null || rem <= 0 || rem > 3100) {
      if (rem > 3100) this.lastCountdown = null;
      return;
    }
    const sec = Math.ceil(rem / 1000);
    if (sec >= 1 && sec <= 3 && sec !== this.lastCountdown) {
      this.lastCountdown = sec;
      this.pattern('countdown');
    }
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }
}

export class WakeLockManager {
  constructor() { this.sentinel = null; }
  supported() { return 'wakeLock' in navigator; }
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
