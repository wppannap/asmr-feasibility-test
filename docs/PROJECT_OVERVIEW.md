# ASMR · sleep — project overview for external review

Everything below is computed or quoted from this repo. Missing facts: **NOT FOUND**. No raw comments, author names, channel ids, or API keys.

Git branch: `main`. Regenerated from the working tree after human-ASMR scope lockdown. Freeze hashes: `config/DATA_FREEZE.md` (regenerated with the publish commit).

---

## 1. Page map

Scroll order from `web/index.html`. **Published** FE loads (`web/js/sections.js` → `ENABLED_DATA` / `web/js/main.js`): `countries-50m.json`, `trends_country_v2.json`, `trends_monthly_v2.json`, `insomnia_vs_asmr.json`, `wiki_lang.json`.

Hidden until class_check review (HTML present; not fetched): Creators, Duration, Douyin, Comments — payloads parked under `data/unpublished/` (and `data/unpublished/v2/`).

| # | id | Chart | Data | Status | Default |
|---|-----|-------|------|--------|---------|
| 0 | `top` | none | — | published | hero |
| 1 | `scrolly-1` | dual choropleth | trends_country_v2, topo | **published** (Trends layer only; creator/compare controls hidden) | Metric=`change_in_window` |
| 2 | `scrolly-2` | monthly choropleth | trends_monthly_v2 | **published** | monthIndex=0; `own_peak_asmr` |
| 3 | `scrolly-3` | creator symbols + TikTok | unpublished | **hidden** | — |
| 4 | `scrolly-4` | corr table + scatter | insomnia_vs_asmr | **published** | table on |
| 5 | `scrolly-5` | duration histograms | unpublished | **hidden** | — |
| 6 | `scrolly-6` | wiki small multiples | wiki_lang | **published** | concept `ASMR` only |
| 7 | `scrolly-7` | Douyin bars | unpublished | **hidden** | — |
| 8 | `scrolly-8` | comment theme bars | unpublished | **hidden** | — |

### Visible claim-like strings (verbatim)

**`web/index.html`**
- Brand / title: `ASMR · sleep`
- 28× `TODO: my text` placeholders (hero, steps, footer)
- Nav labels still list Creators / Duration / Douyin / Comments; those anchors are hidden via `applySectionVisibility`
- Map 1: Layer Trends; Metric Change in window / Recent vs peak
- Caveat slots `#caveat-*` filled from JSON `meta.caveats`

**JS**
- `METRIC_LABEL` for `change_in_window` / `recent_vs_peak` (own-peak definitions)
- Map hatch: `Change is within noise (…2 standard errors…; Google Trends is a sample)`
- Scatter: `A question with no clear answer`; `…not evidence about who uses ASMR.`
- Wiki: indexed to each language edition’s own max = 100

No finished key-findings prose. `take_off_year` / `asmr_share_of_batch` are not on the page.

---

## 2. Numbers on the page

| Visible / hardcoded number | Source | Value now | Flag |
|----------------------------|--------|-----------|------|
| Noise country counts | `trends_country_v2.meta.flag_counts` | rise **19** · within **10** · fall **2** | OK |
| Window Spearman 12 vs 6 | `window_spearman_12_vs_6` | 0.9226 / 0.8859 | OK |
| Holm 4 pairs (±TWN) | `insomnia_vs_asmr.correlations*` | with TWN **n=31**; excluding TWN **n=30**; all Holm p ≥ 0.89 | OK |
| Taiwan internet / youth | TWN row | 87.6% / 11.796%; `ok_tw_official` | OK |
| Wiki concepts | `wiki_lang.concepts` | `["ASMR"]` (23 language editions) | OK |
| Wiki low_traffic | `meta.low_traffic_languages_asmr` | hi, id, ms, th, uk, vi | OK |
| Median change / recent | rows | **6.80** / **84.52** | OK |

Creator / Douyin / TikTok / comment / duration headline numbers are **not** on the published page (payloads unpublished). Local v2 sensitivity (mixed in/out) lives under `data/unpublished/v2/sensitivity_mixed_report.md`.

No finished step prose with stats (all TODO). Sign-test p-value is **not** displayed.

---

## 3. Data inventory

### Raw sources (local `/data/`, gitignored)

| Source | File | Scale | Notes |
|--------|------|------:|-------|
| YouTube | `yt_master.csv` + `yt_classes.csv` | 342,423 videos | Classes: human_asmr 145110 · other 168888 · noise_not_asmr 20115 · ambient_labelled_asmr 8310; mixed⊂human_asmr 14569 |
| Channel country | `yt_channel_country.csv` | — | Self-declared countryCode |
| Comments | `yt_comments_sample.csv` | 85,224 comments | 150 videos × 6 langs design; relevance ranking |
| Trends | `trends_timeseries.csv` | 31 geos | Window Nov 2021–Oct 2026 (complete months) |
| Wikipedia | `wiki_pageviews_monthly.csv` | many concepts | Builder publishes ASMR only via `config/wiki_concepts.yaml` |
| Indicators | `indicators_country.csv` + Taiwan official | 31 iso3 | TWN not in World Bank |
| Douyin / TikTok trials | `*_trial/*_master.csv` | 528 / 168 | Filtered copies in unpublished/v2 |

### Published `web/data/`

| File | Bytes (approx) | Role |
|------|---------------:|------|
| countries-50m.json | 756,420 | TopoJSON |
| trends_country_v2.json | 13,172 | Map 1 own-peak change/recent |
| trends_monthly_v2.json | 15,631 | Map 2 time-lapse |
| insomnia_vs_asmr.json | 10,050 | Holm Spearman + country rows |
| wiki_lang.json | ~26.7K | ASMR indexed pageviews |

Producer: `scripts/build_web_data.py` (unpublished YouTube/Douyin/TikTok/comment JSON written under `data/unpublished/`, not `web/data/`).

---

## 4. Methods (short)

- **Trends v2:** primary comparison_group per geo; own-peak index; `change_in_window` / `recent_vs_peak`; `within_noise` from optimistic SE.
- **Scatter / Holm:** four ASMR own-peak × internet/youth pairs; descriptive `internet_vs_youth` outside Holm; tables with and without TWN.
- **Wiki:** access=all; concepts from `config/wiki_concepts.yaml` (default `["ASMR"]`); per-language max=100 index.
- **Classes:** `config/yt_classes.yaml` → `scripts/classify_yt_classes.py` → `data/yt_classes.csv`. Proposal-only leakage notes: `config/yt_classes_proposed.yaml` (not applied to live rules).

---

## 5. Verification

- `python3 scripts/verify_web_data.py` — published files only; ASMR-only wiki concepts; no white/brown/pink/binaural/ambient-noise phrases under `web/`; Holm n=31 / excluding-TWN n=30.
- web/ leak scan: no comment text, channel ids, or Google API key prefixes in tracked published payloads.
- `config/DATA_FREEZE.md` — sha256 of current `web/data/`.

---

## 6. Scope lockdown

Published story = human-performed ASMR demand context (Trends + indicators + Wikipedia ASMR). Ambient/noise and unverified YouTube/Douyin/TikTok/comment charts stay local until manual `class_check_*.csv` review (`docs/HANDOFF.md`).

Privacy incident log: `data/HANDOFF_PRIVATE.md` (gitignored).

---

## 7. Sampling and representativeness

| Chart | Sample is… | Cannot show… |
|-------|------------|--------------|
| Trends maps | 31 geos × primary-batch relative interest; within_noise hatched; rise/within/fall from `flag_counts` | Absolute volume; independent geos |
| Scatter / corr | Own-peak change/recent + WB/TW indicators (n=31 with TWN) | Causal “who uses ASMR” |
| Wiki | Indexed ASMR pageviews by language edition (23 langs) | Country demand; mainland Chinese interest via zh.wikipedia |
| Creators / TikTok / Duration / Douyin / Comments | **Not published** — unpublished payloads / v2 drafts only | — |

When comments return: sample is top-view sleep-related × relevance comments; human_asmr subset report at `data/unpublished/v2/comment_subset_report.md` (local). Keyword lists: `docs/YOUTUBE_KEYWORDS.md`. Expansion caveat: uploads playlist newest-first, typically ≤100 videos/pass.

---

## 8. Claims audit

Finished step sentences with causal/comparative/ranking language: **none** (all `TODO: my text`). Remaining UI phrases are metric definitions or explicit disclaimers (`not evidence about who uses ASMR`). No `take_off` / share-of-batch ranking copy on the page.

---

## 9. Accessibility and mobile

| Item | In repo |
|------|---------|
| Skip link | `web/index.html` |
| `prefers-reduced-motion` | `web/css/styles.css` + util |
| Scrubber | aria labels |
| Mobile CSS | `@media (max-width: 800px)` |
| Formal a11y / mobile QA log | **NOT FOUND** |
| Page weight | `web/data` dominated by countries-50m + small JSON set |

---

## 10. Open items

- 28× `TODO: my text` in `web/index.html`.
- Judge local `data/class_check_*.csv` / `sleep_strict_check.csv`; consider `config/yt_classes_proposed.yaml` (proposal only).
- Rebuild and re-enable Creators / Duration / Douyin / Comments after human_asmr rules freeze.
- Wikipedia timeline decision after `docs/WIKI_CHECK_2.md`.
- Trends expansion work (if present as untracked scripts) is separate from this publish freeze.

---

## 10-line summary

1. Published site: Trends maps + ASMR–indicator Holm table + Wikipedia ASMR only.  
2. Creators / Duration / Douyin / Comments hidden; payloads under `data/unpublished/`.  
3. Holm correlations **n=31** (TWN included); excluding-TWN **n=30**.  
4. Wiki concepts forced to `["ASMR"]` via `config/wiki_concepts.yaml`.  
5. Noise flags: 19 rise / 10 within / 2 fall.  
6. All step prose still TODO.  
7. Class leakage proposal recorded; live `yt_classes.yaml` unchanged.  
8. Comment human_asmr subset + Douyin/TikTok ambient drops + mixed sensitivity are local-only reports.  
9. verify_web_data + noise-phrase leak scan gate publish.  
10. Check `config/DATA_FREEZE.md` hashes against `web/data/` after each rebuild.
