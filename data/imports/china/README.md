# China job-board imports

Place browser-extension exports or bookmarklet captures here before running the cloud merge.

Supported formats:

- JSON, JSONL, and NDJSON
- CSV and TSV

The importer recognizes common fields such as `title`, `jobTitle`, `jobName`,
`companyName`, `jobUrl`, `description`, `cityName`, and nested `jobs`/`items`/`data`
containers. Full JD text is preserved. Credentials, cookies, chat messages, and resumes
must never be placed in this directory.

Run:

```bash
python3 scripts/china_snapshot_import.py data/imports/china
```

For protected pages, run the local inbox server and use the bookmarklet:

```bash
python3 local-collector/jd_inbox_server.py
open local-collector/bookmarklets.html
python3 scripts/china_snapshot_import.py ~/.ivy-job-radar/inbox
```
