# Trends v3 vs v2

| | **v2 (published)** | **v3 (unpublished)** |
| --- | --- | --- |
| Source CSV | `data/trends_timeseries.csv` | `data/trends_asmr_all_geos.csv` |
| Keyword(s) | Primary multi-term batch (ASMR + insomnia peers); see `config/trends_batches.csv` | **ASMR only** (Latin-script) |
| Timeframe | Mostly `today 5-y` at fetch time | Fixed `2021-11-01 2026-10-31` |
| Geos | 31 | Up to all map geos except CN / KP / Antarctica (~229 planned) |
| Granularity | Weekly IOT → monthly mean | Same (weekly → monthly mean) |
| Own-peak | ASMR monthly ÷ country max × 100 from primary batch | Same formula on ASMR-only series |
| Windows | `WINDOW_FIRST_12` / `WINDOW_RECENT_12` (and 6m) in `build_trends_v2` | **Identical** (`scripts/build_web_data.py` L134–138, L338–621) |
| Noise | `change_se`, `within_noise` (\|Δ\| < 2 SE) | Identical |
| Quality | `flag_low_volume` only (>50% months at 0) | + `quality`: `no_data` / `low_volume` / `ok` (also `<10` distinct weekly values) |
| Outputs | `web/data/trends_*_v2.json` | `data/unpublished/v3/trends_*_v3.json` only |
| Correlations | `web/data/insomnia_vs_asmr.json` (Holm ×4 on published 31) | `data/unpublished/v3/insomnia_vs_asmr_v3.json` (Holm ×4 twice: ok-only and all-with-data; ±TWN) |

**Do not publish v3** until coverage and quality review are done. Live site stays on v2 payloads.
