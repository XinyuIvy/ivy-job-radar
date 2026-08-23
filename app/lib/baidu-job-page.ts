import { cleanBookmarkText, safeBookmarkJobUrl } from "./bookmark-capture";

export type BaiduTalentJobPage = {
  title: string;
  company: "百度";
  location: string;
  description: string;
  applicationId: string;
};

export function isBaiduTalentJobUrl(rawUrl: unknown) {
  const hostname = safeBookmarkJobUrl(rawUrl)?.hostname.toLowerCase() ?? "";
  return hostname === "talent.baidu.com";
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hexadecimal, name) => {
    if (decimal) return String.fromCodePoint(Number(decimal));
    if (hexadecimal) return String.fromCodePoint(Number.parseInt(hexadecimal, 16));
    return named[String(name).toLowerCase()] ?? entity;
  });
}

function htmlText(value: string, maximum = 50_000) {
  return cleanBookmarkText(
    decodeHtmlEntities(value)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|li|p|section)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
    maximum,
  );
}

function textsByClass(html: string, classFragment: string, maximum = 50_000) {
  const escaped = classFragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `<([a-z][\\w:-]*)[^>]*class=["'][^"']*${escaped}[^"']*["'][^>]*>([\\s\\S]*?)<\\/\\1>`,
    "gi",
  );
  return [...html.matchAll(pattern)]
    .map((match) => htmlText(match[2], maximum))
    .filter(Boolean);
}

export function extractBaiduApplicationId(value: unknown) {
  return cleanBookmarkText(value, 500).match(/[（(](J\d+)[）)]/i)?.[1]?.toUpperCase() ?? "";
}

export function parseBaiduTalentJobHtml(html: unknown): BaiduTalentJobPage | null {
  const source = String(html ?? "");
  const title = textsByClass(source, "detail-title", 500)[0] ?? "";
  const subtitles = textsByClass(source, "post-subtitle-item", 500);
  const headings = textsByClass(source, "post-content-title", 500);
  const sections = textsByClass(source, "post-content-desc", 40_000);
  const description = sections
    .map((section, index) => `${headings[index] || "岗位信息"}\n${section}`)
    .join("\n\n")
    .trim();
  if (!title || description.length < 80) return null;
  return {
    title,
    company: "百度",
    location: subtitles[0] ?? "",
    description,
    applicationId: extractBaiduApplicationId(title),
  };
}
