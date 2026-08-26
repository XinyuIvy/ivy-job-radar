"use client";

import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import companyPool from "./company-pool.json";
import companyPoolAdditions from "./company-pool-additions.json";
import { companyCollectionMode, companySourceSearchUrl, findCompanySource } from "./lib/company-sources";
import {
  cvPrebuildStatusView,
  cvPrebuildSummaryBucket,
  type CvPrebuildStatus,
} from "./lib/cv-prebuild-status";
import {
  CV_GENERATION_RULES_MAX_LENGTH,
  DEFAULT_CV_GENERATION_RULES,
} from "./lib/cv-generation-rules";
import { automationStatusLabel } from "./lib/application-automation";
import {
  emptyFixedApplicationProfile,
  type FixedApplicationProfile,
} from "./lib/application-profile";
import { sameLogicalJob } from "./lib/job-identity";
import CandidateFactFitScores from "./pending-application-fit-scores";

const completeCompanyPool = [...companyPool, ...companyPoolAdditions];
const activeCvPrebuildStatuses = new Set<CvPrebuildStatus>([
  "preparing_bundle",
  "agent_queued",
  "agent_running",
]);
const MAX_AUTOMATIC_CV_ATTEMPTS = 2;
const CV_GENERATION_RULES_STORAGE_KEY = "ivy-job-radar:cv-generation-rules:v1";
const CV_TEMPLATE_LANGUAGE_STORAGE_KEY = "ivy-job-radar:cv-template-language:v1";
const PENDING_CV_FAVORITES_STORAGE_KEY = "ivy-job-radar:pending-cv-favorites:v1";

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
  expirationReason?: string;
  discoveredAt: string;
  checkedAt: string;
  saved?: boolean;
  cvPrebuildStatus?: CvPrebuildStatus | null;
  cvPrebuildError?: string;
  cvPrebuildUpdatedAt?: string;
  cvPrebuildAttempts?: number;
};

function canAutomaticallyRetryCv(job: Job) {
  if (job.cvPrebuildStatus !== "failed_retryable") return false;
  const attempts = job.cvPrebuildAttempts ?? 0;
  if (attempts < 1 || attempts >= MAX_AUTOMATIC_CV_ATTEMPTS) return false;
  return job.cvPrebuildError === "OPENAI_FAILED"
    || /server_is_overloaded|rate_limit_exceeded|server_error/i.test(job.cvPrebuildError ?? "");
}

function CvPrebuildStatusBadge({ status }: { status?: CvPrebuildStatus | null }) {
  const view = cvPrebuildStatusView(status);
  if (!view) return null;
  return <span className={`cv-prebuild-badge ${view.tone}`}>{view.label}</span>;
}

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

type CvTemplateLanguage = "zh" | "en";
type CvTemplateTrack = "tech" | "quant" | "consulting" | "pharma" | "clinical_neuro";

const cvTemplateTrackOptions: Array<{ value: CvTemplateTrack; label: string }> = [
  { value: "tech", label: "Tech / Data Science / Applied ML" },
  { value: "quant", label: "Quantitative Research" },
  { value: "consulting", label: "Consulting" },
  { value: "pharma", label: "Healthcare / Pharma / Biostatistics" },
  { value: "clinical_neuro", label: "Clinical Data / Neuro / Medical Device" },
];

const cvTemplateFiles: Record<CvTemplateLanguage, Record<CvTemplateTrack, string>> = {
  zh: {
    tech: "cv_tech_cn.tex",
    quant: "cv_quant_cn.tex",
    consulting: "cv_healthcare_consulting_cn.tex",
    pharma: "cv_pharma_cn.tex",
    clinical_neuro: "cv_clinical_data_neuro_cn.tex",
  },
  en: {
    tech: "cv_tech.tex",
    quant: "cv_quant.tex",
    consulting: "cv_healthcare_consulting.tex",
    pharma: "cv_pharma.tex",
    clinical_neuro: "cv_pharma.tex",
  },
};

function recommendCvTemplateTrack(input: Pick<Job | Application, "title" | "track">): CvTemplateTrack {
  const signal = `${input.track} ${input.title}`.toLocaleLowerCase();
  if (/quant|量化|定量|systematic/.test(signal)) return "quant";
  if (/consult|咨询|strategy|战略/.test(signal)) return "consulting";
  if (/pharma|biostat|clinical|epidemi|rwe|heor|healthcare|medical|neuro|brain|医药|医疗|生物统计|临床|流行病|神经|脑科学/.test(signal)) return "pharma";
  return "tech";
}

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
  phase: string;
  currentSource: string;
  stepsCompleted: number;
  stepsTotal: number;
  scanned: number;
  uniqueJobs: number;
  filtered: number;
  verified: number;
  eligible: number;
  progressUpdatedAt: string;
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
  jobsUnique?: number;
  jobs_unique?: number;
  jobsDuplicateListings?: number;
  jobs_duplicate_listings?: number;
  jobsFilteredBeforeDetail?: number;
  jobs_filtered_before_detail?: number;
  rejectionReasons?: Record<string, number>;
  rejection_reasons?: Record<string, number>;
  reviewCounts?: Record<string, number>;
  review_counts?: Record<string, number>;
  attention?: string;
  attentionKind?: string;
  attention_kind?: string;
};

const chinaRejectionLabels: Record<string, string> = {
  missing_title_or_url: "缺少标题或链接",
  missing_required_fields: "缺少必要字段",
  title_not_targeted: "关键词或标题不匹配",
  excluded_seniority_or_role: "高年资、工程类或无关岗位",
  degree_experience_or_skill_gap: "经验超限或方向不符",
  duplicate_listing: "重复结果",
  detail_unavailable: "详情无法读取",
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
    reviewCounts: Record<string, number>;
    updatedAt: string;
  } | null;
};

type UserProfile = {
  userEmail: string;
  applicationProfile: FixedApplicationProfile;
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

type ApplicationAutomationDashboard = {
  config: {
    enabled: boolean;
    executionMode: "pilot" | "automatic";
    dailyLimit: number;
    minimumScore: number;
    defaultLanguage: "en" | "zh";
    allowedAts: string[];
    finalSubmitEnabled: boolean;
    updatedAt: string;
  };
  summary: {
    total: number;
    screening: number;
    awaitingCv: number;
    ready: number;
    running: number;
    needsReview: number;
    submitted: number;
    failed: number;
    screenedOut: number;
  };
  tasks: Array<{
    id: number;
    jobId: number;
    applicationRowId: number | null;
    status: string;
    stage: string;
    atsProvider: string;
    eligibilityScore: number;
    company: string;
    title: string;
    location: string;
    jobUrl: string;
    cvStatus: string;
    reasons: string[];
    blockers: string[];
    lastError: string;
    updatedAt: string;
  }>;
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

type View = "today" | "saved" | "automation" | "applications" | "profile" | "tools" | "companies" | "verify" | "ignored";

const tracks = ["全部", "Technology", "Quant", "Pharma", "Medical Device", "Healthcare AI", "Consulting"];
const sortOptions = [
  { value: "score", label: "匹配度最高" },
  { value: "newest", label: "最新发现" },
  { value: "checked", label: "最近核验" },
  { value: "priority", label: "优先申请岗位" },
] as const;
const statuses = ["准备材料", "已申请", "一面", "二面/技术面", "终面", "Offer", "撤回", "拒绝"];
const interviewStatuses = ["一面", "二面/技术面", "终面"];
const hardRequirementReasons = [
  "经验年限或职级不符合",
  "学历或专业要求不符合",
  "工作授权或 sponsorship 不符合",
  "地点或工作方式不符合",
  "必备技能、证书或语言不符合",
  "其他硬性条件不符合",
];
const NAVIGATION_STORAGE_KEY = "ivy-job-radar:navigation-state:v2";
const PENDING_CHANNEL_NAME = "ivy-job-radar-updates";
const PENDING_STORAGE_KEY = "ivy-job-radar:last-pending-created";
type ApplicationBucket = "submitted" | "interview" | "offer" | "rejected";
type CandidateBucket = "favorites" | "pending";
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
  applicationProfile: emptyFixedApplicationProfile,
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

function groupJobsByCompany(rows: Job[]) {
  const groups = new Map<string, Job[]>();
  for (const row of rows) {
    const key = normalizeCompanyName(row.company) || row.company.toLocaleLowerCase().trim();
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()].flat();
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

function deadlineLabel(deadline: string, type: string) {
  if (type === "rolling") return "滚动招聘，建议尽早申请";
  if (deadline) return deadline;
  return "JD 未公布";
}

function normalizeSavedIdentity(value: string) {
  return value.trim().toLocaleLowerCase().replace(/&/g, "and").replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function savedApplicationMatchesJob(application: Application, job: Job) {
  if (application.applicationId && job.applicationId && application.applicationId === job.applicationId) return true;
  if (application.jobUrl && job.jobUrl && application.jobUrl === job.jobUrl) return true;
  return normalizeCompanyName(application.company) === normalizeCompanyName(job.company)
    && normalizeSavedIdentity(application.title) === normalizeSavedIdentity(job.title);
}

function applicationHidesFavorite(application: Application, job: Job) {
  return application.status !== "收藏" && savedApplicationMatchesJob(application, job);
}

function applicationHidesToday(application: Application, job: Job) {
  return !["撤回", "拒绝"].includes(application.status) && savedApplicationMatchesJob(application, job);
}

function updatePendingCvFavorite(jobId: number, pending: boolean) {
  try {
    const current = JSON.parse(window.localStorage.getItem(PENDING_CV_FAVORITES_STORAGE_KEY) || "[]") as unknown[];
    const ids = new Set(current.map(Number).filter(Number.isSafeInteger));
    if (pending) ids.add(jobId);
    else ids.delete(jobId);
    window.localStorage.setItem(PENDING_CV_FAVORITES_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Recovery remains available from the server-side recent-job heuristic.
  }
}


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

export default function JobRadar() {
  const [view, setView] = useState<View>("today");
  const [track, setTrack] = useState("全部");
  const [region, setRegion] = useState("全部地区");
  const [jobSort, setJobSort] = useState<(typeof sortOptions)[number]["value"]>("score");
  const [jobQuery, setJobQuery] = useState("");
  const deferredJobQuery = useDeferredValue(jobQuery);
  const [saved, setSaved] = useState<number[]>([]);
  const [cvGenerationRules, setCvGenerationRules] = useState(DEFAULT_CV_GENERATION_RULES);
  const [cvRulesOpen, setCvRulesOpen] = useState(false);
  const [cvAutomationNotice, setCvAutomationNotice] = useState("");
  const [cvRecoveryCandidates, setCvRecoveryCandidates] = useState<Job[]>([]);
  const [cvRecoverySelected, setCvRecoverySelected] = useState<number[]>([]);
  const [cvRecoveryRunning, setCvRecoveryRunning] = useState(false);
  const [candidateBucket, setCandidateBucket] = useState<CandidateBucket>("favorites");
  const [candidateMovingId, setCandidateMovingId] = useState<number | null>(null);
  const [pendingCvSelection, setPendingCvSelection] = useState<{
    job: Job;
    language: CvTemplateLanguage;
    track: CvTemplateTrack;
  } | null>(null);
  const [applicationBucket, setApplicationBucket] = useState<ApplicationBucket>("submitted");
  const [dailyJobs, setDailyJobs] = useState<Job[]>([]);
  const [cvTasks, setCvTasks] = useState<Job[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [jobsReloadToken, setJobsReloadToken] = useState(0);
  const [jobsRefreshing, setJobsRefreshing] = useState(false);
  const [jobsMessage, setJobsMessage] = useState("");
  const [applicationsList, setApplicationsList] = useState<Application[]>([]);
  const [automationDashboard, setAutomationDashboard] = useState<ApplicationAutomationDashboard | null>(null);
  const [automationLoading, setAutomationLoading] = useState(true);
  const [automationSaving, setAutomationSaving] = useState(false);
  const [automationMessage, setAutomationMessage] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const deferredCompanyQuery = useDeferredValue(companyQuery);
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
  const [clock, setClock] = useState(0);
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [analytics, setAnalytics] = useState<ApplicationAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [jobPage, setJobPage] = useState(1);
  const [companyPage, setCompanyPage] = useState(1);
  const [applicationPage, setApplicationPage] = useState(1);
  useEffect(() => {
    const storedRules = window.localStorage.getItem(CV_GENERATION_RULES_STORAGE_KEY)?.trim();
    if (!storedRules) return;
    const timer = window.setTimeout(() => setCvGenerationRules(storedRules), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const [savedPage, setSavedPage] = useState(1);
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
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [hardRequirementOpen, setHardRequirementOpen] = useState(false);
  const navigationReady = useRef(false);
  const automaticQueueRef = useRef<Set<number>>(new Set());
  const automaticCvJobRef = useRef<number | null>(null);
  const scrollByView = useRef<Partial<Record<View, number>>>({});

  const loadApplicationAutomation = useCallback(async () => {
    const response = await fetch("/api/application-automation", { cache: "no-store" });
    const payload = await response.json() as ApplicationAutomationDashboard & { error?: string };
    if (!response.ok) throw new Error(payload.error || "自动投递任务读取失败。");
    setAutomationDashboard(payload);
    return payload;
  }, []);

  useEffect(() => {
    if (view !== "automation") return;
    let cancelled = false;
    const initialTimer = window.setTimeout(() => {
      void loadApplicationAutomation()
        .catch((error) => !cancelled && setAutomationMessage(error instanceof Error ? error.message : "自动投递任务读取失败。"))
        .finally(() => !cancelled && setAutomationLoading(false));
    }, 0);
    const timer = window.setInterval(() => void loadApplicationAutomation().catch(() => {}), 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [loadApplicationAutomation, view]);

  useEffect(() => {
    let stored: {
      view?: View;
      track?: string;
      region?: string;
      jobSort?: (typeof sortOptions)[number]["value"];
      jobQuery?: string;
      candidateBucket?: CandidateBucket;
      applicationBucket?: ApplicationBucket;
      jobPage?: number;
      companyPage?: number;
      applicationPage?: number;
      savedPage?: number;
      scrollByView?: Partial<Record<View, number>>;
    } = {};
    try {
      stored = JSON.parse(sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || "{}") as typeof stored;
    } catch {
      sessionStorage.removeItem(NAVIGATION_STORAGE_KEY);
    }
    const restoreTimer = window.setTimeout(() => {
      if (stored.view) setView(stored.view);
      if (stored.track) setTrack(stored.track);
      if (stored.region) setRegion(stored.region);
      if (stored.jobSort) setJobSort(stored.jobSort);
      if (typeof stored.jobQuery === "string") setJobQuery(stored.jobQuery);
      if (stored.candidateBucket) setCandidateBucket(stored.candidateBucket);
      if (stored.applicationBucket) setApplicationBucket(stored.applicationBucket);
      if (stored.jobPage) setJobPage(stored.jobPage);
      if (stored.companyPage) setCompanyPage(stored.companyPage);
      if (stored.applicationPage) setApplicationPage(stored.applicationPage);
      if (stored.savedPage) setSavedPage(stored.savedPage);
      if (stored.scrollByView) scrollByView.current = stored.scrollByView;
      navigationReady.current = true;
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    if (!navigationReady.current) return;
    sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({
      view,
      track,
      region,
      jobSort,
      jobQuery,
      candidateBucket,
      applicationBucket,
      jobPage,
      companyPage,
      applicationPage,
      savedPage,
      scrollByView: scrollByView.current,
    }));
  }, [view, track, region, jobSort, jobQuery, candidateBucket, applicationBucket, jobPage, companyPage, applicationPage, savedPage]);

  useEffect(() => {
    let scrollTimer = 0;
    const rememberScroll = () => {
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        scrollByView.current[view] = window.scrollY;
        try {
          const stored = JSON.parse(sessionStorage.getItem(NAVIGATION_STORAGE_KEY) || "{}") as Record<string, unknown>;
          sessionStorage.setItem(NAVIGATION_STORAGE_KEY, JSON.stringify({ ...stored, scrollByView: scrollByView.current }));
        } catch {}
      }, 120);
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    const restoreFrame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollByView.current[view] ?? 0 }));
    return () => {
      window.removeEventListener("scroll", rememberScroll);
      window.cancelAnimationFrame(restoreFrame);
      window.clearTimeout(scrollTimer);
    };
  }, [view]);

  useEffect(() => {
    const accept = (message: unknown) => {
      if (!message || typeof message !== "object") return;
      const payload = message as { type?: string; application?: Application };
      if (payload.type !== "ivy-job-radar-pending-created" || !payload.application?.id) return;
      const application = payload.application as Application;
      setApplicationsList((current) => [
        application,
        ...current.filter((item) => item.id !== payload.application?.id),
      ]);
      setDailyJobs((current) => current.filter((job) => !sameLogicalJob(job, application)));
    };
    const storageHandler = (event: StorageEvent) => {
      if (event.key !== PENDING_STORAGE_KEY || !event.newValue) return;
      try { accept(JSON.parse(event.newValue)); } catch {}
    };
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(PENDING_CHANNEL_NAME);
    if (channel) channel.onmessage = (event) => accept(event.data);
    window.addEventListener("storage", storageHandler);
    return () => {
      channel?.close();
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

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
    if (view !== "applications") return;
    let active = true;
    Promise.all([
      fetch("/api/workflow", { cache: "no-store" }).then((response) => response.ok ? response.json() : { tasks: [], interviews: [] }),
      fetch("/api/contacts", { cache: "no-store" }).then((response) => response.ok ? response.json() : []),
    ]).then(([workflow, contactRows]) => {
      if (!active) return;
      setTasks(workflow.tasks ?? []);
      setInterviews(workflow.interviews ?? []);
      setContacts(contactRows);
    });
    return () => { active = false; };
  }, [view]);

  useEffect(() => {
    if (view !== "companies") return;
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
  }, [view]);

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
    if (view !== "today" || !scanPanelOpen) return;
    const refreshStatus = () => {
      void loadScanStatus();
      void loadChinaScanStatus();
      void loadChinaScanControl();
      setClock(Date.now());
    };
    const initialTimer = window.setTimeout(refreshStatus, 0);
    const statusTimer = window.setInterval(refreshStatus, 10000);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(statusTimer);
      window.clearInterval(clockTimer);
    };
  }, [view, scanPanelOpen]);

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

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    const response = await fetch("/api/analytics", { cache: "no-store" });
    if (response.ok) setAnalytics(await response.json());
    setAnalyticsLoading(false);
  };

  useEffect(() => {
    if (!["saved", "applications", "companies"].includes(view)) return;
    let active = true;
    fetch("/api/applications", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setApplicationsList(rows);
      });
    return () => {
      active = false;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "applications") return;
    const timer = window.setTimeout(() => void loadAnalytics(), 0);
    return () => window.clearTimeout(timer);
  }, [view, applicationsList]);

  useEffect(() => {
    if (view !== "verify") return;
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
  }, [view]);

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

  const loadIgnoredJobs = async () => {
    const response = await fetch("/api/ignored-jobs", { cache: "no-store" });
    if (response.ok) setIgnoredJobs(await response.json());
  };

  useEffect(() => {
    if (!["tools", "ignored"].includes(view) && !scanPanelOpen) return;
    let active = true;
    fetch("/api/ignored-jobs", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setIgnoredJobs(rows);
      });
    return () => {
      active = false;
    };
  }, [view, scanPanelOpen]);

  const loadProfile = async () => {
    setProfileLoading(true);
    setProfileMessage("");
    const profileResponse = await fetch("/api/profile", { cache: "no-store" });
    if (profileResponse.ok) setProfile(await profileResponse.json());
    if (!profileResponse.ok) setProfileMessage("申请固定资料读取失败，请重新登录后再试。");
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
    setProfileMessage("申请固定资料已保存，Autofill 下次运行时会自动读取最新版。");
  };

  const updateFixedProfileSection = <K extends keyof FixedApplicationProfile,>(
    key: K,
    value: FixedApplicationProfile[K],
  ) => {
    setProfile((current) => ({
      ...current,
      applicationProfile: { ...current.applicationProfile, [key]: value },
    }));
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
  const usProgressRatio = scanStatus?.stepsTotal
    ? Math.min(1, scanStatus.stepsCompleted / scanStatus.stepsTotal)
    : 0;
  const usEtaSeconds = usProgressRatio > 0 && usProgressRatio < 1
    ? Math.max(0, scanElapsedSeconds * (1 / usProgressRatio - 1))
    : 0;

  useEffect(() => {
    let active = true;
    fetch("/api/jobs", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`Job request failed with ${response.status}`);
        return response.json();
      })
      .then((rows: Job[]) => {
        if (active) {
          setDailyJobs(rows);
          setSaved(rows.filter((row) => row.saved).map((row) => row.id));
          setJobsLoading(false);
        }
      })
      .catch(() => {
        if (!active) return;
        setJobsError("岗位读取暂时失败。已有岗位数据仍然保留，请重试。");
        setJobsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobsReloadToken]);

  useEffect(() => {
    let active = true;
    fetch("/api/cv-prebuild/recovery", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : [])
      .then((rows: Job[]) => {
        if (!active) return;
        let pendingIds: number[] = [];
        try {
          pendingIds = (JSON.parse(window.localStorage.getItem(PENDING_CV_FAVORITES_STORAGE_KEY) || "[]") as unknown[])
            .map(Number)
            .filter(Number.isSafeInteger);
        } catch {}
        const ordered = [...rows].sort((left, right) =>
          Number(pendingIds.includes(right.id)) - Number(pendingIds.includes(left.id)) || right.id - left.id);
        setCvRecoveryCandidates(ordered);
        setCvRecoverySelected(ordered.map((job) => job.id));
      });
    return () => {
      active = false;
    };
  }, [jobsReloadToken]);

  useEffect(() => {
    let active = true;
    fetch("/api/cv-prebuild/tasks", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(`CV task request failed with ${response.status}`);
        return response.json();
      })
      .then((rows: Job[]) => {
        if (active) setCvTasks(rows);
      })
      .catch(() => {
        if (active) setCvTasks([]);
      });
    return () => {
      active = false;
    };
  }, [jobsReloadToken]);

  const activeCvJobKey = useMemo(() => {
    const jobIds = new Set<number>();
    for (const job of cvTasks) {
      if (job.cvPrebuildStatus && activeCvPrebuildStatuses.has(job.cvPrebuildStatus)) {
        jobIds.add(job.id);
      }
    }
    return [...jobIds].sort((left, right) => left - right).join(",");
  }, [cvTasks]);

  useEffect(() => {
    if (view !== "saved" || !activeCvJobKey) return;
    const jobIds = activeCvJobKey.split(",").map(Number).filter(Number.isSafeInteger);
    let active = true;
    const refreshCvStatuses = async () => {
      const results = await Promise.all(jobIds.map(async (jobId) => {
        try {
          const response = await fetch(`/api/cv-prebuild/status?jobId=${jobId}`, { cache: "no-store" });
          if (!response.ok) return null;
          const payload = await response.json() as {
            prebuild?: { status?: CvPrebuildStatus; errorCode?: string; attempts?: number } | null;
          };
          return payload.prebuild?.status
            ? {
              jobId,
              status: payload.prebuild.status,
              errorCode: payload.prebuild.errorCode ?? "",
              attempts: payload.prebuild.attempts ?? 0,
            }
            : null;
        } catch {
          return null;
        }
      }));
      if (!active) return;
      const statusByJobId = new Map(results.filter((result): result is {
        jobId: number;
        status: CvPrebuildStatus;
        errorCode: string;
        attempts: number;
      } => Boolean(result))
        .map((result) => [result.jobId, result.status]));
      if (!statusByJobId.size) return;
      setDailyJobs((current) => current.map((job) => {
        const status = statusByJobId.get(job.id);
        return status && status !== job.cvPrebuildStatus ? { ...job, cvPrebuildStatus: status } : job;
      }));
      setCvTasks((current) => current.map((job) => {
        const result = results.find((item) => item?.jobId === job.id);
        return result && (
          result.status !== job.cvPrebuildStatus
          || result.errorCode !== job.cvPrebuildError
          || result.attempts !== job.cvPrebuildAttempts
        )
          ? {
            ...job,
            cvPrebuildStatus: result.status,
            cvPrebuildError: result.errorCode,
            cvPrebuildAttempts: result.attempts,
          }
          : job;
      }));
    };
    const initialTimer = window.setTimeout(() => void refreshCvStatuses(), 0);
    const statusTimer = window.setInterval(() => void refreshCvStatuses(), 5000);
    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.clearInterval(statusTimer);
    };
  }, [view, activeCvJobKey]);

  const loadRequests = async () => {
    const response = await fetch("/api/job-requests", { cache: "no-store" });
    if (response.ok) setRequests(await response.json());
  };

  useEffect(() => {
    if (view !== "verify") return;
    let active = true;
    fetch("/api/job-requests", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((rows) => {
        if (active) setRequests(rows);
      });
    return () => {
      active = false;
    };
  }, [view]);

  const jobs = useMemo(
    () => {
      const normalizedQuery = deferredJobQuery.trim().toLowerCase();
      const filtered = dailyJobs.filter(
        (job) =>
          (view !== "today" || (
            !["已过期", "疑似过期"].includes(job.status)
            && !job.saved
            && !saved.includes(job.id)
            && !applicationsList.some((application) => applicationHidesToday(application, job))
          )) &&
          (track === "全部" || job.track === track) &&
          (region === "全部地区" || job.region === region) &&
          (view !== "saved" || saved.includes(job.id)) &&
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
    [dailyJobs, track, region, saved, applicationsList, view, jobSort, deferredJobQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setJobPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [track, region, jobSort, view, jobQuery]);

  const jobPageCount = Math.max(1, Math.ceil(jobs.length / JOB_PAGE_SIZE));
  const safeJobPage = Math.min(jobPage, jobPageCount);
  const visibleJobs = jobs.slice((safeJobPage - 1) * JOB_PAGE_SIZE, safeJobPage * JOB_PAGE_SIZE);
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
    const query = deferredCompanyQuery.trim().toLowerCase();
    return companyRecords.filter((company) => {
      const searchable = `${company.company} ${company.keywords} ${company.companyType} ${company.track}`.toLowerCase();
      return (
        (!query || searchable.includes(query)) &&
        (companyPriority === "全部" || company.priority === companyPriority) &&
        (companyRegion === "全部地区" || company.region === companyRegion) &&
        (companyCollection === "全部接入状态" || companyCollectionMode(findCompanySource(company.company)) === companyCollection)
      );
    });
  }, [companyRecords, deferredCompanyQuery, companyPriority, companyRegion, companyCollection]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCompanyPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [companyQuery, companyPriority, companyRegion, companyCollection]);
  const companyPageCount = Math.max(1, Math.ceil(companies.length / COMPANY_PAGE_SIZE));
  const safeCompanyPage = Math.min(companyPage, companyPageCount);
  const visibleCompanies = companies.slice((safeCompanyPage - 1) * COMPANY_PAGE_SIZE, safeCompanyPage * COMPANY_PAGE_SIZE);

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
  useEffect(() => {
    const timer = window.setTimeout(() => setApplicationPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [applicationBucket]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSavedPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [saved, applicationsList, candidateBucket]);
  const applicationPageCount = Math.max(1, Math.ceil(visibleApplications.length / APPLICATION_PAGE_SIZE));
  const safeApplicationPage = Math.min(applicationPage, applicationPageCount);
  const pagedApplications = visibleApplications.slice((safeApplicationPage - 1) * APPLICATION_PAGE_SIZE, safeApplicationPage * APPLICATION_PAGE_SIZE);
  const allFavoriteJobs = dailyJobs.filter((job) =>
    saved.includes(job.id)
    && !applicationsList.some((application) => applicationHidesFavorite(application, job)),
  );
  const savedOnlyJobs = view === "saved" ? allFavoriteJobs : [];
  const pendingCvJobs = pendingApplications.flatMap((application) => {
    const job = cvTasks.find((candidate) => savedApplicationMatchesJob(application, candidate))
      ?? dailyJobs.find((candidate) => saved.includes(candidate.id) && savedApplicationMatchesJob(application, candidate));
    return job ? [{ application, job }] : [];
  });
  const cvTaskJobs = pendingCvJobs
    .map(({ job }) => job)
    .filter((job, index, rows) => Boolean(job.cvPrebuildStatus) && rows.findIndex((candidate) => candidate.id === job.id) === index)
    .sort((left, right) => {
      const priority = { running: 4, queued: 3, ready: 2, needs_action: 1 };
      const leftBucket = cvPrebuildSummaryBucket(left.cvPrebuildStatus);
      const rightBucket = cvPrebuildSummaryBucket(right.cvPrebuildStatus);
      return priority[rightBucket] - priority[leftBucket]
        || (Date.parse(right.discoveredAt) || 0) - (Date.parse(left.discoveredAt) || 0);
    });
  const cvTaskSummary = cvTaskJobs.reduce((summary, job) => {
    summary[cvPrebuildSummaryBucket(job.cvPrebuildStatus)] += 1;
    return summary;
  }, { queued: 0, running: 0, ready: 0, needs_action: 0 });
  const candidateRows = candidateBucket === "favorites"
    ? groupJobsByCompany(savedOnlyJobs).map((job) => ({ kind: "job" as const, job }))
    : pendingApplications.map((application) => ({
      kind: "application" as const,
      application,
      job: pendingCvJobs.find((row) => row.application.id === application.id)?.job,
    }));
  const savedPageCount = Math.max(1, Math.ceil(candidateRows.length / APPLICATION_PAGE_SIZE));
  const safeSavedPage = Math.min(savedPage, savedPageCount);
  const pagedCandidateRows = candidateRows.slice((safeSavedPage - 1) * APPLICATION_PAGE_SIZE, safeSavedPage * APPLICATION_PAGE_SIZE);
  useEffect(() => {
    if (view !== "saved") return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent("ivy-job-radar-candidate-rendered"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, safeSavedPage, applicationsList, saved]);
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

  const startCvPrebuild = useCallback(async (
    id: number,
    templateTrack?: CvTemplateTrack,
    generationRules?: string,
  ): Promise<{ status: CvPrebuildStatus; error?: string }> => {
    setDailyJobs((current) => current.map((job) => job.id === id
      ? { ...job, cvPrebuildStatus: "preparing_bundle" }
      : job));
    setCvTasks((current) => current.map((job) => job.id === id
      ? { ...job, cvPrebuildStatus: "preparing_bundle", cvPrebuildError: "" }
      : job));
    try {
      const response = await fetch("/api/cv-prebuild/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: id,
          ...(templateTrack ? { templateTrack } : {}),
          ...(generationRules ? { generationRules } : {}),
        }),
        keepalive: true,
      });
      const payload = await response.json() as { status?: CvPrebuildStatus; error?: string };
      const status: CvPrebuildStatus = response.ok
        ? payload.status ?? "agent_queued"
        : response.status === 503 ? "blocked_configuration" : "failed_retryable";
      setDailyJobs((current) => current.map((job) => job.id === id
        ? { ...job, cvPrebuildStatus: status }
        : job));
      setCvTasks((current) => current.map((job) => job.id === id
        ? { ...job, cvPrebuildStatus: status }
        : job));
      return response.ok
        ? { status }
        : {
          status,
          error: response.status === 503
            ? "API 配置未完成，请检查设置后重试。"
            : payload.error || "CV 初稿启动失败，请重试。",
        };
    } catch {
      setDailyJobs((current) => current.map((job) => job.id === id
        ? { ...job, cvPrebuildStatus: "failed_retryable" }
        : job));
      setCvTasks((current) => current.map((job) => job.id === id
        ? { ...job, cvPrebuildStatus: "failed_retryable" }
        : job));
      return { status: "failed_retryable", error: "网络连接失败，请重试。" };
    }
  }, []);

  const restoreCvFavorites = async () => {
    if (!cvRecoverySelected.length || cvRecoveryRunning) return;
    const selectedJobs = cvRecoveryCandidates.filter((job) => cvRecoverySelected.includes(job.id));
    setCvRecoveryRunning(true);
    setCvAutomationNotice(`正在恢复 ${selectedJobs.length} 个收藏，不调用生成 API…`);
    const restored: number[] = [];
    const failures: string[] = [];
    for (const job of selectedJobs) {
      try {
        const response = await fetch("/api/saved-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id }),
        });
        const payload = await response.json() as { created?: boolean; error?: string };
        if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
        restored.push(job.id);
        updatePendingCvFavorite(job.id, false);
      } catch (error) {
        failures.push(`${job.title}：${error instanceof Error ? error.message : "恢复失败"}`);
      }
    }
    setCvRecoveryCandidates((current) => current.filter((job) => !restored.includes(job.id)));
    setCvRecoverySelected((current) => current.filter((id) => !restored.includes(id)));
    setJobsReloadToken((value) => value + 1);
    setCvAutomationNotice(failures.length
      ? `已恢复 ${restored.length} 个；${failures.length} 个失败：${failures.join("；")}`
      : `已恢复 ${restored.length} 个收藏，没有调用生成 API。`);
    setCvRecoveryRunning(false);
  };

  const runApplicationAutomation = async () => {
    if (automationSaving) return;
    setAutomationSaving(true);
    setAutomationMessage("正在筛选最新美国岗位并建立 CV 任务…");
    try {
      const response = await fetch("/api/application-automation", { method: "POST" });
      const payload = await response.json() as { queuedJobIds?: number[]; screenedOut?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "自动筛选启动失败。");
      const queuedJobIds = Array.isArray(payload.queuedJobIds) ? payload.queuedJobIds : [];
      for (const jobId of queuedJobIds) {
        const cvResponse = await fetch("/api/cv-prebuild/prepare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobId,
            language: automationDashboard?.config.defaultLanguage || "en",
            generationRules: cvGenerationRules.trim() || DEFAULT_CV_GENERATION_RULES,
          }),
        });
        if (!cvResponse.ok) {
          const failed = await cvResponse.json().catch(() => ({})) as { error?: string };
          setAutomationMessage(`岗位已进入队列，但一份 CV 未能启动：${failed.error || cvResponse.status}`);
        }
      }
      setAutomationMessage(queuedJobIds.length
        ? `已选择 ${queuedJobIds.length} 个高匹配岗位并启动英文 CV。浏览器扩展会在 CV 完成后继续填写。`
        : `本轮没有新的岗位进入投递队列；已自动筛除 ${payload.screenedOut || 0} 个不满足硬条件的岗位。`);
      await loadApplicationAutomation();
      setJobsReloadToken((value) => value + 1);
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "自动筛选启动失败。");
    } finally {
      setAutomationSaving(false);
    }
  };

  const updateApplicationAutomationConfig = async (updates: Record<string, unknown>) => {
    if (!automationDashboard || automationSaving) return;
    setAutomationSaving(true);
    try {
      const response = await fetch("/api/application-automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...automationDashboard.config, ...updates }),
      });
      const payload = await response.json() as { config?: ApplicationAutomationDashboard["config"]; error?: string };
      if (!response.ok || !payload.config) throw new Error(payload.error || "自动投递设置保存失败。");
      setAutomationDashboard((current) => current ? { ...current, config: payload.config! } : current);
      setAutomationMessage("自动投递设置已保存。");
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "自动投递设置保存失败。");
    } finally {
      setAutomationSaving(false);
    }
  };

  const updateApplicationAutomationTask = async (taskId: number, action: "confirm_submitted" | "retry") => {
    if (automationSaving) return;
    setAutomationSaving(true);
    try {
      const response = await fetch("/api/application-automation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, action }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "任务更新失败。");
      await loadApplicationAutomation();
      setAutomationMessage(action === "confirm_submitted" ? "这份申请已记为已投递。" : "任务已重新进入自动队列。");
    } catch (error) {
      setAutomationMessage(error instanceof Error ? error.message : "任务更新失败。");
    } finally {
      setAutomationSaving(false);
    }
  };

  const toggleSaved = async (id: number) => {
    const isSaved = saved.includes(id);
    const savedSnapshot = saved;
    setSaved((current) => isSaved
      ? current.filter((item) => item !== id)
      : current.includes(id) ? current : [...current, id]);
    setDailyJobs((current) => current.map((job) => job.id === id ? { ...job, saved: !isSaved } : job));
    setCvAutomationNotice(isSaved ? "正在取消收藏…" : "正在保存到收藏…");
    if (!isSaved) updatePendingCvFavorite(id, true);
    try {
      const response = await fetch(
        isSaved ? `/api/saved-jobs?jobId=${id}` : "/api/saved-jobs",
        {
          method: isSaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: isSaved ? undefined : JSON.stringify({ jobId: id }),
        },
      );
      if (!response.ok) throw new Error(`Saved job request failed with ${response.status}`);
      if (isSaved) {
        setCvTasks((current) => current.filter((job) => job.id !== id));
        setCvAutomationNotice("已取消收藏。");
      } else {
        await response.json() as { created?: boolean };
        updatePendingCvFavorite(id, false);
        setCvAutomationNotice("已加入收藏。进入待申请后才会自动生成 CV。");
      }
      setJobsReloadToken((value) => value + 1);
    } catch {
      setSaved(savedSnapshot);
      setDailyJobs((current) => current.map((job) => job.id === id ? { ...job, saved: isSaved } : job));
      if (!isSaved) updatePendingCvFavorite(id, false);
      setCvAutomationNotice(isSaved
        ? "取消收藏失败，后台记录没有变化。"
        : "收藏失败，后台记录没有变化，请稍后重试。");
    }
  };

  const openPendingCvSelection = (job: Job) => {
    let language: CvTemplateLanguage = "zh";
    try {
      if (window.localStorage.getItem(CV_TEMPLATE_LANGUAGE_STORAGE_KEY) === "en") language = "en";
    } catch {}
    setPendingCvSelection({ job, language, track: recommendCvTemplateTrack(job) });
  };

  const moveFavoriteToPending = async (
    job: Job,
    language: CvTemplateLanguage,
    templateTrack: CvTemplateTrack,
  ) => {
    if (candidateMovingId) return;
    setCandidateMovingId(job.id);
    setCvAutomationNotice(`正在把 ${job.title} 移入待申请并创建 CV 任务…`);
    try {
      const applicationDraft: Application = {
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
      };
      const applicationResponse = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applicationDraft),
      });
      let application = await applicationResponse.json() as Application & { error?: string };
      if (!applicationResponse.ok || !application.id) {
        throw new Error(application.error || "待申请记录创建失败。");
      }
      if (application.status === "收藏") {
        const activationResponse = await fetch("/api/applications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: application.id,
            status: "准备材料",
            nextAction: "准备申请材料",
          }),
        });
        const activated = await activationResponse.json() as Application & { error?: string };
        if (!activationResponse.ok || !activated.id) {
          throw new Error(activated.error || "待申请记录恢复失败。");
        }
        application = activated;
      }
      setApplicationsList((current) => [
        application,
        ...current.filter((item) => item.id !== application.id),
      ]);

      const queueResponse = await fetch("/api/cv-prebuild/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          applicationRowId: application.id,
          language,
          templateTrack,
        }),
      });
      const queued = await queueResponse.json() as { status?: CvPrebuildStatus; error?: string };
      if (!queueResponse.ok) throw new Error(queued.error || "CV 任务排队失败。");
      const status = queued.status ?? "queued";
      setCvTasks((current) => [
        { ...job, saved: true, cvPrebuildStatus: status, cvPrebuildError: "" },
        ...current.filter((item) => item.id !== job.id),
      ]);
      setCandidateBucket("pending");
      window.localStorage.setItem(CV_TEMPLATE_LANGUAGE_STORAGE_KEY, language);
      setPendingCvSelection(null);
      setCvAutomationNotice(status === "ready"
        ? "已进入待申请，现有 CV 初稿可以继续调整。"
        : "已进入待申请，CV 初稿已自动排队。任务会在后台按顺序生成。");
      setJobsReloadToken((value) => value + 1);
    } catch (error) {
      setCvAutomationNotice(error instanceof Error ? error.message : "进入待申请失败，请稍后重试。");
    } finally {
      setCandidateMovingId(null);
    }
  };

  const nextQueuedCvJobId = pendingCvJobs.find(({ job }) => job.cvPrebuildStatus === "queued")?.job.id;
  const pendingQueueCandidate = pendingCvJobs.find(({ job }) =>
    !job.cvPrebuildStatus
    || ["stale", "cancelled"].includes(job.cvPrebuildStatus)
    || canAutomaticallyRetryCv(job));
  const cvGenerationActive = cvTasks.some((job) => activeCvPrebuildStatuses.has(job.cvPrebuildStatus ?? "queued"));
  useEffect(() => {
    if (view !== "saved" || !pendingQueueCandidate?.application.id) return;
    const jobId = pendingQueueCandidate.job.id;
    if (automaticQueueRef.current.has(jobId)) return;
    automaticQueueRef.current.add(jobId);
    void fetch("/api/cv-prebuild/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, applicationRowId: pendingQueueCandidate.application.id }),
    }).then(async (response) => {
      const payload = await response.json() as { status?: CvPrebuildStatus };
      if (!response.ok || !payload.status) return;
      setCvTasks((current) => [
        { ...pendingQueueCandidate.job, cvPrebuildStatus: payload.status, cvPrebuildError: "" },
        ...current.filter((job) => job.id !== jobId),
      ]);
      setJobsReloadToken((value) => value + 1);
    }).catch(() => {
      automaticQueueRef.current.delete(jobId);
    });
  }, [pendingQueueCandidate, view]);
  useEffect(() => {
    if (view !== "saved" || !nextQueuedCvJobId || cvGenerationActive) return;
    if (automaticCvJobRef.current === nextQueuedCvJobId) return;
    const queuedJob = cvTasks.find((job) => job.id === nextQueuedCvJobId)
      ?? dailyJobs.find((job) => job.id === nextQueuedCvJobId);
    if (!queuedJob) return;
    automaticCvJobRef.current = queuedJob.id;
    const timer = window.setTimeout(() => {
      void startCvPrebuild(
        queuedJob.id,
        undefined,
        cvGenerationRules.trim() || DEFAULT_CV_GENERATION_RULES,
      ).finally(() => {
        automaticCvJobRef.current = null;
        automaticQueueRef.current.delete(queuedJob.id);
        setJobsReloadToken((value) => value + 1);
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cvGenerationActive, cvGenerationRules, cvTasks, dailyJobs, nextQueuedCvJobId, startCvPrebuild, view]);

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
    if (!form || saving) return;
    const submittedForm = form;
    setSaving(true);
    setMessage("");
    setForm(null);
    try {
      const response = await fetch("/api/applications", {
        method: submittedForm.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submittedForm),
      });
      if (!response.ok) {
        setForm(submittedForm);
        setMessage("保存失败，请稍后重试。");
        return;
      }

      const savedApplication = await response.json() as Application;
      setApplicationsList((current) => {
        const index = current.findIndex((item) => item.id === savedApplication.id);
        if (index < 0) return [savedApplication, ...current];
        return current.map((item, itemIndex) => itemIndex === index ? savedApplication : item);
      });
      if (!["撤回", "拒绝"].includes(savedApplication.status)) {
        setDailyJobs((current) => current.filter((job) => !sameLogicalJob(job, savedApplication)));
      }

      // The editor already closed optimistically. Automatic task creation and server
      // reconciliation stay in the background and never block the perceived save action.
      if (savedApplication.status === "准备材料") {
        setView("saved");
      } else if (savedApplication.status === "撤回" || savedApplication.status === "拒绝") {
        setView("today");
      } else {
        setView("applications");
      }

      void (async () => {
        const taskDueDate = savedApplication.plannedApplicationDate || savedApplication.deadline;
        if (savedApplication.id && taskDueDate && !tasks.some((task) => task.applicationId === savedApplication.id && task.title === "准备并提交申请")) {
          const taskResponse = await fetch("/api/workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "task", applicationId: savedApplication.id, title: "准备并提交申请", dueDate: taskDueDate, reminderDate: taskDueDate, status: "pending", source: "automatic" }),
          });
          if (taskResponse.ok) await loadWorkflow();
        }
      })();
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (patch: Partial<Application>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
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
    const nextStatus = task.status === "done" ? "pending" : "done";
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));
    const response = await fetch("/api/workflow", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "task", ...task, status: nextStatus }) });
    if (!response.ok) await loadWorkflow();
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

  const resolveManualReview = async (
    kind: "request" | "quality",
    id: number,
    action: "approve" | "ignore" | "delete" | "rerun",
    label: string,
  ) => {
    const prompt = action === "approve"
      ? `确认人工通过 ${label} 吗？`
      : action === "ignore"
        ? `确认将 ${label} 加入不再推荐吗？`
        : action === "rerun"
          ? `确认重新核验 ${label} 吗？`
          : "确认仅删除这条核验记录吗？该岗位未来仍可能再次出现。";
    if (!window.confirm(prompt)) return;

    const requestSnapshot = requests;
    const qualitySnapshot = quality;
    if (kind === "request" && action !== "rerun") {
      setRequests((current) => current.filter((item) => item.id !== id));
    }
    if (kind === "quality") {
      setQuality((current) => current ? {
        ...current,
        issues: current.issues.filter((issue) => issue.jobId !== id),
      } : current);
    }

    const response = await fetch(kind === "request" ? "/api/manual-review" : "/api/quality-manual-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(kind === "request" ? { id, action } : { jobId: id, action }),
    });
    if (!response.ok) {
      setRequests(requestSnapshot);
      setQuality(qualitySnapshot);
      const payload = await response.json().catch(() => ({})) as { error?: string };
      window.alert(payload.error || "操作失败，请稍后重试。");
      return;
    }
    if (action === "approve" || action === "ignore") {
      const jobsResponse = await fetch("/api/jobs", { cache: "no-store" });
      if (jobsResponse.ok) {
        const rows = await jobsResponse.json() as Job[];
        setDailyJobs(rows);
        setSaved(rows.filter((row) => row.saved).map((row) => row.id));
      }
    }
    if (kind === "request" && action === "rerun") await loadRequests();
  };

  const ignoreJob = async (reason: string, hardRequirement = false) => {
    if (!ignoreTarget) return;
    setIgnoreSaving(true);
    const response = await fetch("/api/ignored-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: ignoreTarget.company,
        title: ignoreTarget.title,
        jobUrl: ignoreTarget.jobUrl,
        reason: hardRequirement ? `硬性要求不符合：${reason}` : reason,
        ...(hardRequirement ? {
          exclusionType: "hard_requirement_mismatch",
          learningEligible: false,
        } : {}),
      }),
    });
    setIgnoreSaving(false);
    if (!response.ok) return;
    setDailyJobs((current) => current.filter((job) => job.id !== ignoreTarget.id));
    setSaved((current) => current.filter((id) => id !== ignoreTarget.id));
    setIgnoreTarget(null);
    setHardRequirementOpen(false);
    void loadIgnoredJobs();
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
          <h1>{view === "applications" ? "申请进度" : view === "saved" ? "候选岗位" : view === "automation" ? "自动投递" : view === "companies" ? "公司研究与面经" : view === "verify" ? "岗位核验" : view === "profile" ? "申请固定资料" : view === "tools" ? "工具" : view === "ignored" ? "不再推荐" : "早上好，十一"}</h1>
          <p className="hero-copy">
            {view === "applications"
              ? "在这里更新每一次投递、跟进和面试，并集中查看所有求职日程。"
              : view === "saved"
                ? "你保存或建立申请记录但尚未投递的岗位，都在同一个列表里统一管理。"
              : view === "automation"
                ? "系统每天筛选美国岗位、生成英文 CV，并把可执行任务交给 Chrome；不确定答案进入异常队列。"
              : view === "companies"
                ? `公司池共 ${companyRecords.length} 条；自动汇总官网、招聘入口、岗位记录与历年公开面经。`
                : view === "verify"
                  ? "提交岗位、查看统一核验队列，并在同一页监控自动数据质检。"
                  : view === "profile"
                    ? "集中维护每份申请都会重复使用的联系方式、地址、固定问答、奖项和论文。"
                  : view === "tools"
                    ? "低频管理、核验和申请辅助功能都集中在这里，主流程保持简单。"
                  : view === "ignored"
                    ? "这些岗位不会在之后的每日搜索中再次出现。"
                : "今天只看真正值得你花时间申请的岗位。"}
          </p>
        </div>
        {view === "today" ? (
          <button className="scan-status scan-status-toggle" type="button" onClick={() => setScanPanelOpen((current) => !current)} aria-expanded={scanPanelOpen}>
            <span className="pulse" />
            <div><strong>岗位更新</strong><span>{scanPanelOpen ? "收起更新面板" : "需要时再打开"}</span></div>
          </button>
        ) : (
          <div className="scan-status">
            <span className="pulse" />
            <div><strong>{view === "companies" ? "公司与面经" : view === "applications" ? "本月活动" : view === "automation" ? "受控执行" : view === "profile" ? "私有资料" : view === "verify" ? "核验与质检" : view === "tools" ? "集中入口" : "已隐藏"}</strong><span>{view === "companies" ? `${companyRecords.length} 家 · ${experiences.length} 条面经` : view === "applications" ? `${calendarEvents.length} 项` : view === "automation" ? `${automationDashboard?.summary.submitted || 0} 已投 · ${automationDashboard?.summary.needsReview || 0} 待确认` : view === "profile" ? "仅你的账户可见" : view === "verify" ? `${requests.length + qualityQueueIssues.length} 条队列记录` : view === "tools" ? "7 个辅助功能" : `${ignoredJobs.length} 条`}</span></div>
          </div>
        )}
      </section>

      {view === "today" && (
        <section className="quick-start" aria-label="使用流程">
          <div><span>1</span><strong>看今日岗位</strong><p>先用搜索和筛选缩小范围。</p></div>
          <div><span>2</span><strong>星标进候选</strong><p>值得研究的岗位先集中保存。</p></div>
          <div><span>3</span><strong>建立申请记录</strong><p>准备、投递和面试都在申请页跟进。</p></div>
        </section>
      )}

      {view === "saved" && (
        <section className="stats stats-two candidate-stage-tabs" role="tablist" aria-label="候选岗位分类">
          <button type="button" role="tab" aria-selected={candidateBucket === "favorites"} className={candidateBucket === "favorites" ? "active" : ""} onClick={() => setCandidateBucket("favorites")}>
            <span>收藏</span><strong>{allFavoriteJobs.length}</strong><em>只保存岗位，不调用 CV API</em>
          </button>
          <button type="button" role="tab" aria-selected={candidateBucket === "pending"} className={candidateBucket === "pending" ? "active" : ""} onClick={() => setCandidateBucket("pending")}>
            <span>待申请</span><strong>{pendingApplications.length}</strong><em>生成中 {cvTaskSummary.queued + cvTaskSummary.running} · 已生成 {cvTaskSummary.ready} · 需处理 {cvTaskSummary.needs_action}</em>
          </button>
        </section>
      )}

      {view === "automation" && (
        <section className="application-automation" aria-live="polite">
          <div className="automation-command-bar">
            <div>
              <p className="eyebrow">US AUTO APPLICATION</p>
              <h2>自动投递总览</h2>
              <p>当前先运行 5 份受控样本。浏览器会自动填写并上传 CV，但最终提交保持关闭，直到样本确认无误。</p>
            </div>
            <button type="button" className="primary" disabled={automationSaving} onClick={() => void runApplicationAutomation()}>
              {automationSaving ? "正在处理…" : "立即运行一轮"}
            </button>
          </div>
          {automationMessage && <p className="cv-automation-notice" role="status">{automationMessage}</p>}
          {automationLoading && !automationDashboard ? (
            <div className="automation-loading">正在读取自动投递任务…</div>
          ) : automationDashboard && (
            <>
              <div className="automation-settings">
                <label><span>自动筛选</span><input type="checkbox" checked={automationDashboard.config.enabled} disabled={automationSaving} onChange={(event) => void updateApplicationAutomationConfig({ enabled: event.target.checked })} /></label>
                <label><span>每日上限</span><select value={automationDashboard.config.dailyLimit} disabled={automationSaving} onChange={(event) => void updateApplicationAutomationConfig({ dailyLimit: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} 份</option>)}</select></label>
                <label><span>最低初筛分</span><select value={automationDashboard.config.minimumScore} disabled={automationSaving} onChange={(event) => void updateApplicationAutomationConfig({ minimumScore: Number(event.target.value) })}>{[75, 80, 85, 90].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <div className={`automation-mode ${automationDashboard.config.finalSubmitEnabled ? "live" : "pilot"}`}><strong>{automationDashboard.config.finalSubmitEnabled ? "自动提交已开启" : "受控试运行"}</strong><span>{automationDashboard.config.finalSubmitEnabled ? "仅白名单 ATS 且无拦截项时提交" : "自动填写完成后进入一次确认"}</span></div>
              </div>
              <div className="automation-summary-grid">
                <article><span>等待 CV</span><strong>{automationDashboard.summary.awaitingCv}</strong></article>
                <article><span>等待浏览器</span><strong>{automationDashboard.summary.ready}</strong></article>
                <article><span>正在执行</span><strong>{automationDashboard.summary.running}</strong></article>
                <article className={automationDashboard.summary.needsReview ? "attention" : ""}><span>需要确认</span><strong>{automationDashboard.summary.needsReview}</strong></article>
                <article className="complete"><span>已投递</span><strong>{automationDashboard.summary.submitted}</strong></article>
                <article><span>硬条件筛除</span><strong>{automationDashboard.summary.screenedOut}</strong></article>
              </div>
              <div className="automation-task-list">
                <div className="automation-task-head"><span>公司与岗位</span><span>阶段</span><span>ATS</span><span>操作</span></div>
                {automationDashboard.tasks.filter((task) => task.status !== "screened_out").length === 0 ? (
                  <div className="automation-empty">还没有进入自动投递队列的岗位。每日美国岗位扫描完成后会自动建立任务。</div>
                ) : automationDashboard.tasks.filter((task) => task.status !== "screened_out").map((task) => (
                  <article className="automation-task-row" key={task.id}>
                    <div><strong>{task.company}</strong><span>{task.title}</span><small>{task.location || "美国"} · 初筛 {task.eligibilityScore}</small></div>
                    <div><span className={`automation-status status-${task.status}`}>{automationStatusLabel(task.status)}</span><small>{task.cvStatus ? `CV: ${task.cvStatus}` : task.stage}</small></div>
                    <span>{task.atsProvider}</span>
                    <div className="automation-task-actions">
                      <a href={task.jobUrl} target="_blank" rel="noreferrer">打开申请页</a>
                      {task.applicationRowId && <a href={`/applications/${task.applicationRowId}`}>查看记录</a>}
                      {task.status === "needs_review" && <button type="button" disabled={automationSaving} onClick={() => void updateApplicationAutomationTask(task.id, "confirm_submitted")}>确认已提交</button>}
                      {["cv_failed", "failed_retryable", "needs_review"].includes(task.status) && <button type="button" disabled={automationSaving} onClick={() => void updateApplicationAutomationTask(task.id, "retry")}>重新执行</button>}
                    </div>
                  </article>
                ))}
              </div>
              <p className="automation-footnote">Chrome 扩展必须已更新到 V5.0，并至少有一个 Chrome 窗口在运行。CAPTCHA、登录验证、敏感必答题、开放题和不唯一的提交按钮都会自动停下并进入“需要确认”。</p>
            </>
          )}
        </section>
      )}

      {view === "tools" && (
        <section className="tools-section" aria-label="求职工具">
          <div className="tools-grid">
            <button type="button" onClick={() => setView("companies")}><span>⌕</span><strong>公司与面经</strong><p>查看目标公司、招聘入口和公开面经。</p></button>
            <button type="button" onClick={() => setView("verify")}><span>✓</span><strong>岗位核验</strong><p>提交链接并处理人工复核例外。</p></button>
            <button type="button" onClick={() => setView("ignored")}><span>⊘</span><strong>不再推荐</strong><p>查看或恢复被忽略的岗位。</p></button>
            <a href="/autofill"><span>✦</span><strong>申请 Autofill</strong><p>管理申请表自动填写资料。</p></a>
            <a href="/bookmarklet"><span>＋</span><strong>Chrome 保存岗位</strong><p>从任意 JD 页面直接加入候选。</p></a>
            <a href="/cv-knowledge"><span>◈</span><strong>CV 知识库</strong><p>维护可证明的项目、技能与事实。</p></a>
            <a href="/screening-learning"><span>◇</span><strong>筛选学习</strong><p>查看从人工判断中提炼的建议。</p></a>
          </div>
        </section>
      )}

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

      {view === "today" && scanPanelOpen && (
        <section className="scan-dashboard" aria-label="岗位扫描入口">
          <div className="scan-dashboard-head">
            <div><strong>真实招聘数据</strong><p>美国来源与中国来源独立运行、独立显示进度，结果进入同一个岗位库统一去重。</p></div>
            <button className="ignored-list-link" onClick={() => setView("ignored")}>忽略名单 {ignoredJobs.length}</button>
          </div>
          <article className="scan-lane scan-lane-us">
            <div className="scan-lane-head">
              <div><span>美国岗位更新</span><p>{jobsMessage || "扫描美国公司 ATS、JobSpy 聚合平台和美国公司官网。"}</p></div>
              <button className="refresh-jobs" onClick={() => void refreshJobs()} disabled={jobsRefreshing || scanRunning}>
                更新美国岗位
              </button>
            </div>
            <div className={`scan-summary scan-summary-${scanStatus?.state ?? "idle"}`} aria-live="polite">
            <span className="scan-summary-dot" />
            <div>
              {scanRunning ? (
                <>
                  <strong>更新进行中</strong>
                  <p>{scanStatus?.message || "美国岗位来源正在扫描、核验并回写。"}</p>
                  <div className="scan-progress-track" aria-label={`当前阶段完成 ${Math.round(usProgressRatio * 100)}%`}>
                    <span style={{ width: `${Math.max(2, usProgressRatio * 100)}%` }} />
                  </div>
                  <div className="scan-live-metrics">
                    <span>当前来源<b>{scanStatus?.currentSource || "美国公司 ATS"}</b></span>
                    <span>进度<b>{scanStatus?.stepsCompleted ?? 0}/{scanStatus?.stepsTotal || "?"}</b></span>
                    <span>已扫描<b>{scanStatus?.scanned ?? scanStatus?.atsScanned ?? 0}</b></span>
                    <span>去重后<b>{scanStatus?.uniqueJobs ?? 0}</b></span>
                    <span>筛选排除<b>{scanStatus?.filtered ?? 0}</b></span>
                    <span>官网核验<b>{scanStatus?.verified ?? 0}</b></span>
                    <span>筛选保留<b>{scanStatus?.eligible ?? scanStatus?.atsMatched ?? 0}</b></span>
                    <span>新增<b>{scanStatus?.created ?? 0}</b></span>
                  </div>
                  <p className="scan-eta">
                    已运行 {formatDuration(scanElapsedSeconds)}
                    {usEtaSeconds > 0 ? `，按当前阶段速度估计还需约 ${formatDuration(usEtaSeconds)}` : `，本次运行上限还剩 ${formatDuration(scanRemainingSeconds)}`}。
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
              {chinaScanControl?.state === "attention_required" && (
                <p className="scan-rejections">需要登录或验证码时不会绕过，也不会把该来源记作扫描完成。完成专用 Chrome 中的登录或验证后，再点一次“更新中国岗位”，扫描会从未完成批次继续。</p>
              )}
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
                      排除原因：缺少标题或链接 {chinaProgress.rejectionReasons.missing_title_or_url ?? chinaProgress.rejectionReasons.missing_required_fields ?? 0}；关键词不匹配 {chinaProgress.rejectionReasons.title_not_targeted ?? 0}；高年资、工程类或无关岗位 {chinaProgress.rejectionReasons.excluded_seniority_or_role ?? 0}；经验超过 3 年或核心方向不符 {chinaProgress.rejectionReasons.degree_experience_or_skill_gap ?? 0}。工资仅展示，不参与自动筛选。
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
                          <b>{item.source || "未知来源"}</b>
                          {`：发现 ${item.jobsDiscovered ?? item.jobs_discovered ?? 0} · 保留 ${item.jobsEligible ?? item.jobs_eligible ?? 0} · 新增 ${item.jobsCreated ?? item.jobs_created ?? 0}`}
                          {(item.jobsDuplicateListings ?? item.jobs_duplicate_listings) ? ` · 重复 ${item.jobsDuplicateListings ?? item.jobs_duplicate_listings}` : ""}
                          {Object.entries(item.rejectionReasons ?? item.rejection_reasons ?? {})
                            .filter(([, value]) => Number(value) > 0)
                            .map(([reason, value]) => ` · ${chinaRejectionLabels[reason] || reason} ${value}`)}
                          {Object.entries(item.reviewCounts ?? item.review_counts ?? {})
                            .filter(([, value]) => Number(value) > 0)
                            .map(([reason, value]) => ` · 待核验${reason === "salary_missing_or_negotiable" ? "工资" : chinaRejectionLabels[reason] || reason} ${value}`)}
                          {item.attention ? ` · 中断原因：${item.attention}` : ""}
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
              <div><p className="eyebrow">DAILY SHORTLIST</p><h2>{view === "saved" ? `候选岗位（${allFavoriteJobs.length + pendingApplications.length}）` : `今日岗位（${jobs.length}）`}</h2></div>
              {view === "today" && <div className="job-controls">
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
              </div>}
            </div>
            {view === "today" && <div className="track-scroller" aria-label="行业筛选">
              {tracks.map((item) => (
                <button key={item} className={track === item ? "active" : ""} onClick={() => setTrack(item)}>{item}</button>
              ))}
            </div>}
          </section>
          {view === "saved" ? (
            <>
            <section className="candidate-workspace" aria-live="polite">
              <div className="section-heading candidate-list-heading">
                <div>
                  <p className="eyebrow">{candidateBucket === "favorites" ? "FAVORITES" : "PENDING APPLICATIONS"}</p>
                  <h2>{candidateBucket === "favorites" ? "我的收藏" : "待申请岗位"}（{candidateRows.length}）</h2>
                </div>
              </div>
              {cvAutomationNotice && <p className="cv-automation-notice" role="status">{cvAutomationNotice}</p>}
              {cvRecoveryCandidates.length > 0 && candidateBucket === "favorites" && (
                <section className="cv-recovery-panel" aria-labelledby="cv-recovery-title">
                  <div>
                    <strong id="cv-recovery-title">找回刚才未写入后台的收藏</strong>
                    <span>恢复后只会进入收藏，不会调用 CV API。</span>
                  </div>
                  <div className="cv-recovery-list compact">
                    {cvRecoveryCandidates.map((job) => (
                      <label key={`cv-recovery-${job.id}`}>
                        <input
                          type="checkbox"
                          checked={cvRecoverySelected.includes(job.id)}
                          onChange={(event) => setCvRecoverySelected((current) => event.target.checked
                            ? [...new Set([...current, job.id])]
                            : current.filter((id) => id !== job.id))}
                        />
                        <span><strong>{job.title}</strong><small>{job.company}</small></span>
                      </label>
                    ))}
                  </div>
                  <div className="cv-recovery-actions">
                    <button type="button" className="primary" disabled={cvRecoveryRunning || !cvRecoverySelected.length} onClick={() => void restoreCvFavorites()}>
                      {cvRecoveryRunning ? "正在恢复…" : `恢复到收藏（${cvRecoverySelected.length}）`}
                    </button>
                  </div>
                </section>
              )}
              {candidateRows.length === 0 ? (
                <div className="empty-state">
                  <span>{candidateBucket === "favorites" ? "☆" : "✓"}</span>
                  <h3>{candidateBucket === "favorites" ? "收藏还是空的" : "还没有待申请岗位"}</h3>
                  <p>{candidateBucket === "favorites" ? "在今日岗位点星标，岗位会先保存到这里。" : "从收藏中点击“进入待申请”，系统会自动生成第一版 CV。"}</p>
                </div>
              ) : (
                <div className="compact-candidate-list">
                  <PaginationControls page={safeSavedPage} pageCount={savedPageCount} onPageChange={setSavedPage} label={candidateBucket === "favorites" ? "收藏" : "待申请"} />
                  <div className={`compact-candidate-header ${candidateBucket}`} aria-hidden="true">
                    <span>公司</span><span>岗位</span><span>{candidateBucket === "favorites" ? "事实库匹配" : "CV 进度"}</span><span>{candidateBucket === "favorites" ? "操作" : "更新时间"}</span>
                  </div>
                  {pagedCandidateRows.map((entry) => entry.kind === "job" ? (
                    <article className="compact-candidate-row favorites" key={`favorite-${entry.job.id}`}>
                      <a className="compact-candidate-main" href={`/jobs/${entry.job.id}`} aria-label={`查看 ${entry.job.company} ${entry.job.title} 详情`}>
                        <strong title={entry.job.company}>{entry.job.company}</strong>
                        <span title={entry.job.title}>{entry.job.title}</span>
                        <span className="fact-fit-inline fact-fit-loading" data-fact-fit-job={entry.job.id}>事实库评分中…</span>
                      </a>
                      <div className="compact-candidate-actions">
                        <button type="button" onClick={() => void toggleSaved(entry.job.id)}>取消收藏</button>
                        <button type="button" className="primary" disabled={candidateMovingId === entry.job.id} onClick={() => openPendingCvSelection(entry.job)}>
                          {candidateMovingId === entry.job.id ? "正在进入…" : "进入待申请"}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <a className="compact-candidate-row pending" href={`/applications/${entry.application.id}`} key={`pending-${entry.application.id}`}>
                      <strong title={entry.application.company}>{entry.application.company}</strong>
                      <span title={entry.application.title}>{entry.application.title}</span>
                      <span className="compact-candidate-status">
                        {entry.job?.cvPrebuildStatus
                          ? <CvPrebuildStatusBadge status={entry.job.cvPrebuildStatus} />
                          : <span className="cv-prebuild-badge neutral">等待建立任务</span>}
                      </span>
                      <time dateTime={entry.job?.cvPrebuildUpdatedAt || entry.application.updatedAt || undefined}>
                        {entry.job?.cvPrebuildUpdatedAt
                          ? new Date(entry.job.cvPrebuildUpdatedAt).toLocaleString("zh-CN")
                          : entry.application.updatedAt
                            ? new Date(entry.application.updatedAt).toLocaleDateString("zh-CN")
                            : "刚刚"}
                      </time>
                    </a>
                  ))}
                </div>
              )}
              <div className="candidate-automation-note">
                <p>收藏不会调用 API。进入待申请时先确认中文/英文和 CV 模板，再按顺序生成 CV，避免多个任务同时触发限流。</p>
                <button type="button" onClick={() => setCvRulesOpen(true)}>调整自动生成规则</button>
              </div>
            </section>
            </>
          ) : <section className="job-list" aria-live="polite">
            {jobsLoading ? (
              <div className="empty-state"><span>◌</span><h3>正在读取岗位</h3><p>请稍等，正在载入最新核验结果。</p></div>
            ) : jobsError ? (
              <div className="empty-state"><span>!</span><h3>岗位读取失败</h3><p>{jobsError}</p><button className="primary" onClick={() => {
                setJobsLoading(true);
                setJobsError("");
                setJobsReloadToken((value) => value + 1);
              }}>重新读取</button></div>
            ) : jobs.length === 0 ? (
              <div className="empty-state"><span>◎</span><h3>这个筛选下暂时没有已核验岗位</h3><p>打开“岗位更新”面板即可运行首轮扫描。</p></div>
            ) : visibleJobs.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-card-top">
                  <div className="company-logo">{job.company.slice(2, 4)}</div>
                  <div className="job-title">
                    <div className="job-meta"><span>{new Date(job.discoveredAt).toLocaleDateString("zh-CN")}</span><span>{job.track}</span></div>
                    <h3>{job.title}</h3><p>{job.company} · {job.location}</p>
                    {["已过期", "疑似过期"].includes(job.status) && <span className="expired-job-label">{job.status}{job.expirationReason ? ` · ${job.expirationReason}` : ""}</span>}
                  </div>
                  <button className={`save-button ${saved.includes(job.id) ? "saved" : ""}`} onClick={() => void toggleSaved(job.id)} aria-label={saved.includes(job.id) ? "取消收藏" : "收藏岗位"}>
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
              <h2>{applicationBucket === "submitted" ? "我的申请" : applicationBucket === "interview" ? "我的面试" : applicationBucket === "offer" ? "我的 Offer" : "拒绝记录"}（{visibleApplications.length}）</h2>
            </div>
            <div className="section-actions">
              <button className={`quiet-list-button ${applicationBucket === "rejected" ? "active" : ""}`} onClick={() => setApplicationBucket("rejected")}>拒绝记录 {rejectedApplications.length}</button>
            </div>
          </div>
          {visibleApplications.length === 0 ? (
            <div className="empty-state"><span>▤</span><h3>{applicationBucket === "rejected" ? "没有拒绝记录" : "还没有申请记录"}</h3><p>{applicationBucket === "rejected" ? "被拒绝的岗位会保留在这个隐藏列表中。" : "发现具体 JD 后新增一条，之后直接在这里更新状态。"}</p></div>
          ) : (
            <div className="compact-application-list" role="table" aria-label="申请记录">
              <PaginationControls page={safeApplicationPage} pageCount={applicationPageCount} onPageChange={setApplicationPage} label="申请" />
              <div className="compact-application-header" role="row">
                <span role="columnheader">公司</span>
                <span role="columnheader">岗位</span>
                <span role="columnheader">申请日期</span>
              </div>
              {pagedApplications.map((item) => (
                <a className="compact-application-row" role="row" href={`/applications/${item.id}`} key={item.id} aria-label={`查看 ${item.company} ${item.title} 申请详情`}>
                  <strong role="cell" title={item.company}>{item.company}</strong>
                  <span role="cell" title={item.title}>{item.title}</span>
                  <time role="cell" dateTime={item.appliedDate || undefined}>{item.appliedDate || "未记录"}</time>
                </a>
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
          <p className="result-count">匹配 {companies.length} / {companyRecords.length} 条目标公司记录</p>
          <PaginationControls page={safeCompanyPage} pageCount={companyPageCount} onPageChange={setCompanyPage} label="公司" />
          <div className="company-list">
            {visibleCompanies.map((company) => {
              const companyJobs = dailyJobs.filter((job) => !["已过期", "疑似过期"].includes(job.status) && job.company.toLowerCase() === company.company.toLowerCase());
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
                  {item.status === "需复核" && item.id && <>
                    <button className="primary" onClick={() => void resolveManualReview("request", item.id as number, "approve", `${item.company} · ${item.title}`)}>人工通过</button>
                    <button className="danger" onClick={() => void resolveManualReview("request", item.id as number, "ignore", `${item.company} · ${item.title}`)}>不再推荐</button>
                  </>}
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
                  {issue.automationStatus === "needs_review" && <>
                    <button className="primary" onClick={() => void resolveManualReview("quality", issue.jobId, "approve", `${issue.company} · ${issue.title}`)}>人工通过</button>
                    <button onClick={() => void resolveManualReview("quality", issue.jobId, "rerun", `${issue.company} · ${issue.title}`)}>重新核验</button>
                    <button className="danger" onClick={() => void resolveManualReview("quality", issue.jobId, "ignore", `${issue.company} · ${issue.title}`)}>不再推荐</button>
                    <button onClick={() => void resolveManualReview("quality", issue.jobId, "delete", `${issue.company} · ${issue.title}`)}>仅删除记录</button>
                  </>}
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
            <form className="profile-form" onSubmit={saveProfile}>
              <article className="profile-card profile-source-note">
                <div><p className="eyebrow">APPLICATION DATA AUTHORITY</p><h2>固定资料和 CV 各管一部分</h2></div>
                <p>这里保存所有申请都会重复使用的资料。教育、工作经历、项目、技能和岗位定制描述不在这里重复维护，Autofill 会继续从 CV 事实库和当前岗位的最终 CV 读取。</p>
              </article>

              <article className="profile-card">
                <div className="section-heading compact">
                  <div><p className="eyebrow">BILINGUAL IDENTITY & CONTACT</p><h2>中英文身份与联系方式</h2></div>
                  <span>私有</span>
                </div>
                <div className="profile-grid">
                  <label>默认 Autofill 资料<select value={profile.applicationProfile.defaultLanguage} onChange={(event) => updateFixedProfileSection("defaultLanguage", event.target.value as "en" | "zh")}><option value="zh">中文资料</option><option value="en">English profile</option></select></label>
                  <label>登录邮箱<input value={profile.userEmail} disabled /></label>
                </div>
                <p className="profile-help">Chrome 扩展每次填写前都可以切换中文或英文；这里的默认值只在扩展尚未保存选择时使用。</p>
                <div className="profile-addresses">
                  <section className="profile-repeat-card">
                    <h3>English profile</h3>
                    <div className="profile-grid">
                      <label>First name<input value={profile.applicationProfile.identity.firstName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, firstName: event.target.value })} /></label>
                      <label>Middle name<input value={profile.applicationProfile.identity.middleName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, middleName: event.target.value })} /></label>
                      <label>Last name<input value={profile.applicationProfile.identity.lastName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, lastName: event.target.value })} /></label>
                      <label>Preferred name<input value={profile.applicationProfile.identity.preferredName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, preferredName: event.target.value })} /></label>
                      <label>Application email<input type="email" value={profile.applicationProfile.identity.email} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, email: event.target.value })} /></label>
                      <label>US phone<input value={profile.applicationProfile.identity.usPhone} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, usPhone: event.target.value })} placeholder="e.g. +1 615 555 0123" /></label>
                    </div>
                  </section>
                  <section className="profile-repeat-card">
                    <h3>中文资料</h3>
                    <div className="profile-grid">
                      <label className="full">中文姓名<input value={profile.applicationProfile.identity.chineseFullName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chineseFullName: event.target.value })} placeholder="例如 张馨予" /></label>
                      <label>姓<input value={profile.applicationProfile.identity.chineseLastName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chineseLastName: event.target.value })} /></label>
                      <label>名<input value={profile.applicationProfile.identity.chineseFirstName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chineseFirstName: event.target.value })} /></label>
                      <label>常用名<input value={profile.applicationProfile.identity.chinesePreferredName} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chinesePreferredName: event.target.value })} /></label>
                      <label>申请邮箱<input type="email" value={profile.applicationProfile.identity.chineseEmail} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chineseEmail: event.target.value })} /></label>
                      <label>中国电话号码<input value={profile.applicationProfile.identity.chinaPhone} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, chinaPhone: event.target.value })} placeholder="例如 +86 138 0000 0000" /></label>
                      <label>微信号<input value={profile.applicationProfile.identity.wechat} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, wechat: event.target.value })} /></label>
                    </div>
                  </section>
                </div>
                <div className="profile-grid">
                  <label>LinkedIn<input type="url" value={profile.applicationProfile.links.linkedin} onChange={(event) => updateFixedProfileSection("links", { ...profile.applicationProfile.links, linkedin: event.target.value })} /></label>
                  <label>GitHub<input type="url" value={profile.applicationProfile.links.github} onChange={(event) => updateFixedProfileSection("links", { ...profile.applicationProfile.links, github: event.target.value })} /></label>
                  <label className="full">个人网站<input type="url" value={profile.applicationProfile.links.website} onChange={(event) => updateFixedProfileSection("links", { ...profile.applicationProfile.links, website: event.target.value })} /></label>
                </div>
              </article>

              <article className="profile-card">
                <div className="section-heading compact"><div><p className="eyebrow">APPLICATION LOCATION DATA</p><h2>美国地址与中文申请信息</h2></div><span>按 Autofill 语言使用</span></div>
                <div className="profile-addresses">
                  <section className="profile-repeat-card">
                    <h3>US mailing address</h3>
                    <div className="profile-grid">
                      <label className="full">Address line 1<input value={profile.applicationProfile.addresses.us.address1} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, address1: event.target.value } })} /></label>
                      <label className="full">Address line 2<input value={profile.applicationProfile.addresses.us.address2} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, address2: event.target.value } })} /></label>
                      <label>City<input value={profile.applicationProfile.addresses.us.city} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, city: event.target.value } })} /></label>
                      <label>State<input value={profile.applicationProfile.addresses.us.state} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, state: event.target.value } })} /></label>
                      <label>ZIP<input value={profile.applicationProfile.addresses.us.postalCode} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, postalCode: event.target.value } })} /></label>
                      <label>Country<input value={profile.applicationProfile.addresses.us.country} onChange={(event) => updateFixedProfileSection("addresses", { ...profile.applicationProfile.addresses, us: { ...profile.applicationProfile.addresses.us, country: event.target.value } })} /></label>
                    </div>
                  </section>
                  <section className="profile-repeat-card">
                    <h3>中文申请补充信息</h3>
                    <p className="profile-help">中国校招通常询问籍贯、出生地和性别，不把它们当作详细邮寄地址。</p>
                    <div className="profile-grid">
                      <label>籍贯<input value={profile.applicationProfile.identity.nativePlaceZh} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, nativePlaceZh: event.target.value })} /></label>
                      <label>Native place<input value={profile.applicationProfile.identity.nativePlaceEn} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, nativePlaceEn: event.target.value })} /></label>
                      <label>出生地<input value={profile.applicationProfile.identity.birthPlaceZh} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, birthPlaceZh: event.target.value })} /></label>
                      <label>Place of birth<input value={profile.applicationProfile.identity.birthPlaceEn} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, birthPlaceEn: event.target.value })} /></label>
                      <label>性别<select value={profile.applicationProfile.identity.genderZh} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, genderZh: event.target.value, genderEn: event.target.value === "女" ? "Female" : event.target.value === "男" ? "Male" : "" })}><option value="">未设置</option><option value="女">女</option><option value="男">男</option></select></label>
                      <label>Gender<input value={profile.applicationProfile.identity.genderEn} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, genderEn: event.target.value })} /></label>
                      <label>民族<input value={profile.applicationProfile.identity.ethnicityZh} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, ethnicityZh: event.target.value })} /></label>
                      <label>Ethnicity<input value={profile.applicationProfile.identity.ethnicityEn} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, ethnicityEn: event.target.value })} /></label>
                      <label>出生日期<input type="date" value={profile.applicationProfile.identity.dateOfBirth} onChange={(event) => updateFixedProfileSection("identity", { ...profile.applicationProfile.identity, dateOfBirth: event.target.value })} /></label>
                    </div>
                  </section>
                </div>
              </article>

              <article className="profile-card">
                <div className="section-heading compact"><div><p className="eyebrow">ELIGIBILITY</p><h2>工作授权与固定选择题</h2></div><span>不会自动提交</span></div>
                <div className="profile-grid">
                  {([
                    ["age18", "已满 18 岁"], ["workAuthorizationUS", "有美国工作授权"], ["sponsorshipUS", "现在或未来需要美国 Sponsorship"],
                    ["workAuthorizationChina", "有中国工作授权"], ["relocation", "愿意搬迁"], ["remoteWork", "可接受远程工作"],
                  ] as const).map(([key, label]) => <label key={key}>{label}<select value={profile.applicationProfile.eligibility[key]} onChange={(event) => updateFixedProfileSection("eligibility", { ...profile.applicationProfile.eligibility, [key]: event.target.value })}><option value="">未设置</option><option value="yes">Yes</option><option value="no">No</option></select></label>)}
                  <label>美国签证 / 身份状态<input value={profile.applicationProfile.eligibility.visaStatusUS} onChange={(event) => updateFixedProfileSection("eligibility", { ...profile.applicationProfile.eligibility, visaStatusUS: event.target.value })} placeholder="例如 F-1 OPT" /></label>
                  <label>最早入职时间<input value={profile.applicationProfile.application.availableStartDate} onChange={(event) => updateFixedProfileSection("application", { ...profile.applicationProfile.application, availableStartDate: event.target.value })} placeholder="例如 2027-06-01 或 Two weeks after offer" /></label>
                  <label className="full">How did you hear about us?<input value={profile.applicationProfile.application.hearAboutUs} onChange={(event) => updateFixedProfileSection("application", { ...profile.applicationProfile.application, hearAboutUs: event.target.value })} /></label>
                </div>
              </article>

              <article className="profile-card">
                <div className="section-heading compact"><div><p className="eyebrow">AWARDS</p><h2>奖项</h2></div><button type="button" className="profile-add-button" onClick={() => updateFixedProfileSection("awards", [...profile.applicationProfile.awards, { name: "", type: "", date: "", issuer: "", descriptionZh: "", descriptionEn: "" }])}>＋ 添加奖项</button></div>
                <p className="profile-help">个人奖 / 团队奖单独保存；中英文描述按扩展中的资料语言自动选择。</p>
                <div className="profile-repeat-list">
                  {profile.applicationProfile.awards.map((award, index) => <section className="profile-repeat-card" key={`award-${index}`}>
                    <div className="profile-repeat-head"><h3>奖项 {index + 1}</h3><button type="button" onClick={() => updateFixedProfileSection("awards", profile.applicationProfile.awards.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div>
                    <div className="profile-grid">
                      <label>奖项名称<input value={award.name} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} /></label>
                      <label>获奖时间<input value={award.date} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))} placeholder="YYYY 或 YYYY-MM" /></label>
                      <label>奖项类型<select value={award.type} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value as "individual" | "team" | "" } : item))}><option value="">未设置</option><option value="individual">个人奖 / Individual Award</option><option value="team">团队奖 / Team Award</option></select></label>
                      <label>颁发机构<input value={award.issuer} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, issuer: event.target.value } : item))} /></label>
                      <label className="full">奖项描述（中文）<textarea value={award.descriptionZh} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, descriptionZh: event.target.value } : item))} /></label>
                      <label className="full">Award description (English)<textarea value={award.descriptionEn} onChange={(event) => updateFixedProfileSection("awards", profile.applicationProfile.awards.map((item, itemIndex) => itemIndex === index ? { ...item, descriptionEn: event.target.value } : item))} /></label>
                    </div>
                  </section>)}
                  {!profile.applicationProfile.awards.length && <p className="profile-empty-note">尚未添加奖项。</p>}
                </div>
              </article>

              <article className="profile-card">
                <div className="section-heading compact"><div><p className="eyebrow">PUBLICATIONS</p><h2>论文与发表成果</h2></div><button type="button" className="profile-add-button" onClick={() => updateFixedProfileSection("publications", [...profile.applicationProfile.publications, { title: "", authorOrderZh: "", authorOrderEn: "", date: "", venue: "", bestVerifiedRank: "", jcrQuartile: "", casQuartile: "", ccfCategory: "", status: "", url: "", descriptionZh: "", descriptionEn: "" }])}>＋ 添加论文</button></div>
                <p className="profile-help">通用“论文等级”使用当前已核验的最佳等级；JCR、中科院和 CCF 分开保存。没有可靠依据的等级留空，不猜。</p>
                <div className="profile-repeat-list">
                  {profile.applicationProfile.publications.map((publication, index) => <section className="profile-repeat-card" key={`publication-${index}`}>
                    <div className="profile-repeat-head"><h3>论文 {index + 1}</h3><button type="button" onClick={() => updateFixedProfileSection("publications", profile.applicationProfile.publications.filter((_, itemIndex) => itemIndex !== index))}>删除</button></div>
                    <div className="profile-grid">
                      <label className="full">论文题目<input value={publication.title} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item))} /></label>
                      <label>作者顺序（中文）<input value={publication.authorOrderZh} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, authorOrderZh: event.target.value } : item))} placeholder="例如 第一作者" /></label>
                      <label>Author order (English)<input value={publication.authorOrderEn} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, authorOrderEn: event.target.value } : item))} placeholder="e.g. First Author" /></label>
                      <label>发表时间<input value={publication.date} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))} placeholder="YYYY-MM" /></label>
                      <label>期刊 / 会议<input value={publication.venue} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, venue: event.target.value } : item))} /></label>
                      <label>最佳已核验等级<input value={publication.bestVerifiedRank} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, bestVerifiedRank: event.target.value } : item))} placeholder="例如 JCR Q1" /></label>
                      <label>JCR 分区<input value={publication.jcrQuartile} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, jcrQuartile: event.target.value } : item))} placeholder="例如 JCR Q1" /></label>
                      <label>中科院分区<input value={publication.casQuartile} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, casQuartile: event.target.value } : item))} placeholder="未核验则留空" /></label>
                      <label>CCF 等级<input value={publication.ccfCategory} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, ccfCategory: event.target.value } : item))} placeholder="未收录则留空" /></label>
                      <label>发表状态<input value={publication.status} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, status: event.target.value } : item))} placeholder="Published / Under review / Preprint" /></label>
                      <label>DOI / URL<input type="url" value={publication.url} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))} /></label>
                      <label className="full">论文说明（中文）<textarea value={publication.descriptionZh} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, descriptionZh: event.target.value } : item))} /></label>
                      <label className="full">Publication description (English)<textarea value={publication.descriptionEn} onChange={(event) => updateFixedProfileSection("publications", profile.applicationProfile.publications.map((item, itemIndex) => itemIndex === index ? { ...item, descriptionEn: event.target.value } : item))} /></label>
                    </div>
                  </section>)}
                  {!profile.applicationProfile.publications.length && <p className="profile-empty-note">尚未添加论文。</p>}
                </div>
              </article>

              <article className="profile-card">
                <div className="section-heading compact"><div><p className="eyebrow">OTHER FIXED DATA</p><h2>语言与其他固定问答</h2></div></div>
                <div className="profile-repeat-block">
                  <div className="profile-repeat-title"><h3>语言</h3><button type="button" className="profile-add-button" onClick={() => updateFixedProfileSection("languages", [...profile.applicationProfile.languages, { name: "", proficiency: "" }])}>＋ 添加语言</button></div>
                  {profile.applicationProfile.languages.map((language, index) => <div className="profile-inline-row" key={`language-${index}`}>
                    <input aria-label={`语言 ${index + 1}`} value={language.name} onChange={(event) => updateFixedProfileSection("languages", profile.applicationProfile.languages.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="语言，例如 English" />
                    <input aria-label={`熟练程度 ${index + 1}`} value={language.proficiency} onChange={(event) => updateFixedProfileSection("languages", profile.applicationProfile.languages.map((item, itemIndex) => itemIndex === index ? { ...item, proficiency: event.target.value } : item))} placeholder="熟练程度" />
                    <button type="button" onClick={() => updateFixedProfileSection("languages", profile.applicationProfile.languages.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
                  </div>)}
                </div>
                <div className="profile-repeat-block">
                  <div className="profile-repeat-title"><div><h3>其他固定问答</h3><p>适合保存“是否愿意出差”等稳定答案；岗位动机、开放题和薪资期望不要放这里。</p></div><button type="button" className="profile-add-button" onClick={() => updateFixedProfileSection("fixedAnswers", [...profile.applicationProfile.fixedAnswers, { question: "", answer: "" }])}>＋ 添加问答</button></div>
                  {profile.applicationProfile.fixedAnswers.map((answer, index) => <div className="profile-fixed-answer" key={`answer-${index}`}>
                    <input aria-label={`固定问题 ${index + 1}`} value={answer.question} onChange={(event) => updateFixedProfileSection("fixedAnswers", profile.applicationProfile.fixedAnswers.map((item, itemIndex) => itemIndex === index ? { ...item, question: event.target.value } : item))} placeholder="申请表问题" />
                    <textarea aria-label={`固定答案 ${index + 1}`} value={answer.answer} onChange={(event) => updateFixedProfileSection("fixedAnswers", profile.applicationProfile.fixedAnswers.map((item, itemIndex) => itemIndex === index ? { ...item, answer: event.target.value } : item))} placeholder="固定答案" />
                    <button type="button" onClick={() => updateFixedProfileSection("fixedAnswers", profile.applicationProfile.fixedAnswers.filter((_, itemIndex) => itemIndex !== index))}>删除</button>
                  </div>)}
                </div>
              </article>

              <div className="profile-save-row">
                <p>{profileMessage || "资料保存在受保护的账户数据库中；Autofill 不会填写敏感 EEO 字段，也不会自动提交。"}</p>
                <button disabled={profileSaving}>{profileSaving ? "保存中…" : "保存固定资料"}</button>
              </div>
            </form>
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

      {pendingCvSelection && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && !candidateMovingId && setPendingCvSelection(null)}>
          <section className="cv-template-dialog" role="dialog" aria-modal="true" aria-labelledby="pending-cv-selection-title">
            <div className="form-head">
              <div><p className="eyebrow">CV PREBUILD</p><h2 id="pending-cv-selection-title">选择生成语言和 CV 模板</h2></div>
              <button type="button" disabled={Boolean(candidateMovingId)} onClick={() => setPendingCvSelection(null)} aria-label="关闭">×</button>
            </div>
            <p className="cv-template-note">
              {pendingCvSelection.job.company} · {pendingCvSelection.job.title}。确认后才会进入待申请并调用 API 生成第一版 CV。
            </p>
            <div className="form-grid">
              <label>
                CV 语言
                <select
                  value={pendingCvSelection.language}
                  onChange={(event) => setPendingCvSelection((current) => current
                    ? { ...current, language: event.target.value as CvTemplateLanguage }
                    : current)}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                CV 模板
                <select
                  value={pendingCvSelection.track}
                  onChange={(event) => setPendingCvSelection((current) => current
                    ? { ...current, track: event.target.value as CvTemplateTrack }
                    : current)}
                >
                  {cvTemplateTrackOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="cv-template-language">
              将使用：{pendingCvSelection.language === "zh" ? "中文" : "English"} · {cvTemplateFiles[pendingCvSelection.language][pendingCvSelection.track]}
            </p>
            <div className="form-actions">
              <button type="button" disabled={Boolean(candidateMovingId)} onClick={() => setPendingCvSelection(null)}>取消</button>
              <button
                type="button"
                className="primary"
                disabled={Boolean(candidateMovingId)}
                onClick={() => void moveFavoriteToPending(
                  pendingCvSelection.job,
                  pendingCvSelection.language,
                  pendingCvSelection.track,
                )}
              >
                {candidateMovingId ? "正在进入并排队…" : "确认并进入待申请"}
              </button>
            </div>
          </section>
        </div>
      )}

      {cvRulesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.currentTarget === event.target && setCvRulesOpen(false)}>
          <section className="cv-template-dialog" role="dialog" aria-modal="true" aria-labelledby="cv-rules-title">
            <div className="form-head">
              <div><p className="eyebrow">CV AUTOMATION</p><h2 id="cv-rules-title">自动生成规则</h2></div>
              <button type="button" onClick={() => setCvRulesOpen(false)} aria-label="关闭">×</button>
            </div>
            <p className="cv-template-note">进入待申请时会先选择中文/英文和 Tech、Quant、Consulting、Healthcare 等模板。下面的规则会用于之后进入待申请的岗位。</p>
            <div className="cv-generation-rules">
              <div>
                <label htmlFor="automatic-cv-generation-rules">岗位画像、取舍和改写要求</label>
                <button type="button" onClick={() => setCvGenerationRules(DEFAULT_CV_GENERATION_RULES)}>恢复默认</button>
              </div>
              <textarea
                id="automatic-cv-generation-rules"
                value={cvGenerationRules}
                onChange={(event) => setCvGenerationRules(event.target.value)}
                maxLength={CV_GENERATION_RULES_MAX_LENGTH}
              />
              <small>保存规则本身不会调用 API。事实边界、禁止编造和禁止自动提交始终保留。</small>
            </div>
            <div className="form-actions">
              <button type="button" onClick={() => setCvRulesOpen(false)}>取消</button>
              <button type="button" className="primary" onClick={() => {
                const rules = cvGenerationRules.trim() || DEFAULT_CV_GENERATION_RULES;
                setCvGenerationRules(rules);
                window.localStorage.setItem(CV_GENERATION_RULES_STORAGE_KEY, rules);
                setCvRulesOpen(false);
                setCvAutomationNotice("自动生成规则已保存，将用于之后进入待申请的岗位。");
              }}>保存规则</button>
            </div>
          </section>
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
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget !== event.target) return;
          setIgnoreTarget(null);
          setHardRequirementOpen(false);
        }}>
          <section className="ignore-dialog" role="dialog" aria-modal="true" aria-labelledby="ignore-title">
            <div className="form-head">
              <div><p className="eyebrow">不再推荐</p><h2 id="ignore-title">{ignoreTarget.title}</h2></div>
              <button type="button" onClick={() => { setIgnoreTarget(null); setHardRequirementOpen(false); }} aria-label="关闭">×</button>
            </div>
            <p>{ignoreTarget.company} · 请选择原因。以后每日刷新时，同一公司和相同岗位将不会再次出现。</p>
            <div className="ignore-options">
              <button disabled={ignoreSaving} onClick={() => ignoreJob("岗位已关闭或链接失效")}>岗位已关闭或链接失效</button>
              <button disabled={ignoreSaving} onClick={() => ignoreJob("不感兴趣，不想申请")}>不感兴趣，不想申请</button>
              <button disabled={ignoreSaving} onClick={() => setHardRequirementOpen((current) => !current)}>{hardRequirementOpen ? "收起硬性要求原因" : "硬性要求不符合"}</button>
            </div>
            {hardRequirementOpen && (
              <div className="hard-requirement-options" aria-label="选择不符合的硬性要求">
                <p>只排除当前岗位，不参与负面关键词学习。岗位方向和 JD 关键词仍会保留。</p>
                {hardRequirementReasons.map((reason) => (
                  <button key={reason} disabled={ignoreSaving} onClick={() => void ignoreJob(reason, true)}>{reason}</button>
                ))}
              </div>
            )}
            <button className="dialog-cancel" onClick={() => { setIgnoreTarget(null); setHardRequirementOpen(false); }}>取消</button>
          </section>
        </div>
      )}

      <CandidateFactFitScores />
      <nav className="bottom-nav" aria-label="主要导航">
        <button className={view === "today" ? "selected" : ""} onClick={() => setView("today")}><span>⌂</span>今日</button>
        <button className={view === "saved" ? "selected" : ""} onClick={() => setView("saved")}><span>☆</span>候选</button>
        <button className={view === "automation" ? "selected" : ""} onClick={() => setView("automation")}><span>◎</span>自动</button>
        <button className={view === "applications" ? "selected" : ""} onClick={() => setView("applications")}><span>▤</span>申请</button>
        <button className={view === "profile" ? "selected" : ""} onClick={() => setView("profile")}><span>♙</span>资料</button>
        <button className={["tools", "companies", "verify", "ignored"].includes(view) ? "selected" : ""} onClick={() => setView("tools")}><span>•••</span>工具</button>
      </nav>
    </main>
  );
}
