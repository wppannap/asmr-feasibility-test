# Trends v3 trend test

_Generated 2026-11-23T03:13:02Z. Payloads: `data/unpublished/v3/trends_country_v3b.json`, `trends_monthly_v3b.json` (not published)._

## 1. Mann-Kendall / Theil-Sen / growth_ratio

Complete months used: **60** (2021-11 … 2026-10).

| set | n | rising | flat | falling |
|---|---:|---:|---:|---:|
| ok | 104 | 74 | 27 | 3 |
| strict-ok | 22 | 16 | 6 | 0 |

### growth_ratio distribution (ok)

| min | p25 | median | p75 | max |
|---:|---:|---:|---:|---:|
| -0.8285 | 0.094 | 0.2495 | 0.4271 | 6.9255 |

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

Spearman(growth_ratio, relative_slope_pct_per_year): n=104 ρ=0.8666 p=0.0 CI=[0.736, 0.9693]
Sign disagreements growth vs relative slope: **6**

### MK vs SE within_noise cross-counts

- MK rising but SE within_noise: **5**
- MK falling but SE within_noise: **0**
- SE beyond noise (Δ>0) but MK flat: **4**
- SE beyond noise (Δ<0) but MK flat: **1**

### Why block-bootstrap said 0/104 and why SE ignored autocorrelation

1. The earlier moving-block bootstrap used block length 3 on a **24-point** series (first12‖recent12), i.e. only **~8 blocks** (and effectively ~4 independent 12-month windows if thinking in half-years)—resamples are highly dependent and variance of the ratio estimator is large, so 95% CIs almost always covered 0.
2. That procedure tests a **two-window mean ratio**, not a monotonic trend across 60 months; wide CIs are expected with few effective blocks.
3. The v2/v3 `change_se` treats the 12 first and 12 recent monthly own-peak points as **iid** when forming `sqrt(s1²/12+s2²/12)`; Google Trends series are autocorrelated, so the SE is typically **too small** (over-rejects “within noise”) and does not implement an HAC/Hamed–Rao correction—unlike the modified Mann-Kendall used here.

## 2. Correlations (growth_ratio × internet / youth)

Holm over the **2** pairs within each block. `recent_vs_peak` is **not** written to v3b page payloads.

Docs-only: Spearman(recent_vs_peak, noise) on ok = n=104 ρ=-0.7687 p=0.0

### ok_with_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=103 ρ=-0.1239 p=0.2124 CI=[-0.3201, 0.0808] p_holm=0.4248 | n=103 ρ=-0.0485 p=0.6266 CI=[-0.2521, 0.1595] p_holm=0.7464 |
| growth_vs_youth | n=103 ρ=0.0928 p=0.3512 CI=[-0.1158, 0.2877] p_holm=0.4248 | n=103 ρ=0.0887 p=0.3732 CI=[-0.1112, 0.2789] p_holm=0.7464 |

### ok_excl_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=102 ρ=-0.127 p=0.2035 CI=[-0.3396, 0.0823] p_holm=0.407 | n=102 ρ=-0.0543 p=0.5878 CI=[-0.2581, 0.1456] p_holm=0.7324 |
| growth_vs_youth | n=102 ρ=0.0912 p=0.3619 CI=[-0.1171, 0.2999] p_holm=0.407 | n=102 ρ=0.0904 p=0.3662 CI=[-0.1059, 0.2921] p_holm=0.7324 |

### strict_ok_with_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=22 ρ=0.144 p=0.5226 CI=[-0.3929, 0.6832] p_holm=0.9804 | n=22 ρ=0.1293 p=0.5663 CI=[-0.3849, 0.6669] p_holm=0.9804 |
| growth_vs_youth | n=22 ρ=0.1553 p=0.4902 CI=[-0.3368, 0.5657] p_holm=0.9804 | n=22 ρ=0.1553 p=0.4902 CI=[-0.341, 0.5773] p_holm=0.9804 |

### strict_ok_excl_TWN

| pair | raw | partial (control noise) |
|---|---|---|
| growth_vs_internet | n=22 ρ=0.144 p=0.5226 CI=[-0.3732, 0.6664] p_holm=0.9804 | n=22 ρ=0.1293 p=0.5663 CI=[-0.4057, 0.6644] p_holm=0.9804 |
| growth_vs_youth | n=22 ρ=0.1553 p=0.4902 CI=[-0.3399, 0.5748] p_holm=0.9804 | n=22 ρ=0.1553 p=0.4902 CI=[-0.3506, 0.5739] p_holm=0.9804 |

## 3. Outputs

- `data/unpublished/v3/trends_country_v3b.json` — growth_ratio, relative slope, class, quality, strict_ok, noise
- `data/unpublished/v3/trends_monthly_v3b.json` — own_peak time-lapse for **ok** geos; low_volume listed with flag

_Do not publish._
