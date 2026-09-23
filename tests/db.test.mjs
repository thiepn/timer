import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerDB } from '../src/db.js';

test('backup v4 round-trips reusable blocks and still accepts v1 backups', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveBlock({ id: 'block-1', title: 'Block', revision: 1, parameters: [], nodes: [{ id: 'w', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }] });
  const exported = await db.exportData();
  assert.equal(exported.version, 4);
  assert.equal(exported.blocks.length, 1);

  const other = new TimerDB();
  await other.open();
  await other.importData(exported, { replace: true });
  assert.equal((await other.all('blocks')).length, 1);

  await other.importData({ format: 'thiepn-timer-backup', version: 1, routines: [], sessions: [], settings: {} }, { replace: true });
  assert.equal((await other.all('blocks')).length, 0);
});

test('saving an existing reusable block increments its revision', async () => {
  const db = new TimerDB();
  await db.open();
  const one = await db.saveBlock({ id: 'block-r', title: 'Revisioned', revision: 1, parameters: [], nodes: [{ id: 'w', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }] });
  const two = await db.saveBlock({ ...one, title: 'Revisioned 2' });
  assert.equal(one.revision, 1);
  assert.equal(two.revision, 2);
});

test('backup preserves advanced generator and formula routine configuration', async () => {
  const db = new TimerDB();
  await db.open();
  const config = {
    title: 'Advanced', durationScale: 1.25, targetDurationMinutes: 12, randomMode: 'fixed', fixedSeed: 'abc',
    parameters: [{ id: 'p', type: 'duration', label: 'Work time', variable: 'workTime', defaultMs: 30000, minMs: 1000, maxMs: 120000 }],
    nodes: [{ id: 'g', type: 'progression', count: 4, workBaseMs: 30000, workFormula: 'workTime + (round - 1) * 5', restBaseMs: 15000, restFormula: 'base' }]
  };
  await db.saveRoutine({ id: 'advanced-routine', type: 'custom', title: 'Advanced', config });
  const backup = await db.exportData();
  const restored = new TimerDB();
  await restored.open();
  await restored.importData(backup, { replace: true });
  const routine = (await restored.all('routines')).find((item) => item.id === 'advanced-routine');
  assert.deepEqual(routine.config, config);
});

test('backup v4 round-trips cue profiles and custom audio bytes', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveCueProfile({ id: 'cue-x', title: 'Gym Voice', sound: true, voice: true, soundPack: 'gym', warningSeconds: 10 });
  const bytes = new Uint8Array([1,2,3,4,5]).buffer;
  await db.saveCustomSound({ id: 'sound-x', title: 'Bell', mimeType: 'audio/wav', size: 5, durationMs: 400, data: bytes });
  const backup = await db.exportData();
  assert.equal(backup.version, 4);
  assert.equal(backup.cueProfiles.length, 1);
  assert.equal(backup.customSounds.length, 1);
  assert.equal(typeof backup.customSounds[0].dataBase64, 'string');
  assert.equal(backup.customSounds[0].data, undefined);

  const restored = new TimerDB();
  await restored.open();
  await restored.importData(backup, { replace: true });
  assert.equal((await restored.all('cueProfiles'))[0].title, 'Gym Voice');
  assert.deepEqual([...new Uint8Array((await restored.all('customSounds'))[0].data)], [1,2,3,4,5]);
});

test('v1 and v2 backups remain accepted after cue schema upgrade', async () => {
  const db = new TimerDB();
  await db.open();
  await db.importData({ format: 'thiepn-timer-backup', version: 1, routines: [], sessions: [], settings: {} }, { replace: true });
  await db.importData({ format: 'thiepn-timer-backup', version: 2, routines: [], blocks: [], sessions: [], settings: {} }, { replace: true });
  assert.equal((await db.all('cueProfiles')).length, 0);
  assert.equal((await db.all('customSounds')).length, 0);
});


test('recovery snapshots can roll the local database back', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveRoutine({ id: 'r1', type: 'interval', title: 'Before', config: { work: 40, rest: 20, rounds: 3, prepare: 0 } });
  const snap = await db.createRecoverySnapshot({ kind: 'manual', label: 'Before edit' });
  await db.saveRoutine({ id: 'r2', type: 'interval', title: 'After', config: { work: 30, rest: 30, rounds: 5, prepare: 0 } });
  assert.equal((await db.all('routines')).length, 2);
  await db.restoreRecoverySnapshot(snap.id);
  assert.deepEqual((await db.all('routines')).map((item) => item.id), ['r1']);
});

test('sync-ready journal and tombstones preserve mutation ancestry', async () => {
  const db = new TimerDB();
  await db.open();
  const one = await db.saveRoutine({ id: 'journal-r', type: 'interval', title: 'One', config: { work: 40, rest: 20, rounds: 3, prepare: 0 } });
  const two = await db.saveRoutine({ ...one, title: 'Two' });
  assert.equal(one.syncRevision, 1);
  assert.equal(two.syncRevision, 2);
  await db.delete('routines', 'journal-r');
  const changes = await db.all('changes');
  assert.deepEqual(changes.map((item) => item.operation), ['create','update','delete']);
  const tombstones = await db.all('tombstones');
  assert.equal(tombstones.length, 1);
  assert.equal(tombstones[0].entityId, 'journal-r');
});

test('quarantine retains invalid source records without placing them in primary stores', async () => {
  const db = new TimerDB();
  await db.open();
  await db.quarantineRecord({ source: 'test', entityType: 'routine', entityId: 'bad', reason: 'Broken', record: { id: 'bad' } });
  const rows = await db.listQuarantine();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record.id, 'bad');
  assert.equal((await db.all('routines')).length, 0);
});

test('selective backups only carry requested categories', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveRoutine({ id: 'only-r', type: 'interval', title: 'Routine', config: { work: 40, rest: 20, rounds: 3, prepare: 0 } });
  await db.put('sessions', { id: 'only-s', startedAt: 1, title: 'Session' });
  const backup = await db.exportData({ selection: { routines: true, blocks: false, cueProfiles: false, customSounds: false, sessions: false, settings: false } });
  assert.equal(backup.routines.length, 1);
  assert.equal(backup.sessions.length, 0);
  assert.equal(backup.settings, null);
  assert.equal(backup.selection.sessions, false);
});

test('active-session persistence rejects stale checkpoint sequence numbers', async () => {
  const db = new TimerDB();
  await db.open();
  const newer = { id: 'session-a', startedAt: 1000, sequence: 9, status: 'running' };
  const stale = { id: 'session-a', startedAt: 1000, sequence: 4, status: 'running' };
  await db.saveActive(newer, { title: 'Newer' });
  await db.saveActive(stale, { title: 'Stale' });
  const active = await db.getActive();
  assert.equal(active.sequence, 9);
  assert.equal(active.meta.title, 'Newer');
});

test('active-session clear is ordered after pending writes and can be session-guarded', async () => {
  const db = new TimerDB();
  await db.open();
  const first = { id: 'session-a', startedAt: 1000, sequence: 1, status: 'running' };
  const second = { id: 'session-a', startedAt: 1000, sequence: 2, status: 'running' };
  const p1 = db.saveActive(first, {});
  const p2 = db.saveActive(second, {});
  const p3 = db.clearActive('session-a');
  await Promise.all([p1, p2, p3]);
  assert.equal(await db.getActive(), undefined);

  await db.saveActive({ id: 'session-b', startedAt: 2000, sequence: 1, status: 'running' }, {});
  const clearedWrong = await db.clearActive('session-a');
  assert.equal(clearedWrong, false);
  assert.equal((await db.getActive()).snapshot.id, 'session-b');
});

test('multiple active timer checkpoints are independent and sequence guarded', async () => {
  const db = new TimerDB();
  await db.open();
  const base = { status: 'running', plan: { kind: 'open', title: 'Timer' }, startedAt: 10, meta: {} };
  await db.saveActiveSession({ id: 'runtime-a', snapshot: { ...base, id: 'session-a', sequence: 4 }, meta: { title: 'A' } });
  await db.saveActiveSession({ id: 'runtime-b', snapshot: { ...base, id: 'session-b', sequence: 2 }, meta: { title: 'B' } });
  await db.saveActiveSession({ id: 'runtime-a', snapshot: { ...base, id: 'session-a', sequence: 3 }, meta: { title: 'stale' } });
  const rows = await db.getActiveSessions();
  assert.equal(rows.length, 2);
  assert.equal((await db.getActiveSession('runtime-a')).meta.title, 'A');
  await db.clearActiveSession('runtime-a', 'session-a');
  assert.equal((await db.getActiveSessions()).length, 1);
  assert.equal((await db.getActiveSessions())[0].id, 'runtime-b');
});

test('active timer clear is guarded against a stale cycle session id', async () => {
  const db = new TimerDB();
  await db.open();
  const plan = { kind: 'open', title: 'Timer' };
  await db.saveActiveSession({ id: 'runtime-repeat', snapshot: { id: 'cycle-1', status: 'running', plan, startedAt: 1, sequence: 2 } });
  await db.saveActiveSession({ id: 'runtime-repeat', snapshot: { id: 'cycle-2', status: 'running', plan, startedAt: 2, sequence: 1 } });
  assert.equal(await db.clearActiveSession('runtime-repeat', 'cycle-1'), false);
  assert.equal((await db.getActiveSession('runtime-repeat')).snapshot.id, 'cycle-2');
});
