# Trends v3 vs v2

| | **v2 (published)** | **v3 (unpublished)** |
| --- | --- | --- |
| Source CSV | `data/trends_timeseries.csv` | `data/trends_asmr_all_geos.csv` |
| Keyword(s) | Primary multi-term batch (ASMR + insomnia peers); see `config/trends_batches.csv` | **ASMR only** (Latin-script) |
| Timeframe | Mostly `today 5-y` at fetch time | Fixed `2021-11-01 2026-10-31` |
| Geos | 31 | Up to all map geos except CN / KP / Antarctica (~229 planned). **2026-11-23:** fetch complete — **229** `ok` in `trends_fetch_log.csv`; `build_trends_v3` on CSV (**199** geos) → **104** `ok`, **95** `low_volume`, **0** `no_data` |
| Granularity | Weekly IOT → monthly mean | Same (weekly → monthly mean) |
| Own-peak | ASMR monthly ÷ country max × 100 from primary batch | Same formula on ASMR-only series |
| Windows | `WINDOW_FIRST_12` / `WINDOW_RECENT_12` (and 6m) in `build_trends_v2` | **Identical** (`scripts/build_web_data.py` L134–138, L338–621) |
| Noise | `change_se`, `within_noise` (\|Δ\| < 2 SE) | Identical |
| Quality | `flag_low_volume` only (>50% months at 0) | + `quality`: `no_data` / `low_volume` / `ok` (also `<10` distinct weekly values) |
| Outputs | `web/data/trends_*_v2.json` | `data/unpublished/v3/trends_*_v3.json` only |
| Correlations | `web/data/insomnia_vs_asmr.json` (Holm ×4 on published 31) | `data/unpublished/v3/insomnia_vs_asmr_v3.json` (Holm ×4 twice: ok-only and all-with-data; ±TWN) |

**Do not publish v3** until coverage and quality review are done. Live site stays on v2 payloads.

## Reconcile: 229 fetch-ok vs v3 geos

Fetch log `status=ok`: **229**. v3 build rows: **199**. Absent from v3: **30**.

| ISO2 | ISO3 | name | fetch rows | reason |
|---|---|---|---:|---|
| AX | ALA | Åland | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| BF | BFA | Burkina Faso | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| BI | BDI | Burundi | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| BL | BLM | St-Barthélemy | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| BM | BMU | Bermuda | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| CF | CAF | Central African Rep. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| CG | COG | Congo | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| FJ | FJI | Fiji | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| FO | FRO | Faeroe Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GL | GRL | Greenland | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GS | SGS | S. Geo. and the Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GW | GNB | Guinea-Bissau | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| IO | IOT | Br. Indian Ocean Ter. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| KI | KIR | Kiribati | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| KM | COM | Comoros | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| KN | KNA | St. Kitts and Nevis | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| MC | MCO | Monaco | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| MF | MAF | St-Martin | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| ML | MLI | Mali | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| NA | NAM | Namibia | 261 | pandas_NA_trap: ISO2 'NA' (Namibia) has 261 weekly rows in CSV, but default pandas read_csv treats the token NA as missing; prior load_weekly dropped them so Namibia never entered v3 |
| NE | NER | Niger | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| PN | PCN | Pitcairn Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| SS | SSD | S. Sudan | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| SX | SXM | Sint Maarten | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| TC | TCA | Turks and Caicos Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| TG | TGO | Togo | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| TO | TON | Tonga | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| VA | VAT | Vatican | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| VG | VGB | British Virgin Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| WS | WSM | Samoa | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |

### Flag population and quality × direction

Headline flags rise **73** / within **88** / fall **4** are counted over **all 199 v3 geos** (ok + low_volume), using the same within_noise rule as v2 (`|change_in_window| < 2 × change_se`).

| quality \ flag | rising beyond noise | within noise | falling beyond noise | not computed |
|---|---:|---:|---:|---:|
| ok | 73 | 27 | 4 | 0 |
| low_volume | 0 | 61 | 0 | 34 |
| no_data | 0 | 0 | 0 | 0 |
| **total** | 73 | 88 | 4 | 34 |

`not_computed` here = `change_in_window == 0` (or null) and `within_noise` is false (typical when window variances cannot form an SE).

## Reconcile: 229 fetch-ok vs v3 geos

Fetch log `status=ok`: **229**. v3 build rows: **199**. Absent from v3: **30**.

| ISO2 | ISO3 | name | fetch rows | reason |
|---|---|---|---:|---|
| AX | ALA | Åland | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| BF | BFA | Burkina Faso | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| BI | BDI | Burundi | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| BL | BLM | St-Barthélemy | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| BM | BMU | Bermuda | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| CF | CAF | Central African Rep. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| CG | COG | Congo | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| FJ | FJI | Fiji | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| FO | FRO | Faeroe Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GL | GRL | Greenland | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GS | SGS | S. Geo. and the Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| GW | GNB | Guinea-Bissau | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| IO | IOT | Br. Indian Ocean Ter. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| KI | KIR | Kiribati | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| KM | COM | Comoros | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| KN | KNA | St. Kitts and Nevis | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| MC | MCO | Monaco | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| MF | MAF | St-Martin | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| ML | MLI | Mali | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| NA | NAM | Namibia | 261 | pandas_NA_trap: ISO2 'NA' (Namibia) has 261 weekly rows in CSV, but default pandas read_csv treats the token NA as missing; prior load_weekly dropped them so Namibia never entered v3 |
| NE | NER | Niger | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| PN | PCN | Pitcairn Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| SS | SSD | S. Sudan | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| SX | SXM | Sint Maarten | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| TC | TCA | Turks and Caicos Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| TG | TGO | Togo | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| TO | TON | Tonga | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |
| VA | VAT | Vatican | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| VG | VGB | British Virgin Is. | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write (small territory / sparse Trends coverage) |
| WS | WSM | Samoa | 0 | empty_series: fetch logged status=ok with 0 timeline rows; append_series skipped write |

### Flag population and quality × direction

Headline flags rise **73** / within **88** / fall **4** are counted over **all 199 v3 geos** (ok + low_volume), using the same within_noise rule as v2 (`|change_in_window| < 2 × change_se`).

| quality \ flag | rising beyond noise | within noise | falling beyond noise | not computed |
|---|---:|---:|---:|---:|
| ok | 73 | 27 | 4 | 0 |
| low_volume | 0 | 61 | 0 | 34 |
| no_data | 0 | 0 | 0 | 0 |
| **total** | 73 | 88 | 4 | 34 |

`not_computed` here = `change_in_window == 0` (or null) and `within_noise` is false (typical when window variances cannot form an SE).
## Overlap comparison (31 geos in both v2 and v3)

_Generated 2026-11-23T00:31:46Z. Complete months used for monthly Pearson: **60** (2021-11 … 2026-10)._

### Monthly own_peak Pearson (per country, v2 vs v3)

| | value |
|---|---:|
| n countries | 31 |
| median r | 0.9654 |
| min r | 0.5782 |
| max r | 0.9974 |

Five lowest Pearson r:

| iso3 | geo | name | Pearson r | n months |
|---|---|---|---:|---:|
| THA | TH | Thailand | 0.5782 | 60 |
| VNM | VN | Vietnam | 0.7140 | 60 |
| GBR | GB | United Kingdom | 0.7334 | 60 |
| USA | US | United States of America | 0.7465 | 60 |
| AUS | AU | Australia | 0.7580 | 60 |

### Country-level Spearman (v2 vs v3 ranks)

| metric | Spearman ρ | n |
|---|---:|---:|
| change_in_window | 0.9000 | 31 |
| recent_vs_peak | 0.7060 | 31 |

### Countries with \|Δ change_in_window\| > 10 (v3 − v2)

| iso3 | geo | name | v2 change | v3 change | Δ |
|---|---|---|---:|---:|---:|
| THA | TH | Thailand | 1.67 | 14.84 | +13.18 |
| VNM | VN | Vietnam | 5.00 | 16.99 | +11.99 |
## Ok-quality-only headlines (v3, unpublished) vs published v2

| | v2 published (n=31) | v3 ok-only |
|---|---:|---:|
| rising beyond noise | 19 | 73 |
| within noise | 10 | 27 |
| falling beyond noise | 2 | 4 |
| median change_in_window | 6.7998 | 14.6531 |
| median recent_vs_peak | 84.5158 | 79.2097 |

### Holm 4-pairs

#### v3 ok-quality (with TWN)

| pair | n | ρ | p | p_holm |
|---|---:|---:|---:|---:|
| change_vs_internet | 102 | -0.1501 | 0.1321 | 0.3963 |
| change_vs_youth | 101 | 0.1474 | 0.1414 | 0.3963 |
| recent_vs_internet | 102 | 0.2935 | 0.0028 | 0.0112 |
| recent_vs_youth | 101 | -0.1361 | 0.1746 | 0.3963 |

#### v3 ok-quality (excluding TWN)

| pair | n | ρ | p | p_holm |
|---|---:|---:|---:|---:|
| change_vs_internet | 101 | -0.1539 | 0.1245 | 0.3735 |
| change_vs_youth | 100 | 0.1462 | 0.1467 | 0.3735 |
| recent_vs_internet | 101 | 0.2951 | 0.0027 | 0.0108 |
| recent_vs_youth | 100 | -0.1437 | 0.1538 | 0.3735 |

#### v2 published (with TWN)

| pair | n | ρ | p | p_holm |
|---|---:|---:|---:|---:|
| change_vs_internet | 31 | 0.0048 | 0.9794 | 1.0 |
| change_vs_youth | 31 | 0.0335 | 0.8581 | 1.0 |
| recent_vs_internet | 31 | 0.0702 | 0.7076 | 1.0 |
| recent_vs_youth | 31 | -0.2085 | 0.2604 | 1.0 |

#### v2 published (excluding TWN)

| pair | n | ρ | p | p_holm |
|---|---:|---:|---:|---:|
| change_vs_internet | 30 | -0.002 | 0.9916 | 1.0 |
| change_vs_youth | 30 | 0.0376 | 0.8436 | 1.0 |
| recent_vs_internet | 30 | 0.0291 | 0.8785 | 1.0 |
| recent_vs_youth | 30 | -0.2294 | 0.2228 | 0.8912 |

_Not published. Ok-only Holm lives in `data/unpublished/v3/insomnia_vs_asmr_v3.json` → `ok_quality`._
