from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


def sub_once(text: str, pattern: str, replacement: str, label: str, flags=0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return updated


job_path = ROOT / "app" / "job-radar.tsx"
text = job_path.read_text(encoding="utf-8")

text = replace_once(
    text,
    'import { FormEvent, useEffect, useMemo, useState } from "react";',
    'import { FormEvent, useEffect, useMemo, useState } from "react";',
    "react import anchor",
)

pagination_helper = r'''
const JOB_PAGE_SIZE = 20;
const COMPANY_PAGE_SIZE = 20;
const APPLICATION_PAGE_SIZE = 15;

function PaginationControls({
  page,
  pageCount,
  onPageChange,
  label,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="pagination" aria-label={`${label}分页`}>
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>上一页</button>
      <span>第 <strong>{page}</strong> / {pageCount} 页</span>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>下一页</button>
    </nav>
  );
}

'''
text = replace_once(text, "export default function JobRadar() {", pagination_helper + "export default function JobRadar() {", "pagination helper")

text = replace_once(
    text,
    '  const [visibleJobCount, setVisibleJobCount] = useState(20);',
    '  const [jobPage, setJobPage] = useState(1);\n  const [companyPage, setCompanyPage] = useState(1);\n  const [applicationPage, setApplicationPage] = useState(1);\n  const [pendingPage, setPendingPage] = useState(1);',
    "pagination state",
)

# Do not preload application/company/interview support data while the user is on Today.
text = sub_once(
    text,
    r'''  useEffect\(\(\) => \{\n    let active = true;\n    Promise\.all\(\[\n      fetch\("/api/workflow", \{ cache: "no-store" \}\).*?setExperiences\(prep\.experiences \?\? \[\]\);\n    \}\);\n    return \(\) => \{ active = false; \};\n  \}, \[\]\);\n''',
    '''  useEffect(() => {\n    if (view !== "applications") return;\n    let active = true;\n    Promise.all([\n      fetch("/api/workflow", { cache: "no-store" }).then((response) => response.ok ? response.json() : { tasks: [], interviews: [] }),\n      fetch("/api/contacts", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),\n    ]).then(([workflow, contactRows]) => {\n      if (!active) return;\n      setTasks(workflow.tasks ?? []);\n      setInterviews(workflow.interviews ?? []);\n      setContacts(contactRows);\n    });\n    return () => { active = false; };\n  }, [view]);\n\n  useEffect(() => {\n    if (view !== "companies") return;\n    let active = true;\n    Promise.all([\n      fetch("/api/workflow", { cache: "no-store" }).then((response) => response.ok ? response.json() : { tasks: [], interviews: [] }),\n      fetch("/api/company-research", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),\n      fetch("/api/contacts", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),\n      fetch("/api/interview-prep", { cache: "no-store" }).then((response) => response.ok ? response.json() : { experiences: [] }),\n    ]).then(([workflow, research, contactRows, prep]) => {\n      if (!active) return;\n      setTasks(workflow.tasks ?? []);\n      setInterviews(workflow.interviews ?? []);\n      setResearchRows(research);\n      setContacts(contactRows);\n      setExperiences(prep.experiences ?? []);\n    });\n    return () => { active = false; };\n  }, [view]);\n''',
    "lazy auxiliary data",
    flags=re.S,
)

# Poll scanning state only while Today is visible, and stop forcing a giant rerender every second.
text = sub_once(
    text,
    r'''  useEffect\(\(\) => \{\n    const initialTimer = window\.setTimeout\(\(\) => \{\n      void loadScanStatus\(\);\n      void loadChinaScanStatus\(\);\n      void loadChinaScanControl\(\);\n      setClock\(Date\.now\(\)\);\n    \}, 0\);\n    const statusTimer = window\.setInterval\(\(\) => \{\n      void loadScanStatus\(\);\n      void loadChinaScanStatus\(\);\n      void loadChinaScanControl\(\);\n    \}, 15000\);\n    const clockTimer = window\.setInterval\(\(\) => setClock\(Date\.now\(\)\), 1000\);\n    return \(\) => \{\n      window\.clearTimeout\(initialTimer\);\n      window\.clearInterval\(statusTimer\);\n      window\.clearInterval\(clockTimer\);\n    \};\n  \}, \[\]\);''',
    '''  useEffect(() => {\n    if (view !== "today") return;\n    const refreshStatus = () => {\n      void loadScanStatus();\n      void loadChinaScanStatus();\n      void loadChinaScanControl();\n      setClock(Date.now());\n    };\n    const initialTimer = window.setTimeout(refreshStatus, 0);\n    const statusTimer = window.setInterval(refreshStatus, 10000);\n    const clockTimer = window.setInterval(() => setClock(Date.now()), 5000);\n    return () => {\n      window.clearTimeout(initialTimer);\n      window.clearInterval(statusTimer);\n      window.clearInterval(clockTimer);\n    };\n  }, [view]);''',
    "view scoped scan polling",
)

# Applications revalidate when a view that needs them is opened; the tab change itself remains immediate.
text = sub_once(
    text,
    r'''  useEffect\(\(\) => \{\n    let active = true;\n    fetch\("/api/applications", \{ cache: "no-store" \}\)\n      \.then\(\(response\) => \(response\.ok \? response\.json\(\) : \[\]\)\)\n      \.then\(\(rows\) => \{\n        if \(active\) setApplicationsList\(rows\);\n      \}\);\n    return \(\) => \{\n      active = false;\n    \};\n  \}, \[\]\);''',
    '''  useEffect(() => {\n    if (!["saved", "applications", "companies"].includes(view)) return;\n    let active = true;\n    fetch("/api/applications", { cache: "no-store" })\n      .then((response) => (response.ok ? response.json() : []))\n      .then((rows) => {\n        if (active) setApplicationsList(rows);\n      });\n    return () => {\n      active = false;\n    };\n  }, [view]);''',
    "view scoped applications",
)

# Quality automation should not do backend work on every unrelated page load.
text = sub_once(
    text,
    r'''  useEffect\(\(\) => \{\n    let active = true;\n    let nextBatchTimer: number \| undefined;\n    const runAutomation = async \(\) => \{''',
    '''  useEffect(() => {\n    if (view !== "verify") return;\n    let active = true;\n    let nextBatchTimer: number | undefined;\n    const runAutomation = async () => {''',
    "quality automation scope start",
)
# Change only the dependency belonging to the quality automation block (located by its initial timer text).
text = sub_once(
    text,
    r'''(const initialTimer = window\.setTimeout\(\(\) => void runAutomation\(\), 1200\);\n    return \(\) => \{\n      active = false;\n      window\.clearTimeout\(initialTimer\);\n      if \(nextBatchTimer\) window\.clearTimeout\(nextBatchTimer\);\n    \};\n  \}, )\[\]\);''',
    r'''\1[view]);''',
    "quality automation dependency",
)

# Verification requests are only needed on the Verify page.
text = sub_once(
    text,
    r'''  useEffect\(\(\) => \{\n    let active = true;\n    fetch\("/api/job-requests", \{ cache: "no-store" \}\)\n      \.then\(\(response\) => \(response\.ok \? response\.json\(\) : \[\]\)\)\n      \.then\(\(rows\) => \{\n        if \(active\) setRequests\(rows\);\n      \}\);\n    return \(\) => \{\n      active = false;\n    \};\n  \}, \[\]\);''',
    '''  useEffect(() => {\n    if (view !== "verify") return;\n    let active = true;\n    fetch("/api/job-requests", { cache: "no-store" })\n      .then((response) => (response.ok ? response.json() : []))\n      .then((rows) => {\n        if (active) setRequests(rows);\n      });\n    return () => {\n      active = false;\n    };\n  }, [view]);''',
    "view scoped verification requests",
)

# Replace incremental rendering with true page navigation for jobs.
text = replace_once(
    text,
    '''  useEffect(() => {\n    const timer = window.setTimeout(() => setVisibleJobCount(20), 0);\n    return () => window.clearTimeout(timer);\n  }, [track, region, jobSort, view, savedBucket, jobQuery]);\n\n  const visibleJobs = jobs.slice(0, visibleJobCount);''',
    '''  useEffect(() => {\n    const timer = window.setTimeout(() => setJobPage(1), 0);\n    return () => window.clearTimeout(timer);\n  }, [track, region, jobSort, view, savedBucket, jobQuery]);\n\n  const jobPageCount = Math.max(1, Math.ceil(jobs.length / JOB_PAGE_SIZE));\n  const safeJobPage = Math.min(jobPage, jobPageCount);\n  const visibleJobs = jobs.slice((safeJobPage - 1) * JOB_PAGE_SIZE, safeJobPage * JOB_PAGE_SIZE);''',
    "job pagination calculation",
)

text = replace_once(
    text,
    '''            {visibleJobCount < jobs.length && (\n              <button className="load-more-button" onClick={() => setVisibleJobCount((current) => current + 20)}>\n                再显示 20 个岗位 <span>已显示 {visibleJobs.length} / {jobs.length}</span>\n              </button>\n            )}''',
    '''            <PaginationControls page={safeJobPage} pageCount={jobPageCount} onPageChange={setJobPage} label="岗位" />''',
    "job pagination UI",
)

# Company list pagination prevents hundreds of expensive per-company filters from running in one render.
company_anchor = '  }, [companyRecords, companyQuery, companyPriority, companyRegion, companyCollection]);\n\n  const pendingApplications'
company_insert = '''  }, [companyRecords, companyQuery, companyPriority, companyRegion, companyCollection]);\n\n  useEffect(() => {\n    const timer = window.setTimeout(() => setCompanyPage(1), 0);\n    return () => window.clearTimeout(timer);\n  }, [companyQuery, companyPriority, companyRegion, companyCollection]);\n  const companyPageCount = Math.max(1, Math.ceil(companies.length / COMPANY_PAGE_SIZE));\n  const safeCompanyPage = Math.min(companyPage, companyPageCount);\n  const visibleCompanies = companies.slice((safeCompanyPage - 1) * COMPANY_PAGE_SIZE, safeCompanyPage * COMPANY_PAGE_SIZE);\n\n  const pendingApplications'''
text = replace_once(text, company_anchor, company_insert, "company pagination calculation")
text = replace_once(text, '            {companies.map((company) => {', '            {visibleCompanies.map((company) => {', "company paged map")
text = replace_once(
    text,
    '          <p className="result-count">显示 {companies.length} / {companyRecords.length} 条目标公司记录</p>\n          <div className="company-list">',
    '          <p className="result-count">匹配 {companies.length} / {companyRecords.length} 条目标公司记录</p>\n          <PaginationControls page={safeCompanyPage} pageCount={companyPageCount} onPageChange={setCompanyPage} label="公司" />\n          <div className="company-list">',
    "company pagination UI",
)

# Application and pending lists also page locally; opening the tab still uses cached rows while revalidation runs.
application_anchor = '''  const visibleApplications = applicationBucket === "submitted"\n    ? submittedApplications\n    : applicationBucket === "interview"\n      ? interviewingApplications\n      : applicationBucket === "offer"\n        ? offerApplications\n        : rejectedApplications;'''
application_replacement = application_anchor + '''\n  useEffect(() => {\n    const timer = window.setTimeout(() => setApplicationPage(1), 0);\n    return () => window.clearTimeout(timer);\n  }, [applicationBucket]);\n  useEffect(() => {\n    const timer = window.setTimeout(() => setPendingPage(1), 0);\n    return () => window.clearTimeout(timer);\n  }, [savedBucket]);\n  const applicationPageCount = Math.max(1, Math.ceil(visibleApplications.length / APPLICATION_PAGE_SIZE));\n  const safeApplicationPage = Math.min(applicationPage, applicationPageCount);\n  const pagedApplications = visibleApplications.slice((safeApplicationPage - 1) * APPLICATION_PAGE_SIZE, safeApplicationPage * APPLICATION_PAGE_SIZE);\n  const pendingPageCount = Math.max(1, Math.ceil(pendingApplications.length / APPLICATION_PAGE_SIZE));\n  const safePendingPage = Math.min(pendingPage, pendingPageCount);\n  const pagedPendingApplications = pendingApplications.slice((safePendingPage - 1) * APPLICATION_PAGE_SIZE, safePendingPage * APPLICATION_PAGE_SIZE);'''
text = replace_once(text, application_anchor, application_replacement, "application pagination calculation")
text = replace_once(text, '{visibleApplications.map((item) => (', '{pagedApplications.map((item) => (', "application paged map")
text = replace_once(
    text,
    '<div className="application-list">\n              {pagedApplications.map((item) => (',
    '<div className="application-list">\n              <PaginationControls page={safeApplicationPage} pageCount={applicationPageCount} onPageChange={setApplicationPage} label="申请" />\n              {pagedApplications.map((item) => (',
    "application pagination UI",
)
text = replace_once(text, ') : pendingApplications.map((item) => (', ') : pagedPendingApplications.map((item) => (', "pending paged map")
text = replace_once(
    text,
    '<section className="application-list" aria-live="polite">\n              {pendingApplications.length === 0 ? (',
    '<section className="application-list" aria-live="polite">\n              <PaginationControls page={safePendingPage} pageCount={pendingPageCount} onPageChange={setPendingPage} label="待提交申请" />\n              {pendingApplications.length === 0 ? (',
    "pending pagination UI",
)

# Close the application editor immediately after click; reopen only if durable save fails.
text = replace_once(
    text,
    '''    setSaving(true);\n    setMessage("");\n    try {''',
    '''    setSaving(true);\n    setMessage("");\n    setForm(null);\n    try {''',
    "application immediate close",
)
text = replace_once(
    text,
    '''      if (!response.ok) {\n        setMessage("保存失败，请稍后重试。");\n        return;\n      }''',
    '''      if (!response.ok) {\n        setForm(submittedForm);\n        setMessage("保存失败，请稍后重试。");\n        return;\n      }''',
    "application failure restore",
)
text = replace_once(
    text,
    '''      // The application record is already durable at this point. Close the editor immediately;\n      // automatic task creation and a server reconciliation must not block the user's save UI.\n      setForm(null);''',
    '''      // The editor already closed optimistically. Automatic task creation and server\n      // reconciliation stay in the background and never block the perceived save action.''',
    "remove late application close",
)

# Deleting an application should update the visible list immediately and only reconcile on failure.
text = replace_once(
    text,
    '''  const deleteApplication = async (id?: number) => {\n    if (!id || !window.confirm("确定删除这条申请记录吗？")) return;\n    await fetch(`/api/applications?id=${id}`, { method: "DELETE" });\n    await loadApplications();\n  };''',
    '''  const deleteApplication = async (id?: number) => {\n    if (!id || !window.confirm("确定删除这条申请记录吗？")) return;\n    const snapshot = applicationsList;\n    setApplicationsList((current) => current.filter((item) => item.id !== id));\n    const response = await fetch(`/api/applications?id=${id}`, { method: "DELETE" });\n    if (!response.ok) setApplicationsList(snapshot);\n    else if (view === "applications") void loadAnalytics();\n  };''',
    "optimistic application delete",
)

# Task completion is a frequent click: change the checkbox instantly and only reload on failure.
text = replace_once(
    text,
    '''  const toggleTask = async (task: ApplicationTask) => {\n    await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", ...task, status: task.status === "done" ? "pending" : "done" }) });\n    await loadWorkflow();\n  };''',
    '''  const toggleTask = async (task: ApplicationTask) => {\n    const nextStatus = task.status === "done" ? "pending" : "done";\n    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));\n    const response = await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", ...task, status: nextStatus }) });\n    if (!response.ok) await loadWorkflow();\n  };''',
    "optimistic task toggle",
)

job_path.write_text(text, encoding="utf-8")

# Application POST duplicate detection should not load the entire application table on each save.
app_path = ROOT / "app" / "api" / "applications" / "route.ts"
app = app_path.read_text(encoding="utf-8")
app = replace_once(app, 'import { desc, eq } from "drizzle-orm";', 'import { and, desc, eq, or } from "drizzle-orm";', "application drizzle imports")
app = replace_once(
    app,
    '''  const db = await getDb();\n  const rows = await db.select().from(applications);\n  const jobUrl = String(payload.jobUrl ?? "").trim();\n  const incoming = {\n    company: String(payload.company),\n    title: String(payload.title),\n    location: String(payload.location ?? ""),\n    jobUrl,\n    applicationId: String(payload.applicationId ?? ""),\n  };\n  const duplicate = rows.find((row) => sameLogicalJob(row, incoming));''',
    '''  const db = await getDb();\n  const jobUrl = String(payload.jobUrl ?? "").trim();\n  const incoming = {\n    company: String(payload.company),\n    title: String(payload.title),\n    location: String(payload.location ?? ""),\n    jobUrl,\n    applicationId: String(payload.applicationId ?? ""),\n  };\n  const candidateCondition = incoming.applicationId\n    ? or(\n      eq(applications.jobUrl, jobUrl),\n      eq(applications.applicationId, incoming.applicationId),\n      and(eq(applications.company, incoming.company), eq(applications.title, incoming.title)),\n    )\n    : or(\n      eq(applications.jobUrl, jobUrl),\n      and(eq(applications.company, incoming.company), eq(applications.title, incoming.title)),\n    );\n  const rows = await db.select().from(applications).where(candidateCondition);\n  const duplicate = rows.find((row) => sameLogicalJob(row, incoming));''',
    "application candidate query",
)
app_path.write_text(app, encoding="utf-8")

# Avoid rewriting static seed rows on every GET within the same warm worker isolate.
jobs_path = ROOT / "app" / "api" / "jobs" / "route.ts"
jobs = jobs_path.read_text(encoding="utf-8")
seed_pattern = r'''async function seedInitialJobs\(\) \{\n  const db = await getDb\(\);(?P<body>.*?)\n  return db;\n\}'''
match = re.search(seed_pattern, jobs, flags=re.S)
if not match:
    raise RuntimeError("seedInitialJobs function not found")
body = match.group("body")
seed_replacement = '''let initialJobsSeeded = false;\n\nasync function seedInitialJobs() {\n  const db = await getDb();\n  if (initialJobsSeeded) return db;''' + body + '''\n  initialJobsSeeded = true;\n  return db;\n}'''
jobs = jobs[:match.start()] + seed_replacement + jobs[match.end():]
jobs_path.write_text(jobs, encoding="utf-8")

# Compact pagination styles shared by jobs, applications, and companies.
css_path = ROOT / "app" / "globals.css"
css = css_path.read_text(encoding="utf-8")
styles = '''\n\n/* Fast UI v1: compact client-side pagination keeps large lists cheap to render. */\n.pagination {\n  display: flex; align-items: center; justify-content: center; gap: 10px;\n  margin: 12px 0; padding: 6px 0; color: var(--muted); font-size: 11px;\n}\n.pagination button {\n  border: 1px solid var(--line); border-radius: 10px; background: white;\n  color: var(--green-dark); padding: 8px 12px; cursor: pointer; font-weight: 800;\n}\n.pagination button:disabled { opacity: .4; cursor: default; }\n.pagination strong { color: var(--ink); }\n'''
if "/* Fast UI v1:" not in css:
    css += styles
css_path.write_text(css, encoding="utf-8")

# Regression contract for the performance changes.
test_path = ROOT / "tests" / "test_fast_ui_source.py"
test_path.write_text('''import unittest\nfrom pathlib import Path\n\nROOT = Path(__file__).resolve().parents[1]\n\n\nclass FastUiSourceTests(unittest.TestCase):\n    def test_scan_polling_is_view_scoped_and_not_every_second(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('if (view !== "today") return;', source)\n        self.assertIn('window.setInterval(refreshStatus, 10000)', source)\n        self.assertIn('window.setInterval(() => setClock(Date.now()), 5000)', source)\n        self.assertNotIn('window.setInterval(() => setClock(Date.now()), 1000)', source)\n\n    def test_heavy_data_is_loaded_by_view(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('if (view !== "applications") return;', source)\n        self.assertIn('if (view !== "companies") return;', source)\n        self.assertIn('if (view !== "verify") return;', source)\n        self.assertIn('["saved", "applications", "companies"].includes(view)', source)\n\n    def test_large_lists_use_pagination(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('JOB_PAGE_SIZE = 20', source)\n        self.assertIn('COMPANY_PAGE_SIZE = 20', source)\n        self.assertIn('APPLICATION_PAGE_SIZE = 15', source)\n        self.assertIn('PaginationControls', source)\n        self.assertNotIn('setVisibleJobCount', source)\n        self.assertNotIn('再显示 20 个岗位', source)\n\n    def test_common_mutations_are_optimistic(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('setForm(null);\\n    try {', source)\n        self.assertIn('const snapshot = applicationsList;', source)\n        self.assertIn('setTasks((current) => current.map', source)\n\n    def test_application_save_does_not_scan_full_table(self):\n        route = (ROOT / "app" / "api" / "applications" / "route.ts").read_text(encoding="utf-8")\n        self.assertIn('candidateCondition', route)\n        self.assertIn('.where(candidateCondition)', route)\n        self.assertNotIn('const rows = await db.select().from(applications);', route)\n\n    def test_jobs_seed_is_warm_worker_cached(self):\n        route = (ROOT / "app" / "api" / "jobs" / "route.ts").read_text(encoding="utf-8")\n        self.assertIn('let initialJobsSeeded = false;', route)\n        self.assertIn('if (initialJobsSeeded) return db;', route)\n        self.assertIn('initialJobsSeeded = true;', route)\n\n\nif __name__ == "__main__":\n    unittest.main()\n''', encoding="utf-8")

print("Fast UI v1 refactor applied")
