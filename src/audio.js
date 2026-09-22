const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n) || 0));

export const BUILTIN_CUE_PROFILES = Object.freeze({
  standard: { id: 'standard', title: 'Standard', sound: true, voice: false, haptics: true, countdownCues: true, soundPack: 'clean', warningSeconds: 10, halfwayCue: false, voiceVerbosity: 'normal', voiceRate: 1.05, profileGain: 1 },
  quiet: { id: 'quiet', title: 'Quiet', sound: true, voice: false, haptics: false, countdownCues: true, soundPack: 'minimal', warningSeconds: 0, halfwayCue: false, voiceVerbosity: 'minimal', voiceRate: 1, profileGain: 0.5 },
  'voice-coach': { id: 'voice-coach', title: 'Voice Coach', sound: true, voice: true, haptics: true, countdownCues: true, soundPack: 'clean', warningSeconds: 10, halfwayCue: true, voiceVerbosity: 'detailed', voiceRate: 1.02, profileGain: 0.9 },
  'loud-gym': { id: 'loud-gym', title: 'Loud Gym', sound: true, voice: false, haptics: true, countdownCues: true, soundPack: 'gym', warningSeconds: 10, halfwayCue: false, voiceVerbosity: 'normal', voiceRate: 1.05, profileGain: 1.25 },
  silent: { id: 'silent', title: 'Silent', sound: false, voice: false, haptics: false, countdownCues: false, soundPack: 'minimal', warningSeconds: 0, halfwayCue: false, voiceVerbosity: 'minimal', voiceRate: 1, profileGain: 0 }
});

const tone = (freq, duration, delay = 0, gain = 0.08, type = 'sine') => ({ freq, duration, delay, gain, type });

export const SOUND_PACKS = Object.freeze({
  clean: {
    title: 'Clean',
    work: [tone(920, .09, 0, .09, 'square'), tone(1160, .1, .12, .09, 'square')],
    rest: [tone(540, .16, 0, .075)],
    prepare: [tone(680, .1, 0, .07)],
    finish: [tone(740, .16, 0, .09), tone(920, .16, .15, .09), tone(1180, .19, .3, .1)],
    countdown: [tone(820, .055, 0, .065, 'square')],
    warning: [tone(660, .075, 0, .06), tone(660, .075, .11, .06)],
    halfway: [tone(760, .06, 0, .055)]
  },
  gym: {
    title: 'Gym',
    work: [tone(760, .12, 0, .14, 'sawtooth'), tone(1120, .14, .13, .14, 'square')],
    rest: [tone(430, .22, 0, .12, 'square')],
    prepare: [tone(620, .12, 0, .1, 'square')],
    finish: [tone(660, .18, 0, .14, 'sawtooth'), tone(880, .18, .16, .14, 'square'), tone(1240, .24, .34, .15, 'square')],
    countdown: [tone(900, .07, 0, .11, 'square')],
    warning: [tone(520, .09, 0, .1, 'square'), tone(780, .09, .12, .1, 'square')],
    halfway: [tone(700, .08, 0, .09, 'square')]
  },
  boxing: {
    title: 'Boxing',
    work: [tone(1040, .18, 0, .11), tone(1320, .22, .08, .09)],
    rest: [tone(580, .25, 0, .085), tone(470, .18, .16, .065)],
    prepare: [tone(760, .13, 0, .075)],
    finish: [tone(980, .25, 0, .11), tone(1260, .28, .2, .1), tone(1540, .3, .42, .09)],
    countdown: [tone(860, .065, 0, .07)],
    warning: [tone(690, .11, 0, .075), tone(690, .11, .14, .075)],
    halfway: [tone(810, .09, 0, .065)]
  },
  minimal: {
    title: 'Minimal',
    work: [tone(960, .035, 0, .045, 'square')],
    rest: [tone(560, .04, 0, .04, 'square')],
    prepare: [tone(700, .035, 0, .04)],
    finish: [tone(820, .05, 0, .05), tone(1040, .06, .09, .05)],
    countdown: [tone(760, .025, 0, .035, 'square')],
    warning: [tone(650, .03, 0, .035)],
    halfway: [tone(720, .025, 0, .03)]
  },
  calm: {
    title: 'Calm',
    work: [tone(660, .18, 0, .055), tone(880, .2, .18, .045)],
    rest: [tone(440, .24, 0, .045)],
    prepare: [tone(550, .16, 0, .045)],
    finish: [tone(550, .22, 0, .05), tone(660, .22, .2, .05), tone(880, .3, .4, .05)],
    countdown: [tone(620, .06, 0, .04)],
    warning: [tone(510, .08, 0, .04)],
    halfway: [tone(590, .07, 0, .035)]
  },
  retro: {
    title: 'Retro',
    work: [tone(880, .08, 0, .08, 'square'), tone(1320, .08, .1, .08, 'square')],
    rest: [tone(330, .14, 0, .07, 'square')],
    prepare: [tone(660, .08, 0, .065, 'square')],
    finish: [tone(660, .1, 0, .08, 'square'), tone(880, .1, .12, .08, 'square'), tone(1320, .16, .24, .08, 'square')],
    countdown: [tone(990, .045, 0, .06, 'square')],
    warning: [tone(440, .055, 0, .06, 'square'), tone(660, .055, .08, .06, 'square')],
    halfway: [tone(770, .05, 0, .05, 'square')]
  }
});

export function cueProfileList(customProfiles = []) {
  return [...Object.values(BUILTIN_CUE_PROFILES), ...(customProfiles || [])];
}

export function cueProfileById(id, customProfiles = []) {
  return (customProfiles || []).find((item) => item.id === id) || BUILTIN_CUE_PROFILES[id] || BUILTIN_CUE_PROFILES.standard;
}

export function profileSettings(profile = BUILTIN_CUE_PROFILES.standard) {
  return {
    sound: profile.sound !== false,
    voice: Boolean(profile.voice),
    haptics: profile.haptics !== false,
    countdownCues: profile.countdownCues !== false,
    soundPack: SOUND_PACKS[profile.soundPack] ? profile.soundPack : 'clean',
    warningSeconds: clamp(profile.warningSeconds ?? 10, 0, 60),
    halfwayCue: Boolean(profile.halfwayCue),
    voiceVerbosity: ['minimal', 'normal', 'detailed'].includes(profile.voiceVerbosity) ? profile.voiceVerbosity : 'normal',
    voiceRate: clamp(profile.voiceRate || 1.05, .6, 1.6),
    profileGain: clamp(profile.profileGain ?? 1, 0, 2),
    soundWork: profile.soundWork || '', soundRest: profile.soundRest || '', soundPrepare: profile.soundPrepare || '',
    soundCountdown: profile.soundCountdown || '', soundWarning: profile.soundWarning || '', soundHalfway: profile.soundHalfway || '', soundFinish: profile.soundFinish || ''
  };
}

export function resolveCueConfig(settings = {}, customProfiles = [], routineOverrides = {}, stepOverrides = {}) {
  const selectedProfileId = routineOverrides.profileId || settings.cueProfileId || 'standard';
  const profile = profileSettings(cueProfileById(selectedProfileId, customProfiles));
  const useGlobalCurrent = !routineOverrides.profileId;
  const globalCurrent = useGlobalCurrent ? {
    sound: settings.sound,
    voice: settings.voice,
    haptics: settings.haptics,
    countdownCues: settings.countdownCues,
    soundPack: settings.soundPack,
    warningSeconds: settings.warningSeconds,
    halfwayCue: settings.halfwayCue,
    voiceVerbosity: settings.voiceVerbosity,
    voiceRate: settings.voiceRate,
    profileGain: settings.profileGain,
    soundWork: settings.soundWork, soundRest: settings.soundRest, soundPrepare: settings.soundPrepare,
    soundCountdown: settings.soundCountdown, soundWarning: settings.soundWarning, soundHalfway: settings.soundHalfway, soundFinish: settings.soundFinish
  } : {};
  const merged = { ...profile };
  for (const source of [globalCurrent, routineOverrides]) {
    for (const [key, value] of Object.entries(source || {})) if (value !== undefined && value !== '') merged[key] = value;
  }
  merged.sound = merged.sound !== false;
  merged.voice = Boolean(merged.voice);
  merged.haptics = merged.haptics !== false;
  merged.countdownCues = merged.countdownCues !== false;
  merged.soundPack = SOUND_PACKS[merged.soundPack] ? merged.soundPack : 'clean';
  merged.warningSeconds = clamp(merged.warningSeconds ?? 0, 0, 60);
  merged.halfwayCue = Boolean(merged.halfwayCue);
  merged.voiceVerbosity = ['minimal', 'normal', 'detailed'].includes(merged.voiceVerbosity) ? merged.voiceVerbosity : 'normal';
  merged.voiceRate = clamp(merged.voiceRate || 1.05, .6, 1.6);
  merged.masterVolume = clamp(settings.masterVolume ?? 1, 0, 1);
  merged.voiceVolume = clamp(settings.voiceVolume ?? .9, 0, 1);
  merged.voiceURI = settings.voiceURI || '';
  merged.transitionSound = stepOverrides.transitionSound || '';
  merged.voiceMode = stepOverrides.voiceMode || 'inherit';
  merged.voiceText = stepOverrides.voiceText || '';
  merged.customPercent = stepOverrides.customPercent === undefined || stepOverrides.customPercent === '' ? undefined : clamp(stepOverrides.customPercent, 1, 99);
  merged.customSound = stepOverrides.customSound || '';
  if (stepOverrides.warningSeconds !== undefined && stepOverrides.warningSeconds !== '') merged.warningSeconds = clamp(stepOverrides.warningSeconds, 0, 60);
  if (stepOverrides.halfway !== undefined && stepOverrides.halfway !== 'inherit') merged.halfwayCue = stepOverrides.halfway === true || stepOverrides.halfway === 'on';
  return merged;
}

export function soundRecipe(packId = 'clean', kind = 'work') {
  const pack = SOUND_PACKS[packId] || SOUND_PACKS.clean;
  return pack[kind] || pack.work || [];
}

export function speechForStep(step = {}, config = {}, nextStep) {
  if (config.voiceMode === 'off') return '';
  if (config.voiceMode === 'custom') return String(config.voiceText || '').trim();
  const label = String(step.label || '').trim();
  if (!label) return '';
  if (config.voiceMode === 'label' || config.voiceVerbosity === 'minimal') return label;
  const phase = String(step.phase || '').toLowerCase();
  const phaseWord = phase === 'rest' || phase === 'recovery' || phase === 'cooldown' ? 'Rest' : phase === 'prepare' ? 'Get ready' : 'Work';
  if (config.voiceVerbosity === 'normal') return phaseWord === label ? label : `${phaseWord}. ${label}.`;
  const parts = [];
  if (step.round?.current && step.round?.total) parts.push(`Round ${step.round.current} of ${step.round.total}.`);
  parts.push(phaseWord === label ? `${label}.` : `${phaseWord}. ${label}.`);
  if (step.durationMs) parts.push(`${Math.round(step.durationMs / 1000)} seconds.`);
  else if (step.timeCapMs) parts.push(`Up to ${Math.round(step.timeCapMs / 1000)} seconds.`);
  if (nextStep?.label) parts.push(`Next, ${nextStep.label}.`);
  return parts.join(' ');
}

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

async function showTimerNotification(title, options = {}) {
  if (!('Notification' in globalThis) || Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        icon: './icon.svg', badge: './icon.svg',
        ...options,
        data: { ...(options.data || {}) }
      });
      return true;
    }
    new Notification(title, options);
    return true;
  } catch { return false; }
}

export async function showCompletionNotification(title, body = 'Timer complete', { sessionId } = {}) {
  return showTimerNotification(title, {
    body,
    tag: sessionId ? `timer-complete:${sessionId}` : 'timer-complete',
    renotify: true,
    data: { url: sessionId ? `./?launch=session&id=${encodeURIComponent(sessionId)}` : './?launch=active', type: 'completion', sessionId }
  });
}

export async function showActiveSessionNotification(title, body = 'Timer is running') {
  return showTimerNotification(title, {
    body,
    tag: 'timer-active',
    silent: true,
    renotify: false,
    data: { url: './?launch=active', type: 'active' }
  });
}

export async function closeTimerNotification(tag = 'timer-active') {
  try {
    const reg = await navigator.serviceWorker?.ready;
    const notifications = await reg?.getNotifications?.({ tag });
    for (const notification of notifications || []) notification.close();
    return true;
  } catch { return false; }
}
