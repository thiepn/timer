const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const BACKUP_ENTITY_LIMITS = Object.freeze({
  routines: 5000,
  blocks: 5000,
  cueProfiles: 1000,
  customSounds: 500,
  sessions: 100000
});

export function assertBackupEntityLimits(payload = {}, limits = BACKUP_ENTITY_LIMITS) {
  for (const [key, limit] of Object.entries(limits)) {
    const value = payload?.[key];
    if (Array.isArray(value) && value.length > limit) throw new Error(`Backup contains too many ${key} records.`);
  }
  return true;
}

const MIN_PBKDF2_ITERATIONS = 100000;
const MAX_PBKDF2_ITERATIONS = 1000000;

function validateKdfIterations(value) {
  const iterations = Number(value);
  if (!Number.isInteger(iterations) || iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error('Encrypted backup uses an unsupported PBKDF2 work factor.');
  }
  return iterations;
}

function bytesToBase64(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(String(value || ''), 'base64'));
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function canonicalValue(value) {
  if (value === undefined) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof ArrayBuffer) return { $binary: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) return { $binary: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return String(value);
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256Hex(value) {
  if (!globalThis.crypto?.subtle) throw new Error('Cryptographic hashing is unavailable in this browser.');
  const bytes = typeof value === 'string' ? encoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashCanonical(value) {
  return sha256Hex(canonicalStringify(value));
}

export function backupCounts(payload = {}) {
  return {
    routines: Array.isArray(payload.routines) ? payload.routines.length : 0,
    blocks: Array.isArray(payload.blocks) ? payload.blocks.length : 0,
    cueProfiles: Array.isArray(payload.cueProfiles) ? payload.cueProfiles.length : 0,
    customSounds: Array.isArray(payload.customSounds) ? payload.customSounds.length : 0,
    sessions: Array.isArray(payload.sessions) ? payload.sessions.length : 0
  };
}

export async function createBackupArchive(payload, { appVersion = 'unknown', selection = null, kind = 'full-backup' } = {}) {
  const manifest = {
    format: 'thiepn-timer-archive',
    version: 1,
    payloadFormat: payload?.format || 'thiepn-timer-backup',
    payloadVersion: Number(payload?.version) || 0,
    kind,
    createdAt: new Date().toISOString(),
    appVersion,
    selection: selection ? structuredClone(selection) : null,
    counts: backupCounts(payload)
  };
  const integrityInput = { manifest, payload };
  const sha256 = await hashCanonical(integrityInput);
  return { ...manifest, payload, integrity: { algorithm: 'SHA-256', sha256 } };
}

export async function verifyBackupArchive(archive) {
  if (!archive || archive.format !== 'thiepn-timer-archive' || archive.version !== 1 || !archive.payload || !archive.integrity?.sha256) {
    throw new Error('Unsupported Timer archive.');
  }
  const manifest = {
    format: archive.format,
    version: archive.version,
    payloadFormat: archive.payloadFormat,
    payloadVersion: archive.payloadVersion,
    kind: archive.kind,
    createdAt: archive.createdAt,
    appVersion: archive.appVersion,
    selection: archive.selection ?? null,
    counts: archive.counts
  };
  const actual = await hashCanonical({ manifest, payload: archive.payload });
  if (actual !== archive.integrity.sha256) throw new Error('Backup integrity check failed. The archive may be damaged or modified.');
  return { valid: true, sha256: actual, manifest };
}

async function derivePasswordKey(password, salt, iterations) {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted backups are unavailable in this browser.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBackupArchive(archive, password, { iterations = 250000 } = {}) {
  if (!String(password || '').length) throw new Error('Backup password is required.');
  iterations = validateKdfIterations(iterations);
  if (!globalThis.crypto?.getRandomValues) throw new Error('Secure random generation is unavailable.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derivePasswordKey(password, salt, iterations);
  const plaintext = encoder.encode(JSON.stringify(archive));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    format: 'thiepn-timer-encrypted-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, saltBase64: bytesToBase64(salt) },
    cipher: { name: 'AES-GCM', ivBase64: bytesToBase64(iv) },
    ciphertextBase64: bytesToBase64(ciphertext),
    ciphertextSha256: await sha256Hex(ciphertext)
  };
}

export async function decryptBackupArchive(envelope, password) {
  if (!envelope || envelope.format !== 'thiepn-timer-encrypted-backup' || envelope.version !== 1) throw new Error('Unsupported encrypted Timer backup.');
  if (!String(password || '').length) throw new Error('Backup password is required.');
  const ciphertext = base64ToBytes(envelope.ciphertextBase64);
  const checksum = await sha256Hex(ciphertext);
  if (envelope.ciphertextSha256 && checksum !== envelope.ciphertextSha256) throw new Error('Encrypted backup is damaged.');
  const iterations = validateKdfIterations(envelope.kdf?.iterations);
  try {
    const salt = base64ToBytes(envelope.kdf?.saltBase64);
    const iv = base64ToBytes(envelope.cipher?.ivBase64);
    const key = await derivePasswordKey(password, salt, iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(decoder.decode(plaintext));
  } catch {
    throw new Error('Could not decrypt backup. The password may be incorrect or the file may be damaged.');
  }
}

export function isLegacyBackup(value) {
  return value?.format === 'thiepn-timer-backup' && [1, 2, 3, 4].includes(Number(value.version));
}

export function isEncryptedBackup(value) {
  return value?.format === 'thiepn-timer-encrypted-backup';
}

export function isBackupArchive(value) {
  return value?.format === 'thiepn-timer-archive';
}

export function isRoutinePackage(value) {
  return value?.format === 'thiepn-timer-routine-package' && value.version === 1;
}
