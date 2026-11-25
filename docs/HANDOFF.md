# Handoff — ASMR · sleep (public-safe)

Paste this into a new chat to resume. No privacy incident log; no raw rows or credentials.

## Scope

Public site is aggregated Google Trends + indicators + Wikipedia ASMR pageviews, plus three YouTube charts gated by review (creators, duration, upload clock). Keep every `TODO: my text` untouched; do not invent story copy. Never write `reviewed_by = human` yourself.

## Live

- Pages: https://wppannap.github.io/asmr-feasibility-test/
- Tag: `meeting-1` (post–YouTube enable)
- Night theme commits: B `c8188d7`, C `65c0aa3`, D `fce2bc1`

## Published sections

Controlled by `ENABLED_SECTIONS` in `web/js/sections.js`:

| id | Content | Status |
|----|---------|--------|
| `top` | Hero + waveform | published |
| `scrolly-1` | Map 1 — ASMR search growth (v3c) | published |
| `scrolly-2` | Map 2 — monthly own-peak time-lapse | published |
| `scrolly-3` | Creators (YT) | published |
| `scrolly-4` | Association table + scatter | published |
| `scrolly-5` | Duration (YT) | published |
| `scrolly-6` | Wiki ASMR language small multiples | published |
| `scrolly-9` | Upload clock (YT) | published |

## Theme

- Tokens: `web/css/theme.css` (night: ink/amber/teal)
- Charts read colours via `web/js/theme.js` → `getComputedStyle`
- Vendored libs: `web/js/vendor/` (d3, topojson, scrollama) — no CDN
- Contrast: `python3 scripts/contrast_check.py` (all pairs ≥ 4.5)

## Pipeline (order)

1. Trends v3c → `web/data/trends_*_v3c.json`, correlations, scatter points
2. Wiki via `scripts/build_web_data.py` → `web/data/wiki_lang.json`
3. YT: `scripts/enable_yt_charts.py` copies `data/unpublished/web_ready/` → `web/data/` when review gates pass
4. Gate: `python3 scripts/verify_web_data.py` (0 failed) + web leak scan; regenerate `config/DATA_FREEZE.md`

## Review integrity

- `config/review_log.csv` is source of truth; do not overwrite with local copies
- Human pack rows only via `scripts/ingest_review_pack.py`

## Undo night theme

```
git revert fce2bc1 65c0aa3 c8188d7
```

## Updated

2026-11-25T10:18:03Z
