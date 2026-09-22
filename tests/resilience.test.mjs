import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackupArchive, verifyBackupArchive, encryptBackupArchive, decryptBackupArchive, assertBackupEntityLimits } from '../src/resilience.js';

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
  const encrypted = await encryptBackupArchive(archive, 'correct horse battery staple', { iterations: 100000 });
  const decrypted = await decryptBackupArchive(encrypted, 'correct horse battery staple');
  assert.deepEqual(decrypted, archive);
  await assert.rejects(() => decryptBackupArchive(encrypted, 'wrong password'), /Could not decrypt backup/);
});


test('encrypted backup rejects unreasonable PBKDF2 work factors before decryption', async () => {
  const archive = await createBackupArchive({ format: 'thiepn-timer-backup', version: 4, routines: [], blocks: [], cueProfiles: [], customSounds: [], sessions: [], settings: {} });
  const encrypted = await encryptBackupArchive(archive, 'password');
  encrypted.kdf.iterations = 2147483647;
  await assert.rejects(() => decryptBackupArchive(encrypted, 'password'), /unsupported PBKDF2 work factor/);
});

test('backup entity limits reject pathological record counts before restore loops', () => {
  assert.throws(() => assertBackupEntityLimits({ routines: Array(5001) }), /too many routines/);
  assert.throws(() => assertBackupEntityLimits({ sessions: Array(100001) }), /too many sessions/);
  assert.equal(assertBackupEntityLimits({ routines: Array(5), sessions: Array(5) }), true);
});
