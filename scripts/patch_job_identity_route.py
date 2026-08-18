#!/usr/bin/env python3
from pathlib import Path


path = Path("app/api/jobs/route.ts")
source = path.read_text(encoding="utf-8")

source = source.replace(
    'import { desc, eq, or } from "drizzle-orm";',
    'import { and, desc, eq, or } from "drizzle-orm";',
    1,
)

expiration_import = 'import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../lib/job-expiration";\n'
identity_import = '''import {
  canonicalizeJobIdentityUrl,
  makeDistinctStoredJobUrl,
  sameLogicalJob,
} from "../../lib/job-identity";
'''
if identity_import not in source:
    if expiration_import not in source:
        raise SystemExit("Could not find job-expiration import anchor.")
    source = source.replace(expiration_import, expiration_import + identity_import, 1)

old_canonicalizer = '''function canonicalizeJobUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\\./, "");
    const removable = [
      "gh_jid", "gh_src", "source", "src", "ref", "referrer",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    ];
    removable.forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
}
'''
new_canonicalizer = '''function canonicalizeJobUrl(raw: string) {
  return canonicalizeJobIdentityUrl(raw);
}
'''
if old_canonicalizer not in source:
    raise SystemExit("Could not find canonicalizeJobUrl implementation.")
source = source.replace(old_canonicalizer, new_canonicalizer, 1)

old_save_lookup = '''  const db = await getDb();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const [existing] = await db
    .select({ id: jobs.id, discoveredAt: jobs.discoveredAt })
    .from(jobs)
    .where(
      or(
        eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      ),
    )
    .limit(1);
  const values = {
'''
new_save_lookup = '''  const db = await getDb();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const incomingIdentity = { company, title, location, jobUrl, canonicalUrl, applicationId };
  const candidates = await db
    .select()
    .from(jobs)
    .where(
      or(
        eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
        and(eq(jobs.company, company), eq(jobs.title, title)),
      ),
    );
  const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
  const exactUrlCollision = candidates.some((row) => row.jobUrl === jobUrl && !sameLogicalJob(row, incomingIdentity));
  const storedJobUrl = existing?.jobUrl
    || (exactUrlCollision ? makeDistinctStoredJobUrl(jobUrl, incomingIdentity) : jobUrl);
  const values = {
'''
if old_save_lookup not in source:
    raise SystemExit("Could not find saveCandidate lookup block.")
source = source.replace(old_save_lookup, new_save_lookup, 1)

old_save_url = '''    skills: JSON.stringify(extractSkills(content)),
    jobUrl,
    canonicalUrl,
'''
new_save_url = '''    skills: JSON.stringify(extractSkills(content)),
    jobUrl: storedJobUrl,
    canonicalUrl,
'''
if old_save_url not in source:
    raise SystemExit("Could not find saveCandidate URL values.")
source = source.replace(old_save_url, new_save_url, 1)

old_get = '''  const seen = new Set<string>();
  return NextResponse.json(
    rows
      .filter((row) => {
        const tracked = savedIds.has(row.id)
          || appliedFingerprints.has(fingerprint(row.company, row.title))
          || appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl))
          || Boolean(row.applicationId && appliedIds.has(normalize(row.applicationId)));
        return activeJobStatuses.has(row.status) || tracked;
      })
      .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
      .filter((row) => !activeJobStatuses.has(row.status) || !appliedFingerprints.has(fingerprint(row.company, row.title)))
      .filter((row) => !activeJobStatuses.has(row.status) || !appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl)))
      .filter((row) => !activeJobStatuses.has(row.status) || !row.applicationId || !appliedIds.has(normalize(row.applicationId)))
      .filter((row) => !activeJobStatuses.has(row.status) || !(row.region === "美国" && row.visa === "明确不支持"))
      .filter((row) => !activeJobStatuses.has(row.status) || !isExcludedTitle(row.title))
      .filter((row) => !activeJobStatuses.has(row.status) || row.score >= 55)
      .filter((row) => {
        const canonicalUrl = row.canonicalUrl || canonicalizeJobUrl(row.jobUrl);
        const key = row.status === "待官网核验"
          ? `pending::${fingerprint(row.company, row.title)}`
          : row.applicationId
          ? `${normalize(row.company)}::id::${normalize(row.applicationId)}`
          : canonicalUrl
            ? `url::${canonicalUrl}`
            : `${fingerprint(row.company, row.title)}::${normalize(row.location)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) => ({
        ...row,
        skills: JSON.parse(row.skills || "[]"),
      })),
  );
'''
new_get = '''  const filteredRows = rows
    .filter((row) => {
      const tracked = savedIds.has(row.id)
        || appliedFingerprints.has(fingerprint(row.company, row.title))
        || appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl))
        || Boolean(row.applicationId && appliedIds.has(normalize(row.applicationId)));
      return activeJobStatuses.has(row.status) || tracked;
    })
    .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
    .filter((row) => !activeJobStatuses.has(row.status) || !appliedFingerprints.has(fingerprint(row.company, row.title)))
    .filter((row) => !activeJobStatuses.has(row.status) || !appliedUrls.has(row.canonicalUrl || canonicalizeJobUrl(row.jobUrl)))
    .filter((row) => !activeJobStatuses.has(row.status) || !row.applicationId || !appliedIds.has(normalize(row.applicationId)))
    .filter((row) => !activeJobStatuses.has(row.status) || !(row.region === "美国" && row.visa === "明确不支持"))
    .filter((row) => !activeJobStatuses.has(row.status) || !isExcludedTitle(row.title))
    .filter((row) => !activeJobStatuses.has(row.status) || row.score >= 55);

  const uniqueRows = filteredRows.reduce<typeof filteredRows>((result, row) => {
    const duplicateIndex = result.findIndex((candidate) => sameLogicalJob(candidate, row));
    if (duplicateIndex < 0) {
      result.push(row);
      return result;
    }

    const current = result[duplicateIndex];
    const rank = (candidate: typeof row) =>
      Number(savedIds.has(candidate.id)) * 100
      + Number(candidate.source.includes("手动")) * 30
      + Number(Boolean(candidate.description)) * 10
      + Math.min(10, candidate.skills.length)
      + Math.min(10, candidate.score / 10);
    if (rank(row) > rank(current)) result[duplicateIndex] = row;
    return result;
  }, []);

  return NextResponse.json(
    uniqueRows.map((row) => ({
      ...row,
      skills: JSON.parse(row.skills || "[]"),
    })),
  );
'''
if old_get not in source:
    raise SystemExit("Could not find GET deduplication block.")
source = source.replace(old_get, new_get, 1)

old_manual_lookup = '''  const jobUrl = String(body.jobUrl).trim();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const applicationId = extractApplicationId(jobUrl, body.applicationId);
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      or(
        eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      ),
    )
    .limit(1);
  const values = {
    company: String(body.company).trim(),
    title: String(body.title).trim(),
    location: String(body.location ?? "").trim(),
'''
new_manual_lookup = '''  const jobUrl = String(body.jobUrl).trim();
  const canonicalUrl = canonicalizeJobUrl(jobUrl);
  const applicationId = extractApplicationId(jobUrl, body.applicationId);
  const company = String(body.company).trim();
  const title = String(body.title).trim();
  const location = String(body.location ?? "").trim();
  const incomingIdentity = { company, title, location, jobUrl, canonicalUrl, applicationId };
  const candidates = await db
    .select()
    .from(jobs)
    .where(or(
      eq(jobs.jobUrl, jobUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
      and(eq(jobs.company, company), eq(jobs.title, title)),
    ));
  const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
  const exactUrlCollision = candidates.some((row) => row.jobUrl === jobUrl && !sameLogicalJob(row, incomingIdentity));
  const storedJobUrl = existing?.jobUrl
    || (exactUrlCollision ? makeDistinctStoredJobUrl(jobUrl, incomingIdentity) : jobUrl);
  const values = {
    company,
    title,
    location,
'''
if old_manual_lookup not in source:
    raise SystemExit("Could not find manual POST lookup block.")
source = source.replace(old_manual_lookup, new_manual_lookup, 1)

old_manual_url = '''    skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
    jobUrl,
    canonicalUrl,
'''
new_manual_url = '''    skills: JSON.stringify(Array.isArray(body.skills) ? body.skills : []),
    jobUrl: storedJobUrl,
    canonicalUrl,
'''
if old_manual_url not in source:
    raise SystemExit("Could not find manual POST URL values.")
source = source.replace(old_manual_url, new_manual_url, 1)

path.write_text(source, encoding="utf-8")
print("Patched app/api/jobs/route.ts")
