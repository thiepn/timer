import test from 'node:test';
import assert from 'node:assert/strict';
import { TimerDB } from '../src/db.js';

test('backup v2 round-trips reusable blocks and still accepts v1 backups', async () => {
  const db = new TimerDB();
  await db.open();
  await db.saveBlock({ id: 'block-1', title: 'Block', revision: 1, parameters: [], nodes: [{ id: 'w', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }] });
  const exported = await db.exportData();
  assert.equal(exported.version, 2);
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
