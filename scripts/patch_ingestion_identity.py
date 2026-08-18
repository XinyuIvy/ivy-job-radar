#!/usr/bin/env python3
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Could not find {label}.")
    return source.replace(old, new, 1)


bookmark_path = Path("app/api/bookmark-capture/route.ts")
bookmark = bookmark_path.read_text(encoding="utf-8")
old_bookmark_conditions = '''  const db = await getDb();
  const identityConditions = [
    eq(jobs.jobUrl, rawJobUrl),
    eq(jobs.canonicalUrl, canonicalUrl),
  ];
  if (applicationId) identityConditions.push(eq(jobs.applicationId, applicationId));
  if (!isPlaceholderJobTitle(title)) {
    identityConditions.push(and(eq(jobs.company, company), eq(jobs.title, title)));
  }
  const candidates = await db.select().from(jobs).where(or(...identityConditions));
'''
new_bookmark_conditions = '''  const db = await getDb();
  const candidateCondition = applicationId
    ? or(
      eq(jobs.jobUrl, rawJobUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      eq(jobs.applicationId, applicationId),
      and(eq(jobs.company, company), eq(jobs.title, title)),
    )
    : isPlaceholderJobTitle(title)
      ? or(eq(jobs.jobUrl, rawJobUrl), eq(jobs.canonicalUrl, canonicalUrl))
      : or(
        eq(jobs.jobUrl, rawJobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        and(eq(jobs.company, company), eq(jobs.title, title)),
      );
  const candidates = await db.select().from(jobs).where(candidateCondition);
'''
bookmark = replace_once(bookmark, old_bookmark_conditions, new_bookmark_conditions, "bookmark candidate condition")
bookmark_path.write_text(bookmark, encoding="utf-8")


import_path = Path("app/api/jobs/import/route.ts")
source = import_path.read_text(encoding="utf-8")
source = replace_once(
    source,
    'import { eq, or } from "drizzle-orm";',
    'import { and, eq, or } from "drizzle-orm";',
    "jobs import drizzle import",
)
anchor = 'import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../../lib/job-expiration";\n'
helper_import = '''import {
  canonicalizeJobIdentityUrl,
  makeDistinctStoredJobUrl,
  sameLogicalJob,
} from "../../../lib/job-identity";
'''
if helper_import not in source:
    source = replace_once(source, anchor, anchor + helper_import, "jobs import helper anchor")

old_canonicalizer = '''function canonicalizeJobUrl(raw: string) {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\\./, "");
    [
      "gh_jid", "gh_src", "source", "src", "ref", "referrer",
      "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
    ].forEach((key) => url.searchParams.delete(key));
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\\/+$/, "") || "/";
    return url.toString();
  } catch {
    return raw.trim();
  }
}
'''
source = replace_once(
    source,
    old_canonicalizer,
    '''function canonicalizeJobUrl(raw: string) {
  return canonicalizeJobIdentityUrl(raw);
}
''',
    "jobs import canonicalizer",
)

old_lookup = '''    const canonicalUrl = cleanText(raw.canonical_url) || canonicalizeJobUrl(jobUrl);
    const applicationId = cleanText(raw.application_id);
    const [existing] = await db
      .select()
      .from(jobs)
      .where(
        or(
          eq(jobs.jobUrl, jobUrl),
          originalJobUrl ? eq(jobs.jobUrl, originalJobUrl) : eq(jobs.jobUrl, jobUrl),
          eq(jobs.canonicalUrl, canonicalUrl),
          applicationId ? eq(jobs.applicationId, applicationId) : eq(jobs.jobUrl, jobUrl),
        ),
      )
      .limit(1);

    const skills = Array.isArray(raw.skills)
'''
new_lookup = '''    const canonicalUrl = canonicalizeJobUrl(cleanText(raw.canonical_url) || jobUrl);
    const applicationId = cleanText(raw.application_id);
    const location = cleanText(raw.location);
    const incomingIdentity = { company, title, location, jobUrl, canonicalUrl, applicationId };
    const candidateCondition = applicationId
      ? or(
        eq(jobs.jobUrl, jobUrl),
        originalJobUrl ? eq(jobs.jobUrl, originalJobUrl) : eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        eq(jobs.applicationId, applicationId),
        and(eq(jobs.company, company), eq(jobs.title, title)),
      )
      : or(
        eq(jobs.jobUrl, jobUrl),
        originalJobUrl ? eq(jobs.jobUrl, originalJobUrl) : eq(jobs.jobUrl, jobUrl),
        eq(jobs.canonicalUrl, canonicalUrl),
        and(eq(jobs.company, company), eq(jobs.title, title)),
      );
    const candidates = await db.select().from(jobs).where(candidateCondition);
    const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
    const exactUrlCollision = candidates.some((row) => row.jobUrl === jobUrl && !sameLogicalJob(row, incomingIdentity));
    const storedJobUrl = existing?.jobUrl
      || (exactUrlCollision ? makeDistinctStoredJobUrl(jobUrl, incomingIdentity) : jobUrl);

    const skills = Array.isArray(raw.skills)
'''
source = replace_once(source, old_lookup, new_lookup, "jobs import duplicate lookup")
source = replace_once(
    source,
    '      location: cleanText(raw.location),\n',
    '      location,\n',
    "jobs import location value",
)
source = replace_once(
    source,
    '      jobUrl,\n      canonicalUrl,\n',
    '      jobUrl: storedJobUrl,\n      canonicalUrl,\n',
    "jobs import stored URL value",
)
import_path.write_text(source, encoding="utf-8")


manual_path = Path("app/api/manual-review/route.ts")
manual = manual_path.read_text(encoding="utf-8")
manual_anchor = '''} from "../../lib/bookmark-capture";
'''
manual_helper = '''import {
  makeDistinctStoredJobUrl,
  sameLogicalJob,
} from "../../lib/job-identity";
'''
if manual_helper not in manual:
    manual = replace_once(manual, manual_anchor, manual_anchor + manual_helper, "manual review helper anchor")
old_manual_lookup = '''  const [existing] = await db.select().from(jobs).where(
    or(
      eq(jobs.jobUrl, rawJobUrl),
      eq(jobs.jobUrl, canonicalUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      and(eq(jobs.company, inferredCompany), eq(jobs.title, title)),
    ),
  ).limit(1);

  let jobId: number;
'''
new_manual_lookup = '''  const incomingIdentity = {
    company: inferredCompany,
    title,
    location: "",
    jobUrl: rawJobUrl,
    canonicalUrl,
    applicationId: "",
  };
  const candidates = await db.select().from(jobs).where(
    or(
      eq(jobs.jobUrl, rawJobUrl),
      eq(jobs.jobUrl, canonicalUrl),
      eq(jobs.canonicalUrl, canonicalUrl),
      and(eq(jobs.company, inferredCompany), eq(jobs.title, title)),
    ),
  );
  const existing = candidates.find((row) => sameLogicalJob(row, incomingIdentity));
  const exactUrlCollision = candidates.some((row) => row.jobUrl === rawJobUrl && !sameLogicalJob(row, incomingIdentity));
  const storedJobUrl = existing?.jobUrl
    || (exactUrlCollision ? makeDistinctStoredJobUrl(rawJobUrl, incomingIdentity) : rawJobUrl);

  let jobId: number;
'''
manual = replace_once(manual, old_manual_lookup, new_manual_lookup, "manual review duplicate lookup")
manual = replace_once(
    manual,
    '      jobUrl: canonicalUrl,\n      canonicalUrl,\n      source: "核验队列人工通过",\n',
    '      jobUrl: existing.jobUrl,\n      canonicalUrl,\n      source: "核验队列人工通过",\n',
    "manual review update URL",
)
manual = replace_once(
    manual,
    '      jobUrl: canonicalUrl,\n      canonicalUrl,\n      applicationId: "",\n',
    '      jobUrl: storedJobUrl,\n      canonicalUrl,\n      applicationId: "",\n',
    "manual review insert URL",
)
manual_path.write_text(manual, encoding="utf-8")

print("Patched bookmark, import, and manual-review ingestion paths")
