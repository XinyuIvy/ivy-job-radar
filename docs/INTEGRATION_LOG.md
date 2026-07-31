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
| Job Board Aggregator daily ATS dataset | Feashliaa/job-board-aggregator | Integrated | `scripts/aggregator_scan.py` reads every published gzip chunk, filters the US/China target scope, preserves CC BY-NC attribution, and writes a source receipt. The same pass now derives official ATS samples for every matching company-pool company, avoiding a second 1.5-million-row scan. `scripts/verify_aggregator_jobs.py` checks targeted candidates on official pages. Local acceptance on 2026-07-31 scanned 1,497,570 rows across 60/60 chunks and found official ATS samples for 39 current company-pool companies. |
| career-ops portal scanner pattern | santifer/career-ops | Integrated | `scripts/company_portal_scan.py` dynamically scans every unique company-pool company, auto-detects public ATS providers, falls back to schema.org/company pages, and records per-company receipts. The first production run on 2026-07-31 attempted 176/176 companies: 66 succeeded, 102 were unidentified, and 8 failed. Protected/login-only Wellfound access remains outside cloud scope. |
| Company-pool full career-homepage registry | career-ops pattern | Integrated | Every refresh writes `company_portal_registry.json` with canonical portal, ATS/tenant, terminal state, HTTP state, attempts, scanned/matched counts, timestamp, and error. Coverage means a real attempt, not guaranteed success. |
| Automatic onboarding for newly added company-pool companies | career-ops / ATS discovery pattern | Integrated | The unique-company count is recalculated from `app/company-pool.json` every run. A new row uses its configured source URL, Aggregator-derived official ATS evidence, prior verified portal evidence, public web discovery, Wikidata P856 official-homepage discovery, then a bounded archive fallback. Unresolved companies enter the auditable failure queue automatically. |
| Common Crawl ATS/career discovery | Job Board Aggregator | Integrated | A bounded 20-company-per-run Common Crawl fallback runs only when a live company page exposes no usable career/ATS link, preventing unbounded archive queries during every refresh. |
| Remote source retry and delay | Ever Jobs | Integrated | Job-board, Aggregator, official-page, and company-portal fetches use isolated failure handling plus exponential backoff. Standard `HTTP_PROXY`/`HTTPS_PROXY` environment support is inherited from the Python runtime; no proxy vendor is required. |
| API-key sources: Adzuna, Jooble, USAJobs, Exa | Ever Jobs | Blocked | Add only after credentials and relevance are confirmed; secrets must stay in GitHub/Sites secret storage. |
| Upwork, Reed, CareerJet, Naukri, BDJobs, Bayt, Internshala | Ever Jobs / JobSpy | Planned | Outside the current US/China full-time PhD-targeted scope or requires credentials; do not count as coverage today. |

## ATS and company-site coverage

| Capability | Status | Remaining work |
|---|---:|---|
| Greenhouse, Lever, Ashby, BambooHR, Workday | Integrated | Stable public JSON adapters are dynamically detected. Workday uses targeted public POST pagination at the platform's 20-row limit and creates unique public job URLs. |
| SmartRecruiters, Workable, Teamtailor, Recruitee | Integrated | Public JSON, Markdown, RSS/XML, and offers-feed adapters are enabled in the company-pool scanner. |
| Breezy, Rippling, Pinpoint, Personio, JibeApply | Integrated | Zero-auth public board feeds are detected and normalized; saved fixtures cover detection, schema parsing, region filtering, and canonical deduplication. |
| Oracle Recruiting Cloud | Integrated | Zero-auth Candidate Experience requisition API detection, pagination, location/description extraction, and stable public job URLs are enabled. Tenant WAF failures remain visible in receipts. |
| iCIMS, Paylocity, Jobvite | Integrated | Provider-specific tenant detection and public board enumeration feed the shared normalization pipeline. Paylocity reads public embedded page state and calls its official feed only when a feed GUID is explicitly present. |
| JazzHR, Gem | Integrated | JazzHR public listings and Gem's public GraphQL board are normalized without login. |
| Comeet | Partial | The documented Careers API is enabled only when the public company UID and token are present; otherwise the scanner uses the public career page and embedded/schema.org extraction. Current company-pool production evidence is still missing. |
| Taleo, SAP SuccessFactors | Partial | Public portal detection, embedded JSON, JSON-LD, and bounded job-link enumeration run automatically. Their official structured APIs are tenant-configured or authenticated, so the system does not claim universal direct-feed coverage. |
| Dayforce, UKG/UltiPro, ADP Recruiting | Partial | Provider and tenant metadata are detected and public career pages are parsed for embedded JSON, JSON-LD, and job links. Official recruiting APIs require tenant-specific authentication or configuration; failed public enumeration remains visible in receipts. |
| Generic schema.org `JobPosting` company-page crawler | Integrated | Every company portal is parsed for nested/list/graph JSON-LD and bounded job-detail links, rather than only verifying already-known candidates. |
| Full company-pool coverage report | Integrated | `company_portal_summary.json` reports dynamic pool size, attempted/succeeded/failed/unidentified counts, ATS distribution, scanned/matched jobs, and the complete failure list. |

## Pipeline and product gaps found in other open-source projects

| Feature | Reference project | Status |
|---|---|---:|
| Cross-source canonical deduplication with stale-job pruning | Job Board Aggregator / career-ops | Integrated |
| Per-platform trend history and anomaly alerts | Job Board Aggregator | Integrated |
| Progressive/chunked loading for very large job pools | Job Board Aggregator | Planned |
| Map/heatmap and geographic normalization | Job Board Aggregator | Planned |
| Posting legitimacy / ghost-job / repost detection | career-ops | Integrated |
| Required vs preferred skill extraction | career-ops-style evaluation | Integrated |
| Explicit uncertainty penalties for missing degree/experience evidence | Ivy scoring audit | Integrated |
| Company research and hiring-manager/contact discovery | career-ops | Planned |
| Interview story bank, interview preparation, follow-up cadence, reply classification | career-ops | Planned |
| Funnel analytics and per-source application success rates | career-ops | Planned |
| Complete CSV, Excel, JSON, and SQLite export | Ivy requirement | Planned |
| Email, Telegram, or ChatGPT completion notifications | Ivy requirement | Planned |
| End-to-end run receipt with fetched, verified, rejected, deduplicated, imported, retained, stale-pruned, and failed counts | Ivy requirement | Integrated |
| Automated tests with saved fixtures for core source/ATS behavior | Engineering requirement | Integrated |

Enterprise ATS acceptance on 2026-07-31 used five live public boards (iCIMS, Paylocity, Jobvite, JazzHR, and Gem): 5/5 portals completed, 45 postings were enumerated, and 9 target-scope jobs survived normalization. The local regression suite passed 14/14 tests.

### Remaining cloud limitations, not reported as completed

- Production evidence now exists: the 2026-07-31 run attempted all 176 companies and completed with a warning health state. It found 11 matched jobs from company portals, while 110 companies remained failed or unidentified. “Attempted” must not be interpreted as successful structured coverage.
- The first production receipt exposed two discovery gaps now fixed in code: regional/legacy company labels did not match parent-company Aggregator records, and stale sample job URLs could hide a still-live ATS board. Static matching now links 46 company-pool labels to Aggregator ATS evidence (up from 39), but the next scheduled run must measure the actual success-rate improvement.
- Branded enterprise ATS tenants may expose only client-rendered or tenant-specific endpoints. iCIMS, Paylocity, Jobvite, JazzHR, and Gem now have verified public adapters; Comeet is conditional on its public Careers API identifiers. Taleo, SuccessFactors, Dayforce, UKG, and ADP remain public-page fallbacks because their structured APIs are authenticated or tenant-configured. Failed/unidentified receipts are not renamed as successful structured coverage.
- Credentialed sources (Adzuna, Jooble, USAJobs, Exa) remain blocked until keys are intentionally configured.
- Login-protected sources are outside this cloud-only integration and are not included in completion counts.

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
