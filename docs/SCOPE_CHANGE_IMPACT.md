# Scope change impact: human-performed ASMR only

Report only. Raw CSVs were not modified; `web/` payloads were **not** rewritten in this task.
Definitions: `config/yt_classes.yaml`. Classifications: `data/yt_classes.csv`.

Removed from old `asmr_core` (corrupted / non-terms):
- `耳あgraphs`
- `耳messenger`
- `오디오는`
- `이마 귀`

## (a) Class counts and shares

Total videos: **342,423**.

| class | n | share |
|-------|--:|------:|
| `human_asmr` | 145,110 | 0.4238 |
| `ambient_labelled_asmr` | 8,310 | 0.0243 |
| `noise_not_asmr` | 20,115 | 0.0587 |
| `other` | 168,888 | 0.4932 |
| `mixed` (subset of human_asmr: ambient ∧ human_trigger) | 14,569 | 0.0425 of all; 0.1004 of human_asmr |

## (b) Old `is_asmr_related` vs `has_asmr_label`

Old `is_asmr_related=True`: **165,922**.
Of those, `has_asmr_label=False`: **12,560** (0.0757).
These are videos the old classifier marked ASMR-related without matching any cleaned `asmr_label` term (typically generic trigger-only matches from the old `asmr_trigger` list).

Top 15 old `asmr_trigger` words among old-ASMR videos with **no** `has_asmr_label`:

| trigger | n matching |
|---------|----------:|
| `mukbang` | 2,293 |
| `按摩` | 1,795 |
| `開箱` | 1,479 |
| `slime` | 986 |
| `unboxing` | 788 |
| `吃播` | 710 |
| `whisper` | 626 |
| `rain` | 614 |
| `massage` | 494 |
| `ritual` | 361 |
| `keyboard` | 315 |
| `儀式` | 232 |
| `雨天` | 226 |
| `雨聲` | 220 |
| `clay` | 160 |

## (c) Channels with human_asmr videos

Channels in master: **5,205**. With ≥1 human_asmr video: **3,336**; ≥3: **1,628**; ≥10: **1,055**.
Share of human_asmr videos from top 5% of channels that have ≥1 human_asmr video: **0.3396** (167 / 3336 channels).

## (d) Old sleep tag vs `sleep_strict` / `relax_only` (human_asmr only)

human_asmr n = **145,110**.

### Old `is_sleep_related` × `sleep_strict`

| | sleep_strict=False | sleep_strict=True |
|--|-------------------:|------------------:|
| is_sleep_related=False | 72,345 | 3,110 |
| is_sleep_related=True | 16,626 | 53,029 |

### Old `is_sleep_related` × `relax_only`

| | relax_only=False | relax_only=True |
|--|-----------------:|----------------:|
| is_sleep_related=False | 74,412 | 1,043 |
| is_sleep_related=True | 24,755 | 44,900 |

Among human_asmr ∩ old sleep-tagged (n=69,655): **13,431** (0.1928) have `relax_only` and not `sleep_strict` (relax-type words only under the new lists). Additionally **3,195** match neither `sleep_strict` nor `relax_only` (old sleep hits outside the new lists).

## (e) Comment sample coverage under human_asmr

Comments: **85,224**; videos in sample: **900**.

| language_group | videos | human_asmr videos | comments | comments on human_asmr |
|----------------|-------:|------------------:|---------:|-----------------------:|
| en | 150 | 134 | 14,941 | 13,341 |
| es | 150 | 150 | 14,938 | 14,938 |
| fr | 150 | 147 | 13,030 | 12,731 |
| ja | 150 | 139 | 14,829 | 13,729 |
| ko | 150 | 81 | 14,659 | 8,095 |
| zh | 150 | 40 | 12,827 | 3,734 |

Language groups with **&lt;150** human_asmr videos in the comment sample: en (134), fr (147), ja (139), ko (81), zh (40).

## (f) Douyin and TikTok ambient matches

### Douyin `source_keyword` counts

| source_keyword | n |
|----------------|--:|
| 采耳 | 143 |
| 口腔音 | 93 |
| 刮擦音 | 89 |
| 声控助眠 | 78 |
| ASMR | 76 |
| 敲击音 | 25 |
| 助眠 | 12 |
| 白噪音 | 12 |

Douyin n=528: **17** match any `ambient_noise` term in title/desc.

TikTok n=168: **12** match any `ambient_noise` term in `caption`.

## (g) Mentions of white noise / ambient in web/ and docs

Found **23** matching lines:

- `web/data/douyin_keywords.json:1: {"meta":{"source_files":["douyin_trial/douyin_asmr_master.csv"],"generated_at":"2026-11-22T04:48:59Z","n":528,"caveats":["No play counts or region fields are available in this Douy`
- `web/data/trends_country_v2.json:1: {"meta":{"source_files":["trends_timeseries.csv","config/trends_batches.csv"],"generated_at":"2026-11-22T04:48:48Z","n":31,"metric":"own_peak_within_country","complete_months_dropp`
- `web/data/youtube_yearly.json:1: {"meta":{"source_files":["yt_master.csv"],"generated_at":"2026-11-22T04:48:57Z","n":342423,"duration_markers_sec":[{"sec":3600,"label":"1 hour"},{"sec":28800,"label":"8 hours"}],"d`
- `web/data/wiki_lang.json:1: {"meta":{"source_files":["wiki_pageviews_monthly.csv"],"generated_at":"2026-11-22T04:48:59Z","n":81464,"n_concepts":30,"n_languages":24,"access_used":"all","agent_filter":"user","l`
- `docs/YOUTUBE_KEYWORDS.md:177: - `whitenoise``
- `docs/YOUTUBE_KEYWORDS.md:178: - `white noise``
- `docs/YOUTUBE_KEYWORDS.md:179: - `白噪音``
- `docs/YOUTUBE_KEYWORDS.md:184: - `brown noise``
- `docs/YOUTUBE_KEYWORDS.md:230: | `white noise` | 8161 | 0.0655 | possible false positive (everyday word) |`
- `docs/YOUTUBE_KEYWORDS.md:231: | `白噪音` | 7856 | 0.0630 |  |`
- `docs/YOUTUBE_KEYWORDS.md:249: | `whitenoise` | 1407 | 0.0113 |  |`
- `docs/YOUTUBE_KEYWORDS.md:254: | `brown noise` | 1081 | 0.0087 | possible false positive (everyday word) |`
- `docs/YOUTUBE_KEYWORDS.md:292: - Baby Sleep White Noise 💤 Womb Sounds & Heartbeat to Calm Baby & Sleep Fast`
- `docs/YOUTUBE_KEYWORDS.md:299: - Jacuzzi for Morning Energy | Clear Ocean Ambience for Fresh Focus | White Noise`
- `docs/YOUTUBE_SAMPLE_CHECK.md:47: - Sleep-related words (regex covering sleep/助眠/失眠/수면/眠/insomni/白噪音/white noise/relax/放鬆/冥想/meditation, etc.): **90 / 400**.`
- `config/yt_classes.yaml:47: # Human-performed / close-mic triggers (not ambient noise).`
- `config/yt_classes.yaml:118: # Ambient / continuous noise (excluded from published human-ASMR scope).`
- `config/yt_classes.yaml:119: ambient_noise:`
- `config/yt_classes.yaml:120: - white noise`
- `config/yt_classes.yaml:121: - whitenoise`
- `config/yt_classes.yaml:122: - 白噪音`
- `config/yt_classes.yaml:123: - brown noise`
- `config/yt_classes.yaml:149: - ambient`

## (h) Published JSON carrying white-noise / non-ASMR concepts

`wiki_lang.json` has **30** concepts. Noise / sleep-adjacent concept names: ['Binaural beats', 'Brown noise', 'Pink noise', 'Sleep', 'Sleep deprivation', 'Sleep disorder', 'Sleep hygiene', 'White noise']

| file | bytes | notes |
|------|------:|-------|
| `comment_themes.json` | 5,259 |  |
| `countries-50m.json` | 756,420 |  |
| `creator_country.json` | 9,536 |  |
| `douyin_keywords.json` | 2,624 | may include noise-related Douyin keywords |
| `insomnia_vs_asmr.json` | 10,050 |  |
| `tiktok_origin.json` | 2,875 |  |
| `trends_country_v2.json` | 13,334 |  |
| `trends_monthly_v2.json` | 15,631 |  |
| `wiki_lang.json` | 758,750 | 30 concepts stored; FE charts ASMR only today |
| `youtube_yearly.json` | 8,414 | duration group label mentions white noise example |

