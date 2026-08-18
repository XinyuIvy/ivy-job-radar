from pathlib import Path


ROUTE = Path("app/api/jobs/route.ts")

OLD = '''  const activeApplicationStatuses = new Set(["已申请", "一面", "二面/技术面", "终面", "Offer", "拒绝"]);
  const activeApplications = (await db.select().from(applications))
    .filter((row) => activeApplicationStatuses.has(row.status));
  const appliedFingerprints = new Set(activeApplications.map((row) => fingerprint(row.company, row.title)));
  const appliedUrls = new Set(activeApplications.map((row) => canonicalizeJobUrl(row.jobUrl)).filter(Boolean));
  const appliedIds = new Set(activeApplications.map((row) => normalize(row.applicationId)).filter(Boolean));
  const rows = await db.select().from(jobs).orderBy(desc(jobs.discoveredAt));

  const filteredRows = rows
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
'''

NEW = '''  const hiddenApplicationStatuses = new Set([
    "准备材料",
    "已申请",
    "一面",
    "二面/技术面",
    "终面",
    "Offer",
    "拒绝",
  ]);
  const hiddenApplications = (await db.select().from(applications))
    .filter((row) => hiddenApplicationStatuses.has(row.status));
  const rows = await db.select().from(jobs).orderBy(desc(jobs.discoveredAt));
  const isTrackedApplication = (row: (typeof rows)[number]) =>
    hiddenApplications.some((application) => sameLogicalJob(row, application));

  const filteredRows = rows
    .filter((row) =>
      activeJobStatuses.has(row.status)
      || savedIds.has(row.id)
      || isTrackedApplication(row),
    )
    .filter((row) => !ignored.has(fingerprint(row.company, row.title)))
    .filter((row) => !activeJobStatuses.has(row.status) || !isTrackedApplication(row))
    .filter((row) => !activeJobStatuses.has(row.status) || !(row.region === "美国" && row.visa === "明确不支持"))
    .filter((row) => !activeJobStatuses.has(row.status) || !isExcludedTitle(row.title))
    .filter((row) => !activeJobStatuses.has(row.status) || row.score >= 55);
'''

source = ROUTE.read_text(encoding="utf-8")
if source.count(OLD) != 1:
    raise SystemExit("Expected one legacy application-filter block in app/api/jobs/route.ts")
ROUTE.write_text(source.replace(OLD, NEW), encoding="utf-8")
