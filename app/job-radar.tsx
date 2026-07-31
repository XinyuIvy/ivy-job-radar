"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import companyPool from "./company-pool.json";

type Job = {
  id: number;
  company: string;
  title: string;
  location: string;
  region: "美国" | "中国";
  track: string;
  score: number;
  visa: string;
  evidence: string;
  skills: string[];
  jobUrl: string;
  applicationId: string;
  source: string;
  discoveredAt: string;
  checkedAt: string;
};

type Company = (typeof companyPool)[number];

type Application = {
  id?: number;
  company: string;
  title: string;
  region: string;
  location: string;
  track: string;
  jobUrl: string;
  applicationId: string;
  source: string;
  fit: number;
  interest: number;
  priority: string;
  status: string;
  discoveredDate: string;
  appliedDate: string;
  followUpDate: string;
  nextAction: string;
  resumeVersion: string;
  workAuthorization: string;
  interviewNotes: string;
  notes: string;
  updatedAt?: string;
};

type JobRequest = {
  id?: number;
  company: string;
  title: string;
  jobUrl: string;
  notes: string;
  status: string;
  verificationNote: string;
  createdAt?: string;
  updatedAt?: string;
};

type IgnoredJob = {
  id: number;
  company: string;
  title: string;
  jobUrl: string;
  reason: string;
  createdAt: string;
};

const tracks = ["全部", "Technology", "Quant", "Pharma", "Medical Device", "Healthcare AI", "Consulting"];
const sortOptions = [
  { value: "score", label: "匹配度最高" },
  { value: "newest", label: "最新发现" },
  { value: "checked", label: "最近核验" },
  { value: "priority", label: "优先申请岗位" },
] as const;
const statuses = ["待研究", "已收藏", "准备材料", "已申请", "HR筛选", "一面", "二面/技术面", "终面", "Offer", "拒绝", "撤回"];
const emptyApplication: Application = {
  company: "",
  title: "",
  region: "美国",
  location: "",
  track: "",
  jobUrl: "",
  applicationId: "",
  source: "公司官网",
  fit: 3,
  interest: 3,
  priority: "P2",
  status: "已收藏",
  discoveredDate: new Date().toISOString().slice(0, 10),
  appliedDate: "",
  followUpDate: "",
  nextAction: "研究JD",
  resumeVersion: "",
  workAuthorization: "需要H-1B Sponsorship",
  interviewNotes: "",
  notes: "",
};

const emptyRequest: JobRequest = {
  company: "",
  title: "",
  jobUrl: "",
  notes: "",
  status: "待核验",
  verificationNote: "",
};

function normalizeTrack(track: string) {
  return track.replace(/^\d+\s*/, "");
}

function scoreLabel(score: number) {
  if (score >= 85) return "优先申请";
  if (score >= 70) return "值得申请";
  if (score >= 55) return "选择性申请";
  return "不建议";
}

export default function JobRadar() {
  const [view, setView] = useState<"today" | "saved" | "applications" | "companies" | "verify" | "ignored">("today");
  const [track, setTrack] = useState("全部");
  const [region, setRegion] = useState("全部地区");
  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [saved, setSaved] = useState<number[]>([]);
  const [dailyJobs, setDailyJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [applicationsList, setApplicationsList] = useState<Application[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyPriority, setCompanyPriority] = useState("全部");
  const [companyRegion, setCompanyRegion] = useState("全部地区");
  const [form, setForm] = useState<Application | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [requests, setRequests] = useState<JobRequest[]>([]);
  const [requestForm, setRequestForm] = useState<JobRequest>(emptyRequest);
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [ignoredJobs, setIgnoredJobs] = useState<IgnoredJob[]>([]);
  const [ignoreTarget, setIgnoreTarget] = useState<Job | null>(null);
  const [ignoreSaving, setIgnoreSaving] = useState(false);

  const loadApplications = async () => {
    const response = await fetch("/api/applications", { cache: "no-store" });
    if (response.ok) setApplicationsList(await response.json());
  };

  useEffect(() => {
    let active = true;
    fetch("/api/applications", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setApplicationsList(rows);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadIgnoredJobs = async () => {
    const response = await fetch("/api/ignored-jobs", { cache: "no-store" });
    if (response.ok) setIgnoredJobs(await response.json());
  };

  useEffect(() => {
    let active = true;
    fetch("/api/ignored-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setIgnoredJobs(rows);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshJobs = async () => {
    setJobsRefreshing(true);
    setJobsMessage("正在扫描公司公开招聘接口…");
    const response = await fetch("/api/jobs", { method: "POST" });
    if (response.ok) {
      const result = await response.json();
      setJobsMessage(`已扫描 ${result.scanned} 个岗位，筛出 ${result.matched} 个候选岗位。`);
      const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
      if (jobsResponse.ok) setDailyJobs(await jobsResponse.json());
    } else {
      setJobsMessage("本次扫描失败，请稍后重试。");
    }
    setJobsRefreshing(false);
  };

  useEffect(() => {
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
  }, []);

  const loadRequests = async () => {
    const response = await fetch("/api/job-requests", { cache: "no-store" });
    if (response.ok) setRequests(await response.json());
  };

  useEffect(() => {
    let active = true;
    fetch("/api/job-requests", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setRequests(rows);
      });
    return () => {
      active = false;
    };
  }, []);

  const jobs = useMemo(
    () => {
      const filtered = dailyJobs.filter(
        (job) =>
          (track === "全部" || job.track === track) &&
          (region === "全部地区" || job.region === region) &&
          (view !== "saved" || saved.includes(job.id)),
      );

      return [...filtered].sort((a, b) => {
        const newestFirst = new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
        const recentlyCheckedFirst = new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime();

        if (jobSort === "newest") return newestFirst || b.score - a.score;
        if (jobSort === "checked") return recentlyCheckedFirst || b.score - a.score;
        if (jobSort === "priority") {
          const priorityDifference = Number(b.score >= 85) - Number(a.score >= 85);
          return priorityDifference || newestFirst || b.score - a.score;
        }
        return b.score - a.score || newestFirst;
      });
    },
    [dailyJobs, track, region, saved, view, jobSort],
  );

  const companies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase();
    return companyPool.filter((company) => {
      const searchable = `${company.company} ${company.keywords} ${company.companyType} ${company.track}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (companyPriority === "全部" || company.priority === companyPriority) &&
        (companyRegion === "全部地区" || company.region === companyRegion)
      );
    });
  }, [companyQuery, companyPriority, companyRegion]);

  const appliedCount = applicationsList.filter((item) =>
    ["已申请", "HR筛选", "一面", "二面/技术面", "终面", "Offer"].includes(item.status),
  ).length;
  const interviewingCount = applicationsList.filter((item) =>
    ["HR筛选", "一面", "二面/技术面", "终面"].includes(item.status),
  ).length;
  const offerCount = applicationsList.filter((item) => item.status === "Offer").length;

  const toggleSaved = (id: number) => {
    setSaved((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const openFromJob = (job: Job) => {
    setForm({
      ...emptyApplication,
      company: job.company,
      title: job.title,
      region: job.region,
      location: job.location,
      track: job.track,
      jobUrl: job.jobUrl,
      applicationId: job.applicationId,
      source: job.source,
      fit: Math.max(1, Math.min(5, Math.round(job.score / 20))),
      workAuthorization: job.region === "美国" ? `Sponsorship：${job.visa}` : "中国工作资格",
      notes: job.evidence,
    });
  };

  const openFromCompany = (company: Company) => {
    setForm({
      ...emptyApplication,
      company: company.company,
      region: company.region,
      track: normalizeTrack(company.track),
      fit: Number(company.fit),
      priority: company.priority,
      notes: `建议关键词：${company.keywords}`,
      workAuthorization: company.region === "美国" ? "需要H-1B Sponsorship" : "中国工作资格",
    });
  };

  const saveApplication = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/applications", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("保存失败，请稍后重试。");
      return;
    }
    await loadApplications();
    setForm(null);
    setView("applications");
  };

  const deleteApplication = async (id?: number) => {
    if (!id || !window.confirm("确定删除这条申请记录吗？")) return;
    await fetch(`/api/applications?id=${id}`, { method: "DELETE" });
    await loadApplications();
  };

  const updateForm = (patch: Partial<Application>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const submitVerification = async (event: FormEvent) => {
    event.preventDefault();
    setRequestSaving(true);
    setRequestMessage("");
    const response = await fetch("/api/job-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestForm),
    });
    setRequestSaving(false);
    if (!response.ok) {
      setRequestMessage("提交失败，请稍后重试。");
      return;
    }
    setRequestForm(emptyRequest);
    setRequestMessage("已加入核验队列。");
    await loadRequests();
  };

  const deleteRequest = async (id?: number) => {
    if (!id || !window.confirm("确定删除这条核验请求吗？")) return;
    await fetch(`/api/job-requests?id=${id}`, { method: "DELETE" });
    await loadRequests();
  };

  const rerunVerification = async (id?: number) => {
    if (!id) return;
    setVerifyingId(id);
    const response = await fetch("/api/job-requests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setVerifyingId(null);
    if (!response.ok) {
      setRequestMessage("核验失败，请稍后重试。");
      return;
    }
    setRequestMessage("核验已更新；合格岗位已自动加入申请清单。");
    await Promise.all([loadRequests(), loadApplications()]);
  };

  const ignoreJob = async (reason: string) => {
    if (!ignoreTarget) return;
    setIgnoreSaving(true);
    const response = await fetch("/api/ignored-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: ignoreTarget.company,
        title: ignoreTarget.title,
        jobUrl: ignoreTarget.jobUrl,
        reason,
      }),
    });
    setIgnoreSaving(false);
    if (!response.ok) return;
    setDailyJobs((current) => current.filter((job) => job.id !== ignoreTarget.id));
    setSaved((current) => current.filter((id) => id !== ignoreTarget.id));
    setIgnoreTarget(null);
    await loadIgnoredJobs();
  };

  const restoreIgnoredJob = async (id: number) => {
    const response = await fetch(`/api/ignored-jobs?id=${id}`, { method: "DELETE" });
    if (!response.ok) return;
    await loadIgnoredJobs();
    const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
    if (jobsResponse.ok) setDailyJobs(await jobsResponse.json());
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">IR</div>
          <div><strong>Ivy Job Radar</strong><span>跨行业博士岗位雷达</span></div>
        </div>
        <button className="icon-button" aria-label="新增申请记录" onClick={() => setForm({ ...emptyApplication })}>＋</button>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">每日 9:00 · 美国东部时间</p>
          <h1>{view === "applications" ? "申请进度" : view === "companies" ? "目标公司池" : view === "verify" ? "岗位核验" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>
          <p className="hero-copy">
            {view === "applications"
              ? "在这里更新每一次投递、跟进和面试。"
              : view === "companies"
                ? "已接入 Excel 中的 221 条目标公司与职位方向。"
                : view === "verify"
                  ? "把公司和岗位发到这里，核实后再进入正式清单。"
                  : view === "ignored"
                    ? "这些岗位不会在之后的每日搜索中再次出现。"
                : "今天只看真正值得你花时间申请的岗位。"}
          </p>
        </div>
        <div className="scan-status">
          <span className="pulse" />
          <div><strong>{view === "companies" ? "公司池" : "下一次搜索"}</strong><span>{view === "companies" ? "221 条记录" : "明天 09:00"}</span></div>
        </div>
      </section>

      <section className="stats" aria-label="申请概览">
        <article><span>已提交申请</span><strong>{appliedCount}</strong><em>包含当前面试与 Offer</em></article>
        <article><span>面试中</span><strong>{interviewingCount}</strong><em>HR 筛选至终面</em></article>
        <article><span>Offer</span><strong>{offerCount}</strong><em>持续更新申请结果</em></article>
      </section>

      {view === "today" && (
        <section className="preview-banner live-data-banner">
          <div>
            <strong>真实招聘数据</strong>
            <p>{jobsMessage || "来源为公司公开招聘接口；申请前请打开官方 JD 最终确认。"}</p>
          </div>
          <button className="refresh-jobs" onClick={refreshJobs} disabled={jobsRefreshing}>
            {jobsRefreshing ? "扫描中…" : "立即更新"}
          </button>
          <button className="ignored-list-link" onClick={() => setView("ignored")}>忽略名单 {ignoredJobs.length}</button>
        </section>
      )}

      {(view === "today" || view === "saved") && (
        <>
          <section className="toolbar">
            <div className="section-heading">
              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? "已收藏岗位" : "今日岗位"}</h2></div>
              <div className="job-controls">
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
          </section>
          <section className="job-list" aria-live="polite">
            {jobsLoading ? (
              <div className="empty-state"><span>◌</span><h3>正在读取岗位</h3><p>请稍等，正在载入最新核验结果。</p></div>
            ) : jobs.length === 0 ? (
              <div className="empty-state"><span>◎</span><h3>这个筛选下暂时没有已核验岗位</h3><p>点击“立即更新”运行首轮扫描。</p></div>
            ) : jobs.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-card-top">
                  <div className="company-logo">{job.company.slice(2, 4)}</div>
                  <div className="job-title">
                    <div className="job-meta"><span>{new Date(job.discoveredAt).toLocaleDateString("zh-CN")}</span><span>{job.track}</span></div>
                    <h3>{job.title}</h3><p>{job.company} · {job.location}</p>
                  </div>
                  <button className={`save-button ${saved.includes(job.id) ? "saved" : ""}`} onClick={() => toggleSaved(job.id)} aria-label={saved.includes(job.id) ? "取消收藏" : "收藏岗位"}>
                    {saved.includes(job.id) ? "★" : "☆"}
                  </button>
                </div>
                <div className="match-row">
                  <div className="score"><strong>{job.score}</strong><span>{scoreLabel(job.score)}</span></div>
                  <div className="evidence"><strong>{job.evidence}</strong><span>Sponsorship：{job.visa} · {job.source}</span></div>
                </div>
                <div className="skills">{job.skills.map((skill) => <span key={skill}>{skill}</span>)}</div>
                <div className="card-actions">
                  <a className="secondary job-link" href={job.jobUrl} target="_blank" rel="noreferrer">打开官方 JD ↗</a>
                  <button className="ignore-button" onClick={() => setIgnoreTarget(job)}>不再显示</button>
                  <button className="primary" onClick={() => openFromJob(job)}>加入申请追踪</button>
                </div>
              </article>
            ))}
          </section>
        </>
      )}

      {view === "ignored" && (
        <section className="tracker-section">
          <div className="section-heading">
            <div><p className="eyebrow">DO NOT SHOW AGAIN</p><h2>忽略名单</h2></div>
            <button className="add-button" onClick={() => setView("today")}>返回今日岗位</button>
          </div>
          {ignoredJobs.length === 0 ? (
            <div className="empty-state"><span>✓</span><h3>忽略名单是空的</h3><p>在岗位卡片中点击“不再显示”即可加入。</p></div>
          ) : (
            <div className="application-list">
              {ignoredJobs.map((item) => (
                <article className="application-card" key={item.id}>
                  <div className="application-head">
                    <div><span className="status">{item.reason}</span><h3>{item.title}</h3><p>{item.company}</p></div>
                  </div>
                  <div className="record-actions">
                    {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer">查看原 JD ↗</a>}
                    <button onClick={() => restoreIgnoredJob(item.id)}>恢复推荐</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "applications" && (
        <section className="tracker-section">
          <div className="section-heading">
            <div><p className="eyebrow">APPLICATION TRACKER</p><h2>我的申请</h2></div>
            <button className="add-button" onClick={() => setForm({ ...emptyApplication })}>＋ 新增岗位</button>
          </div>
          {applicationsList.length === 0 ? (
            <div className="empty-state"><span>▤</span><h3>还没有申请记录</h3><p>发现具体 JD 后新增一条，之后直接在这里更新状态。</p></div>
          ) : (
            <div className="application-list">
              {applicationsList.map((item) => (
                <article className="application-card" key={item.id}>
                  <div className="application-head">
                    <div><span className={`status status-${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{item.company} · {item.location || item.region}</p></div>
                    <span className="priority">{item.priority}</span>
                  </div>
                  <div className="application-details">
                    <span><b>匹配度</b>{item.fit}/5</span>
                    <span><b>申请日期</b>{item.appliedDate || "尚未申请"}</span>
                    <span><b>Application ID</b>{item.applicationId || "未填写"}</span>
                    <span><b>下一步</b>{item.nextAction || "未填写"}</span>
                    <span><b>跟进日期</b>{item.followUpDate || "未设置"}</span>
                  </div>
                  {item.notes && <p className="record-note">{item.notes}</p>}
                  <div className="record-actions">
                    {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer">打开 JD ↗</a>}
                    <button onClick={() => setForm({ ...item })}>编辑记录</button>
                    <button className="danger" onClick={() => deleteApplication(item.id)}>删除</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "companies" && (
        <section className="company-section">
          <div className="company-filters">
            <input value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="搜索公司、职位关键词或赛道" aria-label="搜索目标公司" />
            <select value={companyRegion} onChange={(event) => setCompanyRegion(event.target.value)}>
              <option>全部地区</option><option>美国</option><option>中国</option>
            </select>
            <select value={companyPriority} onChange={(event) => setCompanyPriority(event.target.value)}>
              <option>全部</option><option>P1</option><option>P2</option><option>P3</option>
            </select>
          </div>
          <p className="result-count">显示 {companies.length} / 221 条目标公司记录</p>
          <div className="company-list">
            {companies.map((company) => (
              <article className="company-card" key={`${company.rank}-${company.company}`}>
                <div className="company-card-head">
                  <div><span>{company.priority} · 匹配 {company.fit}/5 · {company.region}</span><h3>{company.company}</h3><p>{company.companyType} · {normalizeTrack(company.track)}</p></div>
                  <button onClick={() => openFromCompany(company)}>记录岗位</button>
                </div>
                <details>
                  <summary>查看建议职位与申请策略</summary>
                  <div className="company-detail"><b>建议搜索</b><p>{company.keywords}</p><b>适合你的原因</b><p>{company.reason}</p><b>申请策略</b><p>{company.strategy}</p></div>
                </details>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "verify" && (
        <section className="verify-section">
          <div className="section-heading">
            <div><p className="eyebrow">VERIFY A POSITION</p><h2>提交待核验岗位</h2></div>
          </div>
          <form className="verify-form" onSubmit={submitVerification}>
            <div className="verify-grid">
              <label>公司名称<input required value={requestForm.company} onChange={(e) => setRequestForm({ ...requestForm, company: e.target.value })} placeholder="例如 Pfizer" /></label>
              <label>岗位名称<input required value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} placeholder="例如 Statistical Scientist" /></label>
              <label className="full">岗位链接（可选）<input type="url" value={requestForm.jobUrl} onChange={(e) => setRequestForm({ ...requestForm, jobUrl: e.target.value })} placeholder="如果你已经找到 JD，请粘贴链接" /></label>
              <label className="full">补充说明（可选）<textarea value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} placeholder="例如：在 LinkedIn 看到，想确认是否仍开放" /></label>
            </div>
            <div className="verify-submit">
              <p>{requestMessage || "有公开链接时会立即核验；证据合格的岗位会自动加入“申请”清单。"}</p>
              <button disabled={requestSaving}>{requestSaving ? "正在读取 JD…" : "提交并核验"}</button>
            </div>
          </form>

          <div className="request-list">
            <div className="section-heading compact"><div><p className="eyebrow">VERIFICATION QUEUE</p><h2>核验队列</h2></div><span>{requests.length} 条</span></div>
            {requests.length === 0 ? (
              <div className="empty-state"><span>✓</span><h3>暂无待核验岗位</h3><p>提交后会在这里显示核验状态和结论。</p></div>
            ) : requests.map((item) => (
              <article className="request-card" key={item.id}>
                <div>
                  <span className={`verify-status ${item.status === "已确认" ? "verified" : item.status === "已关闭" ? "closed" : ""}`}>{item.status}</span>
                  <h3>{item.title}</h3>
                  <p>{item.company}</p>
                </div>
                {item.verificationNote && <p className="verification-note">{item.verificationNote}</p>}
                {item.notes && <p className="request-note">{item.notes}</p>}
                <div className="record-actions">
                  {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer">打开原链接 ↗</a>}
                  <button disabled={verifyingId === item.id} onClick={() => rerunVerification(item.id)}>
                    {verifyingId === item.id ? "核验中…" : "重新核验"}
                  </button>
                  <button className="danger" onClick={() => deleteRequest(item.id)}>删除</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {form && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setForm(null)}>
          <form className="application-form" onSubmit={saveApplication}>
            <div className="form-head"><div><p className="eyebrow">APPLICATION RECORD</p><h2>{form.id ? "更新申请" : "新增岗位"}</h2></div><button type="button" onClick={() => setForm(null)} aria-label="关闭">×</button></div>
            <div className="form-grid">
              <label>公司<input required value={form.company} onChange={(e) => updateForm({ company: e.target.value })} /></label>
              <label>职位名称<input required value={form.title} onChange={(e) => updateForm({ title: e.target.value })} /></label>
              <label>国家/地区<select value={form.region} onChange={(e) => updateForm({ region: e.target.value })}><option>美国</option><option>中国</option><option>其他</option></select></label>
              <label>地点<input value={form.location} onChange={(e) => updateForm({ location: e.target.value })} /></label>
              <label>专业方向<input value={form.track} onChange={(e) => updateForm({ track: e.target.value })} /></label>
              <label>Application ID / Requisition ID<input value={form.applicationId} onChange={(e) => updateForm({ applicationId: e.target.value })} placeholder="例如 123456 或 JOB-2026-18" /></label>
              <label>优先级<select value={form.priority} onChange={(e) => updateForm({ priority: e.target.value })}><option>P1</option><option>P2</option><option>P3</option></select></label>
              <label>申请状态<select value={form.status} onChange={(e) => updateForm({ status: e.target.value })}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              <label>匹配度<select value={form.fit} onChange={(e) => updateForm({ fit: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>兴趣度<select value={form.interest} onChange={(e) => updateForm({ interest: Number(e.target.value) })}>{[1,2,3,4,5].map((n) => <option key={n}>{n}</option>)}</select></label>
              <label>发现日期<input type="date" value={form.discoveredDate} onChange={(e) => updateForm({ discoveredDate: e.target.value })} /></label>
              <label>申请日期<input type="date" value={form.appliedDate} onChange={(e) => updateForm({ appliedDate: e.target.value })} /></label>
              <label>下次跟进日期<input type="date" value={form.followUpDate} onChange={(e) => updateForm({ followUpDate: e.target.value })} /></label>
              <label>下一步行动<input value={form.nextAction} onChange={(e) => updateForm({ nextAction: e.target.value })} /></label>
              <label>简历版本<input value={form.resumeVersion} onChange={(e) => updateForm({ resumeVersion: e.target.value })} placeholder="例如 Clinical Biostats" /></label>
              <label className="full">Job URL<input type="url" value={form.jobUrl} onChange={(e) => updateForm({ jobUrl: e.target.value })} placeholder="https://" /></label>
              <label className="full">工作授权<input value={form.workAuthorization} onChange={(e) => updateForm({ workAuthorization: e.target.value })} /></label>
              <label className="full">面试/下一步记录<textarea value={form.interviewNotes} onChange={(e) => updateForm({ interviewNotes: e.target.value })} /></label>
              <label className="full">备注<textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} /></label>
            </div>
            {message && <p className="form-error">{message}</p>}
            <div className="form-actions"><button type="button" onClick={() => setForm(null)}>取消</button><button className="primary" disabled={saving}>{saving ? "保存中…" : "保存记录"}</button></div>
          </form>
        </div>
      )}

      {ignoreTarget && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setIgnoreTarget(null)}>
          <section className="ignore-dialog" role="dialog" aria-modal="true" aria-labelledby="ignore-title">
            <div className="form-head">
              <div><p className="eyebrow">不再推荐</p><h2 id="ignore-title">{ignoreTarget.title}</h2></div>
              <button type="button" onClick={() => setIgnoreTarget(null)} aria-label="关闭">×</button>
            </div>
            <p>{ignoreTarget.company} · 请选择原因。以后每日刷新时，同一公司和相同岗位将不会再次出现。</p>
            <div className="ignore-options">
              <button disabled={ignoreSaving} onClick={() => ignoreJob("岗位已关闭或链接失效")}>岗位已关闭或链接失效</button>
              <button disabled={ignoreSaving} onClick={() => ignoreJob("不感兴趣，不想申请")}>不感兴趣，不想申请</button>
            </div>
            <button className="dialog-cancel" onClick={() => setIgnoreTarget(null)}>取消</button>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "today" ? "selected" : ""} onClick={() => setView("today")}><span>⌂</span>今日</button>
        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>收藏</button>
        <button className={view === "applications" ? "selected" : ""} onClick={() => setView("applications")}><span>▤</span>申请</button>
        <button className={view === "companies" ? "selected" : ""} onClick={() => setView("companies")}><span>⌕</span>公司池</button>
        <button className={view === "verify" ? "selected" : ""} onClick={() => setView("verify")}><span>✓</span>核验</button>
      </nav>
    </main>
  );
}
