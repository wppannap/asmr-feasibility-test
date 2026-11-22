# Wikipedia robustness check 2

Report only (does not change raw CSVs or published chart geometry). Computed from `data/wiki_pageviews_monthly.csv` and `web/data/wiki_lang.json`.

## (a) Interior gap months (n = 70)

Same definition as `docs/WIKI_CHECK.md`: months with **no CSV row after that language’s first data month** through the end of the shared month grid (2015-07…2026-10 for the web payload). Of these 70, **47** lie strictly between the first and last observed months; **23** are trailing months after the last stored row.

Compare each gap’s neighbouring months to that language’s **typical mean monthly views** (mean of stored `access=all` months). Wikimedia omits zero-view months from API responses (§d), so absent months are expected to behave like zeros unless neighbours show high traffic.

| lang | gap month | prev month | prev views | next month | next views | typical mean monthly views | assessment |
|------|-----------|------------|-----------:|------------|-----------:|---------------------------:|------------|
| ar | 2026-10 | 2026-09 | 127 |  |  | 1073.3 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| cs | 2026-10 | 2026-09 | 401 |  |  | 1426.9 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| de | 2026-10 | 2026-09 | 5163 |  |  | 18254.4 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| en | 2026-10 | 2026-09 | 40870 |  |  | 55962.8 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| es | 2026-10 | 2026-09 | 2492 |  |  | 24595.9 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| fr | 2026-10 | 2026-09 | 2419 |  |  | 11658.8 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| he | 2026-10 | 2026-09 | 268 |  |  | 1155.9 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| hi | 2026-10 | 2026-09 | 20 |  |  | 43.0 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| id | 2026-10 | 2026-09 | 44 |  |  | 440.4 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| it | 2026-10 | 2026-09 | 1103 |  |  | 6849.2 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| ja | 2026-10 | 2026-09 | 8392 |  |  | 17089.4 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| ko | 2015-11 | 2015-10 | 3 | 2015-12 |  | 3429.8 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| ko | 2015-12 | 2015-11 |  | 2016-01 | 697 | 3429.8 | plausible zero-ish month (neighbours well below typical) |
| ko | 2026-10 | 2026-09 | 240 |  |  | 3429.8 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| ms | 2026-10 | 2026-09 | 27 |  |  | 158.5 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| nl | 2026-10 | 2026-09 | 487 |  |  | 2593.9 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| pl | 2026-10 | 2026-09 | 967 |  |  | 7032.6 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| pt | 2015-09 | 2015-08 | 26 | 2015-10 |  | 1942.8 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| pt | 2015-10 | 2015-09 |  | 2015-11 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2015-11 | 2015-10 |  | 2015-12 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2015-12 | 2015-11 |  | 2016-01 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-01 | 2015-12 |  | 2016-02 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-02 | 2016-01 |  | 2016-03 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-03 | 2016-02 |  | 2016-04 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-04 | 2016-03 |  | 2016-05 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-05 | 2016-04 |  | 2016-06 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-06 | 2016-05 |  | 2016-07 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-07 | 2016-06 |  | 2016-08 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-08 | 2016-07 |  | 2016-09 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-09 | 2016-08 |  | 2016-10 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-10 | 2016-09 |  | 2016-11 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-11 | 2016-10 |  | 2016-12 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2016-12 | 2016-11 |  | 2017-01 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-01 | 2016-12 |  | 2017-02 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-02 | 2017-01 |  | 2017-03 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-03 | 2017-02 |  | 2017-04 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-04 | 2017-03 |  | 2017-05 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-05 | 2017-04 |  | 2017-06 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-06 | 2017-05 |  | 2017-07 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-07 | 2017-06 |  | 2017-08 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-08 | 2017-07 |  | 2017-09 |  | 1942.8 | likely API-omitted zero (both neighbours also absent) |
| pt | 2017-09 | 2017-08 |  | 2017-10 | 26 | 1942.8 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| pt | 2026-10 | 2026-09 | 605 |  |  | 1942.8 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| ru | 2026-10 | 2026-09 | 3811 |  |  | 16016.6 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| sv | 2026-10 | 2026-09 | 215 |  |  | 2075.6 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| th | 2025-02 | 2025-01 | 1 | 2025-03 |  | 3.3 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| th | 2025-03 | 2025-02 |  | 2025-04 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-04 | 2025-03 |  | 2025-05 | 0 | 3.3 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| th | 2025-06 | 2025-05 | 0 | 2025-07 |  | 3.3 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| th | 2025-07 | 2025-06 |  | 2025-08 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-08 | 2025-07 |  | 2025-09 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-09 | 2025-08 |  | 2025-10 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-10 | 2025-09 |  | 2025-11 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-11 | 2025-10 |  | 2025-12 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2025-12 | 2025-11 |  | 2026-01 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-01 | 2025-12 |  | 2026-02 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-02 | 2026-01 |  | 2026-03 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-03 | 2026-02 |  | 2026-04 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-04 | 2026-03 |  | 2026-05 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-05 | 2026-04 |  | 2026-06 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-06 | 2026-05 |  | 2026-07 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-07 | 2026-06 |  | 2026-08 |  | 3.3 | likely API-omitted zero (both neighbours also absent) |
| th | 2026-08 | 2026-07 |  | 2026-09 | 9 | 3.3 | gap beside non-trivial traffic — still compatible with API zero-omission, but inspect |
| th | 2026-10 | 2026-09 | 9 |  |  | 3.3 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| tr | 2026-10 | 2026-09 | 268 |  |  | 1090.6 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| uk | 2026-10 | 2026-09 | 379 |  |  | 1454.0 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| vi | 2026-10 | 2026-09 | 190 |  |  | 706.2 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |
| zh | 2015-11 | 2015-10 | 1 | 2015-12 |  | 253.7 | looks like true zero / near-zero (neighbours tiny vs typical monthly views) |
| zh | 2015-12 | 2015-11 |  | 2016-01 | 37 | 253.7 | plausible zero-ish month (neighbours well below typical) |
| zh | 2026-10 | 2026-09 | 0 |  |  | 253.7 | trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole) |

Assessment summary:
- 37× likely API-omitted zero (both neighbours also absent)
- 23× trailing after last stored month (often incomplete recent harvest; treat as missing, not a mid-series hole)
- 7× looks like true zero / near-zero (neighbours tiny vs typical monthly views)
- 2× plausible zero-ish month (neighbours well below typical)
- 1× gap beside non-trivial traffic — still compatible with API zero-omission, but inspect

**Verdict:** mid-series holes (chiefly **pt**, **th**, plus a few early **ko**/**zh** months) sit next to missing or very small neighbour counts relative to each language’s typical traffic, so they **look like true zero-view months** (API-omitted zeros). Trailing gaps after the last stored month are harvest/coverage edges, not evidence of dropped high-traffic months.

## (b) Take-off months at 30% / 50% / 70% of own max (13 languages)

Set: non-`low_traffic`, not `left_censored` under the 50% rule, and with a finite 50% take-off — **ar, de, en, es, fr, it, ja, ko, pl, pt, ru, sv, tr** (n=13). Method matches `build_wiki_lang`: trailing 12-month mean of the indexed ASMR series (`rolling(12, min_periods=1)`), first month exceeding the threshold.

| lang | first month trail-12 > 30% | > 50% | > 70% |
|------|---------------------------:|------:|------:|
| ar | 2019-12 | 2021-01 | never |
| de | 2016-12 | 2018-04 | 2018-11 |
| en | 2020-10 | 2021-02 | 2021-08 |
| es | 2018-04 | 2019-01 | never |
| fr | 2015-10 | 2018-01 | 2018-12 |
| it | 2017-06 | 2018-05 | 2019-04 |
| ja | 2019-12 | 2020-03 | never |
| ko | 2018-12 | 2019-03 | never |
| pl | 2017-08 | 2019-04 | never |
| pt | 2020-11 | 2021-02 | 2021-05 |
| ru | 2015-10 | 2016-10 | 2018-06 |
| sv | 2016-12 | 2018-10 | never |
| tr | 2023-04 | 2024-04 | never |

Spearman rank correlation of those dates (pairwise complete observations):

| pair | n | Spearman ρ |
|------|--:|-----------:|
| 30 vs 50 | 13 | 0.9696 |
| 50 vs 70 | 6 | 0.9276 |
| 30 vs 70 | 6 | 0.8407 |

## (c) Own-max month vs surrounding ±6 months

For every language in `wiki_lang.json` series ASMR: month of own max (indexed = 100), and ratio of that month’s value to the mean of surrounding ±6 months (excluding the max month). Flag if ratio > 2 as **max may be a spike**.

| lang | max month | max indexed | mean ±6 (excl. max) | n surround | ratio | flag |
|------|-----------|------------:|--------------------:|-----------:|------:|------|
| ar | 2022-05 | 100.00 | 63.31 | 12 | 1.58 |  |
| cs | 2024-01 | 100.00 | 76.96 | 12 | 1.30 |  |
| de | 2018-10 | 100.00 | 73.11 | 12 | 1.37 |  |
| en | 2021-08 | 100.00 | 67.76 | 12 | 1.48 |  |
| es | 2019-05 | 100.00 | 56.74 | 12 | 1.76 |  |
| fr | 2019-04 | 100.00 | 80.01 | 12 | 1.25 |  |
| he | 2019-08 | 100.00 | 38.24 | 10 | 2.61 | max may be a spike |
| hi | 2024-06 | 100.00 | 57.93 | 9 | 1.73 |  |
| id | 2020-08 | 100.00 | 63.91 | 12 | 1.56 |  |
| it | 2018-08 | 100.00 | 64.29 | 12 | 1.56 |  |
| ja | 2020-05 | 100.00 | 63.64 | 12 | 1.57 |  |
| ko | 2019-02 | 100.00 | 62.13 | 12 | 1.61 |  |
| ms | 2023-08 | 100.00 | 39.77 | 12 | 2.51 | max may be a spike |
| nl | 2018-10 | 100.00 | 50.31 | 9 | 1.99 |  |
| pl | 2016-12 | 100.00 | 21.46 | 12 | 4.66 | max may be a spike |
| pt | 2020-08 | 100.00 | 44.63 | 12 | 2.24 | max may be a spike |
| ru | 2018-08 | 100.00 | 85.83 | 12 | 1.17 |  |
| sv | 2017-01 | 100.00 | 38.10 | 12 | 2.62 | max may be a spike |
| th | 2026-09 | 100.00 |  | 0 |  |  |
| tr | 2024-03 | 100.00 | 48.37 | 12 | 2.07 | max may be a spike |
| uk | 2025-01 | 100.00 | 64.01 | 12 | 1.56 |  |
| vi | 2022-01 | 100.00 | 48.05 | 12 | 2.08 | max may be a spike |
| zh | 2024-03 | 100.00 | 18.52 | 12 | 5.40 | max may be a spike |

Flagged (**max may be a spike**): he, ms, pl, pt, sv, tr, vi, zh.

## (d) Does the API omit zero-view months?

**Yes.** Official Wikimedia Analytics API troubleshooting docs:

> Because of the same caveat (404 means zero or not loaded), zero values are omitted from API responses. This means that, if you request a time series from the API, there may be gaps in the time series in the response.

Source: [Troubleshooting · Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/troubleshooting.html) (“Missing values within time series”).

Wikitech Pageviews gotchas state the same: if you request a timeseries, you may get no data for dates with 0 pageviews and must fill missing zeros ([Analytics/AQS/Pageviews](https://wikitech.wikimedia.org/wiki/Analytics/AQS/Pageviews)).

This harvest stores only months the API returned (`status=ok`); omitted months appear as nulls in `wiki_lang.json`, not as explicit zeros (except rare returned `views=0`).

