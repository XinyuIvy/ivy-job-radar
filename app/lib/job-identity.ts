export type JobIdentityInput = {
  company?: string;
  title?: string;
  location?: string;
  jobUrl?: string;
  canonicalUrl?: string;
  applicationId?: string;
};

const TRACKING_QUERY_KEYS = new Set([
  "source",
  "src",
  "ref",
  "referrer",
  "gh_src",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "trk",
  "trackingid",
  "from",
  "fromsearch",
]);

const ID_QUERY_KEYS = new Set([
  "gh_jid",
  "jobid",
  "job_id",
  "jid",
  "currentjobid",
  "postingid",
  "posting_id",
  "positionid",
  "position_id",
  "requisitionid",
  "requisition_id",
  "reqid",
  "req_id",
  "vacancyid",
  "vacancy_id",
  "openingid",
  "opening_id",
]);

const PLACEHOLDER_TITLES = new Set([
  "",
  "job",
  "jobs",
  "career",
  "careers",
  "job details",
  "job detail",
  "open positions",
  "current openings",
  "待补充职位名称",
  "职位详情",
  "招聘职位",
]);

export function normalizeJobIdentityText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export function normalizeJobLocation(value: unknown) {
  return normalizeJobIdentityText(value)
    .replace(/unitedstatesofamerica|unitedstates|usa/g, "")
    .replace(/remote/g, "");
}

export function isPlaceholderJobTitle(value: unknown) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  return PLACEHOLDER_TITLES.has(normalized)
    || /^(jobs?|careers?|open positions?|current openings?)(\s*[|·-].*)?$/.test(normalized);
}

function safeUrl(raw: unknown) {
  try {
    const url = new URL(String(raw ?? "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normalizeIdentifier(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "");
}

function looksLikeStableIdentifier(value: string) {
  if (!value || value.length < 3 || value.length > 160) return false;
  if (/^(jobs?|careers?|search|apply|details?|view|openings?)$/i.test(value)) return false;
  return /\d/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(value);
}

export function extractStableJobId(rawUrl: unknown, suppliedApplicationId: unknown = "") {
  const explicit = normalizeIdentifier(suppliedApplicationId);
  if (looksLikeStableIdentifier(explicit)) return `explicit:${explicit}`;

  const url = safeUrl(rawUrl);
  if (!url) return "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  for (const [rawKey, rawValue] of url.searchParams.entries()) {
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const value = normalizeIdentifier(rawValue);
    if (ID_QUERY_KEYS.has(key) && looksLikeStableIdentifier(value)) {
      return `${host}:query:${key}:${value}`;
    }
  }

  const decodedPath = decodeURIComponent(url.pathname);
  const pathPatterns = [
    /\/(?:jobs?|positions?|postings?|openings?|vacancies?)\/(?:[^/?#]+\/)*([a-z]*\d[a-z0-9_-]{2,}|[0-9a-f]{8}-[0-9a-f-]{20,})\/?$/i,
    /\/view\/([a-z]*\d[a-z0-9_-]{2,})\/?$/i,
    /\/([0-9a-f]{8}-[0-9a-f-]{20,})\/?$/i,
    /\/(R-?\d{3,}|REQ-?[a-z0-9_-]{3,}|JR-?\d{3,})\/?$/i,
  ];
  for (const pattern of pathPatterns) {
    const value = normalizeIdentifier(decodedPath.match(pattern)?.[1]);
    if (looksLikeStableIdentifier(value)) return `${host}:path:${value}`;
  }

  const hash = url.hash.replace(/^#/, "");
  if (/(?:job|position|posting|opening|vacancy|requisition|req|jid|id)[=/:_-]/i.test(hash)) {
    const value = normalizeIdentifier(hash.split(/[=/:]/).pop());
    if (looksLikeStableIdentifier(value)) return `${host}:hash:${value}`;
  }
  return "";
}

export function canonicalizeJobIdentityUrl(raw: unknown) {
  const url = safeUrl(raw);
  if (!url) return String(raw ?? "").trim();

  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";

  // Some SPA career sites encode the actual posting only in the hash.
  if (!/(?:job|position|posting|opening|vacancy|requisition|req|jid|id)[=/:_-]/i.test(url.hash)) {
    url.hash = "";
  }
  return url.toString();
}

function sameLocation(left: unknown, right: unknown) {
  const a = normalizeJobLocation(left);
  const b = normalizeJobLocation(right);
  if (!a || !b) return true;
  return a === b || a.includes(b) || b.includes(a);
}

export function sameLogicalJob(left: JobIdentityInput, right: JobIdentityInput) {
  const leftCompany = normalizeJobIdentityText(left.company);
  const rightCompany = normalizeJobIdentityText(right.company);
  if (leftCompany && rightCompany && leftCompany !== rightCompany) return false;

  const leftId = extractStableJobId(left.jobUrl, left.applicationId);
  const rightId = extractStableJobId(right.jobUrl, right.applicationId);
  if (leftId && rightId) return leftId === rightId;

  const leftCanonical = canonicalizeJobIdentityUrl(left.canonicalUrl || left.jobUrl);
  const rightCanonical = canonicalizeJobIdentityUrl(right.canonicalUrl || right.jobUrl);
  const leftTitle = normalizeJobIdentityText(left.title);
  const rightTitle = normalizeJobIdentityText(right.title);
  const usableTitles = Boolean(
    leftTitle
    && rightTitle
    && !isPlaceholderJobTitle(left.title)
    && !isPlaceholderJobTitle(right.title),
  );

  if (leftId || rightId) {
    return Boolean(usableTitles && leftCanonical && leftCanonical === rightCanonical && leftTitle === rightTitle);
  }
  if (usableTitles && leftCanonical && leftCanonical === rightCanonical && leftTitle === rightTitle) return true;
  return Boolean(usableTitles && leftCompany && leftCompany === rightCompany && leftTitle === rightTitle && sameLocation(left.location, right.location));
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function makeDistinctStoredJobUrl(rawUrl: string, identity: JobIdentityInput) {
  const url = safeUrl(rawUrl);
  if (!url) return rawUrl.trim();
  const suffix = shortHash([
    identity.company,
    identity.title,
    identity.location,
    identity.applicationId,
    extractStableJobId(rawUrl, identity.applicationId),
  ].join("::"));
  url.hash = `ivy-job-${suffix}`;
  return url.toString();
}

export function jobDisplayIdentityKey(job: JobIdentityInput) {
  const company = normalizeJobIdentityText(job.company);
  const stableId = extractStableJobId(job.jobUrl, job.applicationId);
  if (stableId) return `${company}::id::${stableId}`;

  const title = normalizeJobIdentityText(job.title);
  if (company && title && !isPlaceholderJobTitle(job.title)) {
    return `${company}::role::${title}::${normalizeJobLocation(job.location)}`;
  }
  return `url::${canonicalizeJobIdentityUrl(job.canonicalUrl || job.jobUrl)}`;
}
