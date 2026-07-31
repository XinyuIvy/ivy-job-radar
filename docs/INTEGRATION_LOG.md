# Source and feature integration log

Last audited: 2026-07-31

This log covers cloud-runnable sources and capabilities found in comparable open-source job-search projects. Protected Chinese platforms that require a local signed-in browser are tracked separately and are intentionally excluded from this list.

## Status definitions

- **Integrated**: runs from the single website refresh or the scheduled GitHub Actions workflow, writes an auditable summary, and feeds the shared merge/import pipeline.
- **Partial**: code or discovery exists, but full company coverage, verification, or stable production evidence is missing.
- **Planned**: not yet in the single-refresh production pipeline.
- **Blocked**: requires credentials, a paid service, incompatible licensing, or another user decision.

## Cloud sources

| Capability or source | Reference project | Status | Evidence / remaining work |
|---|---|---:|---|
| LinkedIn, Indeed, Google Jobs, Glassdoor, ZipRecruiter | JobSpy | Integrated | Configured in `scripts/jobspy_scan.py`; retain per-source failure isolation and verify each source in run summaries. |
| RemoteOK, Remotive, Jobicy, Himalayas, Arbeitnow, We Work Remotely | Ever Jobs | Integrated | Credential-free source runner writes `cloud_sources_jobs_latest.json` and per-source success/failure counts. |
| Job Board Aggregator daily ATS dataset | Feashliaa/job-board-aggregator | Integrated | `scripts/aggregator_scan.py` reads every published gzip chunk, filters the US/China target scope, preserves CC BY-NC attribution, and writes a source receipt. `scripts/verify_aggregator_jobs.py` then checks candidates on official ATS pages before the shared merge/import step. Local acceptance test on 2026-07-31 scanned 1,497,570 rows across 60/60 chunks and found 555 deduplicated candidates before the 250-candidate verification limit. First production Actions receipt remains to be observed. |
| career-ops portal scanner | santifer/career-ops | Partial | Existing Ivy code scans Greenhouse/Ashby/Lever and several other ATS tenants, but career-ops portal registry and Wellfound/custom-page coverage are not imported. |
| Company-pool full career-homepage registry | career-ops pattern | Planned | Add one canonical career URL, ATS type/tenant, last success, HTTP state, scanned count, and error for every unique company. |
| Common Crawl ATS tenant discovery | Job Board Aggregator | Planned | Useful for filling missing company ATS tenants; requires a bounded discovery/update job rather than every refresh. |
| Remote source retry, delay, and proxy support | Ever Jobs | Partial | Individual failures are isolated and basic delays exist; exponential backoff and optional proxy rotation are not implemented. |
| API-key sources: Adzuna, Jooble, USAJobs, Exa | Ever Jobs | Blocked | Add only after credentials and relevance are confirmed; secrets must stay in GitHub/Sites secret storage. |
| Upwork, Reed, CareerJet, Naukri, BDJobs, Bayt, Internshala | Ever Jobs / JobSpy | Planned | Outside the current US/China full-time PhD-targeted scope or requires credentials; do not count as coverage today. |

## ATS and company-site coverage

| Capability | Status | Remaining work |
|---|---:|---|
| Greenhouse, Lever, Ashby, BambooHR, iCIMS, Paylocity, Workday | Partial | Adapters exist, but the company registry covers only a subset of the 176 unique companies and Workday still has tenant-specific failures. |
| SmartRecruiters, Workable, Teamtailor, Recruitee | Planned | Add public API/page adapters and tests. |
| Jobvite, Taleo, Oracle Recruiting Cloud, SAP SuccessFactors | Planned | Add tenant discovery, pagination, full-JD extraction, and closed-post detection. |
| Dayforce, UKG/UltiPro, ADP Recruiting, JazzHR | Planned | Add adapters and throttling tests. |
| Rippling, Pinpoint, Personio, Comeet | Planned | Add adapters after confirming stable public endpoints. |
| Generic schema.org `JobPosting` company-page crawler | Partial | Candidate verification reads JSON-LD; it does not yet enumerate every company career site. |
| Full company-pool coverage report | Planned | Every refresh must report attempted/succeeded/failed/unidentified counts and list failures. |

## Pipeline and product gaps found in other open-source projects

| Feature | Reference project | Status |
|---|---|---:|
| Cross-source canonical deduplication with stale-job pruning | Job Board Aggregator / career-ops | Partial |
| Per-platform trend history and anomaly alerts | Job Board Aggregator | Planned |
| Progressive/chunked loading for very large job pools | Job Board Aggregator | Planned |
| Map/heatmap and geographic normalization | Job Board Aggregator | Planned |
| Posting legitimacy / ghost-job / repost detection | career-ops | Planned |
| Required vs preferred skill extraction | career-ops-style evaluation | Planned |
| Explicit uncertainty penalties for missing degree/experience evidence | Ivy scoring audit | Planned |
| Company research and hiring-manager/contact discovery | career-ops | Planned |
| Interview story bank, interview preparation, follow-up cadence, reply classification | career-ops | Planned |
| Funnel analytics and per-source application success rates | career-ops | Planned |
| Complete CSV, Excel, JSON, and SQLite export | Ivy requirement | Planned |
| Email, Telegram, or ChatGPT completion notifications | Ivy requirement | Planned |
| End-to-end run receipt with fetched, verified, rejected, deduplicated, imported, and failed counts | Ivy requirement | Partial |
| Automated tests with saved fixtures for every source adapter | Engineering requirement | Planned |

## Acceptance criteria for “all sources refreshed”

A run may display **completed** only when it has:

1. Recorded a start and terminal state.
2. Run every enabled cloud source independently.
3. Written a per-source success/failure count.
4. Verified candidate URLs where possible.
5. Applied one scoring policy and one canonical deduplication policy.
6. Imported the merged result into the website.
7. Reported new, updated, unchanged, rejected, and failed counts.
8. Preserved failure details instead of silently treating a failed source as zero results.
