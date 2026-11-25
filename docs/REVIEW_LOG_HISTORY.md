# review_log.csv — reviewed_by history

Source: `git log --follow -p -- config/review_log.csv`.
This file is documentation only; it does not change `config/review_log.csv`.

## Commits that changed `reviewed_by` **to** `human`

| hash | author | message | files: AI-assisted or UNSET → human |
|---|---|---|---|
| `31d155e4f032a2bb9065a0f904e8375c59fce9ec` | TommyPan | Record human review of the 40-row classification pack. | `human_review_pack.csv` (`AI-assisted` → `human`) |

No other committed diff moves a row to `human`.

## Other `reviewed_by` changes (context)

| hash | author | message | summary |
|---|---|---|---|
| `59f26ad4f0d2029e0215abff919c56415feacb7b` | TommyPan | Add Trends v3c payloads and fix strict-ok zero-share bug | Created `review_log.csv`; all rows `UNSET`. |
| `835bb6f333b3c1c216a7e9d4af460541b72ef8ec` | TommyPan | Apply Trends pop≥1M ok gate and strip disabled page sections. | Several class_check_v3_* / lang_check_extra / class_check_v31_* : `UNSET` → `AI-assisted`. |
| `0b3cb5c21f009a180c7f9cd8e6fe58069fedeeb8` | TommyPan | Map1 caption/small_base=15, YT chart finish, review pack, class freeze. | Added v32 / script / comment_precision_check_8 rows as `UNSET`. |
| `c6cbdfcb76a3f3a1f9da8c022016f30421667295` | TommyPan | Record AI-assisted title review of the 40-row pack. | Added `human_review_pack.csv` as `AI-assisted` (not human). |
| `31d155e4f032a2bb9065a0f904e8375c59fce9ec` | TommyPan | Record human review of the 40-row classification pack. | Pack only: `AI-assisted` → `human` (see table above). |
| `1e4e564fed7a9d509eb2974cb549813bed35d09f` | TommyPan | Restore review_log pack result and reviewed_by labels. | Restored pack result text; kept pack as `human`; other rows stayed `UNSET` / `AI-assisted` (did not introduce new `human` rows). |
| `49325819a02ddcdbdd50dd6ba3257022ed738750` | TommyPan | Fill AI-assisted reviews for all non-human review_log rows. | Many `UNSET` → `AI-assisted`; added check_7 / yt_sleep_tag / trends_repeat as `AI-assisted`; pack stayed `human`. |

## Notes

- Legitimate `human` for the pack is meant to be written only by `scripts/ingest_review_pack.py` (with `config/review_ingest.json` receipt).
- `trends_repeat_check.csv` is a script reproducibility output and must use `reviewed_by=script` (never counted as a content review).
