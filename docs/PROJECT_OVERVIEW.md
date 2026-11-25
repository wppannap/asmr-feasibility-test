# ASMR · sleep — project overview for external review

Everything below is computed or quoted from this repo. Missing facts: **NOT FOUND**. No raw comments, author names, channel ids, or API keys.

Git branch: `main`. Freeze hashes: `config/DATA_FREEZE.md`. Live site: https://wppannap.github.io/asmr-feasibility-test/

---

## 1. Page map

Scroll order from `web/index.html`. **Published** FE loads (`web/js/sections.js` → `ENABLED_DATA`): `countries-50m.json`, `trends_country_v3c.json`, `trends_monthly_v3c.json`, `correlations_v3c.json`, `scatter_points_v3c.json`, `wiki_lang.json`, `yt_creators.json`, `yt_duration.json`, `yt_upload_clock.json`.

Hidden section HTML for remaining charts lives under `src_hidden/sections_hidden/` (outside `web/`, not deployed). Douyin / comment / other unpublished payloads stay under `data/unpublished/` (gitignored).

| # | id | Chart | Data | Status | Default |
|---|-----|-------|------|--------|---------|
| 0 | `top` | none | — | published | hero + waveform |
| 1 | `scrolly-1` | choropleth + legend/caption/notes | trends_country_v3c, topo | **published** | growth_ratio_clipped colour; MK hatch |
| 2 | `scrolly-2` | monthly choropleth | trends_monthly_v3c | **published** | own_peak_asmr scrubber |
| 3 | `scrolly-9` | upload clock (night shift) | yt_upload_clock | **published** | radial night clocks JP/KR/TW/HK |
| 4 | `scrolly-5` | duration (till dawn) | yt_duration | **published** | audio-track densities |
| 5 | `scrolly-3` | creators | yt_creators | **published** | declared country |
| 6 | `scrolly-4` + `scrolly-6` | explore layer | correlations + wiki | **published** | scatter then wiki |
| — | `scrolly-7` / `scrolly-8` | Douyin / comments | unpublished | **hidden** | — |

### Visible claim-like strings (verbatim)

**`web/index.html`**
- Brand / title: `ASMR · sleep`
- Placeholders: `TODO: my text` (hero, steps, footer) — do not replace without author copy
- Nav: Top, Map 1, Map 2, Creators, Scatter, Duration, Wiki, Upload clock
- Map 1 caption/legend from JSON; Notes and limits in `<details>` (open desktop / closed ≤820px)
- Caveat slots `#caveat-*` filled from JSON `meta.caveats`

**JS**
- Growth colour domain −50% … +150% (clipped for colour only)
- Legend: ramp / solid significant / hatch flat / dotted low-volume / plain no-data (incl. mainland China) / dotted outline small base
- Scatter: `A question with no clear answer`; frame labels use “measured” not “ok”
- Wiki: each language indexed to own max = 100

No finished key-findings prose.

---

## 2. Numbers on the page

| Visible / meta number | Source | Value now |
|-----------------------|--------|-----------|
| Measured / too few / no data / small base | `trends_country_v3c.meta.counts` + caption | **103** / **97** / **30** / **10** |
| Rising / flat / falling | `counts_by_mk_class` | **74** / **26** / **3** |
| Median growth (IQR) | `growth_ratio_ok` | **25.4%** (9.6%–43.0%) |
| Strict-ok | `counts.strict_ok` | **82** |
| Small-base threshold | `config/trends_display.yaml` / payload meta | mean_first_12 &lt; **15** (`small_base` count **10**) |
| Correlation n (measured · with TWN) | `correlations_v3c` | **103**; Holm p ≈ 0.42 both pairs |
| Wiki concepts | `wiki_lang` | `["ASMR"]`; 23 languages |
| Wiki low_traffic | `meta.low_traffic_languages_asmr` | hi, id, ms, th, uk, vi |

YouTube creators / duration / upload-clock charts are **published** (review-gated). Douyin / TikTok / comment headline numbers remain off the page.

---

## 3. Data inventory

### Raw sources (local `/data/`, gitignored)

| Source | Role |
|--------|------|
| Trends timeseries + batches | Country monthly ASMR interest → v3c builders |
| World Bank / Taiwan official pops | Pop gate (≥1M) for measured quality |
| `indicators_country_v3.csv` | Internet % / youth share for correlations |
| `wiki_pageviews_monthly.csv` | ASMR-only via `config/wiki_concepts.yaml` |
| `yt_master` + `yt_classes_v32.csv` | Classification / explore (unpublished charts) |
| Comment sample plan v2 (900) + comments | Theme shares under v3.2 membership |

### Published `web/data/`

| File | Role |
|------|------|
| `trends_country_v3c.json` | Map 1 rows + caption/legend/meta |
| `trends_monthly_v3c.json` | Map 2 series (measured geos) |
| `correlations_v3c.json` | Association frames + scatter points |
| `wiki_lang.json` | Wiki small multiples |
| `yt_creators.json` | Creators by declared country |
| `yt_duration.json` | Duration densities + ratios |
| `yt_upload_clock.json` | Upload-hour radials JP/KR/TW/HK |
| `countries-50m.json` | world-atlas TopoJSON |

Hashes: `config/DATA_FREEZE.md`.

---

## 4. Methods (short)

- **Growth:** mean(latest 12 months) / mean(first 12 months) − 1; colour uses clipped ratio ∈ [−0.5, 1.5].
- **MK class:** Mann–Kendall on monthly series; Benjamini–Hochberg q = 0.05 → rising / flat / falling.
- **Quality:** measured vs too few searches vs no data; pop gate downgrades &lt;1M (or unknown) to too few searches; mainland China not measured.
- **Small base:** among measured, mean_first_12 &lt; threshold (15) → unstable ratio outline (`counts.small_base` = 10).
- **Correlations:** Spearman ± Holm (2 pairs); partial controls for noise.
- **Classes v3.2:** white-noise family strict vs title_only; nature title-only + inflections; script groups from title.

---

## 5. Front-end layout notes

- Desktop: sticky stage beside steps; chart stages size to content (no forced 72vh min-height).
- Mobile (≤820px): stage in normal flow; legend / caption / notes below map; notes `<details>` closed; chart roots (scrolly-3/4/5/6/9) flow with the page (no 45vh inner scroll cage).
- Night theme tokens in `web/css/theme.css`; charts read colours via `getComputedStyle`.
- Layout regression: `scripts/layout_screenshot_test.py` (Playwright).

---

## 6. Verification / publish gate

1. `python3 scripts/verify_web_data.py` → 0 failed  
2. Leak scan on `web/` (no Google API key prefixes, comment text, channel ids)  
3. Regenerate `config/DATA_FREEZE.md`  
4. Commit scripts/config/docs/web only; push `origin main` (no force)  
5. Confirm Pages 200s for HTML + fetched assets  

---

## 7. Open items

1. Human review for remaining `UNSET` rows in `config/review_log.csv`  
2. Douyin / comments / other modules stay hidden until review  
3. Author story copy for `TODO: my text`  
4. Wiki timeline decision  

See also `docs/HANDOFF.md`.
