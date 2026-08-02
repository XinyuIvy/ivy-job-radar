import sourceCatalogJson from "../company-source-additions.json";

export type CompanyCollectionMode = "structured" | "public-page" | "manual";

type AtsConfig = {
  kind?: string;
  token?: string;
  board?: string;
  slug?: string;
  instance?: string;
  boardUrl?: string;
  host?: string;
  tenant?: string;
  site?: string;
};

export type CompanySource = {
  company: string;
  aliases?: string[];
  website?: string;
  careersUrl?: string;
  sourceType?: string;
  collectionMode?: CompanyCollectionMode | string;
  ats?: AtsConfig;
};

const sourceCatalog = sourceCatalogJson as CompanySource[];

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeCompany(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(inc|llc|ltd|limited|company|co|corporation|corp|pharmaceuticals|holdings)\b/g, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

function labels(source: CompanySource) {
  return [source.company, ...(source.aliases ?? [])].map(clean).filter(Boolean);
}

export function findCompanySource(company: string) {
  const target = normalizeCompany(company);
  if (!target) return undefined;
  return sourceCatalog.find((source) => labels(source).some((label) => {
    const normalized = normalizeCompany(label);
    return normalized === target || normalized.includes(target) || target.includes(normalized);
  }));
}

export function companyCollectionMode(source?: CompanySource | null): CompanyCollectionMode {
  if (source?.collectionMode === "structured") return "structured";
  if (source?.collectionMode === "public-page") return "public-page";
  return "manual";
}

export function companySourceSearchUrl(company: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(`${company} official careers jobs`)}`;
}

function atsKind(source: CompanySource) {
  return clean(source.ats?.kind).toLowerCase();
}

function atsToken(source: CompanySource) {
  return clean(source.ats?.token || source.ats?.board || source.ats?.slug);
}

function uniqueTuples<T extends readonly unknown[]>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const structuredSources = sourceCatalog.filter((source) => companyCollectionMode(source) === "structured");

export const greenhouseBoards: ReadonlyArray<readonly [string, string]> = uniqueTuples(
  structuredSources
    .filter((source) => atsKind(source) === "greenhouse" && atsToken(source))
    .map((source) => [source.company, atsToken(source)] as const),
);

export const leverBoards: ReadonlyArray<readonly [string, string, string]> = uniqueTuples(
  structuredSources
    .filter((source) => atsKind(source) === "lever" && atsToken(source))
    .map((source) => [source.company, atsToken(source), clean(source.ats?.instance) || "global"] as const),
);

export const ashbyBoards: ReadonlyArray<readonly [string, string]> = uniqueTuples(
  structuredSources
    .filter((source) => atsKind(source) === "ashby" && atsToken(source))
    .map((source) => [source.company, atsToken(source)] as const),
);

export const iCimsBoards: ReadonlyArray<readonly [string, string]> = uniqueTuples(
  structuredSources
    .filter((source) => ["icims", "i-cims"].includes(atsKind(source)))
    .map((source) => [source.company, clean(source.ats?.boardUrl) || clean(source.careersUrl)] as const)
    .filter(([, url]) => Boolean(url)),
);

export const paylocityBoards: ReadonlyArray<readonly [string, string]> = uniqueTuples(
  structuredSources
    .filter((source) => atsKind(source) === "paylocity")
    .map((source) => [source.company, clean(source.ats?.boardUrl) || clean(source.careersUrl)] as const)
    .filter(([, url]) => Boolean(url)),
);

function workdayTuple(source: CompanySource): readonly [string, string, string, string] | null {
  if (atsKind(source) !== "workday") return null;
  const host = clean(source.ats?.host) || (() => {
    try {
      return new URL(clean(source.careersUrl)).origin;
    } catch {
      return "";
    }
  })();
  const tenant = clean(source.ats?.tenant);
  const site = clean(source.ats?.site);
  if (!host || !tenant || !site) return null;
  return [source.company, host, tenant, site] as const;
}

export const workdayBoards: ReadonlyArray<readonly [string, string, string, string]> = uniqueTuples(
  structuredSources.map(workdayTuple).filter((row): row is readonly [string, string, string, string] => Boolean(row)),
);
