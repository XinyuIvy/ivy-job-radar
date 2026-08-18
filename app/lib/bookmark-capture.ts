import { canonicalizeJobIdentityUrl, normalizeJobIdentityText } from "./job-identity";

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
  ["meituan.com", "美团"],
  ["jd.com", "京东"],
  ["baidu.com", "百度"],
  ["huawei.com", "华为"],
];

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
  if (!title || title.length > 40 || /^(job|jobs|career|careers|join|campus|招聘)$/i.test(title)) return "";
  return title;
}

function genericCompanyLabel(value: string) {
  return /^(join|jobs?|careers?|career site|campus talent|campus recruiting|campus recruitment|recruiting|招聘|校园招聘|招聘官网|招聘平台)$/i.test(value.trim());
}

function hostnameMatches(hostname: string, host: string) {
  return hostname === host || hostname.endsWith(`.${host}`);
}

export function inferBookmarkCompany(rawCompany: unknown, jobUrl: string, portalTitle: unknown = "") {
  const company = cleanBookmarkText(rawCompany, 300);
  const hostname = safeBookmarkJobUrl(jobUrl)?.hostname.toLowerCase().replace(/^www\./, "") ?? "";
  const knownCompany = KNOWN_COMPANY_HOSTS.find(([host]) => hostnameMatches(hostname, host))?.[1] ?? "";
  if (company && !genericCompanyLabel(company)) return company;
  if (knownCompany) return knownCompany;

  const titleCompany = portalTitleCompany(portalTitle);
  if (titleCompany) return titleCompany;

  const firstLabel = hostname.split(".")[0] || "待补充公司";
  return firstLabel
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "待补充公司";
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
