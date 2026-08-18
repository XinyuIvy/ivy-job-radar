#!/usr/bin/env python3
from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Could not find {label}.")
    return source.replace(old, new, 1)


jobs_path = Path("app/api/jobs/route.ts")
jobs_source = jobs_path.read_text(encoding="utf-8")
anchor = 'import { activeJobStatuses, deadlineHasPassed, verifyPosting } from "../../lib/job-expiration";\n'
import_line = 'import { sameDisplayedJob } from "../../lib/job-display-identity";\n'
if import_line not in jobs_source:
    jobs_source = replace_once(jobs_source, anchor, anchor + import_line, "jobs display helper import")
jobs_source = replace_once(
    jobs_source,
    '    const duplicateIndex = result.findIndex((candidate) => sameLogicalJob(candidate, row));\n',
    '    const duplicateIndex = result.findIndex((candidate) => sameDisplayedJob(candidate, row));\n',
    "display duplicate comparison",
)
jobs_path.write_text(jobs_source, encoding="utf-8")


bookmarklet_path = Path("app/bookmarklet/bookmarklet-installer.tsx")
bookmarklet = bookmarklet_path.read_text(encoding="utf-8")
old_title = '''const title=clean(posting&&posting.title,500)||queryText(['h1','[data-testid*="job-title"]','.job-name','[class*="job-title"]','[class*="jobTitle"]'])||clean(document.title,500);'''
new_title = '''const title=clean(posting&&posting.title,500)||queryText(['[data-testid*="job-title"]','[data-automation-id="jobPostingHeader"]','[data-ui="job-title"]','.posting-headline h2','.app-title','.job-name','[class*="job-title"]','[class*="jobTitle"]','h1'])||clean((document.querySelector('meta[property="og:title"]')||{}).content,500)||clean(document.title,500);'''
bookmarklet = replace_once(bookmarklet, old_title, new_title, "bookmarklet title selector order")
old_application_id = '''const applicationId=clean(typeof identifier==="string"?identifier:identifier&&(identifier.value||identifier.name),500)||clean(params.get("gh_jid")||params.get("jobId")||params.get("job_id")||params.get("reqId")||params.get("requisitionId"),500);'''
new_application_id = '''const applicationId=clean(typeof identifier==="string"?identifier:identifier&&(identifier.value||identifier.name),500)||clean(params.get("gh_jid")||params.get("jobId")||params.get("job_id")||params.get("currentJobId")||params.get("postingId")||params.get("positionId")||params.get("reqId")||params.get("requisitionId")||params.get("vacancyId"),500);'''
bookmarklet = replace_once(bookmarklet, old_application_id, new_application_id, "bookmarklet application id parameters")
bookmarklet_path.write_text(bookmarklet, encoding="utf-8")

print("Patched display deduplication and bookmarklet title extraction")
