# Trends v3 fix notes

_Generated 2026-11-23T01:09:57Z. Local unpublished metrics in `data/unpublished/v3/trends_v3_fix_metrics.json`._

## a. Namibia / geo loaders

Pandas reads of geo codes now use `keep_default_na=False, na_values=['']` in:
- `scripts/build_trends_v3.py` `load_weekly`
- `scripts/build_web_data.py` `load_trends_raw`
- `scripts/fetch_worldbank_indicators.py` `load_trend_geos`
- `scripts/validate_trends_v3.py` / `scripts/trends_repeat_check.py` (already)

Fetch-ok geos: **229**. v3 rows: **200**. ok=104 low_volume=96 no_data=0. not-in-v3: **29**.
Namibia (NA) in v3: **True** quality=low_volume change=-5.5208

Not-in-v3 geos (empty fetch series):

| geo | name |
|---|---|
| AX | Åland |
| BF | Burkina Faso |
| BI | Burundi |
| BL | St-Barthélemy |
| BM | Bermuda |
| CF | Central African Rep. |
| CG | Congo |
| FJ | Fiji |
| FO | Faeroe Is. |
| GL | Greenland |
| GS | S. Geo. and the Is. |
| GW | Guinea-Bissau |
| IO | Br. Indian Ocean Ter. |
| KI | Kiribati |
| KM | Comoros |
| KN | St. Kitts and Nevis |
| MC | Monaco |
| MF | St-Martin |
| ML | Mali |
| NE | Niger |
| PN | Pitcairn Is. |
| SS | S. Sudan |
| SX | Sint Maarten |
| TC | Turks and Caicos Is. |
| TG | Togo |
| TO | Tonga |
| VA | Vatican |
| VG | British Virgin Is. |
| WS | Samoa |

## b. Composition (medians)

| set | n | median change_in_window | median recent_vs_peak |
|---|---:|---:|---:|
| 31 original (v3 values) | 31 | 10.0267 | 84.0297 |
| 31 original (v2 values) | 31 | 6.7998 | 84.5158 |
| other ok (v3) | 73 | 15.9261 | 73.4958 |

## c. growth_ratio (ok only)

growth_ratio = mean(raw monthly, recent 12 complete) / mean(first 12) − 1. Moving-block bootstrap block=3, n=2000, seed=42. within_noise if CI includes 0. recent_vs_peak_robust = max of 6-month rolling mean of own-peak series.

Spearman(growth_ratio, change_in_window): n=104 ρ=0.9328 p=0.0
Sign disagreements: **0**


## d. Noise artefact + partial Spearman

### Noise Spearman (ok)

| pair | stats |
|---|---|
| noise_vs_recent_vs_peak | n=104 ρ=-0.7691 p=0.0 CI=[-0.8535, -0.6441] |
| noise_vs_abs_change | n=104 ρ=0.3497 p=0.0003 CI=[0.1554, 0.516] |
| noise_vs_internet | n=103 ρ=-0.2472 p=0.0118 CI=[-0.4244, -0.0531] |

### Noise Spearman (strict_ok)

| pair | stats |
|---|---|
| noise_vs_recent_vs_peak | n=82 ρ=-0.5728 p=0.0 CI=[-0.7112, -0.3869] |
| noise_vs_abs_change | n=82 ρ=0.3266 p=0.0028 CI=[0.1078, 0.5326] |
| noise_vs_internet | n=82 ρ=-0.3037 p=0.0055 CI=[-0.4975, -0.084] |

### Family ok_with_TWN (Holm over 6 pairs)

| pair | raw Spearman | partial Spearman (control noise) |
|---|---|---|
| change_in_window_vs_internet | n=103 ρ=-0.1253 p=0.2074 CI=[-0.3217, 0.0856] p_holm=0.624 | n=103 ρ=-0.0735 p=0.4608 CI=[-0.2707, 0.1323] p_holm=1.0 |
| change_in_window_vs_youth | n=103 ρ=0.1438 p=0.1473 CI=[-0.0642, 0.3382] p_holm=0.624 | n=103 ρ=0.1251 p=0.208 CI=[-0.0649, 0.3066] p_holm=1.0 |
| growth_ratio_vs_internet | n=103 ρ=-0.1239 p=0.2124 CI=[-0.3201, 0.0808] p_holm=0.624 | n=103 ρ=-0.0482 p=0.629 CI=[-0.2515, 0.1603] p_holm=1.0 |
| growth_ratio_vs_youth | n=103 ρ=0.0928 p=0.3512 CI=[-0.1183, 0.2904] p_holm=0.624 | n=103 ρ=0.0889 p=0.372 CI=[-0.1025, 0.2785] p_holm=1.0 |
| recent_vs_peak_robust_vs_internet | n=103 ρ=0.2207 p=0.0251 CI=[0.0299, 0.4014] p_holm=0.1506 | n=103 ρ=0.059 p=0.5536 CI=[-0.1541, 0.2694] p_holm=1.0 |
| recent_vs_peak_robust_vs_youth | n=103 ρ=-0.1522 p=0.1248 CI=[-0.3494, 0.0393] p_holm=0.624 | n=103 ρ=-0.0892 p=0.3702 CI=[-0.2713, 0.0987] p_holm=1.0 |

### Family ok_excl_TWN (Holm over 6 pairs)

| pair | raw Spearman | partial Spearman (control noise) |
|---|---|---|
| change_in_window_vs_internet | n=102 ρ=-0.1287 p=0.1972 CI=[-0.341, 0.0748] p_holm=0.6156 | n=102 ρ=-0.0803 p=0.4221 CI=[-0.2837, 0.1184] p_holm=1.0 |
| change_in_window_vs_youth | n=102 ρ=0.1422 p=0.1539 CI=[-0.071, 0.3462] p_holm=0.6156 | n=102 ρ=0.1257 p=0.2081 CI=[-0.0595, 0.3183] p_holm=1.0 |
| growth_ratio_vs_internet | n=102 ρ=-0.127 p=0.2035 CI=[-0.3396, 0.0823] p_holm=0.6156 | n=102 ρ=-0.0541 p=0.5893 CI=[-0.2578, 0.1459] p_holm=1.0 |
| growth_ratio_vs_youth | n=102 ρ=0.0912 p=0.3619 CI=[-0.1123, 0.2975] p_holm=0.6156 | n=102 ρ=0.0901 p=0.368 CI=[-0.1073, 0.2852] p_holm=1.0 |
| recent_vs_peak_robust_vs_internet | n=102 ρ=0.2201 p=0.0262 CI=[0.0336, 0.4135] p_holm=0.1572 | n=102 ρ=0.057 p=0.5691 CI=[-0.1605, 0.2676] p_holm=1.0 |
| recent_vs_peak_robust_vs_youth | n=102 ρ=-0.1602 p=0.1077 CI=[-0.3452, 0.0451] p_holm=0.5385 | n=102 ρ=-0.1023 p=0.3064 CI=[-0.2884, 0.0888] p_holm=1.0 |

### Family strict_ok_with_TWN (Holm over 6 pairs)

| pair | raw Spearman | partial Spearman (control noise) |
|---|---|---|
| change_in_window_vs_internet | n=82 ρ=-0.0694 p=0.5356 CI=[-0.3066, 0.1807] p_holm=1.0 | n=82 ρ=0.0046 p=0.9669 CI=[-0.2263, 0.2341] p_holm=1.0 |
| change_in_window_vs_youth | n=82 ρ=0.0755 p=0.5003 CI=[-0.1596, 0.2986] p_holm=1.0 | n=82 ρ=0.028 p=0.8026 CI=[-0.1876, 0.2371] p_holm=1.0 |
| growth_ratio_vs_internet | n=82 ρ=-0.1098 p=0.3263 CI=[-0.3449, 0.1446] p_holm=1.0 | n=82 ρ=-0.0151 p=0.8926 CI=[-0.2503, 0.2161] p_holm=1.0 |
| growth_ratio_vs_youth | n=82 ρ=0.0836 p=0.4551 CI=[-0.1546, 0.3124] p_holm=1.0 | n=82 ρ=0.0401 p=0.7205 CI=[-0.172, 0.2587] p_holm=1.0 |
| recent_vs_peak_robust_vs_internet | n=82 ρ=0.3128 p=0.0042 CI=[0.1119, 0.4933] p_holm=0.0252 | n=82 ρ=0.1549 p=0.1646 CI=[-0.0796, 0.3779] p_holm=0.9654 |
| recent_vs_peak_robust_vs_youth | n=82 ρ=-0.2708 p=0.0139 CI=[-0.4715, -0.0334] p_holm=0.0695 | n=82 ρ=-0.1563 p=0.1609 CI=[-0.3544, 0.0562] p_holm=0.9654 |

### Family strict_ok_excl_TWN (Holm over 6 pairs)

| pair | raw Spearman | partial Spearman (control noise) |
|---|---|---|
| change_in_window_vs_internet | n=81 ρ=-0.0729 p=0.5176 CI=[-0.2969, 0.19] p_holm=1.0 | n=81 ρ=0.0061 p=0.9571 CI=[-0.2199, 0.246] p_holm=1.0 |
| change_in_window_vs_youth | n=81 ρ=0.0715 p=0.5261 CI=[-0.1614, 0.2862] p_holm=1.0 | n=81 ρ=0.0241 p=0.8306 CI=[-0.1972, 0.2402] p_holm=1.0 |
| growth_ratio_vs_internet | n=81 ρ=-0.114 p=0.3109 CI=[-0.3388, 0.1543] p_holm=1.0 | n=81 ρ=-0.0241 p=0.8308 CI=[-0.2537, 0.225] p_holm=1.0 |
| growth_ratio_vs_youth | n=81 ρ=0.0808 p=0.4735 CI=[-0.164, 0.3006] p_holm=1.0 | n=81 ρ=0.0394 p=0.727 CI=[-0.1827, 0.2609] p_holm=1.0 |
| recent_vs_peak_robust_vs_internet | n=81 ρ=0.3126 p=0.0045 CI=[0.1211, 0.4897] p_holm=0.027 | n=81 ρ=0.1484 p=0.1861 CI=[-0.0881, 0.376] p_holm=0.9305 |
| recent_vs_peak_robust_vs_youth | n=81 ρ=-0.2879 p=0.0091 CI=[-0.4887, -0.0573] p_holm=0.0455 | n=81 ρ=-0.1762 p=0.1157 CI=[-0.3786, 0.0375] p_holm=0.6942 |

## e. Rising / within / falling

| set | metric | rising | within_noise | falling | n |
|---|---|---:|---:|---:|---:|
| ok · change_in_window | — | 73 | 27 | 4 | 104 |
| ok · growth_ratio | — | 0 | 104 | 0 | 104 |
| strict-ok · change_in_window | — | 62 | 18 | 2 | 82 |
| strict-ok · growth_ratio | — | 0 | 82 | 0 | 82 |

n_ok=104 n_strict_ok=82 (strict-ok: quality=ok AND zero_week_share<0.2 AND n_distinct≥30).

_No interpretation._
