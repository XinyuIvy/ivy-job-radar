from pathlib import Path
import re


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"anchor not found in {path}: {old[:140]!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


def regex_once(path: str, pattern: str, replacement: str) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"regex anchor count={count} in {path}: {pattern[:140]!r}")
    p.write_text(updated, encoding="utf-8")


radar = "app/job-radar.tsx"
if "useDeferredValue" in Path(radar).read_text(encoding="utf-8"):
    print("Fast Simple v2 already applied")
    raise SystemExit(0)

replace_once(
    radar,
    'import { FormEvent, useEffect, useMemo, useState } from "react";',
    'import { FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";',
)

replace_once(
    radar,
    '''type View = "today" | "saved" | "applications" | "companies" | "verify" | "profile" | "ignored";

const tracks = ["全部", "Technology", "Quant", "Pharma", "Medical Device", "Healthcare AI", "Consulting"];
const sortOptions = [
  { value: "score", label: "匹配度最高" },
  { value: "newest", label: "最新发现" },
  { value: "checked", label: "最近核验" },
  { value: "priority", label: "优先申请岗位" },
] as const;''',
    '''type View = "today" | "saved" | "applications" | "tools" | "companies" | "verify" | "profile" | "ignored";

const tracks = ["全部", "Technology", "Quant", "Pharma", "Medical Device", "Healthcare AI", "Consulting"];
const trackLabels: Record<string, string> = {
  "全部": "全部方向",
  Technology: "数据 / AI",
  Quant: "量化",
  Pharma: "医药 / 生物统计",
  "Medical Device": "医疗器械",
  "Healthcare AI": "医疗 AI",
  Consulting: "咨询",
};
function trackLabel(value: string) {
  return trackLabels[value] || value;
}
const sortOptions = [
  { value: "score", label: "最适合我" },
  { value: "newest", label: "最新发布" },
  { value: "checked", label: "最近核验" },
  { value: "priority", label: "优先岗位" },
] as const;''',
)

replace_once(
    radar,
    '''const JOB_PAGE_SIZE = 20;
const COMPANY_PAGE_SIZE = 20;
const APPLICATION_PAGE_SIZE = 15;''',
    '''const JOB_PAGE_SIZE = 20;
const COMPANY_PAGE_SIZE = 20;
const APPLICATION_PAGE_SIZE = 15;
const JOB_SESSION_CACHE_KEY = "ivy-job-radar:jobs:v2";
const JOB_SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

function readJobSessionCache(): Job[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(JOB_SESSION_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { savedAt?: number; rows?: Job[] };
    if (!parsed.savedAt || Date.now() - parsed.savedAt > JOB_SESSION_CACHE_TTL_MS || !Array.isArray(parsed.rows)) return [];
    return parsed.rows;
  } catch {
    return [];
  }
}

function writeJobSessionCache(rows: Job[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(JOB_SESSION_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
  } catch {}
}''',
)

replace_once(
    radar,
    '''  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const [saved, setSaved] = useState<number[]>([]);''',
    '''  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const deferredJobQuery = useDeferredValue(jobQuery);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [applicationInsightsOpen, setApplicationInsightsOpen] = useState(false);
  const [saved, setSaved] = useState<number[]>([]);''',
)

regex_once(
    radar,
    r'''  useEffect\(\(\) => \{\n    if \(view !== "today"\) return;\n    const refreshStatus = \(\) => \{(.*?)\n  \}, \[view\]\);''',
    r'''  useEffect(() => {
    if (view !== "today" || !scanPanelOpen) return;
    const refreshStatus = () => {\1
  }, [view, scanPanelOpen]);''',
)

replace_once(
    radar,
    '''  useEffect(() => {
    if (view !== "applications") return;
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [view, applicationsList]);''',
    '''  useEffect(() => {
    if (view !== "applications" || !applicationInsightsOpen) return;
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [view, applicationInsightsOpen]);''',
)

replace_once(
    radar,
    '''  useEffect(() => {
    let active = true;
    fetch("/api/ignored-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setIgnoredJobs(rows);
      });
    return () => {
      active = false;
    };
  }, []);''',
    '''  useEffect(() => {
    if (view !== "tools" && view !== "ignored") return;
    let active = true;
    fetch("/api/ignored-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setIgnoredJobs(rows);
      });
    return () => {
      active = false;
    };
  }, [view]);''',
)

replace_once(
    radar,
    '''  useEffect(() => {
    let active = true;
    fetch("/api/jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) {
          setDailyJobs(rows);
          setJobsLoading(false);
        }
      })
      .catch(() => active && setJobsLoading(false));
    return () => {
      active = false;
    };
  }, []);''',
    '''  useEffect(() => {
    let active = true;
    const cachedRows = readJobSessionCache();
    if (cachedRows.length) {
      setDailyJobs(cachedRows);
      setJobsLoading(false);
    }
    fetch("/api/jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active && Array.isArray(rows)) {
          setDailyJobs(rows);
          writeJobSessionCache(rows);
          setJobsLoading(false);
        }
      })
      .catch(() => active && setJobsLoading(false));
    return () => {
      active = false;
    };
  }, []);''',
)

replace_once(radar, "const normalizedQuery = jobQuery.trim().toLowerCase();", "const normalizedQuery = deferredJobQuery.trim().toLowerCase();")
replace_once(radar, "[dailyJobs, track, region, saved, view, jobSort, jobQuery],", "[dailyJobs, track, region, saved, view, jobSort, deferredJobQuery],")
replace_once(radar, "[track, region, jobSort, view, jobQuery]);", "[track, region, jobSort, view, deferredJobQuery]);")
replace_once(radar, "const normalizedSavedQuery = jobQuery.trim().toLocaleLowerCase();", "const normalizedSavedQuery = deferredJobQuery.trim().toLocaleLowerCase();")
replace_once(radar, "[track, region, jobSort, jobQuery, saved, applicationsList]);", "[track, region, jobSort, deferredJobQuery, saved, applicationsList]);")

replace_once(
    radar,
    '          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "候选岗位" : view === "companies" ? "公司研究与面经" : view === "verify" ? "岗位核验" : view === "profile" ? "个人资料" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>',
    '          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "候选岗位" : view === "tools" ? "求职工具" : view === "companies" ? "公司研究" : view === "verify" ? "岗位核验" : view === "profile" ? "个人资料" : view === "ignored" ? "不再推荐" : "今日岗位"}</h1>',
)
replace_once(
    radar,
    '''              : view === "saved"
                ? "你保存或建立申请记录但尚未投递的岗位，都在同一个列表里统一管理。"
              : view === "companies"''',
    '''              : view === "saved"
                ? "保存感兴趣的岗位，在这里定制 CV、准备材料并开始申请。"
              : view === "tools"
                ? "不常用的高级功能集中在这里；日常找工作只需要今日、候选和申请三个页面。"
              : view === "companies"''',
)
replace_once(
    radar,
    '''          <div><strong>{view === "companies" ? "公司与面经" : view === "applications" ? "本月活动" : view === "profile" ? "私有资料" : view === "verify" ? "核验与质检" : "手动更新"}</strong><span>{view === "companies" ? `${companyRecords.length} 家 · ${experiences.length} 条面经` : view === "applications" ? `${calendarEvents.length} 项` : view === "profile" ? "仅你的账户可见" : view === "verify" ? `${requests.length + qualityQueueIssues.length} 条队列记录` : "按需运行"}</span></div>''',
    '''          <div><strong>{view === "companies" ? "公司研究" : view === "applications" ? "申请管理" : view === "tools" ? "高级功能" : view === "profile" ? "私有资料" : view === "verify" ? "核验与质检" : "岗位推荐"}</strong><span>{view === "companies" ? `${companyRecords.length} 家` : view === "applications" ? `${applicationsList.length} 条记录` : view === "tools" ? "按需使用" : view === "profile" ? "仅你的账户可见" : view === "verify" ? `${requests.length + qualityQueueIssues.length} 条队列记录` : `${jobs.length} 个岗位`}</span></div>''',
)

replace_once(
    radar,
    '''      {view === "applications" && (
        <section className="analytics-section" aria-label="申请漏斗和来源成功率">''',
    '''      {view === "applications" && (
        <section className="application-insights-toggle">
          <div><strong>统计与日程</strong><span>漏斗、任务、面试和日历默认收起，让申请列表先显示。</span></div>
          <button type="button" onClick={() => setApplicationInsightsOpen((current) => !current)}>{applicationInsightsOpen ? "收起" : "展开"}</button>
        </section>
      )}

      {view === "applications" && applicationInsightsOpen && (
        <section className="analytics-section" aria-label="申请漏斗和来源成功率">''',
)
replace_once(radar, '      {view === "applications" && (\n        <section className="workflow-section" aria-label="任务与面试日程">', '      {view === "applications" && applicationInsightsOpen && (\n        <section className="workflow-section" aria-label="任务与面试日程">')
replace_once(radar, '      {view === "applications" && (\n        <section className="workspace-section embedded-calendar" aria-label="求职活动日历">', '      {view === "applications" && applicationInsightsOpen && (\n        <section className="workspace-section embedded-calendar" aria-label="求职活动日历">')

replace_once(
    radar,
    '''      {view === "today" && (
        <section className="scan-dashboard" aria-label="岗位扫描入口">''',
    '''      {view === "today" && (
        <section className="quick-update-bar">
          <div><strong>岗位会自动更新</strong><span>{dailyJobs[0]?.checkedAt ? `最近核验 ${new Date(dailyJobs[0].checkedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "打开后会自动读取最新岗位"}</span></div>
          <button type="button" onClick={() => setScanPanelOpen((current) => !current)}>{scanPanelOpen ? "收起更新设置" : "更新岗位"}</button>
        </section>
      )}

      {view === "today" && scanPanelOpen && (
        <section className="scan-dashboard" aria-label="岗位扫描入口">''',
)
replace_once(radar, '<button className="ignored-list-link" onClick={() => setView("ignored")}>忽略名单 {ignoredJobs.length}</button>', '<button className="ignored-list-link" onClick={() => setView("tools")}>更多工具</button>')

old_toolbar = '''          <section className="toolbar">
            <div className="section-heading">
              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? `我的候选岗位（${mergedSavedItems.length}）` : `今日岗位（${jobs.length}）`}</h2></div>
              <div className="job-controls">
                <label className="job-search">
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    value={jobQuery}
                    onChange={(event) => setJobQuery(event.target.value)}
                    placeholder="搜索岗位、公司或技能"
                    aria-label="搜索岗位、公司或技能"
                  />
                </label>
                <select value={jobSort} onChange={(event) => setJobSort(event.target.value as (typeof sortOptions)[number]["value"])} aria-label="岗位排序">
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="地区筛选">
                  <option>全部地区</option><option>美国</option><option>中国</option>
                </select>
              </div>
            </div>
            <div className="track-scroller" aria-label="行业筛选">
              {tracks.map((item) => (
                <button key={item} className={track === item ? "active" : ""} onClick={() => setTrack(item)}>{item}</button>
              ))}
            </div>
          </section>'''
new_toolbar = '''          <section className="toolbar simple-toolbar">
            <div className="section-heading">
              <div><p className="eyebrow">{view === "saved" ? "MY SHORTLIST" : "RECOMMENDED JOBS"}</p><h2>{view === "saved" ? `候选岗位（${mergedSavedItems.length}）` : `推荐岗位（${jobs.length}）`}</h2></div>
            </div>
            <div className="simple-filter-row">
              <label className="job-search">
                <span aria-hidden="true">⌕</span>
                <input type="search" value={jobQuery} onChange={(event) => setJobQuery(event.target.value)} placeholder="搜索公司、岗位或技能" aria-label="搜索公司、岗位或技能" />
              </label>
              <div className="region-chips" aria-label="地区">
                {["全部地区", "美国", "中国"].map((item) => <button type="button" key={item} className={region === item ? "active" : ""} onClick={() => setRegion(item)}>{item === "全部地区" ? "全部" : item}</button>)}
              </div>
              <button type="button" className={`filter-toggle ${filtersOpen ? "active" : ""}`} onClick={() => setFiltersOpen((current) => !current)}>
                筛选{region !== "全部地区" || track !== "全部" || jobSort !== "score" ? " · 已设置" : ""}
              </button>
            </div>
            {filtersOpen && (
              <div className="advanced-filters">
                <label>方向<select value={track} onChange={(event) => setTrack(event.target.value)}>{tracks.map((item) => <option key={item} value={item}>{trackLabel(item)}</option>)}</select></label>
                <label>排序<select value={jobSort} onChange={(event) => setJobSort(event.target.value as (typeof sortOptions)[number]["value"])}>{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                <button type="button" onClick={() => { setTrack("全部"); setRegion("全部地区"); setJobSort("score"); setJobQuery(""); }}>清除筛选</button>
              </div>
            )}
          </section>'''
replace_once(radar, old_toolbar, new_toolbar)
Path(radar).write_text(Path(radar).read_text(encoding="utf-8").replace('<span>{job.track}</span>', '<span>{trackLabel(job.track)}</span>'), encoding="utf-8")

replace_once(
    radar,
    '      {view === "ignored" && (\n',
    '''      {view === "tools" && (
        <section className="tools-section">
          <div className="tool-grid">
            <button type="button" className="tool-card" onClick={() => setView("companies")}><span>⌕</span><strong>公司研究</strong><p>查看公司官网、招聘入口和面经。</p></button>
            <button type="button" className="tool-card" onClick={() => setView("verify")}><span>✓</span><strong>岗位核验</strong><p>手动核验链接和处理数据质量例外。</p></button>
            <a className="tool-card" href="/autofill"><span>↯</span><strong>自动填写</strong><p>管理申请表自动填写资料。</p></a>
            <a className="tool-card" href="/bookmarklet"><span>＋</span><strong>保存岗位按钮</strong><p>安装浏览器一键保存岗位。</p></a>
            <button type="button" className="tool-card" onClick={() => setView("ignored")}><span>×</span><strong>忽略名单</strong><p>恢复之前不想再看到的岗位。</p></button>
          </div>
        </section>
      )}

      {view === "ignored" && (
''',
)
replace_once(radar, '<button className="add-button" onClick={() => setView("today")}>返回今日岗位</button>', '<button className="add-button" onClick={() => setView("tools")}>返回工具</button>')

replace_once(
    radar,
    '''      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "today" ? "selected" : ""} onClick={() => setView("today")}><span>⌂</span>今日</button>
        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>候选</button>
        <button className={view === "applications" ? "selected" : ""} onClick={() => setView("applications")}><span>▤</span>申请</button>
        <button className={view === "companies" ? "selected" : ""} onClick={() => setView("companies")}><span>⌕</span>公司</button>
        <button className={view === "verify" ? "selected" : ""} onClick={() => setView("verify")}><span>✓</span>核验</button>
        <button className={view === "profile" ? "selected" : ""} onClick={() => setView("profile")}><span>♙</span>个人</button>
      </nav>''',
    '''      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "today" ? "selected" : ""} onClick={() => setView("today")}><span>⌂</span>今日</button>
        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>候选</button>
        <button className={view === "applications" ? "selected" : ""} onClick={() => setView("applications")}><span>▤</span>申请</button>
        <button className={["tools", "companies", "verify", "ignored"].includes(view) ? "selected" : ""} onClick={() => setView("tools")}><span>＋</span>工具</button>
        <button className={view === "profile" ? "selected" : ""} onClick={() => setView("profile")}><span>♙</span>我的</button>
      </nav>''',
)

# Accelerate the visible-jobs API.
jobs_route = "app/api/jobs/route.ts"
replace_once(jobs_route, 'import { and, desc, eq, or } from "drizzle-orm";', 'import { and, desc, eq, inArray, or } from "drizzle-orm";')
replace_once(
    jobs_route,
    '''  canonicalizeJobIdentityUrl,
  makeDistinctStoredJobUrl,
  sameLogicalJob,''',
    '''  canonicalizeJobIdentityUrl,
  extractStableJobId,
  isPlaceholderJobTitle,
  jobDisplayIdentityKey,
  makeDistinctStoredJobUrl,
  normalizeJobIdentityText,
  normalizeJobLocation,
  sameLogicalJob,''',
)
replace_once(jobs_route, "let initialJobsSeeded = false;\n", "let initialJobsSeeded = false;\nlet visibleJobsCache: { expiresAt: number; rows: unknown[] } | null = null;\nconst VISIBLE_JOBS_CACHE_MS = 2000;\n")

new_get = '''export async function GET() {
  const nowMs = Date.now();
  if (visibleJobsCache && visibleJobsCache.expiresAt > nowMs) {
    return NextResponse.json(visibleJobsCache.rows);
  }

  const db = await seedInitialJobs();
  const hiddenStatuses = ["准备材料", "已申请", "一面", "二面/技术面", "终面", "Offer", "拒绝"];
  const [ignoredRows, savedRows, hiddenApplications, rows] = await Promise.all([
    db.select({ fingerprint: ignoredJobs.fingerprint }).from(ignoredJobs),
    db.select({ jobId: savedJobs.jobId }).from(savedJobs),
    db.select({
      id: applications.id,
      company: applications.company,
      title: applications.title,
      location: applications.location,
      jobUrl: applications.jobUrl,
      applicationId: applications.applicationId,
    }).from(applications).where(inArray(applications.status, hiddenStatuses)),
    db.select().from(jobs).orderBy(desc(jobs.discoveredAt)),
  ]);
  const ignored = new Set(ignoredRows.map((row) => row.fingerprint));
  const savedIds = new Set(savedRows.map((row) => row.jobId));

  type HiddenApplication = (typeof hiddenApplications)[number];
  const byStableId = new Map<string, HiddenApplication[]>();
  const byRole = new Map<string, HiddenApplication[]>();
  const push = (map: Map<string, HiddenApplication[]>, key: string, value: HiddenApplication) => {
    if (!key) return;
    const bucket = map.get(key);
    if (bucket) bucket.push(value);
    else map.set(key, [value]);
  };
  const roleKey = (value: { company?: string; title?: string }) => {
    if (!value.title || isPlaceholderJobTitle(value.title)) return "";
    const company = normalizeJobIdentityText(value.company);
    const title = normalizeJobIdentityText(value.title);
    return company && title ? `${company}::${title}` : "";
  };
  for (const application of hiddenApplications) {
    push(byStableId, extractStableJobId(application.jobUrl, application.applicationId), application);
    push(byRole, roleKey(application), application);
  }
  const isTrackedApplication = (row: (typeof rows)[number]) => {
    const candidates = new Set<HiddenApplication>();
    for (const application of byStableId.get(extractStableJobId(row.jobUrl, row.applicationId)) ?? []) candidates.add(application);
    for (const application of byRole.get(roleKey(row)) ?? []) candidates.add(application);
    return [...candidates].some((application) => sameLogicalJob(row, application));
  };
  const trackedIds = new Set<number>();
  for (const row of rows) if (isTrackedApplication(row)) trackedIds.add(row.id);

  const filteredRows = rows
    .filter((row) => activeJobStatuses.has(row.status) || savedIds.has(row.id) || trackedIds.has(row.id))
    .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
    .filter((row) => !activeJobStatuses.has(row.status) || !trackedIds.has(row.id))
    .filter((row) => !activeJobStatuses.has(row.status) || !(row.region === "美国" && row.visa === "明确不支持"))
    .filter((row) => !activeJobStatuses.has(row.status) || !isExcludedTitle(row.title))
    .filter((row) => !activeJobStatuses.has(row.status) || row.score >= 55);

  const rank = (candidate: (typeof rows)[number]) =>
    Number(savedIds.has(candidate.id)) * 100
    + Number(candidate.source.includes("手动")) * 30
    + Number(Boolean(candidate.description)) * 10
    + Math.min(10, candidate.skills.length)
    + Math.min(10, candidate.score / 10);
  const uniqueRows = new Map<string, (typeof rows)[number]>();
  const fallbackKeys = new Map<string, string>();
  for (const row of filteredRows) {
    const primaryKey = jobDisplayIdentityKey(row);
    const company = normalizeJobIdentityText(row.company);
    const title = isPlaceholderJobTitle(row.title) ? "" : normalizeJobIdentityText(row.title);
    const location = normalizeJobLocation(row.location);
    const fallbackKey = company && title ? `${company}::${title}::${location}` : "";
    const existingKey = uniqueRows.has(primaryKey) ? primaryKey : (fallbackKey ? fallbackKeys.get(fallbackKey) : undefined);
    if (existingKey) {
      const current = uniqueRows.get(existingKey);
      if (current && sameDisplayedJob(current, row) && rank(row) > rank(current)) uniqueRows.set(existingKey, row);
      continue;
    }
    uniqueRows.set(primaryKey, row);
    if (fallbackKey) fallbackKeys.set(fallbackKey, primaryKey);
  }

  const responseRows = [...uniqueRows.values()].map((row) => ({
    ...row,
    skills: JSON.parse(row.skills || "[]"),
  }));
  visibleJobsCache = { expiresAt: nowMs + VISIBLE_JOBS_CACHE_MS, rows: responseRows };
  return NextResponse.json(responseRows);
}'''
regex_once(jobs_route, r'export async function GET\(\) \{.*?\n\}\n\nexport async function POST', new_get + '\n\nexport async function POST')
replace_once(jobs_route, "export async function POST(request: NextRequest) {\n", "export async function POST(request: NextRequest) {\n  visibleJobsCache = null;\n")

# Make D1 cold starts much cheaper.
db_index = "db/index.ts"
replace_once(db_index, "let schemaInitialization: Promise<void> | null = null;\n", 'let schemaInitialization: Promise<void> | null = null;\nconst RUNTIME_SCHEMA_VERSION = "2026-08-20-fast-simple-v2";\n')
replace_once(
    db_index,
    '''    schemaInitialization = (async () => {
  // Runtime initialization keeps local previews and fresh deployments usable.''',
    '''    schemaInitialization = (async () => {
  // A deployed D1 database is already initialized. One metadata lookup avoids dozens
  // of repeated CREATE/PRAGMA round trips on every new worker isolate.
  try {
    const current = await env.DB.prepare("SELECT value FROM app_meta WHERE key = 'schema_version' LIMIT 1").first<{ value: string }>();
    if (current?.value === RUNTIME_SCHEMA_VERSION) return;
  } catch {}

  // Runtime initialization keeps local previews and fresh deployments usable.''',
)
replace_once(
    db_index,
    '''  const ensureColumn = async (table: string, column: string, definition: string) => {
    const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if (!(result.results ?? []).some((row) => row.name === column)) {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  };''',
    '''  const knownColumns = new Map<string, Set<string>>();
  const ensureColumn = async (table: string, column: string, definition: string) => {
    let columns = knownColumns.get(table);
    if (!columns) {
      const result = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
      columns = new Set((result.results ?? []).map((row) => row.name));
      knownColumns.set(table, columns);
    }
    if (!columns.has(column)) {
      await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      columns.add(column);
    }
  };''',
)
replace_once(
    db_index,
    '''  await ensureColumn("scan_status", "progress_updated_at", "TEXT NOT NULL DEFAULT ''");

  await env.DB.prepare(`''',
    '''  await ensureColumn("scan_status", "progress_updated_at", "TEXT NOT NULL DEFAULT ''");

  await env.DB.batch([
    env.DB.prepare("CREATE INDEX IF NOT EXISTS applications_status_updated_idx ON applications (status, updated_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS applications_job_url_idx ON applications (job_url)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS applications_application_id_idx ON applications (application_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS jobs_status_discovered_idx ON jobs (status, discovered_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS jobs_region_track_score_idx ON jobs (region, track, score DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS jobs_application_id_idx ON jobs (application_id)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS jobs_canonical_url_idx ON jobs (canonical_url)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS jobs_checked_at_idx ON jobs (checked_at DESC)"),
  ]);

  await env.DB.prepare(`''',
)
replace_once(
    db_index,
    '''  // Existing records start their auditable history at their current stage.
  await env.DB.prepare(`
    INSERT INTO application_status_events (application_id, status, occurred_at)
    SELECT applications.id, applications.status, applications.updated_at
    FROM applications
    WHERE NOT EXISTS (
      SELECT 1
      FROM application_status_events
      WHERE application_status_events.application_id = applications.id
    )
  `).run();

    })().catch((error) => {''',
    '''  // Existing records start their auditable history at their current stage.
  await env.DB.prepare(`
    INSERT INTO application_status_events (application_id, status, occurred_at)
    SELECT applications.id, applications.status, applications.updated_at
    FROM applications
    WHERE NOT EXISTS (
      SELECT 1
      FROM application_status_events
      WHERE application_status_events.application_id = applications.id
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `).run();
  await env.DB.prepare(`
    INSERT INTO app_meta (key, value) VALUES ('schema_version', ?1)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).bind(RUNTIME_SCHEMA_VERSION).run();

    })().catch((error) => {''',
)

css = Path("app/globals.css")
css.write_text(
    css.read_text(encoding="utf-8")
    + r'''

/* Fast Simple v2: progressive disclosure for first-time users. */
.quick-update-bar,.application-insights-toggle{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 18px;padding:13px 15px;border:1px solid var(--line);border-radius:15px;background:rgba(255,255,255,.78)}
.quick-update-bar div,.application-insights-toggle div{display:grid;gap:3px}.quick-update-bar strong,.application-insights-toggle strong{font-size:12px}.quick-update-bar span,.application-insights-toggle span{color:var(--muted);font-size:10px;line-height:1.45}
.quick-update-bar button,.application-insights-toggle button,.filter-toggle{border:1px solid var(--line);border-radius:10px;background:white;color:var(--green-dark);padding:9px 12px;font-weight:800;font-size:11px;cursor:pointer;white-space:nowrap}
.simple-toolbar .section-heading{margin-bottom:10px}.simple-filter-row{display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;align-items:center}.simple-filter-row .job-search{min-width:0}
.region-chips{display:flex;gap:5px;padding:3px;border:1px solid var(--line);border-radius:11px;background:rgba(255,255,255,.72)}.region-chips button{border:0;border-radius:8px;background:transparent;padding:7px 10px;color:var(--muted);font-size:10px;font-weight:800;cursor:pointer}.region-chips button.active{background:var(--green-dark);color:white}.filter-toggle.active{background:#edf7f1;border-color:#b9d9c8}
.advanced-filters{display:flex;align-items:end;gap:10px;margin-top:10px;padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(255,255,255,.7)}.advanced-filters label{display:grid;gap:5px;color:var(--muted);font-size:10px;font-weight:800}.advanced-filters select{min-width:150px;border:1px solid var(--line);border-radius:9px;background:white;padding:8px 10px}.advanced-filters>button{margin-left:auto;border:0;background:transparent;color:var(--green);font-size:10px;font-weight:800;cursor:pointer}
.tools-section{padding:2px 0 30px}.tool-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tool-card{min-width:0;display:grid;grid-template-columns:34px 1fr;grid-template-rows:auto auto;column-gap:11px;text-align:left;text-decoration:none;border:1px solid var(--line);border-radius:18px;background:white;padding:17px;color:var(--ink);cursor:pointer}.tool-card>span{grid-row:1/3;width:34px;height:34px;display:grid;place-items:center;border-radius:10px;background:var(--mint);color:var(--green-dark);font-weight:900}.tool-card strong{font-size:13px}.tool-card p{margin:4px 0 0;color:var(--muted);font-size:10px;line-height:1.5}.tool-card:hover{border-color:#b8cbc0;box-shadow:0 8px 24px rgba(37,62,52,.06)}
@media(max-width:700px){.simple-filter-row{grid-template-columns:1fr auto}.simple-filter-row .job-search{grid-column:1/-1}.region-chips{justify-self:start}.advanced-filters{align-items:stretch;flex-direction:column}.advanced-filters select{width:100%}.advanced-filters>button{margin-left:0;align-self:flex-start}.tool-grid{grid-template-columns:1fr}.quick-update-bar,.application-insights-toggle{align-items:flex-start}}
''',
    encoding="utf-8",
)

print("Fast Simple v2 patch applied")
