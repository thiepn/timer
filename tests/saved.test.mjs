import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVED_TIMER_SCHEMA_VERSION,
  DEFAULT_SAVED_TIMER_COLLECTIONS,
  normalizeSavedTimerRecord,
  normalizeSavedTimerTags,
  normalizeSavedTimerCollections,
  needsSavedTimerMigration,
  savedTimerMatchesView,
  sortSavedTimers,
  duplicateSavedTimerRecord
} from '../src/saved.js';

test('legacy routines normalize into universal saved timers without dropping timer data', () => {
  const legacy = {
    id: 'routine_1',
    type: 'interval',
    title: '40 / 20',
    config: { work: 40, rest: 20, rounds: 10 },
    favorite: true,
    createdAt: 10,
    updatedAt: 20
  };
  const migrated = normalizeSavedTimerRecord(legacy);
  assert.equal(migrated.savedTimerSchemaVersion, SAVED_TIMER_SCHEMA_VERSION);
  assert.deepEqual(migrated.config, legacy.config);
  assert.equal(migrated.favorite, true);
  assert.equal(migrated.pinned, false);
  assert.equal(migrated.archived, false);
  assert.ok(migrated.icon);
  assert.deepEqual(migrated.tags, []);
  assert.equal(needsSavedTimerMigration(legacy), true);
  assert.equal(needsSavedTimerMigration(migrated), false);
});

test('tag and collection normalization is bounded, unique and stable', () => {
  assert.deepEqual(normalizeSavedTimerTags(['Study', '#study', ' Focus ', '', 'Focus']), ['Study', 'Focus']);
  const collections = normalizeSavedTimerCollections(['Study', 'My Timers', 'study'], { includeDefaults: true });
  assert.equal(collections[0], DEFAULT_SAVED_TIMER_COLLECTIONS[0]);
  assert.ok(collections.includes('Study'));
  assert.ok(collections.includes('My Timers'));
  assert.equal(collections.filter((x) => x.toLowerCase() === 'study').length, 1);
});

test('saved timer views hide archived timers outside the archive', () => {
  const active = normalizeSavedTimerRecord({ id: 'a', pinned: true, favorite: true, collection: 'Study' });
  const archived = normalizeSavedTimerRecord({ id: 'b', archived: true, collection: 'Study' });
  assert.equal(savedTimerMatchesView(active, 'all'), true);
  assert.equal(savedTimerMatchesView(active, 'pinned'), true);
  assert.equal(savedTimerMatchesView(active, 'favorites'), true);
  assert.equal(savedTimerMatchesView(active, 'collection:Study'), true);
  assert.equal(savedTimerMatchesView(archived, 'all'), false);
  assert.equal(savedTimerMatchesView(archived, 'archived'), true);
});

test('saved timers support recent, most-used, alphabetical and duration sorting', () => {
  const rows = [
    { id: 'b', title: 'Beta', useCount: 1, lastUsedAt: 100, durationMs: 3000 },
    { id: 'a', title: 'Alpha', useCount: 8, lastUsedAt: 50, durationMs: 1000 },
    { id: 'c', title: 'Gamma', useCount: 2, lastUsedAt: 200, durationMs: null }
  ];
  assert.deepEqual(sortSavedTimers(rows, 'recent').map((x) => x.id), ['c', 'b', 'a']);
  assert.deepEqual(sortSavedTimers(rows, 'most-used').map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(sortSavedTimers(rows, 'alphabetical').map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(sortSavedTimers(rows, 'duration', (x) => x.durationMs).map((x) => x.id), ['a', 'b', 'c']);
});

test('duplicate creates an independent non-archived record with reset usage', () => {
  const source = normalizeSavedTimerRecord({
    id: 'old',
    type: 'countdown',
    title: 'Tea',
    config: { duration: 240 },
    archived: true,
    favorite: true,
    pinned: true,
    collection: 'Cooking',
    tags: ['tea'],
    useCount: 12,
    lastUsedAt: 123
  });
  const copy = duplicateSavedTimerRecord(source, { id: 'new', now: 999 });
  assert.equal(copy.id, 'new');
  assert.equal(copy.title, 'Tea Copy');
  assert.equal(copy.archived, false);
  assert.equal(copy.favorite, true);
  assert.equal(copy.pinned, true);
  assert.equal(copy.useCount, 0);
  assert.equal(copy.lastUsedAt, undefined);
  assert.deepEqual(copy.config, source.config);
  assert.notEqual(copy.config, source.config);
});
