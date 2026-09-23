import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  FakeClock, TimerEngine, buildCountdown, buildInterval, buildEmom,
  buildStopwatch, buildAmrap, buildForTime
} from '../src/core.js';
import { TimerDB } from '../src/db.js';
import { SessionOwnershipManager } from '../src/device.js';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);

function seeded(seed) {
  let x = seed | 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

const planFactories = [
  () => buildCountdown({ durationMs: 60000 }),
  () => buildInterval({ workMs: 10000, restMs: 5000, rounds: 6, prepareMs: 2000 }),
  () => buildEmom({ minutes: 8, blockMs: 15000, labels: ['A', 'B'] }),
  () => buildStopwatch(),
  () => buildAmrap({ durationMs: 180000, title: 'AMRAP' }),
  () => buildForTime({ title: 'For Time', timeCapMs: 180000, rounds: 3, movements: [] })
];

test('seeded command fuzz preserves timer invariants across modes', () => {
  for (let seed = 1; seed <= 250; seed++) {
    const random = seeded(seed);
    const clock = new FakeClock(1_000_000, 0);
    const engine = new TimerEngine(clock);
    engine.start(planFactories[seed % planFactories.length]());
    for (let i = 0; i < 120; i++) {
      const advance = Math.floor(random() * 12000);
      clock.advance(advance);
      const op = Math.floor(random() * 11);
      if (op === 0) engine.reconcile();
      else if (op === 1) engine.pause();
      else if (op === 2) engine.resume();
      else if (op === 3) engine.next();
      else if (op === 4) engine.previous();
      else if (op === 5) engine.restart();
      else if (op === 6) engine.adjust(random() < 0.5 ? -5000 : 5000);
      else if (op === 7) engine.completeManual();
      else if (op === 8) engine.addLap();
      else if (op === 9) engine.setData({ fuzz: i });
      else if (op === 10 && random() < 0.025) engine.finish('user-ended');

      const snapshot = engine.snapshot();
      const view = engine.view();
      assert.ok(snapshot && view, `seed ${seed} lost session state`);
      assert.ok(Number.isFinite(engine.elapsedMs()) && engine.elapsedMs() >= 0, `seed ${seed} invalid elapsed time`);
      if (view.current?.remainingMs != null) assert.ok(view.current.remainingMs >= 0, `seed ${seed} negative remaining time`);
      if (snapshot.plan.kind === 'timeline' && snapshot.currentIndex != null) {
        assert.ok(snapshot.currentIndex >= 0 && snapshot.currentIndex <= snapshot.plan.steps.length, `seed ${seed} invalid step index`);
      }
      if (['completed', 'cancelled'].includes(snapshot.status)) break;
    }
  }
});

test('process-loss restore matches uninterrupted countdown after suspension', () => {
  const liveClock = new FakeClock(1_000_000, 0);
  const live = new TimerEngine(liveClock);
  live.start(buildCountdown({ durationMs: 60000 }));
  liveClock.advance(10000);
  const checkpoint = live.snapshot();

  const uninterruptedClock = new FakeClock(1_000_000, 0);
  const uninterrupted = new TimerEngine(uninterruptedClock);
  uninterrupted.start(buildCountdown({ durationMs: 60000 }));
  uninterruptedClock.advance(40000);
  uninterrupted.reconcile();

  const restoredClock = new FakeClock(1_040_000, 0);
  const restored = TimerEngine.restore(checkpoint, restoredClock);
  assert.equal(Math.round(restored.view().current.remainingMs), Math.round(uninterrupted.view().current.remainingMs));
});

test('paused session survives process loss without consuming active workout time', () => {
  const clock = new FakeClock(2_000_000, 0);
  const engine = new TimerEngine(clock);
  engine.start(buildCountdown({ durationMs: 60000 }));
  clock.advance(10000);
  engine.pause();
  const checkpoint = engine.snapshot();

  const restoredClock = new FakeClock(2_030_000, 0);
  const restored = TimerEngine.restore(checkpoint, restoredClock);
  assert.equal(restored.view().status, 'paused');
  assert.equal(restored.elapsedMs(), 10000);
  assert.equal(Math.round(restored.view().current.remainingMs), 50000);
  restored.resume();
  assert.equal(restored.elapsedMs(), 10000);
  assert.equal(restored.snapshot().pausedTotalMs, 20000);
});

test('all historical backup payload versions remain accepted', async () => {
  for (const version of [1, 2, 3, 4]) {
    const db = new TimerDB();
    await db.open();
    const backup = {
      format: 'thiepn-timer-backup', version,
      routines: [], sessions: [], settings: {},
      ...(version >= 2 ? { blocks: [] } : {}),
      ...(version >= 3 ? { cueProfiles: [], customSounds: [] } : {})
    };
    await db.importData(backup, { replace: true });
    assert.deepEqual(await db.all('routines'), []);
  }
});

test('expired ownership lease is recoverable while a live lease is exclusive', async () => {
  let now = 1000;
  const data = new Map();
  const storage = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k)
  };
  const opts = { locks: null, storage, BroadcastChannelCtor: null, now: () => now, leaseMs: 100, refreshMs: 1000 };
  const a = new SessionOwnershipManager({ ...opts, clientId: 'a' });
  const b = new SessionOwnershipManager({ ...opts, clientId: 'b' });
  assert.equal(await a.acquire(), true);
  assert.equal(await b.acquire(), false);
  clearInterval(a._leaseTimer);
  now += 101;
  assert.equal(await b.acquire(), true);
  await a.release(); await b.release();
});

test('production HTML declares a restrictive CSP while preserving browser zoom', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /http-equiv=["']Content-Security-Policy["']/i);
  assert.match(html, /script-src 'self'/i);
  assert.match(html, /object-src 'none'/i);
  assert.match(html, /base-uri 'self'/i);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1/i);
});

test('production JavaScript contains no arbitrary-code execution primitives', () => {
  const src = path.resolve(new URL('../src/', import.meta.url).pathname);
  const files = fs.readdirSync(src).filter((name) => name.endsWith('.js'));
  for (const file of files) {
    const text = fs.readFileSync(path.join(src, file), 'utf8');
    assert.doesNotMatch(text, /\beval\s*\(/, `${file} contains eval()`);
    assert.doesNotMatch(text, /\bnew\s+Function\s*\(/, `${file} contains new Function()`);
    assert.doesNotMatch(text, /document\.write\s*\(/, `${file} contains document.write()`);
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('.'), `${file} imports non-local module ${match[1]}`);
    }
  }
});

test('service-worker shell includes every local application module import', () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const app = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  const sw = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
  const imports = [...app.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)].map((match) => `./src/${match[1].replace(/^\.\//, '')}`);
  for (const imported of imports) assert.ok(sw.includes(`'${imported}'`) || sw.includes(`"${imported}"`), `service worker misses ${imported}`);
});

test('v2.1 persistence source declares multi-runtime schema and singleton migration', () => {
  const dbSource = fs.readFileSync(path.join(repoRoot, 'src/db.js'), 'utf8');
  assert.match(dbSource, /const DB_VERSION = 6/);
  assert.match(dbSource, /createObjectStore\('activeSessions'/);
  assert.match(dbSource, /legacyActive\.get\('current'\)/);
  assert.match(dbSource, /legacyActive\.delete\('current'\)/);
});

test('v2.4 release metadata includes workspace and completion orchestration', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const sw = fs.readFileSync(path.join(repoRoot, 'sw.js'), 'utf8');
  assert.equal(pkg.version, '2.4.0');
  assert.match(sw, /thiepn-timer-v16/);
  assert.match(sw, /\.\/src\/coordinator\.js/);
  assert.match(sw, /\.\/src\/quick\.js/);
  assert.match(sw, /\.\/src\/saved\.js/);
  const app = fs.readFileSync(path.join(repoRoot, 'src/app.js'), 'utf8');
  assert.match(app, /Multi-Timer Workspace/);
  assert.match(app, /workspace-stop-all/);
  assert.match(app, /completionNextRoutineId/);
});
