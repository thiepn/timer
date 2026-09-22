import {
  TimerEngine, BrowserClock, formatClock, durationLabel, estimatePlanDuration,
  buildCountdown, buildInterval, buildCircuit, buildBoxing, buildRunWalk,
  buildEmom, buildAmrap, buildForTime, buildStopwatch, buildLadder, buildPyramid
} from './core.js';
import { TimerDB, defaultSettings, requestPersistentStorage, storageEstimate } from './db.js';
import { CueManager, WakeLockManager, requestNotificationPermission, showCompletionNotification } from './audio.js';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (v = '') => String(v).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const uid = (prefix = 'id') => `${prefix}_${crypto.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
const ms = (seconds) => Math.max(0, Math.round(Number(seconds || 0) * 1000));
const sec = (milliseconds) => Math.round(Number(milliseconds || 0) / 1000);
const mins = (minutes) => ms(Number(minutes || 0) * 60);
const pct = (n) => `${Math.round(clamp(n || 0, 0, 1) * 100)}%`;

const BUILDER_META = {
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
  stopwatch: { name: 'Stopwatch', desc: 'Open-ended timer with laps' }
};

function defaultConfig(type) {
  switch (type) {
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

function planFromType(type, c) {
  switch (type) {
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
    case 'stopwatch': return buildStopwatch();
    default: throw new Error(`Unknown builder type: ${type}`);
  }
}

function metaForType(type, config) {
  return { mode: type, title: config.title || BUILDER_META[type]?.name || 'Timer', config: structuredClone(config) };
}

function typeSummary(type, c) {
  switch (type) {
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
    case 'stopwatch': return 'Open-ended';
    default: return '';
  }
}

const state = {
  route: 'timer',
  db: new TimerDB(),
  settings: { ...defaultSettings },
  routines: [],
  sessions: [],
  builder: null,
  builderEditingId: null,
  quickMs: 120000,
  engine: null,
  engineUnsub: null,
  activeMeta: null,
  liveRaf: 0,
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
  librarySearchActive: false
};

const cue = new CueManager(() => state.settings);
const wakeLock = new WakeLockManager();
const main = $('#app-main');
const appShell = $('#app');
const header = $('#app-header');
const bottomNav = $('#bottom-nav');
const importFile = $('#import-file');

function toast(message, timeout = 2600) {
  const root = $('#toast-root');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.append(el);
  setTimeout(() => el.remove(), timeout);
}

function applyTheme() {
  appShell.dataset.theme = state.settings.theme || 'dark';
  document.documentElement.style.colorScheme = state.settings.theme === 'light' ? 'light' : 'dark';
  const color = state.settings.theme === 'light' ? '#f3f6f9' : '#0b0d10';
  $('meta[name="theme-color"]')?.setAttribute('content', color);
}

function setRoute(route) {
  state.route = route;
  state.builder = null;
  state.builderEditingId = null;
  render();
  requestAnimationFrame(() => main.focus());
}

function setNavActive() {
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.route === state.route));
}

function setLiveMode(on) {
  document.body.classList.toggle('live-mode', on);
  header.classList.toggle('hidden', on);
  bottomNav.classList.toggle('hidden', on);
}

function render() {
  if (state.engine) return renderLive();
  setLiveMode(false);
  setNavActive();
  document.title = state.builder ? `${BUILDER_META[state.builder.type]?.name || 'Builder'} — Timer` : `${state.route[0].toUpperCase()}${state.route.slice(1)} — Timer`;
  if (state.completion) return renderCompletion();
  if (state.builder) return renderBuilder();
  if (state.route === 'library') return renderLibrary();
  if (state.route === 'history') return renderHistory();
  if (state.route === 'settings') return renderSettings();
  renderTimerHome();
}

function renderTimerHome() {
  const presets = state.settings.quickPresets || defaultSettings.quickPresets;
  const recent = state.sessions.slice(0, 3);
  main.innerHTML = `
    <div class="page-head"><div><h1>Timer</h1><p>Start fast. Configure only when you need it.</p></div></div>
    <section class="card quick-card">
      <div class="quick-label">Quick Timer</div>
      <button class="quick-time" data-action="edit-quick" aria-label="Set quick timer duration">${formatClock(state.quickMs)}</button>
      <div class="quick-controls">
        <button class="btn" data-action="quick-adjust" data-delta="-15000">−15</button>
        <button class="btn primary big" data-action="start-quick">Start</button>
        <button class="btn" data-action="quick-adjust" data-delta="15000">+15</button>
      </div>
      <div class="quick-presets">
        ${presets.map((p) => `<button class="preset-btn ${p === state.quickMs ? 'active' : ''}" data-action="quick-preset" data-ms="${p}">${durationLabel(p)}</button>`).join('')}
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Quick Start</h2>
      <div class="mode-grid">
        ${modeCard('interval')}${modeCard('emom')}${modeCard('stopwatch')}${modeCard('amrap')}
      </div>
    </section>

    <section class="section">
      <div class="row-between"><h2 class="section-title" style="margin:0">More Timers</h2><button class="btn ghost" data-action="create">Browse all</button></div>
      <div class="mode-grid" style="margin-top:12px">
        ${['tabata','circuit','boxing','run-walk','for-time','ladder','pyramid'].map(modeCard).join('')}
      </div>
    </section>

    <section class="section">
      <div class="row-between"><h2 class="section-title" style="margin:0">Recent</h2><button class="btn ghost" data-route="history">History</button></div>
      <div class="list" style="margin-top:12px">
        ${recent.length ? recent.map(sessionRow).join('') : `<div class="card empty">Completed timers will appear here.</div>`}
      </div>
    </section>`;
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
  root.innerHTML = `<div class="sheet-backdrop" data-action="close-sheet"><section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" data-sheet><div class="sheet-handle"></div><div class="row-between"><h2 id="sheet-title" class="sheet-title">${esc(title)}</h2><button class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></div>${content}</section></div>`;
  $('[data-sheet]', root)?.addEventListener('click', (e) => e.stopPropagation());
  requestAnimationFrame(() => $('[data-sheet] button', root)?.focus());
}

function closeSheet() { $('#sheet-root').innerHTML = ''; }

function openBuilder(type, routine = null) {
  closeSheet();
  state.builder = { type, config: structuredClone(routine?.config || defaultConfig(type)) };
  state.builderEditingId = routine?.id || null;
  renderBuilder();
}

function field(label, key, value, opts = {}) {
  const { type = 'number', min, max, step = 1, suffix = '', inputmode } = opts;
  return `<div class="field"><label for="b-${key}">${esc(label)}</label><div class="row"><input id="b-${key}" class="input" data-builder-key="${key}" type="${type}" value="${esc(value)}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''} ${step != null ? `step="${step}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''}>${suffix ? `<span class="muted">${esc(suffix)}</span>` : ''}</div></div>`;
}

function toggleField(label, key, checked, hint = '') {
  return `<div class="toggle-row"><div><strong>${esc(label)}</strong>${hint ? `<div class="small muted">${esc(hint)}</div>` : ''}</div><button class="toggle" data-action="builder-toggle" data-key="${key}" aria-pressed="${checked}" aria-label="${esc(label)}"></button></div>`;
}

function renderBuilder() {
  setLiveMode(false);
  const { type, config: c } = state.builder;
  const m = BUILDER_META[type];
  let body = '';
  if (type === 'interval' || type === 'tabata') {
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
  } else if (type === 'stopwatch') {
    body = `<div class="card card-pad"><strong>Stopwatch</strong><p class="muted">Open-ended timing with pause, resume and lap recording.</p></div>`;
  }

  let plan, estimate;
  try { plan = planFromType(type, c); estimate = estimatePlanDuration(plan); } catch {}
  main.innerHTML = `
    <div class="builder-head"><button class="icon-btn" data-action="builder-back" aria-label="Back">←</button><h1>${esc(m.name)}</h1><div class="builder-actions"><button class="btn" data-action="save-builder">Save</button><button class="btn primary" data-action="start-builder">Start</button></div></div>
    <div class="stack">
      <section class="card form-card">
        ${field('Name', 'title', c.title || m.name, { type: 'text' })}
        ${body}
        <div id="builder-summary" class="builder-summary"><span>${esc(typeSummary(type, c))}</span><strong>${estimate != null ? durationLabel(estimate) : 'Varies'}</strong></div>
      </section>
      <button class="btn primary big block" data-action="start-builder">Start ${esc(m.name)}</button>
      ${state.builderEditingId ? `<button class="btn danger block" data-action="delete-routine" data-id="${esc(state.builderEditingId)}">Delete saved routine</button>` : ''}
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

async function saveBuilder() {
  const { type, config } = state.builder;
  const routine = {
    id: state.builderEditingId || uid('routine'),
    type,
    title: config.title?.trim() || BUILDER_META[type].name,
    config: structuredClone(config),
    favorite: state.routines.find((r) => r.id === state.builderEditingId)?.favorite || false,
    createdAt: state.routines.find((r) => r.id === state.builderEditingId)?.createdAt || Date.now(),
    useCount: state.routines.find((r) => r.id === state.builderEditingId)?.useCount || 0
  };
  await state.db.saveRoutine(routine);
  await loadCollections();
  state.builderEditingId = routine.id;
  toast('Routine saved.');
}

async function startBuilder() {
  const { type, config } = state.builder;
  let plan;
  try { plan = planFromType(type, config); }
  catch (e) { return toast(e.message || 'This timer could not be created.'); }
  await startSession(plan, { ...metaForType(type, config), routineId: state.builderEditingId || undefined });
}

async function startRoutine(id) {
  const routine = state.routines.find((r) => r.id === id);
  if (!routine) return toast('Routine not found.');
  const plan = planFromType(routine.type, routine.config);
  routine.useCount = (routine.useCount || 0) + 1;
  routine.lastUsedAt = Date.now();
  await state.db.saveRoutine(routine);
  loadCollections();
  await startSession(plan, { ...metaForType(routine.type, routine.config), title: routine.title, routineId: routine.id });
}

async function startSession(plan, meta) {
  if (state.engine) return toast('A timer is already running.');
  state.completion = null;
  state.finalized = false;
  await cue.init();
  const engine = new TimerEngine(new BrowserClock());
  attachEngine(engine, meta);
  engine.start(plan, meta);
  state.engine = engine;
  state.activeMeta = meta;
  await state.db.saveActive(engine.snapshot(), meta).catch(() => toast('Recovery checkpoint could not be saved.'));
  if (state.settings.keepAwake) wakeLock.acquire();
  renderLive();
}

function attachEngine(engine, meta) {
  state.engineUnsub?.();
  state.engineUnsub = engine.subscribe((event, snapshot) => {
    cue.onEvent(event);
    if (!['session-completed', 'session-cancelled'].includes(event.type)) state.db.saveActive(snapshot, meta).catch(() => {});
    if (event.type === 'session-completed' || event.type === 'session-cancelled') finalizeSession(snapshot, event.type === 'session-cancelled');
  });
}

async function finalizeSession(snapshot, cancelled = false) {
  if (state.finalized) return;
  state.finalized = true;
  cancelAnimationFrame(state.liveRaf);
  await wakeLock.release();
  const plan = snapshot.plan;
  const activeDurationMs = Math.max(0, (snapshot.endedAt || Date.now()) - snapshot.startedAt - (snapshot.pausedTotalMs || 0));
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
  const record = {
    id: snapshot.id,
    title: snapshot.meta?.title || plan.title || 'Timer',
    mode: snapshot.meta?.mode || plan.meta?.mode || 'countdown',
    routineId: snapshot.meta?.routineId,
    config: snapshot.meta?.config,
    plan,
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt || Date.now(),
    activeDurationMs,
    pausedMs: snapshot.pausedTotalMs || 0,
    completionReason: snapshot.completionReason || (cancelled ? 'cancelled' : 'finished'),
    data: snapshot.data || {},
    workMs, restMs, otherMs
  };
  if (!cancelled) await state.db.put('sessions', record).catch(() => toast('Session history could not be saved.'));
  await state.db.clearActive().catch(() => {});
  state.engineUnsub?.();
  state.engineUnsub = null;
  state.engine = null;
  state.activeMeta = null;
  state.liveLocked = false;
  state.controlsHidden = false;
  await loadCollections();
  if (!cancelled) {
    state.completion = record;
    if (state.settings.notifications) showCompletionNotification('Timer complete', record.title);
  }
  render();
}

function renderLive() {
  if (!state.engine) return;
  setLiveMode(true);
  state.engine.reconcile();
  if (!state.engine) return;
  const v = state.engine.view();
  document.title = `${v.status === 'paused' ? 'Paused' : v.current?.label || 'Timer'} — Timer`;
  main.innerHTML = `
    <section id="live-shell" class="live-shell layout-${esc(state.settings.layout)} ${v.status === 'paused' ? 'paused' : ''}" data-phase="${esc(v.current?.phase || 'custom')}">
      <div class="live-top">
        <span id="live-round" class="pill"></span>
        <div class="row"><button class="icon-btn" data-action="live-mute" aria-label="Toggle cues">${cue.muted ? '🔇' : '🔊'}</button><button class="icon-btn" data-action="live-more" aria-label="More workout actions">⋯</button></div>
      </div>
      <div class="live-main">
        <div id="live-phase" class="live-phase"></div>
        <div id="live-time" class="live-time" role="timer" aria-label="Timer"></div>
        <div id="live-label" class="live-label"></div>
        <div id="live-target" class="live-target"></div>
        <div class="progress" aria-hidden="true"><span id="live-progress"></span></div>
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
  cancelAnimationFrame(state.liveRaf);
  const loop = () => {
    if (!state.engine) return;
    state.engine.reconcile();
    if (!state.engine) return;
    cue.tick(state.engine.view());
    updateLiveView(false);
    state.liveRaf = requestAnimationFrame(loop);
  };
  state.liveRaf = requestAnimationFrame(loop);
}

function updateLiveView(force = false) {
  const engine = state.engine;
  if (!engine) return;
  const v = engine.view();
  if (!v || v.status === 'completed' || v.status === 'cancelled') return;
  const current = v.current || {};
  const displayMs = current.remainingMs != null ? current.remainingMs : current.elapsedMs;
  const isCountUp = current.remainingMs == null;
  const tenths = v.mode === 'stopwatch';
  const text = formatClock(displayMs, { tenths, countUp: isCountUp });
  const liveTime = $('#live-time');
  if (force || liveTime?.textContent !== text) liveTime.textContent = text;
  $('#live-phase').textContent = v.status === 'paused' ? 'Paused' : (current.phase || (isCountUp ? 'Time' : 'Work'));
  $('#live-label').textContent = current.label || v.title;
  $('#live-target').textContent = current.target ? String(current.target) : '';
  const round = current.round;
  $('#live-round').textContent = round ? `Round ${round.current} / ${round.total}` : (v.mode === 'stopwatch' ? 'Stopwatch' : v.title);
  const next = v.next;
  $('#live-next').innerHTML = next ? `Next<br><strong>${esc(next.label)}${next.durationMs ? ` · ${formatClock(next.durationMs)}` : ''}</strong>` : '';
  const p = current.progress ?? 0;
  $('#live-progress').style.transform = `scaleX(${clamp(p, 0, 1)})`;
  const shell = $('#live-shell');
  shell.dataset.phase = current.phase || 'custom';
  shell.classList.toggle('paused', v.status === 'paused');
  shell.classList.toggle('controls-hidden', state.controlsHidden && state.settings.layout === 'wall');
  $('#pause-btn').textContent = v.status === 'paused' ? 'Resume' : 'Pause';
  const canAdjust = v.status === 'running' && current.remainingMs != null;
  $('#adjust-minus').disabled = !canAdjust;
  $('#adjust-plus').disabled = !canAdjust;
  renderModePanel(v);
  updateSecondaryAction(v);
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
  if (v.mode === 'stopwatch') { btn.textContent = 'Lap'; btn.dataset.action = 'live-lap'; btn.disabled = v.status === 'paused'; }
  else if (v.mode === 'for-time') { btn.textContent = 'Finish'; btn.dataset.action = 'live-finish'; btn.disabled = false; }
  else if (current.manual && !current.restingUntilDeadline) { btn.textContent = 'Done'; btn.dataset.action = 'live-done'; btn.disabled = v.status === 'paused'; }
  else if (current.restingUntilDeadline) { btn.textContent = 'Resting until next block'; btn.dataset.action = 'noop'; btn.disabled = true; }
  else { btn.textContent = 'Next'; btn.dataset.action = 'live-next'; btn.disabled = v.status === 'paused'; }
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
      state.controlsHidden = true;
      shell?.classList.add('controls-hidden');
    }, 3500);
  };
  shell?.addEventListener('pointerdown', reset);
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

function renderLibrary() {
  const query = state.libraryQuery.trim().toLowerCase();
  const matches = (r) => !query || `${r.title || ''} ${BUILDER_META[r.type]?.name || r.type || ''} ${typeSummary(r.type, r.config || {})}`.toLowerCase().includes(query);
  const favorites = state.routines.filter((r) => r.favorite && matches(r));
  const routines = [...state.routines].filter(matches).sort((a, b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0));
  main.innerHTML = `<div class="page-head"><div><h1>Library</h1><p>Saved timers and routines.</p></div><button class="btn primary" data-action="create">＋ Create</button></div>
    <div class="field"><label for="library-search">Search routines</label><input id="library-search" class="input" type="search" data-library-search value="${esc(state.libraryQuery)}" placeholder="Search by name or type"></div>
    ${favorites.length ? `<section class="section"><h2 class="section-title">Favorites</h2><div class="list">${favorites.map(routineRow).join('')}</div></section>` : ''}
    <section class="section"><div class="row-between"><h2 class="section-title" style="margin:0">My Routines</h2><span class="pill">${routines.length}</span></div><div class="list" style="margin-top:12px">${routines.length ? routines.map(routineRow).join('') : `<div class="card empty"><p>${query ? 'No routines match your search.' : 'No saved routines yet.'}</p>${query ? '' : '<button class="btn primary" data-action="create">Create timer</button>'}</div>`}</div></section>`;
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
  return `<div class="list-row"><button class="favorite-btn ${r.favorite ? 'on' : ''}" data-action="favorite-routine" data-id="${esc(r.id)}" aria-label="${r.favorite ? 'Remove from' : 'Add to'} favorites">★</button><button class="list-row-main" data-action="edit-routine" data-id="${esc(r.id)}"><div class="list-row-title">${esc(r.title)}</div><div class="list-row-meta">${esc(BUILDER_META[r.type]?.name || r.type)} · ${esc(typeSummary(r.type, r.config))}</div></button><button class="play-btn" data-action="start-routine" data-id="${esc(r.id)}" aria-label="Start ${esc(r.title)}">▶</button></div>`;
}

function renderHistory() {
  const sessions = state.sessions;
  const recent30 = sessions.filter((s) => s.startedAt > Date.now() - 30 * 86400000);
  const total = recent30.reduce((a, s) => a + (s.activeDurationMs || 0), 0);
  const work = recent30.reduce((a, s) => a + (s.workMs || 0), 0);
  const rest = recent30.reduce((a, s) => a + (s.restMs || 0), 0);
  main.innerHTML = `<div class="page-head"><div><h1>History</h1><p>Your recorded timer sessions.</p></div></div>
    <div class="analytics-grid">
      <div class="metric"><strong>${recent30.length}</strong><span>Last 30 days</span></div>
      <div class="metric"><strong>${durationLabel(total)}</strong><span>Timed</span></div>
      <div class="metric"><strong>${durationLabel(work)}</strong><span>Work</span></div>
    </div>
    ${total ? `<div class="card card-pad" style="margin-top:10px"><div class="small muted" style="margin-bottom:8px">Work / Rest / Other</div><div class="bar-stack"><span class="phase-work" style="width:${pct(work / Math.max(1,total))}"></span><span class="phase-rest" style="width:${pct(rest / Math.max(1,total))}"></span><span class="phase-other" style="flex:1"></span></div></div>` : ''}
    <section class="section"><h2 class="section-title">Sessions</h2><div class="list">${sessions.length ? sessions.map(sessionRowDetailed).join('') : `<div class="card empty">No completed sessions yet.</div>`}</div></section>`;
}

function sessionRowDetailed(s) {
  const d = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(s.startedAt));
  const score = s.mode === 'amrap' ? `${s.data?.rounds || 0} + ${s.data?.reps || 0}` : formatClock(s.activeDurationMs, { countUp: true });
  return `<div class="list-row"><button class="list-row-main" data-action="session-detail" data-id="${esc(s.id)}"><div class="list-row-title">${esc(s.title)}</div><div class="list-row-meta">${esc(d)} · ${esc(score)} · ${esc(s.completionReason)}</div></button><button class="play-btn" data-action="repeat-session" data-id="${esc(s.id)}" aria-label="Repeat ${esc(s.title)}">▶</button></div>`;
}

function showSessionDetail(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const d = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s.startedAt));
  showSheet(s.title, `<div class="stack">
    <div class="muted">${esc(d)}</div>
    <div class="analytics-grid"><div class="metric"><strong>${formatClock(s.activeDurationMs, { countUp: true })}</strong><span>Active</span></div><div class="metric"><strong>${durationLabel(s.workMs)}</strong><span>Work</span></div><div class="metric"><strong>${durationLabel(s.restMs)}</strong><span>Rest</span></div></div>
    ${s.mode === 'amrap' ? `<div class="card card-pad"><strong>${s.data?.rounds || 0} rounds + ${s.data?.reps || 0} reps</strong></div>` : ''}
    ${s.data?.laps?.length ? `<div class="card card-pad"><strong>Laps</strong><div class="laps" style="max-height:none">${s.data.laps.map((l) => `<div class="lap-row"><span>${l.index}</span><span>${formatClock(l.lapDurationMs,{tenths:true,countUp:true})}</span><span>${formatClock(l.sessionElapsedMs,{tenths:true,countUp:true})}</span></div>`).join('')}</div></div>` : ''}
    <button class="btn primary" data-action="repeat-session" data-id="${esc(s.id)}">Repeat timer</button>
    <button class="btn danger" data-action="delete-session" data-id="${esc(s.id)}">Delete session</button>
  </div>`);
}

function renderSettings() {
  const s = state.settings;
  main.innerHTML = `<div class="page-head"><div><h1>Settings</h1><p>Display, cues, data and device behavior.</p></div></div>
    <section class="card form-card">
      <h2 class="section-title">Appearance</h2>
      <div class="field"><label for="theme-select">Theme</label><select id="theme-select" class="select" data-setting="theme"><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option><option value="oled" ${s.theme === 'oled' ? 'selected' : ''}>OLED</option></select></div>
      <div class="field"><label for="layout-select">Default live layout</label><select id="layout-select" class="select" data-setting="layout"><option value="focus" ${s.layout === 'focus' ? 'selected' : ''}>Focus</option><option value="classic" ${s.layout === 'classic' ? 'selected' : ''}>Classic</option><option value="strength" ${s.layout === 'strength' ? 'selected' : ''}>Strength</option><option value="wall" ${s.layout === 'wall' ? 'selected' : ''}>Wall</option></select></div>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Timer</h2>
      <div class="field"><label for="adjust-setting">Time adjustment</label><select id="adjust-setting" class="select" data-setting="adjustmentMs"><option value="5000" ${s.adjustmentMs===5000?'selected':''}>5 seconds</option><option value="15000" ${s.adjustmentMs===15000?'selected':''}>15 seconds</option><option value="30000" ${s.adjustmentMs===30000?'selected':''}>30 seconds</option><option value="60000" ${s.adjustmentMs===60000?'selected':''}>1 minute</option></select></div>
      ${settingToggle('Start quick presets immediately', 'startPresetImmediately', s.startPresetImmediately, 'Tap a quick duration to start without pressing Start')}
      ${settingToggle('Keep screen awake', 'keepAwake', s.keepAwake, 'Uses Screen Wake Lock when supported')}
      ${settingToggle('Wall layout auto-hide', 'wallAutoHide', s.wallAutoHide, 'Hide controls after a few seconds')}
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Cues</h2>
      ${settingToggle('Sound', 'sound', s.sound)}${settingToggle('3–2–1 countdown cues', 'countdownCues', s.countdownCues)}${settingToggle('Voice announcements', 'voice', s.voice)}${settingToggle('Haptics', 'haptics', s.haptics)}
      <button class="btn" data-action="test-cues">Test cues</button>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Notifications</h2>
      ${settingToggle('Completion notifications', 'notifications', s.notifications, 'Requires browser notification permission')}
      <button class="btn" data-action="enable-notifications">Request notification permission</button>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">Data & Backup</h2>
      <div class="small muted">Persistent storage: ${state.storagePersistent == null ? 'Checking…' : state.storagePersistent ? 'Enabled' : 'Browser managed'}</div>
      <div class="small muted">Storage used: ${state.storageEstimate?.usage ? `${(state.storageEstimate.usage/1024/1024).toFixed(1)} MB` : 'Unknown'}</div>
      <button class="btn" data-action="export-backup">Export full backup</button>
      <button class="btn" data-action="import-backup">Import backup</button>
      <button class="btn danger" data-action="clear-history">Clear history</button>
    </section>
    <section class="card form-card" style="margin-top:12px"><h2 class="section-title">App</h2>
      <button class="btn" data-action="install">Install PWA</button>
      <div class="small muted">Timer v1.0.1 · local-first · offline capable</div>
    </section>`;
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
  await startSession(structuredClone(s.plan), { mode: s.mode, title: s.title, config: s.config, routineId: s.routineId });
}

function liveMoreSheet() {
  const v = state.engine?.view();
  if (!v) return;
  showSheet('Workout', `<div class="sheet-list">
    ${v.planKind === 'timeline' ? `<button class="sheet-item" data-action="live-restart">Restart current step</button><button class="sheet-item" data-action="live-previous">Previous step</button>` : ''}
    <button class="sheet-item" data-action="live-lock">Lock controls</button>
    <button class="sheet-item" data-action="live-layout">Layout: ${esc(state.settings.layout)}</button>
    <button class="sheet-item" data-action="live-fullscreen">Toggle fullscreen</button>
    <button class="sheet-item" data-action="live-mute">${cue.muted ? 'Unmute cues' : 'Mute cues'}</button>
    <button class="sheet-item" data-action="live-end" style="color:var(--danger)">End workout</button>
  </div>`);
}

function layoutSheet() {
  showSheet('Live Layout', `<div class="sheet-list">${['focus','classic','strength','wall'].map((l) => `<button class="sheet-item" data-action="select-layout" data-layout="${l}">${l[0].toUpperCase()+l.slice(1)} ${state.settings.layout===l?'✓':''}</button>`).join('')}</div>`);
}

async function exportBackup() {
  const data = await state.db.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timer-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('Backup exported.');
}

async function importBackupFile(file) {
  try {
    if (!file || file.size > 25 * 1024 * 1024) throw new Error('Backup file is too large.');
    const data = JSON.parse(await file.text());
    if (!confirm('Import this backup and merge it with current data? Existing matching IDs may be replaced.')) return;
    await state.db.importData(data, { replace: false });
    state.settings = await state.db.loadSettings();
    applyTheme();
    await loadCollections();
    render();
    toast('Backup imported.');
  } catch (e) { toast(e.message || 'Backup could not be imported.', 4200); }
}

async function installApp() {
  if (state.installPrompt) {
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => {});
    state.installPrompt = null;
    $('#install-btn')?.classList.add('hidden');
  } else toast('Use your browser menu and choose “Install app” or “Add to Home screen”.', 4200);
}

async function loadCollections() {
  state.routines = await state.db.all('routines').catch(() => []);
  state.sessions = await state.db.recentSessions(500).catch(() => []);
}

async function boot() {
  applyTheme();
  try { await state.db.open(); } catch { toast('Storage unavailable. Timers can still run, but recovery may be limited.', 5000); }
  state.settings = await state.db.loadSettings().catch(() => ({ ...defaultSettings }));
  state.quickMs = state.settings.quickPresets?.[3] || 120000;
  applyTheme();
  await loadCollections();
  state.storagePersistent = await requestPersistentStorage();
  state.storageEstimate = await storageEstimate();

  const active = await state.db.getActive().catch(() => null);
  if (active?.snapshot && !['completed','cancelled'].includes(active.snapshot.status)) {
    try {
      const engine = TimerEngine.restore(active.snapshot, new BrowserClock());
      state.engine = engine;
      state.activeMeta = active.meta || active.snapshot.meta || {};
      attachEngine(engine, state.activeMeta);
      if (engine.view()?.status === 'completed') await finalizeSession(engine.snapshot(), false);
      else {
        if (state.settings.keepAwake) wakeLock.acquire();
        renderLive();
      }
    } catch {
      await state.db.clearActive().catch(() => {});
      toast('The previous active timer could not be restored.', 4200);
      render();
    }
  } else {
    handleLaunchIntent();
    render();
  }

  registerPwa();
}

function handleLaunchIntent() {
  const params = new URLSearchParams(location.search);
  const launch = params.get('launch');
  if (!launch) return;
  history.replaceState({}, '', location.pathname + location.hash);
  if (launch === 'quick') { state.route = 'timer'; }
  else if (launch === 'stopwatch') openBuilder('stopwatch');
  else if (launch === 'favorites') { state.route = 'library'; }
  else if (launch === 'last') {
    const lastRoutineId = state.sessions.find((s) => s.routineId)?.routineId;
    if (lastRoutineId) setTimeout(() => startRoutine(lastRoutineId), 0);
  }
}

function registerPwa() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); state.installPrompt = e; $('#install-btn')?.classList.remove('hidden');
  });
}

async function onVisibilityChange() {
  if (!state.engine) return;
  if (document.visibilityState === 'hidden') {
    await state.db.saveActive(state.engine.snapshot(), state.activeMeta).catch(() => {});
  } else {
    state.engine.rebaseToWall();
    state.engine.reconcile();
    const status = state.engine?.view()?.status;
    if (state.settings.keepAwake && status && !['completed', 'cancelled'].includes(status)) wakeLock.acquire();
  }
}

document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', () => { if (state.engine) state.db.saveActive(state.engine.snapshot(), state.activeMeta).catch(() => {}); });
window.addEventListener('resize', () => { if (state.engine) updateLiveView(true); });

window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.installPrompt = e; $('#install-btn')?.classList.remove('hidden'); });

function updateBuilderInput(target) {
  if (!state.builder) return;
  const key = target.dataset.builderKey;
  if (!key) return;
  const cfg = state.builder.config;
  if (target.type === 'number') cfg[key] = Number(target.value);
  else cfg[key] = target.value;
  const summary = $('#builder-summary');
  if (summary) {
    let estimate;
    try { estimate = estimatePlanDuration(planFromType(state.builder.type, cfg)); } catch {}
    summary.innerHTML = `<span>${esc(typeSummary(state.builder.type, cfg))}</span><strong>${estimate != null ? durationLabel(estimate) : 'Varies'}</strong>`;
  }
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
  if (e.target.matches?.('[data-library-search]')) {
    state.libraryQuery = e.target.value;
    state.librarySearchActive = true;
    return renderLibrary();
  }
  updateBuilderInput(e.target);
  updateCircuitInput(e.target);
});
document.addEventListener('change', (e) => { updateBuilderInput(e.target); updateCircuitInput(e.target); if (e.target.dataset.setting) { const key = e.target.dataset.setting; state.settings[key] = key === 'adjustmentMs' ? Number(e.target.value) : e.target.value; saveSettings(); } });

document.addEventListener('click', async (e) => {
  const routeBtn = e.target.closest('[data-route]');
  if (routeBtn) return setRoute(routeBtn.dataset.route);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === 'home') return setRoute('timer');
  if (action === 'create') return showCreateSheet();
  if (action === 'close-sheet') return closeSheet();
  if (action === 'open-builder') return openBuilder(btn.dataset.type);
  if (action === 'builder-back') { state.builder = null; state.builderEditingId = null; return render(); }
  if (action === 'builder-toggle') { const k = btn.dataset.key; state.builder.config[k] = !state.builder.config[k]; return renderBuilder(); }
  if (action === 'save-builder') return saveBuilder();
  if (action === 'start-builder') return startBuilder();
  if (action === 'add-circuit-step') { state.builder.config.items.push({ label: 'Work', seconds: 40, phase: 'work', manual: false }); return renderBuilder(); }
  if (action === 'remove-circuit-step') { state.builder.config.items.splice(Number(btn.dataset.index), 1); return renderBuilder(); }

  if (action === 'quick-preset') { state.quickMs = Number(btn.dataset.ms); renderTimerHome(); if (state.settings.startPresetImmediately) startSession(buildCountdown({ durationMs: state.quickMs, label: `${durationLabel(state.quickMs)} Timer` }), { mode: 'countdown', title: `${durationLabel(state.quickMs)} Timer`, config: { durationMs: state.quickMs } }); return; }
  if (action === 'quick-adjust') { state.quickMs = clamp(state.quickMs + Number(btn.dataset.delta), 1000, 24 * 3600000); return renderTimerHome(); }
  if (action === 'edit-quick') {
    const raw = prompt('Timer duration in seconds', String(Math.round(state.quickMs / 1000)));
    if (raw != null && Number(raw) > 0) { state.quickMs = clamp(ms(raw), 1000, 24 * 3600000); renderTimerHome(); }
    return;
  }
  if (action === 'start-quick') return startSession(buildCountdown({ durationMs: state.quickMs, label: `${durationLabel(state.quickMs)} Timer` }), { mode: 'countdown', title: `${durationLabel(state.quickMs)} Timer`, config: { durationMs: state.quickMs } });

  if (action === 'start-routine') return startRoutine(btn.dataset.id);
  if (action === 'edit-routine') { const r = state.routines.find((x) => x.id === btn.dataset.id); if (r) return openBuilder(r.type, r); }
  if (action === 'favorite-routine') { const r = state.routines.find((x) => x.id === btn.dataset.id); if (r) { r.favorite = !r.favorite; await state.db.saveRoutine(r); await loadCollections(); renderLibrary(); } return; }
  if (action === 'delete-routine') {
    const r = state.routines.find((x) => x.id === btn.dataset.id);
    if (r && confirm(`Delete “${r.title}”? Session history will be kept.`)) {
      await state.db.delete('routines', r.id);
      state.builder = null; state.builderEditingId = null; state.route = 'library';
      await loadCollections(); render(); toast('Routine deleted.');
    }
    return;
  }
  if (action === 'session-detail') return showSessionDetail(btn.dataset.id);
  if (action === 'repeat-session') return repeatSession(btn.dataset.id);
  if (action === 'delete-session') { if (confirm('Delete this session?')) { await state.db.delete('sessions', btn.dataset.id); closeSheet(); await loadCollections(); render(); } return; }

  if (action === 'setting-toggle') { const k = btn.dataset.key; state.settings[k] = !state.settings[k]; if (k === 'notifications' && state.settings[k]) { const p = await requestNotificationPermission(); if (p !== 'granted') state.settings[k] = false; } await saveSettings(); return renderSettings(); }
  if (action === 'test-cues') { await cue.init(); cue.pattern('work'); setTimeout(() => cue.pattern('rest'), 500); setTimeout(() => cue.pattern('finish'), 1000); return; }
  if (action === 'enable-notifications') { const p = await requestNotificationPermission(); toast(p === 'granted' ? 'Notifications enabled.' : `Notifications: ${p}`); if (p === 'granted') { state.settings.notifications = true; await saveSettings(); renderSettings(); } return; }
  if (action === 'export-backup') return exportBackup();
  if (action === 'import-backup') return importFile.click();
  if (action === 'clear-history') { if (confirm('Clear all session history? Saved routines will remain.')) { await state.db.clear('sessions'); await loadCollections(); renderHistory(); toast('History cleared.'); } return; }
  if (action === 'install') return installApp();

  if (action === 'live-pause') { state.engine.view().status === 'paused' ? state.engine.resume() : state.engine.pause(); updateLiveView(true); return; }
  if (action === 'live-adjust') { state.engine.adjust(Number(btn.dataset.delta)); updateLiveView(true); return; }
  if (action === 'live-next') { state.engine.next(); updateLiveView(true); return; }
  if (action === 'live-done') { state.engine.completeManual(); updateLiveView(true); return; }
  if (action === 'live-finish') { state.engine.finish('finished'); return; }
  if (action === 'live-lap') { state.engine.addLap(); updateLiveView(true); return; }
  if (action === 'amrap-round') { const d = state.engine.session.data || {}; state.engine.setData({ rounds: (d.rounds || 0) + 1, reps: 0 }); updateLiveView(true); return; }
  if (action === 'amrap-reps') { const d = state.engine.session.data || {}; state.engine.setData({ reps: Math.max(0, (d.reps || 0) + Number(btn.dataset.delta)) }); updateLiveView(true); return; }
  if (action === 'live-more') return liveMoreSheet();
  if (action === 'live-restart') { closeSheet(); state.engine.restart(); updateLiveView(true); return; }
  if (action === 'live-previous') { closeSheet(); state.engine.previous(); updateLiveView(true); return; }
  if (action === 'live-lock') { closeSheet(); state.liveLocked = true; renderLive(); return; }
  if (action === 'live-unlock') { state.liveLocked = false; renderLive(); return; }
  if (action === 'live-layout') return layoutSheet();
  if (action === 'select-layout') { state.settings.layout = btn.dataset.layout; await saveSettings(); closeSheet(); renderLive(); return; }
  if (action === 'live-mute') { cue.toggleMute(); closeSheet(); if (state.engine) renderLive(); return; }
  if (action === 'live-fullscreen') { closeSheet(); try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen?.(); } catch {} return; }
  if (action === 'live-end') { closeSheet(); if (confirm('End this workout now? The partial session will be saved.')) state.engine.finish('user-ended'); return; }
  if (action === 'completion-done') { state.completion = null; state.route = 'timer'; render(); return; }
  if (action === 'noop') return;
});

importFile.addEventListener('change', async () => { const file = importFile.files?.[0]; importFile.value = ''; if (file) await importBackupFile(file); });

document.addEventListener('keydown', (e) => {
  if (!state.engine || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  let handled = true;
  if (e.code === 'Space') state.engine.view().status === 'paused' ? state.engine.resume() : state.engine.pause();
  else if (e.key === 'ArrowRight') state.engine.next();
  else if (e.key === 'ArrowLeft') state.engine.previous();
  else if (e.key === 'ArrowUp') state.engine.adjust(state.settings.adjustmentMs);
  else if (e.key === 'ArrowDown') state.engine.adjust(-state.settings.adjustmentMs);
  else if (e.key.toLowerCase() === 'r') state.engine.restart();
  else if (e.key.toLowerCase() === 'm') cue.toggleMute();
  else if (e.key.toLowerCase() === 'l') { state.liveLocked = !state.liveLocked; renderLive(); }
  else if (e.key.toLowerCase() === 'f') { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.(); }
  else handled = false;
  if (handled) { e.preventDefault(); updateLiveView(true); }
});

boot();
