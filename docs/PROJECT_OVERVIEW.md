# ASMR · sleep — project overview for external review

Everything below is computed or quoted from this repo. Missing facts: **NOT FOUND**. No raw comments, author names, channel ids, or API keys.

Git HEAD: `b7b69399373104bdb014bec4b123219b3ae3aa37` (`git status`: clean). Freeze payload commit `c7014140ff5cf495e6ea1b7d603ab391be2d9ee2`; tip includes hash stamp.

---

## 1. Page map

Scroll order from `web/index.html`. FE loads (`web/js/main.js`): `countries-50m.json`, `trends_country_v2.json`, `creator_country.json`, `trends_monthly_v2.json`, `tiktok_origin.json`, `insomnia_vs_asmr.json`, `youtube_yearly.json`, `wiki_lang.json`, `douyin_keywords.json`, `comment_themes.json`.

| # | id | Chart | Data | Interactions | Default |
|---|-----|-------|------|--------------|---------|
| 0 | `top` | none | — | nav | hero |
| 1 | `scrolly-1` | dual choropleth | trends_country_v2, creator_country, topo | Layer: Trends / creators / compare; Metric: change_in_window / recent_vs_peak | Layer=Trends (`is-active`); Metric=**change_in_window** (`main.js` default + `index.html` L48 `is-active`) |
| 2 | `scrolly-2` | monthly choropleth | trends_monthly_v2 | Play/Pause; month scrubber | monthIndex=0; series `own_peak_asmr` |
| 3 | `scrolly-3` | creator symbols + TikTok bars | creator_country, tiktok_origin | table toggle | proportional symbols |
| 4 | `scrolly-4` | corr table + scatter | insomnia_vs_asmr | “View as chart”; table toggle | table on; chart hidden |
| 5 | `scrolly-5` | duration histograms | youtube_yearly | table toggle; scroll opacity | sleep vs other |
| 6 | `scrolly-6` | wiki small multiples | wiki_lang | shared-y checkbox (default off); concept hardcoded `"ASMR"` | indexed series |
| 7 | `scrolly-7` | Douyin bars | douyin_keywords | table toggle | by median collect-to-like |
| 8 | `scrolly-8` | comment theme bars | comment_themes | table toggle | verified themes only |
| — | footer | — | — | — | — |

### Visible claim-like strings (verbatim) · file:line

**`web/index.html`**
- L6 title: `ASMR · sleep — scrolly map`
- L13: `Skip to content`
- L16 brand: `ASMR · sleep`
- L17–18, L73–76, L107–109, L120–122, L133–135, L146–148, L159–161, L172–174, L185–187, L192: `TODO: my text` (**PLACEHOLDER**, 28×)
- L22–30 nav: `Top` `Map 1` `Map 2` `Creators` `Scatter` `Duration` `Wiki` `Douyin` `Comments`
- L38–42: `Layer` · `搜尋熱度（Trends）` · `創作者所在地` · `左右對照`
- L46–49: `Metric` · `Change in window` · `Recent vs peak`
- L56 `#trends-panel-title` (static HTML matches default metric): `Change in ASMR search interest, latest 12 months vs first 12 months of the window (points, relative to each country's own peak)`
- L57: `Window: Nov 2021 to Oct 2026`
- L62: `創作者所在地（頻道國家）`
- L85–86: `Play`; scrubber aria-labels
- L90–91: `Relative to each country's own peak`
- L96: `ASMR own-peak time-lapse`
- Caveat slots `#caveat-1..8` start as `Loading…` then filled from JSON `meta.caveats` (+ chart extras)

**JS-injected**
- `web/js/main.js` L23–28 `METRIC_LABEL`: change_in_window → `Change in ASMR search interest, latest 12 months vs first 12 months of the window (points, relative to each country's own peak)`; recent_vs_peak → `Mean ASMR search interest in the latest 12 months of the window (points, relative to each country's own peak)`
- Map 1 hatch legend (when `within_noise` present): `Change is within noise (smaller than about 2 standard errors of monthly values; Google Trends is a sample)`
- `web/js/charts/config.js` L6–7 ``SHARE_CAVEAT` **removed**; duration markers/footnote live in `config.js` + JSON meta
- `scatter.js` L33: `A question with no clear answer`
- `scatter.js` L38: `Country-level associations between each country's own ASMR search trend and context indicators; not evidence about who uses ASMR.`
- `comments.js`: `Share of sampled comments containing theme keywords` (+ themes can overlap)
- `creator_symbols.js`: `Where channels in our sample say they are based`; circle-area note
- `douyin.js`: median collect-to-like title; `n=… · small sample` / grey if n < 30
- `wiki.js`: `Concept: ASMR · each series is indexed to that language edition’s own max = 100`; tooltip notes indexed values only
- `duration.js` `CLASSIFY_FOOTNOTE` + axis markers `1 hour` / `8 hours`

No finished key-findings / takeaway prose in steps (all TODO). **`take_off_year` / `asmr_share_of_batch` are not on the page.**

---

## 2. Numbers on the page

| Visible / hardcoded number | Intended JSON key | Value in JSON now | Flag |
|----------------------------|-------------------|-------------------|------|
| Comments n=`85224` | `comment_themes.meta.n_comments` | `85224` | OK |
| Lang totals en 14941 … zh 12827 | `by_language[].total_comments` | same | OK |
| Creator coverage 68.5% / 77.4% | `coverage_channels_pct` / `coverage_videos_pct` | 68.511 / 77.3862 | OK |
| Videos per channel median / p90 | `median_videos_per_channel` / `p90_videos_per_channel` | **3** / **284** | symbols = channel_count |
| Chinese query 77.8% · 311/400 | `chinese_query_share` / `_n` / `_denom` | 0.7775, 311, 400 | OK |
| TikTok n | `tiktok_origin.meta.n` | 168 | OK |
| Douyin n=528 | `douyin_keywords.meta.n` | 528 | OK |
| Douyin grey if n&lt;30 | hardcoded `douyin.js` | — | **HARDCODED** |
| Duration markers 3600 / 28800 | `meta.duration_markers_sec` | 1h / 8h | from JSON/config |
| Duration group n (2×2) | `duration_histogram.groups.*.n` | asmr∩sleep **82038**; asmr¬sleep **83884**; sleep¬asmr **42571** | matches YOUTUBE_DURATION_CHECK |
| Duration n_plotted / invalid | `n_plotted` / `n_invalid_duration` | 81519/519; 83795/89; 41963/608 | missing/≤0 duration; plot range 1.0–158489.319s |
| Duration medians (3 weightings) | `median_sec_video` / `_channel_equal` / `_capped20` | e.g. asmr∩sleep 1297.0/1200.0/1242.0 | build-computed |
| `weighting_sensitive` | groups.*.weighting_sensitive | sleep¬asmr **yes** (max/min median &gt; 3); others no | note on page when true |
| Noise country counts | `flag_counts` | rise 19 · within 10 · fall 2 | Map 1 caption |
| Window Spearman 12 vs 6 | `window_spearman_12_vs_6` | 0.9226 / 0.8859 | OK |
| Holm 4 pairs | `insomnia_vs_asmr.correlations.*` | all Holm p=1.0 | OK |

No finished step prose with stats (all TODO). Sign-test p-value is **not** displayed.

---

## 3. Data inventory

### Raw sources (computed)

| Source | File | Rows / unique key | First–last date | Collection (repo) | Keywords / regions | Gaps |
|--------|------|-------------------|-----------------|-------------------|--------------------|------|
| YouTube | `data/yt_master.csv` | 342423 rows = unique `videoId` | publishedAt 2009-07-02 → 2026-11-21 | `fetch_youtube_asmr.py` + channel expand (`expand_by_channel.py`); audit in `scripts/DATA_AUDIT.md` | `yt_query_log.csv` 400 calls: region TW/HK/MY/SG; Han terms **311/400** | ~96% empty searchKeywords after expansion; 2025–26 dominate |
| Channel country | `data/yt_channel_country.csv` | 5205 = unique channelId | fetched ~2026-11-21 | `scripts/fetch_channel_country.py` | — | coverage 68.5% ch / 77.4% vid |
| Comments | `data/yt_comments_sample.csv` | 85224 unique commentId | 2015-04-30 → 2026-11-21 | `scripts/fetch_comments.py`: sleep+ASMR, ≤~150 top-view videos/lang ×6, 100 comments/video relevance | en/es/ja/ko/fr/zh by design | not random; video-side `language_group` |
| Trends | `data/trends_timeseries.csv` | 52225 rows; 31 geos | timestamp UTC **2021-10-17 → 2026-11-15**; all `timeframe=today 5-y` | `fetch_google_trends.py` (+ shell runners); batches ≤5 kws | locale insomnia terms in `config/trends_batches.csv`; geos AR…ZA (31) | relative 0–100; v2 uses primary batch |
| Wikipedia | `data/wiki_pageviews_monthly.csv` | ~1.16M rows | month 2015-07 → 2026-10 (136 unique months in web grid) | wiki fetch scripts | concepts×langs in build | lang≠country; API omits zeros — see `docs/WIKI_CHECK.md`, `docs/WIKI_CHECK_2.md` |
| TikTok trial | `data/tiktok_trial/tiktok_asmr_master.csv` | 168 | ~2022–2026 | trial scrapers | ASMR trial | validation only |
| Douyin trial | `data/douyin_trial/douyin_asmr_master.csv` | 528 unique aweme_id | create_time in audit | MediaCrawler trial | 8 source_keywords | no plays/region in harvest |
| Indicators | `data/indicators_country.csv` | 93 rows; 31 iso3 | years vary (internet often 2024, youth 2025) | World Bank + derived | IT.NET.USER.ZS; DERIVED.POP.1524.ZS | TWN missing from WB |
| Taiwan official | `data/taiwan_official/taiwan_indicators.csv` | 3 rows | internet 2024 **87.6%** (12+); youth 2024 **11.796%** | `scripts/fetch_taiwan_indicators.py` | — | denominators ≠ WB |
| Theme counts | `data/comment_theme_counts.csv` | 42 rows | — | `scripts/comment_themes.py` + `config/lexicon.yaml` | multilingual kws | precision varies; loneliness kept here only |

### Derived `web/data/` (producer: `scripts/build_web_data.py` unless noted)

| File | Bytes | Top keys | meta.n / notes | meta.caveats (summary) | FE? |
|------|------:|----------|----------------|------------------------|-----|
| trends_country_v2.json | 13334 | meta, rows | n=31 | own_peak; change_in_window; change_se/within_noise; autocorrelation caveat; share not published | **yes** |
| trends_monthly_v2.json | 15631 | meta, months, countries, series | n=1922 | own_peak_series definition | **yes** |
| insomnia_vs_asmr.json | 10050 | meta, correlations, correlations_excluding_twn, correlations_descriptive, countries | n=31 | 4 Holm pairs on change/recent × internet/youth; no share/insomnia | **yes** |
| creator_country.json | 9200 | meta, countries | n_videos 342423 | Chinese query 311/400; self-declared country; coverage 68.5/77.4 | **yes** |
| tiktok_origin.json | 2875 | meta, countries | 168 | validation sample | **yes** |
| youtube_yearly.json | 5218 | meta, years, duration_histogram | 342423 | year from publishedAt; heuristics; log bins | **yes** |
| wiki_lang.json | 758750 | meta, months, concepts, languages, series | access=all; ASMR 23 langs | index max=100; lang≠country; **Chinese edition / own-max / search-engine caveats** | **yes** |
| douyin_keywords.json | 2624 | meta, keywords | 528 | no plays/region; n=528 crawl | **yes** |
| comment_themes.json | 5259 | meta, by_language, pooled | 85224 | keyword hits; verified_themes only; loneliness excluded | **yes** |
| countries-50m.json | 756420 | topojson | — | — | **yes** |

Archived (not in `web/data/`): `data/archive_not_published/{trends_country,trends_monthly,insomnia_vs_asmr_raw_mean}.json`.

Freeze table: `config/DATA_FREEZE.md` (regenerated with this commit).

---

## 4. Time coverage and censoring

| Series | First | Last | Count | Zero / null months |
|--------|-------|------|-------|--------------------|
| Trends own_peak (`trends_monthly_v2`) | 2021-10 | 2026-11 | **62** months × 31 | Exact **0** zeros / 1922 cells; **31** nulls on partial edges (`2021-10` or `2026-11`) |
| Trends **complete** months (metrics) | 2021-11 | 2026-10 | **60** | Partial months dropped for `change_in_window` / `recent_vs_peak` / `change_se` |
| Trends raw timestamps | 2021-10-17 | 2026-11-15 | weekly under `today 5-y` | — |
| YouTube yearly | 2009 → 2026 (+14 unknown-year) | 19 buckets | no year with count 0 |
| Wikipedia months in web JSON | 2015-07 → 2026-10 | 136 | ASMR: zeros 4/3128; nulls 818/3128 (26.2%) — see `docs/WIKI_CHECK.md` / `WIKI_CHECK_2.md` |

**Trends year range (plain):** timeframe **`today 5-y`**; timestamps **2021-10-17 → 2026-11-15**; published window for within-country change metrics **Nov 2021 – Oct 2026**.

### Within-country change metrics (published)

- `change_in_window` = mean(own_peak, 2025-11…2026-10) − mean(own_peak, 2021-11…2022-10)
- `recent_vs_peak` = mean(own_peak, 2025-11…2026-10)
- `change_se` = sqrt(var(first-12)/12 + var(last-12)/12); `within_noise` = |Δ| < 2×SE (see `docs/TRENDS_NOISE.md`)
- 6-month analogs + Spearman 12↔6: change ρ=**0.9226**, recent ρ=**0.8859** (n=31)

### take_off_year (NOT published on web)

Kept only in `data/take_off_sensitivity.csv` with note **`left-censored; not publishable`**. Historically 30/31 countries left-censored at first year of the 5-y window.

---

## 5. Methods

| Metric | Formula / parameters | Implementation |
|--------|----------------------|----------------|
| Primary batch | comparison_group containing `ASMR` + local insomnia keyword | `build_web_data.py:primary_batch_info` |
| `own_peak_series` | monthly ASMR (primary) / max(monthly ASMR) × 100 | `build_trends_v2` |
| `change_in_window` / `recent_vs_peak` | means over first/last 12 complete months | `build_trends_v2` |
| `change_se` / `within_noise` | SE of difference of means; hatch if |Δ| < 2 SE | `build_trends_v2`; Map 1 FE |
| `take_off_year` (archive only) | 12-mo centred rolling; first year mean >50 | `data/take_off_sensitivity.csv` |
| Comment theme share | matching / total per lang×theme; Latin word-boundary; CJK substring; Hangul run-start | `comment_themes.py` + `comment_match.py` |
| Spearman | scipy spearmanr; bootstrap **N=2000**, seed **42** (excl-TWN **43**); Holm on 4 ASMR pairs | `build_insomnia_vs_asmr` |
| Collect-to-like | collected_count / liked_count; median by keyword | `build_douyin_keywords` |
| Duration histogram | shared log bins; sleep vs other via `is_sleep_related` | `build_youtube_yearly` |
| Creator coverage | channels/videos with non-null country | `build_creator_country` |
| Wiki index | per concept×lang views → max=100; take-off trailing-12 >50 | `build_wiki_lang` |

---

## 6. Verification state

### `config/verified_themes.json` (verbatim)

```json
{
  "insomnia": {
    "verified_langs": [
      "zh",
      "ko",
      "en",
      "ja",
      "fr",
      "es"
    ],
    "check": {
      "zh": "n=20, 19 judged relevant",
      "ko": "n=20, 19",
      "en": "n=10, 9",
      "ja": "n=10, 10",
      "fr": "n=10, 8",
      "es": "n=10, 10"
    },
    "caveat": "keyword hits; includes a few sarcastic or joking uses (e.g. 'so good I can't sleep')"
  },
  "gratitude": {
    "verified_langs": [
      "pooled"
    ],
    "check": "n=20, 20/20 judged relevant",
    "caveat": "keyword hits"
  },
  "anxiety_stress": {
    "verified_langs": [
      "pooled"
    ],
    "check": "n=20 pooled, 17/20 judged relevant",
    "caveat": "keyword hits; includes some product names (anti-stress toys) and timestamp noise"
  },
  "sleep_aid_effectiveness": {
    "verified_langs": [
      "pooled"
    ],
    "check": "n=20 pooled, 19/20 judged relevant",
    "caveat": "keyword hits of self-reported falling asleep; includes a few unrelated uses"
  }
}
```

### Manual precision samples

| File | n rows | Result as recorded in repo |
|------|-------:|----------------------------|
| `data/comment_precision_check.csv` | 120 | Structured scores **NOT FOUND** in file; early sample |
| `data/comment_precision_check_2.csv` | 100 | insomnia zh/ko → config `n=20, 19` |
| `data/comment_precision_check_3.csv` | 40 | anxiety 17/20; sleep_aid 19/20 (config) |
| `data/comment_precision_check_4.csv` | 40 | en 9/10, ja 10/10, fr 8/10; es pre-fix not in final config |
| `data/comment_precision_check_5.csv` | 10 | es post-lexicon → config `n=10, 10` |

Judgment columns are **not** stored as a machine-checked table in-repo; results live as config `check` strings.

### `python3 scripts/verify_web_data.py`

**Summary: 59 passed, 0 failed.** Checks: Holm family exactly 4 pairs (`change_vs_*`, `recent_vs_*`); descriptive `internet_vs_youth` outside Holm; no `asmr_share_of_batch` / insomnia / take_off / threshold_disagree in published rows; `change_se` present on trends rows; wiki `low_traffic`; Comments n from CSV; TopoJSON info PASS.

### web/ leak scan

No `commentId` / `authorDisplayName` / `AIza…` / `UC…` patterns in `web/data/*.json`. **PASS.**

### DATA_FREEZE + git

`config/DATA_FREEZE.md` lists all 10 `web/data/` files with sha256. Regenerated with this freeze. Noise report: `docs/TRENDS_NOISE.md`. Wiki robustness: `docs/WIKI_CHECK_2.md`.

---

## 7. Sampling and representativeness

| Chart | Sample is… (from repo caveats/audit) | Cannot show… |
|-------|--------------------------------------|--------------|
| Trends maps | 31 geos × primary-batch relative interest; within_noise hatched; rise/within/fall from `flag_counts` | Absolute volume; independent geos |
| Creators map | Self-declared channel country; **symbols = channel_count** | Audience location; unbiased census |
| TikTok bars | n=168 trial | Global TikTok |
| Scatter / corr | Own-peak change/recent + WB/TW indicators | Causal “who uses ASMR” |
| Duration | Three tag groups; n = full 2×2; histogram excludes invalid duration; medians under three weightings | Content judgement; growth over time; absolute catalogue |
| Wiki | Indexed ASMR pageviews by language edition | Country demand; mainland Chinese interest via zh.wikipedia |
| Douyin | n=528 keyword crawl | Platform-wide Douyin |
| Comments | Top-view sleep+ASMR × relevance comments | Organic language mix; how viewers “feel” |

Keyword lists and sleep-tag match rates: `docs/YOUTUBE_KEYWORDS.md`. Manual title sample for tagging review: `data/yt_sleep_tag_check.csv` (30 videos, ≤3/channel, titles only). Expansion caveat: uploads playlist newest-first, typically ≤100 videos/pass; 95.9% channel-expanded; 60.7% from 2025–26.

---

## 8. Claims audit

Finished step sentences with causal/comparative/ranking language: **none** (all `TODO: my text`). Remaining UI phrases:

| Phrase | Support |
|--------|---------|
| `Change in ASMR search interest, latest 12 months vs first 12 months…` | Definition of `change_in_window` on **own_peak** series — not absolute search volume |
| `Mean ASMR search interest in the latest 12 months…` | Definition of `recent_vs_peak` |
| `Change is within noise (…2 standard errors…; Google Trends is a sample)` | Map 1 hatch legend; SE optimistic under autocorrelation (meta caveat) |
| `not evidence about who uses ASMR` | Explicit disclaimer on scatter |
| `Where channels in our sample say they are based` | Self-declared countryCode |
| `highest-viewed` / relevance ranking (comment meta caveat) | Documented in fetch + caveat |
| `small sample` (Douyin n&lt;30) | Count threshold only |
| Language-edition / Chinese-edition caveats | From `wiki_lang.json` meta (not FE-hardcoded) |
| “young people use ASMR more/less”, “caused”, “leads to”, “fastest”, “highest country” as finished claims | **NOT FOUND** in non-TODO UI strings |
| `take_off` / `Year ASMR searches first passed half…` / share-of-batch ranking copy | **NOT FOUND** on page (removed) |

---

## 9. Accessibility and mobile

| Item | In repo |
|------|---------|
| Skip link | `web/index.html` L13 |
| `prefers-reduced-motion` | `web/css/styles.css`; `util.js` `prefersReducedMotion()`; play delay slower when reduced |
| Scrubber | `aria-label`, `aria-readonly="false"` |
| Mobile CSS | `@media (max-width: 800px)` stage max-height in `styles.css` |
| Formal a11y / mobile QA log | **NOT FOUND** |
| Page weight | `du`: `web/` **~1.7M**; `web/data` **~1.6M** (wiki_lang ~742K + countries-50m ~739K) |

---

## 10. Open items

- **TODO placeholders:** 28× `TODO: my text` in `web/index.html` (hero, all steps, footer).
- **FIXME in project code (excl. vendor):** NOT FOUND in `web/`.
- **Flags / exclusions:** `WEB_EXCLUDE_THEMES = {loneliness, companionship_care}`; take_off kept only in sensitivity CSV; share/insomnia unpublished.
- **Archived (not in `web/data/`):** `data/archive_not_published/{trends_country,trends_monthly,insomnia_vs_asmr_raw_mean}.json`.
- **External CDN:** Google Fonts CSS URLs unpinned; unpkg scripts pinned (`d3@7.9.0`, `topojson-client@3.1.0`, `scrollama@3.2.0`, `gsap@3.12.5`).
- **Remaining caveats:** Douyin n&lt;30 grey rule and duration 1h/8h markers still hardcoded; wiki `article_created` empty for ASMR titles; YouTube sample heavily 2025–26 / channel-expanded (`docs/YOUTUBE_SAMPLE_CHECK.md`); Trends SE optimistic under autocorrelation (`docs/TRENDS_NOISE.md`).
- **Removed:** `SHARE_CAVEAT`; duration chart uses three tag groups with toggles.
- **Resolved in this pass:** Map 1 `within_noise` hatch + legend; wiki Chinese-edition / own-max caveats in build meta; `docs/TRENDS_NOISE.md` + `docs/WIKI_CHECK_2.md`; overview regenerated without take_off page-map claims.

---

## 10-line summary

1. Unsure: how reviewers will interpret `change_in_window` when many countries are within_noise (optimistic SE).  
2. Unsure: precision judgments only as config strings, not a checkable judgments table.  
3. Unsure: TikTok/Douyin trial ethics/coverage beyond caveats.  
4. Unsure: a11y/mobile beyond skip-link + reduced-motion (no formal audit file).  
5. Unsure: wiki nulls before first data month without `article_created` timestamps; spike-flagged editions.  
6. Check first: `change_in_window` / `within_noise` / `change_se` vs own_peak complete months (`docs/TRENDS_NOISE.md`).  
7. Check first: comment n=85224 and theme shares vs CSV.  
8. Check first: Spearman/Holm 4-pair tables ±TWN (no share pairs).  
9. Check first: creator coverage 68.5%/77.4% and Chinese query 311/400.  
10. Check first: DATA_FREEZE hashes vs current `web/data/` after this rebuild.
