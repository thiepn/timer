import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const visual = fs.readFileSync(path.join(root, 'visual-system.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const icons = fs.readFileSync(path.join(root, 'icons.svg'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('V3 shell uses the SVG icon system for primary chrome', () => {
  for (const id of ['i-timer','i-library','i-history','i-settings','i-plus','i-download','i-close']) {
    assert.ok(icons.includes('id="' + id + '"'), 'missing ' + id);
    assert.ok(html.includes('./icons.svg#' + id) || app.includes('./icons.svg#' + id), 'unused shell icon ' + id);
  }
  assert.doesNotMatch(icons, /<text\b/i);
  assert.ok(sw.includes("'./icons.svg'"));
});

test('V3 exposes both mobile dock and wide-screen navigation rail', () => {
  assert.match(html, /id="shell-rail"/);
  assert.match(html, /id="bottom-nav"/);
  assert.match(html, /class="shell-rail-nav"/);
  assert.match(visual, /@media \(min-width:1100px\)/);
  assert.match(visual, /\.shell-rail\s*\{[\s\S]*display:flex/);
  assert.match(visual, /\.bottom-nav\s*\{\s*display:none/);
});

test('V3 top chrome is contextual and scroll-reactive', () => {
  assert.match(html, /id="shell-context-kicker"/);
  assert.match(html, /id="shell-context-title"/);
  assert.match(app, /header\.classList\.toggle\('scrolled', window\.scrollY > 10\)/);
  assert.match(visual, /\.app-header\.scrolled/);
  assert.match(app, /workspace: \{ kicker: 'Timer', title: 'Workspace' \}/);
  assert.match(app, /library: \{ kicker: 'Library', title: 'Saved Timers' \}/);
});

test('V3 keeps Workspace under the Timer navigation destination', () => {
  assert.match(app, /state\.route === 'workspace' \? 'timer' : state\.route/);
});

test('V3 route transitions are progressive enhancement with reduced-motion fallback', () => {
  assert.match(app, /document\.startViewTransition/);
  assert.match(app, /reduceMotionEnabled\(state\.settings\.reduceMotion\)/);
  assert.match(visual, /::view-transition-old\(app-content\)/);
  assert.match(visual, /::view-transition-new\(app-content\)/);
  assert.match(visual, /data-reduce-motion="on"/);
  assert.match(visual, /prefers-reduced-motion:reduce/);
});

test('V3 modal layer is spatially distinct and responsive', () => {
  assert.match(app, /class="icon-btn sheet-close"/);
  assert.match(app, /\.\/icons\.svg#i-close/);
  assert.match(visual, /\.sheet-backdrop\s*\{[\s\S]*backdrop-filter:blur\(7px\)/);
  assert.match(visual, /\.sheet\s*\{[\s\S]*width:min\(100%, 680px\)/);
  assert.match(visual, /@media \(min-width:760px\)[\s\S]*\.sheet-backdrop/);
});

test('V3 desktop rail is removed completely from live timing mode', () => {
  assert.match(app, /#shell-rail'\)\?\.classList\.toggle\('hidden', on\)/);
  assert.match(visual, /\.live-mode \.shell-rail \{ display:none !important; \}/);
  assert.match(visual, /\.live-mode \.app-shell \{ padding-inline-start:0 !important; \}/);
});

test('V3 SVG shell controls retain accessible names outside decorative icons', () => {
  assert.match(html, /data-action="home" aria-label="Timer home"/);
  assert.match(html, /data-action="install" title="Install app" aria-label="Install Timer"/);
  assert.match(html, /data-action="create" title="Create timer" aria-label="Create timer"/);
  assert.match(html, /aria-label="Primary navigation"/);
});
