import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { buildCustomRoutine } from '../src/core.js';
import { summarizeRange } from '../src/analytics.js';
import { PERFORMANCE_BUDGETS } from '../src/performance.js';

const measure = (name, fn) => {
  const start = performance.now();
  const value = fn();
  const ms = performance.now() - start;
  console.log(`${name}: ${ms.toFixed(2)} ms`);
  return { value, ms };
};

const compile = measure('Compile 1,000 generated steps', () => buildCustomRoutine({
  title: 'Benchmark',
  nodes: [{ id: 'repeat', type: 'repeat', count: 1000, children: [{ id: 'work', type: 'timed', label: 'Work', phase: 'work', durationMs: 1000 }] }]
}));

const base = Date.now();
const sessions = Array.from({ length: 10000 }, (_, i) => ({ id: `s${i}`, title: 'Benchmark', mode: 'interval', startedAt: base - i * 60000, activeDurationMs: 60000, workMs: 40000, restMs: 20000, pausedMs: 0 }));
const analytics = measure('Summarize 10,000 sessions', () => summarizeRange(sessions));


const shellFiles = [
  'index.html','styles.css','visual-system.css','manifest.webmanifest','icon.svg','icons.svg','sw.js',
  'src/core.js','src/db.js','src/audio.js','src/analytics.js','src/resilience.js','src/device.js','src/i18n.js','src/accessibility.js','src/performance.js','src/coordinator.js','src/quick.js','src/saved.js','src/queue.js','src/app.js'
];
const shellGzipBytes = shellFiles.reduce((total, file) => total + zlib.gzipSync(fs.readFileSync(new URL(`../${file}`, import.meta.url))).length, 0);
console.log(`Offline shell gzip sum: ${(shellGzipBytes / 1024).toFixed(1)} KiB`);

const failures = [];
if (compile.ms >= PERFORMANCE_BUDGETS.compile1000StepsMs) failures.push('compile budget');
if (analytics.ms >= PERFORMANCE_BUDGETS.analytics10000SessionsMs) failures.push('analytics budget');
if (shellGzipBytes > 134 * 1024) failures.push('offline shell size budget');
if (failures.length) {
  console.error(`Performance budget failure: ${failures.join(', ')}`);
  process.exitCode = 1;
}
