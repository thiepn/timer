import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const visual = fs.readFileSync(path.join(root, 'visual-system.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('V2 declares the complete M0-M5 semantic material hierarchy', () => {
  for (const token of [
    '--material-canvas',
    '--material-content',
    '--material-raised',
    '--material-interactive',
    '--material-floating',
    '--material-modal',
    '--material-live'
  ]) assert.ok(visual.includes(token), 'missing ' + token);
  for (const primitive of ['material-canvas','material-content','material-raised','material-floating','material-modal','material-live']) {
    assert.match(visual, new RegExp('\\\\.' + primitive + '\\\\b'));
  }
});

test('V2 declares T0-T5 typography roles and stable numeric display settings', () => {
  for (const token of [
    '--type-display-size','--type-hero-size','--type-title-size',
    '--type-ui-size','--type-body-size','--type-meta-size'
  ]) assert.ok(visual.includes(token), 'missing ' + token);
  for (const role of ['type-display','type-hero','type-title','type-ui','type-body','type-meta']) {
    assert.match(visual, new RegExp('\\\\.' + role + '\\\\b'));
  }
  assert.match(visual, /font-variant-numeric:tabular-nums/);
  assert.match(visual, /"tnum" 1/);
});

test('V2 declares coherent shape and motion scales', () => {
  for (const pair of [
    ['--radius-1','8px'],['--radius-2','12px'],['--radius-3','16px'],
    ['--radius-4','22px'],['--radius-5','30px'],['--radius-full','999px'],
    ['--motion-micro','120ms'],['--motion-control','180ms'],
    ['--motion-spatial','280ms'],['--motion-state','420ms']
  ]) assert.ok(visual.includes(pair[0] + ': ' + pair[1]), 'missing ' + pair[0] + ' ' + pair[1]);
});

test('V2 keeps timer state colors semantically separate', () => {
  const tokens = [
    '--state-work','--state-rest','--state-prepare','--state-recovery',
    '--state-paused','--state-overtime','--state-warning','--state-danger','--state-complete'
  ];
  for (const token of tokens) assert.ok(visual.includes(token), 'missing ' + token);
  const overtime = visual.match(/--state-overtime:\s*([^;]+)/)?.[1];
  const danger = visual.match(/--state-danger:\s*([^;]+)/)?.[1];
  assert.ok(overtime && danger);
  assert.notEqual(overtime, danger);
});

test('Dark Light and OLED are intentionally defined at document scope', () => {
  assert.match(visual, /html\[data-theme="dark"\]/);
  assert.match(visual, /html\[data-theme="light"\]/);
  assert.match(visual, /html\[data-theme="oled"\]/);
  assert.match(visual, /--material-canvas:\s*#000/);
  assert.match(app, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(app, /document\.documentElement\.style\.colorScheme/);
});

test('Global accent is persistent UI state rather than a hard-coded blue', () => {
  for (const accent of ['blue','teal','purple','green','orange','pink','red']) {
    assert.match(visual, new RegExp('data-accent="' + accent + '"'));
  }
  assert.match(app, /document\.documentElement\.dataset\.accent = accent/);
  assert.match(app, /data-setting="accent"/);
});

test('Visual system has designed accessibility fallbacks', () => {
  assert.match(visual, /data-high-contrast="true"/);
  assert.match(visual, /data-reduce-motion="on"/);
  assert.match(visual, /prefers-reduced-motion:reduce/);
  assert.match(visual, /forced-colors:active/);
  assert.match(visual, /focus-visible/);
});

test('Visual system remains offline and has no external font or style dependency', () => {
  assert.doesNotMatch(visual, /@import\s/i);
  assert.doesNotMatch(visual, /url\(\s*['"]?https?:/i);
  assert.ok(sw.includes("'./visual-system.css'"));
});

test('Visual system loads after legacy styles so semantic tokens win predictably', () => {
  const legacy = html.indexOf('href="./styles.css"');
  const v3 = html.indexOf('href="./visual-system.css"');
  assert.ok(legacy >= 0 && v3 > legacy);
});
