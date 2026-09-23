import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const fail = (message) => { throw new Error(`Release certification failed: ${message}`); };

const pkg = JSON.parse(read('package.json'));
if (pkg.version !== '2.5.0') fail(`package version is ${pkg.version}, expected 2.5.0`);

const html = read('index.html');
if (!/Content-Security-Policy/i.test(html)) fail('Content Security Policy is missing');
if (!/script-src 'self'/i.test(html) || !/object-src 'none'/i.test(html) || !/base-uri 'self'/i.test(html)) fail('CSP is weaker than release baseline');
if (/user-scalable\s*=\s*no/i.test(html) || /maximum-scale\s*=\s*1/i.test(html)) fail('browser zoom is disabled');

const sw = read('sw.js');
const cacheMatch = sw.match(/const CACHE = 'thiepn-timer-v(\d+)'/);
if (!cacheMatch || Number(cacheMatch[1]) !== 20) fail('service-worker cache generation must be v20');

const app = read('src/app.js');
const appImports = [...app.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)].map((m) => `./src/${m[1].replace(/^\.\//, '')}`);
for (const imported of appImports) {
  if (!sw.includes(`'${imported}'`) && !sw.includes(`"${imported}"`)) fail(`offline shell omits ${imported}`);
}

const manifest = JSON.parse(read('manifest.webmanifest'));
if (manifest.display !== 'standalone') fail('manifest display mode is not standalone');
if (!manifest.start_url || !manifest.scope || !Array.isArray(manifest.icons) || !manifest.icons.length) fail('manifest is incomplete');

const sourceFiles = fs.readdirSync(path.join(root, 'src')).filter((name) => name.endsWith('.js'));
for (const file of sourceFiles) {
  const text = read(`src/${file}`);
  if (/\beval\s*\(/.test(text)) fail(`${file} contains eval()`);
  if (/\bnew\s+Function\s*\(/.test(text)) fail(`${file} contains new Function()`);
  if (/document\.write\s*\(/.test(text)) fail(`${file} contains document.write()`);
  if (/\bTODO\b|\bFIXME\b/.test(text)) fail(`${file} still contains TODO/FIXME markers`);
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) if (!match[1].startsWith('.')) fail(`${file} imports non-local module ${match[1]}`);
}

const shell = [
  'index.html','styles.css','visual-system.css','manifest.webmanifest','icon.svg','icons.svg','sw.js',
  ...sourceFiles.map((name) => `src/${name}`)
];
let gzipBytes = 0;
for (const file of shell) gzipBytes += zlib.gzipSync(fs.readFileSync(path.join(root, file))).length;
if (gzipBytes > 140 * 1024) fail(`release shell ${Math.round(gzipBytes/1024)} KiB gzip exceeds 140 KiB gate`);

for (const required of ['README.md','CHANGELOG.md','RELEASE_SCOPE.md','CERTIFICATION.md','KNOWN_LIMITATIONS.md','.nojekyll']) {
  if (!fs.existsSync(path.join(root, required))) fail(`${required} is missing`);
}

const readme = read('README.md');
if (!readme.includes('Current app version: **2.5.0**')) fail('README does not identify v2.5.0');

console.log('Static release certification: PASS');
console.log(`Version: ${pkg.version}`);
console.log(`Service-worker cache: v${cacheMatch[1]}`);
console.log(`Offline shell gzip sum: ${(gzipBytes/1024).toFixed(1)} KiB`);
console.log(`Local JS modules: ${sourceFiles.length}`);
