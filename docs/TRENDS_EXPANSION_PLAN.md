# Trends expansion plan (ASMR-only, all map geos)

Read-only plan for extending Google Trends coverage beyond the current 31 geos.
Reuse `fetch_google_trends.py` (custom HTTP `TrendsClient`, not pytrends). No new dependencies.

## How the current 31 geos were fetched

| Piece | Detail |
| --- | --- |
| Library | Custom `TrendsClient` in `fetch_google_trends.py` (session + explore + widget HTTP; cache under `cache/trends/`) |
| Keywords | Multi-keyword comparison batches (≤5 terms), typically ASMR + insomnia + sleep peers; registry in `config/trends_batches.csv` |
| Shell runners | `run_all_trends.sh` and ad-hoc `python3 fetch_google_trends.py --keywords … --geo XX --timeframe "today 5-y"` |
| Request pattern | Per geo × batch: 1× `explore` → 1× `TIMESERIES` widget (+ related/geo widgets in full runs) |
| Rate limits | `MIN_INTERVAL=3s`; 429 → exponential backoff (5s…90s); after 3 consecutive 429s, 60s cooldown |
| Output | `data/trends_timeseries.csv` (merged by keyword/geo/timeframe/comparison_group/date) |
| Published build | `scripts/build_web_data.py` → `build_trends_v2` → `web/data/trends_*_v2.json` (primary batch only; own_peak metrics) |

Existing geos (ISO2): AR, AU, BE, BR, CA, CL, DE, ES, FR, GB, HK, ID, IN, IT, JP, KR, MX, NG, NL, PH, PL, PT, RU, SE, SG, TH, TR, TW, US, VN, ZA (31).

## Map ISO3 → ISO2

Source map: `web/data/countries-50m.json` (Natural Earth 50m). Numeric ids mapped via `web/js/iso.js` `ISO_NUM_TO_A3`, then A3→A2 (Trends geo codes).

**Excluded (per task):** CHN (mainland Google inaccessible), PRK, Antarctica, plus Heard / Norfolk / Fr. S. Antarctic Lands (no useful Trends geo).

**Collision rule:** when several geometries share an ISO2 (e.g. Australia vs Ashmore), prefer the sovereign / main territory name.

Proposed list written to `config/trends_asmr_geos.json` (**229** geos; **31** marked `existing: true`).

## Proposed fetch (this expansion)

| Field | Value |
| --- | --- |
| Keyword | `ASMR` only (Latin-script term) |
| Timeframe | `2021-11-01 2026-10-31` (explicit; not `today 5-y`) |
| Property / category | Web search, category 0 |
| Per geo | One explore + one TIMESERIES widget (no related/geo widgets) |
| Granularity gate | Must be **weekly** (~260 points). If monthly/daily → stop and report |
| Output | `data/trends_asmr_all_geos.csv`, `data/trends_fetch_log.csv` |
| Sleep | Uniform random **30–90 s** between geos |
| 429 | Backoff **5 → 15 → 30 min**; after **5 consecutive 429s** stop cleanly with resume instructions |
| Resume | Skip geos already `ok` in the fetch log |
| Runner | `scripts/fetch_trends_asmr_all.py` under `nohup` → `logs/` |

### Request / time estimate

- Geos: **229**
- HTTP calls: ~2 per geo → ~458 (plus retries)
- Sleep-dominated wall time: ~**2.9–5.7 h** at 45–90 s mean between geos (plus 429 pauses)

## Downstream (not published until reviewed)

1. `scripts/build_trends_v3.py` → `data/unpublished/v3/trends_{country,monthly}_v3.json` (same own_peak / window / noise defs as `build_trends_v2` at `scripts/build_web_data.py` L338–621) + quality class.
2. Indicators for every v3 geo → `data/indicators_country_v3.csv`; Holm ×2 → `data/unpublished/v3/insomnia_vs_asmr_v3.json`.
3. Front-end Map 1/2 legend / slider / captions only are pushed; **v3 payloads stay unpublished**.

## Out of scope for this push

- Publishing v3 JSON under `web/data/`
- Re-fetching multi-keyword insomnia batches
- Rate-limit evasion beyond the stated backoff
