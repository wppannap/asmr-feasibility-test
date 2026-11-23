# Trends v3c page payloads

_Generated 2026-11-23T11:48:56Z. Local only: `data/unpublished/v3/trends_country_v3c.json`, `trends_monthly_v3c.json`._

## 1. Why strict-ok was 22 in TRENDS_V3_TREND.md but 82 in TRENDS_V3_FIX.md

Same intended definition in both docs:

> `quality == 'ok'` AND `zero_week_share < 0.2` AND `n_distinct_values >= 30`

| source | code | n_strict_ok |
|---|---|---:|
| `scripts/trends_v3_fix.py` (~L310) | `ok_mask & (ndf['zero_week_share'] < 0.2) & (ndf['n_distinct_values'] >= 30)` | **82** |
| `scripts/trends_v3_trend.py` (pre-fix) | `float(meta.get('zero_week_share') or 1) < 0.2` | **22** |

Among ok geos, **62** have `zero_week_share == 0.0`. In Python, `0.0 or 1` evaluates to `1`, so those geos were wrongly treated as failing the `< 0.2` cut and dropped from strict-ok → **22** left. Pandas boolean masks in the fix script compare `0.0 < 0.2` correctly → **82**.

**Canonical definition (v3c / going forward):** `quality=='ok' AND zero_week_share is not None AND float(zero_week_share)<0.2 AND int(n_distinct_values)>=30  (do NOT use `float(zero_week_share or 1)` — zeros are valid)` (implemented in `scripts/build_trends_v3c.py` `is_strict_ok`).

## 2. Headline numbers

- ok: **103**
- low_volume: **97**
- not in v3 (empty series): **29**
- China not measured: **1**
- strict_ok (canonical): **82**
- mk_class (ok): rising/flat/falling = **74/26/3**
- growth_ratio (ok) median: **0.2537**; IQR: **[0.0961, 0.4297]**

## 3. Five largest growth_ratio (with first-12-month mean)

| geo | iso3 | name | growth_ratio | mean_first_12 | mk_class |
|---|---|---|---:|---:|---|
| LY | LBY | Libya | 6.9255 | 3.525 | rising |
| KH | KHM | Cambodia | 3.095 | 3.6833 | flat |
| OM | OMN | Oman | 2.2305 | 6.6333 | rising |
| GH | GHA | Ghana | 2.0962 | 11.9083 | rising |
| SY | SYR | Syria | 2.024 | 13.8958 | rising |

Small `mean_first_12` bases inflate ratios (colour uses `growth_ratio_clipped` in [-0.5, 1.5]).

## 4. Outputs

- `trends_country_v3c.json` — ok + low_volume rows; meta lists not_in_v3 + China not_measured
- `trends_monthly_v3c.json` — own_peak monthly for ok geos, 60 complete months

_Do not publish._
