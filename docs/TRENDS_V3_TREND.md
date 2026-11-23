# Trends v3 trend test

_Generated 2026-11-23T02:12:05Z. Payloads: `data/unpublished/v3/trends_*_v3b.json` (not published)._

## 1. Mann–Kendall / Theil–Sen on ok geos

Complete months: **60** (2021-11 … 2026-10).
ok counts: {'n': 104, 'rising': 74, 'flat': 27, 'falling': 3}; strict-ok: {'n': 22, 'rising': 16, 'flat': 6, 'falling': 0}.

growth_ratio distribution (ok): {'min': -0.8285, 'p25': 0.094, 'median': 0.2495, 'p75': 0.4271, 'max': 6.9255}

### 5 highest growth_ratio

| geo | iso3 | name | growth_ratio | class |
|---|---|---|---:|---|
| LY | LBY | Libya | 6.9255 | rising |
| KH | KHM | Cambodia | 3.095 | flat |
| OM | OMN | Oman | 2.2305 | rising |
| GH | GHA | Ghana | 2.0962 | rising |
| SY | SYR | Syria | 2.024 | rising |

### 5 lowest growth_ratio

| geo | iso3 | name | growth_ratio | class |
|---|---|---|---:|---|
| JM | JAM | Jamaica | -0.8285 | falling |
| MN | MNG | Mongolia | -0.6208 | falling |
| FR | FRA | France | -0.1153 | falling |
| ES | ESP | Spain | -0.1109 | flat |
| MM | MMR | Myanmar | -0.0723 | flat |

Spearman(growth_ratio, relative_slope_pct_per_year): n=104 ρ=0.8666 p=0.0 CI=[0.736,0.9693] p_holm=None
Sign disagreements growth vs relative slope: **6**
MK rising ∩ SE within_noise: **5** → [BD(Bangladesh), GE(Georgia), PT(Portugal), SI(Slovenia), TW(Taiwan)]
SE beyond-noise rise ∩ not MK rising: **4** → [IN(India), KH(Cambodia), PR(Puerto Rico), QA(Qatar)]

### Why block-bootstrap said 0/104 and SE ignored autocorrelation

1. The earlier moving-block bootstrap rebuilt `growth_ratio` from **only 24 monthly points** (first12∥recent12) with **block length 3 → ~8 draws of 3**, so each resample still mixes early and late windows weakly and CIs were wide enough to cover 0 for every geo.
2. With so few blocks, between-block variance dominates; the test had almost no power to declare a non-zero 12-vs-12 mean shift.
3. The SE `within_noise` rule uses the variance of 12 own-peak months in each window as if months were independent; it does **not** inflate the SE for lag-1+ serial correlation, so persistent runs look “precise” and more geos look beyond noise than MK+BH allows.

## 2. Correlations (growth_ratio family)

recent_vs_peak vs noise (ok, docs-only): n=104 ρ=-0.7687 p=0.0 CI=[-0.8502,-0.6486] p_holm=None

### ok_with_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=103 ρ=-0.1239 p=0.2124 CI=[-0.325,0.0811] p_holm=0.4248 | n=103 ρ=-0.0485 p=0.6266 CI=[-0.2595,0.1566] p_holm=0.7464 |
| growth_vs_youth | n=103 ρ=0.0928 p=0.3512 CI=[-0.1096,0.3027] p_holm=0.4248 | n=103 ρ=0.0887 p=0.3732 CI=[-0.1136,0.2682] p_holm=0.7464 |

### ok_excl_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=102 ρ=-0.127 p=0.2035 CI=[-0.3366,0.0897] p_holm=0.407 | n=102 ρ=-0.0543 p=0.5878 CI=[-0.2595,0.159] p_holm=0.7324 |
| growth_vs_youth | n=102 ρ=0.0912 p=0.3619 CI=[-0.1093,0.2958] p_holm=0.407 | n=102 ρ=0.0904 p=0.3662 CI=[-0.1093,0.2834] p_holm=0.7324 |

### strict_ok_with_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=22 ρ=0.144 p=0.5226 CI=[-0.3553,0.7031] p_holm=0.9804 | n=22 ρ=0.1293 p=0.5663 CI=[-0.4026,0.6732] p_holm=0.9804 |
| growth_vs_youth | n=22 ρ=0.1553 p=0.4902 CI=[-0.3197,0.5618] p_holm=0.9804 | n=22 ρ=0.1553 p=0.4902 CI=[-0.3524,0.5821] p_holm=0.9804 |

### strict_ok_excl_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=22 ρ=0.144 p=0.5226 CI=[-0.3929,0.6832] p_holm=0.9804 | n=22 ρ=0.1293 p=0.5663 CI=[-0.3849,0.6669] p_holm=0.9804 |
| growth_vs_youth | n=22 ρ=0.1553 p=0.4902 CI=[-0.3368,0.5657] p_holm=0.9804 | n=22 ρ=0.1553 p=0.4902 CI=[-0.341,0.5773] p_holm=0.9804 |

## 3. Outputs

- `trends_country_v3b.json`: growth_ratio, relative slope, trend_class, quality, strict_ok, noise
- `trends_monthly_v3b.json`: own_peak series for ok geos only; low_volume listed with flag

_Do not publish._
