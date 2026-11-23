# Human review pack — judgment rules

Fill `my_judgment` with `1` or `0` only. Leave `note` blank unless something is ambiguous.

| block | Mark **1** when… |
|-------|------------------|
| `ambient_v32` | The video really is ambient / nature / white-noise content and **not** performed ASMR |
| `sleep_title` | The video is meant as a sleep aid |
| `tierA` | It is ASMR with human-made sounds |
| `tierB` | It is plausibly ASMR content |
| `not_asmr_but_human_trigger` | It is **NOT** ASMR (correctly left out of labelled ASMR) |

Do not mark AI judgments as human. After filling every `my_judgment`, run:

```bash
.venv/bin/python scripts/ingest_review_pack.py
```

That script refuses blank judgments, writes `reviewed_by=human` into `config/review_log.csv`, and creates `docs/REVIEW_RESULTS.md`.
