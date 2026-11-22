# Google Trends noise marking (Map 1)

Computed from `web/data/trends_country_v2.json` and `web/data/trends_monthly_v2.json` after rebuild. Raw Trends CSVs were not modified.

## Definition

- `change_se = sqrt(var(first-12-month monthly own_peak)/12 + var(last-12-month)/12)`
- `within_noise = |change_in_window| < 2 × change_se`
- Map 1 hatches `within_noise` countries when the metric is `change_in_window`.
- Caveat (in JSON meta): "Monthly values are autocorrelated, so standard errors are optimistic."

## Country counts (n = 31)

| Category | Count |
|----------|------:|
| Rising beyond noise (`change_in_window > 0` and not `within_noise`) | 19 |
| Within noise | 10 |
| Falling beyond noise (`change_in_window < 0` and not `within_noise`) | 2 |

ISO3 rising beyond noise: ARG, BRA, CAN, CHL, DEU, HKG, IND, JPN, KOR, MEX, NGA, NLD, POL, RUS, SGP, SWE, TUR, USA, VNM

ISO3 within noise: AUS, BEL, GBR, IDN, ITA, PHL, PRT, THA, TWN, ZAF

ISO3 falling beyond noise: ESP, FRA

## Detail: NGA, JPN, and the five lowest-|change| countries

Monthly SD and distinct-value count use the **60 complete months** (2021-11…2026-10). Few distinct monthly values suggest a coarse / quantized series.

| iso3 | change_in_window | change_se | within_noise | monthly SD (60) | n distinct monthly values (60) | mean first-12 | mean last-12 |
|------|----------------:|----------:|:------------:|----------------:|-------------------------------:|--------------:|-------------:|
| NGA | 45.8889 | 4.0200 | false | 18.5298 | 20 | 36.1111 | 82.0000 |
| JPN | 36.8080 | 1.8058 | false | 16.0602 | 48 | 54.7929 | 91.6009 |
| ITA | 1.0954 | 2.6557 | true | 6.1384 | 27 | 84.8153 | 85.9107 |
| PHL | 1.1966 | 2.5030 | true | 8.2047 | 19 | 74.8718 | 76.0684 |
| THA | 1.6667 | 3.8161 | true | 8.5986 | 5 | 71.6667 | 73.3333 |
| AUS | -2.8333 | 1.7820 | true | 4.2213 | 7 | 83.5833 | 80.7500 |
| PRT | 3.6559 | 3.9791 | true | 8.7767 | 20 | 80.0538 | 83.7097 |

## Sign test (report only — not on the page)

26 of 31 countries have `change_in_window > 0`. Two-sided binomial sign test under H0: P(+)=1/2: **p = 1.921952e-04** (exact).

Note: country geos are **not independent** (shared Trends sampling, linked media markets, common keywords), so this p-value is descriptive only and should not be read as a confirmatory test of a global rise.

