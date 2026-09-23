import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const visual = fs.readFileSync(path.join(root, 'visual-system.css'), 'utf8');
const icons = fs.readFileSync(path.join(root, 'icons.svg'), 'utf8');

const homeStart = app.indexOf('function renderTimerHome()');
const homeEnd = app.indexOf('function activeTimerCard(runtime)', homeStart);
const home = app.slice(homeStart, homeEnd);

test('V4 Home is built around a signature Quick Timer instrument', () => {
  assert.match(home, /class="quick-instrument/);
  assert.match(home, /data-quick-instrument/);
  assert.match(home, /class="quick-dial-shell"/);
  assert.match(home, /data-quick-dial-time/);
  assert.match(home, /data-quick-dial-caption/);
  assert.match(home, /class="quick-start-primary"/);
  assert.doesNotMatch(home, /quick-card-v2/);
});

test('V4 preserves universal Quick Timer input and submit contracts', () => {
  assert.match(home, /data-quick-form/);
  assert.match(home, /data-quick-input/);
  assert.match(home, /data-action="start-quick-input"/);
  assert.match(home, /data-quick-preview/);
  assert.match(app, /updateQuickHeroVisual\(result\)/);
});

test('V4 clock dial is explicitly decorative while typed duration remains accessible', () => {
  assert.match(home, /class="quick-dial-shell" aria-hidden="true"/);
  assert.match(home, /label class="quick-duration-editor" for="quick-duration-input"/);
  assert.match(home, /aria-describedby="quick-duration-preview"/);
});

test('V4 Home shortcuts use the SVG icon language rather than Unicode controls', () => {
  for (const id of ['i-play','i-arrow-right','i-repeat','i-stopwatch','i-interval','i-grid','i-queue']) {
    assert.ok(icons.includes('id="' + id + '"'), 'missing ' + id);
    assert.ok(home.includes('./icons.svg#' + id), 'Home does not use ' + id);
  }
  assert.doesNotMatch(home, /[↻◷↔＋]/);
});

test('V4 active timer summaries expose visual state and real engine progress', () => {
  const start = app.indexOf('function activeTimerCard(runtime)');
  const end = app.indexOf('function queueTimerById', start);
  const card = app.slice(start, end);
  assert.match(card, /current\.progress/);
  assert.match(card, /data-runtime-state=/);
  assert.match(card, /data-has-progress=/);
  assert.match(card, /--active-progress-angle/);
  assert.match(app, /card\.dataset\.runtimeState = phase/);
  assert.match(app, /card\.style\.setProperty\('--active-progress-angle'/);
});

test('V4 runtime updater iterates workspace cards safely', () => {
  assert.match(app, /for \(const card of \$\$\('\[data-workspace-runtime\]'\)\)/);
});

test('V4 responsive layout keeps hero usable on phone and wide screens', () => {
  assert.match(visual, /\.quick-instrument-layout\s*\{[\s\S]*grid-template-columns:minmax\(0,1\.3fr\)/);
  assert.match(visual, /@media \(max-width:720px\)[\s\S]*\.quick-instrument-form\s*\{[\s\S]*grid-template-columns:1fr/);
  assert.match(visual, /@media \(max-width:430px\)[\s\S]*\.quick-duration-chips-v4\s*\{[\s\S]*grid-template-columns:repeat\(3/);
});

test('V4 includes designed OLED, high contrast and forced-colors paths', () => {
  assert.match(visual, /data-theme="oled"\] \.quick-instrument/);
  assert.match(visual, /data-high-contrast="true"\] \.quick-instrument/);
  assert.match(visual, /@media \(forced-colors:active\)[\s\S]*\.quick-instrument/);
  assert.match(visual, /quick-instrument-ambient \{ display:none; \}/);
});

test('V4 active timer colors cover paused overtime and temporal phases', () => {
  for (const state of ['rest','prepare','recovery','cooldown','paused','overtime']) {
    assert.ok(visual.includes('data-runtime-state="' + state + '"'), 'missing state ' + state);
  }
});
