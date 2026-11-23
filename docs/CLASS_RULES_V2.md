# Classification rules v2

## Definitions

- **asmr_labelled**: ASMR/ear-care label in title/tags/description **and** not ambient under v2.
- **Tier A**: label + human trigger + no strong ambient words.
- **Tier B**: label only (no human trigger).
- **Tier C**: label + human trigger + ambient/nature words present (but not ambient-classified because triggers block nature-title rule; strong ambient still forces ambient class).
- **ambient_labelled_asmr**: has label + (strong ambient anywhere **or** nature words in **title** with no human/object trigger).
- **noise_not_asmr**: ambient rule without ASMR label.
- **Sleep v2**: sleep terms in TITLE or TAGS, or ≥2 distinct terms in description only.

Generic nature words only in tags/description no longer make a video ambient.

## Before / after counts

v1: {'other': 168888, 'human_asmr': 145110, 'noise_not_asmr': 20115, 'ambient_labelled_asmr': 8310}
v2: {'other': 190210, 'asmr_labelled': 146377, 'ambient_labelled_asmr': 16886, 'noise_not_asmr': 14553}
asmr_labelled tiers: {'A': 87945, 'B': 51074, 'C': 7358}

## Rescued leak patterns

| pattern | n title match | asmr_labelled v2 | ambient v2 | was ambient v1 | rescued |
|---|---:|---:|---:|---:|---:|
| barber_shampoo | 404 | 337 | 50 | 9 | 1 |
| nape_tracing | 4 | 4 | 0 | 1 | 1 |
| butter_cracking_ocean | 1 | 1 | 0 | 1 | 1 |

## 20 largest moves (by duration)

| title | move | tier | duration |
|---|---|---|---:|
| 지붕에 떨어지는 빗소리는 긴장을 풀고 천천히 깊은 잠에 빠지도록 도와줍니다. 🛌🛌 | ambient_labelled_asmr→asmr_labelled | B | 86400.0 |
| 빗소리 - 천둥소리와 함께 창가에 내리는 비ㅣ수면과 공부, 휴식을 위한 폭우 🌧️🌧️ | ambient_labelled_asmr→asmr_labelled | B | 86400.0 |
| 빗소리 asmr - 잠시도 쉬지 않고 쏟아지는 폭우 ⚡ 불면증에 좋은 최고의 빗소리 ⚡ 천둥 번개 빗소리 ⛈ 시원한 빗소리 ASMR | ambient_labelled_asmr→asmr_labelled | B | 86400.0 |
| Deep Sleep White Noise Sounds, Ocean Waves Whispering ASMR For Sleeping at Carrapateira Beach | human_asmr→ambient_labelled_asmr |  | 43329.0 |
| White Noise - Vacuum Cleaner - Baby Sound for Sleep - No Ads During video - ASMR - 12H  👶😴🔉 | human_asmr→ambient_labelled_asmr |  | 43282.0 |
| ⨀ Windmill Sounds for Deep Sleep / 12 Hours of Relaxing Windmill Ambience / No Music ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ OV-10 Bronco Steady Flight Sounds ✈️ / Twin Turboprop Engine Ambience for Sleep / 12 Hours ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Model Train Sounds for Sleep 🚂 Relaxing Railway Ambience & Rhythmic Track Sounds / 12 Hours ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Old School Bus Idling Sounds for Sleep / Relaxing Diesel Engine Ambience – 12 Hours ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ The Heartbeat of the Universe / Black Hole Merger Sounds Transformed into a Cosmic Heartbeat ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ ALCO S4 Locomotive Idle Sounds for Sleep 🚂 / Vintage Diesel Engine Ambience / 12 Hours ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Large Raindrops Hitting Window 🌧️ / Cozy Rain Ambience for Sleep & Relaxation ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Navy Sleep Sounds ⚓ Ship Engines, Ocean Waves & Sonar Ambience / Relaxing Military Bunk Audio ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Flag Flapping in the Breeze + Gentle Metal Clanging / Wind Ambience for Deep Sleep & Relaxation ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Rain on a Metal Roof for Deep Sleep 🌧️ Relaxing Storm Sounds for Insomnia, Stress Relief & Focus ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Gargantua: Ambient Supermassive Black Hole Music for Deep Sleep / Interstellar Space Ambience ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ Morse Code Radio Static for Sleep / Distant Signals in the Night / Vintage Shortwave Ambience ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| ⨀ jupiter & saturn sonifications / deep space ambient sleep soundscape ⨀ | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| Panzer Tank on the Move ⨀ Authentic WWII Tank Engine & Track Sounds for Sleep, Study & Immersion | human_asmr→ambient_labelled_asmr |  | 43200.0 |
| Forest Ambience White Noise / Deep Sleep, Study, Relax / 12 Hours | human_asmr→ambient_labelled_asmr |  | 43200.0 |

## Sleep share v1 vs v2 by language

Note: lexicon coverage differs by script (Hangul has very few terms); **cross-language sleep shares are not comparable**.

| lang | n | sleep_share_v1 | sleep_share_v2 | lost v1→not v2 | gained |
|---|---:|---:|---:|---:|---:|
| en | 142030 | 0.3214 | 0.3028 | 2223 | 0 |
| ja | 30263 | 0.4001 | 0.3882 | 399 | 0 |
| zh | 154987 | 0.2631 | 0.25 | 910 | 0 |
| ko | 17958 | 0.2177 | 0.2031 | 153 | 0 |
| es | 3883 | 0.3269 | 0.3119 | 87 | 0 |
| fr | 3069 | 0.4165 | 0.4086 | 40 | 0 |

## Samples (for manual judgement; not judged here)

- `data/class_check_v2_A.csv` / `_B.csv` / `_C.csv` (10 each)
- `data/class_check_v2_ambient.csv` (20)
- `data/class_check_v2_sleep.csv` (20 sleep v2 + 10 v1-not-v2)
- `data/class_check_v2_other.csv` (20 other + human trigger, no label)
