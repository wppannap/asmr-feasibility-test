# Wikipedia diagnostics (ASMR concept)

Computed from `data/wiki_pageviews_monthly.csv`, `data/wiki_concept_titles.csv`, `fetch_wiki_pageviews.py`, and rebuilt `web/data/wiki_lang.json`. Raw CSVs were not modified.

## (a) Agent filter and access types

From `fetch_wiki_pageviews.py`:

- Pageviews URL path uses **`agent=user`** (human traffic only), e.g.  
  `…/pageviews/per-article/{project}/{access}/user/{article}/monthly/…`
- Access types fetched: **`desktop`**, **`mobile-web`**, **`mobile-app`** (`ACCESS_TYPES`), plus a stored rollup **`access=all`** (= sum of the three).
- Custom `User-Agent` header: `ASMR-DataStory/1.0 (university course project; contact: …)` (email in script; not repeated here).

`build_wiki_lang()` now indexes **`access=all` only** (avoids double-counting if desktop+mobile+all were summed).

## (b) Why ~26% of ASMR × language × month cells are null

Web grid: **23** language editions × **136** months (2015-07…2026-10) = **3128** cells.

| Category | Count | Share of cells |
|----------|------:|---------------:|
| Null (no indexed value) | 818 | 26.15% |
| Indexed zero (ok row, 0 views → index 0) | 4 | 0.13% |
| Indexed positive | 2306 | 73.72% |

Among the **818 nulls** (cross-check against raw `access=all` rows for concept ASMR):

| Reason | Count | Notes |
|--------|------:|-------|
| No CSV row before that language’s first month with data | 748 | Treated as **article not yet present / not yet returning pageviews** in this harvest |
| No CSV row after first data month (gap) | 70 | **API returned nothing / not stored** for that month (no `not_yet_created` / `no_data` status rows for ASMR in raw — ASMR `access=all` statuses are 100% `ok` where present) |
| Status `not_yet_created` | 0 | Not present for ASMR in raw |
| Status `no_data` / `request_failed` / `host_unavailable` | 0 | Not present for ASMR in raw |
| Status `zero` (non-ok) | 0 | Not present for ASMR in raw |

`wiki_concept_titles.csv` has **`article_created` empty for all 24 ASMR title rows** → cannot date-stamp creation from that column (**NOT FOUND**).

Zero-view months that *are* stored as `status=ok` with `views=0` appear as index **0**, not null (4 cells).

## (c) Total views over the whole period (ASMR, access=all, status=ok)

| lang | total_views |
|------|------------:|
| en | 7,554,972 |
| es | 3,320,450 |
| de | 2,464,340 |
| ja | 2,307,072 |
| ru | 2,162,241 |
| fr | 1,295,076 |
| it | 1,082,901 |
| pt | 874,104 |
| ko | 647,421 |
| pl | 463,284 |
| zh | 429,765 |
| tr | 307,404 |
| ar | 245,418 |
| nl | 172,344 |
| sv | 147,105 |
| he | 116,298 |
| cs | 90,846 |
| vi | 69,431 |
| id | 52,686 |
| uk | 37,845 |
| ms | 28,560 |
| hi | 19,194 |
| th | 3,171 |

(Values from `wiki_lang.json` → `total_views.ASMR`.)

## (d) `low_traffic` flag

- Rule: language editions with total ASMR views **below the 25th percentile** of the 23 totals.
- p25 = **69,431** (`meta.low_traffic_total_views_p25`).
- Flagged langs: **`hi`, `id`, `ms`, `th`, `uk`, `vi`** (`low_traffic.ASMR`).
- Front end greys those small multiples and shows:  
  `low traffic: index may exaggerate small changes`.

## (e) Indexed take-off (trailing 12-month mean > 50% of own max)

From `indexed_takeoff.ASMR` (on the 0–100 indexed series):

| lang | first month trailing-12 mean > 50 | within first 12 data months? |
|------|-----------------------------------|------------------------------|
| ar | 2021-01 | no |
| cs | 2021-04 | **yes (left-censored)** |
| de | 2018-04 | no |
| en | 2021-02 | no |
| es | 2019-01 | no |
| fr | 2018-01 | no |
| he | 2019-08 | **yes** |
| hi | 2024-05 | **yes** |
| id | 2019-12 | **yes** |
| it | 2018-05 | no |
| ja | 2020-03 | no |
| ko | 2019-03 | no |
| ms | 2024-04 | no |
| nl | 2018-12 | **yes** |
| pl | 2019-04 | no |
| pt | 2021-02 | no |
| ru | 2016-10 | no |
| sv | 2018-10 | no |
| th | 2026-09 | **yes** |
| tr | 2024-04 | no |
| uk | 2024-04 | **yes** |
| vi | 2022-01 | no |
| zh | **never** | — |

Left-censored (7): cs, he, hi, id, nl, th, uk. Never exceeds 50: **zh**.
