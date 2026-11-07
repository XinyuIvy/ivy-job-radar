export type CompanyLink = { label: string; url: string };
export type WatchedPosition = {
  title: string; priority: string; sector: string; location: string;
  officialUrl: string; evidenceStatus: string; evidenceType: string; evidenceUrl: string;
  deadline: string; notes: string; checkedAt: string; sourceCompany: string;
};
export type WatchedCompany = {
  id: string;
  company: string;
  links: CompanyLink[];
  lastCheckedAt: string | null;
  positions: WatchedPosition[];
  scanStatus: string;
  scanNote: string;
};

export function companyKey(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCompanyInput(input: unknown): { company: string; links: CompanyLink[] } {
  if (!input || typeof input !== "object") throw new Error("请填写公司名称和链接。");
  const value = input as Record<string, unknown>;
  const company = typeof value.company === "string" ? value.company.trim() : "";
  if (!company || company.length > 200) throw new Error("公司名称不能为空，且不能超过 200 字。");
  if (!Array.isArray(value.links) || value.links.length > 10) throw new Error("每家公司最多保存 10 个链接。");
  const links: CompanyLink[] = [];
  for (const item of value.links) {
    if (!item || typeof item !== "object" || typeof item.url !== "string" || typeof item.label !== "string") throw new Error("链接格式不正确。");
    if (!item.url.trim()) continue;
    let url: URL;
    try { url = new URL(item.url.trim()); } catch { throw new Error("请输入完整的 http 或 https 链接。"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.href.length > 4000) throw new Error("只支持不含登录凭据的 http 或 https 链接。");
    const label = item.label.trim() || "招聘官网";
    if (label.length > 80) throw new Error("链接名称不能超过 80 字。");
    if (!links.some((link) => link.url === url.href)) links.push({ label, url: url.href });
  }
  return { company, links };
}
