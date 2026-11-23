# Hidden section templates (not deployed)

These files live **outside** `web/` so GitHub Pages does not publish them.

Re-enable via `scripts/enable_yt_charts.py --section {creators|duration|upload_clock}`
(fails closed unless dependent `config/review_log.csv` rows are non-UNSET), or manually:

1. Copy the HTML fragment into `web/index.html`
2. Add the section id to `ENABLED_SECTIONS` and the payload path to `ENABLED_DATA` in `web/js/sections.js`
3. Copy the payload from `data/unpublished/web_ready/` into `web/data/`
4. Run `scripts/verify_web_data.py`

Fragments:

- `scrolly-3.html` — creators (`charts_yt/creators.js`)
- `scrolly-5.html` — duration (`charts_yt/duration.js`)
- `scrolly-7.html` — Douyin (legacy)
- `scrolly-8.html` — comments (legacy)
- `scrolly-9.html` — upload clock (`charts_yt/upload_clock.js`)
- `creator_layer.html` — Map 1 creator overlay (legacy)
