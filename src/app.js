import {
  TimerEngine, BrowserClock, formatClock, durationLabel, estimatePlanDuration,
  buildCountdown, buildInterval, buildCircuit, buildBoxing, buildRunWalk,
  buildEmom, buildAmrap, buildForTime, buildStopwatch, buildLadder, buildPyramid,
  buildCustomRoutine, validateCustomRoutine, collectCustomParameterRefs, resolveCustomParameterValues, formulaVariableName
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
  custom: { name: 'Custom Routine', desc: 'Nested sections, repeats, timed and manual steps' },
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
    case 'custom': return { title: 'Custom Routine', parameters: [], durationScale: 1, targetDurationMinutes: 0, randomMode: 'new', fixedSeed: 'timer-seed', nodes: [{ id: uid('node'), type: 'repeat', count: 3, children: [
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
    case 'custom': return buildCustomRoutine({ title: c.title || 'Custom Routine', nodes: c.nodes || [], parameters: c.parameters || [], parameterValues: options.parameterValues || {}, blocks: options.blocks || state.blocks || [], seed: options.seed ?? (c.randomMode === 'fixed' ? (c.fixedSeed || 'timer-seed') : 'preview'), durationScale: Number(c.durationScale || 1), targetDurationMs: Number(c.targetDurationMinutes) > 0 ? mins(c.targetDurationMinutes) : undefined });
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
  blocks: [],
  sessions: [],
  builder: null,
  builderEditingId: null,
  builderEditingBlockId: null,
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
  librarySearchActive: false,
  customClipboard: null,
  pendingStart: null
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
  state.builderEditingBlockId = null;
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
        ${['tabata','circuit','boxing','run-walk','for-time','ladder','pyramid','custom'].map(modeCard).join('')}
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
  state.builderEditingBlockId = null;
  renderBuilder();
}

function openBlockEditor(block) {
  if (!block) return;
  closeSheet();
  state.builder = { type: 'custom', config: { title: block.title, parameters: structuredClone(block.parameters || []), nodes: structuredClone(block.nodes || []) } };
  state.builderEditingId = null;
  state.builderEditingBlockId = block.id;
  renderBuilder();
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

function renderBuilder() {
  setLiveMode(false);
  const { type, config: c } = state.builder;
  const m = BUILDER_META[type];
  const editingBlock = state.builderEditingBlockId ? state.blocks.find((block) => block.id === state.builderEditingBlockId) : null;
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
  } else if (type === 'custom') {
    c.parameters ||= [];
    body = `${renderCustomParameters(c.parameters)}${editingBlock ? '' : renderCustomCompileOptions(c)}<div class="field"><div class="row-between"><div><div class="field-label">Routine structure</div><div class="small muted">Nest patterns, formulas, generators, sections and reusable blocks. Formulas resolve before the workout starts.</div></div><button class="btn" data-action="custom-add" data-parent="">＋ Add</button></div><div class="custom-tree">${renderCustomTree(c.nodes || [])}</div>${!(c.nodes || []).length ? `<div class="empty">Add a step, repeat, generator, section, or reusable block to begin.</div>` : ''}<div class="row" style="flex-wrap:wrap"><button class="btn" data-action="custom-preview">Preview compiled plan</button>${state.blocks.length ? `<span class="pill">${state.blocks.length} reusable block${state.blocks.length === 1 ? '' : 's'}</span>` : ''}</div></div>`;
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
      ${state.builderEditingId ? `<button class="btn danger block" data-action="delete-routine" data-id="${esc(state.builderEditingId)}">Delete saved routine</button>` : state.builderEditingBlockId ? `<button class="btn danger block" data-action="delete-block" data-id="${esc(state.builderEditingBlockId)}">Delete reusable block</button>` : ''}
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
  const title = prompt('Reusable block name', node.label || (node.type === 'repeat' ? 'Repeat Block' : node.type === 'section' ? 'Section Block' : 'Workout Block'));
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
  try { planFromType(type, config, { blocks: validationBlocks }); } catch (error) { return toast(error.issues?.[0]?.message || error.message || 'This routine is not valid.', 4200); }

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
  const routine = {
    id: state.builderEditingId || uid('routine'),
    type,
    title: config.title?.trim() || BUILDER_META[type].name,
    config: structuredClone(config),
    favorite: previous?.favorite || false,
    createdAt: previous?.createdAt || Date.now(),
    useCount: previous?.useCount || 0,
    lastParameterValues: previous?.lastParameterValues || undefined,
    cueOverrides: structuredClone(state.builderCueOverrides || previous?.cueOverrides || {})
  };
  await state.db.saveRoutine(routine);
  await loadCollections();
  state.builderEditingId = routine.id;
  toast('Routine saved.');
}

function showParameterizedStart({ type, config, routineId, title, savedValues, source, cueOverrides = {} }) {
  const parameters = config.parameters || [];
  const defaults = defaultParameterValues(parameters);
  const values = { ...defaults, ...(savedValues || {}) };
  state.pendingStart = { type, config: structuredClone(config), routineId, title, source, cueOverrides: structuredClone(cueOverrides || {}), blocks: structuredClone(blocksForCurrentBuilder()) };
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
  await startSession(plan, { ...metaForType(pending.type, pending.config, pending.cueOverrides), title: pending.title || pending.config.title, routineId: pending.routineId, parameterValues: resolved });
}

async function startBuilder() {
  const { type, config } = state.builder;
  if (type === 'custom' && (config.parameters || []).length) {
    const routine = state.routines.find((item) => item.id === state.builderEditingId);
    return showParameterizedStart({ type, config, routineId: state.builderEditingId || undefined, title: config.title, savedValues: routine?.lastParameterValues, source: 'builder', cueOverrides: state.builderCueOverrides });
  }
  let plan;
  try { plan = planFromType(type, config, { blocks: blocksForCurrentBuilder(), seed: type === 'custom' && config.randomMode !== 'fixed' ? uid('seed') : undefined }); }
  catch (e) { return toast(e.issues?.[0]?.message || e.message || 'This timer could not be created.'); }
  await startSession(plan, { ...metaForType(type, config, state.builderCueOverrides), routineId: state.builderEditingId || undefined });
}

async function startRoutine(id) {
  const routine = state.routines.find((r) => r.id === id);
  if (!routine) return toast('Routine not found.');
  if (routine.type === 'custom' && (routine.config?.parameters || []).length) {
    return showParameterizedStart({ type: routine.type, config: routine.config, routineId: routine.id, title: routine.title, savedValues: routine.lastParameterValues, source: 'library', cueOverrides: routine.cueOverrides });
  }
  let plan;
  try { plan = planFromType(routine.type, routine.config, { blocks: state.blocks, seed: routine.type === 'custom' && routine.config?.randomMode !== 'fixed' ? uid('seed') : undefined }); }
  catch (error) { return toast(error.issues?.[0]?.message || error.message || 'Routine could not be compiled.', 4200); }
  routine.useCount = (routine.useCount || 0) + 1;
  routine.lastUsedAt = Date.now();
  await state.db.saveRoutine(routine);
  await loadCollections();
  await startSession(plan, { ...metaForType(routine.type, routine.config, routine.cueOverrides), title: routine.title, routineId: routine.id });
}

async function startSession(plan, meta) {
  if (state.engine) return toast('A timer is already running.');
  state.completion = null;
  state.finalized = false;
  await cue.init();
  cue.beginSession(meta);
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
    cue.onEvent(event, snapshot);
    if (!['session-completed', 'session-cancelled'].includes(event.type)) state.db.saveActive(snapshot, meta).catch(() => {});
    if (event.type === 'session-completed' || event.type === 'session-cancelled') finalizeSession(snapshot, event.type === 'session-cancelled');
  });
}

async function finalizeSession(snapshot, cancelled = false) {
  if (state.finalized) return;
  state.finalized = true;
  cancelAnimationFrame(state.liveRaf);
  await wakeLock.release();
  cue.endSession();
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
    cueOverrides: snapshot.meta?.cueOverrides,
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
    cue.tick(state.engine.view(), state.engine.session);
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
  const blockLabel = current.blockPath?.at(-1)?.title;
  const sectionLabel = current.sectionPath?.at(-1)?.label;
  const generator = current.generatorPath?.at(-1);
  const generatorLabel = generator?.type === 'random' ? `Random ${generator.current} / ${generator.total}` : '';
  const contextLabel = [blockLabel, sectionLabel, generatorLabel, round ? `Round ${round.current} / ${round.total}` : ''].filter(Boolean).join(' · ');
  $('#live-round').textContent = contextLabel || (v.mode === 'stopwatch' ? 'Stopwatch' : v.title);
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
  const blockMatches = (block) => !query || `${block.title || ''} reusable block ${(block.parameters || []).map((parameter) => parameter.label).join(' ')}`.toLowerCase().includes(query);
  const favorites = state.routines.filter((r) => r.favorite && matches(r));
  const routines = [...state.routines].filter(matches).sort((a, b) => (b.lastUsedAt || b.updatedAt || 0) - (a.lastUsedAt || a.updatedAt || 0));
  const blocks = [...state.blocks].filter(blockMatches).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  main.innerHTML = `<div class="page-head"><div><h1>Library</h1><p>Saved timers, routines, and reusable blocks.</p></div><button class="btn primary" data-action="create">＋ Create</button></div>
    <div class="field"><label for="library-search">Search library</label><input id="library-search" class="input" type="search" data-library-search value="${esc(state.libraryQuery)}" placeholder="Search routines or blocks"></div>
    ${favorites.length ? `<section class="section"><h2 class="section-title">Favorites</h2><div class="list">${favorites.map(routineRow).join('')}</div></section>` : ''}
    <section class="section"><div class="row-between"><h2 class="section-title" style="margin:0">My Routines</h2><span class="pill">${routines.length}</span></div><div class="list" style="margin-top:12px">${routines.length ? routines.map(routineRow).join('') : `<div class="card empty"><p>${query ? 'No routines match your search.' : 'No saved routines yet.'}</p>${query ? '' : '<button class="btn primary" data-action="create">Create timer</button>'}</div>`}</div></section>
    ${(blocks.length || (!query && state.blocks.length === 0)) ? `<section class="section"><div class="row-between"><div><h2 class="section-title" style="margin:0">Reusable Blocks</h2><div class="small muted" style="margin-top:5px">Linked building blocks for Custom Routines.</div></div><span class="pill">${blocks.length}</span></div><div class="list" style="margin-top:12px">${blocks.length ? blocks.map(blockRow).join('') : `<div class="card empty">Create a Custom Routine, then use ▣ on an item to extract it as a reusable block.</div>`}</div></section>` : ''}`;
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
  const params = r.type === 'custom' && r.config?.parameters?.length ? ` · ${r.config.parameters.length} parameter${r.config.parameters.length === 1 ? '' : 's'}` : '';
  return `<div class="list-row"><button class="favorite-btn ${r.favorite ? 'on' : ''}" data-action="favorite-routine" data-id="${esc(r.id)}" aria-label="${r.favorite ? 'Remove from' : 'Add to'} favorites">★</button><button class="list-row-main" data-action="edit-routine" data-id="${esc(r.id)}"><div class="list-row-title">${esc(r.title)}</div><div class="list-row-meta">${esc(BUILDER_META[r.type]?.name || r.type)} · ${esc(typeSummary(r.type, r.config))}${params}</div></button><button class="play-btn" data-action="start-routine" data-id="${esc(r.id)}" aria-label="Start ${esc(r.title)}">▶</button></div>`;
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
  const voices = state.availableVoices || [];
  const selectedProfile = cueProfileById(s.cueProfileId || 'standard', state.cueProfiles);
  const voiceOptions = `<option value="" ${!s.voiceURI ? 'selected' : ''}>System default</option>${voices.map((voice) => `<option value="${esc(voice.voiceURI)}" ${s.voiceURI === voice.voiceURI ? 'selected' : ''}>${esc(voice.name)} · ${esc(voice.lang)}${voice.localService ? ' · Local' : ''}</option>`).join('')}`;
  const customProfileRows = state.cueProfiles.length ? state.cueProfiles.map((profile) => `<div class="list-row"><div class="list-row-main"><div class="list-row-title">${esc(profile.title)}</div><div class="list-row-meta">${esc(SOUND_PACKS[profile.soundPack]?.title || profile.soundPack || 'Clean')} · ${profile.voice ? 'Voice' : 'No voice'} · ${profile.warningSeconds || 0}s warning</div></div><button class="icon-btn" data-action="delete-cue-profile" data-id="${esc(profile.id)}" aria-label="Delete ${esc(profile.title)}">×</button></div>`).join('') : `<div class="small muted">No custom cue profiles yet.</div>`;
  const soundRows = state.customSounds.length ? state.customSounds.map((sound) => `<div class="list-row"><button class="list-row-main" data-action="preview-custom-sound" data-id="${esc(sound.id)}"><div class="list-row-title">${esc(sound.title)}</div><div class="list-row-meta">${durationLabel(sound.durationMs || 0)} · ${Math.max(1, Math.round((sound.size || 0) / 1024))} KB</div></button><button class="icon-btn" data-action="delete-custom-sound" data-id="${esc(sound.id)}" aria-label="Delete ${esc(sound.title)}">×</button></div>`).join('') : `<div class="small muted">No uploaded cue sounds.</div>`;
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
      <div class="small muted">Timer v1.4.0 · local-first · offline capable</div>
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
    if (!data || data.format !== 'thiepn-timer-backup' || ![1, 2, 3].includes(data.version) || !Array.isArray(data.routines) || !Array.isArray(data.sessions)) throw new Error('Unsupported or incomplete backup.');
    const blocks = data.version >= 2 && Array.isArray(data.blocks) ? data.blocks : [];
    const importedSounds = data.version >= 3 && Array.isArray(data.customSounds) ? data.customSounds : [];
    for (const sound of importedSounds) {
      if (!sound?.id || !sound?.title || typeof sound.dataBase64 !== 'string' || sound.dataBase64.length > 3 * 1024 * 1024) throw new Error('Backup contains an invalid or oversized custom cue sound.');
    }
    for (const block of blocks) {
      if (!block?.id || !block?.title || !Array.isArray(block.nodes)) throw new Error('Backup contains an invalid reusable block.');
      try { buildCustomRoutine({ title: block.title, nodes: block.nodes, parameters: block.parameters || [], blocks }); }
      catch (error) { throw new Error(`Invalid reusable block “${block.title || block.id}”: ${error.issues?.[0]?.message || error.message || 'cannot compile'}`); }
    }
    for (const routine of data.routines) {
      if (!routine?.id || !routine?.type || !routine?.config || !BUILDER_META[routine.type]) throw new Error('Backup contains an unsupported routine.');
      try { planFromType(routine.type, routine.config, { blocks }); }
      catch (error) { throw new Error(`Invalid routine “${routine.title || routine.id}”: ${error.issues?.[0]?.message || error.message || 'cannot compile'}`); }
    }
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
  state.blocks = await state.db.all('blocks').catch(() => []);
  state.cueProfiles = await state.db.all('cueProfiles').catch(() => []);
  state.customSounds = (await state.db.all('customSounds').catch(() => [])).map(({ data, ...sound }) => sound);
  state.sessions = await state.db.recentSessions(500).catch(() => []);
}

async function boot() {
  applyTheme();
  try { await state.db.open(); } catch { toast('Storage unavailable. Timers can still run, but recovery may be limited.', 5000); }
  state.settings = await state.db.loadSettings().catch(() => ({ ...defaultSettings }));
  refreshVoices();
  if ('speechSynthesis' in globalThis) globalThis.speechSynthesis.onvoiceschanged = () => { refreshVoices(); if (state.route === 'settings' && !state.engine) renderSettings(); };
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
      cue.beginSession(state.activeMeta);
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
    cue.init().catch(() => {});
    const status = state.engine?.view()?.status;
    if (state.settings.keepAwake && status && !['completed', 'cancelled'].includes(status)) wakeLock.acquire();
  }
}

document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', () => { if (state.engine) state.db.saveActive(state.engine.snapshot(), state.activeMeta).catch(() => {}); });
window.addEventListener('resize', () => { if (state.engine) updateLiveView(true); });

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
  if (e.target.matches?.('[data-library-search]')) {
    state.libraryQuery = e.target.value;
    state.librarySearchActive = true;
    return renderLibrary();
  }
  updateBuilderInput(e.target);
  updateBuilderCueInput(e.target);
  updateCircuitInput(e.target);
  updateCustomInput(e.target);
  updateCustomCueInput(e.target);
  updateCustomParameterInput(e.target);
  updateBlockParameterInput(e.target);
});
document.addEventListener('change', async (e) => {
  updateBuilderInput(e.target); updateBuilderCueInput(e.target); updateCircuitInput(e.target); updateCustomInput(e.target); updateCustomCueInput(e.target); updateCustomParameterInput(e.target); updateBlockParameterInput(e.target);
  if (e.target.dataset.setting) {
    const key = e.target.dataset.setting;
    const numeric = new Set(['adjustmentMs','warningSeconds','voiceRate','voiceVolume','masterVolume','profileGain']);
    state.settings[key] = numeric.has(key) ? Number(e.target.value) : e.target.value;
    if (key === 'cueProfileId') applySelectedCueProfile(e.target.value);
    await saveSettings();
    if (key === 'cueProfileId' || key === 'voiceRate') renderSettings();
  }
});

document.addEventListener('click', async (e) => {
  const routeBtn = e.target.closest('[data-route]');
  if (routeBtn) return setRoute(routeBtn.dataset.route);
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;

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
  if (action === 'edit-block') { const block = state.blocks.find((item) => item.id === btn.dataset.id); if (block) return openBlockEditor(block); }
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
  if (action === 'delete-block') return deleteReusableBlock(btn.dataset.id);

  if (action === 'setting-toggle') { const k = btn.dataset.key; state.settings[k] = !state.settings[k]; if (k === 'notifications' && state.settings[k]) { const p = await requestNotificationPermission(); if (p !== 'granted') state.settings[k] = false; } await saveSettings(); return renderSettings(); }
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
