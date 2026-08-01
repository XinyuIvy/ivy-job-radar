# China multi-source collection

The China pipeline uses multiple collection modes because protected job boards do not provide a reliable unattended browser interface.

## Route matrix

| Route | Platforms | Automation | Full JD | Production role |
|---|---|---:|---:|---|
| Company portals and ATS pages | Company sites, Workday, Moka, Feishu and other ATS pages | Cloud | When public | Primary source |
| BOSS one-click local scan | BOSS | User-triggered batch automation | Yes | Primary protected-platform route |
| Indexed discovery | BOSS, Liepin, Zhaopin, 51job, Lagou, Nowcoder, Guopin, Yingjiesheng | Cloud | Usually no | URL discovery |
| Ivy bookmarklet | Any visible job detail page | User-triggered | Yes | Single-job fallback |
| Job Hunting extension export | BOSS, 51job, Zhaopin, Lagou, Liepin, JobOnline | User-triggered export | Depends on pages visited | Broad local snapshot source |
| Apify Zhaopin Actor | Zhaopin | Cloud, paid | Actor-dependent | Optional only |
| mcp-jobs 1.4.0 | Liepin and mobile BOSS in the published rules | Local Playwright | Partial | Experiment only |

`mcp-jobs` is not treated as a five-platform source. Its published package lists Lagou, Zhaopin and 51job URLs but contains no matching crawler configuration for those three sites.

## BOSS one-click scan

The primary BOSS route runs on the user's Mac so the login session never leaves the device. Install the dedicated Chrome profile and desktop launcher once:

```bash
python3 local-collector/boss_radar.py setup
python3 local-collector/boss_one_click.py install
```

The user then double-clicks **一键扫描BOSS.command** whenever convenient. A run continues from the saved search-plan cursor, processes a rate-limited batch of keyword and city combinations, extracts complete JDs, filters titles, removes recruiter fields, deduplicates records and immediately imports eligible jobs into Ivy Job Radar. It pauses on login or verification failures instead of attempting to bypass them.

The 64-combination plan is divided into batches of 8. Progress and the latest result summary are stored below `~/.ivy-job-radar/`; no captured job files or credentials are committed to GitHub.

## Capture a single protected JD

Start the capture-and-sync service:

```bash
python3 local-collector/china_capture_service.py
```

The default private configuration is `~/.ivy-job-radar/collector.env`. It must define `IVY_JOB_RADAR_URL`, `IVY_JOB_RADAR_SYNC_TOKEN`, and either `IVY_JOB_RADAR_SITES_BYPASS_TOKEN` or `SITES_SIWC_BYPASS_TOKEN`. Secrets stay on the local Mac and are never written into a capture file.

Open `local-collector/bookmarklets.html` and use **保存当前 JD** on a visible detail page. This remains a fallback for a job missed by the batch scan. The bookmarklet sends only visible job fields to `127.0.0.1`; it does not read cookies, messages, resumes or credentials.

The previous save-only server remains available for offline capture:

```bash
python3 local-collector/jd_inbox_server.py
python3 scripts/china_snapshot_import.py ~/.ivy-job-radar/inbox
```

## Import browser-extension snapshots

The importer accepts JSON, JSONL, NDJSON, CSV and TSV. It recognizes common job, company, URL, description and city fields, including records nested below `jobs`, `items`, `records`, `results` or `data`.

```bash
python3 scripts/china_snapshot_import.py /path/to/job-hunting-export
```

Before committing an export, check that it does not contain cookies, account identifiers, recruiter conversations, resumes or other personal data.

## Optional paid Zhaopin source

The paid source remains disabled unless both variables are set:

```bash
export APIFY_ZHAOPIN_ENABLED=true
export APIFY_TOKEN='your-token'
python3 scripts/apify_zhaopin_scan.py --max-results 25
```

Do not enable this in the daily workflow until a spending cap and result limit are approved.

## Health semantics

A run is successful only if collection, transformation and website import finish. A paused BOSS run records the exact unfinished search cursor so the next user-triggered run resumes safely. Missing website synchronization credentials must fail the run rather than reporting a successful refresh.
