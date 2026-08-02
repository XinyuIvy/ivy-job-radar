"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import companyPool from "./company-pool.json";
import companyPoolAdditions from "./company-pool-additions.json";
import { companyCollectionMode, companySourceSearchUrl, findCompanySource } from "./lib/company-sources";

const completeCompanyPool = [...companyPool, ...companyPoolAdditions];

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
  description?: string;
  skills: string[];
  jobUrl: string;
  applicationId: string;
  source: string;
  status: string;
  deadline: string;
  deadlineType: "date" | "rolling" | "unknown";
  discoveredAt: string;
  checkedAt: string;
};

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
  deadline: string;
  deadlineType: "date" | "rolling" | "unknown";
  deadlineSource: "automatic" | "manual" | "unknown";
  plannedApplicationDate: string;
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

type ApplicationTask = {
  id?: number;
  applicationId: number;
  title: string;
  dueDate: string;
  reminderDate: string;
  status: "pending" | "done";
  source: "automatic" | "manual";
};

type Interview = {
  id?: number;
  applicationId: number;
  round: string;
  scheduledAt: string;
  format: string;
  contactName: string;
  contactEmail: string;
  notes: string;
  outcome: string;
  thankYouStatus: string;
  thankYouDueAt: string;
  followUpAt: string;
};

type CompanyResearch = {
  company: string;
  website: string;
  careersUrl: string;
  businessSummary: string;
  recentNotes: string;
  personalNotes: string;
  updatedAt?: string;
};

type Contact = {
  id?: number;
  name: string;
  company: string;
  role: string;
  contactType: string;
  email: string;
  linkedinUrl: string;
  applicationId: number | null;
  status: string;
  lastContactAt: string;
  nextFollowUpAt: string;
  notes: string;
};

type InterviewExperience = {
  id: string;
  company: string;
  roleFamily: string;
  roleTitle: string;
  year: number;
  source: string;
  sourceUrl: string;
  summary: string;
  rounds: string[];
  topics: string[];
  reliability: string;
};

type QualityRun = {
  id: number;
  completedAt: string;
  processed: number;
  merged: number;
  resolved: number;
  retrying: number;
  needsReview: number;
  failureReasons: Array<{ reason: string; count: number }>;
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

type ScanStatus = {
  state: "idle" | "ats_complete" | "queued" | "running" | "completed" | "failed";
  atsScanned: number;
  atsMatched: number;
  created: number;
  updated: number;
  skipped: number;
  totalJobs: number;
  startedAt: string;
  completedAt: string;
  message: string;
  timeoutMinutes: number;
};

type ChinaScanSource = {
  source?: string;
  status?: string;
  jobsDiscovered?: number;
  jobsEligible?: number;
  jobsCreated?: number;
  jobsUpdatedOrDuplicate?: number;
  jobs_discovered?: number;
  jobs_eligible?: number;
  jobs_created?: number;
  jobs_updated_or_duplicate?: number;
  rejectionReasons?: Record<string, number>;
  rejection_reasons?: Record<string, number>;
  attention?: string;
};

type ChinaScanStatus = {
  status: "completed" | "partial" | "failed";
  sourcesCompleted: number;
  sourcesFailed: number;
  jobsDiscovered: number;
  jobsEligible: number;
  jobsCreated: number;
  jobsUpdatedOrDuplicate: number;
  results: ChinaScanSource[];
  finishedAt: string;
  receivedAt: string;
};

type ChinaScanControl = {
  requestId: string;
  state: "idle" | "queued" | "running" | "completed" | "failed" | "attention_required";
  requestedAt: string;
  claimedAt: string;
  completedAt: string;
  message: string;
  progress?: {
    source: string;
    phase: string;
    message: string;
    completed: number;
    total: number;
    scanned: number;
    unique: number;
    filtered: number;
    detailCandidates: number;
    eligible: number;
    created: number;
    duplicate: number;
    rejectionReasons: Record<string, number>;
    updatedAt: string;
  } | null;
};

type UserProfile = {
  userEmail: string;
  fullName: string;
  location: string;
  workAuthorization: string;
  sponsorshipNeed: string;
  education: string;
  targetRoles: string;
  targetIndustries: string;
  professionalSummary: string;
  skills: string[];
};

type ProfileResume = {
  id: string;
  label: string;
  filename: string;
  contentType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
};

type ApplicationAnalytics = {
  generatedAt: string;
  funnel: Array<{ key: string; label: string; count: number }>;
  sources: Array<{
    source: string;
    applications: number;
    interviews: number;
    offers: number;
    rejected: number;
    interviewRate: number;
    offerRate: number;
  }>;
  totals: {
    tracked: number;
    pending: number;
    submitted: number;
    interviews: number;
    offers: number;
    rejected: number;
    withdrawn: number;
  };
};

type QualityIssue = {
  key: string;
  label: string;
  detail: string;
  jobId: number;
  company: string;
  title: string;
  region: string;
  status: string;
  jobUrl: string;
  checkedAt: string;
  automationStatus: "queued" | "processing" | "retrying" | "needs_review" | "resolved";
  attempts: number;
  lastError: string;
  nextRetryAt: string;
};

type DataQuality = {
  generatedAt: string;
  totalJobs: number;
  healthyJobs: number;
  affectedJobs: number;
  autoProcessing: number;
  retryingJobs: number;
  manualReview: number;
  resolvedJobs: number;
  categories: Array<{ key: string; label: string; count: number }>;
  runs: QualityRun[];
  issues: QualityIssue[];
};

type ScanNotice = {
  id: string;
  kind: "completed" | "failed" | "reminder";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
};

type View = "today" | "saved" | "applications" | "companies" | "collect" | "verify" | "profile" | "ignored";

const tracks = ["全部", "Technology", "Quant", "Pharma", "Medical Device", "Healthcare AI", "Consulting"];
const sortOptions = [
  { value: "score", label: "匹配度最高" },
  { value: "newest", label: "最新发现" },
  { value: "checked", label: "最近核验" },
  { value: "priority", label: "优先申请岗位" },
] as const;
const statuses = ["准备材料", "已申请", "一面", "二面/技术面", "终面", "Offer", "撤回", "拒绝"];
const interviewStatuses = ["一面", "二面/技术面", "终面"];
type ApplicationBucket = "submitted" | "interview" | "offer" | "rejected";
type SavedBucket = "saved" | "pending";
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
  status: "准备材料",
  deadline: "",
  deadlineType: "unknown",
  deadlineSource: "unknown",
  plannedApplicationDate: "",
  discoveredDate: new Date().toISOString().slice(0, 10),
  appliedDate: "",
  followUpDate: "",
  nextAction: "准备申请材料",
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

const emptyProfile: UserProfile = {
  userEmail: "",
  fullName: "",
  location: "",
  workAuthorization: "",
  sponsorshipNeed: "",
  education: "",
  targetRoles: "",
  targetIndustries: "",
  professionalSummary: "",
  skills: [],
};

const emptyContact: Contact = {
  name: "",
  company: "",
  role: "",
  contactType: "Recruiter",
  email: "",
  linkedinUrl: "",
  applicationId: null,
  status: "未联系",
  lastContactAt: "",
  nextFollowUpAt: "",
  notes: "",
};

function normalizeTrack(track: string) {
  return track.replace(/^\d+\s*/, "");
}

function normalizeCompanyName(value: string) {
  return value.toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(inc|llc|ltd|limited|company|co|corporation|corp|pharmaceuticals|innovative medicine)\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function sameCompany(left: string, right: string) {
  const a = normalizeCompanyName(left);
  const b = normalizeCompanyName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function experienceSearchUrl(item: InterviewExperience) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${item.company} ${item.roleTitle} interview experience ${item.source}`)}`;
}

function scoreLabel(score: number) {
  if (score >= 85) return "优先申请";
  if (score >= 70) return "值得申请";
  if (score >= 55) return "选择性申请";
  return "不建议";
}

function algorithmPriority(score: number) {
  if (score >= 85) return "P1";
  if (score >= 70) return "P2";
  return "P3";
}

function algorithmInterest(job: Job) {
  const strongTrack = ["Pharma", "Healthcare AI", "Medical Device", "Quant"].includes(job.track);
  const sponsorshipFit = job.region === "中国" || job.visa === "可能支持";
  return Math.max(1, Math.min(5, 2 + Number(strongTrack) + Number(job.score >= 75) + Number(sponsorshipFit)));
}

function degreeRequirement(job: Job) {
  const degreeSegment = job.evidence
    .split(/[；;。]/)
    .map((segment) => segment.trim())
    .find((segment) => /^(学历|教育|degree|education)[:：]/i.test(segment));

  if (degreeSegment) {
    return degreeSegment.replace(/^(学历|教育|degree|education)[:：]\s*/i, "") || "未提取";
  }
  return "未从 JD 提取";
}

function sponsorshipLabel(visa: string) {
  if (/明确不支持|不提供|without|no sponsorship/i.test(visa)) return "No";
  if (/可能支持|提供|available|yes/i.test(visa)) return "Yes";
  return "Unsure";
}

function sourceLabel(job: Job) {
  const source = job.source.toLowerCase();
  let hostname = "";
  try {
    hostname = new URL(job.jobUrl).hostname.toLowerCase();
  } catch {
    hostname = "";
  }

  if (source.includes("linkedin") || hostname.includes("linkedin.com")) return "LinkedIn";
  if (source.includes("indeed") || hostname.includes("indeed.com")) return "Indeed";
  if (source.includes("glassdoor") || hostname.includes("glassdoor.com")) return "Glassdoor";
  if (source.includes("boss") || hostname.includes("zhipin.com")) return "BOSS直聘";
  if (source.includes("liepin") || hostname.includes("liepin.com")) return "猎聘";
  if (source.includes("51job") || hostname.includes("51job.com")) return "前程无忧";
  return "公司官网";
}

function verificationSummary(job: Job) {
  if (job.status === "待官网核验" || /未取得足够证据|匹配度不足|暂时无法确认|需复核/.test(job.evidence)) {
    return "已定位公司页面，但未取得足够证据确认具体 JD 仍开放。";
  }
  if (/当前职位列表中仍有该岗位|申请入口核验时有效|入口核验时有效|职位名称与页面内容匹配/.test(job.evidence)) {
    return "已确认官方 JD 入口，核验时岗位仍开放。";
  }
  return "已定位官方 JD 入口，申请前请再次确认岗位状态。";
}

function roleSummary(job: Job) {
  const title = job.title.toLowerCase();
  const skillText = job.skills.slice(0, 3).join("、");

  if (/biostat|statistical scientist/.test(title)) {
    return `该岗位主要负责研究设计、统计分析与结果沟通${skillText ? `，重点技能包括${skillText}` : ""}。`;
  }
  if (/quantitative researcher|quantitative analyst|quant/.test(title)) {
    return `该岗位主要开展量化研究、模型开发与数据驱动决策${skillText ? `，重点技能包括${skillText}` : ""}。`;
  }
  if (/data scientist|applied scientist|research scientist|machine learning/.test(title)) {
    return `该岗位主要使用数据分析与建模方法解决业务或研究问题${skillText ? `，重点技能包括${skillText}` : ""}。`;
  }
  if (/epidemiol|health economics|outcomes research/.test(title)) {
    return `该岗位主要开展健康研究、证据生成与结果分析${skillText ? `，重点技能包括${skillText}` : ""}。`;
  }
  if (/consult/.test(title)) {
    return `该岗位主要通过分析与研究为医疗健康客户提供决策支持${skillText ? `，重点技能包括${skillText}` : ""}。`;
  }
  return `这是一个 ${job.track} 方向的岗位${skillText ? `，工作重点涉及${skillText}` : "，具体职责请查看官方 JD"}。`;
}

function formatNewYorkTime(value: string) {
  if (!value) return "暂无完成记录";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return hours > 0
    ? `${hours}小时 ${minutes}分`
    : `${minutes}分 ${String(seconds).padStart(2, "0")}秒`;
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function deadlineLabel(deadline: string, type: string) {
  if (type === "rolling") return "滚动招聘，建议尽早申请";
  if (deadline) return deadline;
  return "JD 未公布";
}

export default function JobRadar() {
  const [view, setView] = useState<View>("today");
  const [track, setTrack] = useState("全部");
  const [region, setRegion] = useState("全部地区");
  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const [saved, setSaved] = useState<number[]>([]);
  const [applicationBucket, setApplicationBucket] = useState<ApplicationBucket>("submitted");
  const [savedBucket, setSavedBucket] = useState<SavedBucket>("saved");
  const [dailyJobs, setDailyJobs] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [applicationsList, setApplicationsList] = useState<Application[]>([]);
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyPriority, setCompanyPriority] = useState("全部");
  const [companyRegion, setCompanyRegion] = useState("全部地区");
  const [companyCollection, setCompanyCollection] = useState("全部接入状态");
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
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [chinaScanStatus, setChinaScanStatus] = useState<ChinaScanStatus | null>(null);
  const [chinaScanControl, setChinaScanControl] = useState<ChinaScanControl | null>(null);
  const [chinaScanStarting, setChinaScanStarting] = useState(false);
  const [refreshConfirmationOpen, setRefreshConfirmationOpen] = useState(false);
  const [clock, setClock] = useState(0);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [skillDraft, setSkillDraft] = useState("");
  const [profileResumes, setProfileResumes] = useState<ProfileResume[]>([]);
  const [resumeLabel, setResumeLabel] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeInputKey, setResumeInputKey] = useState(0);
  const [analytics, setAnalytics] = useState<ApplicationAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [visibleJobCount, setVisibleJobCount] = useState(20);
  const [quality, setQuality] = useState<DataQuality | null>(null);
  const [qualityLoading, setQualityLoading] = useState(false);
  const [qualityAutomationRunning, setQualityAutomationRunning] = useState(false);
  const [notices, setNotices] = useState<ScanNotice[]>([]);
  const [noticePanelOpen, setNoticePanelOpen] = useState(false);
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [tasks, setTasks] = useState<ApplicationTask[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [taskForm, setTaskForm] = useState<ApplicationTask | null>(null);
  const [interviewForm, setInterviewForm] = useState<Interview | null>(null);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [researchRows, setResearchRows] = useState<CompanyResearch[]>([]);
  const [researchForm, setResearchForm] = useState<CompanyResearch | null>(null);
  const [researchSaving, setResearchSaving] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactForm, setContactForm] = useState<Contact | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [experiences, setExperiences] = useState<InterviewExperience[]>([]);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const loadScanStatus = async () => {
    const response = await fetch("/api/scan-status", { cache: "no-store" });
    if (!response.ok) return;
    const nextStatus = await response.json() as ScanStatus;
    setScanStatus(nextStatus);

    if ((nextStatus.state === "completed" || nextStatus.state === "failed") && nextStatus.completedAt) {
      const noticeKey = `${nextStatus.state}:${nextStatus.completedAt}`;
      const previousKey = window.localStorage.getItem("ivy-job-radar-last-scan-notice") ?? "";
      if (noticeKey !== previousKey) {
        const firstObservedStatus = previousKey === "";
        const notice: ScanNotice = nextStatus.state === "completed"
          ? {
            id: noticeKey,
            kind: "completed",
            title: "岗位扫描已完成",
            body: `新增 ${nextStatus.created} 个，更新 ${nextStatus.updated} 个，岗位库共 ${nextStatus.totalJobs} 条。`,
            createdAt: nextStatus.completedAt,
            read: firstObservedStatus,
          }
          : {
            id: noticeKey,
            kind: "failed",
            title: "岗位扫描未完成",
            body: nextStatus.message || "请查看扫描记录并重新运行。",
            createdAt: nextStatus.completedAt,
            read: firstObservedStatus,
          };
        setNotices((current) => {
          const updated = [notice, ...current.filter((item) => item.id !== notice.id)].slice(0, 20);
          window.localStorage.setItem("ivy-job-radar-scan-notices", JSON.stringify(updated));
          return updated;
        });
        window.localStorage.setItem("ivy-job-radar-last-scan-notice", noticeKey);
        if (!firstObservedStatus && "Notification" in window && Notification.permission === "granted") {
          new Notification(notice.title, { body: notice.body, tag: notice.id });
        }
      }
    }
  };

  const loadChinaScanStatus = async () => {
    const response = await fetch("/api/china-scan-status", { cache: "no-store" });
    if (!response.ok) return;
    const nextStatus = await response.json() as ChinaScanStatus | null;
    setChinaScanStatus((currentStatus) => {
      if (currentStatus?.receivedAt && nextStatus?.receivedAt !== currentStatus.receivedAt) {
        void fetch("/api/jobs", { cache: "no-store" })
          .then((jobsResponse) => jobsResponse.ok ? jobsResponse.json() : null)
          .then((rows) => {
            if (Array.isArray(rows)) setDailyJobs(rows);
          });
      }
      return nextStatus;
    });
  };

  const loadChinaScanControl = async () => {
    const response = await fetch("/api/china-scan-control", { cache: "no-store" });
    if (response.ok) setChinaScanControl(await response.json() as ChinaScanControl);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.localStorage.getItem("ivy-job-radar-scan-notices") || "[]");
        if (Array.isArray(stored)) setNotices(stored.slice(0, 20));
      } catch {
        window.localStorage.removeItem("ivy-job-radar-scan-notices");
      }
      setBrowserNotificationsEnabled("Notification" in window && Notification.permission === "granted");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const loadWorkflow = async () => {
    const response = await fetch("/api/workflow", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json() as { tasks: ApplicationTask[]; interviews: Interview[] };
    setTasks(result.tasks);
    setInterviews(result.interviews);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/workflow", { cache: "no-store" }).then((response) => response.ok ? response.json() : { tasks: [], interviews: [] }),
      fetch("/api/company-research", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
      fetch("/api/contacts", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
      fetch("/api/interview-prep", { cache: "no-store" }).then((response) => response.ok ? response.json() : { experiences: [] }),
    ]).then(([workflow, research, contactRows, prep]) => {
      if (!active) return;
      setTasks(workflow.tasks ?? []);
      setInterviews(workflow.interviews ?? []);
      setResearchRows(research);
      setContacts(contactRows);
      setExperiences(prep.experiences ?? []);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const applicationById = new Map(applicationsList.map((item) => [item.id, item]));
    const reminders: ScanNotice[] = [];
    for (const task of tasks) {
      if (task.status === "done" || !task.reminderDate || task.reminderDate > today) continue;
      const application = applicationById.get(task.applicationId);
      reminders.push({ id: `task:${task.id}:${task.reminderDate}`, kind: "reminder", title: `待办：${task.title}`, body: `${application?.company ?? "申请任务"} · 截止 ${task.dueDate || "未设置"}`, createdAt: `${today}T12:00:00.000Z`, read: false });
    }
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const application of applicationsList) {
      if (!application.deadline || application.deadlineType !== "date") continue;
      const days = Math.ceil((Date.parse(`${application.deadline}T23:59:59`) - now) / dayMs);
      if (![14, 7, 3, 1, 0].includes(days)) continue;
      reminders.push({
        id: `deadline:${application.id}:${application.deadline}:${days}`,
        kind: "reminder",
        title: days > 0 ? `申请截止还有 ${days} 天` : "申请今天截止",
        body: `${application.company} · ${application.title}`,
        createdAt: new Date().toISOString(),
        read: false,
      });
    }
    for (const interview of interviews) {
      const scheduled = Date.parse(interview.scheduledAt);
      if (!Number.isFinite(scheduled) || scheduled < now || scheduled - now > 24 * 60 * 60 * 1000) continue;
      const application = applicationById.get(interview.applicationId);
      reminders.push({ id: `interview:${interview.id}:${interview.scheduledAt}`, kind: "reminder", title: `面试提醒：${interview.round}`, body: `${application?.company ?? "面试"} · ${new Date(interview.scheduledAt).toLocaleString("zh-CN")}`, createdAt: new Date().toISOString(), read: false });
    }
    if (!reminders.length) return;
    const timer = window.setTimeout(() => {
      setNotices((current) => {
        const known = new Set(current.map((item) => item.id));
        const updated = [...reminders.filter((item) => !known.has(item.id)), ...current].slice(0, 20);
        window.localStorage.setItem("ivy-job-radar-scan-notices", JSON.stringify(updated));
        return updated;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [tasks, interviews, applicationsList]);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void loadScanStatus();
      void loadChinaScanStatus();
      void loadChinaScanControl();
      setClock(Date.now());
    }, 0);
    const statusTimer = window.setInterval(() => {
      void loadScanStatus();
      void loadChinaScanStatus();
      void loadChinaScanControl();
    }, 15000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(clockTimer);
    };
  }, []);

  const enableBrowserNotifications = async () => {
    if (!("Notification" in window)) return;
    const permission = await Notification.requestPermission();
    setBrowserNotificationsEnabled(permission === "granted");
  };

  const markNoticesRead = () => {
    setNotices((current) => {
      const updated = current.map((notice) => ({ ...notice, read: true }));
      window.localStorage.setItem("ivy-job-radar-scan-notices", JSON.stringify(updated));
      return updated;
    });
  };

  const loadApplications = async () => {
    const response = await fetch("/api/applications", { cache: "no-store" });
    if (response.ok) setApplicationsList(await response.json());
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    const response = await fetch("/api/analytics", { cache: "no-store" });
    if (response.ok) setAnalytics(await response.json());
    setAnalyticsLoading(false);
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

  useEffect(() => {
    if (view !== "applications") return;
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [view, applicationsList]);

  useEffect(() => {
    let active = true;
    let nextBatchTimer: number | undefined;
    const runAutomation = async () => {
      if (!active) return;
      setQualityAutomationRunning(true);
      const response = await fetch("/api/data-quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchSize: 6 }),
      });
      const result = response.ok ? await response.json() as { processed: number; merged: number; dashboard: DataQuality } : null;
      if (!active) return;
      if (result?.dashboard) setQuality(result.dashboard);
      if (result && (result.processed > 0 || result.merged > 0)) {
        nextBatchTimer = window.setTimeout(runAutomation, 750);
      } else {
        setQualityAutomationRunning(false);
      }
    };
    const initialTimer = window.setTimeout(() => void runAutomation(), 1200);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      if (nextBatchTimer) window.clearTimeout(nextBatchTimer);
    };
  }, []);

  useEffect(() => {
    if (view !== "verify") return;
    let active = true;
    const initialTimer = window.setTimeout(() => {
      setQualityLoading(true);
      fetch("/api/data-quality", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (active) setQuality(result);
        })
        .finally(() => {
          if (active) setQualityLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
    };
  }, [view]);

  const loadSavedJobs = async () => {
    const response = await fetch("/api/saved-jobs", { cache: "no-store" });
    if (!response.ok) return;
    const rows = await response.json() as Array<{ jobId: number }>;
    setSaved(rows.map((row) => row.jobId));
  };

  useEffect(() => {
    let active = true;
    fetch("/api/saved-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows: Array<{ jobId: number }>) => {
        if (active) setSaved(rows.map((row) => row.jobId));
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

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfileMessage("");
    const [profileResponse, resumesResponse] = await Promise.all([
      fetch("/api/profile", { cache: "no-store" }),
      fetch("/api/profile/resumes", { cache: "no-store" }),
    ]);
    if (profileResponse.ok) setProfile(await profileResponse.json());
    if (resumesResponse.ok) setProfileResumes(await resumesResponse.json());
    if (!profileResponse.ok || !resumesResponse.ok) {
      setProfileMessage("个人资料读取失败，请重新登录后再试。");
    }
    setProfileLoading(false);
  };

  useEffect(() => {
    if (view !== "profile") return;
    const timer = window.setTimeout(() => void loadProfile(), 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setProfileSaving(false);
    if (!response.ok) {
      setProfileMessage("保存失败，请稍后重试。");
      return;
    }
    setProfile(await response.json());
    setProfileMessage("个人资料和技能清单已保存。");
  };

  const addSkill = () => {
    const skill = skillDraft.trim();
    if (!skill) return;
    setProfile((current) => ({
      ...current,
      skills: current.skills.some((item) => item.toLowerCase() === skill.toLowerCase())
        ? current.skills
        : [...current.skills, skill],
    }));
    setSkillDraft("");
  };

  const uploadResume = async (event: FormEvent) => {
    event.preventDefault();
    if (!resumeFile || !resumeLabel.trim()) return;
    setResumeUploading(true);
    setProfileMessage("");
    const body = new FormData();
    body.set("label", resumeLabel.trim());
    body.set("file", resumeFile);
    const response = await fetch("/api/profile/resumes", { method: "POST", body });
    setResumeUploading(false);
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setProfileMessage(result.error || "CV 上传失败，请稍后重试。");
      return;
    }
    setResumeLabel("");
    setResumeFile(null);
    setResumeInputKey((current) => current + 1);
    setProfileMessage("基础 CV 已安全保存。");
    const resumesResponse = await fetch("/api/profile/resumes", { cache: "no-store" });
    if (resumesResponse.ok) setProfileResumes(await resumesResponse.json());
  };

  const deleteResume = async (resume: ProfileResume) => {
    if (!window.confirm(`确定删除“${resume.label}”吗？`)) return;
    const response = await fetch(`/api/profile/resumes?id=${encodeURIComponent(resume.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setProfileMessage("CV 删除失败，请稍后重试。");
      return;
    }
    setProfileResumes((current) => current.filter((item) => item.id !== resume.id));
    setProfileMessage("基础 CV 已删除。");
  };

  const refreshJobs = async () => {
    setJobsRefreshing(true);
    setJobsMessage("正在扫描美国公司 ATS，并启动美国聚合平台与官网核验…");
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    if (response.ok) {
      const result = await response.json();
      const sourceSummary = Array.isArray(result.sources)
        ? result.sources
          .map((item: { source: string; succeeded: number; boards: number; failedBoards?: string[] }) => {
            const failures = item.failedBoards?.length ? `（失败：${item.failedBoards.join("、")}）` : "";
            return `${item.source} ${item.succeeded}/${item.boards}${failures}`;
          })
          .join("，")
        : "";
      const matchedJobs = Array.isArray(result.sources)
        ? result.sources.flatMap((item: { matchedJobs?: string[] }) => item.matchedJobs ?? [])
        : [];
      const backgroundMessage = result.backgroundScan?.triggered
        ? " 美国 JobSpy 与美国公司官网核验已在后台启动，通常几分钟后自动回写。"
        : ` ${result.backgroundScan?.message ?? "后台全网搜索未启动。"}`
      setJobsMessage(
        `公司 ATS 已扫描 ${result.scanned} 个岗位，筛出 ${result.matched} 个候选岗位。${sourceSummary ? ` 来源连接：${sourceSummary}。` : ""}${matchedJobs.length ? ` 候选：${matchedJobs.join("；")}。` : ""}${backgroundMessage}`,
      );
      await loadScanStatus();
      const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
      if (jobsResponse.ok) setDailyJobs(await jobsResponse.json());
    } else {
      setJobsMessage("本次扫描失败，请稍后重试。");
    }
    setJobsRefreshing(false);
  };

  const startChinaScan = async () => {
    setChinaScanStarting(true);
    const response = await fetch("/api/china-scan-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start" }),
    });
    const result = await response.json().catch(() => ({})) as Partial<ChinaScanControl> & { error?: string };
    if (response.ok || response.status === 409) {
      setChinaScanControl(result as ChinaScanControl);
    } else {
      setChinaScanControl((current) => current ? { ...current, message: result.error || "中国岗位扫描启动失败。" } : null);
    }
    setChinaScanStarting(false);
  };

  const scanStartedMs = scanStatus?.startedAt ? new Date(scanStatus.startedAt).getTime() : 0;
  const scanRunning = scanStatus?.state === "queued" || scanStatus?.state === "running" || scanStatus?.state === "ats_complete";
  const chinaScanRunning = chinaScanControl?.state === "queued" || chinaScanControl?.state === "running";
  const chinaRequestMs = chinaScanControl?.requestedAt ? Date.parse(chinaScanControl.requestedAt) : 0;
  const chinaReportMs = chinaScanStatus?.receivedAt ? Date.parse(chinaScanStatus.receivedAt) : 0;
  const hasCurrentChinaReport = Boolean(
    chinaScanStatus && (!chinaRequestMs || chinaReportMs >= chinaRequestMs),
  );
  const showChinaControlSummary = chinaScanRunning || !hasCurrentChinaReport;
  const chinaProgress = chinaScanControl?.progress;
  const chinaProgressRatio = chinaProgress?.total
    ? Math.min(1, chinaProgress.completed / chinaProgress.total)
    : 0;
  const chinaStartedMs = chinaScanControl?.claimedAt ? new Date(chinaScanControl.claimedAt).getTime() : 0;
  const chinaElapsedSeconds = chinaScanRunning && chinaStartedMs
    ? Math.max(0, (clock - chinaStartedMs) / 1000)
    : 0;
  const chinaEtaSeconds = chinaProgressRatio > 0 && chinaProgressRatio < 1
    ? Math.max(0, chinaElapsedSeconds * (1 / chinaProgressRatio - 1))
    : 0;
  const scanElapsedSeconds = scanRunning && scanStartedMs
    ? Math.max(0, (clock - scanStartedMs) / 1000)
    : 0;
  const timeoutSeconds = (scanStatus?.timeoutMinutes ?? 60) * 60;
  const scanRemainingSeconds = Math.max(0, timeoutSeconds - scanElapsedSeconds);

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
      const normalizedQuery = jobQuery.trim().toLowerCase();
      const filtered = dailyJobs.filter(
        (job) =>
          (track === "全部" || job.track === track) &&
          (region === "全部地区" || job.region === region) &&
          (view !== "saved" || savedBucket !== "saved" || saved.includes(job.id)) &&
          (!normalizedQuery || [
            job.title,
            job.company,
            job.location,
            job.track,
            job.source,
            ...job.skills,
          ].some((value) => value.toLowerCase().includes(normalizedQuery))),
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
    [dailyJobs, track, region, saved, savedBucket, view, jobSort, jobQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setVisibleJobCount(20), 0);
    return () => window.clearTimeout(timer);
  }, [track, region, jobSort, view, savedBucket, jobQuery]);

  const visibleJobs = jobs.slice(0, visibleJobCount);
  const bossJobs = dailyJobs.filter((job) => sourceLabel(job) === "BOSS直聘");
  const latestBossCheck = bossJobs.reduce((latest, job) => job.checkedAt > latest ? job.checkedAt : latest, "");
  const manualRequestKeys = new Set(requests.map((item) => `${item.company.trim().toLowerCase()}::${item.title.trim().toLowerCase()}`));
  const qualityQueueIssues = (quality?.issues ?? [])
    .filter((issue) => issue.automationStatus !== "resolved")
    .reduce<QualityIssue[]>((rows, issue) => {
      const existing = rows.find((row) => row.jobId === issue.jobId);
      if (existing) {
        if (!existing.label.includes(issue.label)) existing.label = `${existing.label}、${issue.label}`;
        if (!existing.lastError && issue.lastError) existing.lastError = issue.lastError;
        return rows;
      }
      rows.push({ ...issue });
      return rows;
    }, [])
    .filter((issue) => !manualRequestKeys.has(`${issue.company.trim().toLowerCase()}::${issue.title.trim().toLowerCase()}`));
  const unreadNoticeCount = notices.filter((notice) => !notice.read).length;

  const companyRecords = useMemo(() => {
    const existingNames = new Set(completeCompanyPool.map((company) => company.company.toLowerCase()));
    const verified = dailyJobs
      .filter((job, index, rows) =>
        !existingNames.has(job.company.toLowerCase())
        && rows.findIndex((candidate) => candidate.company.toLowerCase() === job.company.toLowerCase()) === index)
      .map((job, index) => ({
        rank: completeCompanyPool.length + index + 1,
        region: job.region,
        priority: algorithmPriority(job.score),
        track: job.track,
        fit: Math.max(1, Math.min(5, Math.round(job.score / 20))),
        company: job.company,
        companyType: "已核验公司",
        keywords: job.title,
        reason: `已有通过核验的岗位：${job.title}。`,
        dataTypes: "",
        strategy: "在今日岗位查看具体 JD，并从岗位卡片进入申请追踪。",
        source: job.source,
      }));
    return [...completeCompanyPool, ...verified];
  }, [dailyJobs]);
  const companies = useMemo(() => {
    const query = companyQuery.trim().toLowerCase();
    return companyRecords.filter((company) => {
      const searchable = `${company.company} ${company.keywords} ${company.companyType} ${company.track}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (companyPriority === "全部" || company.priority === companyPriority) &&
        (companyRegion === "全部地区" || company.region === companyRegion) &&
        (companyCollection === "全部接入状态" || companyCollectionMode(findCompanySource(company.company)) === companyCollection)
      );
    });
  }, [companyRecords, companyQuery, companyPriority, companyRegion, companyCollection]);

  const pendingApplications = applicationsList.filter((item) => item.status === "准备材料");
  const submittedApplications = applicationsList.filter((item) => item.status === "已申请");
  const interviewingApplications = applicationsList.filter((item) => interviewStatuses.includes(item.status));
  const offerApplications = applicationsList.filter((item) => item.status === "Offer");
  const rejectedApplications = applicationsList.filter((item) => item.status === "拒绝");
  const appliedCount = submittedApplications.length;
  const interviewingCount = interviewingApplications.length;
  const offerCount = applicationsList.filter((item) => item.status === "Offer").length;
  const visibleApplications = applicationBucket === "submitted"
    ? submittedApplications
    : applicationBucket === "interview"
      ? interviewingApplications
      : applicationBucket === "offer"
        ? offerApplications
        : rejectedApplications;
  const applicationById = new Map(applicationsList.filter((item) => item.id).map((item) => [item.id as number, item]));
  const pendingTasks = tasks
    .filter((task) => task.status === "pending")
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const upcomingInterviews = interviews
    .filter((item) => item.outcome === "待进行")
    .sort((a, b) => (a.scheduledAt || "9999").localeCompare(b.scheduledAt || "9999"));
  const calendarEvents = [
    ...applicationsList.flatMap((item) => [
      ...(item.plannedApplicationDate ? [{ date: item.plannedApplicationDate, type: "计划申请", title: `${item.company} · ${item.title}`, tone: "green" }] : []),
      ...(item.deadline ? [{ date: item.deadline, type: "申请截止", title: `${item.company} · ${item.title}`, tone: "red" }] : []),
      ...(item.followUpDate ? [{ date: item.followUpDate, type: "申请跟进", title: `${item.company} · ${item.title}`, tone: "gold" }] : []),
    ]),
    ...tasks.filter((item) => item.dueDate).map((item) => ({ date: item.dueDate, type: "任务", title: item.title, tone: item.status === "done" ? "gray" : "green" })),
    ...interviews.flatMap((item) => [
      ...(item.scheduledAt ? [{ date: item.scheduledAt.slice(0, 10), type: item.round, title: applicationById.get(item.applicationId)?.company ?? "面试", tone: "purple" }] : []),
      ...(item.thankYouDueAt && item.thankYouStatus === "未发送" ? [{ date: item.thankYouDueAt.slice(0, 10), type: "感谢信", title: applicationById.get(item.applicationId)?.company ?? "面试", tone: "gold" }] : []),
      ...(item.followUpAt ? [{ date: item.followUpAt.slice(0, 10), type: "面试跟进", title: applicationById.get(item.applicationId)?.company ?? "面试", tone: "blue" }] : []),
    ]),
    ...contacts.filter((item) => item.nextFollowUpAt).map((item) => ({ date: item.nextFollowUpAt, type: "联系人跟进", title: `${item.name} · ${item.company}`, tone: "blue" })),
  ].filter((item) => item.date.startsWith(calendarMonth)).sort((a, b) => a.date.localeCompare(b.date));

  const toggleSaved = async (id: number) => {
    const isSaved = saved.includes(id);
    setSaved((current) => isSaved ? current.filter((item) => item !== id) : [...current, id]);
    const response = await fetch(
      isSaved ? `/api/saved-jobs?jobId=${id}` : "/api/saved-jobs",
      {
        method: isSaved ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: isSaved ? undefined : JSON.stringify({ jobId: id }),
      },
    );
    if (!response.ok) await loadSavedJobs();
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
      interest: algorithmInterest(job),
      priority: algorithmPriority(job.score),
      deadline: job.deadline || "",
      deadlineType: job.deadlineType || "unknown",
      deadlineSource: job.deadline || job.deadlineType === "rolling" ? "automatic" : "unknown",
      workAuthorization: job.region === "美国" ? `Sponsorship：${job.visa}` : "中国工作资格",
      notes: job.evidence,
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
    const savedApplication = await response.json() as Application;
    const taskDueDate = savedApplication.plannedApplicationDate || savedApplication.deadline;
    if (savedApplication.id && taskDueDate && !tasks.some((task) => task.applicationId === savedApplication.id && task.title === "准备并提交申请")) {
      await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "task", applicationId: savedApplication.id, title: "准备并提交申请", dueDate: taskDueDate, reminderDate: taskDueDate, status: "pending", source: "automatic" }),
      });
      await loadWorkflow();
    }
    await loadApplications();
    setForm(null);
    if (form.status === "准备材料") {
      setView("saved");
      setSavedBucket("pending");
    } else if (form.status === "撤回" || form.status === "拒绝") {
      setView("today");
    } else {
      setView("applications");
    }
  };

  const deleteApplication = async (id?: number) => {
    if (!id || !window.confirm("确定删除这条申请记录吗？")) return;
    await fetch(`/api/applications?id=${id}`, { method: "DELETE" });
    await loadApplications();
  };

  const updateForm = (patch: Partial<Application>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  };

  const openTask = (application: Application, task?: ApplicationTask) => {
    if (!application.id) return;
    setTaskForm(task ?? {
      applicationId: application.id,
      title: "准备并提交申请",
      dueDate: application.plannedApplicationDate || application.deadline || "",
      reminderDate: application.plannedApplicationDate || application.deadline || "",
      status: "pending",
      source: "manual",
    });
  };

  const saveTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!taskForm) return;
    setWorkflowSaving(true);
    await fetch("/api/workflow", { method: taskForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", ...taskForm }) });
    setWorkflowSaving(false);
    setTaskForm(null);
    await loadWorkflow();
  };

  const toggleTask = async (task: ApplicationTask) => {
    await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", ...task, status: task.status === "done" ? "pending" : "done" }) });
    await loadWorkflow();
  };

  const openInterview = (application: Application, interview?: Interview) => {
    if (!application.id) return;
    setInterviewForm(interview ?? {
      applicationId: application.id,
      round: interviewStatuses.includes(application.status) ? application.status : "一面",
      scheduledAt: "",
      format: "Video",
      contactName: "",
      contactEmail: "",
      notes: "",
      outcome: "待进行",
      thankYouStatus: "未发送",
      thankYouDueAt: "",
      followUpAt: application.followUpDate,
    });
  };

  const saveInterview = async (event: FormEvent) => {
    event.preventDefault();
    if (!interviewForm) return;
    setWorkflowSaving(true);
    await fetch("/api/workflow", { method: interviewForm.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "interview", ...interviewForm }) });
    setWorkflowSaving(false);
    setInterviewForm(null);
    await loadWorkflow();
  };

  const openResearch = (company: string, careersUrl = "") => {
    const existing = researchRows.find((item) => item.company.toLowerCase() === company.toLowerCase());
    const source = findCompanySource(company);
    setResearchForm(existing ?? {
      company,
      website: source?.website ?? "",
      careersUrl: source?.careersUrl ?? careersUrl,
      businessSummary: "",
      recentNotes: "",
      personalNotes: "",
    });
  };

  const openContactForApplication = (application: Application) => {
    setContactForm({
      ...emptyContact,
      company: application.company,
      applicationId: application.id ?? null,
    });
  };

  const saveResearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!researchForm) return;
    setResearchSaving(true);
    const response = await fetch("/api/company-research", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(researchForm) });
    setResearchSaving(false);
    if (response.ok) {
      const savedResearch = await response.json() as CompanyResearch;
      setResearchRows((current) => [savedResearch, ...current.filter((item) => item.company.toLowerCase() !== savedResearch.company.toLowerCase())]);
      setResearchForm(null);
    }
  };

  const saveContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!contactForm) return;
    setContactSaving(true);
    const response = await fetch("/api/contacts", {
      method: contactForm.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contactForm),
    });
    setContactSaving(false);
    if (!response.ok) return;
    const savedContact = await response.json() as Contact;
    setContacts((current) => [savedContact, ...current.filter((item) => item.id !== savedContact.id)]);
    setContactForm(null);
  };

  const deleteContact = async (id?: number) => {
    if (!id || !window.confirm("确定删除这个联系人吗？")) return;
    await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
    setContacts((current) => current.filter((item) => item.id !== id));
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
    setRequestMessage("核验已完成；符合条件且仍开放的岗位已同步到公司池和今日岗位。");
    const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
    if (jobsResponse.ok) setDailyJobs(await jobsResponse.json());
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
    setRequestMessage("核验已更新；符合条件且仍开放的岗位已同步到公司池和今日岗位。");
    const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
    if (jobsResponse.ok) setDailyJobs(await jobsResponse.json());
    await loadRequests();
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
        <button
          className={`notification-button ${unreadNoticeCount ? "has-unread" : ""}`}
          onClick={() => {
            setNoticePanelOpen((current) => !current);
            markNoticesRead();
          }}
          aria-label={`扫描通知${unreadNoticeCount ? `，${unreadNoticeCount} 条未读` : ""}`}
        >
          ♢{unreadNoticeCount > 0 && <b>{unreadNoticeCount}</b>}
        </button>
      </header>

      {noticePanelOpen && (
        <section className="notification-panel" aria-label="扫描通知中心">
          <div className="notification-panel-head">
            <div><p className="eyebrow">SCAN NOTIFICATIONS</p><h2>扫描通知</h2></div>
            {!browserNotificationsEnabled && (
              <button onClick={() => void enableBrowserNotifications()}>开启浏览器提醒</button>
            )}
          </div>
          {notices.length === 0 ? (
            <p className="notification-empty">下一次扫描完成或失败后，这里会保留通知。</p>
          ) : (
            <div className="notification-list">
              {notices.map((notice) => (
                <article key={notice.id} className={`notification-item notification-${notice.kind}`}>
                  <span />
                  <div><strong>{notice.title}</strong><p>{notice.body}</p><small>{formatNewYorkTime(notice.createdAt)}（美东时间）</small></div>
                </article>
              ))}
            </div>
          )}
          <p className="notification-help">站内通知会保留最近 20 条。浏览器提醒需要此设备授权，并在网站可运行时发送。</p>
        </section>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">每日 6:00 · 美国东部时间</p>
          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "收藏与待提交" : view === "companies" ? "公司研究与面经" : view === "collect" ? "自动采集中心" : view === "verify" ? "岗位核验" : view === "profile" ? "个人资料" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>
          <p className="hero-copy">
            {view === "applications"
              ? "在这里更新每一次投递、跟进和面试，并集中查看所有求职日程。"
              : view === "saved"
                ? "收藏岗位与已经建立记录但尚未提交的岗位分别管理。"
              : view === "companies"
                ? `公司池共 ${companyRecords.length} 条；自动汇总官网、招聘入口、岗位记录与历年公开面经。`
                : view === "collect"
                  ? "官网与标准招聘系统在云端扫描；需要登录的平台由你的 Mac 本地采集后自动同步。"
                : view === "verify"
                  ? "提交岗位、查看统一核验队列，并在同一页监控自动数据质检。"
                  : view === "profile"
                    ? "集中维护个人信息、标准技能清单和用于定制申请材料的基础 CV。"
                  : view === "ignored"
                    ? "这些岗位不会在之后的每日搜索中再次出现。"
                : "今天只看真正值得你花时间申请的岗位。"}
          </p>
        </div>
        <div className="scan-status">
          <span className="pulse" />
          <div><strong>{view === "companies" ? "公司与面经" : view === "applications" ? "本月活动" : view === "collect" ? "多来源采集" : view === "profile" ? "私有资料" : view === "verify" ? "核验与质检" : "自动更新"}</strong><span>{view === "companies" ? `${companyRecords.length} 家 · ${experiences.length} 条面经` : view === "applications" ? `${calendarEvents.length} 项` : view === "collect" ? `BOSS 已同步 ${bossJobs.length} 个` : view === "profile" ? "仅你的账户可见" : view === "verify" ? `${requests.length + qualityQueueIssues.length} 条队列记录` : "每日 06:00"}</span></div>
        </div>
      </section>

      {view === "applications" && (
        <section className="stats" aria-label="申请概览">
          <button className={applicationBucket === "submitted" ? "active" : ""} onClick={() => setApplicationBucket("submitted")}><span>已提交申请</span><strong>{appliedCount}</strong><em>仅已提交，未进入面试</em></button>
          <button className={applicationBucket === "interview" ? "active" : ""} onClick={() => setApplicationBucket("interview")}><span>面试中</span><strong>{interviewingCount}</strong><em>一面至终面</em></button>
          <button className={applicationBucket === "offer" ? "active" : ""} onClick={() => setApplicationBucket("offer")}><span>Offer</span><strong>{offerCount}</strong><em>已收到 Offer</em></button>
        </section>
      )}

      {view === "applications" && (
        <section className="analytics-section" aria-label="申请漏斗和来源成功率">
          <div className="section-heading analytics-heading">
            <div><p className="eyebrow">APPLICATION ANALYTICS</p><h2>申请漏斗与来源成功率</h2></div>
            <div className="export-actions" aria-label="完整数据导出">
              <a href="/api/export?format=csv">CSV</a>
              <a href="/api/export?format=xlsx">Excel</a>
              <a href="/api/export?format=json">JSON</a>
              <a href="/api/export?format=sqlite">SQLite</a>
            </div>
          </div>
          <p className="analytics-note">漏斗按每份申请曾达到的最高阶段累计；来源转化率以已投递数量为分母。完整导出包含岗位、申请、状态历史、核验、自动质检、收藏、忽略、扫描、个人资料与 CV 元数据，不包含 CV 文件本体。</p>
          {analyticsLoading && !analytics ? (
            <div className="analytics-loading">正在计算申请分析…</div>
          ) : (
            <div className="analytics-grid">
              <article className="analytics-card funnel-card">
                <div className="analytics-card-title"><strong>申请漏斗</strong><span>{analytics?.totals.submitted ?? 0} 份已投递</span></div>
                <div className="funnel-list">
                  {(analytics?.funnel ?? []).map((step, index, rows) => {
                    const maximum = Math.max(1, rows[0]?.count ?? 0);
                    const previous = index === 0 ? step.count : rows[index - 1].count;
                    const conversion = previous > 0 ? Math.round((step.count / previous) * 1000) / 10 : 0;
                    return (
                      <div className="funnel-row" key={step.key}>
                        <div><span>{step.label}</span><strong>{step.count}</strong></div>
                        <div className="funnel-track"><span style={{ width: `${Math.max(step.count > 0 ? 7 : 0, (step.count / maximum) * 100)}%` }} /></div>
                        <em>{index === 0 ? "基准" : `${conversion}%`}</em>
                      </div>
                    );
                  })}
                </div>
                <div className="terminal-summary">
                  <span>当前拒绝 <strong>{analytics?.totals.rejected ?? 0}</strong></span>
                  <span>当前撤回 <strong>{analytics?.totals.withdrawn ?? 0}</strong></span>
                  <span>待提交 <strong>{analytics?.totals.pending ?? 0}</strong></span>
                </div>
              </article>

              <article className="analytics-card source-card">
                <div className="analytics-card-title"><strong>来源成功率</strong><span>按样本量排序</span></div>
                {(analytics?.sources.length ?? 0) === 0 ? (
                  <p className="analytics-empty">有已投递记录后，这里会按来源显示面试率和 Offer 率。</p>
                ) : (
                  <div className="source-table" role="table" aria-label="申请来源成功率">
                    <div className="source-table-row source-table-head" role="row">
                      <span>来源</span><span>申请</span><span>面试</span><span>Offer</span>
                    </div>
                    {analytics?.sources.map((source) => (
                      <div className="source-table-row" role="row" key={source.source}>
                        <strong>{source.source}<small>样本 n={source.applications}</small></strong>
                        <span>{source.applications}</span>
                        <span>{source.interviewRate}%<small>{source.interviews} 份</small></span>
                        <span>{source.offerRate}%<small>{source.offers} 份</small></span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>
          )}
          <p className="history-note">状态历史从本功能启用后持续记录；旧记录以启用时的当前状态作为起点，因此旧的拒绝记录若此前进入过面试，需再次更新状态后才能完整反映历史路径。</p>
        </section>
      )}

      {view === "saved" && (
        <section className="stats stats-two" aria-label="收藏概览">
          <button className={savedBucket === "saved" ? "active" : ""} onClick={() => setSavedBucket("saved")}><span>收藏</span><strong>{saved.length}</strong><em>已收藏的可申请岗位</em></button>
          <button className={savedBucket === "pending" ? "active" : ""} onClick={() => setSavedBucket("pending")}><span>待提交申请</span><strong>{pendingApplications.length}</strong><em>已记录，尚未提交</em></button>
        </section>
      )}

      {view === "applications" && (
        <section className="workflow-section" aria-label="任务与面试日程">
          <div className="section-heading">
            <div><p className="eyebrow">SCHEDULE & FOLLOW-UP</p><h2>任务与面试日程</h2></div>
          </div>
          <div className="workflow-grid">
            <article className="workflow-card">
              <div className="workflow-card-head"><strong>待办任务</strong><span>{pendingTasks.length} 项未完成</span></div>
              {pendingTasks.length === 0 ? <p className="workflow-empty">暂无待办。可从任意申请记录新增任务。</p> : pendingTasks.slice(0, 8).map((task) => {
                const application = applicationById.get(task.applicationId);
                return <div className="workflow-row" key={`task-${task.id}`}>
                  <button className="task-check" onClick={() => void toggleTask(task)} aria-label="标记任务完成">○</button>
                  <div><strong>{task.title}</strong><span>{application?.company ?? "申请记录"} · {task.dueDate || "未设截止日期"}</span></div>
                  <button className="row-edit" onClick={() => setTaskForm(task)}>编辑</button>
                </div>;
              })}
            </article>
            <article className="workflow-card">
              <div className="workflow-card-head"><strong>面试与跟进</strong><span>{upcomingInterviews.length} 场待进行</span></div>
              {upcomingInterviews.length === 0 ? <p className="workflow-empty">暂无待进行面试。进入面试阶段后可记录时间和联系人。</p> : upcomingInterviews.slice(0, 8).map((interview) => {
                const application = applicationById.get(interview.applicationId);
                return <div className="workflow-row" key={`interview-${interview.id}`}>
                  <span className="interview-dot">●</span>
                  <div><strong>{interview.round} · {application?.company ?? "面试"}</strong><span>{interview.scheduledAt ? new Date(interview.scheduledAt).toLocaleString("zh-CN") : "时间未设置"} · {interview.contactName || "联系人未填写"}</span></div>
                  <button className="row-edit" onClick={() => setInterviewForm(interview)}>编辑</button>
                </div>;
              })}
            </article>
          </div>
        </section>
      )}

      {view === "applications" && (
        <section className="workspace-section embedded-calendar" aria-label="求职活动日历">
          <div className="section-heading">
            <div><p className="eyebrow">JOB SEARCH CALENDAR</p><h2>求职活动日历</h2></div>
            <input className="month-picker" type="month" value={calendarMonth} onChange={(event) => setCalendarMonth(event.target.value)} />
          </div>
          <div className="calendar-summary"><strong>{calendarEvents.length}</strong><span>项活动</span><p>申请计划、截止日期、任务、面试、感谢信与联系人跟进按日期合并显示。</p></div>
          <div className="calendar-list">
            {calendarEvents.length === 0 ? <div className="empty-state"><span>□</span><h3>这个月没有安排</h3><p>新增任务、面试或跟进日期后会自动出现在这里。</p></div> : calendarEvents.map((event, index) => (
              <article className="calendar-row" key={`${event.date}-${event.type}-${index}`}>
                <time><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString("zh-CN", { day: "2-digit" })}</strong><span>{new Date(`${event.date}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" })}</span></time>
                <i className={`calendar-dot ${event.tone}`} />
                <div><span>{event.type}</span><h3>{event.title}</h3></div>
              </article>
            ))}
          </div>
        </section>
      )}

      {view === "today" && (
        <section className="scan-dashboard" aria-label="岗位扫描入口">
          <div className="scan-dashboard-head">
            <div><strong>真实招聘数据</strong><p>美国来源与中国来源独立运行、独立显示进度，结果进入同一个岗位库统一去重。</p></div>
            <button className="ignored-list-link" onClick={() => setView("ignored")}>忽略名单 {ignoredJobs.length}</button>
          </div>
          <article className="scan-lane scan-lane-us">
            <div className="scan-lane-head">
              <div><span>美国岗位更新</span><p>{jobsMessage || "扫描美国公司 ATS、JobSpy 聚合平台和美国公司官网。"}</p></div>
              <button className="refresh-jobs" onClick={() => setRefreshConfirmationOpen(true)} disabled={jobsRefreshing || scanRunning}>
                更新美国岗位
              </button>
            </div>
            <div className={`scan-summary scan-summary-${scanStatus?.state ?? "idle"}`} aria-live="polite">
            <span className="scan-summary-dot" />
            <div>
              {scanRunning ? (
                <>
                  <strong>更新进行中</strong>
                  <p>
                    ATS 已筛出 {scanStatus?.atsMatched ?? 0} 个候选；GitHub 正在搜索、核验并回写。
                    已运行 {formatDuration(scanElapsedSeconds)}，距离本次 60 分钟上限还剩 {formatDuration(scanRemainingSeconds)}。
                  </p>
                </>
              ) : scanStatus?.state === "completed" ? (
                <>
                  <strong>上次回写完成：{formatNewYorkTime(scanStatus.completedAt)}（美东时间）</strong>
                  <p>
                    本轮新增 {scanStatus.created} 个岗位、更新 {scanStatus.updated} 个；岗位库现有 {scanStatus.totalJobs} 条记录。
                  </p>
                </>
              ) : scanStatus?.state === "failed" ? (
                <>
                  <strong>上次更新失败：{formatNewYorkTime(scanStatus.completedAt)}（美东时间）</strong>
                  <p>{scanStatus.message || "GitHub Actions 未完成回写，请查看运行日志。"}</p>
                </>
              ) : (
                <>
                  <strong>尚无完整回写记录</strong>
                  <p>下一次更新开始后，这里会显示 ATS 结果、GitHub 进度和完成时间。</p>
                </>
              )}
            </div>
            </div>
          </article>
          <article className="scan-lane scan-lane-china">
            <div className="scan-lane-head">
              <div><span>中国岗位更新</span><p>BOSS、猎聘、智联、51job、拉勾、牛客、国聘、应届生及中国公司官网。</p></div>
              <button className="refresh-jobs china-scan-button" onClick={() => void startChinaScan()} disabled={chinaScanStarting || chinaScanRunning}>
                更新中国岗位
              </button>
            </div>
            {showChinaControlSummary ? (
            <div className={`scan-summary china-control-summary scan-summary-${chinaScanControl?.state ?? "idle"}`} aria-live="polite">
            <span className="scan-summary-dot" />
            <div>
              <strong>
                {chinaScanControl?.state === "queued" ? "中国岗位扫描已排队" : chinaScanControl?.state === "running" ? "Mac 正在扫描中国招聘平台" : chinaScanControl?.state === "completed" ? "最近一次网站发起的中国扫描已完成" : chinaScanControl?.state === "attention_required" ? "中国扫描完成，但有来源需要处理" : chinaScanControl?.state === "failed" ? "最近一次中国扫描失败" : "中国岗位扫描等待启动"}
              </strong>
              <p>{chinaScanControl?.message || "点击“更新中国岗位”，Mac 后台服务会自动领取任务；Mac 关机时任务会保留到下次登录。"}</p>
              {chinaProgress && chinaScanControl?.state === "running" && (
                <>
                  <div className="scan-progress-track" aria-label={`当前阶段完成 ${Math.round(chinaProgressRatio * 100)}%`}>
                    <span style={{ width: `${Math.max(2, chinaProgressRatio * 100)}%` }} />
                  </div>
                  <div className="scan-live-metrics">
                    <span>当前来源<b>{chinaProgress.source || "中国多来源"}</b></span>
                    <span>进度<b>{chinaProgress.completed}/{chinaProgress.total || "?"}</b></span>
                    <span>已扫描<b>{chinaProgress.scanned}</b></span>
                    <span>去重后<b>{chinaProgress.unique}</b></span>
                    <span>初筛排除<b>{chinaProgress.filtered}</b></span>
                    <span>待抓详情<b>{chinaProgress.detailCandidates}</b></span>
                    <span>筛选保留<b>{chinaProgress.eligible}</b></span>
                    <span>新增<b>{chinaProgress.created}</b></span>
                  </div>
                  <p className="scan-eta">已运行 {formatDuration(chinaElapsedSeconds)}{chinaEtaSeconds > 0 ? `，按当前阶段速度估计还需约 ${formatDuration(chinaEtaSeconds)}` : ""}。</p>
                  {Object.keys(chinaProgress.rejectionReasons || {}).length > 0 && (
                    <p className="scan-rejections">
                      排除原因：标题不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资或排除岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；学历、经验或技能不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}；分数不足 {chinaProgress.rejectionReasons.score_below_discovery_threshold ?? 0}。
                    </p>
                  )}
                </>
              )}
            </div>
            </div>
            ) : (
            <div className={`scan-summary china-scan-summary scan-summary-${chinaScanStatus?.status ?? "idle"}`} aria-live="polite">
            <span className="scan-summary-dot" />
            <div>
              {chinaScanStatus ? (
                <>
                  <strong>
                    中国多来源扫描{chinaScanStatus.status === "completed" ? "完成" : chinaScanStatus.status === "partial" ? "部分完成" : "失败"}：{formatNewYorkTime(chinaScanStatus.finishedAt)}（美东时间）
                  </strong>
                  <p>
                    发现 {chinaScanStatus.jobsDiscovered} 个，筛选后 {chinaScanStatus.jobsEligible} 个；新增 {chinaScanStatus.jobsCreated} 个，更新或重复 {chinaScanStatus.jobsUpdatedOrDuplicate} 个。
                    {chinaScanStatus.sourcesFailed > 0 ? ` ${chinaScanStatus.sourcesFailed} 个来源需要处理。` : ""}
                  </p>
                  {chinaScanStatus.results.length > 0 && (
                    <div className="china-source-results">
                      {chinaScanStatus.results.map((item, index) => (
                        <span key={`${item.source ?? "source"}-${index}`} className={item.status === "completed" ? "source-ok" : "source-warning"}>
                          {item.source || "未知来源"}：新增 {item.jobsCreated ?? item.jobs_created ?? 0}
                          {(item.rejectionReasons ?? item.rejection_reasons)?.title_not_targeted ? ` · 标题排除 ${(item.rejectionReasons ?? item.rejection_reasons)?.title_not_targeted}` : ""}
                          {item.attention ? " · 需处理" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <strong>尚无中国多来源扫描报告</strong>
                  <p>点击上方按钮后，岗位会自动进入今日岗位，分来源汇总也会自动显示在这里。</p>
                </>
              )}
            </div>
            </div>
            )}
          </article>
        </section>
      )}

      {(view === "today" || view === "saved") && (
        <>
          <section className="toolbar">
            <div className="section-heading">
              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? (savedBucket === "saved" ? "我的收藏" : "我的待提交申请") : `今日岗位（${jobs.length}）`}</h2></div>
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
          </section>
          {view === "saved" && savedBucket === "pending" ? (
            <section className="application-list" aria-live="polite">
              {pendingApplications.length === 0 ? (
                <div className="empty-state"><span>▤</span><h3>没有待提交申请</h3><p>加入申请追踪但尚未提交的记录会显示在这里。</p></div>
              ) : pendingApplications.map((item) => (
                <article className="application-card" key={item.id}>
                  <div className="application-head">
                    <div><span className={`status status-${item.status}`}>{item.status}</span><h3>{item.title}</h3><p>{item.company} · {item.location || item.region}</p></div>
                    <span className="priority">{item.priority}</span>
                  </div>
                  <div className="application-details">
                    <span><b>匹配度</b>{item.fit}/5</span>
                    <span><b>状态</b>待提交申请</span>
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
              ))}
            </section>
          ) : <section className={`job-list ${view === "saved" ? "saved-job-list" : ""}`} aria-live="polite">
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
            {visibleJobCount < jobs.length && (
              <button className="load-more-button" onClick={() => setVisibleJobCount((current) => current + 20)}>
                再显示 20 个岗位 <span>已显示 {visibleJobs.length} / {jobs.length}</span>
              </button>
            )}
          </section>}
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
            <div>
              <p className="eyebrow">APPLICATION TRACKER</p>
              <h2>{applicationBucket === "submitted" ? "我的申请" : applicationBucket === "interview" ? "我的面试" : applicationBucket === "offer" ? "我的 Offer" : "拒绝记录"}</h2>
            </div>
            <div className="section-actions">
              <button className={`quiet-list-button ${applicationBucket === "rejected" ? "active" : ""}`} onClick={() => setApplicationBucket("rejected")}>拒绝记录 {rejectedApplications.length}</button>
            </div>
          </div>
          {visibleApplications.length === 0 ? (
            <div className="empty-state"><span>▤</span><h3>{applicationBucket === "rejected" ? "没有拒绝记录" : "还没有申请记录"}</h3><p>{applicationBucket === "rejected" ? "被拒绝的岗位会保留在这个隐藏列表中。" : "发现具体 JD 后新增一条，之后直接在这里更新状态。"}</p></div>
          ) : (
            <div className="application-list">
              {visibleApplications.map((item) => (
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
                    <span><b>申请截止</b>{deadlineLabel(item.deadline, item.deadlineType)}</span>
                  </div>
                  {item.notes && <p className="record-note">{item.notes}</p>}
                  <div className="record-actions">
                    {item.jobUrl && <a href={item.jobUrl} target="_blank" rel="noreferrer">打开 JD ↗</a>}
                    <button onClick={() => openTask(item)}>新增任务</button>
                    <button onClick={() => openInterview(item)}>记录面试</button>
                    <button onClick={() => openContactForApplication(item)}>新增联系人</button>
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
          <div className="company-source-guide">
            <div><strong>当前入口与历史语料严格分开</strong><span>公司池只展示今天可重新检查的官网和招聘入口；历史 JD 不作为当前开放证据，也不会出现在公司卡片里。</span></div>
            <div><strong>面经已合并</strong><span>公司特异面经显示在对应公司档案，通用岗位面经集中放在本页底部；每条同时提供原始来源与备用搜索。</span></div>
          </div>
          <div className="company-filters">
            <input value={companyQuery} onChange={(event) => setCompanyQuery(event.target.value)} placeholder="搜索公司、职位关键词或赛道" aria-label="搜索目标公司" />
            <select value={companyRegion} onChange={(event) => setCompanyRegion(event.target.value)}>
              <option>全部地区</option><option>美国</option><option>中国</option>
            </select>
            <select value={companyPriority} onChange={(event) => setCompanyPriority(event.target.value)}>
              <option>全部</option><option>P1</option><option>P2</option><option>P3</option>
            </select>
            <select value={companyCollection} onChange={(event) => setCompanyCollection(event.target.value)}>
              <option value="全部接入状态">全部接入状态</option>
              <option value="structured">可直接接入</option>
              <option value="public-page">官网职位页</option>
              <option value="manual">需人工核实</option>
            </select>
          </div>
          <p className="result-count">显示 {companies.length} / {companyRecords.length} 条目标公司记录</p>
          <div className="company-list">
            {companies.map((company) => {
              const companyJobs = dailyJobs.filter((job) => job.company.toLowerCase() === company.company.toLowerCase());
              const companyApplications = applicationsList.filter((item) => item.company.toLowerCase() === company.company.toLowerCase());
              const companyApplicationIds = new Set(companyApplications.map((item) => item.id).filter(Boolean));
              const companyInterviews = interviews.filter((item) => companyApplicationIds.has(item.applicationId));
              const research = researchRows.find((item) => item.company.toLowerCase() === company.company.toLowerCase());
              const source = findCompanySource(company.company);
              const collectionMode = companyCollectionMode(source);
              const website = research?.website || source?.website || "";
              const careersUrl = research?.careersUrl || source?.careersUrl || "";
              const companyExperiences = experiences.filter((item) => sameCompany(item.company, company.company));
              const companyContacts = contacts.filter((item) => item.applicationId && companyApplicationIds.has(item.applicationId));
              return (
              <article className="company-card" key={`${company.rank}-${company.company}`}>
                <div className="company-card-head">
                  <div><span>{company.priority} · 匹配 {company.fit}/5 · {company.region}</span><h3>{company.company}</h3><p>{company.companyType} · {normalizeTrack(company.track)}</p></div>
                  <button onClick={() => openResearch(company.company, careersUrl || companyJobs[0]?.jobUrl || "")}>编辑研究备注</button>
                </div>
                <div className="company-metrics"><span>当前岗位 <b>{companyJobs.length}</b></span><span>申请 <b>{companyApplications.length}</b></span><span>面试 <b>{companyInterviews.length}</b></span><span>联系人 <b>{companyContacts.length}</b></span><span>面经 <b>{companyExperiences.length}</b></span></div>
                <div className="company-links">
                  {website ? <a href={website} target="_blank" rel="noreferrer">公司官网 ↗</a> : <span>官网待核实</span>}
                  {careersUrl ? <a href={careersUrl} target="_blank" rel="noreferrer">{collectionMode === "structured" ? "结构化招聘系统" : collectionMode === "public-page" ? "官方招聘页" : "招聘入口（需核实）"} ↗</a> : companyJobs[0]?.jobUrl ? <a href={companyJobs[0].jobUrl} target="_blank" rel="noreferrer">当前已核验 JD ↗</a> : <a href={companySourceSearchUrl(company.company)} target="_blank" rel="noreferrer">搜索当前官方招聘页 ↗</a>}
                  <em className={`collection-state collection-${collectionMode}`}>{collectionMode === "structured" ? "可直接接入 · 每次重新核验" : collectionMode === "public-page" ? "官网职位页 · 待连续验证" : "需人工核实 · 不自动认定开放"}</em>
                </div>
                <details>
                  <summary>查看公司研究、岗位与面经</summary>
                  <div className="company-detail">
                    <b>业务概况</b><p>{research?.businessSummary || "尚未填写公司业务概况。"}</p>
                    <b>近期动态</b><p>{research?.recentNotes || "尚未记录近期动态。"}</p>
                    <b>我的备注</b><p>{research?.personalNotes || "尚未添加个人备注。"}</p>
                    <b>建议搜索</b><p>{company.keywords}</p><b>适合你的原因</b><p>{company.reason}</p><b>申请策略</b><p>{company.strategy}</p>
                    <div className="company-related-records">
                      <section>
                        <h4>当前岗位与申请记录</h4>
                        {companyJobs.slice(0, 5).map((job) => <a key={job.id} href={job.jobUrl} target="_blank" rel="noreferrer">{job.title} · {job.location || job.region} ↗</a>)}
                        {companyApplications.slice(0, 5).map((application) => <span key={`application-${application.id}`}>{application.status} · {application.title}</span>)}
                        {!companyJobs.length && !companyApplications.length && <span>目前没有岗位或申请记录。</span>}
                      </section>
                      <section>
                        <h4>历年公开面经</h4>
                        {companyExperiences.map((item) => <article className="company-experience" key={item.id}>
                          <div><strong>{item.roleTitle}</strong><span>{item.year} · {item.source} · {item.roleFamily}</span></div>
                          <p>{item.summary}</p>
                          <div className="topic-tags">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
                          <small>{item.reliability}{item.source === "Glassdoor" || item.source === "一亩三分地" ? "；源站可能要求登录" : ""}</small>
                          <div className="record-actions"><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source === "Glassdoor" ? "打开公司面经页" : "打开原始来源"} ↗</a><a href={experienceSearchUrl(item)} target="_blank" rel="noreferrer">按岗位搜索 ↗</a></div>
                        </article>)}
                        {!companyExperiences.length && <span>尚未收集到该公司的公开面经；后续搜索会自动补入。</span>}
                      </section>
                    </div>
                  </div>
                </details>
              </article>
              );
            })}
          </div>
          <section className="general-experiences">
            <div className="section-heading compact"><div><p className="eyebrow">ROLE-FAMILY INTERVIEWS</p><h2>通用岗位面经</h2></div><span>{experiences.filter((item) => item.company === "通用" || item.company.includes("中国数据科学")).length} 条</span></div>
            <div className="experience-grid">
              {experiences.filter((item) => item.company === "通用" || item.company.includes("中国数据科学")).map((item) => <article className="experience-card" key={item.id}>
                <div className="experience-meta"><span>{item.source} · {item.year}</span><em>{item.roleFamily}</em></div>
                <h3>{item.roleTitle}</h3><p>{item.summary}</p>
                <div className="topic-tags">{item.topics.map((topic) => <span key={topic}>{topic}</span>)}</div>
                <small>{item.reliability}</small>
                <div className="record-actions"><a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.source === "Glassdoor" ? "打开公司面经页" : "打开原始来源"} ↗</a><a href={experienceSearchUrl(item)} target="_blank" rel="noreferrer">按岗位搜索 ↗</a></div>
              </article>)}
            </div>
          </section>
        </section>
      )}

      {view === "collect" && (
        <section className="collector-section">
          <div className="collector-grid">
            <article className="collector-card collector-live">
              <div className="collector-card-head"><span className="collector-dot" /><strong>云端自动扫描</strong><em>每天 06:00 美东时间</em></div>
              <h2>公司官网与标准 ATS</h2>
              <p>自动扫描已核实的 Workday、Greenhouse、Lever、Ashby、iCIMS 等入口，并对岗位去重、筛选和重新核验。</p>
              <div className="collector-metrics"><span>公司池 <b>{companyRecords.length}</b></span><span>当前岗位 <b>{dailyJobs.length}</b></span></div>
              <button onClick={() => void refreshJobs()} disabled={jobsRefreshing}>{jobsRefreshing ? "扫描已启动" : "立即运行一次"}</button>
            </article>

            <article className="collector-card collector-local">
              <div className="collector-card-head"><span className="collector-dot" /><strong>中国平台本地采集</strong><em>{latestBossCheck ? `最近同步 ${formatNewYorkTime(latestBossCheck)}` : "等待首次同步"}</em></div>
              <h2>网站发起，Mac 自动执行</h2>
              <p>独立 Chrome 在你的 Mac 上保留 BOSS 登录态。点击网站按钮后，后台服务轮换搜索 BOSS 及其他中国来源，只同步岗位信息，不上传 Cookie 或招聘者资料。</p>
              <div className="collector-metrics"><span>已同步岗位 <b>{bossJobs.length}</b></span><span>当前状态 <b>{chinaScanRunning ? "运行中" : "待命"}</b></span></div>
              <div className="collector-actions">
                <button className="primary" onClick={() => void startChinaScan()} disabled={chinaScanStarting || chinaScanRunning}>更新中国岗位</button>
                <a href="/api/collector-config">下载私有配置</a>
                <a href="https://github.com/XinyuIvy/ivy-job-radar/tree/main/local-collector" target="_blank" rel="noreferrer">查看安装说明 ↗</a>
              </div>
            </article>
          </div>

          <div className="collector-steps">
            <div><span>1</span><strong>下载私有配置</strong><p>配置只给当前登录的站点所有者下载，不会写入 GitHub。</p></div>
            <div><span>2</span><strong>首次登录 BOSS</strong><p>在专用 Chrome 中登录一次；登录状态保存在你的 Mac。</p></div>
            <div><span>3</span><strong>安装后台服务</strong><p>以后只需点击网站按钮；Mac 登录后自动领取任务，遇到验证码或风控会停止并提示。</p></div>
          </div>

          <aside className="collector-boundary">
            <strong>自动化边界</strong>
            <p>采集器不会绕过验证码，不会抓取招聘者姓名、在线状态或联系方式，也不会自动打招呼、发消息或投递。BOSS 当前岗位会标记为平台来源，不能当作公司官网已核验岗位。</p>
          </aside>
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
              <p>{requestMessage || "有公开链接时会立即核验；核验通过的公司进入公司池，仍开放的岗位同时进入今日岗位。"}</p>
              <button disabled={requestSaving}>{requestSaving ? "正在读取 JD…" : "提交并核验"}</button>
            </div>
          </form>

          <div className="request-list">
            <div className="section-heading compact"><div><p className="eyebrow">VERIFICATION QUEUE</p><h2>核验队列</h2></div><span>{requests.length + qualityQueueIssues.length} 条</span></div>
            {requests.length + qualityQueueIssues.length === 0 ? (
              <div className="empty-state"><span>✓</span><h3>暂无待核验岗位</h3><p>提交后会在这里显示核验状态和结论。</p></div>
            ) : <>
            {requests.map((item) => (
              <article className="request-card" key={`request-${item.id}`}>
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
            {qualityQueueIssues.map((issue) => (
              <article className="request-card" key={`quality-${issue.jobId}`}>
                <div>
                  <span className="verify-status">{issue.automationStatus === "needs_review" ? "需复核" : issue.automationStatus === "retrying" ? "等待重试" : "自动核验中"}</span>
                  <h3>{issue.title}</h3>
                  <p>{issue.company}</p>
                </div>
                <p className="verification-note">{issue.label}：{issue.detail}</p>
                {issue.lastError && <p className="request-note">{issue.lastError}</p>}
                <div className="record-actions">
                  <span className="quality-date">{issue.automationStatus === "needs_review" ? "自动处理无法可靠判断" : issue.automationStatus === "retrying" ? `已尝试 ${issue.attempts} 次，将自动重试` : "系统正在读取并回写原岗位"}</span>
                  {issue.jobUrl && <a href={issue.jobUrl} target="_blank" rel="noreferrer">打开原 JD ↗</a>}
                </div>
              </article>
            ))}
            </>}
          </div>

          <div className="quality-section embedded-quality-section">
            <div className="section-heading"><div><p className="eyebrow">AUTOMATED DATA QUALITY</p><h2>自动数据质检</h2></div></div>
          {qualityLoading && !quality ? (
            <div className="empty-state"><span>◌</span><h3>正在审计岗位数据</h3><p>请稍等。</p></div>
          ) : quality ? (
            <>
              <div className="quality-summary">
                <article><span>岗位总数</span><strong>{quality.totalJobs}</strong><em>数据库内全部记录</em></article>
                <article><span>数据健康</span><strong>{quality.healthyJobs}</strong><em>当前没有质量问题</em></article>
                <article><span>系统处理中</span><strong>{quality.autoProcessing + quality.retryingJobs}</strong><em>{qualityAutomationRunning ? "正在自动补全与回写" : "等待下一次自动运行"}</em></article>
                <article><span>需要你判断</span><strong>{quality.manualReview}</strong><em>仅保留自动化无法可靠判断的例外</em></article>
              </div>
              <div className="quality-automation-note">
                <strong>{qualityAutomationRunning ? "自动质检正在运行" : "自动质检已完成当前可处理项目"}</strong>
                <span>系统会自动访问原 JD、补全信息、按失败原因重试，并将结果回写原岗位。核验不会创建申请记录。</span>
              </div>
              <div className="quality-monitor-grid">
                <article className="quality-run-panel">
                  <div className="workflow-card-head"><strong>最近自动运行</strong><span>最多显示 8 轮</span></div>
                  {(quality.runs ?? []).slice(0, 8).map((run) => <div className="quality-run-row" key={run.id}>
                    <span>{new Date(run.completedAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <b>处理 {run.processed}</b><em>修复 {run.resolved}</em><em>重试 {run.retrying}</em><em>人工 {run.needsReview}</em>
                  </div>)}
                  {!(quality.runs ?? []).length && <p className="workflow-empty">下一轮自动质检完成后开始记录趋势。</p>}
                </article>
                <article className="quality-run-panel">
                  <div className="workflow-card-head"><strong>当前失败原因</strong><span>按出现次数排序</span></div>
                  {((quality.runs ?? [])[0]?.failureReasons ?? []).map((reason) => <div className="failure-row" key={reason.reason}><span>{reason.reason}</span><b>{reason.count}</b></div>)}
                  {!((quality.runs ?? [])[0]?.failureReasons ?? []).length && <p className="workflow-empty">当前没有已记录的自动读取失败。</p>}
                </article>
              </div>
            </>
          ) : (
            <div className="empty-state"><span>!</span><h3>质量审计读取失败</h3><p>请刷新页面后重试。</p></div>
          )}
          </div>
        </section>
      )}

      {view === "profile" && (
        <section className="profile-section">
          {profileLoading ? (
            <div className="empty-state"><span>◌</span><h3>正在读取个人资料</h3><p>请稍等。</p></div>
          ) : (
            <>
              <form className="profile-form" onSubmit={saveProfile}>
                <article className="profile-card">
                  <div className="section-heading compact">
                    <div><p className="eyebrow">PERSONAL INFORMATION</p><h2>基本信息</h2></div>
                    <span>私有</span>
                  </div>
                  <div className="profile-grid">
                    <label>姓名<input value={profile.fullName} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} placeholder="例如 Xinyu Zhang" /></label>
                    <label>登录邮箱<input value={profile.userEmail} disabled /></label>
                    <label>所在地<input value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} placeholder="城市、州或国家" /></label>
                    <label>工作授权<input value={profile.workAuthorization} onChange={(event) => setProfile({ ...profile, workAuthorization: event.target.value })} placeholder="例如 F-1 OPT" /></label>
                    <label className="full">Sponsorship 需求<input value={profile.sponsorshipNeed} onChange={(event) => setProfile({ ...profile, sponsorshipNeed: event.target.value })} placeholder="例如美国岗位需要长期 sponsorship" /></label>
                    <label className="full">教育背景<textarea value={profile.education} onChange={(event) => setProfile({ ...profile, education: event.target.value })} placeholder="学位、专业、学校和预计毕业时间" /></label>
                    <label className="full">目标岗位<input value={profile.targetRoles} onChange={(event) => setProfile({ ...profile, targetRoles: event.target.value })} placeholder="例如 Biostatistician、Data Scientist、Quantitative Researcher" /></label>
                    <label className="full">目标行业<input value={profile.targetIndustries} onChange={(event) => setProfile({ ...profile, targetIndustries: event.target.value })} placeholder="例如 Pharma、Healthcare AI、Technology" /></label>
                    <label className="full">职业概述<textarea value={profile.professionalSummary} onChange={(event) => setProfile({ ...profile, professionalSummary: event.target.value })} placeholder="用几句话概括研究背景、方法优势和职业方向" /></label>
                  </div>
                </article>

                <article className="profile-card">
                  <div className="section-heading compact">
                    <div><p className="eyebrow">CANONICAL SKILLS PROFILE</p><h2>标准技能清单</h2></div>
                    <span>{profile.skills.length} 项</span>
                  </div>
                  <p className="profile-help">这里保存的技能将作为岗位匹配和未来调整 CV 的统一基准。请只添加你能够用经历、项目或论文证明的技能。</p>
                  <div className="skill-editor">
                    <input
                      value={skillDraft}
                      onChange={(event) => setSkillDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSkill();
                        }
                      }}
                      placeholder="输入一项技能，例如 Survival Analysis"
                    />
                    <button type="button" onClick={addSkill}>添加技能</button>
                  </div>
                  {profile.skills.length > 0 ? (
                    <div className="profile-skills" aria-label="个人技能清单">
                      {profile.skills.map((skill) => (
                        <span key={skill}>{skill}<button type="button" aria-label={`删除 ${skill}`} onClick={() => setProfile({ ...profile, skills: profile.skills.filter((item) => item !== skill) })}>×</button></span>
                      ))}
                    </div>
                  ) : (
                    <p className="profile-empty-note">尚未添加技能。保存后，评分器会使用这份清单计算技能重合度。</p>
                  )}
                </article>

                <div className="profile-save-row">
                  <p>{profileMessage || "个人资料只保存在受保护的账户数据中。"}</p>
                  <button disabled={profileSaving}>{profileSaving ? "保存中…" : "保存个人资料"}</button>
                </div>
              </form>

              <article className="profile-card resume-card">
                <div className="section-heading compact">
                  <div><p className="eyebrow">BASELINE CVS</p><h2>基础 CV</h2></div>
                  <span>{profileResumes.length} 份</span>
                </div>
                <p className="profile-help">上传通用版或不同方向的基础 CV。支持 PDF、DOC、DOCX，单个文件不超过 10 MB。</p>
                <form className="resume-upload" onSubmit={uploadResume}>
                  <label>版本名称<input value={resumeLabel} onChange={(event) => setResumeLabel(event.target.value)} placeholder="例如 Pharma Biostatistics" /></label>
                  <label>选择文件<input key={resumeInputKey} type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)} /></label>
                  <button disabled={resumeUploading || !resumeFile || !resumeLabel.trim()}>{resumeUploading ? "上传中…" : "上传基础 CV"}</button>
                </form>
                {profileResumes.length > 0 ? (
                  <div className="resume-list">
                    {profileResumes.map((resume) => (
                      <div className="resume-item" key={resume.id}>
                        <div><strong>{resume.label}</strong><span>{resume.filename} · {formatFileSize(resume.size)}</span></div>
                        <div>
                          <a href={`/api/profile/resumes?id=${encodeURIComponent(resume.id)}`}>下载</a>
                          <button onClick={() => void deleteResume(resume)}>删除</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="profile-empty-note">尚未上传基础 CV。</p>
                )}
              </article>
            </>
          )}
        </section>
      )}

      {form && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setForm(null)}>
          <form className="application-form" onSubmit={saveApplication}>
            <div className="form-head"><div><p className="eyebrow">APPLICATION RECORD</p><h2>{form.id ? "更新申请" : "建立申请记录"}</h2></div><button type="button" onClick={() => setForm(null)} aria-label="关闭">×</button></div>
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
              <label>截止日期类型<select value={form.deadlineType} onChange={(e) => updateForm({ deadlineType: e.target.value as Application["deadlineType"], deadlineSource: "manual", deadline: e.target.value === "date" ? form.deadline : "" })}><option value="unknown">JD 未公布</option><option value="date">明确日期</option><option value="rolling">滚动招聘</option></select></label>
              <label>申请截止日期<input type="date" disabled={form.deadlineType !== "date"} value={form.deadline} onChange={(e) => updateForm({ deadline: e.target.value, deadlineType: "date", deadlineSource: "manual" })} /><small>{form.deadlineSource === "automatic" ? "由 JD 自动识别；手动修改后优先" : form.deadlineSource === "manual" ? "手动设置，后续不会被自动覆盖" : "JD 未识别到截止日期"}</small></label>
              <label>计划申请日期<input type="date" value={form.plannedApplicationDate} onChange={(e) => updateForm({ plannedApplicationDate: e.target.value })} /></label>
              <label>下次跟进日期<input type="date" value={form.followUpDate} onChange={(e) => updateForm({ followUpDate: e.target.value })} /></label>
              <label>下一步行动<input value={form.nextAction} onChange={(e) => updateForm({ nextAction: e.target.value })} /></label>
              <label>简历版本<input value={form.resumeVersion} onChange={(e) => updateForm({ resumeVersion: e.target.value })} placeholder="例如 Clinical Biostats" /></label>
              <label className="full">Job URL<input type="url" value={form.jobUrl} onChange={(e) => updateForm({ jobUrl: e.target.value })} placeholder="https://" /></label>
              <label className="full">工作授权<input value={form.workAuthorization} onChange={(e) => updateForm({ workAuthorization: e.target.value })} /></label>
              <label className="full">面试/下一步记录<textarea value={form.interviewNotes} onChange={(e) => updateForm({ interviewNotes: e.target.value })} /></label>
              <label className="full">备注<textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} /></label>
            </div>
            <section className="application-contacts">
              <div className="application-contacts-head"><div><strong>申请联系人</strong><span>Recruiter、hiring manager、校友、内推人或面试官</span></div>{form.id && <button type="button" onClick={() => openContactForApplication(form)}>新增联系人</button>}</div>
              {!form.id ? <p>先保存申请记录，再关联联系人。</p> : contacts.filter((contact) => contact.applicationId === form.id).length === 0 ? <p>这份申请还没有联系人。</p> : contacts.filter((contact) => contact.applicationId === form.id).map((contact) => <article key={contact.id}>
                <div><strong>{contact.name}</strong><span>{contact.contactType} · {contact.role || "职位未填写"} · {contact.status}</span><small>下次跟进：{contact.nextFollowUpAt || "未安排"}</small></div>
                <div className="record-actions">{contact.email && <a href={`mailto:${contact.email}`}>邮件</a>}{contact.linkedinUrl && <a href={contact.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn ↗</a>}<button type="button" onClick={() => setContactForm(contact)}>编辑</button><button type="button" className="danger" onClick={() => deleteContact(contact.id)}>删除</button></div>
              </article>)}
            </section>
            {message && <p className="form-error">{message}</p>}
            <div className="form-actions"><button type="button" onClick={() => setForm(null)}>取消</button><button className="primary" disabled={saving}>{saving ? "保存中…" : "保存记录"}</button></div>
          </form>
        </div>
      )}

      {taskForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setTaskForm(null)}>
          <form className="application-form compact-form" onSubmit={saveTask}>
            <div className="form-head"><div><p className="eyebrow">APPLICATION TASK</p><h2>{taskForm.id ? "编辑任务" : "新增任务"}</h2></div><button type="button" onClick={() => setTaskForm(null)} aria-label="关闭">×</button></div>
            <div className="form-grid">
              <label className="full">任务名称<input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="例如准备 cover letter" /></label>
              <label>截止日期<input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} /></label>
              <label>提醒日期<input type="date" value={taskForm.reminderDate} onChange={(e) => setTaskForm({ ...taskForm, reminderDate: e.target.value })} /></label>
              <label>状态<select value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value as ApplicationTask["status"] })}><option value="pending">未完成</option><option value="done">已完成</option></select></label>
            </div>
            <div className="form-actions"><button type="button" onClick={() => setTaskForm(null)}>取消</button><button className="primary" disabled={workflowSaving}>{workflowSaving ? "保存中…" : "保存任务"}</button></div>
          </form>
        </div>
      )}

      {contactForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setContactForm(null)}>
          <form className="application-form" onSubmit={saveContact}>
            <div className="form-head"><div><p className="eyebrow">CONTACT</p><h2>{contactForm.id ? "编辑联系人" : "新增联系人"}</h2></div><button type="button" onClick={() => setContactForm(null)} aria-label="关闭">×</button></div>
            <div className="form-grid">
              <label>姓名<input required value={contactForm.name} onChange={(event) => setContactForm({ ...contactForm, name: event.target.value })} /></label>
              <label>公司<input value={contactForm.company} onChange={(event) => setContactForm({ ...contactForm, company: event.target.value })} /></label>
              <label>职位<input value={contactForm.role} onChange={(event) => setContactForm({ ...contactForm, role: event.target.value })} /></label>
              <label>类型<select value={contactForm.contactType} onChange={(event) => setContactForm({ ...contactForm, contactType: event.target.value })}><option>Recruiter</option><option>Hiring manager</option><option>校友</option><option>内推联系人</option><option>面试官</option><option>其他</option></select></label>
              <label>邮箱<input type="email" value={contactForm.email} onChange={(event) => setContactForm({ ...contactForm, email: event.target.value })} /></label>
              <label>LinkedIn<input type="url" value={contactForm.linkedinUrl} onChange={(event) => setContactForm({ ...contactForm, linkedinUrl: event.target.value })} placeholder="https://" /></label>
              <label>关联申请<select value={contactForm.applicationId ?? ""} onChange={(event) => setContactForm({ ...contactForm, applicationId: event.target.value ? Number(event.target.value) : null })}><option value="">不关联</option>{applicationsList.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select></label>
              <label>联系状态<select value={contactForm.status} onChange={(event) => setContactForm({ ...contactForm, status: event.target.value })}><option>未联系</option><option>已联系</option><option>已回复</option><option>等待回复</option><option>保持联系</option><option>无需跟进</option></select></label>
              <label>上次联系<input type="date" value={contactForm.lastContactAt} onChange={(event) => setContactForm({ ...contactForm, lastContactAt: event.target.value })} /></label>
              <label>下次跟进<input type="date" value={contactForm.nextFollowUpAt} onChange={(event) => setContactForm({ ...contactForm, nextFollowUpAt: event.target.value })} /></label>
              <label className="full">备注<textarea value={contactForm.notes} onChange={(event) => setContactForm({ ...contactForm, notes: event.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" onClick={() => setContactForm(null)}>取消</button><button className="primary" disabled={contactSaving}>{contactSaving ? "保存中…" : "保存联系人"}</button></div>
          </form>
        </div>
      )}

      {interviewForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setInterviewForm(null)}>
          <form className="application-form" onSubmit={saveInterview}>
            <div className="form-head"><div><p className="eyebrow">INTERVIEW & FOLLOW-UP</p><h2>{interviewForm.id ? "更新面试" : "记录面试"}</h2></div><button type="button" onClick={() => setInterviewForm(null)} aria-label="关闭">×</button></div>
            <div className="form-grid">
              <label>面试轮次<select value={interviewForm.round} onChange={(e) => setInterviewForm({ ...interviewForm, round: e.target.value })}><option>HR 筛选</option><option>一面</option><option>二面/技术面</option><option>终面</option><option>其他</option></select></label>
              <label>时间<input type="datetime-local" value={interviewForm.scheduledAt} onChange={(e) => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })} /></label>
              <label>形式<select value={interviewForm.format} onChange={(e) => setInterviewForm({ ...interviewForm, format: e.target.value })}><option>Video</option><option>Phone</option><option>On-site</option><option>其他</option></select></label>
              <label>结果<select value={interviewForm.outcome} onChange={(e) => setInterviewForm({ ...interviewForm, outcome: e.target.value })}><option>待进行</option><option>已完成</option><option>通过</option><option>未通过</option><option>取消</option></select></label>
              <label>联系人<input value={interviewForm.contactName} onChange={(e) => setInterviewForm({ ...interviewForm, contactName: e.target.value })} /></label>
              <label>联系邮箱<input type="email" value={interviewForm.contactEmail} onChange={(e) => setInterviewForm({ ...interviewForm, contactEmail: e.target.value })} /></label>
              <label>感谢信<select value={interviewForm.thankYouStatus} onChange={(e) => setInterviewForm({ ...interviewForm, thankYouStatus: e.target.value })}><option>未发送</option><option>已发送</option><option>不需要</option></select></label>
              <label>感谢信截止<input type="datetime-local" value={interviewForm.thankYouDueAt} onChange={(e) => setInterviewForm({ ...interviewForm, thankYouDueAt: e.target.value })} /></label>
              <label>下次跟进<input type="date" value={interviewForm.followUpAt} onChange={(e) => setInterviewForm({ ...interviewForm, followUpAt: e.target.value })} /></label>
              <label className="full">面试笔记<textarea value={interviewForm.notes} onChange={(e) => setInterviewForm({ ...interviewForm, notes: e.target.value })} /></label>
            </div>
            <div className="form-actions"><button type="button" onClick={() => setInterviewForm(null)}>取消</button><button className="primary" disabled={workflowSaving}>{workflowSaving ? "保存中…" : "保存面试"}</button></div>
          </form>
        </div>
      )}

      {researchForm && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setResearchForm(null)}>
          <form className="application-form" onSubmit={saveResearch}>
            <div className="form-head"><div><p className="eyebrow">COMPANY RESEARCH</p><h2>{researchForm.company}</h2></div><button type="button" onClick={() => setResearchForm(null)} aria-label="关闭">×</button></div>
            <div className="form-grid">
              <label>公司官网<input type="url" value={researchForm.website} onChange={(e) => setResearchForm({ ...researchForm, website: e.target.value })} placeholder="https://" /></label>
              <label>招聘页面<input type="url" value={researchForm.careersUrl} onChange={(e) => setResearchForm({ ...researchForm, careersUrl: e.target.value })} placeholder="https://" /></label>
              <label className="full">业务概况<textarea value={researchForm.businessSummary} onChange={(e) => setResearchForm({ ...researchForm, businessSummary: e.target.value })} placeholder="核心业务、产品、规模和与你目标方向的关系" /></label>
              <label className="full">近期动态<textarea value={researchForm.recentNotes} onChange={(e) => setResearchForm({ ...researchForm, recentNotes: e.target.value })} placeholder="融资、并购、临床项目、裁员或招聘趋势等" /></label>
              <label className="full">我的备注<textarea value={researchForm.personalNotes} onChange={(e) => setResearchForm({ ...researchForm, personalNotes: e.target.value })} placeholder="申请策略、已联系的人、需要继续查的问题" /></label>
            </div>
            <div className="form-actions"><button type="button" onClick={() => setResearchForm(null)}>取消</button><button className="primary" disabled={researchSaving}>{researchSaving ? "保存中…" : "保存研究档案"}</button></div>
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

      {refreshConfirmationOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => event.currentTarget === event.target && setRefreshConfirmationOpen(false)}
        >
          <section className="refresh-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="refresh-confirm-title">
            <div className="form-head">
              <div>
                <p className="eyebrow">手动更新确认</p>
                <h2 id="refresh-confirm-title">确定立即刷新全部来源？</h2>
              </div>
              <button type="button" onClick={() => setRefreshConfirmationOpen(false)} aria-label="关闭">×</button>
            </div>
            <p>
              这会立即触发完整扫描，包括公司 ATS、JobSpy、Job Board Aggregator、中国公开来源、公司官网核验、评分与去重，并消耗 GitHub Actions 运行时间。
            </p>
            <div className="refresh-confirm-note">
              系统每天早上 06:00 会自动更新。除非需要立刻查看最新岗位，否则建议等待下一次自动更新。
            </div>
            <div className="refresh-confirm-actions">
              <button type="button" onClick={() => setRefreshConfirmationOpen(false)}>取消，等待自动更新</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setRefreshConfirmationOpen(false);
                  void refreshJobs();
                }}
              >
                确认立即刷新
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "today" ? "selected" : ""} onClick={() => setView("today")}><span>⌂</span>今日</button>
        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>收藏</button>
        <button className={view === "applications" ? "selected" : ""} onClick={() => setView("applications")}><span>▤</span>申请</button>
        <button className={view === "companies" ? "selected" : ""} onClick={() => setView("companies")}><span>⌕</span>公司</button>
        <button className={view === "collect" ? "selected" : ""} onClick={() => setView("collect")}><span>↻</span>采集</button>
        <button className={view === "verify" ? "selected" : ""} onClick={() => setView("verify")}><span>✓</span>核验</button>
        <button className={view === "profile" ? "selected" : ""} onClick={() => setView("profile")}><span>♙</span>个人</button>
      </nav>
    </main>
  );
}
