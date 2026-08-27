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
  "campus talent",
  "campus recruiting",
  "campus recruitment",
  "join us",
  "待补充职位名称",
  "职位详情",
  "招聘职位",
  "校园招聘",
  "社会招聘",
  "人才招聘",
  "招聘官网",
  "招聘平台",
  "加入我们",
]);

export function normalizeJobIdentityText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export function normalizeJobLocation(value: unknown) {
  return normalizeJobIdentityText(value)
    .replace(/unitedstatesofamerica|unitedstates|usa/g, "")
    .replace(/remote/g, "");
}

export function isPlaceholderJobTitle(value: unknown) {
  const normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (PLACEHOLDER_TITLES.has(normalized)) return true;
  if (/^(jobs?|careers?|open positions?|current openings?)(\s*[|·-].*)?$/.test(normalized)) return true;
  if (/^(?:[\p{L}\p{N}·&（）()\s]{1,40})?(?:校园招聘|校招|社会招聘|人才招聘|招聘官网|招聘平台|招聘中心|加入我们)$/u.test(normalized)) return true;
  return /^(?:[\p{L}\p{N}·&()\s]{1,40}\s*[|·-]\s*)?(?:campus talent|campus recruiting|campus recruitment|careers?|join us)$/u.test(normalized);
}

function safeUrl(raw: unknown) {
  try {
    const url = new URL(String(raw ?? "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function jobUrlOrigin(raw: unknown) {
  const url = safeUrl(raw);
  if (!url) return "";
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (url.searchParams.has("gh_jid") || /(?:^|\.)greenhouse\.io$/.test(host)) return "greenhouse.io";
  return host;
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
  const host = jobUrlOrigin(rawUrl);

  for (const [rawKey, rawValue] of url.searchParams.entries()) {
    const key = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const value = normalizeIdentifier(rawValue);
    if (ID_QUERY_KEYS.has(key) && looksLikeStableIdentifier(value)) {
      return `${host}:query:${key}:${value}`;
    }
  }

  const decodedPath = decodeURIComponent(url.pathname);
  const pathPatterns = [
    /\/(?:positions?|postings?)\/([a-z]*\d[a-z0-9_-]{2,}|[0-9a-f]{8}-[0-9a-f-]{20,})\/(?:detail|details?)\/?$/i,
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
  const leftId = extractStableJobId(left.jobUrl, left.applicationId);
  const rightId = extractStableJobId(right.jobUrl, right.applicationId);
  const leftCanonical = canonicalizeJobIdentityUrl(left.canonicalUrl || left.jobUrl);
  const rightCanonical = canonicalizeJobIdentityUrl(right.canonicalUrl || right.jobUrl);
  const leftTitle = normalizeJobIdentityText(left.title);
  const rightTitle = normalizeJobIdentityText(right.title);
  const sameCanonical = Boolean(leftCanonical && rightCanonical && leftCanonical === rightCanonical);
  const usableTitles = Boolean(
    leftTitle
    && rightTitle
    && !isPlaceholderJobTitle(left.title)
    && !isPlaceholderJobTitle(right.title),
  );

  // Strong posting identity outranks unreliable scraped display fields.
  if (leftId && rightId) {
    if (leftId === rightId) {
      const leftOrigin = jobUrlOrigin(left.canonicalUrl || left.jobUrl);
      const rightOrigin = jobUrlOrigin(right.canonicalUrl || right.jobUrl);
      return !(leftOrigin && rightOrigin && leftOrigin !== rightOrigin);
    }
    if (sameCanonical) return true;
    return false;
  }

  if (usableTitles && sameCanonical && leftTitle === rightTitle) return true;

  const leftCompany = normalizeJobIdentityText(left.company);
  const rightCompany = normalizeJobIdentityText(right.company);
  if (leftCompany && rightCompany && leftCompany !== rightCompany) return false;
  if (leftId || rightId) return false;
  return Boolean(usableTitles && leftCompany && leftCompany === rightCompany && leftTitle === rightTitle && sameLocation(left.location, right.location));
}

export function sameCompanyRole(left: JobIdentityInput, right: JobIdentityInput) {
  const leftCompany = normalizeJobIdentityText(left.company);
  const rightCompany = normalizeJobIdentityText(right.company);
  const leftTitle = normalizeJobIdentityText(left.title);
  const rightTitle = normalizeJobIdentityText(right.title);
  return Boolean(
    leftCompany
    && leftCompany === rightCompany
    && leftTitle
    && leftTitle === rightTitle
    && !isPlaceholderJobTitle(left.title)
    && !isPlaceholderJobTitle(right.title),
  );
}

function shortHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function deriveAmbiguousCaptureId(input: {
  company?: string;
  title?: string;
  location?: string;
  canonicalUrl?: string;
  description?: string;
}) {
  const normalizedDescription = String(input.description ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
  const signature = [
    normalizeJobIdentityText(input.company),
    normalizeJobIdentityText(input.title),
    normalizeJobLocation(input.location),
    canonicalizeJobIdentityUrl(input.canonicalUrl),
    normalizedDescription,
  ].join("::");
  return `capture-1-${shortHash(signature)}`;
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
