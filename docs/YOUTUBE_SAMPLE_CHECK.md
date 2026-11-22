# YouTube sample check

Report only. Raw data not modified. Sources: `data/yt_master.csv`, `data/yt_query_log.csv`, `expand_by_channel.py::classify`.

## Share of videos by `publishedAt` year

n = **342,423** unique `videoId`.

| year | count | share |
|------|------:|------:|
| 2009 | 1 | 0.00% |
| 2010 | 1 | 0.00% |
| 2011 | 47 | 0.01% |
| 2012 | 137 | 0.04% |
| 2013 | 237 | 0.07% |
| 2014 | 452 | 0.13% |
| 2015 | 795 | 0.23% |
| 2016 | 1,156 | 0.34% |
| 2017 | 3,010 | 0.88% |
| 2018 | 4,777 | 1.40% |
| 2019 | 8,159 | 2.38% |
| 2020 | 9,525 | 2.78% |
| 2021 | 18,316 | 5.35% |
| 2022 | 20,807 | 6.08% |
| 2023 | 29,470 | 8.61% |
| 2024 | 37,802 | 11.04% |
| 2025 | 71,709 | 20.94% |
| 2026 | 136,008 | 39.72% |
| (missing publishedAt) | 14 | 0.00% |

**2025–2026 combined:** 207,717 / 342,423 = **60.66%**.

## Search vs channel expansion

Proxy: nonempty `searchKeywords` **or** `searchTerms` ⇒ found by search; both empty ⇒ channel expansion.

| path | count | share |
|------|------:|------:|
| Search provenance present | 14,153 | **4.13%** |
| Channel expansion (empty both) | 328,270 | **95.87%** |

## Duration / sleep words in `yt_query_log.csv`

n = **400** query rows.

- Duration words (`hour`, `hr`, `小時`, `8h`, `8小時`): **0 / 400** hits.  
- Sleep-related words (regex covering sleep/助眠/失眠/수면/眠/insomni/relax/放鬆/冥想/meditation, etc.): **90 / 400**.

## `is_sleep_related` rates

Overall: **0.3639** (36.39%).

| subset | n | is_sleep_related rate |
|--------|--:|----------------------:|
| Search videos whose provenance contains sleep words | 3,563 | **0.9399** |
| Search videos whose provenance does **not** contain sleep words | 10,590 | **0.5227** |
| Channel-expanded (empty provenance) | 328,270 | **0.3525** |

## Exact rule for `is_sleep_related`

From `expand_by_channel.py::classify` (also quoted in `web/js/charts/duration.js` footnote):

```text
text = " ".join([title or "", tags or "", desc or "", topic_cats or ""]).lower()
has_any(kws) = any(k in text for k in kws)
is_asmr_related = has_any(asmr_core) or has_any(asmr_trigger)
is_sleep_related = has_any(sleep_kw)
return bool(is_asmr), bool(is_sleep)
```

Call sites pass `description_short` as `desc` and `topicCategories` as `topic_cats`. Keyword lists are the `asmr_core` / `asmr_trigger` / `sleep_kw` arrays in `expand_by_channel.py` (substring match, case-lowered).

No yearly-growth chart added.
