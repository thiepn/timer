import {
  TimerEngine, BrowserClock, formatClock, estimatePlanDuration,
  buildCountdown, buildInterval, buildCircuit, buildBoxing, buildRunWalk,
  buildEmom, buildAmrap, buildForTime, buildStopwatch, buildLadder, buildPyramid,
  buildCustomRoutine, validateCustomRoutine, collectCustomParameterRefs, resolveCustomParameterValues, formulaVariableName
} from './core.js';
import { TimerDB, defaultSettings, requestPersistentStorage, storageEstimate } from './db.js';
import { CueManager, WakeLockManager, requestNotificationPermission, showCompletionNotification, showActiveSessionNotification, closeTimerNotification, BUILTIN_CUE_PROFILES, SOUND_PACKS, cueProfileById, profileSettings } from './audio.js';
import { analyzeSession, comparisonFingerprint, comparableSessions, objectiveRecord, factualTrend, summarizeRange, startOfLocalDay, startOfLocalWeek, monthCalendar, sessionsToCsv } from './analytics.js';
import { createBackupArchive, verifyBackupArchive, encryptBackupArchive, decryptBackupArchive, isLegacyBackup, isEncryptedBackup, isBackupArchive, isRoutinePackage, backupCounts } from './resilience.js';
import { SessionOwnershipManager, MediaSessionManager, parseLaunchCommand, detectDeviceCapabilities } from './device.js';
import { LOCALE_OPTIONS, resolveLocale, applyDocumentLocale, localizeDOM, translateSource, translateBuiltInLabel, phaseLabel as localizedPhaseLabel, formatDuration, formatDate, formatNumber, t as i18nT } from './i18n.js';
import { FocusTrap, Announcer, focusMainHeading, isInteractiveTarget, timerEventAnnouncement } from './accessibility.js';
import { PerformanceMetrics, MaintenanceCoordinator, liveSchedulerPolicy, reduceMotionEnabled } from './performance.js';
import { TimerCoordinator, COMPLETION_ACTIONS, normalizeCompletionAction } from './coordinator.js';
import { parseDurationInput, durationInputText, normalizeDurationList, pushRecentDuration, DEFAULT_QUICK_PRESETS, DEFAULT_QUICK_ADJUSTMENTS } from './quick.js';
import { DEFAULT_SAVED_TIMER_COLLECTIONS, SAVED_TIMER_ACCENTS, normalizeSavedTimerRecord, normalizeSavedTimerTags, normalizeSavedTimerCollections, needsSavedTimerMigration, savedTimerSearchText, savedTimerMatchesView, sortSavedTimers, duplicateSavedTimerRecord } from './saved.js';
import { QUEUE_STEP_ACTIONS, normalizeQueuePreset, normalizeQueueStepAction, createQueueRun, normalizeQueueRun, queueCurrentItem, queueProgress, advanceQueueRun, reorderQueueItems, queuePresetFromTimerIds } from './queue.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
const ms = (seconds) => Math.max(0, Math.round(Number(seconds || 0) * 1000));
const sec = (milliseconds) => Math.round(Number(milliseconds || 0) / 1000);
const mins = (minutes) => ms(Number(minutes || 0) * 60);
const pct = (n) => `${Math.round(clamp(n || 0, 0, 1) * 100)}%`;
const APP_VERSION = '2.5.0';

const BUILDER_META = {
  countdown: { name: 'Countdown', desc: 'Reusable fixed-duration countdown' },
  interval: { name: 'Interval', desc: 'Work / rest repetitions' },
  tabata: { name: 'Tabata', desc: 'Classic 20 / 10 intervals' },
  circuit: { name: 'Circuit', desc: 'Timed and manual exercise sequence' },
  emom: { name: 'EMOM', desc: 'Every minute / custom block timing' },
  amrap: { name: 'AMRAP', desc: 'As many rounds as possible' },
  'for-time': { name: 'For Time', desc: 'Race a workout against the clock' },
  boxing: { name: 'Boxing', desc: 'Rounds with fixed recovery' },
  'run-walk': { name: 'Run / Walk', desc: 'Alternating running and recovery' },
  ladder: { name: 'Ladder', desc: 'Progressively changing work intervals' },
  pyramid: { name: 'Pyramid', desc: 'Ramp up and back down' },
  custom: { name: 'Sequence Timer', desc: 'Nested sections, repeats, timed and manual steps' },
  stopwatch: { name: 'Stopwatch', desc: 'Open-ended timer with laps' }
};

function defaultConfig(type) {
  switch (type) {
    case 'countdown': return { title: 'Countdown', duration: 300 };
    case 'tabata': return { title: 'Tabata', work: 20, rest: 10, rounds: 8, prepare: 10, finalRest: false };
    case 'circuit': return { title: 'Circuit', rounds: 3, prepare: 10, between: 0, items: [
      { label: 'Push-ups', seconds: 40, phase: 'work', manual: false },
      { label: 'Rest', seconds: 20, phase: 'rest', manual: false },
      { label: 'Squats', seconds: 40, phase: 'work', manual: false },
      { label: 'Rest', seconds: 20, phase: 'rest', manual: false }
    ] };
    case 'emom': return { title: 'EMOM', minutes: 10, blockMinutes: 1, alternating: false, labelA: 'Work', labelB: 'Work 2', targetA: '', targetB: '' };
    case 'amrap': return { title: '15-minute AMRAP', duration: 15, movements: '5 Pull-ups\n10 Push-ups\n15 Squats' };
    case 'for-time': return { title: 'For Time', rounds: 3, cap: 20, movements: '21 Thrusters\n15 Pull-ups\n9 Burpees' };
    case 'boxing': return { title: 'Boxing', rounds: 8, roundMinutes: 3, restMinutes: 1, prepare: 10, finalRest: false };
    case 'run-walk': return { title: 'Run / Walk', rounds: 10, runMinutes: 2, walkMinutes: 1, warmupMinutes: 5, cooldownMinutes: 5, finalWalk: true };
    case 'ladder': return { title: 'Ascending Ladder', start: 20, step: 10, levels: 5, rest: 10, direction: 'up' };
    case 'pyramid': return { title: 'Pyramid', start: 20, peak: 60, step: 10, rest: 10 };
    case 'custom': return { title: 'Sequence Timer', parameters: [], durationScale: 1, targetDurationMinutes: 0, randomMode: 'new', fixedSeed: 'timer-seed', nodes: [{ id: uid('node'), type: 'repeat', count: 3, children: [
      { id: uid('node'), type: 'timed', label: 'Work', phase: 'work', durationMs: 40000 },
      { id: uid('node'), type: 'timed', label: 'Rest', phase: 'rest', durationMs: 20000 }
    ] }] };
    case 'stopwatch': return { title: 'Stopwatch' };
    default: return { title: '40 / 20 Interval', work: 40, rest: 20, rounds: 10, prepare: 10, finalRest: false };
  }
}

function parseMovements(text = '') {
  return String(text).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 50).map((line) => {
    const m = line.match(/^([0-9]+(?:\.[0-9]+)?)\s+(.+)$/);
    return m ? { target: m[1], label: m[2] } : { label: line };
  });
}

function planFromType(type, c, options = {}) {
  switch (type) {
    case 'countdown': return buildCountdown({ durationMs: ms(c.duration), label: c.title || 'Countdown' });
    case 'tabata':
    case 'interval': return buildInterval({ workMs: ms(c.work), restMs: ms(c.rest), rounds: c.rounds, prepareMs: ms(c.prepare), finalRest: !!c.finalRest, workLabel: 'Work', restLabel: 'Rest' });
    case 'circuit': return buildCircuit({
      title: c.title || 'Circuit', rounds: c.rounds, prepareMs: ms(c.prepare), betweenRoundsMs: ms(c.between), items: (c.items || []).map((x) => ({
        label: x.label || (x.phase === 'rest' ? 'Rest' : 'Work'), phase: x.phase || 'work', manual: !!x.manual,
        durationMs: x.manual ? undefined : ms(x.seconds || 1), timeCapMs: x.manual && x.seconds > 0 ? ms(x.seconds) : undefined,
        target: x.target || undefined
      }))
    });
    case 'emom': return buildEmom({
      minutes: c.minutes, blockMs: mins(c.blockMinutes), labels: c.alternating ? [c.labelA || 'Work A', c.labelB || 'Work B'] : [c.labelA || 'Work'],
      targets: c.alternating ? [c.targetA, c.targetB] : [c.targetA]
    });
    case 'amrap': return buildAmrap({ durationMs: mins(c.duration), title: c.title || 'AMRAP', movements: parseMovements(c.movements) });
    case 'for-time': return buildForTime({ title: c.title || 'For Time', timeCapMs: c.cap > 0 ? mins(c.cap) : undefined, rounds: Number(c.rounds) || 1, movements: parseMovements(c.movements) });
    case 'boxing': return buildBoxing({ rounds: c.rounds, roundMs: mins(c.roundMinutes), restMs: mins(c.restMinutes), prepareMs: ms(c.prepare), finalRest: !!c.finalRest });
    case 'run-walk': return buildRunWalk({ rounds: c.rounds, runMs: mins(c.runMinutes), walkMs: mins(c.walkMinutes), warmupMs: mins(c.warmupMinutes), cooldownMs: mins(c.cooldownMinutes), finalWalk: !!c.finalWalk });
    case 'ladder': return buildLadder({ title: c.title || 'Ladder', startMs: ms(c.start), stepMs: ms(c.step), levels: c.levels, restMs: ms(c.rest), direction: c.direction });
    case 'pyramid': return buildPyramid({ title: c.title || 'Pyramid', startMs: ms(c.start), peakMs: ms(c.peak), stepMs: ms(c.step), restMs: ms(c.rest) });
    case 'custom': return buildCustomRoutine({ title: c.title || 'Sequence Timer', nodes: c.nodes || [], parameters: c.parameters || [], parameterValues: options.parameterValues || {}, blocks: options.blocks || state.blocks || [], seed: options.seed ?? (c.randomMode === 'fixed' ? (c.fixedSeed || 'timer-seed') : 'preview'), durationScale: Number(c.durationScale || 1), targetDurationMs: Number(c.targetDurationMinutes) > 0 ? mins(c.targetDurationMinutes) : undefined });
    case 'stopwatch': return buildStopwatch();
    default: throw new Error(`Unknown builder type: ${type}`);
  }
}

function metaForType(type, config, cueOverrides = {}) {
  return { mode: type, title: config.title || BUILDER_META[type]?.name || 'Timer', config: structuredClone(config), cueOverrides: structuredClone(cueOverrides || {}) };
}

function typeSummary(type, c) {
  switch (type) {
    case 'countdown': return durationLabel(ms(c.duration));
    case 'interval':
    case 'tabata': return `${c.work}s / ${c.rest}s · ${c.rounds} rounds`;
    case 'circuit': return `${c.rounds} rounds · ${(c.items || []).length} steps`;
    case 'emom': return `${c.minutes} min · every ${c.blockMinutes} min`;
    case 'amrap': return `${c.duration} min`;
    case 'for-time': return `${c.rounds} round${Number(c.rounds) === 1 ? '' : 's'}${c.cap ? ` · ${c.cap}m cap` : ''}`;
    case 'boxing': return `${c.rounds} × ${c.roundMinutes}m / ${c.restMinutes}m`;
    case 'run-walk': return `${c.rounds} × ${c.runMinutes}m / ${c.walkMinutes}m`;
    case 'ladder': return `${c.levels} levels · ${c.start}s +${c.step}s`;
    case 'pyramid': return `${c.start}s → ${c.peak}s → ${c.start}s`;
    case 'custom': {
      const count = countCustomNodes(c.nodes || []);
      const params = (c.parameters || []).length;
      return `${count} source item${count === 1 ? '' : 's'}${params ? ` · ${params} parameter${params === 1 ? '' : 's'}` : ''}`;
    }
    case 'stopwatch': return 'Open-ended';
    default: return '';
  }
}

function countCustomNodes(nodes = []) {
  return (nodes || []).reduce((total, node) => total + 1 + ((['repeat','section','random'].includes(node?.type)) ? countCustomNodes(node.children || []) : 0), 0);
}

const state = {
  route: 'timer',
  db: new TimerDB(),
  settings: { ...defaultSettings },
  routines: [],
  queues: [],
  activeQueue: null,
  queueDraft: null,
  queueDragIndex: null,
  queueTransitionRuntimeIds: new Set(),
  blocks: [],
  cueProfiles: [],
  customSounds: [],
  availableVoices: [],
  sessions: [],
  builder: null,
  builderEditingId: null,
  builderEditingBlockId: null,
  builderCueOverrides: {},
  quickMs: 120000,
  quickInput: '2m',
  quickInputError: '',
  quickSettingsWriteChain: Promise.resolve(),
  engine: null,
  engineUnsub: null,
  activeMeta: null,
  activeTimerId: null,
  finalizingTimers: new Set(),
  multiTimerTimeout: 0,
  liveRaf: 0,
  liveTimeout: 0,
  liveLastFrame: 0,
  liveSemanticKey: '',
  liveModeKey: '',
  liveSchedulerKind: 'idle',
  lastLiveSecond: null,
  lastProgress: -1,
  finalized: false,
  completion: null,
  installPrompt: null,
  liveLocked: false,
  controlsHidden: false,
  wallHideTimer: 0,
  storagePersistent: null,
  storageEstimate: null,
  libraryQuery: '',
  librarySearchActive: false,
  libraryView: 'all',
  librarySort: 'recent',
  savedSelectMode: false,
  savedSelected: new Set(),
  pendingSavedMoveIds: [],
  workspaceFocusId: null,
  customClipboard: null,
  pendingStart: null,
  historyView: 'list',
  historyQuery: '',
  historyMode: 'all',
  historyMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime(),
  historyLoadedAll: false,
  historyLoading: false,
  historyVisible: 100,
  historySearchTimer: 0,
  pendingRestore: null,
  recoverySnapshots: [],
  quarantineItems: [],
  dataHealth: null,
  lastRestoreSnapshotId: null,
  remoteActive: null,
  remoteActiveSessions: [],
  remoteFocusedTimerId: null,
  remoteEngine: null,
  remoteRaf: 0,
  remoteTimer: 0,
  displayMode: false,
  pendingTakeover: false,
  launchCommand: { type: 'HOME' },
  swRegistration: null,
  updateReady: false,
  updateDeferred: false,
  reloadOnControllerChange: false,
  deviceCapabilities: null,
  locale: 'en',
  bootPerformance: null
};

const perf = new PerformanceMetrics();
perf.mark('app:module');
const maintenance = new MaintenanceCoordinator();

const currentLocale = () => state.locale || resolveLocale(state.settings?.language || 'system');
const tr = (key, vars = {}) => i18nT(key, currentLocale(), vars);
const durationLabel = (value, options = {}) => formatDuration(value, currentLocale(), { numberingSystem: state.settings?.numberSystem || 'system', ...options });
const uiDate = (value, options = {}) => formatDate(value, currentLocale(), options, state.settings?.timeFormat || 'system', state.settings?.numberSystem || 'system');
const uiNumber = (value, options = {}) => formatNumber(value, currentLocale(), options, state.settings?.numberSystem || 'system');

function quickPresets() {
  return normalizeDurationList(state.settings.quickPresets || DEFAULT_QUICK_PRESETS, { limit: 8 });
}

function quickRecentDurations() {
  return normalizeDurationList(state.settings.quickRecentDurations || [], { limit: 8 });
}

function quickAdjustments() {
  const values = normalizeDurationList(state.settings.quickAdjustments || DEFAULT_QUICK_ADJUSTMENTS, { limit: 3, maxMs: 3600000 });
  return values.length === 3 ? values : [...DEFAULT_QUICK_ADJUSTMENTS];
}

function setQuickDuration(milliseconds, { syncInput = true } = {}) {
  const parsed = parseDurationInput(`${Math.max(1, Math.round(Number(milliseconds || 0) / 1000))}s`);
  if (!parsed.ok) return false;
  state.quickMs = parsed.ms;
  state.quickInputError = '';
  if (syncInput) state.quickInput = durationInputText(parsed.ms);
  return true;
}

function quickInputResult(value = state.quickInput) {
  return parseDurationInput(value);
}

function updateQuickInputFeedback() {
  const input = $('[data-quick-input]');
  const preview = $('[data-quick-preview]');
  const start = $('[data-action="start-quick-input"]');
  if (!input) return;
  const result = quickInputResult(input.value);
  state.quickInput = input.value;
  state.quickInputError = result.ok ? '' : result.error;
  if (result.ok) {
    state.quickMs = result.ms;
    input.setAttribute('aria-invalid', 'false');
    if (preview) { preview.textContent = `${durationLabel(result.ms)} · ready to start`; preview.classList.remove('error-text'); }
    if (start) start.disabled = false;
  } else {
    input.setAttribute('aria-invalid', 'true');
    if (preview) { preview.textContent = result.error; preview.classList.add('error-text'); }
    if (start) start.disabled = true;
  }
}

function rememberQuickDuration(milliseconds) {
  state.settings.quickRecentDurations = pushRecentDuration(state.settings.quickRecentDurations || [], milliseconds, 8);
  const snapshot = structuredClone(state.settings);
  state.quickSettingsWriteChain = state.quickSettingsWriteChain
    .catch(() => {})
    .then(() => state.db.saveSettings(snapshot))
    .catch(() => {});
  return state.quickSettingsWriteChain;
}

async function startQuickDuration(milliseconds, { background = false } = {}) {
  if (!setQuickDuration(milliseconds)) return toast('Choose a valid Quick Timer duration.');
  const duration = state.quickMs;
  void rememberQuickDuration(duration);
  const title = `${durationLabel(duration)} Timer`;
  return startSession(buildCountdown({ durationMs: duration, label: title }), { mode: 'countdown', title, config: { durationMs: duration }, source: 'quick' }, { background });
}


async function saveQuickTimerPreset() {
  const input = $('[data-quick-input]');
  const result = parseDurationInput(input?.value || state.quickInput);
  if (!result.ok) return toast(result.error, 4200);
  const title = `${durationLabel(result.ms)} Countdown`;
  const timer = normalizeSavedTimerRecord({
    id: uid('routine'),
    type: 'countdown',
    title,
    config: { title, duration: Math.max(1, result.ms / 1000) },
    durationMs: result.ms,
    createdAt: Date.now()
  });
  await state.db.saveRoutine(timer);
  await loadCollections();
  toast('Countdown saved to Saved Timers.');
}

const cue = new CueManager(() => ({ ...state.settings, voice: state.settings.screenReaderOptimized ? false : state.settings.voice }), () => state.cueProfiles, async (id) => state.db.get('customSounds', id));
const wakeLock = new WakeLockManager();
const ownership = new SessionOwnershipManager();
const coordinator = new TimerCoordinator();
const mediaSession = new MediaSessionManager();
const sheetFocus = new FocusTrap();
const main = $('#app-main');
const appShell = $('#app');
const header = $('#app-header');
const bottomNav = $('#bottom-nav');
const importFile = $('#import-file');
const announcer = new Announcer($('#a11y-live-polite'), $('#a11y-live-assertive'));

let localizationQueued = false;
function localizeNow(root = document.body) {
  applyDocumentLocale(currentLocale());
  localizeDOM(root, currentLocale());
}
function scheduleLocalization(root = document.body) {
  if (localizationQueued) return;
  localizationQueued = true;
  queueMicrotask(() => { localizationQueued = false; localizeNow(root); });
}
const localizationObserver = new MutationObserver((records) => {
  if (records.some((record) => record.addedNodes?.length)) scheduleLocalization(document.body);
});
localizationObserver.observe(document.body, { childList: true, subtree: true });

function toast(message, timeout = 2600) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.append(el);
  setTimeout(() => el.remove(), timeout);
}


function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function clearLaunchQuery() {
  try {
    const url = new URL(location.href);
    if (!url.searchParams.has('launch')) return;
    url.searchParams.delete('launch');
    url.searchParams.delete('id');
    url.searchParams.delete('duration');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {}
}

function hasOwnedActiveTimers() { return coordinator.size() > 0; }
function focusedRuntime() { return state.activeTimerId ? coordinator.get(state.activeTimerId) : null; }
function focusedView() { return state.activeTimerId ? coordinator.view(state.activeTimerId) : null; }

function syncFocusedRuntime(runtimeId = state.activeTimerId) {
  const runtime = runtimeId ? coordinator.get(runtimeId) : null;
  state.activeTimerId = runtime?.id || null;
  state.engine = runtime?.engine || null;
  state.activeMeta = runtime?.meta || null;
  return runtime;
}

function renderUpdateBanner() {
  const root = $('#update-root');
  if (!root) return;
  if (!state.updateReady) { root.innerHTML = ''; return; }
  const active = hasOwnedActiveTimers() || Boolean(state.remoteActive);
  const deferred = state.updateDeferred;
  root.innerHTML = `<div class="update-banner" role="status"><span>${active ? (deferred ? 'Update queued for after active timers.' : 'Update ready. It will not interrupt active timers.') : 'Timer update ready.'}</span><button class="btn ${active ? '' : 'primary'}" data-action="apply-update">${active ? 'Update after timers' : 'Update now'}</button></div>`;
}

function configureMediaSession() {
  const runtimeId = state.activeTimerId;
  const view = focusedView();
  if (!state.settings.mediaControls || !runtimeId || !view || !mediaSession.supported()) { mediaSession.disable(); return; }
  mediaSession.enable({
    play: () => { if (focusedView()?.status === 'paused') { coordinator.resume(runtimeId); updateLiveView(true); } },
    pause: () => { if (['running','overtime'].includes(focusedView()?.status)) { coordinator.pause(runtimeId); updateLiveView(true); } },
    next: () => { coordinator.command(runtimeId, 'next'); updateLiveView(true); },
    previous: () => { coordinator.command(runtimeId, 'previous'); updateLiveView(true); },
    stop: () => { if (['running','overtime'].includes(focusedView()?.status)) { coordinator.pause(runtimeId); updateLiveView(true); } }
  });
  mediaSession.update(view);
}

function activeSnapshotBundle() {
  return { sessions: coordinator.snapshots(), focusedTimerId: state.activeTimerId };
}

function broadcastActiveSnapshot() {
  if (!ownership.isOwner()) return;
  const bundle = activeSnapshotBundle();
  if (bundle.sessions.length) ownership.post('ACTIVE_SNAPSHOT', bundle);
  else ownership.post('NO_ACTIVE_TIMERS');
}

function startOwnershipHeartbeat() {
  ownership.startHeartbeat(() => hasOwnedActiveTimers() ? activeSnapshotBundle() : null, 1500);
}

function selectRemoteRecord(bundle) {
  const sessions = Array.isArray(bundle?.sessions) ? bundle.sessions : (bundle?.snapshot ? [{ id: bundle.snapshot.id, snapshot: bundle.snapshot, meta: bundle.meta }] : []);
  const live = sessions.filter((record) => record?.snapshot && (record.overtime || !['completed','cancelled'].includes(record.snapshot.status)));
  if (!live.length) return { sessions: [], focused: null };
  const focusedId = bundle?.focusedTimerId;
  const focused = live.find((record) => record.id === focusedId) || live[0];
  return { sessions: live, focused };
}

function setRemoteActive(bundle) {
  const { sessions, focused } = selectRemoteRecord(bundle);
  state.remoteActiveSessions = structuredClone(sessions);
  state.remoteFocusedTimerId = focused?.id || null;
  if (!focused) {
    state.remoteActive = null;
    state.remoteEngine = null;
    cancelAnimationFrame(state.remoteRaf);
    clearTimeout(state.remoteTimer);
    state.remoteRaf = 0;
    state.remoteTimer = 0;
    return;
  }
  state.remoteActive = structuredClone(focused);
  try { state.remoteEngine = TimerEngine.restore(focused.snapshot, new BrowserClock()); }
  catch { state.remoteEngine = null; }
}

function remoteActiveView() {
  const base = state.remoteEngine?.view?.();
  const record = state.remoteActive;
  if (!record?.overtime) return base;
  const persisted = Math.max(0, Number(record.overtime.accumulatedMs) || 0);
  const checkpointWallAt = Number(record.overtime.checkpointWallAt);
  const wallAt = Number.isFinite(checkpointWallAt) ? checkpointWallAt : (Number(record.updatedAt) || Date.now());
  const elapsed = record.overtime.paused ? persisted : persisted + Math.max(0, Date.now() - wallAt);
  return {
    ...(base || {}),
    status: record.overtime.paused ? 'paused' : 'overtime',
    overtimeMs: elapsed,
    current: {
      ...(base?.current || {}),
      label: base?.title || record.meta?.title || 'Timer',
      phase: 'custom',
      remainingMs: undefined,
      elapsedMs: elapsed,
      progress: undefined
    }
  };
}

function renderRemoteActive() {
  cancelAnimationFrame(state.remoteRaf);
  clearTimeout(state.remoteTimer);
  state.remoteRaf = 0;
  state.remoteTimer = 0;
  setLiveMode(true);
  const engine = state.remoteEngine;
  const view = remoteActiveView();
  if (!engine || !view || (!state.remoteActive?.overtime && ['completed','cancelled'].includes(view.status))) {
    main.innerHTML = `<section class="remote-session-empty"><div class="brand-mark" aria-hidden="true">◷</div><h1>${state.displayMode ? 'Wall Display' : 'Active Timers'}</h1><p class="muted">No active timer is available from another window.</p>${state.displayMode ? '<button class="btn" data-action="close-display-window">Close display</button>' : '<button class="btn primary" data-action="remote-refresh">Check again</button>'}</section>`;
    return;
  }
  const count = state.remoteActiveSessions.length;
  if (state.displayMode) {
    main.innerHTML = `<section id="remote-live" class="live-shell layout-wall remote-display" data-phase="${esc(view.current?.phase || 'custom')}"><div class="live-top"><span id="remote-round" class="pill"></span><span class="pill">Display · read only${count > 1 ? ` · ${count} timers` : ''}</span></div><div class="live-main"><div id="remote-phase" class="live-phase"></div><div id="remote-time" class="live-time" role="timer"></div><div id="remote-label" class="live-label"></div></div><div class="remote-display-footer">Controlled by another Timer window</div></section>`;
  } else {
    main.innerHTML = `<section class="remote-session"><div class="quick-label">${count} active timer${count === 1 ? '' : 's'} in another window</div><div id="remote-time" class="quick-time"></div><h1 id="remote-label"></h1><p id="remote-phase" class="muted"></p><div class="stack"><button class="btn primary big" data-action="takeover-session">Take over all timers here</button><button class="btn" data-action="focus-owner">Focus owner window</button></div><p class="small muted">Only one window owns audio, Wake Lock and timer persistence at a time.</p></section>`;
  }
  const loop = () => {
    if (!state.remoteEngine || hasOwnedActiveTimers()) return;
    try { state.remoteEngine.reconcile(); } catch {}
    const v = remoteActiveView();
    if (!v || (!state.remoteActive?.overtime && ['completed','cancelled'].includes(v.status))) return;
    const current = v.current || {};
    const displayMs = v.status === 'overtime' ? v.overtimeMs : (current.remainingMs != null ? current.remainingMs : current.elapsedMs);
    const text = `${v.status === 'overtime' ? '+' : ''}${formatClock(displayMs, { tenths: v.mode === 'stopwatch', countUp: current.remainingMs == null })}`;
    if ($('#remote-time')) $('#remote-time').textContent = text;
    if ($('#remote-label')) $('#remote-label').textContent = current.label || v.title;
    if ($('#remote-phase')) $('#remote-phase').textContent = v.status === 'paused' ? 'Paused' : v.status === 'overtime' ? 'Overtime' : (current.phase || 'Time');
    if ($('#remote-round')) {
      const round = current.round;
      $('#remote-round').textContent = round ? `Round ${round.current} / ${round.total}` : v.title;
    }
    const shell = $('#remote-live'); if (shell) shell.dataset.phase = current.phase || 'custom';
    state.remoteTimer = setTimeout(loop, v.mode === 'stopwatch' ? 100 : 250);
  };
  loop();
}

async function persistRuntime(runtimeId) {
  const record = coordinator.snapshot(runtimeId);
  if (!record) return false;
  await state.db.saveActiveSession(record).catch(() => {});
  return true;
}

async function persistAllRuntimes() {
  await Promise.allSettled(coordinator.snapshots().map((record) => state.db.saveActiveSession(record)));
}

function focusRuntime(runtimeId, { renderNow = true } = {}) {
  const runtime = syncFocusedRuntime(runtimeId);
  if (!runtime) return false;
  state.completion = null;
  setRemoteActive(null);
  configureMediaSession();
  if (renderNow) renderLive();
  broadcastActiveSnapshot();
  return true;
}

async function restoreOwnedActive(records) {
  const valid = (records || []).filter((record) => record?.snapshot && (record.overtime || !['completed','cancelled'].includes(record.snapshot.status)));
  if (!valid.length) return false;
  try {
    setRemoteActive(null);
    coordinator.restore(valid);
    if (!coordinator.size()) return false;
    maintenance.suspend('active-session');
    for (const runtime of coordinator.list()) cue.beginSession(runtime.meta, runtime.id);
    const preferred = valid.find((record) => record.id === state.launchCommand?.id)?.id || valid[0]?.id || coordinator.list()[0]?.id;
    syncFocusedRuntime(preferred);
    if (state.settings.keepAwake) wakeLock.acquire();
    configureMediaSession();
    startOwnershipHeartbeat();
    startCoordinatorScheduler();
    broadcastActiveSnapshot();
    if (!state.displayMode) renderLive();
    return true;
  } catch {
    coordinator.clear();
    syncFocusedRuntime(null);
    return false;
  }
}

async function relinquishRuntimeOwnership() {
  if (!ownership.isOwner()) return;
  const bundle = activeSnapshotBundle();
  await persistAllRuntimes();
  stopLiveScheduler();
  stopCoordinatorScheduler();
  maintenance.resume('active-session');
  cue.endAllSessions();
  await wakeLock.release();
  for (const record of bundle.sessions) await closeTimerNotification(`timer-active:${record.id}`);
  mediaSession.disable();
  coordinator.clear();
  syncFocusedRuntime(null);
  if (bundle.sessions.length) setRemoteActive(bundle);
  ownership.stopHeartbeat();
  await ownership.release();
  ownership.post('OWNER_RELEASED', { timerIds: bundle.sessions.map((record) => record.id) });
  renderRemoteActive();
  renderUpdateBanner();
}

async function takeOverActiveSession() {
  if (ownership.isOwner()) return;
  state.pendingTakeover = true;
  ownership.requestTakeover();
  for (let i = 0; i < 20; i++) {
    if (await ownership.acquire()) {
      state.pendingTakeover = false;
      const records = await state.db.getActiveSessions().catch(() => []);
      if (records.length && await restoreOwnedActive(records)) return;
      await ownership.release();
      setRemoteActive(null);
      render();
      return toast('The active timers have already ended.');
    }
    await sleep(100);
  }
  state.pendingTakeover = false;
  toast('Could not take over the timers yet. Try again.', 3600);
}

async function handleOwnershipMessage(message) {
  if (!message?.type) return;
  if (message.type === 'ACTIVE_SNAPSHOT' && !ownership.isOwner()) {
    setRemoteActive(message);
    if (!hasOwnedActiveTimers()) renderRemoteActive();
    return;
  }
  if (message.type === 'NO_ACTIVE_TIMERS' && !ownership.isOwner()) {
    setRemoteActive(null);
    if (state.displayMode) renderRemoteActive(); else render();
    renderUpdateBanner();
    if (state.updateDeferred) setTimeout(() => applyUpdate(), 250);
    return;
  }
  if (message.type === 'TIMER_ENDED' && !ownership.isOwner()) {
    const remaining = state.remoteActiveSessions.filter((record) => record.id !== message.runtimeId);
    setRemoteActive({ sessions: remaining, focusedTimerId: state.remoteFocusedTimerId });
    if (!state.remoteActive) { if (state.displayMode) renderRemoteActive(); else render(); }
    return;
  }
  if (message.type === 'TAKEOVER_REQUEST' && ownership.isOwner()) {
    await relinquishRuntimeOwnership();
    return;
  }
  if (message.type === 'FOCUS_REQUEST' && ownership.isOwner()) {
    try { window.focus(); } catch {}
  }
}

ownership.onMessage(handleOwnershipMessage);

async function applyUpdate() {
  if (!state.updateReady || !state.swRegistration) return;
  if (hasOwnedActiveTimers() || state.remoteActive) {
    state.updateDeferred = true;
    renderUpdateBanner();
    return toast('Update queued for after the active timer.');
  }
  const waiting = state.swRegistration.waiting;
  if (!waiting) { state.updateReady = false; renderUpdateBanner(); return; }
  state.reloadOnControllerChange = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

function markUpdateReady(registration) {
  state.swRegistration = registration || state.swRegistration;
  state.updateReady = Boolean(state.swRegistration?.waiting);
  renderUpdateBanner();
}

async function handleLaunchCommand(command = { type: 'HOME' }) {
  if (!command || command.type === 'HOME') { state.route = 'timer'; return render(); }
  if (command.type === 'INVALID') { state.route = 'timer'; render(); return toast(command.reason || 'Invalid launch request.'); }
  if (hasOwnedActiveTimers() || state.remoteActive) {
    if (command.type === 'DISPLAY') { state.displayMode = true; return state.engine ? renderLive() : renderRemoteActive(); }
    if (command.type === 'ACTIVE_SESSION') {
      if (hasOwnedActiveTimers()) return focusRuntime(state.activeTimerId || coordinator.list()[0]?.id);
      return renderRemoteActive();
    }
    if (state.engine) return renderLive();
    if (state.remoteActive) return renderRemoteActive();
  }
  if (command.type === 'QUICK') { state.route = 'timer'; return render(); }
  if (command.type === 'STOPWATCH') return openBuilder('stopwatch');
  if (command.type === 'FAVORITES') { state.route = 'library'; return render(); }
  if (command.type === 'LAST_ROUTINE') {
    const lastRoutineId = state.sessions.find((s) => s.routineId)?.routineId;
    if (lastRoutineId) return startRoutine(lastRoutineId);
    state.route = 'timer'; render(); return toast('No previously used saved routine found.');
  }
  if (command.type === 'TIMER') return startSession(buildCountdown({ durationMs: command.durationMs, label: `${durationLabel(command.durationMs)} Timer` }), { mode: 'countdown', title: `${durationLabel(command.durationMs)} Timer`, config: { durationMs: command.durationMs } });
  if (command.type === 'ROUTINE') return startRoutine(command.id);
  if (command.type === 'SESSION') {
    state.route = 'history';
    await ensureFullHistory();
    render();
    return setTimeout(() => showSessionDetail(command.id), 0);
  }
  if (command.type === 'ACTIVE_SESSION') { state.route = 'timer'; render(); return toast('No active timer.'); }
  if (command.type === 'DISPLAY') { state.displayMode = true; return renderRemoteActive(); }
}

function applyTheme() {
  state.locale = resolveLocale(state.settings.language || 'system');
  appShell.dataset.theme = state.settings.theme || 'dark';
  appShell.dataset.highContrast = String(Boolean(state.settings.highContrast));
  appShell.dataset.largeControls = String(Boolean(state.settings.largeControls));
  document.documentElement.dataset.highContrast = String(Boolean(state.settings.highContrast));
  document.documentElement.dataset.largeControls = String(Boolean(state.settings.largeControls));
  document.documentElement.dataset.textScale = state.settings.textScale || 'normal';
  document.documentElement.dataset.reduceMotion = state.settings.reduceMotion || 'system';
  document.documentElement.style.colorScheme = state.settings.theme === 'light' ? 'light' : 'dark';
  const color = state.settings.theme === 'light' ? '#f3f6f9' : '#0b0d10';
  $('meta[name="theme-color"]')?.setAttribute('content', color);
  applyDocumentLocale(state.locale);
  scheduleLocalization(document.body);
}

function setRoute(route) {
  state.route = route;
  state.builder = null;
  state.builderEditingId = null;
  state.builderEditingBlockId = null;
  if (route === 'history') {
    state.historyVisible = 100;
    ensureFullHistory();
  }
  render();
  focusMainHeading(main);
}

function setNavActive() {
  $$('.nav-item').forEach((b) => {
    const active = b.dataset.route === state.route;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}

function setLiveMode(on) {
  document.body.classList.toggle('live-mode', on);
  header.classList.toggle('hidden', on);
  bottomNav.classList.toggle('hidden', on);
}

function render() {
  renderUpdateBanner();
  if (state.engine) return renderLive();
  if (state.remoteActive || state.displayMode) return renderRemoteActive();
  setLiveMode(false);
  setNavActive();
  document.title = state.builder ? `${translateSource(BUILDER_META[state.builder.type]?.name || 'Builder', currentLocale())} — Timer` : `${translateSource(state.route[0].toUpperCase() + state.route.slice(1), currentLocale())} — Timer`;
  if (state.completion) return renderCompletion();
  if (state.builder) return renderBuilder();
  if (state.route === 'workspace') return renderMultiTimerWorkspace();
  if (state.route === 'library') return renderLibrary();
  if (state.route === 'history') return renderHistory();
  if (state.route === 'settings') return renderSettings();
  renderTimerHome();
}

function renderTimerHome() {
  const pinned = quickPresets();
  const recentDurations = quickRecentDurations();
  const adjustments = quickAdjustments();
  const lastSession = state.sessions.find((session) => session?.plan);
  const parsed = quickInputResult();
  const preview = parsed.ok ? `${durationLabel(parsed.ms)} · ready to start` : parsed.error;
  main.innerHTML = `
    <div class="page-head home-head"><div><h1>Timer</h1><p>One timer or many. Start in seconds.</p></div>${coordinator.size() ? `<span class="pill active-count-pill">${coordinator.size()} active</span>` : ''}</div>

    ${coordinator.size() ? `<section class="section active-timers-section home-active-section"><div class="row-between"><div><h2 class="section-title" style="margin:0">Active Timers</h2><div class="small muted" style="margin-top:4px">All timers keep running independently.</div></div><div class="row"><span class="pill">${coordinator.size()}</span><button class="btn compact-btn" data-action="open-workspace">Workspace</button></div></div><div class="active-timer-grid">${coordinator.list().map(activeTimerCard).join('')}</div></section>` : ''}

    <section class="card quick-card quick-card-v2">
      <div class="row-between quick-card-head"><div><div class="quick-label">Quick Timer</div><div class="small muted">Try 90s, 1:30, 3m, or 1h 20m.</div></div><div class="row quick-head-actions"><button class="btn ghost compact-btn" data-action="save-quick-timer">Save</button><button class="btn ghost compact-btn" data-action="customize-quick">Customize</button></div></div>
      <form class="quick-entry" data-quick-form novalidate>
        <label class="sr-only" for="quick-duration-input">Quick Timer duration</label>
        <input id="quick-duration-input" class="quick-duration-input" data-quick-input inputmode="text" autocomplete="off" spellcheck="false" value="${esc(state.quickInput)}" placeholder="3m" aria-describedby="quick-duration-preview" aria-invalid="${parsed.ok ? 'false' : 'true'}">
        <button class="btn primary quick-start-btn" type="submit" data-action="start-quick-input" ${parsed.ok ? '' : 'disabled'}>Start</button>
      </form>
      <div id="quick-duration-preview" class="quick-input-preview ${parsed.ok ? '' : 'error-text'}" data-quick-preview>${esc(preview)}</div>
      <div class="quick-adjust-row" aria-label="Quick duration adjustments">
        ${adjustments.map((value) => `<button class="quick-adjust-chip" type="button" data-action="quick-add" data-ms="${value}">+${esc(durationInputText(value))}</button>`).join('')}
      </div>
      <div class="quick-duration-group"><div class="quick-group-label">Pinned</div><div class="quick-duration-chips">${pinned.map((value) => `<button class="preset-btn quick-start-chip" data-action="quick-start-duration" data-ms="${value}" aria-label="Start ${esc(durationLabel(value))} timer">${esc(durationInputText(value))}</button>`).join('')}</div></div>
      ${recentDurations.length ? `<div class="quick-duration-group"><div class="row-between"><div class="quick-group-label">Recent</div><button class="text-btn" data-action="clear-quick-recent">Clear</button></div><div class="quick-duration-chips recent-duration-chips">${recentDurations.slice(0, 8).map((value) => `<button class="preset-btn subtle quick-start-chip" data-action="quick-start-duration" data-ms="${value}" aria-label="Start recent ${esc(durationLabel(value))} timer">${esc(durationInputText(value))}</button>`).join('')}</div></div>` : ''}
    </section>

    <section class="section home-shortcuts-section">
      <div class="home-shortcuts">
        ${lastSession ? `<button class="home-shortcut primary-shortcut" data-action="repeat-session" data-id="${esc(lastSession.id)}"><span class="shortcut-icon" aria-hidden="true">↻</span><span><strong>Repeat Last</strong><small>${esc(lastSession.title)} · ${esc(durationLabel(lastSession.activeDurationMs || lastSession.plannedDurationMs || 0))}</small></span></button>` : ''}
        <button class="home-shortcut" data-action="open-builder" data-type="stopwatch"><span class="shortcut-icon" aria-hidden="true">◷</span><span><strong>Stopwatch</strong><small>Open-ended timing with laps</small></span></button>
        <button class="home-shortcut" data-action="open-builder" data-type="interval"><span class="shortcut-icon" aria-hidden="true">↔</span><span><strong>Interval</strong><small>Alternating timed phases</small></span></button>
        <button class="home-shortcut" data-action="create"><span class="shortcut-icon" aria-hidden="true">＋</span><span><strong>More Timers</strong><small>Sequences, specialized timers and advanced builders</small></span></button>
      </div>
    </section>`;
  requestAnimationFrame(() => updateQuickInputFeedback());
}

function activeTimerCard(runtime) {
  const view = coordinator.view(runtime.id);
  if (!view) return '';
  const current = view.current || {};
  const value = view.status === 'overtime' ? view.overtimeMs : (current.remainingMs != null ? current.remainingMs : current.elapsedMs);
  const time = `${view.status === 'overtime' ? '+' : ''}${formatClock(value || 0, { countUp: current.remainingMs == null })}`;
  const status = view.status === 'paused' ? 'Paused' : view.status === 'overtime' ? 'Overtime' : translateBuiltInLabel(current.label || view.title, currentLocale());
  const adjustable = current.remainingMs != null && view.status !== 'overtime';
  const adjustments = quickAdjustments();
  return `<article class="card active-timer-card" data-active-runtime="${esc(runtime.id)}">
    <button class="active-timer-main" data-action="focus-active" data-id="${esc(runtime.id)}">
      <span class="active-timer-copy"><strong>${esc(view.title || runtime.meta?.title || 'Timer')}</strong><small class="active-timer-status">${esc(status)}</small></span>
      <span class="active-timer-time">${esc(time)}</span>
    </button>
    <div class="active-timer-actions">
      <button class="btn compact-btn" data-action="active-toggle" data-id="${esc(runtime.id)}" aria-label="Pause or resume ${esc(view.title || 'timer')}">${view.status === 'paused' ? 'Resume' : 'Pause'}</button>
      ${adjustable ? adjustments.map((delta) => `<button class="btn ghost compact-btn active-adjust-btn" data-action="active-adjust" data-id="${esc(runtime.id)}" data-delta="${delta}" ${view.status === 'paused' ? 'disabled' : ''}>+${esc(durationInputText(delta))}</button>`).join('') : ''}
    </div>
  </article>`;
}



function queueTimerById(id) {
  return state.routines.find((timer) => timer.id === id) || null;
}

function queueTimerTitle(item) {
  return queueTimerById(item?.savedTimerId)?.title || item?.title || 'Missing Saved Timer';
}

function queueStepActionLabel(action) {
  return ({
    [QUEUE_STEP_ACTIONS.ADVANCE]: 'Advance',
    [QUEUE_STEP_ACTIONS.OVERTIME]: 'Overtime',
    [QUEUE_STEP_ACTIONS.REPEAT]: 'Repeat step',
    [QUEUE_STEP_ACTIONS.STOP]: 'Stop queue'
  })[normalizeQueueStepAction(action)] || 'Advance';
}

function queueStepRuntimeAction(action) {
  action = normalizeQueueStepAction(action);
  if (action === QUEUE_STEP_ACTIONS.OVERTIME) return COMPLETION_ACTIONS.OVERTIME;
  if (action === QUEUE_STEP_ACTIONS.REPEAT) return COMPLETION_ACTIONS.REPEAT;
  return COMPLETION_ACTIONS.STOP;
}

async function persistActiveQueue() {
  if (!state.activeQueue?.id) return false;
  state.activeQueue.updatedAt = Date.now();
  await state.db.saveActiveQueue(state.activeQueue);
  return true;
}

async function clearActiveQueueState() {
  const id = state.activeQueue?.id;
  state.activeQueue = null;
  if (id) await state.db.clearActiveQueue(id).catch(() => {});
}

async function startQueueCurrentItem({ focus = false, preserveFocus = false } = {}) {
  if (!state.activeQueue || state.activeQueue.status !== 'running') return null;
  let attempts = 0;
  while (state.activeQueue && attempts < Math.max(1, state.activeQueue.items.length)) {
    const item = queueCurrentItem(state.activeQueue);
    if (!item) {
      await clearActiveQueueState();
      return null;
    }
    const timer = queueTimerById(item.savedTimerId);
    if (!timer || timer.archived) {
      const advanced = advanceQueueRun(state.activeQueue, { skipped: true });
      state.activeQueue = advanced.run;
      if (advanced.finished) {
        await clearActiveQueueState();
        toast('Queue ended because remaining Saved Timers are unavailable.', 4200);
        return null;
      }
      await persistActiveQueue();
      attempts += 1;
      continue;
    }
    const runtime = await startSavedRoutineAutomated(item.savedTimerId, {
      background: !focus,
      backgroundRoute: 'workspace',
      preserveFocus,
      completionActionOverride: queueStepRuntimeAction(item.action),
      metaPatch: {
        queueRunId: state.activeQueue.id,
        queuePresetId: state.activeQueue.queueId || '',
        queueItemId: item.id,
        queueStepIndex: state.activeQueue.currentIndex,
        queueStepAction: item.action,
        workspaceGroup: `Queue · ${state.activeQueue.title}`
      }
    });
    if (!runtime) {
      const advanced = advanceQueueRun(state.activeQueue, { skipped: true });
      state.activeQueue = advanced.run;
      if (advanced.finished) {
        await clearActiveQueueState();
        toast('Queue could not start any remaining Saved Timer.', 4200);
        return null;
      }
      await persistActiveQueue();
      attempts += 1;
      continue;
    }
    state.activeQueue.currentRuntimeId = runtime.id;
    await persistActiveQueue();
    return runtime;
  }
  return null;
}

async function startQueue(queueOrId, { focus = false } = {}) {
  if (state.activeQueue && ['running','paused'].includes(state.activeQueue.status)) {
    openWorkspace();
    return toast('A queue is already active. Stop it before starting another queue.', 4200);
  }
  const source = typeof queueOrId === 'string' ? state.queues.find((queue) => queue.id === queueOrId) : queueOrId;
  const queue = normalizeQueuePreset(source || {});
  if (!queue.items.length) return toast('Add at least one Saved Timer to the queue.');
  if (!queue.items.some((item) => queueTimerById(item.savedTimerId) && !queueTimerById(item.savedTimerId).archived)) return toast('This queue has no available Saved Timers.');
  state.activeQueue = createQueueRun(queue, { id: uid('queue_run') });
  if (source?.id) {
    const stored = state.queues.find((item) => item.id === source.id);
    if (stored) {
      stored.useCount = (stored.useCount || 0) + 1;
      stored.lastUsedAt = Date.now();
      await state.db.saveQueue(stored);
      await loadCollections();
    }
  }
  await persistActiveQueue();
  state.route = 'workspace';
  const runtime = await startQueueCurrentItem({ focus, preserveFocus: false });
  render();
  if (!runtime) return toast('Queue could not be started.', 4200);
  return runtime;
}

async function pauseActiveQueue() {
  const run = state.activeQueue;
  if (!run || run.status !== 'running') return false;
  run.status = 'paused';
  const runtimeId = run.currentRuntimeId;
  if (runtimeId && coordinator.has(runtimeId)) {
    coordinator.pause(runtimeId);
    await persistRuntime(runtimeId);
  }
  await persistActiveQueue();
  broadcastActiveSnapshot();
  updateActiveTimerCards();
  return true;
}

async function resumeActiveQueue() {
  const run = state.activeQueue;
  if (!run || run.status !== 'paused') return false;
  run.status = 'running';
  const runtimeId = run.currentRuntimeId;
  if (runtimeId && coordinator.has(runtimeId)) {
    coordinator.resume(runtimeId);
    await persistRuntime(runtimeId);
  } else {
    await startQueueCurrentItem({ focus: false, preserveFocus: Boolean(state.activeTimerId) });
  }
  await persistActiveQueue();
  broadcastActiveSnapshot();
  updateActiveTimerCards();
  return true;
}

async function skipActiveQueueStep() {
  const run = state.activeQueue;
  if (!run || !['running','paused'].includes(run.status)) return false;
  const oldRuntimeId = run.currentRuntimeId;
  const advanced = advanceQueueRun(run, { skipped: true });
  state.activeQueue = advanced.run;
  if (oldRuntimeId) state.queueTransitionRuntimeIds.add(oldRuntimeId);
  if (advanced.finished) await clearActiveQueueState();
  else {
    state.activeQueue.status = 'running';
    await persistActiveQueue();
    await startQueueCurrentItem({ focus: false, preserveFocus: Boolean(state.activeTimerId && state.activeTimerId !== oldRuntimeId) });
  }
  if (oldRuntimeId && coordinator.has(oldRuntimeId)) coordinator.command(oldRuntimeId, 'stop', 'queue-skipped');
  if (oldRuntimeId) queueMicrotask(() => state.queueTransitionRuntimeIds.delete(oldRuntimeId));
  if (state.route === 'workspace' && !state.engine) renderMultiTimerWorkspace();
  return true;
}

async function stopActiveQueue() {
  const run = state.activeQueue;
  if (!run) return false;
  const runtimeId = run.currentRuntimeId;
  if (runtimeId) state.queueTransitionRuntimeIds.add(runtimeId);
  await clearActiveQueueState();
  if (runtimeId && coordinator.has(runtimeId)) coordinator.command(runtimeId, 'stop', 'queue-stopped');
  if (runtimeId) queueMicrotask(() => state.queueTransitionRuntimeIds.delete(runtimeId));
  if (state.route === 'workspace' && !state.engine) renderMultiTimerWorkspace();
  return true;
}

async function handleQueueRuntimeTerminal(runtime, event) {
  const run = state.activeQueue;
  if (!run || runtime?.meta?.queueRunId !== run.id || run.currentRuntimeId !== runtime.id) return false;
  if (state.queueTransitionRuntimeIds.has(runtime.id)) return true;
  const item = queueCurrentItem(run);
  if (!item || event.cancelled) {
    await clearActiveQueueState();
    return true;
  }
  const action = normalizeQueueStepAction(item.action);
  if (action === QUEUE_STEP_ACTIONS.STOP) {
    const advanced = advanceQueueRun(run, { skipped: false });
    advanced.run.status = 'stopped';
    state.activeQueue = advanced.run;
    await clearActiveQueueState();
    return true;
  }
  const advanced = advanceQueueRun(run, { skipped: false });
  state.activeQueue = advanced.run;
  if (advanced.finished) {
    await clearActiveQueueState();
    return true;
  }
  await persistActiveQueue();
  await startQueueCurrentItem({
    focus: state.activeTimerId === runtime.id,
    preserveFocus: Boolean(state.activeTimerId && state.activeTimerId !== runtime.id)
  });
  return true;
}

async function restoreActiveQueueRuns(runs = []) {
  const live = (runs || []).map((run) => normalizeQueueRun(run)).find((run) => ['running','paused'].includes(run.status));
  if (!live) return false;
  state.activeQueue = live;
  if (live.currentRuntimeId && coordinator.has(live.currentRuntimeId)) {
    if (live.status === 'paused') coordinator.pause(live.currentRuntimeId);
    await persistActiveQueue();
    return true;
  }
  const wantedPaused = live.status === 'paused';
  state.activeQueue.status = 'running';
  const runtime = await startQueueCurrentItem({ focus: false, preserveFocus: Boolean(state.activeTimerId) });
  if (runtime && wantedPaused) {
    state.activeQueue.status = 'paused';
    coordinator.pause(runtime.id);
    await persistRuntime(runtime.id);
    await persistActiveQueue();
  }
  return Boolean(runtime);
}

function renderActiveQueuePanel() {
  const run = state.activeQueue;
  if (!run || !['running','paused'].includes(run.status)) return '';
  const progress = queueProgress(run);
  const current = queueCurrentItem(run);
  const rows = run.items.map((item, index) => {
    const stateClass = index < run.currentIndex ? 'done' : index === run.currentIndex ? 'current' : 'queued';
    const status = index < run.currentIndex ? 'Done' : index === run.currentIndex ? (run.status === 'paused' ? 'Paused' : 'Now') : 'Queued';
    return `<div class="queue-run-item ${stateClass}"><span class="queue-run-index">${index + 1}</span><span class="queue-run-copy"><strong>${esc(queueTimerTitle(item))}</strong><small>${esc(queueStepActionLabel(item.action))}</small></span><span class="queue-run-status">${status}</span></div>`;
  }).join('');
  return `<section class="active-queue-panel card card-pad">
    <div class="row-between"><div><div class="quick-label">Active Queue</div><h2>${esc(run.title)}</h2></div><span class="pill">Cycle ${progress.cycle}</span></div>
    <div class="queue-progress-copy"><strong>${progress.current} / ${progress.total}</strong><span>${current ? esc(queueTimerTitle(current)) : 'Complete'} · ${progress.completedSteps} completed · ${progress.skippedSteps} skipped</span></div>
    <div class="queue-progress-track"><span style="transform:scaleX(${Math.max(0, Math.min(1, progress.percent))})"></span></div>
    <div class="queue-run-list">${rows}</div>
    <div class="queue-control-row">
      <button class="btn primary" data-action="${run.status === 'paused' ? 'queue-resume' : 'queue-pause'}">${run.status === 'paused' ? 'Resume queue' : 'Pause queue'}</button>
      <button class="btn" data-action="queue-skip">Skip</button>
      <button class="btn danger" data-action="queue-stop">Stop queue</button>
    </div>
  </section>`;
}


function queueRow(queue) {
  const normalized = normalizeQueuePreset(queue);
  const duration = normalized.items.reduce((total, item) => {
    const timer = queueTimerById(item.savedTimerId);
    const d = timer ? savedTimerDuration(timer) : null;
    return total == null || d == null ? null : total + d;
  }, 0);
  return `<div class="queue-preset-row">
    <button class="queue-preset-main" data-action="edit-queue" data-id="${esc(normalized.id)}"><strong>${esc(normalized.title)}</strong><span>${normalized.items.length} timer${normalized.items.length === 1 ? '' : 's'}${normalized.loop ? ' · loops' : ''}${duration != null ? ` · ${esc(durationLabel(duration))}` : ''}</span></button>
    <button class="btn compact-btn" data-action="start-queue" data-id="${esc(normalized.id)}">Start</button>
    <button class="icon-btn danger-text" data-action="delete-queue" data-id="${esc(normalized.id)}" aria-label="Delete ${esc(normalized.title)}">×</button>
  </div>`;
}

function showQueueLibrarySheet() {
  showSheet('Timer Queues', `<div class="stack">
    <button class="btn primary block" data-action="new-queue">＋ New Queue</button>
    <div class="queue-preset-list">${state.queues.length ? state.queues.map(queueRow).join('') : '<div class="empty">No saved queues yet.</div>'}</div>
  </div>`);
}

function defaultQueueTitleFromView() {
  if (state.libraryView?.startsWith('collection:')) return `${state.libraryView.slice('collection:'.length)} Queue`;
  if (state.libraryView === 'favorites') return 'Favorites Queue';
  if (state.libraryView === 'pinned') return 'Pinned Queue';
  return 'Timer Queue';
}

function openQueueBuilderFromTimerIds(timerIds = [], title = 'Timer Queue') {
  const preset = queuePresetFromTimerIds(timerIds, { id: uid('queue'), title });
  state.queueDraft = normalizeQueuePreset(preset);
  renderQueueBuilderSheet();
}

function showQueueBuilder(queueId = null) {
  const queue = queueId ? state.queues.find((item) => item.id === queueId) : null;
  state.queueDraft = normalizeQueuePreset(queue ? structuredClone(queue) : { id: uid('queue'), title: 'Timer Queue', items: [], loop: false });
  renderQueueBuilderSheet();
}

function renderQueueBuilderSheet() {
  const queue = normalizeQueuePreset(state.queueDraft || { id: uid('queue'), title: 'Timer Queue', items: [] });
  state.queueDraft = queue;
  const itemRows = queue.items.map((item, index) => {
    const timer = queueTimerById(item.savedTimerId);
    return `<div class="queue-builder-item" draggable="true" data-queue-draft-index="${index}">
      <div class="queue-drag-handle" aria-hidden="true">⋮⋮</div>
      <div class="queue-builder-copy"><strong>${esc(timer?.title || 'Missing Saved Timer')}</strong><small>${esc(timer ? (BUILDER_META[timer.type]?.name || timer.type) : item.savedTimerId)}</small></div>
      <select class="select queue-action-select" data-queue-item-action data-index="${index}" aria-label="Completion behavior for ${esc(timer?.title || 'queue item')}">
        <option value="advance" ${item.action === 'advance' ? 'selected' : ''}>Advance</option>
        <option value="overtime" ${item.action === 'overtime' ? 'selected' : ''}>Overtime</option>
        <option value="repeat" ${item.action === 'repeat' ? 'selected' : ''}>Repeat</option>
        <option value="stop" ${item.action === 'stop' ? 'selected' : ''}>Stop queue</option>
      </select>
      <div class="queue-item-buttons">
        <button class="icon-btn" data-action="queue-item-move" data-index="${index}" data-delta="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move earlier">↑</button>
        <button class="icon-btn" data-action="queue-item-move" data-index="${index}" data-delta="1" ${index === queue.items.length - 1 ? 'disabled' : ''} aria-label="Move later">↓</button>
        <button class="icon-btn danger-text" data-action="queue-item-remove" data-index="${index}" aria-label="Remove item">×</button>
      </div>
    </div>`;
  }).join('');
  showSheet(queue.id && state.queues.some((item) => item.id === queue.id) ? 'Edit Queue' : 'New Queue', `<div class="stack queue-builder">
    <label class="field"><span>Name</span><input class="input" data-queue-draft-field="title" maxlength="120" value="${esc(queue.title)}"></label>
    <label class="field"><span>Description</span><textarea class="input" rows="2" maxlength="500" data-queue-draft-field="description" placeholder="Optional">${esc(queue.description || '')}</textarea></label>
    <label class="check-row"><input type="checkbox" data-queue-draft-loop ${queue.loop ? 'checked' : ''}> <span><strong>Loop whole queue</strong><small>After the final item, start again at item 1 and increment the queue cycle.</small></span></label>
    <div class="row-between"><div><div class="section-title" style="margin:0">Queue items</div><div class="small muted">Drag to reorder, or use the arrow buttons.</div></div><button class="btn" data-action="queue-add-timer">＋ Add Timer</button></div>
    <div class="queue-builder-list">${itemRows || '<div class="empty">Add Saved Timers to build the queue.</div>'}</div>
    <div class="row queue-builder-actions" style="flex-wrap:wrap"><button class="btn primary" data-action="save-queue-draft">Save Queue</button><button class="btn" data-action="save-start-queue-draft" ${queue.items.length ? '' : 'disabled'}>Save & Start</button></div>
  </div>`);
}

function showQueueTimerPicker() {
  const timers = state.routines.filter((item) => !item.archived);
  showSheet('Add Saved Timer', `<div class="sheet-list">${timers.length ? timers.map((timer) => `<button class="sheet-item" data-action="queue-add-picked-timer" data-id="${esc(timer.id)}"><div><strong>${esc(timer.title)}</strong><div class="small muted">${esc(BUILDER_META[timer.type]?.name || timer.type)} · ${esc(typeSummary(timer.type, timer.config || {}))}</div></div><span>＋</span></button>`).join('') : '<div class="empty">No Saved Timers available.</div>'}<button class="btn block" data-action="queue-return-builder">Back to Queue</button></div>`);
}

function addQueueDraftTimer(timerId) {
  const timer = queueTimerById(timerId);
  if (!timer || !state.queueDraft) return;
  const next = normalizeQueuePreset({
    ...state.queueDraft,
    items: [...state.queueDraft.items, { id: uid('queue_item'), savedTimerId: timer.id, title: timer.title, action: QUEUE_STEP_ACTIONS.ADVANCE }]
  });
  state.queueDraft = next;
  renderQueueBuilderSheet();
}

function moveQueueDraftItem(index, delta) {
  if (!state.queueDraft) return;
  const to = Math.max(0, Math.min(state.queueDraft.items.length - 1, Number(index) + Number(delta)));
  state.queueDraft.items = reorderQueueItems(state.queueDraft.items, Number(index), to);
  renderQueueBuilderSheet();
}

function removeQueueDraftItem(index) {
  if (!state.queueDraft) return;
  state.queueDraft.items.splice(Number(index), 1);
  state.queueDraft = normalizeQueuePreset(state.queueDraft);
  renderQueueBuilderSheet();
}

async function saveQueueDraft({ start = false } = {}) {
  if (!state.queueDraft) return;
  const titleInput = $('#sheet-root [data-queue-draft-field="title"]');
  const descriptionInput = $('#sheet-root [data-queue-draft-field="description"]');
  const loopInput = $('#sheet-root [data-queue-draft-loop]');
  state.queueDraft.title = String(titleInput?.value || state.queueDraft.title || 'Timer Queue').trim().slice(0, 120) || 'Timer Queue';
  state.queueDraft.description = String(descriptionInput?.value || '').trim().slice(0, 500);
  state.queueDraft.loop = Boolean(loopInput?.checked);
  state.queueDraft = normalizeQueuePreset(state.queueDraft);
  if (!state.queueDraft.items.length) return toast('Add at least one Saved Timer before saving.');
  const invalid = state.queueDraft.items.find((item) => !queueTimerById(item.savedTimerId));
  if (invalid) return toast('Remove missing Saved Timers before saving this queue.', 4200);
  const saved = await state.db.saveQueue(state.queueDraft);
  await loadCollections();
  state.queueDraft = null;
  closeSheet();
  toast('Queue saved.');
  if (start) await startQueue(saved.id);
  else if (state.route === 'library') renderLibrary();
}

async function deleteQueue(id) {
  const queue = state.queues.find((item) => item.id === id);
  if (!queue) return;
  if (!confirm(`Delete queue “${queue.title}”?`)) return;
  await state.db.delete('queues', id);
  await loadCollections();
  closeSheet();
  if (state.route === 'library') renderLibrary();
  else showQueueLibrarySheet();
  toast('Queue deleted.');
}

function workspaceTitle(runtime) {
  return runtime?.meta?.workspaceTitle || runtime?.meta?.title || coordinator.view(runtime?.id)?.title || 'Timer';
}

function workspaceColor(runtime) {
  const color = runtime?.meta?.workspaceColor || 'default';
  return SAVED_TIMER_ACCENTS.includes(color) ? color : 'default';
}

function completionActionLabel(action) {
  return ({ stop: 'Stop', overtime: 'Overtime', repeat: 'Repeat', 'start-next': 'Start Next' })[action] || 'Stop';
}

function openWorkspace() {
  closeSheet();
  stopLiveScheduler();
  syncFocusedRuntime(null);
  mediaSession.disable();
  state.completion = null;
  state.route = 'workspace';
  render();
  focusMainHeading(main);
}

function workspaceRuntimeCard(runtime, index, total) {
  const view = coordinator.view(runtime.id);
  if (!view) return '';
  const current = view.current || {};
  const value = view.status === 'overtime' ? view.overtimeMs : (current.remainingMs != null ? current.remainingMs : current.elapsedMs);
  const time = `${view.status === 'overtime' ? '+' : ''}${formatClock(value || 0, { tenths: view.mode === 'stopwatch', countUp: current.remainingMs == null })}`;
  const phase = view.status === 'paused' ? 'Paused' : view.status === 'overtime' ? 'Overtime' : translateBuiltInLabel(current.label || view.title, currentLocale());
  const group = String(runtime.meta?.workspaceGroup || '').trim();
  const next = runtime.meta?.completionNextRoutineId ? state.routines.find((item) => item.id === runtime.meta.completionNextRoutineId) : null;
  const automation = runtime.completionAction === COMPLETION_ACTIONS.START_NEXT && next ? `Start ${next.title}` : completionActionLabel(runtime.completionAction);
  return `<article class="workspace-timer-card" data-workspace-runtime="${esc(runtime.id)}" data-saved-accent="${esc(workspaceColor(runtime))}">
    <button class="workspace-timer-main" data-action="focus-active" data-id="${esc(runtime.id)}">
      <span class="workspace-timer-copy"><strong>${esc(workspaceTitle(runtime))}</strong><small>${esc(group || 'Ungrouped')} · ${esc(phase)}</small></span>
      <span class="workspace-time">${esc(time)}</span>
    </button>
    <div class="workspace-automation"><span>${esc(automation)}</span><button class="text-btn" data-action="workspace-edit-timer" data-id="${esc(runtime.id)}">Edit</button></div>
    <div class="workspace-card-actions">
      <button class="btn compact-btn" data-action="active-toggle" data-id="${esc(runtime.id)}">${view.status === 'paused' ? 'Resume' : 'Pause'}</button>
      <button class="btn compact-btn" data-action="workspace-move" data-id="${esc(runtime.id)}" data-delta="-1" ${index === 0 ? 'disabled' : ''} aria-label="Move timer earlier">↑</button>
      <button class="btn compact-btn" data-action="workspace-move" data-id="${esc(runtime.id)}" data-delta="1" ${index === total - 1 ? 'disabled' : ''} aria-label="Move timer later">↓</button>
      <button class="btn compact-btn danger" data-action="workspace-stop" data-id="${esc(runtime.id)}">Stop</button>
    </div>
  </article>`;
}

function renderMultiTimerWorkspace() {
  setLiveMode(false);
  const runtimes = coordinator.list();
  if (state.workspaceFocusId && !coordinator.has(state.workspaceFocusId)) state.workspaceFocusId = null;
  const layout = ['grid','compact','focus'].includes(state.settings.workspaceLayout) ? state.settings.workspaceLayout : 'grid';
  const groups = new Map();
  for (const runtime of runtimes) {
    const group = String(runtime.meta?.workspaceGroup || '').trim() || 'Ungrouped';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(runtime);
  }
  const layoutButton = (value, label) => `<button class="${layout === value ? 'active' : ''}" data-action="workspace-layout" data-layout="${value}" aria-pressed="${layout === value}">${label}</button>`;
  const focusId = state.workspaceFocusId || runtimes[0]?.id;
  const groupSections = [...groups.entries()].map(([group, items]) => {
    const shown = layout === 'focus' ? items.filter((runtime) => runtime.id === focusId) : items;
    if (!shown.length) return '';
    const cards = shown.map((runtime) => workspaceRuntimeCard(runtime, runtimes.indexOf(runtime), runtimes.length)).join('');
    return `<section class="workspace-group"><div class="row-between"><h2>${esc(group)}</h2><span class="pill">${items.length}</span></div><div class="workspace-timer-grid">${cards}</div></section>`;
  }).join('');
  main.innerHTML = `<div class="page-head workspace-head"><div><h1>Multi-Timer Workspace</h1><p>Control independent timers and automation queues from one place.</p></div><div class="row"><button class="btn" data-action="show-queue-library">Queues</button><button class="btn" data-action="workspace-launch-saved">＋ Saved</button><button class="btn primary" data-action="create">＋ New</button></div></div>
    ${renderActiveQueuePanel()}
    <section class="workspace-toolbar card card-pad">
      <div class="segmented workspace-layout-switch" role="group" aria-label="Workspace layout">${layoutButton('grid','Grid')}${layoutButton('compact','Compact')}${layoutButton('focus','Focus')}</div>
      <div class="workspace-bulk-actions"><button class="btn compact-btn" data-action="workspace-pause-all" ${runtimes.length ? '' : 'disabled'}>Pause all</button><button class="btn compact-btn" data-action="workspace-resume-all" ${runtimes.length ? '' : 'disabled'}>Resume all</button><button class="btn compact-btn danger" data-action="workspace-stop-all" ${runtimes.length ? '' : 'disabled'}>Stop all</button></div>
    </section>
    ${layout === 'focus' && runtimes.length > 1 ? `<div class="workspace-focus-strip">${runtimes.map((runtime) => `<button class="${focusId === runtime.id ? 'active' : ''}" data-action="workspace-focus" data-id="${esc(runtime.id)}">${esc(workspaceTitle(runtime))}</button>`).join('')}</div>` : ''}
    ${runtimes.length ? `<div class="workspace-groups layout-${layout}">${groupSections}</div>` : `<div class="card empty workspace-empty"><h2>No active timers</h2><p>Launch a saved timer or create a new one.</p><div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" data-action="workspace-launch-saved">Launch Saved Timer</button><button class="btn" data-action="create">Create Timer</button></div></div>`}`;
}

function showWorkspaceLaunchSheet() {
  const timers = state.routines.filter((item) => !item.archived);
  showSheet('Launch Saved Timer', `<div class="sheet-list">${timers.length ? timers.map((timer) => `<button class="sheet-item" data-action="workspace-launch-routine" data-id="${esc(timer.id)}"><div><strong>${esc(timer.title)}</strong><div class="small muted">${esc(BUILDER_META[timer.type]?.name || timer.type)} · ${esc(typeSummary(timer.type, timer.config || {}))}</div></div><span>▶</span></button>`).join('') : '<div class="empty">No Saved Timers yet.</div>'}</div>`);
}

function showWorkspaceTimerSettings(id) {
  const runtime = coordinator.get(id);
  if (!runtime) return toast('Active timer not found.');
  const nextId = runtime.meta?.completionNextRoutineId || '';
  const completion = runtime.completionAction || COMPLETION_ACTIONS.STOP;
  const nextOptions = state.routines.filter((item) => !item.archived).map((timer) => `<option value="${esc(timer.id)}" ${timer.id === nextId ? 'selected' : ''}>${esc(timer.title)}</option>`).join('');
  showSheet('Timer Workspace Settings', `<div class="stack">
    <label class="field"><span>Workspace name</span><input class="input" data-workspace-field="title" maxlength="120" value="${esc(workspaceTitle(runtime))}"></label>
    <div class="input-row"><label class="field"><span>Group</span><input class="input" data-workspace-field="group" maxlength="40" value="${esc(runtime.meta?.workspaceGroup || '')}" placeholder="Kitchen, Study, Workout"></label><label class="field"><span>Color</span><select class="select" data-workspace-field="color">${SAVED_TIMER_ACCENTS.map((color) => `<option value="${color}" ${workspaceColor(runtime) === color ? 'selected' : ''}>${color[0].toUpperCase()+color.slice(1)}</option>`).join('')}</select></label></div>
    <label class="field"><span>When this timer finishes</span><select class="select" data-workspace-field="completion"><option value="stop" ${completion === 'stop' ? 'selected' : ''}>Stop</option><option value="overtime" ${completion === 'overtime' ? 'selected' : ''}>Count overtime</option><option value="repeat" ${completion === 'repeat' ? 'selected' : ''}>Repeat automatically</option><option value="start-next" ${completion === 'start-next' ? 'selected' : ''}>Start a Saved Timer</option></select></label>
    <label class="field"><span>Next Saved Timer</span><select class="select" data-workspace-field="next"><option value="">Choose timer</option>${nextOptions}</select><small class="muted">Used by Start Next. The target can continue the chain with its own completion action.</small></label>
    <button class="btn primary" data-action="workspace-save-timer" data-id="${esc(id)}">Save</button>
  </div>`);
}

async function saveWorkspaceTimerSettings(id) {
  const runtime = coordinator.get(id);
  const root = $('#sheet-root');
  if (!runtime || !root) return;
  const value = (field) => root.querySelector(`[data-workspace-field="${field}"]`)?.value ?? '';
  const completionAction = value('completion') || COMPLETION_ACTIONS.STOP;
  const nextRoutineId = value('next');
  if (completionAction === COMPLETION_ACTIONS.START_NEXT && (!nextRoutineId || !state.routines.some((item) => item.id === nextRoutineId && !item.archived))) return toast('Choose a Saved Timer for Start Next.');
  coordinator.updateRuntime(id, {
    meta: {
      workspaceTitle: String(value('title')).trim().slice(0, 120) || runtime.meta?.title || 'Timer',
      workspaceGroup: String(value('group')).trim().slice(0, 40),
      workspaceColor: SAVED_TIMER_ACCENTS.includes(value('color')) ? value('color') : 'default',
      completionNextRoutineId: completionAction === COMPLETION_ACTIONS.START_NEXT ? nextRoutineId : ''
    },
    completionAction
  });
  await persistRuntime(id);
  closeSheet();
  broadcastActiveSnapshot();
  renderMultiTimerWorkspace();
  toast('Timer workspace settings saved.');
}

async function persistWorkspaceOrder() {
  await Promise.allSettled(coordinator.list().map((runtime) => persistRuntime(runtime.id)));
  broadcastActiveSnapshot();
}
function showQuickCustomizeSheet() {
  const pinned = [...quickPresets()];
  while (pinned.length < 6) pinned.push(DEFAULT_QUICK_PRESETS[pinned.length] || 60000);
  const adjustments = quickAdjustments();
  showSheet('Customize Quick Timer', `<div class="stack quick-customize-sheet">
    <div><div class="section-title">Pinned durations</div><div class="small muted">These start immediately with one tap from Home. Use the same formats as Quick Timer.</div></div>
    <div class="quick-customize-grid">${pinned.slice(0,6).map((value,index) => `<label class="custom-number-label">Pinned ${index+1}<input class="input" data-quick-preset-edit value="${esc(durationInputText(value))}" inputmode="text"></label>`).join('')}</div>
    <div><div class="section-title">Adjustment buttons</div><div class="small muted">Shown on Quick Timer and adjustable active countdowns.</div></div>
    <div class="quick-customize-grid quick-adjust-edit-grid">${adjustments.map((value,index) => `<label class="custom-number-label">Adjustment ${index+1}<input class="input" data-quick-adjust-edit value="${esc(durationInputText(value))}" inputmode="text"></label>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-action="save-quick-customize">Save</button><button class="btn" data-action="reset-quick-customize">Reset defaults</button></div>
  </div>`);
}

async function saveQuickCustomizeSheet() {
  const presetInputs = $$('[data-quick-preset-edit]');
  const adjustmentInputs = $$('[data-quick-adjust-edit]');
  const presets = [];
  for (const input of presetInputs) {
    const result = parseDurationInput(input.value);
    if (!result.ok) { input.focus(); return toast(`Pinned duration: ${result.error}`, 4200); }
    presets.push(result.ms);
  }
  const adjustments = [];
  for (const input of adjustmentInputs) {
    const result = parseDurationInput(input.value, { maxMs: 3600000 });
    if (!result.ok) { input.focus(); return toast(`Adjustment: ${result.error}`, 4200); }
    adjustments.push(result.ms);
  }
  state.settings.quickPresets = normalizeDurationList(presets, { limit: 8 });
  state.settings.quickAdjustments = normalizeDurationList(adjustments, { limit: 3, maxMs: 3600000 });
  if (!state.settings.quickPresets.length || state.settings.quickAdjustments.length !== 3) return toast('Quick Timer needs at least one pinned duration and three valid adjustment buttons.');
  await saveSettings();
  closeSheet();
  if (state.route === 'timer' && !state.engine) renderTimerHome();
  toast('Quick Timer customized.');
}

async function resetQuickCustomizeSheet() {
  state.settings.quickPresets = [...DEFAULT_QUICK_PRESETS];
  state.settings.quickAdjustments = [...DEFAULT_QUICK_ADJUSTMENTS];
  await saveSettings();
  closeSheet();
  if (state.route === 'timer' && !state.engine) renderTimerHome();
  toast('Quick Timer defaults restored.');
}

function modeCard(type) {
  const m = BUILDER_META[type];
  return `<button class="mode-card" data-action="open-builder" data-type="${type}"><strong>${esc(m.name)}</strong><span>${esc(m.desc)}</span></button>`;
}

function sessionRow(s) {
  const result = s.mode === 'amrap' && s.data ? `${s.data.rounds || 0} rounds + ${s.data.reps || 0}` : formatClock(s.activeDurationMs || 0, { countUp: true });
  return `<div class="list-row"><button class="list-row-main" data-action="session-detail" data-id="${esc(s.id)}"><div class="list-row-title">${esc(s.title)}</div><div class="list-row-meta">${esc(BUILDER_META[s.mode]?.name || s.mode || 'Timer')} · ${esc(result)}</div></button><button class="play-btn" data-action="repeat-session" data-id="${esc(s.id)}" aria-label="Repeat ${esc(s.title)}">▶</button></div>`;
}

function showCreateSheet() {
  const types = Object.keys(BUILDER_META);
  showSheet('Create Timer', `<div class="sheet-list">${types.map((t) => `<button class="sheet-item" data-action="open-builder" data-type="${t}"><div><strong>${esc(BUILDER_META[t].name)}</strong><div class="small muted">${esc(BUILDER_META[t].desc)}</div></div></button>`).join('')}</div>`);
}

function showSheet(title, content) {
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-sheet tabindex="-1"><div class="sheet-handle" aria-hidden="true"></div><div class="row-between"><h2 id="sheet-title" class="sheet-title">${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></div>${content}</section></div>`;
  const sheet = $('[data-sheet]', root);
  sheet?.addEventListener('click', (e) => e.stopPropagation());
  scheduleLocalization(root);
  sheetFocus.activate(sheet, { background: appShell, onEscape: () => closeSheet() });
}

function closeSheet() {
  sheetFocus.deactivate();
  $('#sheet-root').innerHTML = '';
}

function openBuilder(type, routine = null) {
  closeSheet();
  state.builder = { type, config: structuredClone(routine?.config || defaultConfig(type)) };
  state.builderEditingId = routine?.id || null;
  state.builderEditingBlockId = null;
  state.builderCueOverrides = structuredClone(routine?.cueOverrides || {});
  renderBuilder();
  focusMainHeading(main);
}

function openBlockEditor(block) {
  if (!block) return;
  closeSheet();
  state.builder = { type: 'custom', config: { title: block.title, parameters: structuredClone(block.parameters || []), nodes: structuredClone(block.nodes || []) } };
  state.builderEditingId = null;
  state.builderEditingBlockId = block.id;
  state.builderCueOverrides = {};
  renderBuilder();
  focusMainHeading(main);
}

function blocksForCurrentBuilder() {
  if (!state.builderEditingBlockId || !state.builder || state.builder.type !== 'custom') return state.blocks;
  const draft = { id: state.builderEditingBlockId, title: state.builder.config.title || 'Reusable Block', parameters: structuredClone(state.builder.config.parameters || []), nodes: structuredClone(state.builder.config.nodes || []), revision: state.blocks.find((block) => block.id === state.builderEditingBlockId)?.revision || 1 };
  return state.blocks.map((block) => block.id === draft.id ? draft : block);
}

function field(label, key, value, opts = {}) {
  const { type = 'number', min, max, step = 1, suffix = '', inputmode } = opts;
  return `<div class="field"><label for="b-${key}">${esc(label)}</label><div class="row"><input id="b-${key}" class="input" data-builder-key="${key}" type="${type}" value="${esc(value)}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}>${suffix ? `<span class="muted">${esc(suffix)}</span>` : ''}</div></div>`;
}

function toggleField(label, key, checked, hint = '') {
  return `<div class="toggle-row"><div><strong>${esc(label)}</strong>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div><button class="toggle" data-action="builder-toggle" data-key="${key}" aria-pressed="${checked}" aria-label="${esc(label)}"></button></div>`;
}

function cueProfileOptions(selected = '', { inherit = false } = {}) {
  const builtins = Object.values(BUILTIN_CUE_PROFILES);
  return `${inherit ? `<option value="" ${!selected ? 'selected' : ''}>Use global cue profile</option>` : ''}${builtins.map((profile) => `<option value="${esc(profile.id)}" ${selected === profile.id ? 'selected' : ''}>${esc(profile.title)}</option>`).join('')}${state.cueProfiles.map((profile) => `<option value="${esc(profile.id)}" ${selected === profile.id ? 'selected' : ''}>${esc(profile.title)} · Custom</option>`).join('')}`;
}

function soundPackOptions(selected = 'clean', { inherit = false } = {}) {
  return `${inherit ? `<option value="" ${!selected ? 'selected' : ''}>Inherit</option>` : ''}${Object.entries(SOUND_PACKS).map(([id, pack]) => `<option value="${id}" ${selected === id ? 'selected' : ''}>${esc(pack.title)}</option>`).join('')}`;
}

function cueSoundOptions(selected = '') {
  const standard = [
    ['', 'Inherit phase sound'], ['off', 'No transition sound'], ['default', 'Default phase sound'],
    ['work', 'Work sound'], ['rest', 'Rest sound'], ['prepare', 'Prepare sound'], ['warning', 'Warning sound'], ['halfway', 'Halfway sound'], ['finish', 'Finish sound']
  ];
  return `${standard.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('')}${state.customSounds.map((sound) => `<option value="custom:${esc(sound.id)}" ${selected === `custom:${sound.id}` ? 'selected' : ''}>Custom · ${esc(sound.title)}</option>`).join('')}`;
}

function renderRoutineCueOverrides(overrides = {}) {
  return `<section class="card form-card cue-override-card"><h2 class="section-title">Timer cues</h2><div class="small muted">Optional. A timer profile overrides the global cue profile only while this timer is running.</div><div class="field"><label>Cue profile</label><select class="select" data-builder-cue-field="profileId">${cueProfileOptions(overrides.profileId || '', { inherit: true })}</select></div><div class="field"><label>Sound pack</label><select class="select" data-builder-cue-field="soundPack">${soundPackOptions(overrides.soundPack || '', { inherit: true })}</select></div><div class="generator-grid"><label class="custom-number-label">Warning seconds<input class="input" type="number" min="0" max="60" value="${overrides.warningSeconds ?? ''}" placeholder="Inherit" data-builder-cue-field="warningSeconds"></label><label class="custom-number-label">Halfway cue<select class="select" data-builder-cue-field="halfwayCue"><option value="" ${overrides.halfwayCue == null ? 'selected' : ''}>Inherit</option><option value="true" ${overrides.halfwayCue === true || overrides.halfwayCue === 'true' ? 'selected' : ''}>On</option><option value="false" ${overrides.halfwayCue === false || overrides.halfwayCue === 'false' ? 'selected' : ''}>Off</option></select></label></div></section>`;
}

function renderStepCueOverrides(node, path) {
  const cueOverrides = node.cueOverrides || {};
  return `<details class="step-cue-editor"><summary>Cue overrides</summary><div class="stack compact-stack"><label class="custom-number-label">Transition sound<select class="select" data-custom-cue-path="${path}" data-custom-cue-field="transitionSound">${cueSoundOptions(cueOverrides.transitionSound || '')}</select></label><label class="custom-number-label">Voice behavior<select class="select" data-custom-cue-path="${path}" data-custom-cue-field="voiceMode"><option value="inherit" ${(cueOverrides.voiceMode || 'inherit') === 'inherit' ? 'selected' : ''}>Inherit</option><option value="off" ${cueOverrides.voiceMode === 'off' ? 'selected' : ''}>No voice for this step</option><option value="label" ${cueOverrides.voiceMode === 'label' ? 'selected' : ''}>Speak step label only</option><option value="custom" ${cueOverrides.voiceMode === 'custom' ? 'selected' : ''}>Custom phrase</option></select></label>${cueOverrides.voiceMode === 'custom' ? `<label class="custom-number-label">Custom phrase<input class="input" value="${esc(cueOverrides.voiceText || '')}" data-custom-cue-path="${path}" data-custom-cue-field="voiceText"></label>` : ''}<div class="generator-grid"><label class="custom-number-label">Warning seconds<input class="input" type="number" min="0" max="60" value="${cueOverrides.warningSeconds ?? ''}" placeholder="Inherit" data-custom-cue-path="${path}" data-custom-cue-field="warningSeconds"></label><label class="custom-number-label">Halfway cue<select class="select" data-custom-cue-path="${path}" data-custom-cue-field="halfway"><option value="inherit" ${cueOverrides.halfway == null || cueOverrides.halfway === 'inherit' ? 'selected' : ''}>Inherit</option><option value="on" ${cueOverrides.halfway === true || cueOverrides.halfway === 'on' ? 'selected' : ''}>On</option><option value="off" ${cueOverrides.halfway === false || cueOverrides.halfway === 'off' ? 'selected' : ''}>Off</option></select></label></div><div class="generator-grid"><label class="custom-number-label">Custom cue at %<input class="input" type="number" min="1" max="99" value="${cueOverrides.customPercent ?? ''}" placeholder="Off" data-custom-cue-path="${path}" data-custom-cue-field="customPercent"></label><label class="custom-number-label">Custom cue sound<select class="select" data-custom-cue-path="${path}" data-custom-cue-field="customSound">${cueSoundOptions(cueOverrides.customSound || 'halfway')}</select></label></div></div></details>`;
}

function renderBuilder() {
  setLiveMode(false);
  const { type, config: c } = state.builder;
  const m = BUILDER_META[type];
  const editingBlock = state.builderEditingBlockId ? state.blocks.find((block) => block.id === state.builderEditingBlockId) : null;
  let body = '';
  if (type === 'countdown') {
    body = `${field('Duration', 'duration', c.duration, { min: 1, max: 604800, suffix: 'sec' })}<div class="small muted">Save reusable countdown presets for cooking, study, music, church, workouts, or anything else.</div>`;
  } else if (type === 'interval' || type === 'tabata') {
    body = `${field('Work', 'work', c.work, { min: 1, max: 3600, suffix: 'sec' })}${field('Rest', 'rest', c.rest, { min: 1, max: 3600, suffix: 'sec' })}${field('Rounds', 'rounds', c.rounds, { min: 1, max: 10000 })}${field('Preparation', 'prepare', c.prepare, { min: 0, max: 3600, suffix: 'sec' })}${toggleField('Final rest', 'finalRest', !!c.finalRest, 'Include rest after the last work interval')}`;
  } else if (type === 'circuit') {
    body = `${field('Rounds', 'rounds', c.rounds, { min: 1, max: 1000 })}${field('Preparation', 'prepare', c.prepare, { min: 0, max: 3600, suffix: 'sec' })}${field('Between rounds', 'between', c.between, { min: 0, max: 3600, suffix: 'sec' })}
      <div class="field"><div class="field-label">Steps</div><div class="circuit-steps">${(c.items || []).map((item, i) => circuitStepRow(item, i)).join('')}</div><button class="btn" data-action="add-circuit-step">＋ Add step</button></div>`;
  } else if (type === 'emom') {
    body = `${field('Minutes / blocks', 'minutes', c.minutes, { min: 1, max: 10000 })}${field('Block length', 'blockMinutes', c.blockMinutes, { min: 0.1, max: 60, step: 0.1, suffix: 'min' })}${field('Exercise', 'labelA', c.labelA, { type: 'text' })}${field('Target (optional)', 'targetA', c.targetA || '', { type: 'text' })}${toggleField('Alternating', 'alternating', !!c.alternating, 'Alternate between two exercise blocks')}${c.alternating ? `${field('Second exercise', 'labelB', c.labelB, { type: 'text' })}${field('Second target', 'targetB', c.targetB || '', { type: 'text' })}` : ''}`;
  } else if (type === 'amrap') {
    body = `${field('Duration', 'duration', c.duration, { min: 1, max: 1440, suffix: 'min' })}${movementField(c.movements)}`;
  } else if (type === 'for-time') {
    body = `${field('Rounds', 'rounds', c.rounds, { min: 1, max: 1000 })}${field('Time cap', 'cap', c.cap, { min: 0, max: 1440, suffix: 'min' })}${movementField(c.movements)}`;
  } else if (type === 'boxing') {
    body = `${field('Rounds', 'rounds', c.rounds, { min: 1, max: 1000 })}${field('Round duration', 'roundMinutes', c.roundMinutes, { min: 0.1, max: 60, step: 0.1, suffix: 'min' })}${field('Rest', 'restMinutes', c.restMinutes, { min: 0, max: 60, step: 0.1, suffix: 'min' })}${field('Preparation', 'prepare', c.prepare, { min: 0, max: 3600, suffix: 'sec' })}${toggleField('Final rest', 'finalRest', !!c.finalRest)}`;
  } else if (type === 'run-walk') {
    body = `${field('Rounds', 'rounds', c.rounds, { min: 1, max: 1000 })}${field('Run', 'runMinutes', c.runMinutes, { min: 0.1, max: 180, step: 0.1, suffix: 'min' })}${field('Walk', 'walkMinutes', c.walkMinutes, { min: 0.1, max: 180, step: 0.1, suffix: 'min' })}${field('Warm-up', 'warmupMinutes', c.warmupMinutes, { min: 0, max: 180, step: 0.5, suffix: 'min' })}${field('Cooldown', 'cooldownMinutes', c.cooldownMinutes, { min: 0, max: 180, step: 0.5, suffix: 'min' })}${toggleField('Final walk', 'finalWalk', !!c.finalWalk)}`;
  } else if (type === 'ladder') {
    body = `${field('Start', 'start', c.start, { min: 1, max: 3600, suffix: 'sec' })}${field('Step', 'step', c.step, { min: 1, max: 3600, suffix: 'sec' })}${field('Levels', 'levels', c.levels, { min: 1, max: 1000 })}${field('Rest', 'rest', c.rest, { min: 0, max: 3600, suffix: 'sec' })}<div class="field"><label for="b-direction">Direction</label><select id="b-direction" class="select" data-builder-key="direction"><option value="up" ${c.direction === 'up' ? 'selected' : ''}>Ascending</option><option value="down" ${c.direction === 'down' ? 'selected' : ''}>Descending</option></select></div>`;
  } else if (type === 'pyramid') {
    body = `${field('Start', 'start', c.start, { min: 1, max: 3600, suffix: 'sec' })}${field('Peak', 'peak', c.peak, { min: 1, max: 3600, suffix: 'sec' })}${field('Step', 'step', c.step, { min: 1, max: 3600, suffix: 'sec' })}${field('Rest', 'rest', c.rest, { min: 0, max: 3600, suffix: 'sec' })}`;
  } else if (type === 'custom') {
    c.parameters ||= [];
    body = `${renderCustomParameters(c.parameters)}${editingBlock ? '' : renderCustomCompileOptions(c)}<div class="field"><div class="row-between"><div><div class="field-label">Sequence structure</div><div class="small muted">Nest patterns, formulas, generators, sections and reusable blocks. Formulas resolve before the timer starts.</div></div><button class="btn" data-action="custom-add" data-parent="">＋ Add</button></div><div class="custom-tree">${renderCustomTree(c.nodes || [])}</div>${!(c.nodes || []).length ? `<div class="empty">Add a step, repeat, generator, section, or reusable block to begin.</div>` : ''}<div class="row" style="flex-wrap:wrap"><button class="btn" data-action="custom-preview">Preview compiled plan</button>${state.blocks.length ? `<span class="pill">${state.blocks.length} reusable block${state.blocks.length === 1 ? '' : 's'}</span>` : ''}</div></div>`;
  } else if (type === 'stopwatch') {
    body = `<div class="card card-pad"><strong>Stopwatch</strong><p class="muted">Open-ended timing with pause, resume and lap recording.</p></div>`;
  }

  let plan, estimate;
  try { plan = planFromType(type, c, { blocks: blocksForCurrentBuilder() }); estimate = estimatePlanDuration(plan); } catch {}
  main.innerHTML = `
    <div class="builder-head"><button class="icon-btn" data-action="builder-back" aria-label="Back">←</button><h1>${esc(editingBlock ? 'Reusable Block' : m.name)}</h1><div class="builder-actions"><button class="btn" data-action="save-builder">${editingBlock ? 'Save Block' : 'Save'}</button><button class="btn primary" data-action="start-builder">${editingBlock ? 'Test' : 'Start'}</button></div></div>
    <div class="stack">
      <section class="card form-card">
        ${field('Name', 'title', c.title || m.name, { type: 'text' })}
        ${body}
        <div id="builder-summary" class="builder-summary"><span>${esc(typeSummary(type, c))}</span><strong>${estimate != null ? durationLabel(estimate) : 'Varies'}</strong></div>
      </section>
      ${editingBlock ? '' : renderRoutineCueOverrides(state.builderCueOverrides || {})}
      <button class="btn primary big block" data-action="start-builder">${editingBlock ? 'Test Reusable Block' : `Start ${esc(m.name)}`}</button>
      ${state.builderEditingId ? `<div class="row" style="flex-wrap:wrap"><button class="btn" data-action="export-routine-package" data-id="${esc(state.builderEditingId)}">Export portable timer</button><button class="btn danger" data-action="delete-routine" data-id="${esc(state.builderEditingId)}">Delete Saved Timer</button></div>` : state.builderEditingBlockId ? `<button class="btn danger block" data-action="delete-block" data-id="${esc(state.builderEditingBlockId)}">Delete reusable block</button>` : ''}
    </div>`;
}

function movementField(value) {
  return `<div class="field"><label for="b-movements">Movements <span class="muted">(one per line)</span></label><textarea id="b-movements" rows="6" class="input" data-builder-key="movements" placeholder="5 Pull-ups\n10 Push-ups\n15 Squats">${esc(value || '')}</textarea></div>`;
}

function circuitStepRow(item, i) {
  return `<div class="circuit-step" data-circuit-index="${i}">
    <input class="input" data-circuit-field="label" value="${esc(item.label || '')}" aria-label="Step ${i + 1} label">
    <input class="input" data-circuit-field="seconds" type="number" min="0" step="1" value="${esc(item.seconds ?? 40)}" aria-label="Step ${i + 1} seconds">
    <select class="select phase-cell" data-circuit-field="phase" aria-label="Step ${i + 1} phase"><option value="work" ${item.phase === 'work' ? 'selected' : ''}>Work</option><option value="rest" ${item.phase === 'rest' ? 'selected' : ''}>Rest</option><option value="recovery" ${item.phase === 'recovery' ? 'selected' : ''}>Recovery</option><option value="custom" ${item.phase === 'custom' ? 'selected' : ''}>Custom</option></select>
    <button class="icon-btn" data-action="remove-circuit-step" data-index="${i}" aria-label="Remove step ${i + 1}">×</button>
    <label class="small muted" style="grid-column:1/-1"><input type="checkbox" data-circuit-field="manual" ${item.manual ? 'checked' : ''}> Manual completion ${item.manual ? '(seconds becomes optional cap)' : ''}</label>
  </div>`;
}


function customPathParts(path = '') {
  if (path === '') return [];
  return String(path).split('.').filter((part) => part !== '').map((part) => Number(part));
}

function customNodeAt(path) {
  if (!state.builder || state.builder.type !== 'custom') return null;
  let nodes = state.builder.config.nodes || [];
  let node = null;
  for (const index of customPathParts(path)) {
    node = nodes[index];
    if (!node) return null;
    nodes = node.children || [];
  }
  return node;
}

function customPathLabel(path = []) {
  if (!state.builder || state.builder.type !== 'custom' || !Array.isArray(path) || !path.length) return 'Routine';
  let nodes = state.builder.config.nodes || [];
  const labels = [];
  for (const index of path) {
    const node = nodes[index];
    if (!node) break;
    const block = node.type === 'block' ? state.blocks.find((item) => item.id === node.blockId) : null;
    labels.push(node.label || block?.title || (node.type === 'repeat' ? 'Repeat block' : node.type === 'manual' ? 'Manual step' : node.type === 'section' ? 'Section' : node.type === 'progression' ? 'Progression' : node.type === 'random' ? 'Random pool' : 'Timed step'));
    nodes = node.children || [];
  }
  return labels.join(' › ') || 'Routine';
}

function customChildrenAt(parentPath = '') {
  if (!state.builder || state.builder.type !== 'custom') return null;
  if (parentPath === '') return state.builder.config.nodes;
  const parent = customNodeAt(parentPath);
  return parent && ['repeat','section','random'].includes(parent.type) ? parent.children : null;
}

function customParentCollection(path) {
  const parts = customPathParts(path);
  if (!parts.length) return null;
  const index = parts.pop();
  const parentPath = parts.join('.');
  const collection = customChildrenAt(parentPath);
  return collection ? { collection, index, parentPath } : null;
}

function walkCustomNodes(nodes, fn) {
  for (const node of nodes || []) {
    fn(node);
    if (['repeat','section','random'].includes(node?.type)) walkCustomNodes(node.children, fn);
  }
}

function parameterDefaultValue(parameter) {
  if (parameter.type === 'duration') return parameter.defaultMs;
  return parameter.defaultValue;
}

function defaultParameterValues(parameters = []) {
  return Object.fromEntries(parameters.map((parameter) => [parameter.id, parameterDefaultValue(parameter)]));
}

function customParameterById(id) {
  return (state.builder?.config?.parameters || []).find((parameter) => parameter.id === id);
}

function customParameterOptions(type, selected, noneLabel = 'Fixed value') {
  const params = (state.builder?.config?.parameters || []).filter((parameter) => parameter.type === type);
  return `<option value="" ${selected ? '' : 'selected'}>${esc(noneLabel)}</option>${params.map((parameter) => `<option value="${esc(parameter.id)}" ${selected === parameter.id ? 'selected' : ''}>${esc(parameter.label)}</option>`).join('')}`;
}

function renderParameterValueInput(parameter, value, attrs = '') {
  if (parameter.type === 'duration') {
    const seconds = Math.round(Number(value ?? parameter.defaultMs) / 1000);
    return `<input class="input" type="number" min="${Math.max(1, Math.round((parameter.minMs || 1000) / 1000))}" max="${Math.round((parameter.maxMs || 86400000) / 1000)}" step="1" value="${esc(seconds)}" data-param-unit="seconds" ${attrs}>`;
  }
  if (parameter.type === 'choice') {
    return `<select class="select" ${attrs}>${(parameter.options || []).map((option) => `<option value="${esc(option.value)}" ${value === option.value ? 'selected' : ''}>${esc(option.label || option.value)}</option>`).join('')}</select>`;
  }
  return `<input class="input" type="number" min="${parameter.min ?? ''}" max="${parameter.max ?? ''}" step="${parameter.integer === false ? 'any' : '1'}" value="${esc(value ?? parameter.defaultValue)}" ${attrs}>`;
}

function renderCustomParameters(parameters = []) {
  return `<div class="parameter-editor">
    <div class="row-between"><div><div class="field-label">Launch parameters</div><div class="small muted">Expose values you want to change each time this routine starts.</div></div><button class="btn" data-action="custom-add-param">＋ Parameter</button></div>
    ${parameters.length ? `<div class="parameter-list">${parameters.map((parameter) => {
      const duration = parameter.type === 'duration';
      return `<div class="parameter-row" data-param-id="${esc(parameter.id)}">
        <div class="row-between"><span class="node-kind">${duration ? 'Duration' : parameter.type === 'choice' ? 'Choice' : 'Number'}</span><button class="mini-btn danger-text" data-action="custom-delete-param" data-id="${esc(parameter.id)}" aria-label="Delete parameter">×</button></div>
        <input class="input" value="${esc(parameter.label || '')}" data-param-id="${esc(parameter.id)}" data-param-field="label" aria-label="Parameter name">
        ${parameter.type !== 'choice' ? `<label class="custom-number-label">Formula variable<input class="input" value="${esc(parameter.variable || formulaVariableName(parameter))}" data-param-id="${esc(parameter.id)}" data-param-field="variable" aria-label="Formula variable"></label>` : ''}
        ${duration ? `<div class="parameter-grid"><label class="custom-number-label">Default seconds<input class="input" type="number" min="1" value="${Math.round(parameter.defaultMs / 1000)}" data-param-id="${esc(parameter.id)}" data-param-field="defaultMs" data-param-unit="seconds"></label><label class="custom-number-label">Min seconds<input class="input" type="number" min="1" value="${Math.round((parameter.minMs || 1000) / 1000)}" data-param-id="${esc(parameter.id)}" data-param-field="minMs" data-param-unit="seconds"></label><label class="custom-number-label">Max seconds<input class="input" type="number" min="1" value="${Math.round((parameter.maxMs || 3600000) / 1000)}" data-param-id="${esc(parameter.id)}" data-param-field="maxMs" data-param-unit="seconds"></label></div>` : `<div class="parameter-grid"><label class="custom-number-label">Default<input class="input" type="number" value="${esc(parameter.defaultValue)}" data-param-id="${esc(parameter.id)}" data-param-field="defaultValue"></label><label class="custom-number-label">Minimum<input class="input" type="number" value="${esc(parameter.min ?? 1)}" data-param-id="${esc(parameter.id)}" data-param-field="min"></label><label class="custom-number-label">Maximum<input class="input" type="number" value="${esc(parameter.max ?? 1000)}" data-param-id="${esc(parameter.id)}" data-param-field="max"></label></div>`}
      </div>`;
    }).join('')}</div>` : `<div class="small muted parameter-empty">No launch parameters yet.</div>`}
  </div>`;
}


function renderCustomCompileOptions(config) {
  return `<div class="compile-options card"><div class="field-label">Compile options</div><div class="small muted">Applied after formulas and generators resolve. Target duration proportionally fits every finite timed/capped step.</div><div class="generator-grid"><label class="custom-number-label">Duration scale<input class="input" type="number" min="0.05" max="20" step="0.05" value="${esc(config.durationScale ?? 1)}" data-builder-key="durationScale"></label><label class="custom-number-label">Target minutes (0 = off)<input class="input" type="number" min="0" step="0.1" value="${esc(config.targetDurationMinutes ?? 0)}" data-builder-key="targetDurationMinutes"></label></div><label class="custom-number-label">Randomization<select class="select" data-builder-key="randomMode"><option value="new" ${(config.randomMode || 'new') === 'new' ? 'selected' : ''}>New seeded sequence each start</option><option value="fixed" ${config.randomMode === 'fixed' ? 'selected' : ''}>Fixed reproducible seed</option></select></label>${config.randomMode === 'fixed' ? `<label class="custom-number-label">Fixed seed<input class="input" value="${esc(config.fixedSeed || 'timer-seed')}" data-builder-key="fixedSeed"></label>` : ''}</div>`;
}

function createCustomParameter(kind) {
  if (kind === 'number') return { id: uid('param'), type: 'number', label: 'Rounds', variable: 'roundsValue', defaultValue: 3, min: 1, max: 1000, integer: true };
  return { id: uid('param'), type: 'duration', label: 'Work time', variable: 'workTime', defaultMs: 40000, minMs: 1000, maxMs: 3600000, stepMs: 1000 };
}

function showCustomParameterSheet() {
  showSheet('Add Parameter', `<div class="sheet-list"><button class="sheet-item" data-action="custom-add-param-kind" data-kind="duration"><div><strong>Duration</strong><div class="small muted">Seconds/minutes used by timed steps or manual caps</div></div></button><button class="sheet-item" data-action="custom-add-param-kind" data-kind="number"><div><strong>Number</strong><div class="small muted">Whole-number values such as repeat counts</div></div></button></div>`);
}

function addCustomParameter(kind) {
  state.builder.config.parameters ||= [];
  state.builder.config.parameters.push(createCustomParameter(kind));
  closeSheet();
  renderBuilder();
}

function deleteCustomParameter(id) {
  const parameters = state.builder?.config?.parameters || [];
  const index = parameters.findIndex((parameter) => parameter.id === id);
  if (index < 0) return;
  const used = new Set(collectCustomParameterRefs(state.builder.config.nodes || [], parameters)).has(id);
  if (used) return toast('Remove this parameter from bindings and formulas before deleting it.', 4200);
  parameters.splice(index, 1);
  renderBuilder();
}

function updateCustomParameterInput(target) {
  if (!state.builder || state.builder.type !== 'custom') return;
  const id = target.dataset.paramId;
  const field = target.dataset.paramField;
  if (!id || !field) return;
  const parameter = customParameterById(id);
  if (!parameter) return;
  if (target.dataset.paramUnit === 'seconds') parameter[field] = ms(target.value);
  else if (target.type === 'number') parameter[field] = Number(target.value);
  else parameter[field] = target.value;
  refreshBuilderSummary();
}

function createCustomNode(kind) {
  if (kind === 'rest') return { id: uid('node'), type: 'timed', label: 'Rest', phase: 'rest', durationMs: 20000 };
  if (kind === 'manual') return { id: uid('node'), type: 'manual', label: 'Manual step', phase: 'work', target: '' };
  if (kind === 'repeat') return { id: uid('node'), type: 'repeat', count: 3, children: [
    { id: uid('node'), type: 'timed', label: 'Work', phase: 'work', durationMs: 40000 },
    { id: uid('node'), type: 'timed', label: 'Rest', phase: 'rest', durationMs: 20000 }
  ] };
  if (kind === 'section') return { id: uid('node'), type: 'section', label: 'Section', children: [
    { id: uid('node'), type: 'timed', label: 'Work', phase: 'work', durationMs: 40000 }
  ] };
  if (kind === 'progression') return { id: uid('node'), type: 'progression', count: 6, workLabel: 'Work', workPhase: 'work', workBaseMs: 30000, workFormula: 'base + (round - 1) * 5', restLabel: 'Rest', restPhase: 'rest', restBaseMs: 30000, restFormula: 'max(10, base - (round - 1) * 5)', finalRest: false };
  if (kind === 'random') return { id: uid('node'), type: 'random', mode: 'choose', count: 5, allowRepeats: true, avoidImmediateRepeat: true, children: [
    { id: uid('node'), type: 'timed', label: 'Push-ups', phase: 'work', durationMs: 30000 },
    { id: uid('node'), type: 'timed', label: 'Squats', phase: 'work', durationMs: 30000 },
    { id: uid('node'), type: 'timed', label: 'Burpees', phase: 'work', durationMs: 30000 }
  ] };
  return { id: uid('node'), type: 'timed', label: 'Work', phase: 'work', durationMs: 40000 };
}

function customPhaseOptions(value) {
  return ['work','rest','prepare','recovery','cooldown','custom'].map((phase) => `<option value="${phase}" ${value === phase ? 'selected' : ''}>${phase[0].toUpperCase() + phase.slice(1)}</option>`).join('');
}

function customNodeControls(path, { block = false } = {}) {
  return `<div class="custom-node-actions"><button class="mini-btn" data-action="custom-copy" data-path="${path}" aria-label="Copy item">⧉</button>${block ? `<button class="mini-btn" data-action="custom-unlink-block" data-path="${path}" aria-label="Unlink reusable block">↗</button>` : `<button class="mini-btn" data-action="custom-extract-block" data-path="${path}" aria-label="Save as reusable block">▣</button>`}<button class="mini-btn" data-action="custom-move" data-path="${path}" data-dir="-1" aria-label="Move item up">↑</button><button class="mini-btn" data-action="custom-move" data-path="${path}" data-dir="1" aria-label="Move item down">↓</button><button class="mini-btn danger-text" data-action="custom-delete" data-path="${path}" aria-label="Delete item">×</button></div>`;
}

function renderCustomTree(nodes = [], depth = 0, prefix = []) {
  return nodes.map((node, index) => {
    const path = [...prefix, index].join('.');
    if (node.type === 'block') {
      const block = state.blocks.find((item) => item.id === node.blockId);
      const controls = customNodeControls(path, { block: true });
      const values = node.parameterValues || {};
      return `<div class="custom-node custom-container block-ref" style="--depth:${depth}"><div class="custom-node-head"><span class="node-kind">Linked Block</span>${controls}</div><div><strong>${esc(block?.title || 'Missing block')}</strong><div class="tiny">${block ? `Revision ${block.revision || 1}` : 'This reusable block no longer exists.'}</div></div>${block?.parameters?.length ? `<div class="block-param-list">${block.parameters.map((parameter) => `<label class="custom-number-label">${esc(parameter.label)}${renderParameterValueInput(parameter, values[parameter.id] ?? parameterDefaultValue(parameter), `data-block-param-path="${path}" data-block-param-id="${esc(parameter.id)}"`)}</label>`).join('')}</div>` : ''}</div>`;
    }

    const controls = customNodeControls(path);
    if (node.type === 'repeat') {
      const bound = node.countParamId || '';
      return `<div class="custom-node custom-container" style="--depth:${depth}">
        <div class="custom-node-head"><span class="node-kind">Repeat / Pattern</span>${controls}</div>
        <div class="binding-grid"><label class="custom-number-label">Rounds source<select class="select" data-custom-path="${path}" data-custom-field="countParamId">${customParameterOptions('number', bound)}</select></label>${bound ? `<div class="binding-value">Uses <strong>${esc(customParameterById(bound)?.label || 'missing parameter')}</strong></div>` : `<label class="custom-number-label">Rounds<input class="input" type="number" min="1" max="1000" value="${esc(node.count)}" data-custom-path="${path}" data-custom-field="count"></label>`}</div>
        <label class="custom-number-label">Count formula <span class="tiny">optional; overrides fixed/parameter</span><input class="input formula-input" value="${esc(node.countFormula || '')}" data-custom-path="${path}" data-custom-field="countFormula" placeholder="e.g. max(1, roundsValue)"></label>
        <div class="custom-container-config"><span class="small muted">${(node.children || []).length} pattern item${(node.children || []).length === 1 ? '' : 's'}</span><button class="btn ghost compact-btn" data-action="custom-add" data-parent="${path}">＋ Add inside</button></div>
        <div class="custom-children">${renderCustomTree(node.children || [], depth + 1, [...prefix, index])}</div>
      </div>`;
    }
    if (node.type === 'section') {
      return `<div class="custom-node custom-container" style="--depth:${depth}">
        <div class="custom-node-head"><span class="node-kind">Section</span>${controls}</div>
        <input class="input" value="${esc(node.label || '')}" data-custom-path="${path}" data-custom-field="label" aria-label="Section name">
        <div class="custom-container-config"><span class="small muted">${(node.children || []).length} item${(node.children || []).length === 1 ? '' : 's'}</span><button class="btn ghost compact-btn" data-action="custom-add" data-parent="${path}">＋ Add inside</button></div>
        <div class="custom-children">${renderCustomTree(node.children || [], depth + 1, [...prefix, index])}</div>
      </div>`;
    }
    if (node.type === 'progression') {
      const bound = node.countParamId || '';
      return `<div class="custom-node custom-container generator-node" style="--depth:${depth}">
        <div class="custom-node-head"><span class="node-kind">Progression Generator</span>${controls}</div>
        <div class="binding-grid"><label class="custom-number-label">Rounds source<select class="select" data-custom-path="${path}" data-custom-field="countParamId">${customParameterOptions('number', bound)}</select></label>${bound ? `<div class="binding-value">Uses <strong>${esc(customParameterById(bound)?.label || 'missing parameter')}</strong></div>` : `<label class="custom-number-label">Rounds<input class="input" type="number" min="1" max="1000" value="${esc(node.count || 5)}" data-custom-path="${path}" data-custom-field="count"></label>`}</div>
        <label class="custom-number-label">Rounds formula <span class="tiny">optional</span><input class="input formula-input" value="${esc(node.countFormula || '')}" data-custom-path="${path}" data-custom-field="countFormula" placeholder="e.g. 6"></label>
        <div class="generator-grid"><label class="custom-number-label">Work label<input class="input" value="${esc(node.workLabel || 'Work')}" data-custom-path="${path}" data-custom-field="workLabel"></label><label class="custom-number-label">Base work (sec)<input class="input" type="number" min="1" value="${sec(node.workBaseMs || 30000)}" data-custom-path="${path}" data-custom-field="workBaseMs" data-custom-unit="seconds"></label></div>
        <label class="custom-number-label">Work formula <span class="tiny">variables: round, rounds, base, previous, index + parameter variables</span><input class="input formula-input" value="${esc(node.workFormula || 'base')}" data-custom-path="${path}" data-custom-field="workFormula" placeholder="base + (round - 1) * 5"></label>
        <div class="generator-grid"><label class="custom-number-label">Rest label<input class="input" value="${esc(node.restLabel || 'Rest')}" data-custom-path="${path}" data-custom-field="restLabel"></label><label class="custom-number-label">Base rest (sec)<input class="input" type="number" min="0" value="${sec(node.restBaseMs || 0)}" data-custom-path="${path}" data-custom-field="restBaseMs" data-custom-unit="seconds"></label></div>
        <label class="custom-number-label">Rest formula <span class="tiny">0 omits rest</span><input class="input formula-input" value="${esc(node.restFormula || '')}" data-custom-path="${path}" data-custom-field="restFormula" placeholder="max(10, base - (round - 1) * 5)"></label>
        <label class="small muted"><input type="checkbox" data-custom-path="${path}" data-custom-field="finalRest" ${node.finalRest ? 'checked' : ''}> Include final rest</label>
      </div>`;
    }
    if (node.type === 'random') {
      const bound = node.countParamId || '';
      const mode = node.mode || 'choose';
      return `<div class="custom-node custom-container generator-node" style="--depth:${depth}">
        <div class="custom-node-head"><span class="node-kind">Random Generator</span>${controls}</div>
        <div class="generator-grid"><label class="custom-number-label">Mode<select class="select" data-custom-path="${path}" data-custom-field="mode"><option value="choose" ${mode === 'choose' ? 'selected' : ''}>Choose from pool</option><option value="shuffle" ${mode === 'shuffle' ? 'selected' : ''}>Shuffle all once</option></select></label>${mode === 'choose' ? `<label class="custom-number-label">Pick count<input class="input" type="number" min="1" max="1000" value="${esc(node.count || 4)}" data-custom-path="${path}" data-custom-field="count"></label>` : ''}</div>
        ${mode === 'choose' ? `<label class="custom-number-label">Pick-count formula <span class="tiny">optional</span><input class="input formula-input" value="${esc(node.countFormula || '')}" data-custom-path="${path}" data-custom-field="countFormula" placeholder="e.g. 6"></label><label class="small muted"><input type="checkbox" data-custom-path="${path}" data-custom-field="allowRepeats" ${node.allowRepeats !== false ? 'checked' : ''}> Allow repeats</label><label class="small muted"><input type="checkbox" data-custom-path="${path}" data-custom-field="avoidImmediateRepeat" ${node.avoidImmediateRepeat !== false ? 'checked' : ''}> Avoid immediate repeat</label>` : ''}
        <div class="custom-container-config"><span class="small muted">${(node.children || []).length} pool item${(node.children || []).length === 1 ? '' : 's'}</span><button class="btn ghost compact-btn" data-action="custom-add" data-parent="${path}">＋ Add pool item</button></div>
        <div class="custom-children">${renderCustomTree(node.children || [], depth + 1, [...prefix, index])}</div>
      </div>`;
    }
    const manual = node.type === 'manual';
    const bound = manual ? (node.timeCapParamId || '') : (node.durationParamId || '');
    const secondsValue = manual ? (node.timeCapMs ? sec(node.timeCapMs) : 0) : sec(node.durationMs || 0);
    const formulaValue = manual ? (node.timeCapFormula || '') : (node.durationFormula || '');
    return `<div class="custom-node custom-leaf" style="--depth:${depth}">
      <div class="custom-node-head"><span class="node-kind">${manual ? 'Manual' : 'Timed'}</span>${controls}</div>
      <input class="input" value="${esc(node.label || '')}" data-custom-path="${path}" data-custom-field="label" aria-label="Step label">
      <div class="custom-leaf-grid"><select class="select" data-custom-path="${path}" data-custom-field="phase" aria-label="Step phase">${customPhaseOptions(node.phase || 'work')}</select><label class="custom-number-label">${manual ? 'Cap source' : 'Duration source'}<select class="select" data-custom-path="${path}" data-custom-field="${manual ? 'timeCapParamId' : 'durationParamId'}">${customParameterOptions('duration', bound, manual ? 'Fixed / no cap' : 'Fixed duration')}</select></label></div>
      ${bound ? `<div class="binding-value">Uses <strong>${esc(customParameterById(bound)?.label || 'missing parameter')}</strong></div>` : `<label class="custom-number-label">${manual ? 'Base cap seconds (0 = none)' : 'Base seconds'}<input class="input" type="number" min="0" step="1" value="${secondsValue}" data-custom-path="${path}" data-custom-field="${manual ? 'timeCapMs' : 'durationMs'}" data-custom-unit="seconds"></label>`}
      <label class="custom-number-label">${manual ? 'Cap formula' : 'Duration formula'} <span class="tiny">optional; result is seconds</span><input class="input formula-input" value="${esc(formulaValue)}" data-custom-path="${path}" data-custom-field="${manual ? 'timeCapFormula' : 'durationFormula'}" placeholder="e.g. base + (round - 1) * 5"></label>
      <input class="input" value="${esc(node.target || '')}" data-custom-path="${path}" data-custom-field="target" placeholder="Target / note (optional)" aria-label="Step target">
      ${renderStepCueOverrides(node, path)}
    </div>`;
  }).join('');
}

function showCustomAddSheet(parentPath = '') {
  const parentName = parentPath ? (customNodeAt(parentPath)?.label || 'block') : 'routine';
  showSheet(`Add to ${parentName}`, `<div class="sheet-list">
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="timed"><div><strong>Timed step</strong><div class="small muted">A normal countdown step</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="rest"><div><strong>Rest</strong><div class="small muted">20-second rest step</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="manual"><div><strong>Manual step</strong><div class="small muted">Continue when you tap Done</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="repeat"><div><strong>Repeat block</strong><div class="small muted">Nested repeated sequence</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="section"><div><strong>Section</strong><div class="small muted">Named group for structure</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="progression"><div><strong>Progression generator</strong><div class="small muted">Formula-driven work/rest progression</div></div></button>
    <button class="sheet-item" data-action="custom-add-kind" data-parent="${esc(parentPath)}" data-kind="random"><div><strong>Random generator</strong><div class="small muted">Seeded choose/shuffle pool</div></div></button>
    ${state.blocks.length ? `<button class="sheet-item" data-action="custom-block-picker" data-parent="${esc(parentPath)}" data-mode="linked"><div><strong>Linked reusable block</strong><div class="small muted">Future block revisions flow into this routine</div></div></button><button class="sheet-item" data-action="custom-block-picker" data-parent="${esc(parentPath)}" data-mode="copy"><div><strong>Copy reusable block</strong><div class="small muted">Insert independent concrete steps</div></div></button>` : ''}
    ${state.customClipboard ? `<button class="sheet-item" data-action="custom-paste" data-parent="${esc(parentPath)}"><div><strong>Paste copied item</strong><div class="small muted">Insert an independent copy</div></div></button>` : ''}
  </div>`);
}

function addCustomNode(parentPath, kind) {
  const collection = customChildrenAt(parentPath || '');
  if (!collection) return toast('This block cannot contain items.');
  collection.push(createCustomNode(kind));
  closeSheet();
  renderBuilder();
}

function freshenCustomNodeIds(node) {
  const copy = structuredClone(node);
  const walk = (item) => {
    item.id = uid('node');
    if (['repeat','section','random'].includes(item.type)) (item.children || []).forEach(walk);
  };
  walk(copy);
  return copy;
}

function materializeNodesWithValues(nodes, values) {
  const output = structuredClone(nodes || []);
  walkCustomNodes(output, (node) => {
    if (node.durationParamId) { node.durationMs = Number(values[node.durationParamId]); node.durationParamId = undefined; }
    if (node.timeCapParamId) { node.timeCapMs = Number(values[node.timeCapParamId]); node.timeCapParamId = undefined; }
    if (node.countParamId) { node.count = Number(values[node.countParamId]); node.countParamId = undefined; }
  });
  return output;
}

function showBlockPicker(parentPath, mode) {
  closeSheet();
  showSheet(mode === 'copy' ? 'Copy Reusable Block' : 'Link Reusable Block', `<div class="sheet-list">${state.blocks.map((block) => `<button class="sheet-item" data-action="custom-insert-block" data-parent="${esc(parentPath)}" data-mode="${esc(mode)}" data-id="${esc(block.id)}"><div><strong>${esc(block.title)}</strong><div class="small muted">Revision ${block.revision || 1}${block.parameters?.length ? ` · ${block.parameters.length} parameter${block.parameters.length === 1 ? '' : 's'}` : ''}</div></div></button>`).join('')}</div>`);
}

function insertCustomBlock(parentPath, blockId, mode) {
  const collection = customChildrenAt(parentPath || '');
  const block = state.blocks.find((item) => item.id === blockId);
  if (!collection || !block) return toast('Reusable block not found.');
  if (mode === 'copy') {
    try {
      const values = defaultParameterValues(block.parameters || []);
      const plan = buildCustomRoutine({ title: block.title || 'Block', nodes: block.nodes || [], parameters: block.parameters || [], parameterValues: values, blocks: state.blocks, seed: 'block-copy' });
      const materialized = plan.steps.map((item) => item.manual
        ? { id: uid('node'), type: 'manual', label: item.label, phase: item.phase, timeCapMs: item.timeCapMs, target: item.target || '' }
        : { id: uid('node'), type: 'timed', label: item.label, phase: item.phase, durationMs: item.durationMs, target: item.target || '' });
      collection.push(...materialized);
    } catch (error) { return toast(error.message || 'Reusable block could not be copied.', 4200); }
  } else {
    collection.push({ id: uid('node'), type: 'block', blockId: block.id, parameterValues: defaultParameterValues(block.parameters || []) });
  }
  closeSheet();
  renderBuilder();
}

function copyCustomNode(path) {
  const node = customNodeAt(path);
  if (!node) return;
  const refs = new Set(collectCustomParameterRefs([node], state.builder.config.parameters || []));
  const parameters = (state.builder.config.parameters || []).filter((parameter) => refs.has(parameter.id)).map((parameter) => structuredClone(parameter));
  state.customClipboard = { node: structuredClone(node), parameters };
  toast('Routine item copied.');
}

function pasteCustomNode(parentPath) {
  const collection = customChildrenAt(parentPath || '');
  if (!collection || !state.customClipboard?.node) return;
  state.builder.config.parameters ||= [];
  for (const parameter of state.customClipboard.parameters || []) {
    if (!state.builder.config.parameters.some((existing) => existing.id === parameter.id)) state.builder.config.parameters.push(structuredClone(parameter));
  }
  collection.push(freshenCustomNodeIds(state.customClipboard.node));
  closeSheet();
  renderBuilder();
}

async function extractCustomBlock(path) {
  const info = customParentCollection(path);
  const node = customNodeAt(path);
  if (!info || !node || node.type === 'block') return;
  const title = prompt('Reusable block name', node.label || (node.type === 'repeat' ? 'Repeat Block' : node.type === 'section' ? 'Section Block' : 'Timer Block'));
  if (!title?.trim()) return;
  const refs = new Set(collectCustomParameterRefs([node], state.builder.config.parameters || []));
  const parameters = (state.builder.config.parameters || []).filter((parameter) => refs.has(parameter.id)).map((parameter) => structuredClone(parameter));
  const block = { id: uid('block'), title: title.trim(), revision: 1, parameters, nodes: [structuredClone(node)] };
  await state.db.saveBlock(block);
  await loadCollections();
  info.collection[info.index] = { id: uid('node'), type: 'block', blockId: block.id, parameterValues: defaultParameterValues(parameters) };
  renderBuilder();
  toast('Reusable block created and linked.');
}

function unlinkCustomBlock(path) {
  const info = customParentCollection(path);
  const node = customNodeAt(path);
  const block = state.blocks.find((item) => item.id === node?.blockId);
  if (!info || !node || !block) return toast('Reusable block not found.');
  try {
    const values = resolveCustomParameterValues(block.parameters || [], node.parameterValues || {});
    const plan = buildCustomRoutine({ title: block.title || 'Block', nodes: block.nodes || [], parameters: block.parameters || [], parameterValues: values, blocks: state.blocks, seed: 'block-unlink' });
    const nodes = plan.steps.map((item) => item.manual
      ? { id: uid('node'), type: 'manual', label: item.label, phase: item.phase, timeCapMs: item.timeCapMs, target: item.target || '' }
      : { id: uid('node'), type: 'timed', label: item.label, phase: item.phase, durationMs: item.durationMs, target: item.target || '' });
    info.collection.splice(info.index, 1, ...nodes);
    renderBuilder();
  } catch (error) { toast(error.message || 'Block could not be unlinked.'); }
}

function moveCustomNode(path, direction) {
  const info = customParentCollection(path);
  if (!info) return;
  const next = info.index + Number(direction);
  if (next < 0 || next >= info.collection.length) return;
  const [node] = info.collection.splice(info.index, 1);
  info.collection.splice(next, 0, node);
  renderBuilder();
}

function deleteCustomNode(path) {
  const info = customParentCollection(path);
  if (!info) return;
  info.collection.splice(info.index, 1);
  renderBuilder();
}

function refreshBuilderSummary() {
  const summary = $('#builder-summary');
  if (!summary || !state.builder) return;
  const cfg = state.builder.config;
  let estimate;
  try { estimate = estimatePlanDuration(planFromType(state.builder.type, cfg, { blocks: blocksForCurrentBuilder() })); } catch {}
  summary.innerHTML = `<span>${esc(typeSummary(state.builder.type, cfg))}</span><strong>${estimate != null ? durationLabel(estimate) : 'Varies'}</strong>`;
}

function updateCustomInput(target) {
  if (!state.builder || state.builder.type !== 'custom') return;
  const path = target.dataset.customPath;
  const fieldName = target.dataset.customField;
  if (path == null || !fieldName) return;
  const node = customNodeAt(path);
  if (!node) return;
  if (fieldName === 'durationParamId' || fieldName === 'timeCapParamId' || fieldName === 'countParamId') {
    node[fieldName] = target.value || undefined;
    return renderBuilder();
  } else if (['durationMs','timeCapMs','workBaseMs','restBaseMs'].includes(fieldName)) {
    const value = Number(target.value);
    node[fieldName] = value > 0 ? ms(value) : (['timeCapMs','restBaseMs'].includes(fieldName) ? undefined : 0);
  } else if (fieldName === 'count') {
    node.count = Number(target.value);
  } else if (target.type === 'checkbox') {
    node[fieldName] = target.checked;
  } else {
    node[fieldName] = target.value;
  }
  if (fieldName === 'mode') return renderBuilder();
  refreshBuilderSummary();
}

function updateBuilderCueInput(target) {
  const field = target.dataset.builderCueField;
  if (!field || !state.builder) return;
  state.builderCueOverrides ||= {};
  if (target.value === '') delete state.builderCueOverrides[field];
  else if (field === 'warningSeconds') state.builderCueOverrides[field] = Number(target.value);
  else if (field === 'halfwayCue') state.builderCueOverrides[field] = target.value === 'true';
  else state.builderCueOverrides[field] = target.value;
}

function updateCustomCueInput(target) {
  if (!state.builder || state.builder.type !== 'custom') return;
  const path = target.dataset.customCuePath;
  const field = target.dataset.customCueField;
  if (path == null || !field) return;
  const node = customNodeAt(path);
  if (!node) return;
  node.cueOverrides ||= {};
  let value = target.value;
  if (field === 'warningSeconds' || field === 'customPercent') value = value === '' ? undefined : Number(value);
  if (field === 'halfway') value = value === 'inherit' ? undefined : value;
  if (value === '' || value === undefined) delete node.cueOverrides[field];
  else node.cueOverrides[field] = value;
  if (field === 'voiceMode') return renderBuilder();
  refreshBuilderSummary();
}

function updateBlockParameterInput(target) {
  if (!state.builder || state.builder.type !== 'custom') return;
  const path = target.dataset.blockParamPath;
  const id = target.dataset.blockParamId;
  if (path == null || !id) return;
  const node = customNodeAt(path);
  const block = state.blocks.find((item) => item.id === node?.blockId);
  const parameter = block?.parameters?.find((item) => item.id === id);
  if (!node || !parameter) return;
  node.parameterValues ||= {};
  node.parameterValues[id] = target.dataset.paramUnit === 'seconds' ? ms(target.value) : parameter.type === 'number' ? Number(target.value) : target.value;
  refreshBuilderSummary();
}

function showCustomPreview() {
  if (!state.builder || state.builder.type !== 'custom') return;
  const config = state.builder.config;
  const issues = validateCustomRoutine({ title: config.title, nodes: config.nodes || [], parameters: config.parameters || [], blocks: blocksForCurrentBuilder() });
  if (issues.length) return showSheet('Routine issues', `<div class="stack">${issues.slice(0, 30).map((issue) => `<div class="card card-pad"><strong>${esc(issue.message)}</strong><div class="tiny">${esc(issue.blockId ? `Reusable block · ${state.blocks.find((block) => block.id === issue.blockId)?.title || issue.blockId}` : customPathLabel(issue.path || []))}</div></div>`).join('')}</div>`);
  try {
    const plan = planFromType('custom', config, { blocks: blocksForCurrentBuilder() });
    const estimate = estimatePlanDuration(plan);
    const manualCount = plan.steps.filter((item) => item.manual).length;
    const previewRows = plan.steps.slice(0, 120).map((item, index) => {
      const section = item.sectionPath?.length ? item.sectionPath.map((part) => part.label).join(' › ') : '';
      const blocks = item.blockPath?.length ? item.blockPath.map((part) => part.title).join(' › ') : '';
      const round = item.repeatPath?.length ? item.repeatPath.map((part) => `${part.current}/${part.total}`).join(' · ') : '';
      const generated = item.generatorPath?.length ? item.generatorPath.map((part) => part.type === 'random' ? `Random ${part.current}/${part.total}` : `Progression ${part.current}/${part.total}`).join(' · ') : '';
      const timing = item.manual ? (item.timeCapMs ? `Manual · cap ${durationLabel(item.timeCapMs)}` : 'Manual') : durationLabel(item.durationMs);
      const trail = [blocks, section].filter(Boolean).join(' › ');
      return `<div class="preview-row"><span>${index + 1}</span><div><strong>${esc(item.label)}</strong>${trail ? `<div class="tiny">${esc(trail)}</div>` : ''}</div><div class="preview-meta">${generated ? `<div>${esc(generated)}</div>` : round ? `<div>${esc(round)}</div>` : ''}<span>${esc(timing)}</span></div></div>`;
    }).join('');
    showSheet('Compiled Preview', `<div class="stack"><div class="analytics-grid"><div class="metric"><strong>${plan.steps.length}</strong><span>Executable steps</span></div><div class="metric"><strong>${manualCount}</strong><span>Manual</span></div><div class="metric"><strong>${estimate == null ? 'Varies' : durationLabel(estimate)}</strong><span>Duration</span></div></div><div class="card card-pad small muted">Seed: ${esc(plan.meta?.randomSeed || 'preview')} · Scale: ${esc(plan.meta?.durationScale || 1)}×${plan.meta?.targetDurationMs ? ` · Target ${durationLabel(plan.meta.targetDurationMs)}` : ''}</div>${(config.parameters || []).length ? `<div class="card card-pad"><strong>Default launch parameters</strong><div class="small muted" style="margin-top:6px">${(config.parameters || []).map((parameter) => `${esc(parameter.label)}: ${parameter.type === 'duration' ? durationLabel(parameter.defaultMs) : esc(parameter.defaultValue)}`).join(' · ')}</div></div>` : ''}<div class="preview-list">${previewRows}${plan.steps.length > 120 ? `<div class="small muted">Showing first 120 of ${plan.steps.length} steps.</div>` : ''}</div></div>`);
  } catch (error) { toast(error.message || 'Routine could not be compiled.', 4200); }
}

async function saveBuilder() {
  const { type, config } = state.builder;
  const validationBlocks = blocksForCurrentBuilder();
  let compiledPlan;
  try { compiledPlan = planFromType(type, config, { blocks: validationBlocks }); } catch (error) { return toast(error.issues?.[0]?.message || error.message || 'This timer is not valid.', 4200); }
  let durationMs = null;
  try {
    const estimate = estimatePlanDuration(compiledPlan);
    if (Number.isFinite(estimate) && estimate >= 0) durationMs = estimate;
  } catch {}

  if (state.builderEditingBlockId) {
    const current = state.blocks.find((block) => block.id === state.builderEditingBlockId);
    const saved = await state.db.saveBlock({
      id: state.builderEditingBlockId,
      title: config.title?.trim() || 'Reusable Block',
      revision: current?.revision || 1,
      parameters: structuredClone(config.parameters || []),
      nodes: structuredClone(config.nodes || []),
      createdAt: current?.createdAt
    });
    await loadCollections();
    state.builderEditingBlockId = saved.id;
    toast(`Reusable block saved as revision ${saved.revision}.`);
    return renderBuilder();
  }

  const previous = state.routines.find((r) => r.id === state.builderEditingId);
  const routine = normalizeSavedTimerRecord({
    ...(previous || {}),
    id: state.builderEditingId || uid('routine'),
    type,
    title: config.title?.trim() || BUILDER_META[type].name,
    config: structuredClone(config),
    durationMs,
    createdAt: previous?.createdAt || Date.now(),
    useCount: previous?.useCount || 0,
    lastParameterValues: previous?.lastParameterValues || undefined,
    cueOverrides: structuredClone(state.builderCueOverrides || previous?.cueOverrides || {})
  });
  await state.db.saveRoutine(routine);
  await loadCollections();
  state.builderEditingId = routine.id;
  toast('Saved timer updated.');
}

function showParameterizedStart({ type, config, routineId, title, savedValues, source, cueOverrides = {}, completionAction = COMPLETION_ACTIONS.STOP, completionNextRoutineId = '' }) {
  const parameters = config.parameters || [];
  const defaults = defaultParameterValues(parameters);
  const values = { ...defaults, ...(savedValues || {}) };
  state.pendingStart = { type, config: structuredClone(config), routineId, title, source, cueOverrides: structuredClone(cueOverrides || {}), completionAction: normalizeCompletionAction(completionAction), completionNextRoutineId, blocks: structuredClone(blocksForCurrentBuilder()) };
  showSheet(`Start ${title || config.title || 'Routine'}`, `<div class="stack"><div class="small muted">Adjust this run without changing the saved routine.</div>${parameters.map((parameter) => `<label class="field"><span>${esc(parameter.label)}</span>${renderParameterValueInput(parameter, values[parameter.id], `data-launch-param="${esc(parameter.id)}"`)}</label>`).join('')}<button class="btn primary big" data-action="confirm-param-start">Start</button></div>`);
}

async function confirmParameterizedStart() {
  const pending = state.pendingStart;
  if (!pending) return;
  const parameters = pending.config.parameters || [];
  const values = {};
  for (const parameter of parameters) {
    const input = $$('[data-launch-param]', $('#sheet-root')).find((element) => element.dataset.launchParam === parameter.id);
    if (!input) continue;
    values[parameter.id] = input.dataset.paramUnit === 'seconds' ? ms(input.value) : parameter.type === 'number' ? Number(input.value) : input.value;
  }
  let resolved;
  try { resolved = resolveCustomParameterValues(parameters, values); }
  catch (error) { return toast(error.message || 'Parameter values are invalid.', 4200); }
  let plan;
  try { plan = planFromType(pending.type, pending.config, { parameterValues: resolved, blocks: pending.blocks || state.blocks, seed: pending.type === 'custom' && pending.config.randomMode !== 'fixed' ? uid('seed') : undefined }); }
  catch (error) { return toast(error.issues?.[0]?.message || error.message || 'Routine could not be compiled.', 4200); }

  if (pending.routineId) {
    const routine = state.routines.find((item) => item.id === pending.routineId);
    if (routine) {
      routine.useCount = (routine.useCount || 0) + 1;
      routine.lastUsedAt = Date.now();
      routine.lastParameterValues = structuredClone(resolved);
      await state.db.saveRoutine(routine);
    }
  }
  state.pendingStart = null;
  closeSheet();
  await loadCollections();
  await startSession(plan, { ...metaForType(pending.type, pending.config, pending.cueOverrides), title: pending.title || pending.config.title, routineId: pending.routineId, parameterValues: resolved, completionNextRoutineId: pending.completionNextRoutineId || '' }, { completionAction: pending.completionAction });
}

async function startBuilder() {
  const { type, config } = state.builder;
  if (type === 'custom' && (config.parameters || []).length) {
    const routine = state.routines.find((item) => item.id === state.builderEditingId);
    return showParameterizedStart({ type, config, routineId: state.builderEditingId || undefined, title: config.title, savedValues: routine?.lastParameterValues, source: 'builder', cueOverrides: state.builderCueOverrides, completionAction: routine?.completionAction, completionNextRoutineId: routine?.completionNextRoutineId });
  }
  let plan;
  try { plan = planFromType(type, config, { blocks: blocksForCurrentBuilder(), seed: type === 'custom' && config.randomMode !== 'fixed' ? uid('seed') : undefined }); }
  catch (e) { return toast(e.issues?.[0]?.message || e.message || 'This timer could not be created.'); }
  const saved = state.routines.find((item) => item.id === state.builderEditingId);
  await startSession(plan, { ...metaForType(type, config, state.builderCueOverrides), routineId: state.builderEditingId || undefined, completionNextRoutineId: saved?.completionNextRoutineId || '' }, { completionAction: saved?.completionAction });
}

async function startRoutine(id) {
  const routine = state.routines.find((r) => r.id === id);
  if (!routine) return toast('Saved timer not found.');
  if (routine.type === 'custom' && (routine.config?.parameters || []).length) {
    return showParameterizedStart({ type: routine.type, config: routine.config, routineId: routine.id, title: routine.title, savedValues: routine.lastParameterValues, source: 'library', cueOverrides: routine.cueOverrides, completionAction: routine.completionAction, completionNextRoutineId: routine.completionNextRoutineId });
  }
  let plan;
  try { plan = planFromType(routine.type, routine.config, { blocks: state.blocks, seed: routine.type === 'custom' && routine.config?.randomMode !== 'fixed' ? uid('seed') : undefined }); }
  catch (error) { return toast(error.issues?.[0]?.message || error.message || 'Routine could not be compiled.', 4200); }
  routine.useCount = (routine.useCount || 0) + 1;
  routine.lastUsedAt = Date.now();
  await state.db.saveRoutine(routine);
  await loadCollections();
  await startSession(plan, { ...metaForType(routine.type, routine.config, routine.cueOverrides), title: routine.title, routineId: routine.id, completionNextRoutineId: routine.completionNextRoutineId || '' }, { completionAction: routine.completionAction });
}


async function startSavedRoutineAutomated(id, { background = true, backgroundRoute = 'workspace', preserveFocus = false, workspaceGroup = '', workspaceColor = 'default', completionActionOverride = null, metaPatch = {} } = {}) {
  const routine = state.routines.find((item) => item.id === id);
  if (!routine || routine.archived) return null;
  let parameterValues = {};
  if (routine.type === 'custom' && (routine.config?.parameters || []).length) {
    try {
      parameterValues = resolveCustomParameterValues(
        routine.config.parameters,
        { ...defaultParameterValues(routine.config.parameters), ...(routine.lastParameterValues || {}) }
      );
    } catch { return null; }
  }
  let plan;
  try {
    plan = planFromType(routine.type, routine.config, {
      parameterValues,
      blocks: state.blocks,
      seed: routine.type === 'custom' && routine.config?.randomMode !== 'fixed' ? uid('seed') : undefined
    });
  } catch { return null; }
  routine.useCount = (routine.useCount || 0) + 1;
  routine.lastUsedAt = Date.now();
  if (Object.keys(parameterValues).length) routine.lastParameterValues = structuredClone(parameterValues);
  await state.db.saveRoutine(routine);
  await loadCollections();
  const meta = {
    ...metaForType(routine.type, routine.config, routine.cueOverrides),
    title: routine.title,
    routineId: routine.id,
    parameterValues,
    completionNextRoutineId: routine.completionNextRoutineId || '',
    workspaceGroup,
    workspaceColor,
    ...structuredClone(metaPatch || {})
  };
  return startSession(plan, meta, {
    background,
    backgroundRoute,
    preserveFocus,
    completionAction: completionActionOverride || routine.completionAction || COMPLETION_ACTIONS.STOP
  });
}

async function startSession(plan, meta, options = {}) {
  if (!ownership.isOwner() && !await ownership.acquire()) {
    const records = await state.db.getActiveSessions().catch(() => []);
    if (records.length) { setRemoteActive({ sessions: records }); renderRemoteActive(); }
    return toast('Another Timer window owns the active runtimes.', 3600);
  }
  const firstRuntime = coordinator.size() === 0;
  state.completion = null;
  if (firstRuntime) maintenance.suspend('active-session');
  setRemoteActive(null);
  await cue.init();
  const runtimeId = uid('timer');
  cue.beginSession(meta, runtimeId);
  const runtime = coordinator.start(plan, meta, {
    runtimeId,
    completionAction: options.completionAction || meta?.completionAction || COMPLETION_ACTIONS.STOP
  });
  await persistRuntime(runtime.id).catch(() => toast('Recovery checkpoint could not be saved.'));
  if (state.settings.keepAwake) wakeLock.acquire();
  startOwnershipHeartbeat();
  startCoordinatorScheduler();
  broadcastActiveSnapshot();
  renderUpdateBanner();
  if (options.background) {
    if (options.preserveFocus && state.activeTimerId && coordinator.has(state.activeTimerId)) {
      updateActiveTimerCards();
    } else {
      state.route = options.backgroundRoute || (state.route === 'workspace' ? 'workspace' : 'timer');
      syncFocusedRuntime(null);
      mediaSession.disable();
      render();
    }
  } else {
    focusRuntime(runtime.id);
  }
  return runtime;
}

function buildSessionRecord(snapshot, cancelled = false) {
  const plan = snapshot.plan;
  const activeDurationMs = Number.isFinite(snapshot.finalElapsedMs)
    ? Math.max(0, snapshot.finalElapsedMs)
    : Math.max(0, (snapshot.endedAt || Date.now()) - snapshot.startedAt - (snapshot.pausedTotalMs || 0));
  const totals = snapshot.phaseTotals || {};
  let workMs = Number(totals.work) || 0;
  let restMs = (Number(totals.rest) || 0) + (Number(totals.recovery) || 0);
  let otherMs = (Number(totals.prepare) || 0) + (Number(totals.cooldown) || 0) + (Number(totals.custom) || 0);
  if (!snapshot.phaseTotals && plan.kind === 'timeline') {
    for (const item of plan.steps) {
      const d = item.manual ? (item.timeCapMs || 0) : (item.durationMs || 0);
      if (item.phase === 'work') workMs += d;
      else if (item.phase === 'rest' || item.phase === 'recovery') restMs += d;
      else otherMs += d;
    }
  }
  const endedAt = snapshot.endedAt || Date.now();
  const record = {
    id: snapshot.id,
    title: snapshot.meta?.title || plan.title || 'Timer',
    mode: snapshot.meta?.mode || plan.meta?.mode || 'countdown',
    routineId: snapshot.meta?.routineId,
    config: snapshot.meta?.config,
    cueOverrides: snapshot.meta?.cueOverrides,
    plan,
    startedAt: snapshot.startedAt,
    endedAt,
    wallDurationMs: Math.max(0, endedAt - snapshot.startedAt),
    activeDurationMs,
    plannedDurationMs: estimatePlanDuration(plan),
    pausedMs: snapshot.pausedTotalMs || 0,
    overtimeMs: Math.max(0, Number(snapshot.overtimeMs) || 0),
    completionReason: snapshot.completionReason || (cancelled ? 'cancelled' : 'finished'),
    data: snapshot.data || {},
    phaseTotals: structuredClone(snapshot.phaseTotals || {}),
    events: structuredClone(snapshot.events || []),
    eventLogTruncated: Boolean(snapshot.eventLogTruncated),
    workMs, restMs, otherMs
  };
  record.comparisonFingerprint = comparisonFingerprint(record);
  return record;
}

async function saveCompletedSnapshot(snapshot, cancelled = false) {
  const record = buildSessionRecord(snapshot, cancelled);
  if (!cancelled) await state.db.put('sessions', record).catch(() => toast('Session history could not be saved.'));
  return record;
}

async function finalizeRuntime(runtimeId, snapshot, cancelled = false) {
  if (!runtimeId || state.finalizingTimers.has(runtimeId)) return;
  state.finalizingTimers.add(runtimeId);
  const wasFocused = state.activeTimerId === runtimeId;
  try {
    const record = await saveCompletedSnapshot(snapshot, cancelled);
    await state.db.clearActiveSession(runtimeId, snapshot.id).catch(() => {});
    cue.endSession(runtimeId);
    await closeTimerNotification(`timer-active:${runtimeId}`);
    coordinator.remove(runtimeId);
    ownership.post('TIMER_ENDED', { runtimeId, sessionId: snapshot.id });

    if (wasFocused) {
      stopLiveScheduler();
      syncFocusedRuntime(null);
      mediaSession.disable();
      state.liveLocked = false;
      state.controlsHidden = false;
    }

    if (!cancelled) {
      if (state.settings.notifications) showCompletionNotification(translateSource('Timer complete', currentLocale()), record.title, { sessionId: record.id });
      if (wasFocused) state.completion = record;
      else toast(`${record.title} complete.`, 3200);
    }

    await loadCollections();
    if (!coordinator.size()) {
      stopCoordinatorScheduler();
      maintenance.resume('active-session');
      await wakeLock.release();
      ownership.stopHeartbeat();
      await ownership.release();
      if (state.updateDeferred) setTimeout(() => applyUpdate(), 250);
    } else {
      if (state.settings.keepAwake) wakeLock.acquire();
      startOwnershipHeartbeat();
    }
    broadcastActiveSnapshot();
    renderUpdateBanner();
    if (wasFocused || !state.engine) render();
    else updateActiveTimerCards();
    if (wasFocused) focusMainHeading(main);
  } finally {
    state.finalizingTimers.delete(runtimeId);
  }
}

async function handleCoordinatorEvent(event) {
  const runtimeId = event.runtimeId;
  if (!runtimeId) return;
  const runtime = coordinator.get(runtimeId);
  if (event.type === 'engine-event') {
    const engineEvent = event.engineEvent;
    const snapshot = event.snapshot;
    cue.onEvent(engineEvent, snapshot, runtimeId);
    if (state.activeTimerId === runtimeId) {
      if (runtime && state.engine !== runtime.engine) syncFocusedRuntime(runtimeId);
      const announcement = timerEventAnnouncement(engineEvent, {
        phaseLabel: (phase) => localizedPhaseLabel(phase, currentLocale()),
        translateLabel: (label) => translateBuiltInLabel(label, currentLocale()),
        durationText: (value) => durationLabel(value, { style: 'long' }),
        t: (key, vars) => tr(key, vars)
      });
      if (announcement) announcer.announce(announcement, { priority: engineEvent.type === 'session-completed' ? 'assertive' : 'polite' });
      mediaSession.update(focusedView() || runtime?.engine?.view?.());
    }
    if (!['session-completed', 'session-cancelled'].includes(engineEvent.type)) void persistRuntime(runtimeId);
    broadcastActiveSnapshot();
    updateActiveTimerCards();
    return;
  }
  if (event.type === 'overtime-started' || event.type === 'overtime-paused' || event.type === 'overtime-resumed') {
    void persistRuntime(runtimeId);
    broadcastActiveSnapshot();
    if (state.activeTimerId === runtimeId) updateLiveView(true);
    return;
  }
  if (event.type === 'cycle-completed') {
    await saveCompletedSnapshot(event.snapshot, false);
    return;
  }
  if (event.type === 'cycle-restarted') {
    if (state.activeTimerId === runtimeId) syncFocusedRuntime(runtimeId);
    void persistRuntime(runtimeId);
    broadcastActiveSnapshot();
    if (state.activeTimerId === runtimeId) renderLive();
    return;
  }
  if (event.type === 'runtime-terminal') {
    const wasFocused = state.activeTimerId === runtimeId;
    const queueHandled = await handleQueueRuntimeTerminal(runtime, event);
    let chained = null;
    if (!queueHandled && event.startNext && !event.cancelled) {
      const nextRoutineId = runtime?.meta?.completionNextRoutineId;
      if (nextRoutineId) {
        chained = await startSavedRoutineAutomated(nextRoutineId, {
          background: !wasFocused,
          backgroundRoute: state.route === 'workspace' ? 'workspace' : 'timer',
          preserveFocus: !wasFocused && Boolean(state.activeTimerId),
          workspaceGroup: runtime?.meta?.workspaceGroup || '',
          workspaceColor: runtime?.meta?.workspaceColor || 'default'
        });
      }
    }
    await finalizeRuntime(runtimeId, event.snapshot, Boolean(event.cancelled));
    if (!queueHandled && event.startNext && !chained) toast('The configured next Saved Timer could not be started.', 4200);
  }
}

coordinator.subscribe((event) => { void handleCoordinatorEvent(event); });

function stopCoordinatorScheduler() {
  clearTimeout(state.multiTimerTimeout);
  state.multiTimerTimeout = 0;
}

function startCoordinatorScheduler() {
  if (state.multiTimerTimeout || !coordinator.size()) return;
  const loop = () => {
    state.multiTimerTimeout = 0;
    if (!coordinator.size() || !ownership.isOwner()) return;
    const focused = state.activeTimerId;
    for (const runtime of coordinator.list()) {
      if (!(focused === runtime.id && document.visibilityState === 'visible')) {
        try { coordinator.reconcile(runtime.id); } catch {}
      }
      const view = coordinator.view(runtime.id);
      if (view && !['completed','cancelled'].includes(view.status)) cue.tick(view, runtime.engine.snapshot(), runtime.id);
    }
    updateActiveTimerCards();
    const delay = document.visibilityState === 'visible' ? 250 : 1000;
    state.multiTimerTimeout = setTimeout(loop, delay);
  };
  state.multiTimerTimeout = setTimeout(loop, 0);
}

function updateActiveTimerCards() {
  for (const card of $$('[data-active-runtime]')) {
    const runtimeId = card.dataset.activeRuntime;
    const view = coordinator.view(runtimeId);
    if (!view) { card.remove(); continue; }
    const current = view.current || {};
    const value = view.status === 'overtime' ? view.overtimeMs : (current.remainingMs != null ? current.remainingMs : current.elapsedMs);
    const time = $('.active-timer-time', card);
    if (time) time.textContent = `${view.status === 'overtime' ? '+' : ''}${formatClock(value || 0, { countUp: current.remainingMs == null })}`;
    const status = $('.active-timer-status', card);
    if (status) status.textContent = view.status === 'paused' ? 'Paused' : view.status === 'overtime' ? 'Overtime' : translateBuiltInLabel(current.label || view.title, currentLocale());
    const toggle = $('[data-action="active-toggle"]', card);
    if (toggle) toggle.textContent = view.status === 'paused' ? 'Resume' : 'Pause';
    for (const adjust of $$('[data-action="active-adjust"]', card)) adjust.disabled = view.status === 'paused' || view.status === 'overtime';
  }
  for (const card of $('[data-workspace-runtime]')) {
    const runtimeId = card.dataset.workspaceRuntime;
    const runtime = coordinator.get(runtimeId);
    const view = coordinator.view(runtimeId);
    if (!runtime || !view) { card.remove(); continue; }
    const current = view.current || {};
    const value = view.status === 'overtime' ? view.overtimeMs : (current.remainingMs != null ? current.remainingMs : current.elapsedMs);
    const time = $('.workspace-time', card);
    if (time) time.textContent = `${view.status === 'overtime' ? '+' : ''}${formatClock(value || 0, { tenths: view.mode === 'stopwatch', countUp: current.remainingMs == null })}`;
    const phase = view.status === 'paused' ? 'Paused' : view.status === 'overtime' ? 'Overtime' : translateBuiltInLabel(current.label || view.title, currentLocale());
    const meta = $('.workspace-timer-copy small', card);
    if (meta) meta.textContent = `${runtime.meta?.workspaceGroup || 'Ungrouped'} · ${phase}`;
    const toggle = $('[data-action="active-toggle"]', card);
    if (toggle) toggle.textContent = view.status === 'paused' ? 'Resume' : 'Pause';
  }
}

function stopLiveScheduler() {
  cancelAnimationFrame(state.liveRaf);
  clearTimeout(state.liveTimeout);
  state.liveRaf = 0;
  state.liveTimeout = 0;
  state.liveSchedulerKind = 'idle';
}

function currentLiveSchedulerPolicy() {
  const v = focusedView();
  if (!v) return { kind: 'idle', intervalMs: 0, minFrameMs: 0 };
  return liveSchedulerPolicy({
    visible: document.visibilityState === 'visible',
    status: v.status === 'overtime' ? 'running' : v.status,
    mode: v.mode,
    layout: state.settings.layout,
    progressKnown: v.current?.progress != null,
    reducedMotion: reduceMotionEnabled(state.settings.reduceMotion)
  });
}

function runLiveTick() {
  if (!state.engine || !state.activeTimerId) return false;
  try { coordinator.reconcile(state.activeTimerId); } catch {}
  const runtime = focusedRuntime();
  const view = focusedView();
  if (!runtime || !view || ['completed', 'cancelled'].includes(view.status)) return false;
  cue.tick(view, runtime.engine.snapshot(), runtime.id);
  updateLiveView(false);
  return Boolean(state.engine);
}

function startLiveScheduler() {
  stopLiveScheduler();
  if (!state.engine) return;
  const policy = currentLiveSchedulerPolicy();
  state.liveSchedulerKind = policy.kind;
  if (policy.kind === 'idle') return;
  if (policy.kind === 'animation') {
    state.liveLastFrame = 0;
    const loop = (timestamp) => {
      if (!state.engine) return;
      const nextPolicy = currentLiveSchedulerPolicy();
      if (nextPolicy.kind !== 'animation') return startLiveScheduler();
      if (!state.liveLastFrame || timestamp - state.liveLastFrame >= nextPolicy.minFrameMs) {
        state.liveLastFrame = timestamp;
        if (!runLiveTick()) return;
      }
      state.liveRaf = requestAnimationFrame(loop);
    };
    state.liveRaf = requestAnimationFrame(loop);
    return;
  }
  const loop = () => {
    if (!state.engine) return;
    const nextPolicy = currentLiveSchedulerPolicy();
    if (nextPolicy.kind !== 'timeout') return startLiveScheduler();
    if (!runLiveTick()) return;
    state.liveTimeout = setTimeout(loop, nextPolicy.intervalMs);
  };
  state.liveTimeout = setTimeout(loop, policy.intervalMs);
}

function renderLive() {
  if (!state.engine) return;
  setLiveMode(true);
  if (state.activeTimerId) coordinator.reconcile(state.activeTimerId);
  if (!state.engine) return;
  const v = focusedView();
  if (!v) return;
  document.title = `${v.status === 'paused' ? translateSource('Paused', currentLocale()) : translateBuiltInLabel(v.current?.label || 'Timer', currentLocale())} — Timer`;
  state.liveSemanticKey = '';
  state.liveModeKey = '';
  state.lastProgress = -1;
  state.lastLiveSecond = null;
  main.innerHTML = `
    <section id="live-shell" class="live-shell layout-${esc(state.settings.layout)} ${v.status === 'paused' ? 'paused' : ''}" data-phase="${esc(v.current?.phase || 'custom')}">
      <div class="live-top">
        <span id="live-round" class="pill"></span>
        <div class="row"><button class="icon-btn" data-action="live-mute" aria-label="Toggle cues">${cue.muted ? '🔇' : '🔊'}</button><button class="icon-btn" data-action="live-more" aria-label="More timer actions">⋯</button></div>
      </div>
      <div class="live-main">
        <div id="live-phase" class="live-phase"></div>
        <div id="live-time" class="live-time" role="timer" aria-live="off" aria-atomic="true" aria-label="Timer"></div>
        <div id="live-label" class="live-label"></div>
        <div id="live-target" class="live-target"></div>
        <div id="live-progress-track" class="progress" role="progressbar" aria-label="Interval progress" aria-valuemin="0" aria-valuemax="100"><span id="live-progress"></span></div>
        <div id="mode-panel"></div>
        <div id="live-next" class="live-next"></div>
      </div>
      <div id="live-controls" class="live-controls">
        <div class="live-control-row">
          <button id="adjust-minus" class="live-control" data-action="live-adjust" data-delta="-${state.settings.adjustmentMs}">−${Math.round(state.settings.adjustmentMs / 1000)}</button>
          <button id="pause-btn" class="live-control primary" data-action="live-pause">Pause</button>
          <button id="adjust-plus" class="live-control" data-action="live-adjust" data-delta="${state.settings.adjustmentMs}">+${Math.round(state.settings.adjustmentMs / 1000)}</button>
        </div>
        <button id="live-secondary" class="live-control next" data-action="live-next">Next</button>
      </div>
      ${state.liveLocked ? `<div class="lock-overlay"><button class="unlock-btn" data-action="live-unlock">🔒 Unlock controls</button></div>` : ''}
    </section>`;
  updateLiveView(true);
  setupWallAutoHide();
  startLiveScheduler();
}

function updateLiveView(force = false) {
  const engine = state.engine;
  if (!engine) return;
  const v = focusedView();
  if (!v || v.status === 'completed' || v.status === 'cancelled') return;
  const current = v.current || {};
  const displayMs = current.remainingMs != null ? current.remainingMs : current.elapsedMs;
  const isCountUp = current.remainingMs == null;
  const tenths = v.mode === 'stopwatch';
  const text = `${v.status === 'overtime' ? '+' : ''}${formatClock(displayMs, { tenths, countUp: isCountUp })}`;
  const liveTime = $('#live-time');
  const timeChanged = force || liveTime?.textContent !== text;
  if (timeChanged && liveTime) {
    liveTime.textContent = text;
    liveTime.setAttribute('aria-label', current.remainingMs != null ? tr('a11y.remaining', { duration: durationLabel(current.remainingMs, { style: 'long' }) }) : `${translateBuiltInLabel(current.label || v.title, currentLocale())} ${durationLabel(current.elapsedMs || 0, { style: 'long' })}`);
  }

  const p = current.progress ?? 0;
  const progressPercent = current.progress == null ? -1 : Math.round(clamp(p, 0, 1) * 100);
  if (force || progressPercent !== state.lastProgress || state.liveSchedulerKind === 'animation') {
    $('#live-progress')?.style.setProperty('transform', `scaleX(${clamp(p, 0, 1)})`);
    const progressTrack = $('#live-progress-track');
    if (current.progress == null) progressTrack?.removeAttribute('aria-valuenow');
    else if (force || progressPercent !== state.lastProgress) progressTrack?.setAttribute('aria-valuenow', String(progressPercent));
    state.lastProgress = progressPercent;
  }

  const round = current.round;
  const blockLabel = current.blockPath?.at(-1)?.title;
  const sectionLabel = current.sectionPath?.at(-1)?.label;
  const generator = current.generatorPath?.at(-1);
  const generatorLabel = generator?.type === 'random' ? `Random ${generator.current} / ${generator.total}` : '';
  const roundLabel = round ? tr('a11y.round', round) : '';
  const contextLabel = [blockLabel, sectionLabel, generatorLabel, roundLabel].filter(Boolean).join(' · ');
  const next = v.next;
  const semanticKey = [
    v.status, v.mode, current.id || '', current.phase || '', current.label || '', current.target || '',
    current.restingUntilDeadline ? 1 : 0, contextLabel, next?.id || '', next?.label || '', cue.muted ? 1 : 0
  ].join('|');

  if (force || semanticKey !== state.liveSemanticKey) {
    const semanticPhase = v.status === 'paused' ? translateSource('Paused', currentLocale()) : v.status === 'overtime' ? 'Overtime' : localizedPhaseLabel(current.phase || (isCountUp ? 'custom' : 'work'), currentLocale());
    $('#live-phase').textContent = semanticPhase;
    $('#live-label').textContent = translateBuiltInLabel(current.label || v.title, currentLocale());
    $('#live-target').textContent = current.target ? String(current.target) : '';
    $('#live-round').textContent = contextLabel || (v.mode === 'stopwatch' ? translateSource('Stopwatch', currentLocale()) : translateBuiltInLabel(v.title, currentLocale()));
    $('#live-next').innerHTML = next ? `${translateSource('Next', currentLocale())}<br><strong>${esc(translateBuiltInLabel(next.label, currentLocale()))}${next.durationMs ? ` · ${formatClock(next.durationMs)}` : ''}</strong>` : '';
    const shell = $('#live-shell');
    if (shell) {
      shell.dataset.phase = current.phase || 'custom';
      shell.classList.toggle('paused', v.status === 'paused');
      shell.classList.toggle('controls-hidden', state.controlsHidden && state.settings.layout === 'wall');
    }
    $('#pause-btn').textContent = translateSource(v.status === 'paused' ? 'Resume' : 'Pause', currentLocale());
    const canAdjust = v.status === 'running' && current.remainingMs != null;
    $('#adjust-minus').disabled = !canAdjust;
    $('#adjust-plus').disabled = !canAdjust;
    renderModePanel(v);
    updateSecondaryAction(v);
    state.liveSemanticKey = semanticKey;
  }
}

function renderModePanel(v) {
  const el = $('#mode-panel');
  if (!el) return;
  const data = v.data || {};
  if (v.mode === 'amrap') {
    const movements = v.planKind === 'timebox' ? state.engine.session.plan.meta?.movements || [] : [];
    el.innerHTML = `<div class="score-panel"><div class="score-big">Round ${data.rounds || 0}${data.reps ? ` + ${data.reps} reps` : ''}</div><button class="btn primary big" data-action="amrap-round">＋ Round</button><div class="score-row"><button data-action="amrap-reps" data-delta="-1">−</button><strong>${data.reps || 0} extra reps</strong><button data-action="amrap-reps" data-delta="1">＋</button></div>${movements.length ? `<div class="movements">${movements.map((m) => `<div>${m.target ? `${esc(m.target)} ` : ''}${esc(m.label)}</div>`).join('')}</div>` : ''}</div>`;
  } else if (v.mode === 'for-time') {
    const movements = state.engine.session.plan.meta?.movements || [];
    el.innerHTML = movements.length ? `<div class="movements">${movements.map((m) => `<div>${m.target ? `${esc(m.target)} ` : ''}${esc(m.label)}</div>`).join('')}</div>` : '';
  } else if (v.mode === 'stopwatch') {
    const laps = data.laps || [];
    el.innerHTML = laps.length ? `<div class="laps"><div class="lap-row muted"><span>Lap</span><span>Lap time</span><span>Total</span></div>${[...laps].reverse().slice(0, 6).map((l) => `<div class="lap-row"><span>${l.index}</span><span>${formatClock(l.lapDurationMs, { tenths: true, countUp: true })}</span><span>${formatClock(l.sessionElapsedMs, { tenths: true, countUp: true })}</span></div>`).join('')}</div>` : '';
  } else {
    el.innerHTML = '';
  }
}

function updateSecondaryAction(v) {
  const btn = $('#live-secondary');
  if (!btn) return;
  const current = v.current || {};
  if (v.status === 'overtime') { btn.textContent = translateSource('Finish', currentLocale()); btn.dataset.action = 'live-finish'; btn.disabled = false; }
  else if (v.mode === 'stopwatch') { btn.textContent = translateSource('Lap', currentLocale()); btn.dataset.action = 'live-lap'; btn.disabled = v.status === 'paused'; }
  else if (v.mode === 'for-time') { btn.textContent = translateSource('Finish', currentLocale()); btn.dataset.action = 'live-finish'; btn.disabled = false; }
  else if (current.manual && !current.restingUntilDeadline) { btn.textContent = translateSource('Done', currentLocale()); btn.dataset.action = 'live-done'; btn.disabled = v.status === 'paused'; }
  else if (current.restingUntilDeadline) { btn.textContent = translateSource('Resting until next block', currentLocale()); btn.dataset.action = 'noop'; btn.disabled = true; }
  else { btn.textContent = translateSource('Next', currentLocale()); btn.dataset.action = 'live-next'; btn.disabled = v.status === 'paused'; }
}

function setupWallAutoHide() {
  clearTimeout(state.wallHideTimer);
  if (state.settings.layout !== 'wall' || !state.settings.wallAutoHide || state.liveLocked) return;
  state.controlsHidden = false;
  const shell = $('#live-shell');
  const reset = () => {
    state.controlsHidden = false;
    shell?.classList.remove('controls-hidden');
    clearTimeout(state.wallHideTimer);
    state.wallHideTimer = setTimeout(() => {
      if (shell?.contains(document.activeElement)) return reset();
      state.controlsHidden = true;
      shell?.classList.add('controls-hidden');
    }, 3500);
  };
  shell?.addEventListener('pointerdown', reset);
  shell?.addEventListener('focusin', reset);
  shell?.addEventListener('focusout', reset);
  reset();
}

function renderCompletion() {
  setLiveMode(false);
  const r = state.completion;
  main.innerHTML = `<div class="stack" style="min-height:65vh;align-content:center;text-align:center;max-width:560px;margin:auto">
    <div class="quick-label">${r.completionReason === 'user-ended' ? 'Session Ended' : 'Complete'}</div>
    <div class="quick-time" style="font-size:clamp(4.5rem,22vw,8rem)">${formatClock(r.activeDurationMs, { countUp: true })}</div>
    <h1 style="margin:0">${esc(r.title)}</h1>
    ${r.mode === 'amrap' ? `<p class="muted">${r.data?.rounds || 0} rounds + ${r.data?.reps || 0} reps</p>` : ''}
    <div class="analytics-grid">
      <div class="metric"><strong>${durationLabel(r.workMs)}</strong><span>Work</span></div>
      <div class="metric"><strong>${durationLabel(r.restMs)}</strong><span>Rest</span></div>
      <div class="metric"><strong>${durationLabel(r.pausedMs)}</strong><span>Paused</span></div>
    </div>
    <button class="btn primary big" data-action="completion-done">Done</button>
    <button class="btn" data-action="repeat-session" data-id="${esc(r.id)}">Repeat</button>
  </div>`;
}

function savedTimerCollections() {
  const actual = state.routines.map((timer) => timer.collection).filter(Boolean);
  return normalizeSavedTimerCollections([...(state.settings.savedTimerCollections || DEFAULT_SAVED_TIMER_COLLECTIONS), ...actual]);
}

function savedTimerDuration(timer) {
  if (timer?.durationMs != null && Number.isFinite(Number(timer.durationMs))) return Math.max(0, Number(timer.durationMs));
  try {
    const estimate = estimatePlanDuration(planFromType(timer.type, timer.config || {}, { blocks: state.blocks }));
    return Number.isFinite(estimate) && estimate >= 0 ? estimate : null;
  } catch { return null; }
}

function libraryViewLabel(view = state.libraryView) {
  if (view === 'all') return 'All Saved Timers';
  if (view === 'pinned') return 'Pinned';
  if (view === 'favorites') return 'Favorites';
  if (view === 'archived') return 'Archive';
  if (view.startsWith('collection:')) return view.slice('collection:'.length);
  return 'Saved Timers';
}

function visibleSavedTimers() {
  const query = state.libraryQuery.trim().toLowerCase();
  return state.routines.filter((timer) => {
    if (!savedTimerMatchesView(timer, state.libraryView)) return false;
    if (!query) return true;
    return savedTimerSearchText(
      timer,
      BUILDER_META[timer.type]?.name || timer.type || '',
      typeSummary(timer.type, timer.config || {})
    ).includes(query);
  });
}

function renderLibrary() {
  for (const id of [...state.savedSelected]) if (!state.routines.some((timer) => timer.id === id)) state.savedSelected.delete(id);
  const query = state.libraryQuery.trim().toLowerCase();
  const routines = sortSavedTimers(visibleSavedTimers(), state.librarySort, savedTimerDuration);
  const blockMatches = (block) => !query || `${block.title || ''} reusable block ${(block.parameters || []).map((parameter) => parameter.label).join(' ')}`.toLowerCase().includes(query);
  const blocks = [...state.blocks].filter(blockMatches).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const collections = savedTimerCollections();
  const selectedCount = state.savedSelected.size;
  const viewChip = (value, label) => `<button class="library-filter-chip ${state.libraryView === value ? 'active' : ''}" data-action="saved-view" data-view="${esc(value)}">${esc(label)}</button>`;

  main.innerHTML = `<div class="page-head"><div><h1>Saved Timers</h1><p>Presets, sequences and specialized timers in one library.</p></div><button class="btn primary" data-action="create">+ Create</button></div>
    <div class="saved-library-toolbar card card-pad">
      <div class="field"><label for="library-search">Search saved timers or blocks</label><input id="library-search" class="input" type="search" data-library-search value="${esc(state.libraryQuery)}" placeholder="Name, description, collection, tag, or timer type"></div>
      <div class="library-filter-strip" aria-label="Saved timer views">
        ${viewChip('all','All')}${viewChip('pinned','Pinned')}${viewChip('favorites','Favorites')}${viewChip('archived','Archive')}
        ${collections.map((name) => viewChip(`collection:${name}`, name)).join('')}
      </div>
      <div class="library-control-row">
        <label class="library-sort-label"><span>Sort</span><select class="select" data-saved-sort>
          <option value="recent" ${state.librarySort === 'recent' ? 'selected' : ''}>Recent</option>
          <option value="most-used" ${state.librarySort === 'most-used' ? 'selected' : ''}>Most used</option>
          <option value="alphabetical" ${state.librarySort === 'alphabetical' ? 'selected' : ''}>Alphabetical</option>
          <option value="duration" ${state.librarySort === 'duration' ? 'selected' : ''}>Duration</option>
        </select></label>
        <div class="row library-toolbar-actions"><button class="btn" data-action="manage-saved-collections">Collections</button><button class="btn ${state.savedSelectMode ? 'primary' : ''}" data-action="toggle-saved-select-mode">${state.savedSelectMode ? 'Done' : 'Select'}</button></div>
      </div>
    </div>
    ${state.savedSelectMode ? `<div class="saved-bulk-bar card"><strong>${selectedCount} selected</strong><div class="saved-bulk-actions"><button class="btn compact-btn" data-action="select-all-visible">All</button><button class="btn compact-btn" data-action="bulk-saved-move" ${selectedCount ? '' : 'disabled'}>Move</button><button class="btn compact-btn" data-action="${state.libraryView === 'archived' ? 'bulk-saved-restore' : 'bulk-saved-archive'}" ${selectedCount ? '' : 'disabled'}>${state.libraryView === 'archived' ? 'Restore' : 'Archive'}</button><button class="btn compact-btn danger" data-action="bulk-saved-delete" ${selectedCount ? '' : 'disabled'}>Delete</button></div></div>` : ''}
    <section class="section"><div class="row-between"><div><h2 class="section-title" style="margin:0">${esc(libraryViewLabel())}</h2><div class="small muted" style="margin-top:5px">${esc(state.librarySort === 'most-used' ? 'Sorted by usage' : state.librarySort === 'alphabetical' ? 'Sorted A-Z' : state.librarySort === 'duration' ? 'Shortest finite duration first' : 'Most recently used or changed first')}</div></div><span class="pill">${routines.length}</span></div><div class="saved-timer-list" style="margin-top:12px">${routines.length ? routines.map(routineRow).join('') : `<div class="card empty"><p>${query ? 'No saved timers match your search.' : state.libraryView === 'archived' ? 'Archive is empty.' : 'No saved timers in this view.'}</p>${query || state.libraryView === 'archived' ? '' : '<button class="btn primary" data-action="create">Create timer</button>'}</div>`}</div></section>
    ${(blocks.length || (!query && state.blocks.length === 0)) ? `<section class="section"><div class="row-between"><div><h2 class="section-title" style="margin:0">Reusable Blocks</h2><div class="small muted" style="margin-top:5px">Linked building blocks for Sequence Timers.</div></div><span class="pill">${blocks.length}</span></div><div class="list" style="margin-top:12px">${blocks.length ? blocks.map(blockRow).join('') : `<div class="card empty">Create a Sequence Timer, then extract steps as reusable blocks.</div>`}</div></section>` : ''}`;
  if (state.librarySearchActive) {
    requestAnimationFrame(() => {
      const input = $('#library-search');
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      state.librarySearchActive = false;
    });
  }
}

function routineRow(r) {
  r = normalizeSavedTimerRecord(r);
  const params = r.type === 'custom' && r.config?.parameters?.length ? ` - ${r.config.parameters.length} param${r.config.parameters.length === 1 ? '' : 's'}` : '';
  const duration = savedTimerDuration(r);
  const collection = r.collection ? ` - ${r.collection}` : '';
  const usage = r.useCount ? ` - used ${r.useCount}x` : '';
  const selected = state.savedSelected.has(r.id);
  const mainAction = state.savedSelectMode ? 'select-saved' : 'edit-routine';
  return `<article class="saved-timer-row ${selected ? 'selected' : ''}" data-saved-accent="${esc(r.accent || 'default')}">
    ${state.savedSelectMode ? `<button class="saved-select-check" data-action="select-saved" data-id="${esc(r.id)}" aria-pressed="${selected}" aria-label="${selected ? 'Deselect' : 'Select'} ${esc(r.title)}">${selected ? '&#10003;' : ''}</button>` : ''}
    <div class="saved-timer-icon" aria-hidden="true">${esc(r.icon)}</div>
    <button class="saved-timer-main" data-action="${mainAction}" data-id="${esc(r.id)}">
      <span class="saved-timer-title">${esc(r.title)}</span>
      <span class="saved-timer-meta">${esc(BUILDER_META[r.type]?.name || r.type)} - ${esc(duration != null ? durationLabel(duration) : typeSummary(r.type, r.config || {}))}${esc(collection)}${params}${usage}</span>
      ${r.description ? `<span class="saved-timer-description">${esc(r.description)}</span>` : ''}
      ${r.tags.length ? `<span class="saved-tag-row">${r.tags.slice(0,4).map((tag) => `<span class="saved-tag">#${esc(tag)}</span>`).join('')}</span>` : ''}
    </button>
    <div class="saved-timer-row-actions">
      <button class="saved-mini-action ${r.pinned ? 'on' : ''}" data-action="pin-saved" data-id="${esc(r.id)}" aria-label="${r.pinned ? 'Unpin' : 'Pin'} ${esc(r.title)}">&#9670;</button>
      <button class="saved-mini-action favorite ${r.favorite ? 'on' : ''}" data-action="favorite-routine" data-id="${esc(r.id)}" aria-label="${r.favorite ? 'Remove from' : 'Add to'} favorites">&#9733;</button>
      <button class="saved-mini-action" data-action="saved-menu" data-id="${esc(r.id)}" aria-label="More actions for ${esc(r.title)}">...</button>
      <button class="play-btn" data-action="start-routine" data-id="${esc(r.id)}" aria-label="Start ${esc(r.title)}">&#9654;</button>
    </div>
  </article>`;
}

function showSavedTimerMenu(id) {
  const timer = state.routines.find((item) => item.id === id);
  if (!timer) return toast('Saved timer not found.');
  showSheet(timer.title, `<div class="sheet-list">
    <button class="sheet-item" data-action="edit-routine" data-id="${esc(id)}"><div><strong>Edit timer</strong><div class="small muted">Change duration, sequence or timer-specific settings</div></div></button>
    <button class="sheet-item" data-action="edit-saved-meta" data-id="${esc(id)}"><div><strong>Details & organization</strong><div class="small muted">Icon, accent, description, collection and tags</div></div></button>
    <button class="sheet-item" data-action="move-saved" data-id="${esc(id)}"><div><strong>Move to collection</strong><div class="small muted">${esc(timer.collection || 'Unsorted')}</div></div></button>
    <button class="sheet-item" data-action="duplicate-saved" data-id="${esc(id)}"><div><strong>Duplicate</strong><div class="small muted">Create an independent copy</div></div></button>
    <button class="sheet-item" data-action="archive-saved" data-id="${esc(id)}"><div><strong>${timer.archived ? 'Restore from archive' : 'Archive'}</strong><div class="small muted">Keep it without showing it in normal views</div></div></button>
    <button class="sheet-item" data-action="export-routine-package" data-id="${esc(id)}"><div><strong>Export</strong><div class="small muted">Portable Timer package</div></div></button>
    <button class="sheet-item danger-text" data-action="delete-routine" data-id="${esc(id)}"><div><strong>Delete</strong><div class="small muted">Session history is kept</div></div></button>
  </div>`);
}

function showSavedTimerMetadata(id) {
  const timer = state.routines.find((item) => item.id === id);
  if (!timer) return toast('Saved timer not found.');
  const r = normalizeSavedTimerRecord(timer);
  const collections = savedTimerCollections();
  const completion = normalizeCompletionAction(r.completionAction);
  const nextOptions = state.routines.filter((item) => item.id !== r.id && !item.archived).map((item) => `<option value="${esc(item.id)}" ${item.id === r.completionNextRoutineId ? 'selected' : ''}>${esc(item.title)}</option>`).join('');
  showSheet('Saved Timer Details', `<div class="stack">
    <div class="saved-meta-preview" data-saved-accent="${esc(r.accent)}"><div class="saved-timer-icon">${esc(r.icon)}</div><div><strong>${esc(r.title)}</strong><div class="small muted">${esc(BUILDER_META[r.type]?.name || r.type)}</div></div></div>
    <label class="field"><span>Name</span><input class="input" data-saved-meta="title" maxlength="120" value="${esc(r.title)}"></label>
    <div class="input-row"><label class="field"><span>Icon</span><input class="input" data-saved-meta="icon" maxlength="8" value="${esc(r.icon)}"></label><label class="field"><span>Accent</span><select class="select" data-saved-meta="accent">${SAVED_TIMER_ACCENTS.map((accent) => `<option value="${accent}" ${r.accent === accent ? 'selected' : ''}>${accent[0].toUpperCase()+accent.slice(1)}</option>`).join('')}</select></label></div>
    <label class="field"><span>Description</span><textarea class="input" rows="3" maxlength="500" data-saved-meta="description" placeholder="Optional note about when or why you use this timer">${esc(r.description)}</textarea></label>
    <label class="field"><span>Collection</span><select class="select" data-saved-meta="collection"><option value="">Unsorted</option>${collections.map((name) => `<option value="${esc(name)}" ${r.collection === name ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>
    <label class="field"><span>Tags</span><input class="input" data-saved-meta="tags" value="${esc(r.tags.join(', '))}" placeholder="study, focus, evening"></label>
    <label class="field"><span>Default completion action</span><select class="select" data-saved-meta="completion"><option value="stop" ${completion === 'stop' ? 'selected' : ''}>Stop</option><option value="overtime" ${completion === 'overtime' ? 'selected' : ''}>Count overtime</option><option value="repeat" ${completion === 'repeat' ? 'selected' : ''}>Repeat automatically</option><option value="start-next" ${completion === 'start-next' ? 'selected' : ''}>Start another Saved Timer</option></select></label>
    <label class="field"><span>Next Saved Timer</span><select class="select" data-saved-meta="next"><option value="">Choose timer</option>${nextOptions}</select><small class="muted">Used by Start Next. Each target may define its own completion action.</small></label>
    <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-action="save-saved-meta" data-id="${esc(id)}">Save details</button><button class="btn" data-action="manage-saved-collections">Manage collections</button></div>
  </div>`);
}

async function saveSavedTimerMetadata(id) {
  const timer = state.routines.find((item) => item.id === id);
  const root = $('#sheet-root');
  if (!timer || !root) return;
  const value = (field) => root.querySelector(`[data-saved-meta="${field}"]`)?.value ?? '';
  const nextTitle = String(value('title')).trim() || timer.title || 'Saved Timer';
  const completionAction = normalizeCompletionAction(value('completion'));
  const completionNextRoutineId = value('next');
  if (completionAction === COMPLETION_ACTIONS.START_NEXT && (!completionNextRoutineId || completionNextRoutineId === id || !state.routines.some((item) => item.id === completionNextRoutineId && !item.archived))) return toast('Choose a different Saved Timer for Start Next.');
  const next = normalizeSavedTimerRecord({
    ...timer,
    title: nextTitle,
    config: timer.config ? { ...structuredClone(timer.config), title: nextTitle } : timer.config,
    icon: value('icon'),
    accent: value('accent'),
    description: value('description'),
    collection: value('collection'),
    tags: normalizeSavedTimerTags(value('tags')),
    completionAction,
    completionNextRoutineId: completionAction === COMPLETION_ACTIONS.START_NEXT ? completionNextRoutineId : ''
  });
  await state.db.saveRoutine(next);
  await loadCollections();
  closeSheet();
  renderLibrary();
  toast('Saved Timer details updated.');
}

function showMoveSavedTimers(ids) {
  const valid = [...new Set(ids)].filter((id) => state.routines.some((timer) => timer.id === id));
  if (!valid.length) return toast('Select at least one Saved Timer.');
  state.pendingSavedMoveIds = valid;
  const collections = savedTimerCollections();
  showSheet(valid.length === 1 ? 'Move Saved Timer' : `Move ${valid.length} Saved Timers`, `<div class="stack"><label class="field"><span>Collection</span><select class="select" data-saved-move-collection><option value="">Unsorted</option>${collections.map((name) => `<option value="${esc(name)}">${esc(name)}</option>`).join('')}</select></label><button class="btn primary" data-action="apply-saved-move">Move</button></div>`);
}

async function applySavedMove() {
  const collection = $('#sheet-root [data-saved-move-collection]')?.value || '';
  for (const id of state.pendingSavedMoveIds) {
    const timer = state.routines.find((item) => item.id === id);
    if (timer) await state.db.saveRoutine({ ...timer, collection });
  }
  state.pendingSavedMoveIds = [];
  await loadCollections();
  closeSheet();
  renderLibrary();
  toast('Saved Timers moved.');
}

function showSavedCollectionsManager() {
  const collections = savedTimerCollections();
  showSheet('Collections', `<div class="stack"><div class="small muted">Start with Cooking, Study, Workout, Church and Music, then add whatever else you need.</div><div class="saved-collection-list">${collections.length ? collections.map((name) => { const count = state.routines.filter((timer) => timer.collection === name).length; return `<div class="saved-collection-row"><span><strong>${esc(name)}</strong><small>${count} timer${count === 1 ? '' : 's'}</small></span><button class="icon-btn danger-text" data-action="delete-saved-collection" data-collection="${esc(name)}" aria-label="Delete collection ${esc(name)}">x</button></div>`; }).join('') : '<div class="empty">No collections yet.</div>'}</div><div class="row"><input class="input" data-new-saved-collection maxlength="40" placeholder="New collection name"><button class="btn primary" data-action="add-saved-collection">Add</button></div></div>`);
}

async function addSavedCollection() {
  const input = $('#sheet-root [data-new-saved-collection]');
  const name = normalizeSavedTimerCollections([input?.value || ''])[0];
  if (!name) return toast('Enter a collection name.');
  const current = savedTimerCollections();
  if (current.some((item) => item.toLowerCase() === name.toLowerCase())) return toast('That collection already exists.');
  state.settings.savedTimerCollections = normalizeSavedTimerCollections([...(state.settings.savedTimerCollections || []), name]);
  await state.db.saveSettings(state.settings);
  showSavedCollectionsManager();
}

async function deleteSavedCollection(name) {
  name = String(name || '');
  if (!name) return;
  const affected = state.routines.filter((timer) => timer.collection === name);
  if (affected.length && !confirm(`Remove collection "${name}" and move ${affected.length} timer${affected.length === 1 ? '' : 's'} to Unsorted?`)) return;
  for (const timer of affected) await state.db.saveRoutine({ ...timer, collection: '' });
  state.settings.savedTimerCollections = normalizeSavedTimerCollections((state.settings.savedTimerCollections || []).filter((item) => item !== name));
  await state.db.saveSettings(state.settings);
  await loadCollections();
  if (state.libraryView === `collection:${name}`) state.libraryView = 'all';
  showSavedCollectionsManager();
}

async function duplicateSavedTimer(id) {
  const timer = state.routines.find((item) => item.id === id);
  if (!timer) return toast('Saved timer not found.');
  const copy = duplicateSavedTimerRecord(timer, { id: uid('routine') });
  await state.db.saveRoutine(copy);
  await loadCollections();
  closeSheet();
  renderLibrary();
  toast('Saved Timer duplicated.');
}

async function setSavedTimerFlag(id, key, value = null) {
  const timer = state.routines.find((item) => item.id === id);
  if (!timer) return;
  const next = { ...timer, [key]: value == null ? !timer[key] : Boolean(value) };
  await state.db.saveRoutine(next);
  await loadCollections();
  if (state.route === 'library') renderLibrary();
}

function nodesReferenceBlock(nodes, blockId) {
  let found = false;
  walkCustomNodes(nodes, (node) => { if (node?.type === 'block' && node.blockId === blockId) found = true; });
  return found;
}

function blockUsageCount(blockId) {
  const routines = state.routines.filter((routine) => routine.type === 'custom' && nodesReferenceBlock(routine.config?.nodes, blockId)).length;
  const blocks = state.blocks.filter((block) => block.id !== blockId && nodesReferenceBlock(block.nodes, blockId)).length;
  return routines + blocks;
}

function blockRow(block) {
  const usage = blockUsageCount(block.id);
  return `<div class="list-row"><div class="block-icon" aria-hidden="true">▣</div><button class="list-row-main" data-action="edit-block" data-id="${esc(block.id)}"><div class="list-row-title">${esc(block.title)}</div><div class="list-row-meta">Revision ${block.revision || 1} · ${(block.parameters || []).length} parameter${(block.parameters || []).length === 1 ? '' : 's'} · used ${usage} time${usage === 1 ? '' : 's'}</div></button><button class="icon-btn danger-text" data-action="delete-block" data-id="${esc(block.id)}" aria-label="Delete ${esc(block.title)}">×</button></div>`;
}

async function deleteReusableBlock(id) {
  const block = state.blocks.find((item) => item.id === id);
  if (!block) return;
  const usage = blockUsageCount(id);
  if (usage) return toast(`“${block.title}” is still linked from ${usage} saved item${usage === 1 ? '' : 's'}. Unlink those references first.`, 4800);
  if (!confirm(`Delete reusable block “${block.title}”?`)) return;
  await state.db.delete('blocks', id);
  if (state.builderEditingBlockId === id) { state.builder = null; state.builderEditingBlockId = null; state.route = 'library'; }
  await loadCollections();
  render();
  toast('Reusable block deleted.');
}

function completionLabel(reason) {
  return ({ finished: 'Completed', 'time-cap': 'Time cap', 'user-ended': 'Ended early', cancelled: 'Cancelled', interrupted: 'Interrupted' })[reason] || String(reason || 'Completed');
}

function filteredHistorySessions() {
  const q = String(state.historyQuery || '').trim().toLowerCase();
  return state.sessions.filter((session) => {
    if (state.historyMode !== 'all' && session.mode !== state.historyMode) return false;
    if (!q) return true;
    const haystack = `${session.title || ''} ${session.mode || ''} ${completionLabel(session.completionReason)} ${session.notes || ''}`.toLowerCase();
    return haystack.includes(q);
  });
}

function historyModeOptions() {
  const modes = [...new Set(state.sessions.map((session) => session.mode).filter(Boolean))].sort();
  return `<option value="all" ${state.historyMode === 'all' ? 'selected' : ''}>All modes</option>${modes.map((mode) => `<option value="${esc(mode)}" ${state.historyMode === mode ? 'selected' : ''}>${esc(BUILDER_META[mode]?.name || mode)}</option>`).join('')}`;
}

function renderHistory() {
  const sessions = filteredHistorySessions();
  const recent30 = summarizeRange(sessions, { from: Date.now() - 30 * 86400000 });
  main.innerHTML = `<div class="page-head"><div><h1>History</h1><p>Observed sessions, comparisons and timer-derived records.</p></div><div class="row"><button class="btn" data-action="history-export-csv">CSV</button><button class="btn" data-action="history-export-json">JSON</button></div></div>
    <div class="history-toolbar card card-pad">
      <input class="input" data-history-search value="${esc(state.historyQuery)}" placeholder="Search sessions" aria-label="Search history">
      <select class="select" data-history-mode aria-label="Filter history by mode">${historyModeOptions()}</select>
    </div>
    <div class="segmented" role="group" aria-label="History view">
      ${['list','calendar','stats'].map((view) => `<button aria-pressed="${state.historyView === view}" class="${state.historyView === view ? 'active' : ''}" data-action="history-view" data-view="${view}">${view[0].toUpperCase()+view.slice(1)}</button>`).join('')}
    </div>
    <div class="analytics-grid history-summary-grid">
      <div class="metric"><strong>${recent30.sessions}</strong><span>Last 30 days</span></div>
      <div class="metric"><strong>${durationLabel(recent30.activeMs)}</strong><span>Timed</span></div>
      <div class="metric"><strong>${durationLabel(recent30.workMs)}</strong><span>Observed work</span></div>
    </div>
    ${state.historyView === 'calendar' ? renderHistoryCalendar(sessions) : state.historyView === 'stats' ? renderHistoryStats(sessions) : renderHistoryList(sessions)}`;
}

function renderHistoryList(sessions) {
  const visible = sessions.slice(0, state.historyVisible);
  const more = Math.max(0, sessions.length - visible.length);
  return `<section class="section"><div class="row-between"><h2 class="section-title" style="margin:0">Sessions</h2><span class="pill">${sessions.length}</span></div>${state.historyLoading ? `<div class="small muted history-loading">Loading full history in the background…</div>` : ''}<div class="list" style="margin-top:12px">${visible.length ? visible.map(sessionRowDetailed).join('') : `<div class="card empty">No sessions match this filter.</div>`}</div>${more ? `<button class="btn block" data-action="history-more" style="margin-top:12px">Load ${Math.min(100, more)} more · ${more} remaining</button>` : ''}</section>`;
}

function renderHistoryCalendar(sessions) {
  const monthDate = new Date(state.historyMonth);
  const cal = monthCalendar(sessions, monthDate.getFullYear(), monthDate.getMonth());
  const monthLabel = uiDate(monthDate, { month: 'long', year: 'numeric' });
  const weekday = Array.from({ length: 7 }, (_, i) => uiDate(new Date(2024, 0, 7 + i), { weekday: 'short' }));
  const blanks = Array.from({ length: cal.firstWeekday }, () => `<div class="calendar-day empty-day" aria-hidden="true"></div>`).join('');
  const days = Array.from({ length: cal.days }, (_, i) => {
    const day = i + 1;
    const count = cal.counts.get(day) || 0;
    const timestamp = new Date(cal.year, cal.month, day).getTime();
    return `<button class="calendar-day ${count ? 'has-sessions' : ''}" data-action="history-day" data-day="${timestamp}" ${count ? '' : 'disabled'}><span>${day}</span>${count ? `<strong>${count}</strong>` : ''}</button>`;
  }).join('');
  return `<section class="section"><div class="calendar-head"><button class="icon-btn" data-action="history-month" data-delta="-1" aria-label="Previous month">←</button><h2>${esc(monthLabel)}</h2><button class="icon-btn" data-action="history-month" data-delta="1" aria-label="Next month">→</button></div><div class="calendar-grid calendar-weekdays">${weekday.map((w) => `<div>${esc(w)}</div>`).join('')}</div><div class="calendar-grid">${blanks}${days}</div></section>`;
}

function renderHistoryStats(sessions) {
  const now = Date.now();
  const weekStart = startOfLocalWeek(now, true);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const week = summarizeRange(sessions, { from: weekStart });
  const month = summarizeRange(sessions, { from: monthStart });
  const modeRows = Object.entries(summarizeRange(sessions).modes).sort((a,b) => b[1]-a[1]).slice(0,8);
  const seen = new Set();
  const records = [];
  for (const session of sessions) {
    if (!['for-time','amrap','stopwatch'].includes(session.mode)) continue;
    const fp = session.comparisonFingerprint || comparisonFingerprint(session);
    if (seen.has(fp)) continue;
    seen.add(fp);
    const record = objectiveRecord(sessions, session);
    if (record) records.push({ session, record });
    if (records.length >= 6) break;
  }
  return `<section class="section stack">
    <div class="stats-two-col">
      <div class="card card-pad"><div class="section-title">This week</div><div class="stats-big">${week.sessions} sessions</div><div class="muted">${durationLabel(week.activeMs)} timed · ${durationLabel(week.workMs)} observed work</div></div>
      <div class="card card-pad"><div class="section-title">This month</div><div class="stats-big">${month.sessions} sessions</div><div class="muted">${durationLabel(month.activeMs)} timed · ${durationLabel(month.pausedMs)} paused</div></div>
    </div>
    <div class="card card-pad"><div class="section-title">Mode usage</div><div class="stats-mode-list">${modeRows.length ? modeRows.map(([mode,count]) => `<div><span>${esc(BUILDER_META[mode]?.name || mode)}</span><strong>${count}</strong></div>`).join('') : `<div class="muted">No sessions yet.</div>`}</div></div>
    <div class="card card-pad"><div class="section-title">Objective records</div><div class="stack">${records.length ? records.map(({session,record}) => `<button class="record-row" data-action="session-detail" data-id="${esc(record.sessionId)}"><span><strong>${esc(session.title)}</strong><small>${esc(record.label)} · ${record.sampleSize} comparable attempts</small></span><b>${record.valueMs != null ? formatClock(record.valueMs,{countUp:true,tenths:record.type==='stopwatch'}) : esc(record.display)}</b></button>`).join('') : `<div class="muted">Records appear after at least two comparable For Time, AMRAP or stopwatch attempts.</div>`}</div></div>
  </section>`;
}

function sessionRowDetailed(s) {
  const d = uiDate(s.startedAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const score = s.mode === 'amrap' ? `${s.data?.rounds || 0} + ${s.data?.reps || 0}` : formatClock(s.activeDurationMs, { countUp: true });
  const analysis = analyzeSession(s);
  const detail = [BUILDER_META[s.mode]?.name || s.mode || 'Timer', score, completionLabel(s.completionReason)];
  if (analysis.adjustments.count) detail.push(`${analysis.adjustments.count} adjustment${analysis.adjustments.count === 1 ? '' : 's'}`);
  return `<div class="list-row"><button class="list-row-main" data-action="session-detail" data-id="${esc(s.id)}"><div class="list-row-title">${esc(s.title)}</div><div class="list-row-meta">${esc(d)} · ${detail.map(esc).join(' · ')}</div></button><button class="play-btn" data-action="repeat-session" data-id="${esc(s.id)}" aria-label="Repeat ${esc(s.title)}">▶</button></div>`;
}

function showHistoryDay(timestamp) {
  const from = startOfLocalDay(Number(timestamp));
  const to = from + 86400000;
  const sessions = filteredHistorySessions().filter((s) => s.startedAt >= from && s.startedAt < to);
  const label = uiDate(from, { dateStyle: 'full' });
  showSheet(label, `<div class="list">${sessions.length ? sessions.map(sessionRowDetailed).join('') : `<div class="muted">No sessions.</div>`}</div>`);
}

function formatSignedMs(msValue) {
  const value = numSafe(msValue);
  return `${value >= 0 ? '+' : '−'}${durationLabel(Math.abs(value))}`;
}

function numSafe(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }

function sessionModeAnalysis(s, analysis) {
  const comparable = comparableSessions(state.sessions, s, { limit: 5 });
  const record = objectiveRecord(state.sessions, s);
  const trend = factualTrend(state.sessions, s);
  let body = '';
  if (analysis.amrap) body += `<div class="card card-pad"><div class="section-title">AMRAP result</div><div class="stats-big">${esc(analysis.amrap.display)}</div>${analysis.amrap.normalized != null ? `<div class="muted">${analysis.amrap.normalized} total reps using this routine's numeric targets</div>` : ''}</div>`;
  if (analysis.emom?.earlyDoneCount) body += `<div class="card card-pad"><div class="section-title">EMOM early completion</div><div class="stats-big">${analysis.emom.earlyDoneCount} blocks</div><div class="muted">Average remaining rest ${durationLabel(analysis.emom.averageRemainingRestMs)}</div></div>`;
  if (analysis.laps) body += `<div class="card card-pad"><div class="section-title">Lap statistics</div><div class="analytics-grid"><div class="metric"><strong>${formatClock(analysis.laps.fastestMs,{tenths:true,countUp:true})}</strong><span>Fastest</span></div><div class="metric"><strong>${formatClock(analysis.laps.averageMs,{tenths:true,countUp:true})}</strong><span>Average</span></div><div class="metric"><strong>${formatClock(analysis.laps.medianMs,{tenths:true,countUp:true})}</strong><span>Median</span></div></div></div>`;
  if (record) body += `<div class="record-callout"><strong>${record.isCurrent ? 'Current session matches the ' : ''}${esc(record.label)}</strong><span>${record.valueMs != null ? formatClock(record.valueMs,{countUp:true,tenths:record.type==='stopwatch'}) : esc(record.display)} · ${record.sampleSize} comparable attempts</span></div>`;
  if (trend?.type === 'times') body += `<div class="card card-pad"><div class="section-title">Last ${trend.values.length} comparable times</div><div class="trend-values">${trend.values.map((value) => `<span>${formatClock(value,{countUp:true})}</span>`).join('<b>→</b>')}</div></div>`;
  if (trend?.type === 'scores') body += `<div class="card card-pad"><div class="section-title">Last ${trend.values.length} comparable scores</div><div class="trend-values">${trend.values.map((value) => `<span>${esc(value)}</span>`).join('<b>→</b>')}</div></div>`;
  if (comparable.length > 1) body += `<div class="card card-pad"><div class="section-title">Comparable attempts</div><div class="mini-history">${comparable.map((item) => `<button data-action="session-detail" data-id="${esc(item.id)}"><span>${uiDate(item.startedAt,{month:'short',day:'numeric'})}</span><strong>${item.mode === 'amrap' ? esc(`${item.data?.rounds || 0} + ${item.data?.reps || 0}`) : formatClock(item.activeDurationMs,{countUp:true})}</strong></button>`).join('')}</div></div>`;
  return body;
}

function showSessionDetail(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const analysis = analyzeSession(s);
  const d = uiDate(s.startedAt, { dateStyle: 'medium', timeStyle: 'short' });
  const planned = analysis.plannedDurationMs;
  const actualVsPlanned = planned != null ? `${formatClock(analysis.activeDurationMs,{countUp:true})} / ${formatClock(planned,{countUp:true})}` : formatClock(analysis.activeDurationMs,{countUp:true});
  const phaseTotal = Object.values(analysis.phaseTotals).reduce((a,b)=>a+b,0) || 1;
  const timeline = analysis.timeline.slice(0, 120);
  showSheet(s.title, `<div class="stack session-review">
    <div class="row-between"><div class="muted">${esc(d)}</div><span class="pill">${esc(completionLabel(s.completionReason))}</span></div>
    <div class="analytics-grid"><div class="metric"><strong>${actualVsPlanned}</strong><span>${planned != null ? 'Actual / planned' : 'Active time'}</span></div><div class="metric"><strong>${durationLabel(analysis.pausedMs)}</strong><span>Paused</span></div><div class="metric"><strong>${durationLabel(analysis.wallDurationMs)}</strong><span>Wall time</span></div></div>
    <div class="card card-pad"><div class="small muted" style="margin-bottom:8px">Observed phase time</div><div class="bar-stack"><span class="phase-work" style="width:${pct(analysis.phaseTotals.work/phaseTotal)}"></span><span class="phase-rest" style="width:${pct((analysis.phaseTotals.rest+analysis.phaseTotals.recovery)/phaseTotal)}"></span><span class="phase-other" style="flex:1"></span></div><div class="phase-legend"><span>Work ${durationLabel(analysis.phaseTotals.work)}</span><span>Rest ${durationLabel(analysis.phaseTotals.rest+analysis.phaseTotals.recovery)}</span><span>Other ${durationLabel(analysis.phaseTotals.prepare+analysis.phaseTotals.cooldown+analysis.phaseTotals.custom)}</span></div></div>
    <div class="stats-two-col"><div class="card card-pad"><div class="section-title">Actions</div><div class="stats-mode-list"><div><span>Pauses</span><strong>${analysis.pauses}</strong></div><div><span>Skips</span><strong>${analysis.skips}</strong></div><div><span>Restarts</span><strong>${analysis.restarts}</strong></div><div><span>Adjustments</span><strong>${analysis.adjustments.count}${analysis.adjustments.count ? ` · ${formatSignedMs(analysis.adjustments.netMs)}` : ''}</strong></div></div></div>${planned != null ? `<div class="card card-pad"><div class="section-title">Completion</div><div class="stats-big">${Math.round((analysis.completionPercent || 0)*100)}%</div><div class="muted">Based only on active time versus the original finite planned duration.</div></div>` : `<div class="card card-pad"><div class="section-title">Completion</div><div class="muted">No finite planned duration for this session.</div></div>`}</div>
    ${sessionModeAnalysis(s, analysis)}
    ${s.data?.laps?.length ? `<div class="card card-pad"><strong>Laps</strong><div class="laps" style="max-height:none">${s.data.laps.map((l) => `<div class="lap-row"><span>${l.index}</span><span>${formatClock(l.lapDurationMs,{tenths:true,countUp:true})}</span><span>${formatClock(l.sessionElapsedMs,{tenths:true,countUp:true})}</span></div>`).join('')}</div></div>` : ''}
    <div class="card card-pad stack"><div class="section-title">Session note</div><textarea class="input" rows="3" data-session-note data-id="${esc(s.id)}" placeholder="Optional note about this attempt">${esc(s.notes || '')}</textarea><button class="btn" data-action="save-session-note" data-id="${esc(s.id)}">Save note</button></div>
    <details class="card card-pad" ${timeline.length && timeline.length < 16 ? 'open' : ''}><summary><strong>Session timeline</strong> · ${analysis.timeline.length} events</summary><div class="event-timeline">${timeline.length ? timeline.map((entry) => `<div class="event-row"><time>${formatClock(entry.offsetMs,{countUp:true})}</time><span>${esc(entry.label)}</span></div>`).join('') : `<div class="muted">Detailed event history was not recorded by this older Timer version.</div>`}${s.eventLogTruncated ? `<div class="muted">Event log was truncated for safety.</div>` : ''}${analysis.timeline.length > timeline.length ? `<div class="muted">Showing first ${timeline.length} events.</div>` : ''}</div></details>
    <button class="btn primary" data-action="repeat-session" data-id="${esc(s.id)}">Repeat exact timer</button>
    <button class="btn danger" data-action="delete-session" data-id="${esc(s.id)}">Delete session</button>
  </div>`);
}

function scrubCustomSoundFromNodes(nodes = [], soundId) {
  const ref = `custom:${soundId}`;
  const cueKeys = ['transitionSound', 'customSound'];
  for (const node of nodes || []) {
    for (const bucket of ['cueOverrides', 'workCueOverrides', 'restCueOverrides']) {
      const cueData = node?.[bucket];
      if (!cueData) continue;
      for (const key of cueKeys) if (cueData[key] === ref) delete cueData[key];
    }
    if (Array.isArray(node?.children)) scrubCustomSoundFromNodes(node.children, soundId);
  }
}

async function scrubDeletedCustomSound(soundId) {
  const ref = `custom:${soundId}`;
  const mappingKeys = ['soundWork','soundRest','soundPrepare','soundCountdown','soundWarning','soundHalfway','soundFinish'];
  for (const key of mappingKeys) if (state.settings[key] === ref) state.settings[key] = '';
  await saveSettings();
  for (const profile of state.cueProfiles) {
    let changed = false;
    for (const key of mappingKeys) if (profile[key] === ref) { profile[key] = ''; changed = true; }
    if (changed) await state.db.saveCueProfile(profile);
  }
  for (const routine of state.routines) {
    let changed = false;
    if (routine.cueOverrides) for (const key of mappingKeys) if (routine.cueOverrides[key] === ref) { routine.cueOverrides[key] = ''; changed = true; }
    if (routine.type === 'custom') { const before = JSON.stringify(routine.config.nodes || []); scrubCustomSoundFromNodes(routine.config.nodes || [], soundId); changed ||= before !== JSON.stringify(routine.config.nodes || []); }
    if (changed) await state.db.saveRoutine(routine);
  }
  for (const block of state.blocks) {
    const before = JSON.stringify(block.nodes || []);
    scrubCustomSoundFromNodes(block.nodes || [], soundId);
    if (before !== JSON.stringify(block.nodes || [])) await state.db.saveBlock(block);
  }
}

function renderSettings() {
  const s = state.settings;
  state.deviceCapabilities = detectDeviceCapabilities();
  const caps = state.deviceCapabilities;
  const voices = state.availableVoices || [];
  const selectedProfile = cueProfileById(s.cueProfileId || 'standard', state.cueProfiles);
  const perfMeasures = state.bootPerformance?.measures || {};
  const bootMs = Number(perfMeasures.bootInteractiveMs);
  const localeOptions = LOCALE_OPTIONS.map((option) => `<option value="${esc(option.id)}" ${s.language === option.id ? 'selected' : ''}>${esc(option.label)}</option>`).join('');
  const voiceOptions = `<option value="" ${!s.voiceURI ? 'selected' : ''}>System default</option>${voices.map((voice) => `<option value="${esc(voice.voiceURI)}" ${s.voiceURI === voice.voiceURI ? 'selected' : ''}>${esc(voice.name)} · ${esc(voice.lang)}${voice.localService ? ' · Local' : ''}</option>`).join('')}`;
  const customProfileRows = state.cueProfiles.length ? state.cueProfiles.map((profile) => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(profile.title)}</div><div class="list-row-meta">${esc(SOUND_PACKS[profile.soundPack]?.title || profile.soundPack || 'Clean')} · ${profile.voice ? 'Voice' : 'No voice'} · ${profile.warningSeconds || 0}s warning</div></div><button class="icon-btn" data-action="delete-cue-profile" data-id="${esc(profile.id)}" aria-label="Delete ${esc(profile.title)}">×</button></div>`).join('') : `<div class="small muted">No custom cue profiles yet.</div>`;
  const soundRows = state.customSounds.length ? state.customSounds.map((sound) => `<div class="list-row"><button class="list-row-main" data-action="preview-custom-sound" data-id="${esc(sound.id)}"><div class="list-row-title">${esc(sound.title)}</div><div class="list-row-meta">${durationLabel(sound.durationMs || 0)} · ${Math.max(1, Math.round((sound.size || 0) / 1024))} KB</div></button><button class="icon-btn" data-action="delete-custom-sound" data-id="${esc(sound.id)}" aria-label="Delete ${esc(sound.title)}">×</button></div>`).join('') : `<div class="small muted">No uploaded cue sounds.</div>`;
  main.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Display, cues, data and device behavior.</p></div></div>
    <section class="card form-card">
      <h2 class="section-title">Appearance</h2>
      <div class="field"><label for="theme-select">Theme</label><select id="theme-select" class="select" data-setting="theme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option><option value="oled" ${s.theme === 'oled' ? 'selected' : ''}>OLED</option></select></div>
      <div class="field"><label for="layout-select">Default live layout</label><select id="layout-select" class="select" data-setting="layout"><option value="focus" ${s.layout === 'focus' ? 'selected' : ''}>Focus</option><option value="classic" ${s.layout === 'classic' ? 'selected' : ''}>Classic</option><option value="strength" ${s.layout === 'strength' ? 'selected' : ''}>Strength</option><option value="wall" ${s.layout === 'wall' ? 'selected' : ''}>Wall</option></select></div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Accessibility & Language</h2>
      <div class="accessibility-grid">
        <div class="field"><label>Language</label><select class="select" data-setting="language">${localeOptions}</select></div>
        <div class="field"><label>Text size</label><select class="select" data-setting="textScale"><option value="normal" ${s.textScale==='normal'?'selected':''}>Normal</option><option value="large" ${s.textScale==='large'?'selected':''}>Large</option><option value="xlarge" ${s.textScale==='xlarge'?'selected':''}>Extra large</option></select></div>
        <div class="field"><label>Reduce motion</label><select class="select" data-setting="reduceMotion"><option value="system" ${s.reduceMotion==='system'?'selected':''}>System</option><option value="on" ${s.reduceMotion==='on'?'selected':''}>On</option><option value="off" ${s.reduceMotion==='off'?'selected':''}>Off</option></select></div>
        <div class="field"><label>Time format</label><select class="select" data-setting="timeFormat"><option value="system" ${s.timeFormat==='system'?'selected':''}>System</option><option value="24" ${s.timeFormat==='24'?'selected':''}>24-hour</option><option value="12" ${s.timeFormat==='12'?'selected':''}>12-hour</option></select></div>
        <div class="field"><label>Number digits</label><select class="select" data-setting="numberSystem"><option value="system" ${s.numberSystem==='system'?'selected':''}>System digits</option><option value="latn" ${s.numberSystem==='latn'?'selected':''}>Latin digits</option></select></div>
      </div>
      ${settingToggle('High contrast', 'highContrast', s.highContrast, 'Stronger borders, text contrast and progress visibility')}
      ${settingToggle('Large controls', 'largeControls', s.largeControls, 'Larger touch targets and more spacing in live controls')}
      ${settingToggle('Screen reader optimization', 'screenReaderOptimized', s.screenReaderOptimized, 'Prioritizes semantic announcements and suppresses app speech to avoid overlapping voices')}
      <div class="locale-note">Browser pinch zoom remains enabled. Pseudo locales are included for layout/RTL testing and are not production translations.</div>
      <button class="btn" data-action="show-keyboard-shortcuts">Keyboard shortcuts</button>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Timer</h2>
      <div class="field"><label for="adjust-setting">Live timer adjustment</label><select id="adjust-setting" class="select" data-setting="adjustmentMs"><option value="5000" ${s.adjustmentMs===5000?'selected':''}>5 seconds</option><option value="15000" ${s.adjustmentMs===15000?'selected':''}>15 seconds</option><option value="30000" ${s.adjustmentMs===30000?'selected':''}>30 seconds</option><option value="60000" ${s.adjustmentMs===60000?'selected':''}>1 minute</option></select></div>
      <div class="setting-action-row"><div><strong>Quick Timer</strong><div class="small muted">Pinned one-tap durations, recent durations, and Home adjustment buttons.</div></div><button class="btn" data-action="customize-quick">Customize</button></div>
      ${settingToggle('Keep screen awake', 'keepAwake', s.keepAwake, 'Uses Screen Wake Lock when supported')}
      ${settingToggle('Wall layout auto-hide', 'wallAutoHide', s.wallAutoHide, 'Hide controls after a few seconds')}
    </section>
    <section class="card form-card cue-settings" style="margin-top:12px"><h2 class="section-title">Cue Profile</h2>
      <div class="field"><label>Profile</label><select class="select" data-setting="cueProfileId">${cueProfileOptions(s.cueProfileId || 'standard')}</select></div>
      <div class="small muted">${esc(selectedProfile?.title || 'Standard')} is the current baseline. You can still adjust the individual cue controls below.</div>
      <div class="field"><label>Sound pack</label><select class="select" data-setting="soundPack">${soundPackOptions(s.soundPack || 'clean')}</select></div>
      <div class="field"><label>Master cue volume</label><input class="input" data-setting="masterVolume" type="range" min="0" max="1" step="0.05" value="${esc(s.masterVolume ?? 1)}"></div>
      ${settingToggle('Sound', 'sound', s.sound)}
      ${settingToggle('3–2–1 countdown cues', 'countdownCues', s.countdownCues)}
      ${settingToggle('Halfway cue', 'halfwayCue', s.halfwayCue)}
      <div class="field"><label>Warning cue</label><select class="select" data-setting="warningSeconds"><option value="0" ${Number(s.warningSeconds)===0?'selected':''}>Off</option><option value="5" ${Number(s.warningSeconds)===5?'selected':''}>5 seconds</option><option value="10" ${Number(s.warningSeconds)===10?'selected':''}>10 seconds</option><option value="15" ${Number(s.warningSeconds)===15?'selected':''}>15 seconds</option><option value="30" ${Number(s.warningSeconds)===30?'selected':''}>30 seconds</option></select></div>
      ${settingToggle('Voice announcements', 'voice', s.voice)}
      <div class="field"><label>Voice detail</label><select class="select" data-setting="voiceVerbosity"><option value="minimal" ${s.voiceVerbosity==='minimal'?'selected':''}>Minimal · exercise only</option><option value="normal" ${s.voiceVerbosity==='normal'?'selected':''}>Normal · phase + exercise</option><option value="detailed" ${s.voiceVerbosity==='detailed'?'selected':''}>Detailed · round, duration and next</option></select></div>
      <div class="field"><label>Voice</label><select class="select" data-setting="voiceURI">${voiceOptions}</select></div>
      <div class="field"><label>Voice rate · ${Number(s.voiceRate || 1.05).toFixed(2)}×</label><input class="input" data-setting="voiceRate" type="range" min="0.6" max="1.6" step="0.05" value="${esc(s.voiceRate ?? 1.05)}"></div>
      ${settingToggle('Haptics', 'haptics', s.haptics)}
      <details class="step-cue-editor"><summary>Advanced sound mapping</summary><div class="cue-map-grid"><label class="custom-number-label">Work<select class="select" data-setting="soundWork">${cueSoundOptions(s.soundWork || '')}</select></label><label class="custom-number-label">Rest<select class="select" data-setting="soundRest">${cueSoundOptions(s.soundRest || '')}</select></label><label class="custom-number-label">Prepare<select class="select" data-setting="soundPrepare">${cueSoundOptions(s.soundPrepare || '')}</select></label><label class="custom-number-label">Countdown<select class="select" data-setting="soundCountdown">${cueSoundOptions(s.soundCountdown || '')}</select></label><label class="custom-number-label">Warning<select class="select" data-setting="soundWarning">${cueSoundOptions(s.soundWarning || '')}</select></label><label class="custom-number-label">Halfway<select class="select" data-setting="soundHalfway">${cueSoundOptions(s.soundHalfway || '')}</select></label><label class="custom-number-label">Finish<select class="select" data-setting="soundFinish">${cueSoundOptions(s.soundFinish || '')}</select></label></div></details>
      <div class="cue-test-grid"><button class="btn" data-action="test-cue-kind" data-kind="work">Test work</button><button class="btn" data-action="test-cue-kind" data-kind="rest">Test rest</button><button class="btn" data-action="test-cue-kind" data-kind="warning">Test warning</button><button class="btn" data-action="test-cue-kind" data-kind="finish">Test finish</button></div>
      <button class="btn" data-action="save-cue-profile">Save current settings as custom profile</button>
      <div class="stack">${customProfileRows}</div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Custom Cue Sounds</h2>
      <div class="small muted">Upload short local sounds (max 2 MB / 15 seconds). They stay offline and are included in full backups.</div>
      <button class="btn" data-action="upload-custom-sound">Upload sound</button>
      <div class="list">${soundRows}</div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Notifications</h2>
      ${settingToggle('Completion notifications', 'notifications', s.notifications, 'Persistent completion alert where supported')}
      ${settingToggle('Active timer notification', 'activeNotifications', s.activeNotifications, 'Best-effort static “timer running” notification when the app is hidden')}
      <button class="btn" data-action="enable-notifications">Request notification permission</button>
      <div class="small muted">Permission: ${globalThis.Notification?.permission || 'unsupported'} · Exact screen-off alarms remain native-only.</div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Data & Backup</h2>
      <div class="data-health-grid">
        <div class="metric"><strong>${state.storagePersistent == null ? '…' : state.storagePersistent ? '✓' : 'Managed'}</strong><span>Persistent storage</span></div>
        <div class="metric"><strong>${state.storageEstimate?.usage ? `${(state.storageEstimate.usage/1024/1024).toFixed(1)} MB` : '—'}</strong><span>Local storage used</span></div>
        <div class="metric"><strong>${state.recoverySnapshots.length}</strong><span>Recovery snapshots</span></div>
        <div class="metric"><strong>${state.quarantineItems.length}</strong><span>Quarantined items</span></div>
      </div>
      <div class="small muted">Last external backup: ${state.settings.lastExternalBackupAt ? uiDate(state.settings.lastExternalBackupAt,{dateStyle:'medium',timeStyle:'short'}) : 'Never'}</div>
      <div class="row" style="flex-wrap:wrap"><button class="btn primary" data-action="export-backup">Create backup</button><button class="btn" data-action="import-backup">Restore / Import</button>${state.lastRestoreSnapshotId ? '<button class="btn" data-action="undo-last-restore">Undo last restore</button>' : ''}</div>
      <div class="row" style="flex-wrap:wrap"><button class="btn" data-action="create-recovery">Create local recovery snapshot</button><button class="btn" data-action="show-quarantine">Quarantine</button></div>
      ${state.recoverySnapshots.length ? `<div class="recovery-list"><div class="small muted">Recent recovery snapshots</div>${state.recoverySnapshots.slice(0,4).map((snap)=>`<div class="recovery-row"><button class="list-row-main" data-action="restore-recovery" data-id="${esc(snap.id)}"><div class="list-row-title">${esc(snap.label)}</div><div class="list-row-meta">${uiDate(snap.createdAt,{dateStyle:'medium',timeStyle:'short'})} · ${(snap.sizeEstimate/1024).toFixed(0)} KB</div></button></div>`).join('')}</div>` : ''}
      <details><summary>Sync readiness</summary><div class="small muted" style="margin-top:8px">Device ID: ${esc(state.dataHealth?.deviceId || 'Unavailable')}<br>Change journal: ${state.dataHealth?.pendingChanges ?? 0} entries<br>Tombstones: ${state.dataHealth?.tombstoneCount ?? 0}</div></details>
      <button class="btn danger" data-action="clear-history">Clear history</button>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Device & PWA</h2>
      ${settingToggle('Headset / media controls', 'mediaControls', s.mediaControls, 'Experimental. May take media-button control away from music apps.')}
      <div class="capability-grid">
        ${capabilityRow('Installed PWA', caps.installedPwa)}
        ${capabilityRow('Service worker / offline shell', caps.serviceWorker)}
        ${capabilityRow('Single-runtime Web Lock', caps.webLocks, caps.webLocks ? '' : 'Lease fallback')}
        ${capabilityRow('Window coordination', caps.broadcastChannel)}
        ${capabilityRow('Wake Lock', caps.wakeLock)}
        ${capabilityRow('Notifications', caps.notifications)}
        ${capabilityRow('Media controls', caps.mediaSession)}
        ${capabilityRow('System share sheet', caps.share)}
        ${capabilityRow('Launch Handler', caps.launchHandler, caps.launchHandler ? '' : 'Optional')}
        ${capabilityRow('True home-screen widget', false, 'Native only')}
        ${capabilityRow('Exact local alarm', false, 'Native only')}
      </div>
      <div class="small muted">Primary reliable timer mode remains a visible installed PWA with Wake Lock. Background/locked-screen behavior is best effort unless a future native shell is added.</div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Performance & Scale</h2>
      <div class="data-health-grid">
        <div class="metric"><strong>${Number.isFinite(bootMs) ? `${Math.round(bootMs)} ms` : '—'}</strong><span>Interactive boot</span></div>
        <div class="metric"><strong>${state.historyLoadedAll ? state.sessions.length : `Recent ${state.sessions.length}`}</strong><span>History in memory</span></div>
        <div class="metric"><strong>${state.liveSchedulerKind}</strong><span>Live scheduler</span></div>
        <div class="metric"><strong>${maintenance.pending()}</strong><span>Maintenance queued</span></div>
      </div>
      <div class="small muted">The live timer stops visual work when hidden or paused, uses 10 Hz for stopwatch, low-frequency ticks for Wall/reduced-motion modes, and at most ~30 Hz for smooth progress. Full History loads on demand rather than during app startup.</div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">App</h2>
      <button class="btn" data-action="install">Install PWA</button>
      <div class="small muted">Timer v1.9.0 · local-first · offline capable</div>
    </section>`;
}

function refreshVoices() {
  try {
    state.availableVoices = globalThis.speechSynthesis?.getVoices?.() || [];
  } catch { state.availableVoices = []; }
}

function applySelectedCueProfile(id) {
  const profile = cueProfileById(id, state.cueProfiles);
  const values = profileSettings(profile);
  state.settings = { ...state.settings, cueProfileId: profile.id, ...values };
}

function currentCueProfilePayload(title) {
  return {
    id: uid('cue'), title,
    sound: state.settings.sound, voice: state.settings.voice, haptics: state.settings.haptics,
    countdownCues: state.settings.countdownCues, soundPack: state.settings.soundPack,
    warningSeconds: Number(state.settings.warningSeconds) || 0, halfwayCue: Boolean(state.settings.halfwayCue),
    voiceVerbosity: state.settings.voiceVerbosity || 'normal', voiceRate: Number(state.settings.voiceRate) || 1.05,
    soundWork: state.settings.soundWork || '', soundRest: state.settings.soundRest || '', soundPrepare: state.settings.soundPrepare || '',
    soundCountdown: state.settings.soundCountdown || '', soundWarning: state.settings.soundWarning || '', soundHalfway: state.settings.soundHalfway || '', soundFinish: state.settings.soundFinish || '',
    profileGain: Number(state.settings.profileGain ?? 1)
  };
}

function capabilityRow(label, supported, note = '') {
  return `<div class="capability-row"><span>${esc(label)}</span><strong class="${supported ? 'ok' : 'muted'}">${supported ? 'Supported' : (note || 'Unavailable')}</strong></div>`;
}

function settingToggle(label, key, checked, hint = '') {
  return `<div class="toggle-row"><div><strong>${esc(label)}</strong>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div><button class="toggle" data-action="setting-toggle" data-key="${key}" aria-pressed="${!!checked}" aria-label="${esc(label)}"></button></div>`;
}

async function saveSettings() {
  applyTheme();
  await state.db.saveSettings(state.settings).catch(() => toast('Settings could not be saved.'));
}

async function repeatSession(id) {
  closeSheet();
  const s = state.sessions.find((x) => x.id === id) || (state.completion?.id === id ? state.completion : null);
  if (!s?.plan) return toast('This session cannot be repeated.');
  await startSession(structuredClone(s.plan), { mode: s.mode, title: s.title, config: s.config, routineId: s.routineId, cueOverrides: structuredClone(s.cueOverrides || {}) });
}

function liveMoreSheet() {
  const v = focusedView();
  if (!v) return;
  showSheet('Timer', `<div class="sheet-list">
    <button class="sheet-item" data-action="open-workspace">Open Multi-Timer Workspace</button>
    <button class="sheet-item" data-action="workspace-edit-timer" data-id="${esc(state.activeTimerId)}">Grouping & completion action</button>
    <button class="sheet-item" data-action="live-background">Run in background · Home</button>
    ${v.planKind === 'timeline' ? `<button class="sheet-item" data-action="live-restart">Restart current step</button><button class="sheet-item" data-action="live-previous">Previous step</button>` : ''}
    <button class="sheet-item" data-action="live-lock">Lock controls</button>
    <button class="sheet-item" data-action="live-layout">Layout: ${esc(state.settings.layout)}</button>
    <button class="sheet-item" data-action="live-fullscreen">Toggle fullscreen</button>
    <button class="sheet-item" data-action="open-display-window">Open Wall display window</button>
    <button class="sheet-item" data-action="live-mute">${cue.muted ? 'Unmute cues' : 'Mute cues'}</button>
    <button class="sheet-item" data-action="live-end" style="color:var(--danger)">End timer</button>
  </div>`);
}

function layoutSheet() {
  showSheet('Live Layout', `<div class="sheet-list">${['focus','classic','strength','wall'].map((l) => `<button class="sheet-item" data-action="select-layout" data-layout="${l}">${l[0].toUpperCase()+l.slice(1)} ${state.settings.layout===l?'✓':''}</button>`).join('')}</div>`);
}

function downloadTextFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportHistoryJson() {
  const sessions = filteredHistorySessions();
  downloadTextFile(`timer-history-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({ format: 'thiepn-timer-history', version: 1, exportedAt: new Date().toISOString(), sessions }, null, 2), 'application/json');
  toast(`Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}.`);
}

function exportHistoryCsv() {
  const sessions = filteredHistorySessions();
  downloadTextFile(`timer-history-${new Date().toISOString().slice(0,10)}.csv`, sessionsToCsv(sessions), 'text/csv;charset=utf-8');
  toast(`Exported ${sessions.length} session${sessions.length === 1 ? '' : 's'}.`);
}

function backupSelectionFromSheet(root = document) {
  return {
    routines: root.querySelector('[data-backup-part="routines"]')?.checked !== false,
    blocks: root.querySelector('[data-backup-part="blocks"]')?.checked !== false,
    cueProfiles: root.querySelector('[data-backup-part="cueProfiles"]')?.checked !== false,
    customSounds: root.querySelector('[data-backup-part="customSounds"]')?.checked !== false,
    sessions: root.querySelector('[data-backup-part="sessions"]')?.checked !== false,
    settings: root.querySelector('[data-backup-part="settings"]')?.checked !== false
  };
}

function showBackupExportSheet() {
  showSheet('Create Backup', `<div class="stack">
    <div class="small muted">Choose what to include. Full backups are recommended for disaster recovery.</div>
    <div class="backup-parts">
      ${[['routines','Routines'],['blocks','Reusable blocks'],['cueProfiles','Cue profiles'],['customSounds','Custom sounds'],['sessions','Session history'],['settings','Settings']].map(([key,label]) => `<label class="check-row"><input type="checkbox" data-backup-part="${key}" checked> <span>${label}</span></label>`).join('')}
    </div>
    <div class="field"><label for="backup-password">Password encryption <span class="muted">(optional)</span></label><input id="backup-password" class="input" type="password" autocomplete="new-password" placeholder="Leave blank for normal backup"><div class="tiny">Encrypted backups cannot be recovered if the password is lost.</div></div>
    <button class="btn primary big" data-action="confirm-export-backup">Export backup</button>
  </div>`);
}

async function exportBackupConfigured() {
  const sheet = $('#sheet-root');
  const selection = backupSelectionFromSheet(sheet);
  if (!Object.values(selection).some(Boolean)) return toast('Select at least one backup category.');
  const password = $('#backup-password', sheet)?.value || '';
  try {
    const payload = await state.db.exportData({ selection });
    const archive = await createBackupArchive(payload, { appVersion: APP_VERSION, selection, kind: 'full-backup' });
    const output = password ? await encryptBackupArchive(archive, password) : archive;
    const encrypted = Boolean(password);
    const ext = encrypted ? 'timerbackup.enc.json' : 'timerbackup';
    downloadTextFile(`timer-backup-${new Date().toISOString().slice(0,10)}.${ext}`, JSON.stringify(output, null, 2), 'application/json');
    state.settings.lastExternalBackupAt = Date.now();
    await saveSettings();
    closeSheet();
    toast(`${encrypted ? 'Encrypted b' : 'B'}ackup exported and verified.`);
  } catch (error) { toast(error.message || 'Backup could not be created.', 5000); }
}

function collectBlockIds(nodes = [], out = new Set()) {
  walkCustomNodes(nodes, (node) => { if (node?.type === 'block' && node.blockId) out.add(node.blockId); });
  return out;
}

function collectSoundRefsFromObject(value, out = new Set()) {
  if (!value || typeof value !== 'object') return out;
  for (const current of Object.values(value)) {
    if (typeof current === 'string' && current.startsWith('custom:')) out.add(current.slice(7));
    else if (current && typeof current === 'object') collectSoundRefsFromObject(current, out);
  }
  return out;
}

async function exportRoutinePackage(routineId) {
  const routine = state.routines.find((item) => item.id === routineId);
  if (!routine) return toast('Routine not found.');
  const blockIds = new Set();
  const visitBlock = (id) => {
    if (blockIds.has(id)) return;
    const block = state.blocks.find((item) => item.id === id);
    if (!block) return;
    blockIds.add(id);
    for (const nested of collectBlockIds(block.nodes || [])) visitBlock(nested);
  };
  if (routine.type === 'custom') for (const id of collectBlockIds(routine.config?.nodes || [])) visitBlock(id);
  const blocks = state.blocks.filter((block) => blockIds.has(block.id));
  const profileIds = new Set();
  if (routine.cueOverrides?.profileId && !BUILTIN_CUE_PROFILES[routine.cueOverrides.profileId]) profileIds.add(routine.cueOverrides.profileId);
  const cueProfiles = state.cueProfiles.filter((profile) => profileIds.has(profile.id));
  const soundIds = collectSoundRefsFromObject(routine);
  blocks.forEach((block) => collectSoundRefsFromObject(block, soundIds));
  cueProfiles.forEach((profile) => collectSoundRefsFromObject(profile, soundIds));
  const full = await state.db.exportData({ selection: { routines: false, blocks: false, cueProfiles: false, customSounds: true, sessions: false, settings: false } });
  const customSounds = (full.customSounds || []).filter((sound) => soundIds.has(sound.id));
  const pkg = { format: 'thiepn-timer-routine-package', version: 1, exportedAt: new Date().toISOString(), routine: structuredClone(routine), blocks, cueProfiles, customSounds };
  const archive = await createBackupArchive(pkg, { appVersion: APP_VERSION, kind: 'routine-package' });
  const safe = (routine.title || 'routine').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'routine';
  downloadTextFile(`${safe}.timer.json`, JSON.stringify(archive, null, 2), 'application/json');
  toast('Portable routine package exported.');
}

function backupPreviewCounts(payload) {
  if (isRoutinePackage(payload)) return { routines: payload.routine ? 1 : 0, blocks: payload.blocks?.length || 0, cueProfiles: payload.cueProfiles?.length || 0, customSounds: payload.customSounds?.length || 0, sessions: 0 };
  return backupCounts(payload);
}

function validateIncomingPayload(payload) {
  if (isRoutinePackage(payload)) {
    payload = { format: 'thiepn-timer-backup', version: 4, exportedAt: payload.exportedAt, selection: { routines: true, blocks: true, cueProfiles: true, customSounds: true, sessions: false, settings: false }, routines: payload.routine ? [payload.routine] : [], blocks: payload.blocks || [], cueProfiles: payload.cueProfiles || [], customSounds: payload.customSounds || [], sessions: [], settings: null };
  }
  if (!payload || payload.format !== 'thiepn-timer-backup' || ![1,2,3,4].includes(Number(payload.version)) || !Array.isArray(payload.routines) || !Array.isArray(payload.sessions)) throw new Error('Unsupported or incomplete Timer backup.');
  assertBackupEntityLimits(payload);
  const quarantine = [];
  const validSounds = [];
  const sourceSounds = payload.version >= 3 && Array.isArray(payload.customSounds) ? payload.customSounds : [];
  for (const sound of sourceSounds) {
    if (!sound?.id || !sound?.title || typeof sound.dataBase64 !== 'string' || sound.dataBase64.length > 3 * 1024 * 1024) quarantine.push({ source: 'backup', entityType: 'customSound', entityId: sound?.id || '', reason: 'Invalid or oversized custom sound', record: sound });
    else validSounds.push(sound);
  }
  const candidateBlocks = payload.version >= 2 && Array.isArray(payload.blocks) ? payload.blocks.filter((block) => block?.id && block?.title && Array.isArray(block.nodes)) : [];
  const validBlocks = [];
  for (const block of candidateBlocks) {
    try { buildCustomRoutine({ title: block.title, nodes: block.nodes, parameters: block.parameters || [], blocks: candidateBlocks }); validBlocks.push(block); }
    catch (error) { quarantine.push({ source: 'backup', entityType: 'block', entityId: block.id, reason: error.issues?.[0]?.message || error.message || 'Reusable block cannot compile', record: block }); }
  }
  const validRoutines = [];
  for (const routine of payload.routines) {
    if (!routine?.id || !routine?.type || !routine?.config || !BUILDER_META[routine.type]) { quarantine.push({ source: 'backup', entityType: 'routine', entityId: routine?.id || '', reason: 'Unsupported routine', record: routine }); continue; }
    try { planFromType(routine.type, routine.config, { blocks: validBlocks }); validRoutines.push(routine); }
    catch (error) { quarantine.push({ source: 'backup', entityType: 'routine', entityId: routine.id, reason: error.issues?.[0]?.message || error.message || 'Routine cannot compile', record: routine }); }
  }
  const validSessions = [];
  for (const session of payload.sessions) {
    if (!session?.id || !Number.isFinite(session?.startedAt)) quarantine.push({ source: 'backup', entityType: 'session', entityId: session?.id || '', reason: 'Invalid session record', record: session });
    else validSessions.push(session);
  }
  const profiles = payload.version >= 3 && Array.isArray(payload.cueProfiles) ? payload.cueProfiles.filter((profile) => profile?.id && profile?.title) : [];
  const cleaned = { ...payload, version: 4, routines: validRoutines, blocks: validBlocks, cueProfiles: profiles, customSounds: validSounds, sessions: validSessions, settings: payload.settings || null };
  return { payload: cleaned, quarantine };
}

async function parseBackupFile(file) {
  if (!file || file.size > 30 * 1024 * 1024) throw new Error('Backup file is too large.');
  let parsed = JSON.parse(await file.text());
  if (isEncryptedBackup(parsed)) {
    const password = prompt('Backup password');
    if (password == null) throw new Error('Import cancelled.');
    parsed = await decryptBackupArchive(parsed, password);
  }
  let manifest = null;
  if (isBackupArchive(parsed)) {
    const verified = await verifyBackupArchive(parsed);
    manifest = verified.manifest;
    parsed = parsed.payload;
  } else if (!isLegacyBackup(parsed) && !isRoutinePackage(parsed)) throw new Error('Unsupported Timer backup or routine package.');
  const validated = validateIncomingPayload(parsed);
  return { ...validated, manifest, fileName: file.name, packageMode: isRoutinePackage(parsed) || manifest?.kind === 'routine-package' };
}

function showRestorePreview() {
  const pending = state.pendingRestore;
  if (!pending) return;
  const counts = backupPreviewCounts(pending.payload);
  const packageMode = pending.packageMode;
  showSheet(packageMode ? 'Import Routine Package' : 'Restore Preview', `<div class="stack">
    <div class="backup-summary-grid">${Object.entries(counts).map(([key,value]) => `<div class="metric"><strong>${value}</strong><span>${esc(key)}</span></div>`).join('')}</div>
    ${pending.manifest ? `<div class="data-integrity-ok">✓ SHA-256 integrity verified</div>` : `<div class="small muted">Legacy backup format · content validated before restore.</div>`}
    ${pending.quarantine.length ? `<div class="data-warning">${pending.quarantine.length} invalid item${pending.quarantine.length === 1 ? '' : 's'} will be quarantined instead of imported.</div>` : ''}
    <div class="backup-parts">
      ${[['routines','Routines',counts.routines],['blocks','Reusable blocks',counts.blocks],['cueProfiles','Cue profiles',counts.cueProfiles],['customSounds','Custom sounds',counts.customSounds],['sessions','History',counts.sessions],['settings','Settings',pending.payload.settings ? 1 : 0]].map(([key,label,count]) => `<label class="check-row ${count ? '' : 'disabled'}"><input type="checkbox" data-restore-part="${key}" ${count ? 'checked' : 'disabled'}> <span>${label}</span></label>`).join('')}
    </div>
    ${packageMode ? '' : `<div class="field"><label>Restore strategy</label><select id="restore-strategy" class="select"><option value="merge">Merge with current data</option><option value="replace">Replace selected categories</option></select></div>`}
    <button class="btn primary big" data-action="apply-restore">${packageMode ? 'Import package' : 'Apply restore'}</button>
  </div>`);
}

async function importBackupFile(file) {
  try {
    state.pendingRestore = await parseBackupFile(file);
    showRestorePreview();
  } catch (error) { if (error.message !== 'Import cancelled.') toast(error.message || 'Backup could not be read.', 5000); }
}

async function applyPendingRestore() {
  const pending = state.pendingRestore;
  if (!pending) return;
  const root = $('#sheet-root');
  const selection = Object.fromEntries(['routines','blocks','cueProfiles','customSounds','sessions','settings'].map((key) => [key, Boolean(root.querySelector(`[data-restore-part="${key}"]`)?.checked)]));
  const replace = !pending.packageMode && $('#restore-strategy', root)?.value === 'replace';
  if (!Object.values(selection).some(Boolean)) return toast('Select at least one category to restore.');
  let snapshot = null;
  try {
    snapshot = await state.db.createRecoverySnapshot({ kind: 'pre-restore', label: `Before restore · ${pending.fileName || 'backup'}` });
    state.lastRestoreSnapshotId = snapshot.id;
    await state.db.importData(pending.payload, { replace, selection, quarantine: pending.quarantine });
    state.pendingRestore = null;
    state.settings = await state.db.loadSettings(); applyTheme();
    cue.clearCustomSoundCache();
    await loadCollections(); await refreshDataResilience();
    closeSheet(); render();
    toast(`Restore complete.${pending.quarantine.length ? ` ${pending.quarantine.length} item(s) quarantined.` : ''}`, 4500);
  } catch (error) {
    if (snapshot?.id) await state.db.restoreRecoverySnapshot(snapshot.id).catch(() => {});
    await loadCollections().catch(() => {}); await refreshDataResilience().catch(() => {});
    toast(error.message || 'Restore failed and the previous local snapshot was restored.', 5500);
  }
}

async function refreshDataResilience() {
  [state.recoverySnapshots, state.quarantineItems, state.dataHealth, state.storageEstimate] = await Promise.all([
    state.db.listRecoverySnapshots().catch(() => []), state.db.listQuarantine().catch(() => []), state.db.dataHealth().catch(() => null), storageEstimate()
  ]);
}

async function restoreRecoverySnapshot(id) {
  const target = state.recoverySnapshots.find((item) => item.id === id);
  if (!target || !confirm(`Restore recovery snapshot “${target.label}”? Current data will be snapshotted first.`)) return;
  let before = null;
  try {
    before = await state.db.createRecoverySnapshot({ kind: 'pre-restore', label: `Before recovery · ${target.label}` });
    state.lastRestoreSnapshotId = before.id;
    await state.db.restoreRecoverySnapshot(id);
    state.settings = await state.db.loadSettings(); applyTheme(); cue.clearCustomSoundCache();
    await loadCollections(); await refreshDataResilience(); render(); toast('Recovery snapshot restored.');
  } catch (error) {
    if (before?.id) await state.db.restoreRecoverySnapshot(before.id).catch(() => {});
    toast(error.message || 'Recovery snapshot could not be restored.', 5000);
  }
}

async function undoLastRestore() {
  if (!state.lastRestoreSnapshotId) return toast('No restore is available to undo.');
  try {
    await state.db.restoreRecoverySnapshot(state.lastRestoreSnapshotId);
    state.settings = await state.db.loadSettings(); applyTheme(); cue.clearCustomSoundCache();
    await loadCollections(); await refreshDataResilience();
    state.lastRestoreSnapshotId = null; render(); toast('Last restore was undone.');
  } catch (error) { toast(error.message || 'Undo restore failed.', 5000); }
}

async function showQuarantine() {
  await refreshDataResilience();
  showSheet('Quarantined Data', `<div class="stack">${state.quarantineItems.length ? state.quarantineItems.map((item) => `<div class="card card-pad"><strong>${esc(item.entityType)}</strong><div class="small muted">${esc(item.entityId || 'Unknown ID')} · ${uiDate(item.createdAt,{dateStyle:'medium',timeStyle:'short'})}</div><div style="margin-top:6px">${esc(item.reason)}</div></div>`).join('') : '<div class="empty">No quarantined records.</div>'}${state.quarantineItems.length ? '<button class="btn danger" data-action="clear-quarantine">Clear quarantine</button>' : ''}</div>`);
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => {});
    state.installPrompt = null;
    $('#install-btn')?.classList.add('hidden');
  } else toast('Use your browser menu and choose “Install app” or “Add to Home screen”.', 4200);
}

async function loadCollections({ fullHistory = (state.route === 'history' && state.historyLoadedAll) } = {}) {
  const historyLimit = fullHistory ? 10000 : 100;
  const [routines, queues, blocks, cueProfiles, customSounds, sessions] = await Promise.all([
    state.db.all('routines').catch(() => []),
    state.db.all('queues').catch(() => []),
    state.db.all('blocks').catch(() => []),
    state.db.all('cueProfiles').catch(() => []),
    state.db.listCustomSoundMetadata().catch(() => []),
    state.db.recentSessions(historyLimit).catch(() => [])
  ]);
  state.blocks = blocks;
  state.queues = queues.map((queue) => normalizeQueuePreset(queue)).sort((a,b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0));
  const normalized = routines.map((timer) => normalizeSavedTimerRecord(timer));
  state.routines = normalized;
  const migrations = routines.map((timer, index) => needsSavedTimerMigration(timer)
    ? state.db.saveRoutine(normalized[index], { preserveUpdatedAt: true }).catch(() => null)
    : null).filter(Boolean);
  if (migrations.length) await Promise.allSettled(migrations);
  state.cueProfiles = cueProfiles;
  state.customSounds = customSounds;
  state.sessions = sessions;
  state.historyLoadedAll = Boolean(fullHistory);
}

async function ensureFullHistory() {
  if (state.historyLoadedAll || state.historyLoading) return;
  state.historyLoading = true;
  if (state.route === 'history') renderHistory();
  try {
    const sessions = await state.db.recentSessions(10000);
    state.sessions = sessions;
    state.historyLoadedAll = true;
  } catch {}
  finally {
    state.historyLoading = false;
    if (state.route === 'history' && !state.engine) renderHistory();
  }
}

function schedulePostBootMaintenance() {
  maintenance.enqueue('persistent-storage', async () => {
    state.storagePersistent = await requestPersistentStorage();
  }, { priority: 'soon', delay: 250 });
  maintenance.enqueue('data-health', async () => {
    await refreshDataResilience();
    if (state.route === 'settings' && !state.engine) renderSettings();
  });
  maintenance.enqueue('daily-recovery', async () => {
    await state.db.ensureDailyRecoverySnapshot();
    await refreshDataResilience();
  });
  maintenance.enqueue('tombstone-gc', () => state.db.pruneTombstones());
}

async function boot() {
  perf.mark('boot:start');
  state.launchCommand = parseLaunchCommand(location.href);
  state.displayMode = state.launchCommand.type === 'DISPLAY';
  clearLaunchQuery();
  applyTheme();
  try { await state.db.open(); } catch { toast('Storage unavailable. Timers can still run, but recovery may be limited.', 5000); }
  perf.mark('boot:db');
  state.settings = await state.db.loadSettings().catch(() => ({ ...defaultSettings }));
  perf.mark('boot:settings');
  refreshVoices();
  if ('speechSynthesis' in globalThis) globalThis.speechSynthesis.onvoiceschanged = () => { refreshVoices(); if (state.route === 'settings' && !state.engine) renderSettings(); };
  state.quickMs = quickPresets()[3] || quickPresets()[0] || 120000;
  state.quickInput = durationInputText(state.quickMs);
  state.quickInputError = '';
  state.deviceCapabilities = detectDeviceCapabilities();
  applyTheme();
  const activePromise = state.db.getActiveSessions().catch(() => []);
  await loadCollections({ fullHistory: false });
  perf.mark('boot:collections');
  registerPwa();

  const active = await activePromise;
  if (active.length) {
    if (state.displayMode) {
      setRemoteActive({ sessions: active });
      renderRemoteActive();
    } else if (await ownership.acquire()) {
      if (!await restoreOwnedActive(active)) {
        await ownership.release();
        await state.db.clearAllActiveSessions().catch(() => {});
        toast('The previous active timers could not be restored.', 4200);
        await handleLaunchCommand(state.launchCommand);
      }
    } else {
      setRemoteActive({ sessions: active });
      renderRemoteActive();
    }
  } else if (state.displayMode) renderRemoteActive();
  else await handleLaunchCommand(state.launchCommand);

  perf.mark('boot:interactive');
  perf.measure('bootInteractiveMs', 'boot:start', 'boot:interactive');
  state.bootPerformance = perf.snapshot();
  schedulePostBootMaintenance();
}

async function registerPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); state.installPrompt = e; $('#install-btn')?.classList.remove('hidden');
  }, { once: true });
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    state.swRegistration = registration;
    if (registration.waiting) markUpdateReady(registration);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
          setTimeout(() => markUpdateReady(registration), 0);
        }
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.reloadOnControllerChange && !hasOwnedActiveTimers() && !state.remoteActive) location.reload();
    });
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'LAUNCH_URL' && event.data.url) handleLaunchCommand(parseLaunchCommand(event.data.url));
      if (event.data?.type === 'SW_ACTIVATED') {
        state.updateReady = false;
        renderUpdateBanner();
      }
    });
  } catch {}
}

async function onVisibilityChange() {
  if (!hasOwnedActiveTimers() || !ownership.isOwner()) return;
  if (document.visibilityState === 'hidden') {
    stopLiveScheduler();
    await persistAllRuntimes();
    broadcastActiveSnapshot();
    if (state.settings.activeNotifications && globalThis.Notification?.permission === 'granted') {
      for (const runtime of coordinator.list()) {
        const view = coordinator.view(runtime.id);
        if (!view || ['completed','cancelled'].includes(view.status)) continue;
        showActiveSessionNotification(
          translateBuiltInLabel(view.title || 'Timer', currentLocale()),
          `${view.status === 'overtime' ? 'Overtime' : translateBuiltInLabel(view.current?.label || 'Timer', currentLocale())} · ${translateSource('Tap to return', currentLocale())}`,
          { sessionId: runtime.id }
        ).catch(() => {});
      }
    }
  } else {
    for (const runtime of coordinator.list()) await closeTimerNotification(`timer-active:${runtime.id}`);
    for (const runtime of coordinator.list()) {
      if (!runtime.overtime) {
        try { coordinator.reconcile(runtime.id); } catch {}
      }
    }
    cue.init().catch(() => {});
    if (state.settings.keepAwake && coordinator.size()) wakeLock.acquire();
    if (state.engine) startLiveScheduler();
    startCoordinatorScheduler();
    configureMediaSession();
    broadcastActiveSnapshot();
  }
}

document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', () => { if (hasOwnedActiveTimers() && ownership.isOwner()) void persistAllRuntimes(); });
window.addEventListener('resize', () => { if (state.engine) updateLiveView(true); });
window.addEventListener('unload', () => { if (!hasOwnedActiveTimers()) ownership.dispose(); });

function updateBuilderInput(target) {
  if (!state.builder) return;
  const key = target.dataset.builderKey;
  if (!key) return;
  const cfg = state.builder.config;
  if (target.type === 'number') cfg[key] = Number(target.value);
  else cfg[key] = target.value;
  if (key === 'randomMode') return renderBuilder();
  refreshBuilderSummary();
}

function updateCircuitInput(target) {
  const row = target.closest('[data-circuit-index]');
  if (!row || !state.builder || state.builder.type !== 'circuit') return;
  const idx = Number(row.dataset.circuitIndex);
  const item = state.builder.config.items[idx];
  const key = target.dataset.circuitField;
  if (!item || !key) return;
  if (target.type === 'checkbox') item[key] = target.checked;
  else if (target.type === 'number') item[key] = Number(target.value);
  else item[key] = target.value;
}

document.addEventListener('input', (e) => {
  if (e.target.matches?.('[data-quick-input]')) {
    updateQuickInputFeedback();
    return;
  }
  if (e.target.matches?.('[data-library-search]')) {
    state.libraryQuery = e.target.value;
    state.librarySearchActive = true;
    return renderLibrary();
  }
  if (e.target.matches?.('[data-queue-draft-field]') && state.queueDraft) {
    const field = e.target.dataset.queueDraftField;
    if (field === 'title') state.queueDraft.title = String(e.target.value || '').slice(0, 120);
    if (field === 'description') state.queueDraft.description = String(e.target.value || '').slice(0, 500);
    return;
  }
  if (e.target.matches?.('[data-history-search]')) {
    state.historyQuery = e.target.value;
    state.historyVisible = 100;
    clearTimeout(state.historySearchTimer);
    state.historySearchTimer = setTimeout(() => {
      if (state.route !== 'history' || state.engine) return;
      renderHistory();
      requestAnimationFrame(() => { const input = $('[data-history-search]'); if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); } });
    }, 80);
    return;
  }
  updateBuilderInput(e.target);
  updateBuilderCueInput(e.target);
  updateCircuitInput(e.target);
  updateCustomInput(e.target);
  updateCustomCueInput(e.target);
  updateCustomParameterInput(e.target);
  updateBlockParameterInput(e.target);
});
document.addEventListener('submit', async (e) => {
  if (!e.target.matches?.('[data-quick-form]')) return;
  e.preventDefault();
  const input = $('[data-quick-input]', e.target);
  const result = parseDurationInput(input?.value || state.quickInput);
  if (!result.ok) {
    state.quickInputError = result.error;
    updateQuickInputFeedback();
    input?.focus();
    return;
  }
  await startQuickDuration(result.ms);
});

document.addEventListener('change', async (e) => {
  updateBuilderInput(e.target); updateBuilderCueInput(e.target); updateCircuitInput(e.target); updateCustomInput(e.target); updateCustomCueInput(e.target); updateCustomParameterInput(e.target); updateBlockParameterInput(e.target);
  if (e.target.matches?.('[data-queue-item-action]') && state.queueDraft) {
    const index = Number(e.target.dataset.index);
    if (state.queueDraft.items[index]) state.queueDraft.items[index].action = normalizeQueueStepAction(e.target.value);
    return;
  }
  if (e.target.matches?.('[data-queue-draft-loop]') && state.queueDraft) { state.queueDraft.loop = Boolean(e.target.checked); return; }
  if (e.target.matches?.('[data-saved-sort]')) { state.librarySort = e.target.value || 'recent'; return renderLibrary(); }
  if (e.target.matches?.('[data-history-mode]')) { state.historyMode = e.target.value || 'all'; state.historyVisible = 100; return renderHistory(); }
  if (e.target.dataset.setting) {
    const key = e.target.dataset.setting;
    const numeric = new Set(['adjustmentMs','warningSeconds','voiceRate','voiceVolume','masterVolume','profileGain']);
    state.settings[key] = numeric.has(key) ? Number(e.target.value) : e.target.value;
    if (key === 'cueProfileId') applySelectedCueProfile(e.target.value);
    await saveSettings();
    if (['language','timeFormat','numberSystem','textScale','reduceMotion','theme','layout'].includes(key)) { applyTheme(); return renderSettings(); }
    if (key === 'cueProfileId' || key === 'voiceRate') renderSettings();
  }
});

document.addEventListener('click', async (e) => {
  const routeBtn = e.target.closest('[data-route]');
  if (routeBtn) return setRoute(routeBtn.dataset.route);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'apply-update') return applyUpdate();
  if (action === 'takeover-session') return takeOverActiveSession();
  if (action === 'focus-owner') { ownership.requestFocus(); return; }
  if (action === 'remote-refresh') { const active = await state.db.getActiveSessions().catch(() => []); setRemoteActive({ sessions: active }); return state.remoteActive ? renderRemoteActive() : render(); }
  if (action === 'focus-active') { closeSheet(); return focusRuntime(btn.dataset.id); }
  if (action === 'active-toggle') {
    const id = btn.dataset.id;
    coordinator.togglePause(id);
    await persistRuntime(id);
    updateActiveTimerCards();
    broadcastActiveSnapshot();
    return;
  }
  if (action === 'active-adjust') {
    const id = btn.dataset.id;
    const changed = coordinator.command(id, 'adjust', Number(btn.dataset.delta || 0));
    if (!changed) return toast('This timer cannot be adjusted right now.');
    await persistRuntime(id);
    updateActiveTimerCards();
    broadcastActiveSnapshot();
    return;
  }
  if (action === 'open-workspace') return openWorkspace();
  if (action === 'workspace-launch-saved') return showWorkspaceLaunchSheet();
  if (action === 'workspace-launch-routine') {
    const id = btn.dataset.id;
    closeSheet();
    const runtime = await startSavedRoutineAutomated(id, { background: true, backgroundRoute: 'workspace' });
    if (!runtime) toast('Saved Timer could not be launched.', 4200);
    return;
  }
  if (action === 'workspace-edit-timer') return showWorkspaceTimerSettings(btn.dataset.id);
  if (action === 'workspace-save-timer') return saveWorkspaceTimerSettings(btn.dataset.id);
  if (action === 'workspace-layout') {
    const layout = btn.dataset.layout;
    if (!['grid','compact','focus'].includes(layout)) return;
    state.settings.workspaceLayout = layout;
    await saveSettings();
    return renderMultiTimerWorkspace();
  }
  if (action === 'workspace-focus') { state.workspaceFocusId = btn.dataset.id; return renderMultiTimerWorkspace(); }
  if (action === 'workspace-move') {
    if (coordinator.move(btn.dataset.id, Number(btn.dataset.delta || 0))) await persistWorkspaceOrder();
    return renderMultiTimerWorkspace();
  }
  if (action === 'workspace-pause-all') {
    if (state.activeQueue?.status === 'running') await pauseActiveQueue();
    coordinator.pauseAll(); await persistAllRuntimes(); broadcastActiveSnapshot(); updateActiveTimerCards(); return;
  }
  if (action === 'workspace-resume-all') {
    if (state.activeQueue?.status === 'paused') await resumeActiveQueue();
    coordinator.resumeAll(); await persistAllRuntimes(); broadcastActiveSnapshot(); updateActiveTimerCards(); return;
  }
  if (action === 'workspace-stop') { coordinator.command(btn.dataset.id, 'stop', 'user-ended'); return; }
  if (action === 'workspace-stop-all') {
    const ids = coordinator.list().map((runtime) => runtime.id);
    if (!ids.length || !confirm(`Stop all ${ids.length} active timer${ids.length === 1 ? '' : 's'}? Partial sessions will be saved.`)) return;
    if (state.activeQueue) await stopActiveQueue();
    for (const id of ids) if (coordinator.has(id)) coordinator.command(id, 'stop', 'user-ended');
    return;
  }
  if (action === 'show-queue-library') return showQueueLibrarySheet();
  if (action === 'new-queue') return showQueueBuilder();
  if (action === 'edit-queue') return showQueueBuilder(btn.dataset.id);
  if (action === 'start-queue') { closeSheet(); return startQueue(btn.dataset.id); }
  if (action === 'delete-queue') return deleteQueue(btn.dataset.id);
  if (action === 'queue-add-timer') return showQueueTimerPicker();
  if (action === 'queue-add-picked-timer') return addQueueDraftTimer(btn.dataset.id);
  if (action === 'queue-return-builder') return renderQueueBuilderSheet();
  if (action === 'queue-item-move') return moveQueueDraftItem(Number(btn.dataset.index), Number(btn.dataset.delta));
  if (action === 'queue-item-remove') return removeQueueDraftItem(Number(btn.dataset.index));
  if (action === 'save-queue-draft') return saveQueueDraft();
  if (action === 'save-start-queue-draft') return saveQueueDraft({ start: true });
  if (action === 'queue-pause') { await pauseActiveQueue(); if (state.route === 'workspace' && !state.engine) renderMultiTimerWorkspace(); return; }
  if (action === 'queue-resume') { await resumeActiveQueue(); if (state.route === 'workspace' && !state.engine) renderMultiTimerWorkspace(); return; }
  if (action === 'queue-skip') return skipActiveQueueStep();
  if (action === 'queue-stop') { if (!confirm('Stop this queue? The current partial timer will be saved.')) return; return stopActiveQueue(); }
  if (action === 'close-display-window') { try { window.close(); } catch {} return; }
  if (action === 'open-display-window') {
    closeSheet();
    try {
      const url = new URL(location.href); url.search = '?launch=display'; url.hash = '';
      const display = window.open(url.toString(), 'timer-wall-display', 'popup,width=1200,height=800');
      if (!display) toast('The browser blocked the display window. Allow pop-ups for Timer and try again.', 4200);
    } catch { toast('Display window could not be opened.'); }
    return;
  }
  if (action === 'home') return setRoute('timer');
  if (action === 'create') return showCreateSheet();
  if (action === 'close-sheet') { state.pendingStart = null; return closeSheet(); }
  if (action === 'open-builder') return openBuilder(btn.dataset.type);
  if (action === 'builder-back') { state.builder = null; state.builderEditingId = null; state.builderEditingBlockId = null; state.builderCueOverrides = {}; return render(); }
  if (action === 'builder-toggle') { const k = btn.dataset.key; state.builder.config[k] = !state.builder.config[k]; return renderBuilder(); }
  if (action === 'save-builder') return saveBuilder();
  if (action === 'start-builder') return startBuilder();
  if (action === 'add-circuit-step') { state.builder.config.items.push({ label: 'Work', seconds: 40, phase: 'work', manual: false }); return renderBuilder(); }
  if (action === 'remove-circuit-step') { state.builder.config.items.splice(Number(btn.dataset.index), 1); return renderBuilder(); }
  if (action === 'custom-add') return showCustomAddSheet(btn.dataset.parent || '');
  if (action === 'custom-add-kind') return addCustomNode(btn.dataset.parent || '', btn.dataset.kind);
  if (action === 'custom-add-param') return showCustomParameterSheet();
  if (action === 'custom-add-param-kind') return addCustomParameter(btn.dataset.kind);
  if (action === 'custom-delete-param') return deleteCustomParameter(btn.dataset.id);
  if (action === 'custom-block-picker') return showBlockPicker(btn.dataset.parent || '', btn.dataset.mode || 'linked');
  if (action === 'custom-insert-block') return insertCustomBlock(btn.dataset.parent || '', btn.dataset.id, btn.dataset.mode || 'linked');
  if (action === 'custom-copy') return copyCustomNode(btn.dataset.path);
  if (action === 'custom-paste') return pasteCustomNode(btn.dataset.parent || '');
  if (action === 'custom-extract-block') return extractCustomBlock(btn.dataset.path);
  if (action === 'custom-unlink-block') return unlinkCustomBlock(btn.dataset.path);
  if (action === 'custom-move') return moveCustomNode(btn.dataset.path, btn.dataset.dir);
  if (action === 'custom-delete') return deleteCustomNode(btn.dataset.path);
  if (action === 'custom-preview') return showCustomPreview();
  if (action === 'confirm-param-start') return confirmParameterizedStart();

  if (action === 'quick-start-duration') return startQuickDuration(Number(btn.dataset.ms));
  if (action === 'quick-add') {
    const input = $('[data-quick-input]');
    const result = parseDurationInput(input?.value || state.quickInput);
    const base = result.ok ? result.ms : state.quickMs;
    const next = Math.min(7 * 86400000, Math.max(1000, base + Number(btn.dataset.ms || 0)));
    setQuickDuration(next);
    if (input) input.value = state.quickInput;
    updateQuickInputFeedback();
    input?.focus();
    return;
  }
  if (action === 'clear-quick-recent') {
    state.settings.quickRecentDurations = [];
    await state.db.saveSettings(state.settings).catch(() => {});
    return renderTimerHome();
  }
  if (action === 'customize-quick') return showQuickCustomizeSheet();
  if (action === 'save-quick-timer') return saveQuickTimerPreset();
  if (action === 'save-quick-customize') return saveQuickCustomizeSheet();
  if (action === 'reset-quick-customize') return resetQuickCustomizeSheet();

  if (action === 'saved-view') { state.libraryView = btn.dataset.view || 'all'; state.savedSelected.clear(); return renderLibrary(); }
  if (action === 'toggle-saved-select-mode') { state.savedSelectMode = !state.savedSelectMode; if (!state.savedSelectMode) state.savedSelected.clear(); return renderLibrary(); }
  if (action === 'select-saved') { const id = btn.dataset.id; if (state.savedSelected.has(id)) state.savedSelected.delete(id); else state.savedSelected.add(id); return renderLibrary(); }
  if (action === 'select-all-visible') { for (const timer of visibleSavedTimers()) state.savedSelected.add(timer.id); return renderLibrary(); }
  if (action === 'saved-menu') return showSavedTimerMenu(btn.dataset.id);
  if (action === 'edit-saved-meta') return showSavedTimerMetadata(btn.dataset.id);
  if (action === 'save-saved-meta') return saveSavedTimerMetadata(btn.dataset.id);
  if (action === 'pin-saved') return setSavedTimerFlag(btn.dataset.id, 'pinned');
  if (action === 'duplicate-saved') return duplicateSavedTimer(btn.dataset.id);
  if (action === 'archive-saved') {
    const timer = state.routines.find((item) => item.id === btn.dataset.id);
    if (timer) { await setSavedTimerFlag(timer.id, 'archived'); closeSheet(); }
    return;
  }
  if (action === 'move-saved') return showMoveSavedTimers([btn.dataset.id]);
  if (action === 'bulk-saved-move') return showMoveSavedTimers([...state.savedSelected]);
  if (action === 'queue-from-selection') {
    const ids = [...state.savedSelected];
    if (!ids.length) return toast('Select at least one Saved Timer.');
    return openQueueBuilderFromTimerIds(ids, 'Selected Timers Queue');
  }
  if (action === 'queue-from-view') {
    const ids = visibleSavedTimers().map((timer) => timer.id);
    if (!ids.length) return toast('This view has no Saved Timers to queue.');
    return openQueueBuilderFromTimerIds(ids, defaultQueueTitleFromView());
  }
  if (action === 'apply-saved-move') return applySavedMove();
  if (action === 'bulk-saved-archive' || action === 'bulk-saved-restore') {
    const archived = action === 'bulk-saved-archive';
    for (const id of state.savedSelected) {
      const timer = state.routines.find((item) => item.id === id);
      if (timer) await state.db.saveRoutine({ ...timer, archived });
    }
    state.savedSelected.clear();
    await loadCollections();
    renderLibrary();
    return toast(archived ? 'Saved Timers archived.' : 'Saved Timers restored.');
  }
  if (action === 'bulk-saved-delete') {
    const ids = [...state.savedSelected];
    if (!ids.length || !confirm(`Delete ${ids.length} Saved Timer${ids.length === 1 ? '' : 's'}? Session history will be kept.`)) return;
    for (const id of ids) await state.db.delete('routines', id);
    state.savedSelected.clear();
    await loadCollections();
    renderLibrary();
    return toast('Saved Timers deleted.');
  }
  if (action === 'manage-saved-collections') return showSavedCollectionsManager();
  if (action === 'add-saved-collection') return addSavedCollection();
  if (action === 'delete-saved-collection') return deleteSavedCollection(btn.dataset.collection);
  if (action === 'start-routine') return startRoutine(btn.dataset.id);
  if (action === 'edit-routine') { const r = state.routines.find((x) => x.id === btn.dataset.id); if (r) { closeSheet(); return openBuilder(r.type, r); } }
  if (action === 'edit-block') { const block = state.blocks.find((item) => item.id === btn.dataset.id); if (block) return openBlockEditor(block); }
  if (action === 'favorite-routine') { const r = state.routines.find((x) => x.id === btn.dataset.id); if (r) { r.favorite = !r.favorite; await state.db.saveRoutine(r); await loadCollections(); renderLibrary(); } return; }
  if (action === 'delete-routine') {
    const r = state.routines.find((x) => x.id === btn.dataset.id);
    if (r && confirm(`Delete "${r.title}"? Session history will be kept.`)) {
      await state.db.delete('routines', r.id);
      state.savedSelected.delete(r.id);
      state.builder = null; state.builderEditingId = null; state.route = 'library';
      closeSheet();
      await loadCollections(); render(); toast('Saved Timer deleted.');
    }
    return;
  }
  if (action === 'session-detail') return showSessionDetail(btn.dataset.id);
  if (action === 'repeat-session') return repeatSession(btn.dataset.id);
  if (action === 'delete-session') { if (confirm('Delete this session?')) { await state.db.delete('sessions', btn.dataset.id); closeSheet(); await loadCollections(); render(); } return; }
  if (action === 'save-session-note') { const session = state.sessions.find((item) => item.id === btn.dataset.id); const input = document.querySelector(`[data-session-note][data-id="${CSS.escape(btn.dataset.id)}"]`); if (session && input) { session.notes = String(input.value || '').slice(0, 10000); await state.db.put('sessions', session); await loadCollections(); toast('Session note saved.'); } return; }
  if (action === 'history-more') { state.historyVisible += 100; return renderHistory(); }
  if (action === 'history-view') { state.historyView = btn.dataset.view || 'list'; if (state.historyView !== 'list') ensureFullHistory(); return renderHistory(); }
  if (action === 'history-month') { const d = new Date(state.historyMonth); d.setMonth(d.getMonth() + Number(btn.dataset.delta || 0)); state.historyMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); return renderHistory(); }
  if (action === 'history-day') return showHistoryDay(Number(btn.dataset.day));
  if (action === 'history-export-json') return exportHistoryJson();
  if (action === 'history-export-csv') return exportHistoryCsv();
  if (action === 'delete-block') return deleteReusableBlock(btn.dataset.id);

  if (action === 'show-keyboard-shortcuts') {
    return showSheet('Keyboard shortcuts', `<div class="shortcut-grid">
      <div class="shortcut-row"><span>Pause / Resume</span><kbd>Space</kbd></div>
      <div class="shortcut-row"><span>Next interval</span><kbd>→</kbd></div>
      <div class="shortcut-row"><span>Previous interval</span><kbd>←</kbd></div>
      <div class="shortcut-row"><span>Adjust time</span><kbd>↑ / ↓</kbd></div>
      <div class="shortcut-row"><span>Restart step</span><kbd>R</kbd></div>
      <div class="shortcut-row"><span>Mute / Unmute</span><kbd>M</kbd></div>
      <div class="shortcut-row"><span>Lock / Unlock</span><kbd>L</kbd></div>
      <div class="shortcut-row"><span>Fullscreen</span><kbd>F</kbd></div>
    </div>`);
  }

  if (action === 'setting-toggle') {
    const k = btn.dataset.key;
    state.settings[k] = !state.settings[k];
    if (['notifications','activeNotifications'].includes(k) && state.settings[k]) {
      const p = await requestNotificationPermission();
      if (p !== 'granted') state.settings[k] = false;
    }
    await saveSettings();
    if (k === 'mediaControls') configureMediaSession();
    return renderSettings();
  }
  if (action === 'test-cue-kind') { await cue.test(btn.dataset.kind || 'work'); return; }
  if (action === 'save-cue-profile') {
    const title = prompt('Cue profile name', 'My Cue Profile')?.trim();
    if (!title) return;
    const profile = currentCueProfilePayload(title);
    await state.db.saveCueProfile(profile);
    await loadCollections();
    state.settings.cueProfileId = profile.id;
    await saveSettings();
    renderSettings(); toast('Cue profile saved.'); return;
  }
  if (action === 'delete-cue-profile') {
    const profile = state.cueProfiles.find((item) => item.id === btn.dataset.id);
    if (!profile || !confirm(`Delete cue profile “${profile.title}”?`)) return;
    await state.db.delete('cueProfiles', profile.id);
    if (state.settings.cueProfileId === profile.id) { applySelectedCueProfile('standard'); await saveSettings(); }
    for (const routine of state.routines.filter((item) => item.cueOverrides?.profileId === profile.id)) { routine.cueOverrides = { ...(routine.cueOverrides || {}) }; delete routine.cueOverrides.profileId; await state.db.saveRoutine(routine); }
    await loadCollections(); renderSettings(); toast('Cue profile deleted.'); return;
  }
  if (action === 'upload-custom-sound') {
    const picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'audio/*';
    picker.addEventListener('change', async () => {
      const file = picker.files?.[0]; if (!file) return;
      try {
        const inspected = await cue.inspectAudioFile(file);
        const title = (prompt('Sound name', file.name.replace(/\.[^.]+$/, '')) || '').trim();
        if (!title) return;
        await state.db.saveCustomSound({ id: uid('sound'), title, ...inspected });
        cue.clearCustomSoundCache(); await loadCollections(); renderSettings(); toast('Custom cue sound saved.');
      } catch (error) { toast(error.message || 'Sound could not be imported.', 4200); }
    }, { once: true });
    picker.click(); return;
  }
  if (action === 'preview-custom-sound') {
    const sound = state.customSounds.find((item) => item.id === btn.dataset.id);
    if (sound) await cue.play('work', { ...profileSettings(cueProfileById(state.settings.cueProfileId, state.cueProfiles)), ...state.settings, sound: true }, `custom:${sound.id}`);
    return;
  }
  if (action === 'delete-custom-sound') {
    const sound = state.customSounds.find((item) => item.id === btn.dataset.id);
    if (!sound || !confirm(`Delete custom sound “${sound.title}”? Steps that reference it will fall back silently.`)) return;
    await scrubDeletedCustomSound(sound.id); await state.db.delete('customSounds', sound.id); cue.clearCustomSoundCache(sound.id); await loadCollections(); renderSettings(); toast('Custom sound deleted.'); return;
  }
  if (action === 'enable-notifications') { const p = await requestNotificationPermission(); toast(p === 'granted' ? 'Notifications enabled.' : `Notifications: ${p}`); if (p === 'granted') { state.settings.notifications = true; await saveSettings(); renderSettings(); } return; }
  if (action === 'export-backup') return showBackupExportSheet();
  if (action === 'confirm-export-backup') return exportBackupConfigured();
  if (action === 'import-backup') return importFile.click();
  if (action === 'apply-restore') return applyPendingRestore();
  if (action === 'undo-last-restore') return undoLastRestore();
  if (action === 'create-recovery') { const snap = await state.db.createRecoverySnapshot({ kind: 'manual', label: 'Manual recovery snapshot' }); await refreshDataResilience(); renderSettings(); toast(`Recovery snapshot created (${snap.counts.sessions} sessions).`); return; }
  if (action === 'restore-recovery') return restoreRecoverySnapshot(btn.dataset.id);
  if (action === 'show-quarantine') return showQuarantine();
  if (action === 'clear-quarantine') { if (confirm('Clear quarantined records?')) { await state.db.clearQuarantine(); closeSheet(); await refreshDataResilience(); renderSettings(); toast('Quarantine cleared.'); } return; }
  if (action === 'export-routine-package') return exportRoutinePackage(btn.dataset.id);
  if (action === 'clear-history') { if (confirm('Clear all session history? Saved routines will remain.')) { await state.db.clear('sessions'); await loadCollections(); renderHistory(); toast('History cleared.'); } return; }
  if (action === 'install') return installApp();

  if (action === 'live-pause') { coordinator.togglePause(state.activeTimerId); updateLiveView(true); startLiveScheduler(); return; }
  if (action === 'live-adjust') { coordinator.command(state.activeTimerId, 'adjust', Number(btn.dataset.delta)); updateLiveView(true); return; }
  if (action === 'live-next') { coordinator.command(state.activeTimerId, 'next'); updateLiveView(true); return; }
  if (action === 'live-done') { coordinator.command(state.activeTimerId, 'manual'); updateLiveView(true); return; }
  if (action === 'live-finish') { coordinator.command(state.activeTimerId, 'finish', 'finished'); return; }
  if (action === 'live-lap') { coordinator.command(state.activeTimerId, 'lap'); updateLiveView(true); return; }
  if (action === 'amrap-round') { const d = state.engine.session.data || {}; coordinator.command(state.activeTimerId, 'data', { rounds: (d.rounds || 0) + 1, reps: 0 }); updateLiveView(true); return; }
  if (action === 'amrap-reps') { const d = state.engine.session.data || {}; coordinator.command(state.activeTimerId, 'data', { reps: Math.max(0, (d.reps || 0) + Number(btn.dataset.delta)) }); updateLiveView(true); return; }
  if (action === 'live-more') return liveMoreSheet();
  if (action === 'live-background') {
    closeSheet();
    stopLiveScheduler();
    syncFocusedRuntime(null);
    mediaSession.disable();
    state.route = 'timer';
    setLiveMode(false);
    render();
    broadcastActiveSnapshot();
    return;
  }
  if (action === 'live-restart') { closeSheet(); coordinator.command(state.activeTimerId, 'restart'); updateLiveView(true); return; }
  if (action === 'live-previous') { closeSheet(); coordinator.command(state.activeTimerId, 'previous'); updateLiveView(true); return; }
  if (action === 'live-lock') { closeSheet(); state.liveLocked = true; renderLive(); return; }
  if (action === 'live-unlock') { state.liveLocked = false; renderLive(); return; }
  if (action === 'live-layout') return layoutSheet();
  if (action === 'select-layout') { state.settings.layout = btn.dataset.layout; await saveSettings(); closeSheet(); renderLive(); return; }
  if (action === 'live-mute') { cue.toggleMute(); closeSheet(); if (state.engine) renderLive(); return; }
  if (action === 'live-fullscreen') { closeSheet(); try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen?.(); } catch {} return; }
  if (action === 'live-end') { closeSheet(); if (confirm('End this timer now? The partial session will be saved.')) coordinator.command(state.activeTimerId, 'stop', 'user-ended'); return; }
  if (action === 'completion-done') { state.completion = null; state.route = 'timer'; render(); return; }
  if (action === 'noop') return;
});

importFile.addEventListener('change', async () => { const file = importFile.files?.[0]; importFile.value = ''; if (file) await importBackupFile(file); });

document.addEventListener('keydown', (e) => {
  if (!state.engine || $('#sheet-root [data-sheet]') || isInteractiveTarget(e.target)) return;
  let handled = true;
  if (e.code === 'Space') coordinator.togglePause(state.activeTimerId);
  else if (e.key === 'ArrowRight') coordinator.command(state.activeTimerId, 'next');
  else if (e.key === 'ArrowLeft') coordinator.command(state.activeTimerId, 'previous');
  else if (e.key === 'ArrowUp') coordinator.command(state.activeTimerId, 'adjust', state.settings.adjustmentMs);
  else if (e.key === 'ArrowDown') coordinator.command(state.activeTimerId, 'adjust', -state.settings.adjustmentMs);
  else if (e.key.toLowerCase() === 'r') coordinator.command(state.activeTimerId, 'restart');
  else if (e.key.toLowerCase() === 'm') cue.toggleMute();
  else if (e.key.toLowerCase() === 'l') { state.liveLocked = !state.liveLocked; renderLive(); }
  else if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); }
  else if (e.key === '?' || (e.key === '/' && e.shiftKey)) { showSheet('Keyboard shortcuts', `<div class="shortcut-grid"><div class="shortcut-row"><span>Pause / Resume</span><kbd>Space</kbd></div><div class="shortcut-row"><span>Next interval</span><kbd>→</kbd></div><div class="shortcut-row"><span>Previous interval</span><kbd>←</kbd></div><div class="shortcut-row"><span>Adjust time</span><kbd>↑ / ↓</kbd></div><div class="shortcut-row"><span>Restart step</span><kbd>R</kbd></div><div class="shortcut-row"><span>Mute / Unmute</span><kbd>M</kbd></div><div class="shortcut-row"><span>Lock / Unlock</span><kbd>L</kbd></div><div class="shortcut-row"><span>Fullscreen</span><kbd>F</kbd></div></div>`); }
  else handled = false;
  if (handled) { e.preventDefault(); updateLiveView(true); if (e.code === 'Space') startLiveScheduler(); }
});

boot();
