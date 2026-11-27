# Provenance for the published panels

Facts below are only what is written in this repo. Where a source, coder, date, or licence is not in the repo, the cell says NOT FOUND. Nothing here is inferred.

## Bedroom sample (Night Windows)

- File: `web/data/bedroom_filter_20.json` (generated_at `2026-11-27T01:50:00Z`).
- Fields stored per video: `code`, `video_lum`, `warmth`, `cover_lum`, `lum_span`. There is no stored boolean for warm, dim, or locked.
- Selection, from `meta.source_files`: "team pixel sample, 20 videos x 4 frames, anonymized codes V01-V20".
- `meta.n_videos` 20, `meta.n_frames` 80.
- Caveat in that file: dim means in-video luminance under 75. Locked camera means a luminance span under 10.
- Warm is not defined in the file. The night-windows chart treats `warmth > 0` as warm, which is the same split the previous spectrum used when it painted `warmth < 0` as cool. Counts from those cuts: 17 warm, 10 dim, 14 locked, 6 passing all three.
- Who coded the frames: NOT FOUND. Licence: NOT FOUND.

## West vs. East Asia

- The percentages (N = 40, 80% talking, 70% no talking, and the five row pairs) are literals in `web/index.html` and `web/js/charts/west_vs_east.js`.
- Source file, sample rule, coder, date, licence: NOT FOUND.

## Who Creates Calm

- "Top Creators (N = 71, FeedSpot 2026)" and "Global Listeners (N = 12,136, Deezer)", plus the 68 / 24 / 8 counts and the voice-arch shares, are literals in `web/index.html` and `web/js/charts/gender_audience.js`.
- A FeedSpot export, a Deezer export, coder, date, and licence: NOT FOUND.

## Inside the Headphones

- Capsule titles, kinds, and bar heights are literals in `web/js/charts/sound_samples.js`. The audio paths are `audio/sample_material.mp3`, `audio/sample_whisper.mp3`, `audio/sample_layered.mp3`.
- Those files are not in the repo (only `web/audio/.gitkeep`). Source, coder, date, licence: NOT FOUND.

## Play ASMR

- `web/index.html` points at `audio/asmr_sleep.mp3`. The on-page hint says the file is ready once it is added. The file is not in the repo.
- Source, licence, date: NOT FOUND. The control does not start playback by itself.

## Moon of Words

- `scripts/build_toolkit_terms.py` joins `data/yt_master.csv` to `data/yt_classes_v32.csv`, keeps `class_strict == asmr_labelled`, and writes `web/data/toolkit_terms.json` (generated_at in that file).
- Counts are distinct videos and distinct channels. Tags for every script; Latin titles add words and 2-grams; Han, Japanese, and Korean use tags only. Floor: 150 videos and 20 channels. If more terms pass, the 320 with the most videos are kept. `n_videos` is rounded to 2 significant digits. No channel ids or names.
- Aliases: `config/trigger_canonical.yaml`. Groups: `config/toolkit_groups.yaml`. Ambient-noise phrases are dropped.
- Layout: `scripts/layout_moon.py` (Pillow crescent, Python wordcloud, Arial Unicode), then a spiral fill for words the packer did not seat. Output: `web/data/toolkit_layout.json`.
- Hand-coded cloud terms (COVER TEXT HOOK, BRIGHTER COVER, FACELESS MACRO, and the rest of the old list) existed only as literals in `web/js/charts/asmr_toolkit_cloud.js`. No separate coding sheet or provenance note was found, so they were dropped.

## Images under web/img

| File | What the repo says |
| --- | --- |
| `web/img/insomnia_bed.png` | Used as the opening sleeper. Source, coder, tool, date, licence: NOT FOUND. |
| `web/img/props/stage1_props.jpg` | Used on The Fade-Out. Source, coder, tool, date, licence: NOT FOUND. |
| `web/img/props/stage2_props.jpg` | Used on The Fade-Out. Source, coder, tool, date, licence: NOT FOUND. |
| `web/img/props/stage3_props.jpg` | Used on The Fade-Out. Source, coder, tool, date, licence: NOT FOUND. |

## Other published figures already carrying a source note

- Google Trends country and monthly files: `web/data/trends_country_v3c.json`, `web/data/trends_monthly_v3c.json` (generated_at `2026-11-23T12:09:51Z`; source files named in each `meta`).
- World Bank and Taiwan official statistics: named in `web/data/scatter_points_v3c.json` under `meta.sources` (internet use; youth share from World Bank age bands and MOI RIS Demographic Fact Book).
- Wikimedia pageviews: `web/data/wiki_lang.json` (`wiki_pageviews_monthly.csv`, `config/wiki_concepts.yaml`, generated_at `2026-11-22T14:59:57Z`).
- YouTube Data API charts: `web/data/yt_creators.json`, `yt_duration.json`, `yt_upload_clock.json` (generated_at `2026-11-25`; caveats describe channel expansion). The API name is the project source for those catalogues. A licence statement: NOT FOUND.
