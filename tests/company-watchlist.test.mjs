import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const dataModule = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const modelCode = ts.transpileModule(await readFile(new URL('../app/lib/company-watchlist.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const modelUrl = dataModule(modelCode);
const { normalizeCompanyInput, companyKey } = await import(modelUrl);
const storeCode = ts.transpileModule(await readFile(new URL('../app/lib/company-watchlist-store.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('"./company-watchlist"', JSON.stringify(modelUrl));
const storeUrl = dataModule(storeCode);
const store = await import(storeUrl);
const seed = JSON.parse(await readFile(new URL('../app/company-watchlist-seed.json', import.meta.url), 'utf8'));
const research = JSON.parse(await readFile(new URL('../app/company-watchlist-2027-positions.json', import.meta.url), 'utf8'));

function database() {
  const sqlite = new DatabaseSync(':memory:');
  const db = { prepare(sql) {
    let bindings = [];
    const result = { bind(...values) { bindings = values; return result; }, async run() { return sqlite.prepare(sql).run(...bindings); }, async all() { return { results: sqlite.prepare(sql).all(...bindings) }; }, async first() { return sqlite.prepare(sql).get(...bindings) || null; } };
    return result;
  }, async batch(statements) {
    sqlite.exec('BEGIN');
    try { for (const statement of statements) await statement.run(); sqlite.exec('COMMIT'); }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } };
  return { db, sqlite };
}

test('workbook seed preserves 312 company rows and does not invent missing links or dates', () => {
  assert.equal(seed.length, 312);
  assert.equal(new Set(seed.map((row) => companyKey(row.company))).size, 312);
  assert.equal(seed.filter((row) => !row.links.length).length, 97);
  for (const row of seed) { assert.doesNotThrow(() => normalizeCompanyInput(row)); assert.equal(row.lastCheckedAt, undefined); }
});

test('rejects executable URLs and deduplicates links without losing ATS hash paths', () => {
  assert.throws(() => normalizeCompanyInput({ company: 'A', links: [{ label: '', url: 'javascript:alert(1)' }] }));
  assert.throws(() => normalizeCompanyInput({ company: 'A', links: [{ label: '', url: 'https://user:pass@example.org/' }] }));
  const link = { label: '校招', url: 'https://example.org/#/jobs?a=1' };
  assert.deepEqual(normalizeCompanyInput({ company: ' A ', links: [link, link] }), { company: 'A', links: [link] });
});

test('atomic import is idempotent; edits and deletions survive reload; users are isolated', async () => {
  const { db, sqlite } = database();
  try {
    await store.ensureWatchlist(db);
    await store.initializeWatchlist(db, 'a@example.test', seed);
    const initial = await store.listWatchedCompanies(db, 'a@example.test');
    assert.equal(initial.length, 312);
    assert.ok(initial.every((row) => row.lastCheckedAt === null));
    const changed = { company: 'Edited company', links: [{ label: '招聘官网', url: 'https://example.org/careers' }] };
    await store.saveWatchedCompany(db, 'a@example.test', changed, initial[0].id);
    await store.deleteWatchedCompany(db, 'a@example.test', initial[1].id);
    await store.initializeWatchlist(db, 'a@example.test', seed);
    const after = await store.listWatchedCompanies(db, 'a@example.test');
    assert.equal(after.length, 311);
    assert.equal(after.find((row) => row.id === initial[0].id).company, changed.company);
    assert.equal(after.find((row) => row.id === initial[1].id), undefined);
    await assert.rejects(store.saveWatchedCompany(db, 'a@example.test', changed), /已在关注池/);
    await store.deleteWatchedCompany(db, 'b@example.test', initial[0].id);
    await assert.rejects(store.saveWatchedCompany(db, 'b@example.test', changed, initial[0].id), /记录不存在/);
    assert.equal((await store.listWatchedCompanies(db, 'a@example.test')).length, 311);
    assert.equal((await store.listWatchedCompanies(db, 'b@example.test')).length, 0);
  } finally { sqlite.close(); }
});

test('2027 positions merge with existing companies and retain evidence on repeated import', async () => {
  const { db, sqlite } = database();
  try {
    await store.ensureWatchlist(db);
    await store.initializeWatchlist(db, 'a@example.test', seed);
    await store.importResearchPositions(db, 'a@example.test', research);
    let rows = await store.listWatchedCompanies(db, 'a@example.test');
    assert.equal(rows.length, 352);
    assert.equal(rows.reduce((n, row) => n + row.positions.length, 0), 65);
    assert.equal(rows.filter((row) => row.company === '科伦博泰').length, 1);
    const existing = rows.find((row) => row.company === '科伦博泰');
    assert.ok(existing.links.length);
    assert.equal(existing.positions[0].evidenceStatus, '官网岗位在列');
    await store.importResearchPositions(db, 'a@example.test', research);
    rows = await store.listWatchedCompanies(db, 'a@example.test');
    assert.equal(rows.reduce((n, row) => n + row.positions.length, 0), 65);
    assert.equal((await store.listWatchedCompanies(db, 'b@example.test')).length, 0);
  } finally { sqlite.close(); }
});

test('API requires sign-in, rejects cross-origin writes and persists CRUD in SQLite', async () => {
  const { db, sqlite } = database();
  globalThis.watchlistTest = { db, user: null };
  const replacements = {
    'next/server': dataModule('export const NextResponse = Response;'),
    '../../../db': dataModule('export const getD1 = async () => globalThis.watchlistTest.db;'),
    '../../chatgpt-auth': dataModule('export const getChatGPTUser = async () => globalThis.watchlistTest.user;'),
    '../../company-watchlist-seed.json': dataModule(`export default ${JSON.stringify(seed)};`),
    '../../company-watchlist-2027-positions.json': dataModule(`export default ${JSON.stringify(research)};`),
    '../../company-scan-status.json': dataModule('export default [];'),
    '../../lib/company-watchlist-store': storeUrl,
  };
  let code = ts.transpileModule(await readFile(new URL('../app/api/company-watchlist/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replace(JSON.stringify(name), JSON.stringify(url));
  const api = await import(dataModule(code));
  const req = (method, body, origin = 'https://radar.example') => new Request('https://radar.example/api/company-watchlist', { method, headers: { origin, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  try {
    assert.equal((await api.GET(req('GET'))).status, 401);
    globalThis.watchlistTest.user = { email: 'a@example.test' };
    assert.equal((await api.POST(req('POST', { action: 'initialize' }, 'https://other.example'))).status, 403);
    const imported = await api.POST(req('POST', { action: 'initialize' }));
    assert.equal(imported.status, 200);
    assert.equal((await imported.json()).companies.length, 352);
    const added = await api.POST(req('POST', { company: 'New company', links: [] }));
    assert.equal(added.status, 200);
    const row = (await added.json()).companies.find((item) => item.company === 'New company');
    assert.equal((await api.PUT(req('PUT', { ...row, company: 'Renamed company' }))).status, 200);
    assert.equal((await api.DELETE(new Request(`https://radar.example/api/company-watchlist?id=${row.id}`, { method: 'DELETE' }))).status, 200);
    assert.equal((await api.POST(req('POST', { company: '', links: [] }))).status, 400);
  } finally { sqlite.close(); delete globalThis.watchlistTest; }
});
