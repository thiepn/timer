import test from 'node:test';
import assert from 'node:assert/strict';
import { isTextEntryTarget, isInteractiveTarget, timerEventAnnouncement } from '../src/accessibility.js';

function target(tagName, { contentEditable = false, role = null, closest = null } = {}) {
  return {
    tagName,
    isContentEditable: contentEditable,
    getAttribute(name) { return name === 'role' ? role : null; },
    closest() { return closest; }
  };
}

test('global workout shortcuts ignore text entry and interactive controls', () => {
  assert.equal(isTextEntryTarget(target('INPUT')), true);
  assert.equal(isTextEntryTarget(target('DIV', { contentEditable: true })), true);
  assert.equal(isInteractiveTarget(target('BUTTON')), true);
  assert.equal(isInteractiveTarget(target('MAIN')), false);
});

test('timer announcements only describe semantic events', () => {
  const options = {
    phaseLabel: (phase) => phase.toUpperCase(),
    translateLabel: (label) => label,
    durationText: (ms) => `${ms / 1000} seconds`,
    t(key, vars = {}) {
      const messages = {
        'a11y.paused': 'Timer paused.',
        'a11y.resumed': 'Timer resumed.',
        'a11y.completed': 'Workout complete.',
        'a11y.manualCompleted': 'Manual done.',
        'a11y.stepStarted': `${vars.phase} started. ${vars.label}.${vars.duration || ''}`,
        'a11y.round': `Round ${vars.current} of ${vars.total}`
      };
      return messages[key] || key;
    }
  };
  assert.equal(timerEventAnnouncement({ type: 'tick' }, options), '');
  assert.equal(timerEventAnnouncement({ type: 'session-paused' }, options), 'Timer paused.');
  const message = timerEventAnnouncement({ type: 'step-started', step: { phase: 'work', label: 'Push-ups', durationMs: 40000, round: { current: 2, total: 4 } } }, options);
  assert.match(message, /WORK started/);
  assert.match(message, /Round 2 of 4/);
});

test('PWA keeps browser zoom available and styles include forced-colors hardening', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1/i);
  assert.match(css, /forced-colors:\s*active/);
  assert.doesNotMatch(css, /html\s*,?\s*body[^}]*touch-action:\s*none/i);
});
