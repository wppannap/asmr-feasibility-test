# YouTube duration check

Report only. Raw CSVs were not modified. Sources: `expand_by_channel.py`, `data/yt_master.csv` (n = 342,423 unique `videoId`; 5,205 channels).

## (a) Which videos of a channel are fetched?

From `expand_by_channel.py`:

**Uploads playlist, paged — not the full catalogue in one pass.**

```172:217:expand_by_channel.py
def playlist_video_ids(client: YtClient, playlist_id: str,
                       max_pages: int = 2,
                       skip_pages: int = 0) -> tuple[list[str], int]:
    """抓 playlist 裡的影片 id。回傳 (ids, api_calls)。

    skip_pages：先空轉翻過前 N 頁（不收集 id），用來深挖「上次已抓到頁數上限」的頻道。
    """
    ...
    for _ in range(max_pages):
        params = {
            "part": "contentDetails",
            "playlistId": playlist_id,
            "maxResults": 50,
        }
        ...
```

CLI defaults (`main`):

```380:391:expand_by_channel.py
    ap.add_argument("--max-channels", type=int, default=300,
                    help="本次處理幾個頻道（預設 300）")
    ap.add_argument("--max-pages", type=int, default=2,
                    help="每個頻道的上傳清單翻幾頁（每頁 50 支）")
    ...
    ap.add_argument("--revisit-capped", action="store_true",
                    help="重訪上次 n_found 達到頁數上限的頻道，往更舊的上傳挖")
    ap.add_argument("--prev-pages", type=int, default=2,
                    help="與 --revisit-capped 搭配：上次已翻過幾頁（預設 2）")
    ap.add_argument("--cap-threshold", type=int, default=100,
                    help="與 --revisit-capped 搭配：n_found ≥ 此值視為可能還有更多")
```

Call site:

```465:466:expand_by_channel.py
        ids, calls = playlist_video_ids(
            client, pl, args.max_pages, skip_pages=skip_pages)
```

**Plain reading:**

- Resolve the channel’s **uploads** playlist, then page `playlistItems.list` (`maxResults=50` per page).
- Default **`--max-pages 2`** → up to **100** video ids per channel **per run** (not “all uploads”).
- YouTube’s uploads playlist is newest-first, so each default pass is a **most-recent ~N** slice (N = `max_pages × 50`), not a random sample of the catalogue.
- Only **new** `videoId`s (not already in `yt_master.csv`) are detailed and appended.
- **`--revisit-capped`** skips already-seen pages (`skip_pages`) to dig **older** uploads for channels that previously hit the page cap (`n_found ≥ cap_threshold`, default 100).
- How often: **batch / resumable** via `yt_channel_log.csv` (processed channels skipped unless revisiting); each invocation also caps how many channels (`--max-channels`, default 300) and API units (`--budget`).

So expansion is **catalogue paging with a per-run page cap**, biased to recent uploads, not a one-shot dump of every upload.

## (b) Videos per channel

| Stat | Value |
|------|------:|
| Channels | 5,205 |
| Median videos / channel | **3** |
| p90 videos / channel | **284** |
| Max videos / channel | **791** |
| Share of all videos from top 5% of channels (by video count) | **23.86%** (261 / 5,205 channels) |

No channel ids or names.

## (c) 2×2: `is_asmr_related` × `is_sleep_related` (video-level)

Duration stats use finite `duration_sec > 0` only. Quartiles in seconds. Shares are of those durations.

| is_asmr | is_sleep | n videos | q25 | q50 | q75 | share ≥ 1h | share ≥ 8h |
|:-------:|:--------:|--------:|----:|----:|----:|-----------:|-----------:|
| True | True | 82,038 | 264 | **1,297** | 2,873 | 0.218 | 0.038 |
| True | False | 83,884 | 49 | **226** | 1,202 | 0.075 | 0.004 |
| False | True | 42,571 | 171 | 3,502 | 10,826 | 0.494 | 0.151 |
| False | False | 133,930 | 39 | 129 | 720 | 0.124 | 0.006 |

**ASMR ∩ sleep** median duration (1,297 s) is **longer** than **ASMR ∩ not sleep** (226 s).

## (d) Same 2×2 three ways

### Video-level

Same as (c).

### Channel-equal-weight (each video weighted `1 / n_videos` of its channel)

| is_asmr | is_sleep | n videos | q25 | q50 | q75 | share ≥ 1h | share ≥ 8h |
|:-------:|:--------:|--------:|----:|----:|----:|-----------:|-----------:|
| True | True | 82,038 | 211 | **1,200** | 3,312 | 0.236 | 0.054 |
| True | False | 83,884 | 38 | **169** | 1,177 | 0.075 | 0.009 |
| False | True | 42,571 | 148 | 476 | 4,904 | 0.332 | 0.098 |
| False | False | 133,930 | 34 | 134 | 758 | 0.130 | 0.005 |

### Capped to 20 most recent videos per channel (by `publishedAt`)

Videos with missing `publishedAt` excluded before the cap. n below is after the cap.

| is_asmr | is_sleep | n videos | q25 | q50 | q75 | share ≥ 1h | share ≥ 8h |
|:-------:|:--------:|--------:|----:|----:|----:|-----------:|-----------:|
| True | True | 12,281 | 301 | **1,287** | 3,181 | 0.232 | 0.036 |
| True | False | 11,456 | 48 | **240** | 1,276 | 0.076 | 0.006 |
| False | True | 7,142 | 163 | 2,971 | 9,073 | 0.481 | 0.109 |
| False | False | 14,030 | 39 | 139 | 779 | 0.132 | 0.006 |

## (e) Channel-expanded only

Proxy: empty `searchKeywords` **and** empty `searchTerms` (n = 328,270; 95.87% of sample).

### Video-level

| is_asmr | is_sleep | n videos | q25 | q50 | q75 | share ≥ 1h | share ≥ 8h |
|:-------:|:--------:|--------:|----:|----:|----:|-----------:|-----------:|
| True | True | 75,595 | 253 | **1,285** | 2,831 | 0.216 | 0.038 |
| True | False | 79,149 | 49 | **216** | 1,191 | 0.074 | 0.004 |
| False | True | 40,130 | 175 | 3,601 | 10,867 | 0.502 | 0.153 |
| False | False | 133,396 | 39 | 129 | 717 | 0.123 | 0.006 |

### Channel-equal-weight (expanded only)

Median ASMR∩sleep **1,174** s vs ASMR∩not-sleep **326** s.

### Capped 20 most recent (expanded only)

Median ASMR∩sleep **1,265** s vs ASMR∩not-sleep **209** s.

## Direction summary

Compare median duration of **ASMR-tagged and sleep-tagged** vs **ASMR-tagged, not sleep-tagged**:

| Analysis | ASMR∩sleep q50 | ASMR∩¬sleep q50 | Direction |
|----------|---------------:|----------------:|-----------|
| (c) video-level | 1,297 | 226 | longer |
| (d) channel-equal-weight | 1,200 | 169 | longer |
| (d) capped 20 most recent | 1,287 | 240 | longer |
| (e) channel-expanded, video-level | 1,285 | 216 | longer |
| (e) channel-expanded, channel-equal | 1,174 | 326 | longer |
| (e) channel-expanded, capped 20 | 1,265 | 209 | longer |

**Plain statement:** Under all of (c)–(e) (including the three weightings in (d) and the same three on channel-expanded videos), **ASMR-and-sleep-tagged videos have a longer median duration than ASMR-tagged, not-sleep-tagged videos.** The direction does not reverse.

## Page `n` vs this 2×2

Earlier page `duration_histogram.groups.*.n` counted only videos with **finite `duration_sec > 0`** (the histogram plot set). That is why toggles showed 81,519 / 83,795 / 41,963 instead of 82,038 / 83,884 / 42,571.

| Group | 2×2 n | invalid / missing / ≤0 duration | plotted (finite, within bin edges) |
|-------|------:|--------------------------------:|-----------------------------------:|
| ASMR ∩ sleep | 82,038 | 519 | 81,519 |
| ASMR ∩ ¬sleep | 83,884 | 89 | 83,795 |
| ¬ASMR ∩ sleep | 42,571 | 608 | 41,963 |

Bin edges are ~1s…~158,489s; **no** tagged videos with valid duration fell below/above that range. The page now sets **`n` = 2×2 count** and exposes `n_plotted`, `n_invalid_duration`, `n_below_plot_min`, `n_above_plot_max`, `plot_min_sec`, `plot_max_sec` in JSON / the duration table.
