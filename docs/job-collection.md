# Job collection pipeline

## Daily US workflow

`.github/workflows/daily-us-jobscan.yml` runs once per day at `10:00 UTC` and can also be started manually from GitHub Actions. The exact local time changes with daylight saving time.

The workflow currently performs ten stages:

1. Prepare the run and publish progress to Job Radar.
2. Collect JobSpy results from the role families in `config/us_search_queries.json`.
3. Verify those candidates against company career pages.
4. Collect additional credential-free public sources.
5. Collect Job Board Aggregator candidates.
6. Verify aggregator candidates on official ATS pages.
7. Scan every enabled US company-pool career portal.
8. Canonicalize, merge, deduplicate and filter all results.
9. Audit expiration state, source health and count reconciliation.
10. Import the verified snapshot into Job Radar and prepare the next review batch.

The pipeline does not use proxies, CAPTCHA bypasses or access-control workarounds. A blocked source is recorded as blocked or incomplete instead of being treated as a valid zero-result scan.

## Source types

- JobSpy discovery results from LinkedIn, Indeed and Google Jobs
- Public, credential-free search sources
- Job Board Aggregator results
- Direct company career portals
- Greenhouse, Lever, Ashby, Workday, BambooHR, iCIMS and Paylocity ATS pages
- Structured job pages exposing usable schema.org metadata

Aggregator results are discovery leads. A role is eligible for the main list only after the pipeline has enough evidence that the official application page remains open and the complete JD is available.

## Filtering and identity

The pipeline:

- keeps the role families configured for the current candidate profile;
- checks seniority, experience, degree, location, work authorization, Sponsorship and explicit citizenship restrictions;
- extracts complete JD text and employer requisition IDs when available;
- canonicalizes URLs and removes tracking parameters;
- deduplicates by stable job ID, canonical URL, company and role identity;
- preserves existing jobs when a source is temporarily incomplete;
- marks jobs as suspected or confirmed expired only after source-aware checks;
- records source-level counts so the final totals can be reconciled.

Matching score determines display order. It is not, by itself, a hard rejection rule.

## Outputs

The workflow writes the current run under `data/scans/`, including source-specific files, the merged `all_jobs_latest.json` snapshot, scan summaries and health receipts. The directory is uploaded as a 30-day GitHub Actions artifact. Changed snapshots are also committed to `main` after rebasing onto the latest branch state.

Website import is split into bounded JSON batches before being sent to `/api/jobs/import`. The endpoint requires `IVY_JOB_RADAR_SYNC_TOKEN`, and a private Sites deployment also requires the Sites bypass credential.

## Configuration

- Search queries: `config/us_search_queries.json`
- Main company pool: `app/company-pool.json`
- Additional companies: `app/company-pool-additions.json`
- Additional career portals: `app/company-source-additions.json`

GitHub Actions secrets:

- `IVY_JOB_RADAR_SYNC_TOKEN`
- `SITES_SIWC_BYPASS_TOKEN`

## Manual run

1. Open the repository Actions tab.
2. Select `Daily US job scan and application preparation`.
3. Choose `Run workflow` on `main`.
4. Watch the Job Radar scan panel for stage, source and count updates.
5. If the run fails, inspect the uploaded `data/scans/` artifact and the failed workflow step.

The workflow prepares an application review batch after import, but it does not generate CVs or open application pages until the user confirms that batch in Job Radar.
