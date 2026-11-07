import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Capture reviewed source files only; never read runtime secrets or environment files.
const roots = ['app', 'db', 'scripts', 'tests', 'browser-extension', 'local-collector', 'worker', '.github/workflows', 'drizzle'];
const files = {};
function visit(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) { if (!/node_modules|dist|__pycache__|\.git$/.test(name)) visit(name); continue; }
    if (!/\.(tsx?|m?js|py|sql|ya?ml)$/.test(name) || name.startsWith('app/project-walkthrough/') || name.startsWith('app/api/project-walkthrough/')) continue;
    const content = fs.readFileSync(name, 'utf8');
    files[name] = { content, sha256: crypto.createHash('sha256').update(content).digest('hex') };
  }
}
roots.forEach(visit);
for (const name of ['middleware.ts', 'vite.config.ts', 'package.json', 'requirements-jobscan.txt', 'browser-extension/manifest.json', 'config/job-ingestion.schema.json', 'docs/UNIFIED_ETL.md']) {
  if (fs.existsSync(name)) { const content = fs.readFileSync(name, 'utf8'); files[name] = { content, sha256: crypto.createHash('sha256').update(content).digest('hex') }; }
}
const snapshot = { capturedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), files };
fs.writeFileSync('app/project-walkthrough/source-snapshot.json', JSON.stringify(snapshot));
console.log(`Captured ${Object.keys(files).length} source files; no environment files included.`);
