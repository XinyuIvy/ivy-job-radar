# China multi-source collection

The China pipeline uses multiple collection modes because protected job boards do not provide a reliable unattended browser interface.

## Route matrix

| Route | Platforms | Automation | Full JD | Production role |
|---|---|---:|---:|---|
| Company portals and ATS pages | Company sites, Workday, Moka, Feishu and other ATS pages | Cloud | When public | Primary source |
| Indexed discovery | BOSS, Liepin, Zhaopin, 51job, Lagou, Nowcoder, Guopin, Yingjiesheng | Cloud | Usually no | URL discovery |
| Ivy bookmarklet | Any visible job detail page | User-triggered | Yes | Protected-page fallback |
| Job Hunting extension export | BOSS, 51job, Zhaopin, Lagou, Liepin, JobOnline | User-triggered export | Depends on pages visited | Broad local snapshot source |
| Apify Zhaopin Actor | Zhaopin | Cloud, paid | Actor-dependent | Optional only |
| mcp-jobs 1.4.0 | Liepin and mobile BOSS in the published rules | Local Playwright | Partial | Experiment only |

`mcp-jobs` is not treated as a five-platform source. Its published package lists Lagou, Zhaopin, and 51job URLs but contains no matching crawler configuration for those three sites.

## Capture a protected JD

Start the capture-and-sync service:

```bash
python3 local-collector/china_capture_service.py
```

The default private configuration is `~/.ivy-job-radar/collector.env`. It must define `IVY_JOB_RADAR_URL`, `IVY_JOB_RADAR_SYNC_TOKEN`, and either `IVY_JOB_RADAR_SITES_BYPASS_TOKEN` or `SITES_SIWC_BYPASS_TOKEN`. Secrets stay on the local Mac and are never written into a capture file.

Open `local-collector/bookmarklets.html` and drag **保存当前 JD** to the Chrome bookmarks bar. On a visible job detail page, click the bookmark once. The bookmarklet sends only the visible title, company, location, page text, URL, source host, and capture time to `127.0.0.1`; it does not read cookies, messages, resumes, or credentials. Eligible captures are normalized and synced directly to Ivy Job Radar. Excluded titles are saved locally with an explicit exclusion reason.

The previous save-only server remains available for offline capture:

```bash
python3 local-collector/jd_inbox_server.py
python3 scripts/china_snapshot_import.py ~/.ivy-job-radar/inbox
```

## Import browser-extension snapshots

The importer accepts JSON, JSONL, NDJSON, CSV, and TSV. It recognizes common fields including `jobName`, `jobTitle`, `companyName`, `jobUrl`, `jobDescription`, and `cityName`, including records nested below `jobs`, `items`, `records`, `results`, or `data`.

```bash
python3 scripts/china_snapshot_import.py /path/to/job-hunting-export
```

Before committing an export, check that it does not contain cookies, account identifiers, recruiter conversations, resumes, or other personal data.

## Optional paid Zhaopin source

The paid source is disabled unless both variables are set:

```bash
export APIFY_ZHAOPIN_ENABLED=true
export APIFY_TOKEN='your-token'
python3 scripts/apify_zhaopin_scan.py --max-results 25
```

Do not enable this in the daily workflow until a spending cap and result limit are approved.

## Health semantics

A scheduled run is successful only if collection, merge, and website import finish. Missing website synchronization credentials must fail the workflow. A scan that cannot update the website must not appear as a successful daily refresh.
