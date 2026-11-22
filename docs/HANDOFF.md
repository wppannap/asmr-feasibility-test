# Handoff — ASMR feasibility site (clean publish repo)

## (i) Scope and story (as implemented)

The published site covers **human-performed / recorded ASMR** demand and context: Google Trends ASMR interest by country (change in window / recent vs peak, Map 1; monthly own-peak series, Map 2), ASMR–indicator scatter (Holm-adjusted Spearman pairs), and Wikipedia **ASMR** pageview indices by language edition. Ambient / continuous noise content is out of scope for publication until class lists are manually verified.

## (ii) Published vs hidden sections

| Section | Status | Why |
|---------|--------|-----|
| `top`, `scrolly-1` (Trends map), `scrolly-2` (monthly), `scrolly-4` (scatter), `scrolly-6` (Wiki ASMR) | **Published** | Aggregated Trends / indicators / wiki ASMR only |
| `scrolly-3` Creators, `scrolly-5` Duration, `scrolly-7` Douyin, `scrolly-8` Comments | **Hidden** | Payloads built from the old wider YouTube/Douyin/TikTok/comment scope; moved to `data/unpublished/` until `human_asmr` rules are judged |
| Stage-1 creator / compare layers | **Hidden** | Need `creator_country.json` (unpublished) |

Controlled by `web/js/sections.js` (`ENABLED_SECTIONS`).

## (iii) Data pipeline

| Payload | Raw source (local, not in git) | Builder |
|---------|--------------------------------|---------|
| `trends_country_v2.json`, `trends_monthly_v2.json` | `data/trends_timeseries.csv`, `config/trends_batches.csv` | `scripts/build_web_data.py` |
| `insomnia_vs_asmr.json` | Trends + `data/indicators_country.csv` (+ Taiwan official) | `scripts/build_web_data.py` |
| `wiki_lang.json` | `data/wiki_pageviews_monthly.csv` filtered by `config/wiki_concepts.yaml` | `scripts/build_web_data.py` |
| `countries-50m.json` | world-atlas TopoJSON copy | checked into `web/data/` |
| Class flags | `data/yt_master.csv` + `config/yt_classes.yaml` | `scripts/classify_yt_classes.py` → `data/yt_classes.csv` |
| Unpublished (creators, duration, comments, Douyin, TikTok) | respective masters / samples | `scripts/build_web_data.py` (outputs parked under `data/unpublished/`) |

**Order:** classify (optional) → `python3 scripts/build_web_data.py` → scope filters → `python3 scripts/verify_web_data.py` → deploy.

## (iv) Key numbers (from published JSON)

From `trends_country_v2.json` `meta.flag_counts` and rows:

- Rising beyond noise: **19**; within noise: **10**; falling beyond noise: **2** (n countries = 31)
- Median `change_in_window`: **6.80**; median `recent_vs_peak`: **84.52**

Holm family (`insomnia_vs_asmr.json` `correlations`, **includes TWN**, n=31):

| pair | rho | n | p | p_holm |
|------|-----|---|---|--------|
| change_vs_internet | 0.0048 | 31 | 0.9794 | 1.0 |
| change_vs_youth | 0.0335 | 31 | 0.8581 | 1.0 |
| recent_vs_internet | 0.0702 | 31 | 0.7076 | 1.0 |
| recent_vs_youth | -0.2085 | 31 | 0.2604 | 1.0 |

`correlations_excluding_twn` uses the same four pairs with **n=30**. Earlier handoff copy accidentally pasted the excluding-TWN table as `correlations` (that made it look like Taiwan was missing). Spearman drops incomplete indicator rows; before official Taiwan stats filled `IT.NET.USER.ZS` / youth share, TWN had `indicators_status=missing` and was excluded from the n=30 pairs.

Wikipedia `meta.low_traffic_languages_asmr`: **hi, id, ms, th, uk, vi**. Published concepts: **ASMR only** (`config/wiki_concepts.yaml`).

## (v) Verification state

- `config/verified_themes.json` (verbatim themes for when comments return): anxiety_stress, gratitude, insomnia, sleep_aid_effectiveness (loneliness / companionship excluded from publish).
- `data/class_check_human.csv`, `class_check_ambient_labelled.csv`, `class_check_noise_not_asmr.csv`, `sleep_strict_check.csv`: **pending manual judgement** (local only).
- `scripts/verify_web_data.py`: published-file checks + leak/noise-phrase scan; unpublished payload spot-checks skipped.

## (vi) Decisions already made

- Scope → human-performed ASMR only (`config/yt_classes.yaml` exclusion lexicon retained).
- Taiwan indicators from official TW statistics (`ok_tw_official`).
- Loneliness and companionship not published in comment themes.
- `take_off_year` and `asmr_share_of_batch` dropped from published Trends rows.

## (vii) Privacy incident log

Moved to local-only `data/HANDOFF_PRIVATE.md` (gitignored via `/data/`).

## (viii) Open items (order)

1. Judge `data/class_check_*.csv` and `data/sleep_strict_check.csv`.
2. Fix final `human_asmr` rules in `config/yt_classes.yaml` if needed; re-run `scripts/classify_yt_classes.py`.
3. Rebuild YouTube payloads for human_asmr (creator map by channel count; duration for human_asmr × sleep_strict; comment sample restricted to human_asmr).
4. Rebuild Douyin / TikTok without ambient-matching rows.
5. Re-enable hidden sections in `web/js/sections.js` and restore payloads to `web/data/`.
6. Wikipedia timeline decision after review of `docs/WIKI_CHECK_2.md`.
