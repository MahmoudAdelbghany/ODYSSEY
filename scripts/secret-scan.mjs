#!/usr/bin/env node
/**
 * Repository secret scan. Fails if a credential-shaped string, or any value
 * currently held in the local .env, appears in a tracked/untracked source file
 * or in the built client bundle (dist/). Never prints the secret itself.
 *
 *   node scripts/secret-scan.mjs            working tree + dist/
 *   node scripts/secret-scan.mjs --history  every blob reachable from any ref
 *   add --privacy to also report local absolute paths and e-mail addresses
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const patterns = [
  { name: 'OpenCode key', re: /\boc_sk_[A-Za-z0-9_]{12,}/ },
  { name: 'OpenAI-style key', re: /\bsk-[A-Za-z0-9]{24,}/ },
  { name: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];
const envValues = [];
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]*(KEY|TOKEN|SECRET)[A-Z0-9_]*)\s*=\s*(.+)$/);
    if (m && m[3].trim().length >= 12) envValues.push({ name: m[1], value: m[3].trim().replace(/^['"]|['"]$/g, '') });
  }
}
const HISTORY = process.argv.includes('--history');
const PRIVACY = process.argv.includes('--privacy');
const privacy = [
  { name: 'local home path', re: /\/home\/[a-z][a-z0-9_-]+\//i },
  { name: 'e-mail address', re: /\b[A-Za-z0-9._%+-]+@(?!example\.|noreply|users\.noreply)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
];
if (HISTORY) {
  const objects = execFileSync('git', ['rev-list', '--objects', '--all'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean)
    .map((l) => [l.slice(0, 40), l.slice(41)]);
  const found = new Set();
  let scanned = 0;
  for (const [sha, path] of objects) {
    if (!path || /\.(png|jpe?g|webp|bin|mp4|mp3|ttf|woff2?|pdf|sqlite|tif)$/i.test(path)) continue;
    const type = execFileSync('git', ['cat-file', '-t', sha], { cwd: root, encoding: 'utf8' }).trim();
    if (type !== 'blob') continue;
    const size = Number(execFileSync('git', ['cat-file', '-s', sha], { cwd: root, encoding: 'utf8' }).trim());
    if (size > 8_000_000) continue;
    const text = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 });
    scanned += 1;
    for (const p of patterns) if (p.re.test(text)) found.add(`${path}: ${p.name}`);
    for (const v of envValues) if (text.includes(v.value)) found.add(`${path}: value of ${v.name} from .env`);
    if (PRIVACY) for (const p of privacy) if (p.re.test(text)) found.add(`${path}: ${p.name} (privacy)`);
  }
  const secrets = [...found].filter((f) => !f.endsWith('(privacy)'));
  if (PRIVACY) for (const f of [...found].filter((x) => x.endsWith('(privacy)'))) console.log(`  privacy: ${f}`);
  if (secrets.length) {
    console.error(`History secret scan FAILED (${secrets.length}):\n  ${secrets.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`History secret scan passed: ${scanned} historical blobs, ${envValues.length} local secret values checked.`);
  process.exit(0);
}
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !/^(external|\.agents|\.claude)\//.test(f) && !/\.(png|jpe?g|webp|bin|mp4|ttf|woff2?|pdf|sqlite)$/i.test(f));
const walk = (dir) => (existsSync(dir) ? readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)])) : []);
const bundle = walk(join(root, 'dist')).filter((f) => /\.(js|css|html|json|map)$/.test(f)).map((f) => f.slice(root.length));
const findings = [];
for (const file of [...files, ...bundle]) {
  const path = join(root, file);
  if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 5_000_000) continue;
  const text = readFileSync(path, 'utf8');
  for (const p of patterns) if (p.re.test(text)) findings.push(`${file}: ${p.name}`);
  for (const v of envValues) if (text.includes(v.value)) findings.push(`${file}: value of ${v.name} from .env`);
  if (PRIVACY) for (const p of privacy) if (p.re.test(text)) console.log(`  privacy: ${file}: ${p.name}`);
}
if (findings.length) {
  console.error(`Secret scan FAILED (${findings.length}):\n  ${findings.join('\n  ')}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${files.length} source files + ${bundle.length} bundle files, ${envValues.length} local secret values checked.`);
