import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveLocale, localeDirection, translateSource, formatDuration, formatDate,
  pseudoLocalize, phaseLabel, t
} from '../src/i18n.js';

test('locale resolution keeps supported languages and safely falls back', () => {
  assert.equal(resolveLocale('de-DE'), 'de');
  assert.equal(resolveLocale('en-US'), 'en');
  assert.equal(resolveLocale('system', ['de-DE','en-US']), 'de');
  assert.equal(resolveLocale('system', ['ja-JP']), 'en');
});

test('pseudo locales expand strings and exercise RTL direction', () => {
  const expanded = pseudoLocalize('Start', 'expanded');
  assert.match(expanded, /^［/);
  assert.ok(expanded.length > 'Start'.length);
  assert.equal(localeDirection('ar-XB'), 'rtl');
  assert.equal(localeDirection('de'), 'ltr');
});

test('source translations are reversible across locale switching', () => {
  assert.equal(translateSource('Settings', 'de'), 'Einstellungen');
  assert.equal(translateSource('Einstellungen', 'en'), 'Settings');
  assert.equal(phaseLabel('rest', 'de'), 'Pause');
});

test('duration formatting is localized without changing timer truth', () => {
  assert.match(formatDuration(125000, 'en'), /2/);
  assert.match(formatDuration(125000, 'de'), /2/);
  assert.match(formatDuration(65000, 'de', { style: 'long' }), /Minute/);
});

test('date formatting honors explicit 12/24 hour preference', () => {
  const value = new Date('2026-09-22T20:15:00Z');
  const h24 = formatDate(value, 'en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }, '24');
  const h12 = formatDate(value, 'en', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }, '12');
  assert.match(h24, /20/);
  assert.match(h12, /PM/i);
});

test('semantic announcement messages localize independently of visual timer ticks', () => {
  assert.equal(t('a11y.paused', 'de'), 'Timer pausiert.');
  assert.match(t('a11y.round', 'de', { current: 2, total: 5 }), /2/);
});
