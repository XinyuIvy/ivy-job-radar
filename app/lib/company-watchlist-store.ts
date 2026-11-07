import { companyKey, normalizeCompanyInput, type WatchedCompany, type WatchedPosition } from "./company-watchlist";

interface Statement {
  bind(...values: (string | number | null)[]): Statement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results?: T[] }>;
  first<T>(): Promise<T | null>;
}
export interface WatchlistDb { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<unknown> }

export async function ensureWatchlist(db: WatchlistDb) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS company_watchlist (
      id TEXT NOT NULL, user_email TEXT NOT NULL, company TEXT NOT NULL, company_key TEXT NOT NULL,
      links_json TEXT NOT NULL DEFAULT '[]', last_checked_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (user_email, id), UNIQUE (user_email, company_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS company_watchlist_imports (
      user_email TEXT NOT NULL, import_key TEXT NOT NULL, imported_at TEXT NOT NULL,
      PRIMARY KEY (user_email, import_key)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS company_watchlist_positions (
      user_email TEXT NOT NULL, company_key TEXT NOT NULL, title_key TEXT NOT NULL,
      position_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY (user_email, company_key, title_key)
    )`),
  ]);
  const columns = await db.prepare("PRAGMA table_info(company_watchlist)").all<{ name: string }>();
  const names = new Set((columns.results || []).map((column) => column.name));
  if (!names.has("scan_status")) await db.prepare("ALTER TABLE company_watchlist ADD COLUMN scan_status TEXT NOT NULL DEFAULT ''").run();
  if (!names.has("scan_note")) await db.prepare("ALTER TABLE company_watchlist ADD COLUMN scan_note TEXT NOT NULL DEFAULT ''").run();
}

// The import marker, company inserts, link enrichment and position inserts share
// one D1 batch. Reopening the page will not duplicate roles or undo edits.
export async function importResearchPositions(db: WatchlistDb, email: string, seed: Array<{ company: string; links: { label: string; url: string }[]; positions: WatchedPosition[] }>) {
  const key = "china-2027-stat-ai-research-2026-09-23-v1";
  const imported = await db.prepare("SELECT 1 AS done FROM company_watchlist_imports WHERE user_email=? AND import_key=?").bind(email, key).first<{ done: number }>();
  if (imported) return;
  const now = new Date().toISOString();
  const companies = seed.map((item) => ({ ...normalizeCompanyInput(item), key: companyKey(item.company), id: crypto.randomUUID() }));
  const positions = seed.flatMap((item) => item.positions.map((position) => ({
    companyKey: companyKey(item.company), titleKey: companyKey(position.title), position,
  })));
  const statements: Statement[] = [
    db.prepare(`INSERT INTO company_watchlist (id,user_email,company,company_key,links_json,created_at,updated_at)
      SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.company'), json_extract(value,'$.key'),
      json_extract(value,'$.links'), ?, ? FROM json_each(?) WHERE true
      ON CONFLICT(user_email,company_key) DO NOTHING`).bind(email, now, now, JSON.stringify(companies)),
  ];
  for (const item of companies) for (const link of item.links) statements.push(
    db.prepare(`UPDATE company_watchlist SET links_json=json_insert(links_json,'$[#]',json(?)), updated_at=?
      WHERE user_email=? AND company_key=? AND json_array_length(links_json)<10
      AND NOT EXISTS (SELECT 1 FROM json_each(links_json) WHERE json_extract(value,'$.url')=?)`)
      .bind(JSON.stringify(link), now, email, item.key, new URL(link.url).href)
  );
  statements.push(
    db.prepare(`INSERT INTO company_watchlist_positions (user_email,company_key,title_key,position_json,created_at)
      SELECT ?, json_extract(value,'$.companyKey'), json_extract(value,'$.titleKey'),
      json_extract(value,'$.position'), ? FROM json_each(?) WHERE true
      ON CONFLICT(user_email,company_key,title_key) DO NOTHING`).bind(email, now, JSON.stringify(positions)),
    db.prepare("INSERT OR IGNORE INTO company_watchlist_imports (user_email,import_key,imported_at) VALUES (?,?,?)").bind(email, key, now),
  );
  await db.batch(statements);
}

export async function initializeWatchlist(db: WatchlistDb, email: string, seed: unknown[]) {
  const prepared = seed.map((item) => {
    const value = normalizeCompanyInput(item);
    return { ...value, key: companyKey(value.company), id: crypto.randomUUID() };
  });
  const key = "china-company-list-2026-09-v1";
  const now = new Date().toISOString();
  // One atomic batch: retries neither overwrite edits nor resurrect deletions.
  await db.batch([
    db.prepare(`INSERT INTO company_watchlist
      (id,user_email,company,company_key,links_json,created_at,updated_at)
      SELECT json_extract(value,'$.id'), ?, json_extract(value,'$.company'), json_extract(value,'$.key'), json_extract(value,'$.links'), ?, ?
      FROM json_each(?) WHERE NOT EXISTS (
        SELECT 1 FROM company_watchlist_imports WHERE user_email=? AND import_key=?
      ) ON CONFLICT(user_email,company_key) DO NOTHING`).bind(email, now, now, JSON.stringify(prepared), email, key),
    db.prepare("INSERT OR IGNORE INTO company_watchlist_imports (user_email,import_key,imported_at) VALUES (?,?,?)").bind(email, key, now),
  ]);
}

export async function syncWatchlistScanResults(db: WatchlistDb, email: string, seed: unknown[]) {
  const key = "company-scan-2026-09-23-v1";
  const imported = await db.prepare(
    "SELECT 1 AS present FROM company_watchlist_imports WHERE user_email=? AND import_key=?",
  ).bind(email, key).first<{ present: number }>();
  if (imported) return;

  const now = new Date().toISOString();
  const existingCompanyNames: Record<string, string> = {
    "费森尤斯卡比": "费森尤斯卡比（Fresenius Kabi）",
    "IQVIA": "艾昆纬（IQVIA）",
    "美敦力": "美敦力（Medtronic）",
    "卫材": "卫材（Eisai）",
    "辉瑞": "辉瑞（Pfizer）",
    "百济神州": "百济神州（BeOne Medicines）",
    "强生": "强生创新制药（Johnson & Johnson）",
    "勃林格殷格翰": "勃林格殷格翰（Boehringer Ingelheim）",
    "丹纳赫": "丹纳赫（Danaher）",
    "阿斯利康": "阿斯利康（AstraZeneca）",
    "达能": "达能（Danone）",
    "宝洁": "宝洁（P&G）",
    "GE医疗": "GE医疗（GE HealthCare）",
    "礼来": "礼来（Eli Lilly）",
    "雅诗兰黛": "雅诗兰黛（Estée Lauder）",
    "雀巢": "雀巢（Nestlé）",
    "波士顿科学": "波士顿科学（Boston Scientific）",
  };
  const statements = seed.map((item) => {
    const row = item as Record<string, unknown>;
    const scanCompany = String(row.company || "").trim();
    const company = existingCompanyNames[scanCompany] || scanCompany;
    const careersUrl = String(row.careersUrl || "").trim();
    const recentNotes = String(row.recentNotes || "").trim();
    const status = recentNotes.match(/^\[([^\]]+)\]/)?.[1] || "已扫描";
    const note = recentNotes.replace(/^\[[^\]]+\]\s*/, "");
    const checkedAt = String(row.updatedAt || now);
    const links = careersUrl ? [{ label: "招聘入口", url: careersUrl }] : [];
    return db.prepare(`INSERT INTO company_watchlist
      (id,user_email,company,company_key,links_json,last_checked_at,scan_status,scan_note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(user_email,company_key) DO UPDATE SET
        links_json=CASE WHEN company_watchlist.links_json='[]' THEN excluded.links_json ELSE company_watchlist.links_json END,
        scan_status=excluded.scan_status,
        scan_note=excluded.scan_note,
        last_checked_at=excluded.last_checked_at,
        updated_at=excluded.updated_at`)
      .bind(crypto.randomUUID(), email, company, companyKey(company), JSON.stringify(links), checkedAt, status, note, now, now);
  });
  statements.push(
    db.prepare("INSERT OR IGNORE INTO company_watchlist_imports (user_email,import_key,imported_at) VALUES (?,?,?)")
      .bind(email, key, now),
  );
  await db.batch(statements);
}

export async function listWatchedCompanies(db: WatchlistDb, email: string): Promise<WatchedCompany[]> {
  const [rows, roles] = await Promise.all([
    db.prepare("SELECT id,company,company_key,links_json,last_checked_at,scan_status,scan_note FROM company_watchlist WHERE user_email=? ORDER BY created_at,company,id").bind(email)
      .all<{ id: string; company: string; company_key: string; links_json: string; last_checked_at: string | null; scan_status: string; scan_note: string }>(),
    db.prepare("SELECT company_key,position_json FROM company_watchlist_positions WHERE user_email=? ORDER BY created_at,title_key").bind(email)
      .all<{ company_key: string; position_json: string }>(),
  ]);
  const byCompany = new Map<string, WatchedPosition[]>();
  for (const row of roles.results || []) byCompany.set(row.company_key, [...(byCompany.get(row.company_key) || []), JSON.parse(row.position_json)]);
  return (rows.results || []).map((row) => ({
    id: row.id,
    company: row.company,
    links: JSON.parse(row.links_json),
    lastCheckedAt: row.last_checked_at,
    positions: byCompany.get(row.company_key) || [],
    scanStatus: row.scan_status || "",
    scanNote: row.scan_note || "",
  }));
}

export async function saveWatchedCompany(db: WatchlistDb, email: string, input: unknown, id?: string) {
  const value = normalizeCompanyInput(input);
  const existing = await db.prepare("SELECT id FROM company_watchlist WHERE user_email=? AND company_key=?").bind(email, companyKey(value.company)).first<{ id: string }>();
  if (existing && existing.id !== id) throw new Error("这家公司已在关注池中，请编辑已有记录。");
  if (id) {
    const row = await db.prepare("SELECT id,company_key FROM company_watchlist WHERE user_email=? AND id=?").bind(email, id).first<{ id: string; company_key: string }>();
    if (!row) throw new Error("记录不存在，请刷新列表。");
    await db.batch([
      db.prepare(`UPDATE company_watchlist SET company=?,company_key=?,
      last_checked_at=CASE WHEN links_json=? THEN last_checked_at ELSE NULL END,
      links_json=?,updated_at=? WHERE user_email=? AND id=?`)
        .bind(value.company, companyKey(value.company), JSON.stringify(value.links), JSON.stringify(value.links), new Date().toISOString(), email, id),
      db.prepare("UPDATE company_watchlist_positions SET company_key=? WHERE user_email=? AND company_key=?")
        .bind(companyKey(value.company), email, row.company_key),
    ]);
  } else {
    await db.prepare("INSERT INTO company_watchlist (id,user_email,company,company_key,links_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), email, value.company, companyKey(value.company), JSON.stringify(value.links), new Date().toISOString(), new Date().toISOString()).run();
  }
}

export async function deleteWatchedCompany(db: WatchlistDb, email: string, id: string) {
  const row = await db.prepare("SELECT company_key FROM company_watchlist WHERE user_email=? AND id=?").bind(email, id).first<{ company_key: string }>();
  if (!row) return;
  await db.batch([
    db.prepare("DELETE FROM company_watchlist_positions WHERE user_email=? AND company_key=?").bind(email, row.company_key),
    db.prepare("DELETE FROM company_watchlist WHERE user_email=? AND id=?").bind(email, id),
  ]);
}
