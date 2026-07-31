# Job collection pipeline

## Current automated source

The GitHub Actions workflow `.github/workflows/daily-us-jobscan.yml` runs the US JobSpy scanner at 9:00 AM America/New_York. It queries Indeed, LinkedIn, and Google Jobs for the candidate-aligned role families listed in `config/us_search_queries.json`.

The scanner does not use credentials, proxies, CAPTCHA bypasses, or access-control workarounds. Individual sources can temporarily return fewer results or block automated requests.

## Outputs

Each successful run writes:

- `data/scans/us_jobs_latest.json`
- `data/scans/us_jobs_latest.csv`
- `data/scans/us_scan_summary.json`

The same files are retained as a 30-day GitHub Actions artifact.

## Evidence status

Job board aggregator results are discovery leads, not proof that an application is currently open. Every imported record is therefore marked `待官网核验`. A later validation stage must open the employer career page and confirm that the official application entry point remains available before the website labels a role as confirmed open.

## Filtering rules

The scanner:

- keeps target titles related to statistics, biostatistics, healthcare data science, applied science, and quantitative research;
- excludes internships, postdoctoral roles, senior leadership, software/data engineering, and title-level LLM/NLP roles;
- excludes explicit US citizenship or security-clearance requirements;
- excludes explicit no-sponsorship language;
- excludes experience requirements above three years unless the description clearly allows a doctorate as an equivalent;
- applies the candidate-specific explainable score;
- canonicalizes URLs and removes tracking parameters;
- extracts a job or requisition identifier when the URL exposes one;
- deduplicates by company plus application ID or canonical URL.

## Manual test

Open the repository Actions tab, select **Daily US job scan**, choose **Run workflow**, and run it on `main`. After completion, inspect the run summary and the committed files under `data/scans/`.

## Next integration stage

After a successful first run, add an authenticated ingestion endpoint so the workflow can send verified, deduplicated records to the site's D1 database. Do not expose a public unauthenticated bulk-write endpoint.
