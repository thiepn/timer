import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupArchive, verifyBackupArchive, encryptBackupArchive, decryptBackupArchive } from '../src/resilience.js';

const payload = {
  format: 'thiepn-timer-backup', version: 4, exportedAt: '2026-09-22T00:00:00.000Z',
  selection: { routines: true, blocks: true, cueProfiles: true, customSounds: true, sessions: true, settings: true },
  routines: [{ id: 'r1', type: 'interval', title: 'Test', config: { work: 40, rest: 20 } }],
  blocks: [], cueProfiles: [], customSounds: [], sessions: [], settings: { theme: 'dark' }
};

test('versioned archive verifies canonical SHA-256 integrity', async () => {
  const archive = await createBackupArchive(payload, { appVersion: '1.6.0' });
  assert.equal(archive.format, 'thiepn-timer-archive');
  assert.equal((await verifyBackupArchive(archive)).valid, true);
  const damaged = structuredClone(archive);
  damaged.payload.routines[0].title = 'Tampered';
  await assert.rejects(() => verifyBackupArchive(damaged), /integrity check failed/);
});

test('password-encrypted backup decrypts and verifies round-trip', async () => {
  const archive = await createBackupArchive(payload, { appVersion: '1.6.0' });
  const encrypted = await encryptBackupArchive(archive, 'correct horse battery staple', { iterations: 1000 });
  const decrypted = await decryptBackupArchive(encrypted, 'correct horse battery staple');
  assert.deepEqual(decrypted, archive);
  await assert.rejects(() => decryptBackupArchive(encrypted, 'wrong password'), /Could not decrypt backup/);
});
