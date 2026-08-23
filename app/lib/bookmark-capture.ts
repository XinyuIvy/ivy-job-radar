import {
  canonicalizeJobIdentityUrl,
  isPlaceholderJobTitle,
  normalizeJobIdentityText,
} from "./job-identity";

export const BOOKMARK_CAPTURE_SOURCE = "Chrome 书签手动加入";
export const BOOKMARK_CAPTURE_STATUS = "开放";

const CHINA_JOB_HOSTS = [
  "zhipin.com",
  "liepin.com",
  "zhaopin.com",
  "51job.com",
  "lagou.com",
  "nowcoder.com",
  "iguopin.com",
  "yingjiesheng.com",
];

const KNOWN_COMPANY_HOSTS: ReadonlyArray<readonly [string, string]> = [
  ["qq.com", "腾讯"],
  ["tencent.com", "腾讯"],
  ["alibaba.com", "阿里巴巴"],
  ["alibabagroup.com", "阿里巴巴"],
  ["antgroup.com", "蚂蚁集团"],
  ["bytedance.com", "字节跳动"],
  ["kuaishou.cn", "快手"],
  ["xiaomi.jobs.f.mioffice.cn", "小米"],
  ["mihoyo.com", "米哈游"],
  ["pddglobalhr.com", "拼多多"],
  ["dji.com", "大疆"],
  ["meituan.com", "美团"],
  ["jd.com", "京东"],
  ["baidu.com", "百度"],
  ["huawei.com", "华为"],
];

const RECRUITING_PLATFORM_LABEL = /^(?:campus|boss\s*直聘|直聘|猎聘|智联招聘|前程无忧|51job|拉勾|牛客|linkedin|indeed|glassdoor|workday|greenhouse|lever|moka|北森|飞书招聘|招聘网站|招聘平台)$/i;
const PAGE_TITLE_SEPARATOR = /\s*(?:\||｜|·|•|—|–|»|›)\s*|\s+-\s+/u;

export type BookmarkFieldCandidate = {
  source?: unknown;
  value?: unknown;
};

export type BookmarkCaptureFieldsInput = {
  title?: unknown;
  company?: unknown;
  titleCandidates?: unknown;
  companyCandidates?: unknown;
  sourcePageTitle?: unknown;
  jobUrl?: unknown;
  confirmedFields?: unknown;
};

const TRACK_RULES: Array<[string, RegExp]> = [
  ["Pharma", /biostat|生物统计|临床统计|clinical trial|流行病|epidemiolog|真实世界|health economics|卫生经济/i],
  ["Quant", /quantitative|quant research|量化研究|量化分析|systematic trading/i],
  ["Consulting", /consultant|consulting|咨询|life sciences consulting|healthcare consulting/i],
  ["Healthcare AI", /medical imaging|医学影像|healthcare ai|医疗人工智能|clinical ai/i],
];

const SKILL_RULES: Array<[string, RegExp]> = [
  ["Python", /\bpython\b/i],
  ["R", /(?:^|\W)R(?:\W|$)/],
  ["SQL", /\bsql\b/i],
  ["SAS", /\bsas\b/i],
  ["Biostatistics", /biostat|生物统计/i],
  ["Clinical trials", /clinical trial|临床试验/i],
  ["Machine learning", /machine learning|机器学习/i],
  ["Causal inference", /causal inference|因果推断/i],
  ["Survival analysis", /survival analysis|生存分析/i],
  ["Longitudinal data", /longitudinal|纵向数据/i],
];

export function cleanBookmarkText(value: unknown, maximum = 50_000) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, maximum);
}

export function safeBookmarkJobUrl(raw: unknown) {
  try {
    const url = new URL(cleanBookmarkText(raw, 4_000));
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

export function canonicalizeBookmarkJobUrl(raw: string) {
  return canonicalizeJobIdentityUrl(raw);
}

export function bookmarkFingerprint(company: string, title: string) {
  return `${normalizeJobIdentityText(company)}::${normalizeJobIdentityText(title)}`;
}

function portalTitleCompany(value: unknown) {
  const title = cleanBookmarkText(value, 300)
    .replace(/(?:校园招聘|校招|社会招聘|人才招聘|招聘官网|招聘平台|招聘中心|加入我们)$/u, "")
    .replace(/(?:campus talent|campus recruiting|campus recruitment|careers?|join us)$/i, "")
    .replace(/[|·\-–—]+$/g, "")
    .trim();
  if (!title || title.length > 80 || genericCompanyLabel(title)) return "";
  return title;
}

function genericCompanyLabel(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[®™]/g, "")
    .replace(/(?:官方)?(?:校园招聘|校招|社会招聘|人才招聘|招聘官网|招聘平台|招聘中心|招聘)$/u, "")
    .replace(/(?:career site|campus talent|campus recruiting|campus recruitment|recruiting|careers?|jobs?|join us)$/i, "")
    .trim();
  return !normalized || RECRUITING_PLATFORM_LABEL.test(normalized);
}

function hostnameMatches(hostname: string, host: string) {
  return hostname === host || hostname.endsWith(`.${host}`);
}

function knownBookmarkCompany(jobUrl: string) {
  const hostname = safeBookmarkJobUrl(jobUrl)?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
  return KNOWN_COMPANY_HOSTS.find(([host]) => hostnameMatches(hostname, host))?.[1] ?? "";
}

export function inferBookmarkCompany(rawCompany: unknown, jobUrl: string, portalTitle: unknown = "") {
  const company = portalTitleCompany(rawCompany);
  const hostname = safeBookmarkJobUrl(jobUrl)?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
  const knownCompany = knownBookmarkCompany(jobUrl);
  if (company && !genericCompanyLabel(company)) return company;
  if (knownCompany) return knownCompany;

  const titleCompany = cleanBookmarkText(portalTitle, 300)
    .split(PAGE_TITLE_SEPARATOR)
    .map(portalTitleCompany)
    .filter((value) => value && !genericCompanyLabel(value))
    .at(-1) ?? "";
  if (titleCompany) return titleCompany;

  const firstLabel = hostname.split(".")[0] || "";
  if (!firstLabel || /^(?:www|m|jobs?|careers?|career|recruit|recruiting|campus|apply|ats|hr|zhipin|liepin|zhaopin|51job|lagou|nowcoder)$/i.test(firstLabel)) {
    return "待补充公司";
  }
  return firstLabel
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "待补充公司";
}

function readFieldCandidates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Array<{ source: string; value: string }> => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as BookmarkFieldCandidate;
    const cleaned = cleanBookmarkText(candidate.value, 500);
    if (!cleaned) return [];
    return [{ source: cleanBookmarkText(candidate.source, 80).toLowerCase(), value: cleaned }];
  });
}

function cleanJobTitleCandidate(value: unknown) {
  return cleanBookmarkText(value, 500)
    .replace(/^(?:job title|position|职位名称|职位)\s*[:：]\s*/i, "")
    .replace(/\s+(?:job details?|职位详情)$/i, "")
    .trim();
}

function titleSourceScore(source: string) {
  if (source === "confirmed") return 1_000;
  if (source === "jsonld") return 120;
  if (/^(?:job-title|workday-title|linkedin-title|boss-title|ats-title)$/.test(source)) return 105;
  if (source === "role-heading") return 112;
  if (source === "h1") return 70;
  if (source === "og-title" || source === "twitter-title") return 45;
  if (source === "page-title-fragment") return 32;
  if (source === "page-title") return 18;
  return 55;
}

function companySourceScore(source: string) {
  if (source === "confirmed") return 1_000;
  if (source === "jsonld") return 120;
  if (/^(?:company-name|linkedin-company|boss-company|ats-company)$/.test(source)) return 105;
  if (source === "page-title-fragment") return 36;
  if (source === "site-name") return 20;
  return 55;
}

function scoreJobTitle(value: string, source: string) {
  const title = cleanJobTitleCandidate(value);
  if (!title || title.length > 180 || isPlaceholderJobTitle(title)) return Number.NEGATIVE_INFINITY;
  if (RECRUITING_PLATFORM_LABEL.test(title)) return Number.NEGATIVE_INFINITY;
  if (/(?:校园招聘|校园招|校招).*(?:薪酬福利|工作环境|招聘培训)/i.test(title)) return Number.NEGATIVE_INFINITY;
  if (/(?:职位描述|岗位职责|任职要求|立即申请|查看全部职位|job description|responsibilities|qualifications|apply now)/i.test(title)) return -100;
  let score = titleSourceScore(source);
  if (title.length >= 3 && title.length <= 100) score += 10;
  if (/(?:scientist|researcher|analyst|engineer|manager|director|consultant|developer|statistician|associate|intern|科学家|研究员|分析师|工程师|经理|总监|顾问|开发|统计师|实习)/i.test(title)) score += 8;
  return score;
}

function scoreCompany(value: string, source: string) {
  const company = portalTitleCompany(value);
  if (!company || genericCompanyLabel(company) || company.length > 100) return Number.NEGATIVE_INFINITY;
  let score = companySourceScore(source);
  if (company.length >= 2 && company.length <= 50) score += 8;
  if (/(?:有限公司|有限责任公司|集团|公司|inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|llc)$/i.test(company)) score += 5;
  return score;
}

function bestCandidate(
  candidates: Array<{ source: string; value: string }>,
  score: (value: string, source: string) => number,
  clean: (value: unknown) => string,
) {
  let best = "";
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateScore = score(candidate.value, candidate.source);
    if (candidateScore > bestScore) {
      best = clean(candidate.value);
      bestScore = candidateScore;
    }
  }
  return best;
}

export function resolveBookmarkCaptureFields(input: BookmarkCaptureFieldsInput) {
  const jobUrl = cleanBookmarkText(input.jobUrl, 4_000);
  const sourcePageTitle = cleanBookmarkText(input.sourcePageTitle, 500);
  const confirmed = input.confirmedFields === true || input.confirmedFields === "true";
  const pageFragments = sourcePageTitle
    .split(PAGE_TITLE_SEPARATOR)
    .map((value) => cleanBookmarkText(value, 300))
    .filter(Boolean);

  const titleCandidates = [
    ...(confirmed ? [{ source: "confirmed", value: cleanBookmarkText(input.title, 500) }] : []),
    ...readFieldCandidates(input.titleCandidates),
    ...(!confirmed ? [{ source: "legacy", value: cleanBookmarkText(input.title, 500) }] : []),
    ...pageFragments.map((value) => ({ source: "page-title-fragment", value })),
    { source: "page-title", value: sourcePageTitle },
  ].filter((candidate) => candidate.value);
  const title = bestCandidate(titleCandidates, scoreJobTitle, cleanJobTitleCandidate) || "待补充职位名称";

  const companyCandidates = [
    ...(confirmed ? [{ source: "confirmed", value: cleanBookmarkText(input.company, 300) }] : []),
    ...readFieldCandidates(input.companyCandidates),
    ...(!confirmed ? [{ source: "legacy", value: cleanBookmarkText(input.company, 300) }] : []),
    ...pageFragments
      .filter((value) => normalizeJobIdentityText(value) !== normalizeJobIdentityText(title))
      .map((value) => ({ source: "page-title-fragment", value })),
  ].filter((candidate) => candidate.value);
  const selectedCompany = bestCandidate(companyCandidates, scoreCompany, portalTitleCompany);
  const companyPageTitle = pageFragments
    .filter((value) => normalizeJobIdentityText(value) !== normalizeJobIdentityText(title))
    .join(" | ");
  const company = inferBookmarkCompany(
    !confirmed && normalizeJobIdentityText(selectedCompany) === normalizeJobIdentityText(title) ? "" : selectedCompany,
    jobUrl,
    companyPageTitle,
  );

  return { title, company };
}

export function repairBookmarkCompany(company: string, title: string, jobUrl: string) {
  const knownCompany = knownBookmarkCompany(jobUrl);
  if (!knownCompany) return company;
  if (
    normalizeJobIdentityText(company) === normalizeJobIdentityText(title)
    || genericCompanyLabel(company)
  ) {
    return knownCompany;
  }
  return company;
}

export function inferBookmarkRegion(jobUrl: string, location: string, addressCountry: string) {
  const country = `${addressCountry} ${location}`.toLowerCase();
  if (/中国|china|\bcn\b|中华人民共和国/.test(country)) return "中国";
  if (/美国|united states|\busa?\b/.test(country)) return "美国";
  const hostname = safeBookmarkJobUrl(jobUrl)?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
  if (
    hostname.endsWith(".cn")
    || CHINA_JOB_HOSTS.some((host) => hostnameMatches(hostname, host))
    || KNOWN_COMPANY_HOSTS.some(([host]) => hostnameMatches(hostname, host))
  ) {
    return "中国";
  }
  return "美国";
}

export function inferBookmarkTrack(title: string, description: string) {
  const content = `${title} ${description}`;
  return TRACK_RULES.find(([, pattern]) => pattern.test(content))?.[0] ?? "Technology";
}

export function inferBookmarkSkills(title: string, description: string) {
  const content = `${title} ${description}`;
  return SKILL_RULES.filter(([, pattern]) => pattern.test(content)).map(([label]) => label).slice(0, 12);
}

export async function deriveBookmarkCaptureKey(secret: string) {
  if (!secret) return "";
  const input = new TextEncoder().encode(`ivy-job-radar-bookmark-v1:${secret}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function secureBookmarkKeyEqual(left: string, right: string) {
  if (!left || left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
