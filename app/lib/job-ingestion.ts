import schema from "../../config/job-ingestion.schema.json";
import { extractDeadline } from "./data-quality";
import { canonicalizeJobIdentityUrl, extractStableJobId, sameLogicalJob } from "./job-identity";
import { excludedJobGeography } from "./job-geography";
import { hardJobExclusionReasons } from "./job-hard-exclusions";
import { scoreStoredJob } from "./job-scoring";
import { learnedRuleAdjustment } from "./screening-learning-store";

export type IncomingJob = Record<string, unknown>;
export type ApprovedRule = { kind: "include" | "exclude"; term: string };
export type NormalizedJob = {
  company: string; title: string; location: string; description: string;
  jobUrl: string; canonicalUrl: string; applicationId: string; region: string;
  track: string; score: number; visa: string; evidence: string; skills: string;
  source: string; status: string; deadline: string; deadlineType: string;
  lastSeenAt: string; missedScanCount: number; expirationReason: string;
  discoveredAt: string; checkedAt: string; originalJobUrl: string;
};
export type StoredIngestionJob = Omit<NormalizedJob, "originalJobUrl"> & { id: number };
export type JobIngestionStore = {
  find: (job: NormalizedJob) => Promise<StoredIngestionJob[]>;
  write: (job: NormalizedJob, existing?: StoredIngestionJob, candidates?: StoredIngestionJob[]) => Promise<void>;
  companyBlocked?: (company: string) => boolean | Promise<boolean>;
};
export type IngestionContext = {
  store: JobIngestionStore; ignored: Set<string>; rules: ApprovedRule[]; now: string;
  queue?: Promise<unknown>;
};

function object(value: unknown): IncomingJob {
  return value && typeof value === "object" && !Array.isArray(value) ? value as IncomingJob : {};
}
function read(row: IncomingJob, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => object(current)[key], row);
}
function text(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
function field(row: IncomingJob, name: keyof typeof schema.properties): unknown {
  const property = schema.properties[name] as { "x-aliases"?: string[] };
  return property["x-aliases"]?.map(path => read(row, path)).find(v => v != null && v !== "") ?? "";
}
function locationText(value: unknown): string {
  if (Array.isArray(value)) return value.map(locationText).filter(Boolean).join(", ");
  const row = object(value);
  if (Object.keys(row).length) return locationText(row.address || row.name || [row.addressLocality, row.addressRegion, row.addressCountry, row.city, row.country]);
  return text(value);
}
function plain(value: unknown): string {
  return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}
function iso(value: unknown, fallback: string): string {
  const date = Date.parse(text(value));
  return Number.isFinite(date) ? new Date(date).toISOString() : fallback;
}
export function ignoredJobFingerprint(company: string, title: string) {
  const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
  return `${key(company)}::${key(title)}`;
}

// All source adapters stop here before sharing normalization and persistence.
export function normalizeIncomingJob(input: unknown, now: string, rules: ApprovedRule[] = []): NormalizedJob | null {
  const envelope = object(input);
  const raw = "raw" in envelope ? object(envelope.raw) : envelope;
  const context = object(envelope.context);
  const companyValue = field(raw, "company");
  const company = text(companyValue) || text(object(companyValue).name) || text(context.company);
  const title = plain(field(raw, "title"));
  const location = locationText(field(raw, "location")) || locationText(context.location)
    || [raw.city, raw.state, raw.country].map(text).filter(Boolean).join(", ");
  const description = plain(read(raw, "_detail.jobPostingInfo.jobDescription") || field(raw, "description") || raw.body);
  let jobUrl = text(field(raw, "jobUrl"));
  if (!jobUrl && text(context.ats) === "bamboohr" && raw.id) jobUrl = `careers/${raw.id}`;
  if (text(context.ats) === "workday" && text(raw.externalPath)) {
    try {
      const base = new URL(text(context.baseUrl));
      const site = base.pathname.split("/").filter(Boolean).at(-1);
      jobUrl = `${base.origin}/en-US/${site}${text(raw.externalPath)}`;
    } catch { return null; }
  }
  if (!jobUrl && text(context.ats) === "gem" && (raw.id || raw.extId)) jobUrl = `https://jobs.gem.com/${text(context.tenant)}?job_id=${encodeURIComponent(text(raw.id || raw.extId))}`;
  if (!jobUrl && text(context.ats) === "oraclecloud" && (raw.Id || raw.RequisitionNumber)) {
    const [host, site] = text(context.tenant).split("/");
    jobUrl = `https://${host}.oraclecloud.com/hcmUI/CandidateExperience/en/sites/${site}/job/${text(raw.Id || raw.RequisitionNumber)}`;
  }
  try {
    jobUrl = new URL(jobUrl, text(context.baseUrl) || undefined).toString();
    if (!/^https?:\/\//i.test(jobUrl)) return null;
  } catch { return null; }
  let region = text(raw.region) || text(context.region);
  if (!region) region = /china|beijing|shanghai|shenzhen|guangzhou|suzhou|hangzhou|中国|北京|上海|深圳|广州|苏州|杭州/i.test(location) ? "中国" : "美国";
  if (!company || !title || !schema.properties.region.enum.includes(region)) return null;
  const canonicalUrl = canonicalizeJobIdentityUrl(jobUrl);
  const applicationId = text(field(raw, "applicationId")) || extractStableJobId(jobUrl).split(":").at(-1) || "";
  const scoring = scoreStoredJob({ title, content: description, region });
  const adjustment = region === "美国" ? learnedRuleAdjustment(`${title} ${description}`, rules) : null;
  const details = [...scoring.details];
  if (adjustment?.includeMatches.length) details.push(`人工监督规则加分：${adjustment.includeMatches.map(r => r.term).join("、")}`);
  if (adjustment?.blocked) details.push(`人工监督规则命中排除项：${adjustment.excludeMatches.map(r => r.term).join("、")}`);
  const deadline = extractDeadline(`${description} ${text(raw.evidence)}`);
  const skills = new Set<string>(Array.isArray(raw.skills) ? raw.skills.map(text).filter(Boolean) : text(raw.skills).split("|").map(text).filter(Boolean));
  for (const [name, pattern] of [["Python", /\bpython\b/i], ["R", /(?:^|\W)R(?:\W|$)/], ["SQL", /\bsql\b/i], ["SAS", /\bsas\b/i], ["Statistics", /statistic/i], ["Machine learning", /machine learning/i]] as const) {
    if (pattern.test(description)) skills.add(name);
  }
  const content = `${title} ${description}`;
  const track = /quantitative|量化/.test(content.toLowerCase()) ? "Quant"
    : /biostat|clinical trial|epidemiol|生物统计|临床统计/i.test(content) ? "Pharma"
    : /health|medical|imaging|医疗|影像/i.test(content) ? "Healthcare AI" : "Technology";
  const status = raw.isListed === false ? "已关闭" : text(raw.status) || text(context.status) || "待官网核验";
  return {
    company, title, location, description: description.slice(0, schema.properties.description.maxLength),
    jobUrl, canonicalUrl, applicationId, region, track,
    score: adjustment?.blocked ? 0 : Math.min(100, scoring.score + (adjustment?.boost ?? 0)),
    visa: scoring.visa, evidence: [text(raw.evidence), ...details].filter(Boolean).join("；"),
    skills: JSON.stringify([...skills].slice(0, 12)),
    source: text(context.source) || text(raw.source) || text(envelope.provider) || "外部采集器",
    status: status === "已捕获完整JD" ? "开放" : status === "待核验" ? "待官网核验" : status,
    deadline: deadline.deadline, deadlineType: deadline.deadlineType,
    lastSeenAt: iso(raw.checked_at || raw.checkedAt || context.collectedAt, now),
    missedScanCount: 0, expirationReason: "",
    discoveredAt: iso(raw.discovered_at || raw.discoveredAt || context.collectedAt, now),
    checkedAt: iso(raw.checked_at || raw.checkedAt || context.collectedAt, now),
    originalJobUrl: text(raw.original_job_url),
  };
}

export function ingestionRejection(job: NormalizedJob, rules: ApprovedRule[] = []): string | null {
  if (["已关闭", "已过期", "closed", "expired"].includes(job.status)) return "source_closed";
  if (excludedJobGeography(job)) return "excluded_geography";
  const content = `${job.title} ${job.description}`;
  if (!/data scien|applied scien|research scien|decision scien|statisti|biostat|quantitative|epidemiol|health economics|outcomes research|algorithm|imaging scien|数据科学|应用科学|研究科学|统计|量化|算法|流行病|卫生经济|影像|医疗咨询|生命科学咨询/i.test(content)) return "irrelevant_role";
  if (/\b(?:intern|postdoc|postdoctoral|senior|principal|staff|manager|director|lead|head of|vice president)\b|\bsr\.?(?:\s|$)|实习|高级|资深|首席|总监|经理|主管/i.test(job.title)) return "excluded_title";
  if (hardJobExclusionReasons({ title: job.title, description: job.description, region: job.region, visa: job.visa }).length) return "hard_exclusion";
  if (job.region === "美国" && learnedRuleAdjustment(content, rules).blocked) return "approved_exclusion";
  return null;
}

export function mergeStoredIngestionJob(job: NormalizedJob, existing: StoredIngestionJob) {
  return { ...job,
    company: job.company === "待核验公司" ? existing.company : job.company,
    location: job.location || existing.location,
    description: job.description || existing.description,
    skills: job.skills === "[]" ? existing.skills : job.skills,
    applicationId: job.applicationId || existing.applicationId,
    deadline: job.deadline || existing.deadline,
    deadlineType: job.deadlineType === "unknown" ? existing.deadlineType : job.deadlineType,
    status: job.status === "待官网核验" && existing.status === "开放" ? existing.status : job.status,
    discoveredAt: existing.discoveredAt,
  };
}

// Prefer complete evidence; never let a thin duplicate erase a full JD.
export function mergeIncomingJobs(left: NormalizedJob, right: NormalizedJob): NormalizedJob {
  const primary = right.description.length > left.description.length ? right : left;
  const secondary = primary === left ? right : left;
  return { ...secondary, ...primary,
    location: primary.location || secondary.location,
    description: primary.description || secondary.description,
    applicationId: primary.applicationId || secondary.applicationId,
    status: [left.status, right.status].includes("开放") ? "开放" : primary.status,
    source: [...new Set([left.source, right.source])].join(" · ").slice(0, 500),
    skills: JSON.stringify([...new Set([...JSON.parse(left.skills), ...JSON.parse(right.skills)])].slice(0, 12)),
    discoveredAt: left.discoveredAt < right.discoveredAt ? left.discoveredAt : right.discoveredAt,
  };
}

export function ingestJobs(inputs: unknown[], context: IngestionContext) {
  // Serialize sources sharing one scan context; cross-request races still require DB constraints.
  const run = (context.queue ?? Promise.resolve()).catch(() => {}).then(() => ingestJobsUnlocked(inputs, context));
  context.queue = run;
  return run;
}

async function ingestJobsUnlocked(inputs: unknown[], context: IngestionContext) {
  const result = { received: inputs.length, created: 0, updated: 0, skipped: 0, duplicates: 0, invalid: 0, reasons: {} as Record<string, number> };
  const grouped: NormalizedJob[] = [];
  const reject = (reason: string) => { result.skipped++; result.reasons[reason] = (result.reasons[reason] || 0) + 1; };
  for (const input of inputs) {
    const job = normalizeIncomingJob(input, context.now, context.rules);
    if (!job) { result.invalid++; reject("invalid_record"); continue; }
    if (context.ignored.has(ignoredJobFingerprint(job.company, job.title))) { reject("ignored"); continue; }
    if (await context.store.companyBlocked?.(job.company)) { reject("reviewed_company"); continue; }
    const reason = ingestionRejection(job, context.rules);
    if (reason) { reject(reason); continue; }
    const index = grouped.findIndex(row => sameLogicalJob(row, job));
    if (index < 0) grouped.push(job);
    else { grouped[index] = mergeIncomingJobs(grouped[index], job); result.duplicates++; result.skipped++; }
  }
  for (const job of grouped) {
    const candidates = await context.store.find(job);
    const existing = candidates.find(row => sameLogicalJob(row, job));
    await context.store.write(job, existing, candidates);
    if (existing) result.updated++; else result.created++;
  }
  return result;
}
