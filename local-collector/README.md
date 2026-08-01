# BOSS local collector for Ivy Job Radar

This connector keeps the BOSS login session and cookies on your Mac. It runs a small rotating search batch, removes recruiter identity and activity fields, and sends only relevant job records to Ivy Job Radar.

## First-time setup on macOS

1. Open Ivy Job Radar and go to **采集**.
2. Download `collector.env` and move it to `~/.ivy-job-radar/collector.env`.
3. In Terminal, from this repository, run:

```bash
mkdir -p ~/.ivy-job-radar
mv ~/Downloads/collector.env ~/.ivy-job-radar/collector.env
chmod 600 ~/.ivy-job-radar/collector.env
python3 local-collector/boss_radar.py setup
```

Log in once in the dedicated BOSS Chrome window. This profile is separate from your normal Chrome profile.

## Test one rotating batch

```bash
python3 local-collector/boss_radar.py run
```

The default plan runs four one-page keyword/city searches per batch. It rotates through the complete plan across later runs instead of sending a large burst.

## Schedule automatic collection

```bash
python3 local-collector/boss_radar.py install-schedule
```

The macOS schedule runs at 08:30 and 20:30 local time. The collector stops when the scraper reports a login, verification, or platform restriction error. It never solves CAPTCHAs, sends messages, starts chats, or submits applications.

## Adjust coverage

Edit `local-collector/search-plan.json` to change cities or keywords. Keep `pages` at 1 or 2 and use rotating batches to reduce account and platform load.

The upstream scraper is maintained separately at <https://github.com/eatmoreduck/boss-zhipin-scraper>. Its availability and platform compatibility can change without notice.
