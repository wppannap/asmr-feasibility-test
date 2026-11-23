# Handoff — ASMR · sleep (public-safe)

Paste this into a new chat to resume. No privacy incident log; no raw rows or credentials.

## Scope

Public site is **aggregated Google Trends + indicators + Wikipedia ASMR pageviews** for human-performed ASMR interest. YouTube / Douyin / TikTok / comment charts stay **unpublished** until review gates clear. Keep every `TODO: my text` untouched; do not invent story copy.

## Published sections

Controlled by `ENABLED_SECTIONS` in `web/js/sections.js`:

| id | Content | Status |
|----|---------|--------|
| `top` | Hero | published |
| `scrolly-1` | Map 1 — ASMR search growth (v3c) | published |
| `scrolly-2` | Map 2 — monthly own-peak time-lapse | published |
| `scrolly-4` | Association table + scatter | published |
| `scrolly-6` | Wiki ASMR language small multiples | published |
| `scrolly-3/5/7/8`, creator layer | Duration / comments / Douyin / extras | **hidden** — HTML in `src_hidden/sections_hidden/` (not under `web/`) |

Re-enable: copy fragment into `web/index.html` + add id to `ENABLED_SECTIONS` (see `src_hidden/sections_hidden/README.md`).

## Pipeline (order)

1. `scripts/build_trends_v3c.py` (+ pop gate in `trends_pop_gate.py`) → `data/unpublished/v3/trends_*_v3c.json`
2. `scripts/trends_v3_trend.py` → `docs/TRENDS_V3_TREND.md` (canonical strict_ok)
3. `scripts/publish_trends_v3c_web.py` → `web/data/trends_country_v3c.json`, `trends_monthly_v3c.json`, `correlations_v3c.json`
4. Wiki: `scripts/build_web_data.py` (ASMR-only via `config/wiki_concepts.yaml`) → `web/data/wiki_lang.json`
5. Classes (local): `scripts/classify_yt_classes_v32.py` → `data/yt_classes_v32.csv` + `docs/CLASS_RULES_V32.md`
6. Explore (local): `scripts/explore_yt_v3_5.py` → `docs/YT_EXPLORE_5.md`
7. Gate: `python3 scripts/verify_web_data.py` (0 failed) + web leak scan; regenerate `config/DATA_FREEZE.md`
8. Layout check (optional): `python3 scripts/layout_screenshot_test.py` → `docs/screens/` (gitignored)
9. Commit scripts/config/docs/web only (no `data/*.csv`); push `origin main`

## Final Trends numbers (from `web/data/trends_country_v3c.json`)

- Measured (quality ok): **103**; too few searches: **97**; no data: **30** (29 not_in_v3 + mainland China); **China not measured**
- Among measured: rising **74**, no significant trend **26**, falling **3** (Mann–Kendall, BH q = 0.05)
- Median growth **25.4%** (IQR **9.6%** to **43.0%**); Small base (mean first-12 &lt; 10): **6**
- Strict-ok (additional criteria): **82**
- Caption / legend copy live in JSON `meta.map1_caption` / `meta.map1_legend` (no visible word “ok”)

## Correlation results (`web/data/correlations_v3c.json`)

Frame `ok_with_TWN` raw Spearman (Holm over 2 pairs):

| pair | n | ρ | p | p_holm |
|------|--:|--:|--:|-------:|
| growth_vs_internet | 103 | −0.124 | 0.212 | 0.425 |
| growth_vs_youth | 103 | 0.093 | 0.351 | 0.425 |

Same pairs exist for `ok_excl_TWN`, `strict_ok_with_TWN`, `strict_ok_excl_TWN` (partial-noise block too). Not evidence about who uses ASMR; Trends levels are not cross-country comparable.

## Wikipedia caveats

- Access = all (API `agent=user` rollup); not re-summed by device.
- Each language indexed to its own max = 100 — not absolute cross-language traffic.
- Language edition ≠ country; do not map onto choropleths.
- Chinese Wikipedia is not accessible from mainland China — does not measure mainland interest.
- Low-traffic ASMR editions (p25): **hi, id, ms, th, uk, vi**. Published concepts: **ASMR only**.

## Classification v3.2 (rules + counts)

See `docs/CLASS_RULES_V32.md` / `config/yt_classes_v32.yaml`.

- White-noise family: **strict** = anywhere → ambient; **title_only** = title only (tag-only → `ambient_tag_only`).
- Other strong ambient still anywhere under both rules; nature remains title-only + v3.2 inflections.
- Script groups from title (Korean / Japanese / Han / Latin / other); do not use da/tl/und.
- Counts: strict asmr_labelled **148569**; title_only **151626**; ambient_tag_only **3057**.

## YouTube robustness (`docs/YT_EXPLORE_5.md`)

| result | group | verdict |
|--------|-------|---------|
| duration_sleep_gt_not | Korean / Japanese / Han / Latin | **robust** |
| upload_night_sleep_gt_not | KR, TW, HK | **robust** |
| upload_night_sleep_gt_not | JP | **sensitive** (rule-dependent) |
| comments_theme_shares | all | report-only |

## Comments sample membership (900-plan × v3.2)

Of the 900-video comment sample, videos kept = `asmr_labelled` ∧ ¬long_B ∧ `sleep_title`:

**strict: 241 / 900**

| script × stratum | n |
|------------------|---:|
| Han × random | 8 |
| Han × top_view | 25 |
| Japanese × random | 13 |
| Japanese × top_view | 46 |
| Korean × random | 9 |
| Korean × top_view | 30 |
| Latin × random | 29 |
| Latin × top_view | 81 |
| **TOTAL** | **241** |

**title_only: 244 / 900**

| script × stratum | n |
|------------------|---:|
| Han × random | 8 |
| Han × top_view | 26 |
| Japanese × random | 13 |
| Japanese × top_view | 46 |
| Korean × random | 10 |
| Korean × top_view | 31 |
| Latin × random | 29 |
| Latin × top_view | 81 |
| **TOTAL** | **244** |

(+3 vs strict from ambient_tag_only / rule difference on Korean and Han top_view).

## `config/review_log.csv` summary

| reviewed_by | files |
|-------------|-------|
| **AI-assisted** | class_check_v3_* (ambient, nonlatin_nature, longB, sleep_title, A); lang_check_extra; class_check_v31_* (rain_word, vacuum, heartbeat) |
| **UNSET** | older comment_precision_check_*; class_check_human / ambient_labelled / noise / other; class_check_v2_*; sleep_strict_check; lang_check.csv |
| **human** | (none yet) |

Do not mark AI judgments as `human`. Enabling a YouTube chart blocked by UNSET must fail closed.

## Open items (order)

1. Human review of remaining `UNSET` class/lang/comment checks; fill `review_log.csv`.
2. Optional: publish YouTube chart modules (`web/js/charts_yt/*` + `data/unpublished/web_ready/`) — **not** in `ENABLED_SECTIONS` until reviewed.
3. Re-enable hidden scrolly sections only after payloads + review labels are ready.
4. Wikipedia timeline decision after `docs/WIKI_CHECK_2.md` review.
5. Story / step copy (replace `TODO: my text` only when the human author writes it).

## How to resume (paste into a new chat)

```
Repo: asmr-feasibility-test. Push rules apply (scripts/config/docs/web only; no data/*.csv).
Keep every "TODO: my text"; write no story text. AI judgments → reviewed_by=AI-assisted.
Live: https://wppannap.github.io/asmr-feasibility-test/
Read docs/HANDOFF.md + docs/PROJECT_OVERVIEW.md + config/DATA_FREEZE.md.
Published: Map1/Map2/Association/Wiki (Trends v3c). Hidden HTML: src_hidden/sections_hidden/.
Next: <describe the next task>.
```
