from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "app" / "job-radar.tsx"
text = path.read_text(encoding="utf-8")


def replace_once(old: str, new: str) -> None:
    global text
    if old not in text:
        raise SystemExit(f"missing expected block:\n{old[:240]}")
    text = text.replace(old, new, 1)


replace_once('type SavedBucket = "saved" | "pending";\n', '')
replace_once('  const [savedBucket, setSavedBucket] = useState<SavedBucket>("saved");\n', '')
replace_once('  const [pendingPage, setPendingPage] = useState(1);\n', '  const [savedPage, setSavedPage] = useState(1);\n')

replace_once(
'''function deadlineLabel(deadline: string, type: string) {
  if (type === "rolling") return "滚动招聘，建议尽早申请";
  if (deadline) return deadline;
  return "JD 未公布";
}
''',
'''function deadlineLabel(deadline: string, type: string) {
  if (type === "rolling") return "滚动招聘，建议尽早申请";
  if (deadline) return deadline;
  return "JD 未公布";
}

function normalizeSavedIdentity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9\\u4e00-\\u9fff]+/g, "");
}

function savedApplicationMatchesJob(application: Application, job: Job) {
  if (application.applicationId && job.applicationId && application.applicationId === job.applicationId) return true;
  if (application.jobUrl && job.jobUrl && application.jobUrl === job.jobUrl) return true;
  return normalizeCompanyName(application.company) === normalizeCompanyName(job.company)
    && normalizeSavedIdentity(application.title) === normalizeSavedIdentity(job.title);
}
''')

replace_once(
'          (view !== "saved" || savedBucket !== "saved" || saved.includes(job.id)) &&\n',
'          (view !== "saved" || saved.includes(job.id)) &&\n',
)
replace_once(
'    [dailyJobs, track, region, saved, savedBucket, view, jobSort, jobQuery],\n',
'    [dailyJobs, track, region, saved, view, jobSort, jobQuery],\n',
)
replace_once(
'  }, [track, region, jobSort, view, savedBucket, jobQuery]);\n',
'  }, [track, region, jobSort, view, jobQuery]);\n',
)

replace_once(
'''  useEffect(() => {
    const timer = window.setTimeout(() => setPendingPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [savedBucket]);
''',
'''  useEffect(() => {
    const timer = window.setTimeout(() => setSavedPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [track, region, jobSort, jobQuery, saved, applicationsList]);
''')

replace_once(
'''  const pendingPageCount = Math.max(1, Math.ceil(pendingApplications.length / APPLICATION_PAGE_SIZE));
  const safePendingPage = Math.min(pendingPage, pendingPageCount);
  const pagedPendingApplications = pendingApplications.slice((safePendingPage - 1) * APPLICATION_PAGE_SIZE, safePendingPage * APPLICATION_PAGE_SIZE);
''',
'''  const normalizedSavedQuery = jobQuery.trim().toLocaleLowerCase();
  const filteredPendingApplications = pendingApplications.filter((application) =>
    (track === "全部" || application.track === track)
    && (region === "全部地区" || application.region === region)
    && (!normalizedSavedQuery || [
      application.title,
      application.company,
      application.location,
      application.track,
      application.source,
    ].some((value) => String(value || "").toLocaleLowerCase().includes(normalizedSavedQuery))),
  );
  const savedOnlyJobs = (view === "saved" ? jobs : []).filter((job) =>
    !pendingApplications.some((application) => savedApplicationMatchesJob(application, job)),
  );
  const mergedSavedItems = [
    ...filteredPendingApplications.map((application) => {
      const sortAt = Date.parse(application.updatedAt || application.discoveredDate || "") || 0;
      return {
        kind: "application" as const,
        application,
        sortAt,
        checkedAt: sortAt,
        score: application.fit * 20,
        priority: application.priority === "P1" ? 3 : application.priority === "P2" ? 2 : 1,
      };
    }),
    ...savedOnlyJobs.map((job) => ({
      kind: "job" as const,
      job,
      sortAt: Date.parse(job.discoveredAt) || 0,
      checkedAt: Date.parse(job.checkedAt) || 0,
      score: job.score,
      priority: job.score >= 85 ? 3 : job.score >= 70 ? 2 : 1,
    })),
  ].sort((a, b) => {
    if (jobSort === "newest") return b.sortAt - a.sortAt || b.score - a.score;
    if (jobSort === "checked") return b.checkedAt - a.checkedAt || b.score - a.score;
    if (jobSort === "priority") return b.priority - a.priority || b.sortAt - a.sortAt;
    return b.score - a.score || b.sortAt - a.sortAt;
  });
  const savedPageCount = Math.max(1, Math.ceil(mergedSavedItems.length / APPLICATION_PAGE_SIZE));
  const safeSavedPage = Math.min(savedPage, savedPageCount);
  const pagedSavedItems = mergedSavedItems.slice((safeSavedPage - 1) * APPLICATION_PAGE_SIZE, safeSavedPage * APPLICATION_PAGE_SIZE);
''')

replace_once(
'''      if (savedApplication.status === "准备材料") {
        setView("saved");
        setSavedBucket("pending");
      } else if (savedApplication.status === "撤回" || savedApplication.status === "拒绝") {
''',
'''      if (savedApplication.status === "准备材料") {
        setView("saved");
      } else if (savedApplication.status === "撤回" || savedApplication.status === "拒绝") {
''')

replace_once(
'          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "收藏与待提交" : view === "companies" ? "公司研究与面经" : view === "verify" ? "岗位核验" : view === "profile" ? "个人资料" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>\n',
'          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "候选岗位" : view === "companies" ? "公司研究与面经" : view === "verify" ? "岗位核验" : view === "profile" ? "个人资料" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>\n',
)
replace_once(
'                ? "收藏岗位与已经建立记录但尚未提交的岗位分别管理。"\n',
'                ? "你保存或建立申请记录但尚未投递的岗位，都在同一个列表里统一管理。"\n',
)

stats_block = '''      {view === "saved" && (
        <section className="stats stats-two" aria-label="收藏概览">
          <button className={savedBucket === "saved" ? "active" : ""} onClick={() => setSavedBucket("saved")}><span>收藏</span><strong>{saved.length}</strong><em>已收藏的可申请岗位</em></button>
          <button className={savedBucket === "pending" ? "active" : ""} onClick={() => setSavedBucket("pending")}><span>待提交申请</span><strong>{pendingApplications.length}</strong><em>已记录，尚未提交</em></button>
        </section>
      )}

'''
replace_once(stats_block, '')

replace_once(
'              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? (savedBucket === "saved" ? "我的收藏" : "我的待提交申请") : `今日岗位（${jobs.length}）`}</h2></div>\n',
'              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? `我的候选岗位（${mergedSavedItems.length}）` : `今日岗位（${jobs.length}）`}</h2></div>\n',
)

start_marker = '          {view === "saved" && savedBucket === "pending" ? (\n'
end_marker = '        </>\n      )}\n\n      {view === "ignored"'
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("could not locate saved-list rendering block")

new_render = r'''          {view === "saved" ? (
            <section className="application-list unified-saved-list" aria-live="polite">
              <PaginationControls page={safeSavedPage} pageCount={savedPageCount} onPageChange={setSavedPage} label="候选岗位" />
              {mergedSavedItems.length === 0 ? (
                <div className="empty-state"><span>☆</span><h3>这里还没有候选岗位</h3><p>点星标或建立申请记录后，岗位都会出现在这里。</p></div>
              ) : pagedSavedItems.map((entry) => entry.kind === "application" ? (() => {
                const item = entry.application;
                return (
                  <article className="application-card" key={`application-${item.id}`}>
                    <div className="application-head">
                      <div>{expirationForApplication(item) && <span className="expired-job-label">{expirationForApplication(item)?.status}</span>}<h3>{item.title}</h3><p>{item.company} · {item.location || item.region}</p></div>
                      <span className="priority">{item.priority}</span>
                    </div>
                    <div className="application-details">
                      <span><b>匹配度</b>{item.fit}/5</span>
                      <span><b>Application ID</b>{item.applicationId || "未填写"}</span>
                      <span><b>下一步</b>{item.nextAction || "未填写"}</span>
                      <span><b>计划申请</b>{item.plannedApplicationDate || "未设置"}</span>
                      <span><b>申请截止</b>{deadlineLabel(item.deadline, item.deadlineType)}</span>
                    </div>
                    {item.notes && <p className="record-note">{item.notes}</p>}
                    <div className="record-actions">
                      {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer">打开 JD ↗</a>}
                      <button onClick={() => openTask(item)}>新增任务</button>
                      <button onClick={() => setForm({ ...item })}>编辑记录</button>
                      <button className="danger" onClick={() => deleteApplication(item.id)}>删除</button>
                    </div>
                  </article>
                );
              })() : (() => {
                const job = entry.job;
                return (
                  <article className="job-card" key={`job-${job.id}`}>
                    <div className="job-card-top">
                      <div className="company-logo">{job.company.slice(2, 4)}</div>
                      <div className="job-title">
                        <div className="job-meta"><span>{new Date(job.discoveredAt).toLocaleDateString("zh-CN")}</span><span>{job.track}</span></div>
                        <h3>{job.title}</h3><p>{job.company} · {job.location}</p>
                        {["已过期", "疑似过期"].includes(job.status) && <span className="expired-job-label">{job.status}{job.expirationReason ? ` · ${job.expirationReason}` : ""}</span>}
                      </div>
                      <button className={`save-button ${saved.includes(job.id) ? "saved" : ""}`} onClick={() => toggleSaved(job.id)} aria-label="从候选岗位移除">
                        ★
                      </button>
                    </div>
                    <div className="match-row">
                      <div className="score"><strong>{job.score}</strong><span>{scoreLabel(job.score)}</span></div>
                      <div className="evidence">
                        <strong>{verificationSummary(job)}</strong>
                        <p>{roleSummary(job)}</p>
                        <span>学历要求：{degreeRequirement(job)} · Sponsorship：{sponsorshipLabel(job.visa)} · 截止：{deadlineLabel(job.deadline, job.deadlineType)} · 信息来源：{sourceLabel(job)}</span>
                      </div>
                    </div>
                    {job.skills.length > 0 && (
                      <div className="skills" aria-label="JD 所需技能">
                        {job.skills.map((skill) => <span key={skill}>{skill}</span>)}
                      </div>
                    )}
                    {job.description && (
                      <details className="job-description">
                        <summary>查看采集到的完整 JD</summary>
                        <p>{job.description}</p>
                      </details>
                    )}
                    <div className="card-actions">
                      <a className="secondary job-link" href={job.jobUrl} target="_blank" rel="noreferrer">{sourceLabel(job) === "BOSS直聘" ? "打开 BOSS JD" : "打开官方 JD"} ↗</a>
                      <button className="ignore-button" onClick={() => setIgnoreTarget(job)}>不再显示</button>
                      <button className="primary" onClick={() => openFromJob(job)}>建立申请记录</button>
                    </div>
                  </article>
                );
              })())}
            </section>
          ) : <section className="job-list" aria-live="polite">
            {jobsLoading ? (
              <div className="empty-state"><span>◌</span><h3>正在读取岗位</h3><p>请稍等，正在载入最新核验结果。</p></div>
            ) : jobs.length === 0 ? (
              <div className="empty-state"><span>◎</span><h3>这个筛选下暂时没有已核验岗位</h3><p>点击“立即更新”运行首轮扫描。</p></div>
            ) : visibleJobs.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-card-top">
                  <div className="company-logo">{job.company.slice(2, 4)}</div>
                  <div className="job-title">
                    <div className="job-meta"><span>{new Date(job.discoveredAt).toLocaleDateString("zh-CN")}</span><span>{job.track}</span></div>
                    <h3>{job.title}</h3><p>{job.company} · {job.location}</p>
                    {["已过期", "疑似过期"].includes(job.status) && <span className="expired-job-label">{job.status}{job.expirationReason ? ` · ${job.expirationReason}` : ""}</span>}
                  </div>
                  <button className={`save-button ${saved.includes(job.id) ? "saved" : ""}`} onClick={() => toggleSaved(job.id)} aria-label={saved.includes(job.id) ? "取消收藏" : "收藏岗位"}>
                    {saved.includes(job.id) ? "★" : "☆"}
                  </button>
                </div>
                <div className="match-row">
                  <div className="score"><strong>{job.score}</strong><span>{scoreLabel(job.score)}</span></div>
                  <div className="evidence">
                    <strong>{verificationSummary(job)}</strong>
                    <p>{roleSummary(job)}</p>
                    <span>学历要求：{degreeRequirement(job)} · Sponsorship：{sponsorshipLabel(job.visa)} · 截止：{deadlineLabel(job.deadline, job.deadlineType)} · 信息来源：{sourceLabel(job)}</span>
                  </div>
                </div>
                {job.skills.length > 0 && (
                  <div className="skills" aria-label="JD 所需技能">
                    {job.skills.map((skill) => <span key={skill}>{skill}</span>)}
                  </div>
                )}
                {job.description && (
                  <details className="job-description">
                    <summary>查看采集到的完整 JD</summary>
                    <p>{job.description}</p>
                  </details>
                )}
                <div className="card-actions">
                  <a className="secondary job-link" href={job.jobUrl} target="_blank" rel="noreferrer">{sourceLabel(job) === "BOSS直聘" ? "打开 BOSS JD" : "打开官方 JD"} ↗</a>
                  <button className="ignore-button" onClick={() => setIgnoreTarget(job)}>不再显示</button>
                  <button className="primary" onClick={() => openFromJob(job)}>加入申请追踪</button>
                </div>
              </article>
            ))}
            <PaginationControls page={safeJobPage} pageCount={jobPageCount} onPageChange={setJobPage} label="岗位" />
          </section>}
'''
text = text[:start] + new_render + text[end:]

replace_once(
'        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>收藏</button>\n',
'        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>候选</button>\n',
)

if "savedBucket" in text or "setSavedBucket" in text or "pendingPage" in text or "setPendingPage" in text:
    raise SystemExit("legacy saved/pending bucket references remain")

path.write_text(text, encoding="utf-8")

# The fact-score enhancer should treat the unified candidate page as the host for pending application cards.
fit_path = ROOT / "app" / "pending-application-fit-scores.tsx"
fit = fit_path.read_text(encoding="utf-8")
old = '''function pendingTabIsActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  if (normalized(heroTitle?.textContent || "") !== "收藏与待提交") return false;
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".stats-two button.active"))
    .some((button) => normalized(button.textContent || "").startsWith("待提交申请"));
}
'''
new = '''function pendingTabIsActive() {
  const heroTitle = Array.from(document.querySelectorAll<HTMLElement>(".hero h1"))
    .find((element) => element.offsetParent !== null);
  return normalized(heroTitle?.textContent || "") === "候选岗位";
}
'''
if old not in fit:
    raise SystemExit("pending fact-score active-tab block changed")
fit = fit.replace(old, new, 1)
fit_path.write_text(fit, encoding="utf-8")

# Update the existing regression contract and add a direct unified-list contract.
test_path = ROOT / "tests" / "test_pending_fact_fit_score.py"
test = test_path.read_text(encoding="utf-8")
test = test.replace('        self.assertIn("待提交申请", component)\n', '        self.assertIn("候选岗位", component)\n')
test_path.write_text(test, encoding="utf-8")

unified_test = ROOT / "tests" / "test_unified_candidate_list.py"
unified_test.write_text('''import unittest\nfrom pathlib import Path\n\nROOT = Path(__file__).resolve().parents[1]\n\n\nclass UnifiedCandidateListTests(unittest.TestCase):\n    def test_saved_and_pending_are_one_list_without_bucket_toggle(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('view === "saved" ? "候选岗位"', source)\n        self.assertIn('我的候选岗位（${mergedSavedItems.length}）', source)\n        self.assertIn('mergedSavedItems', source)\n        self.assertIn('savedApplicationMatchesJob', source)\n        self.assertIn('pagedSavedItems', source)\n        self.assertNotIn('type SavedBucket', source)\n        self.assertNotIn('savedBucket', source)\n        self.assertNotIn('stats stats-two" aria-label="收藏概览', source)\n        self.assertNotIn('<b>状态</b>待提交申请', source)\n\n    def test_candidate_list_deduplicates_saved_job_when_application_exists(self):\n        source = (ROOT / "app" / "job-radar.tsx").read_text(encoding="utf-8")\n        self.assertIn('!pendingApplications.some((application) => savedApplicationMatchesJob(application, job))', source)\n        self.assertIn('application.applicationId === job.applicationId', source)\n        self.assertIn('application.jobUrl === job.jobUrl', source)\n\n\nif __name__ == "__main__":\n    unittest.main()\n''', encoding="utf-8")
