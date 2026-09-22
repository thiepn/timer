export class CueManager {
  constructor(getSettings, getProfiles = () => [], getCustomSound = async () => null) {
    this.getSettings = getSettings;
    this.getProfiles = getProfiles;
    this.getCustomSound = getCustomSound;
    this.ctx = null;
    this.muted = false;
    this.generation = 0;
    this.delivered = new Set();
    this.activeSources = new Set();
    this.customBufferCache = new Map();
  }

  async init() {
    try {
      const AudioCtor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioCtor) return false;
      if (!this.ctx) this.ctx = new AudioCtor();
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return true;
    } catch { return false; }
  }

  beginSession() {
    this.generation += 1;
    this.delivered.clear();
    this.cancelSpeech();
  }

  endSession() {
    this.generation += 1;
    this.delivered.clear();
    this.cancelSpeech();
    this.stopSources();
    try { globalThis.navigator?.vibrate?.(0); } catch {}
  }

  stopSources() {
    for (const source of [...this.activeSources]) {
      try { source.stop?.(); } catch {}
    }
    this.activeSources.clear();
  }

  cancelSpeech() {
    try { globalThis.speechSynthesis?.cancel?.(); } catch {}
  }

  config(snapshot, step) {
    return resolveCueConfig(this.getSettings?.() || {}, this.getProfiles?.() || [], snapshot?.meta?.cueOverrides || {}, step?.cueOverrides || {});
  }

  tone(spec, config, generation = this.generation) {
    if (!config.sound || this.muted || !this.ctx || this.ctx.state !== 'running' || generation !== this.generation) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    const at = this.ctx.currentTime + Math.max(0, Number(spec.delay) || 0);
    const gain = Math.max(.0001, (Number(spec.gain) || .06) * (config.profileGain ?? 1) * (config.masterVolume ?? 1));
    osc.type = spec.type || 'sine';
    osc.frequency.value = Number(spec.freq) || 880;
    amp.gain.setValueAtTime(.0001, at);
    amp.gain.exponentialRampToValueAtTime(gain, at + .008);
    amp.gain.exponentialRampToValueAtTime(.0001, at + Math.max(.02, Number(spec.duration) || .08));
    osc.connect(amp).connect(this.ctx.destination);
    this.activeSources.add(osc);
    osc.addEventListener?.('ended', () => this.activeSources.delete(osc), { once: true });
    osc.start(at);
    osc.stop(at + Math.max(.03, Number(spec.duration) || .08) + .03);
  }

  async customSound(id, config, generation = this.generation) {
    if (!config.sound || this.muted || !id || generation !== this.generation) return false;
    try {
      if (!await this.init()) return false;
      let buffer = this.customBufferCache.get(id);
      if (!buffer) {
        const record = await this.getCustomSound(id);
        if (!record?.data) return false;
        const raw = record.data instanceof ArrayBuffer ? record.data : record.data?.buffer;
        if (!raw) return false;
        buffer = await this.ctx.decodeAudioData(raw.slice(0));
        this.customBufferCache.set(id, buffer);
      }
      if (generation !== this.generation) return false;
      const source = this.ctx.createBufferSource();
      const gainNode = this.ctx.createGain();
      source.buffer = buffer;
      gainNode.gain.value = clamp((config.profileGain ?? 1) * (config.masterVolume ?? 1), 0, 2);
      source.connect(gainNode).connect(this.ctx.destination);
      this.activeSources.add(source);
      source.addEventListener?.('ended', () => this.activeSources.delete(source), { once: true });
      source.start();
      return true;
    } catch { return false; }
  }

  async play(kind, config, override = '', generation = this.generation) {
    if (!config.sound || this.muted || override === 'off') return;
    if (String(override).startsWith('custom:')) {
      const ok = await this.customSound(String(override).slice(7), config, generation);
      if (ok) return;
      override = '';
    }
    if (!await this.init()) return;
    const soundKind = override && override !== 'default' ? override : kind;
    for (const spec of soundRecipe(config.soundPack, soundKind)) this.tone(spec, config, generation);
  }

  haptic(kind, config) {
    if (!config.haptics || this.muted || !globalThis.navigator?.vibrate) return;
    const patterns = {
      work: [55, 45, 55], rest: [65], prepare: [40], warning: [35, 35, 35], halfway: [30], finish: [110, 60, 170], countdown: [28]
    };
    try { globalThis.navigator.vibrate(patterns[kind] || [45]); } catch {}
  }

  speak(text, config) {
    if (!config.voice || this.muted || !text || !('speechSynthesis' in globalThis) || !('SpeechSynthesisUtterance' in globalThis)) return;
    try {
      this.cancelSpeech();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = config.voiceRate || 1.05;
      utterance.volume = config.voiceVolume ?? .9;
      if (config.voiceURI && globalThis.speechSynthesis?.getVoices) {
        const voice = globalThis.speechSynthesis.getVoices().find((item) => item.voiceURI === config.voiceURI);
        if (voice) utterance.voice = voice;
      }
      speechSynthesis.speak(utterance);
    } catch {}
  }

  nextStep(snapshot) {
    if (snapshot?.plan?.kind !== 'timeline') return undefined;
    return snapshot.plan.steps?.[(snapshot.currentIndex || 0) + 1];
  }

  mappedSound(config, kind) {
    const key = { work: 'soundWork', rest: 'soundRest', prepare: 'soundPrepare', countdown: 'soundCountdown', warning: 'soundWarning', halfway: 'soundHalfway', finish: 'soundFinish' }[kind];
    return key ? (config[key] || '') : '';
  }

  onEvent(event, snapshot) {
    const step = event.step || (snapshot?.plan?.kind === 'timeline' ? snapshot.plan.steps?.[snapshot.currentIndex] : null);
    if (event.type === 'step-started') {
      this.generation += 1;
      const generation = this.generation;
      const config = this.config(snapshot, step);
      const phase = step?.phase;
      const kind = phase === 'rest' || phase === 'recovery' || phase === 'cooldown' ? 'rest' : phase === 'prepare' ? 'prepare' : 'work';
      void this.play(kind, config, config.transitionSound || this.mappedSound(config, kind), generation);
      this.haptic(kind, config);
      this.speak(speechForStep(step, config, this.nextStep(snapshot)), config);
      return;
    }
    if (event.type === 'manual-completed') {
      const config = this.config(snapshot, step);
      void this.play('rest', config, this.mappedSound(config, 'rest'), this.generation);
      this.haptic('rest', config);
      return;
    }
    if (event.type === 'session-completed') {
      this.generation += 1;
      const config = this.config(snapshot, null);
      void this.play('finish', config, this.mappedSound(config, 'finish'), this.generation);
      this.haptic('finish', config);
      this.speak(config.voiceVerbosity === 'detailed' ? 'Workout complete.' : 'Complete.', config);
      return;
    }
    if (event.type === 'session-paused' || event.type === 'step-skipped' || event.type === 'step-restarted') {
      this.generation += 1;
      this.cancelSpeech();
      this.stopSources();
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
