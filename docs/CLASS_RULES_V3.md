# Classification rules v3

## Definitions

- **asmr_labelled**: ASMR/ear-care label and not ambient under v3.
- **Tier A**: label + human trigger + no strong/nature ambient words in haystack.
- **Tier B**: label only (no human trigger).
- **Tier C**: label + human trigger + ambient/nature words present (but not ambient-classified).
- **ambient_labelled_asmr**: label + (strong ambient anywhere **or** nature in **title** with no human/object trigger).
- **noise_not_asmr**: ambient rule without ASMR label.
- **long_B**: tier B AND duration ≥ 3 hours (10800 s). Flag only; not reclassified; **excluded from duration charts**.
- **sleep_title**: sleep term in the **TITLE** only (primary).
- **sleep_v2**: title/tags, or ≥2 distinct terms in description (secondary robustness).

Bare microphone words (`binaural`, `3dio`, `雙耳`/`双耳`) are **not** strong ambient; keep `binaural beats`, `isochronic`, brainwave/脑波/腦波, `432 hz`.

## Strong ambient list (final)

`white noise`, `whitenoise`, `白噪音`, `白噪声`, `brown noise`, `pink noise`, `green noise`, `棕色噪音`, `棕噪音`, `粉紅噪音`, `粉红噪音`, `백색소음`, `ホワイトノイズ`, `ブラウンノイズ`, `ピンクノイズ`, `bruit blanc`, `ruido blanco`, `weißes rauschen`, `weisses rauschen`, `ruído branco`, `белый шум`, `binaural beats`, `binaural beat`, `isochronic`, `brainwave`, `腦波`, `脑波`, `432 hz`, `432hz`, `fan noise`, `fan sounds`, `vacuum noise`, `vacuum`, `hair-dryer noise`, `hair dryer noise`, `hairdryer noise`, `womb sounds`, `womb sound`, `heartbeat sounds`, `heartbeat sound`, `heartbeat`

## Nature title-only list (final)

`rain`, `thunder`, `ocean`, `waves`, `water`, `fireplace`, `forest`, `nature sounds`, `ambience`, `ambient`, `雨聲`, `雨声`, `雨音`, `雷聲`, `雷声`, `雷雨`, `海浪`, `流水`, `水聲`, `水声`, `篝火`, `柴火`, `壁爐`, `壁炉`, `風聲`, `风声`, `自然音`, `環境音`, `环境音`, `빗소리`, `천둥`, `파도소리`, `모닥불`, `자연의 소리`, `자연소리`, `백색소음`, `빗소리 asmr`, `雨音`, `波の音`, `焚き火`, `環境音`, `自然音`, `作業用`, `川の音`, `雷雨`, `lluvia`, `olas`, `trueno`, `ruido blanco`, `pluie`, `orage`, `vagues`, `bruit blanc`, `Regen`, `Gewitter`, `Wellen`, `weißes Rauschen`, `chuva`, `trovão`, `ondas`, `ruído branco`, `дождь`, `гром`, `волны`, `белый шум`, `костёр`, `камин`

## Before / after counts (v2 → v3)

v2 classes: {'other': 190210, 'asmr_labelled': 146377, 'ambient_labelled_asmr': 16886, 'noise_not_asmr': 14553}
v3 classes: {'other': 188050, 'asmr_labelled': 152391, 'noise_not_asmr': 16713, 'ambient_labelled_asmr': 10872}
v2 asmr_labelled tiers: {'A': 87945, 'B': 51074, 'C': 7358}
v3 asmr_labelled tiers: {'A': 91151, 'B': 51178, 'C': 10062}
long_B count: **1994**

## 20 largest moves (v2 → v3, by duration)

| title | move | tier | duration |
|---|---|---|---:|
| 지붕에 떨어지는 빗소리는 긴장을 풀고 천천히 깊은 잠에 빠지도록 도와줍니다. 🛌🛌 | asmr_labelled→ambient_labelled_asmr |  | 86400.0 |
| 빗소리 - 천둥소리와 함께 창가에 내리는 비ㅣ수면과 공부, 휴식을 위한 폭우 🌧️🌧️ | asmr_labelled→ambient_labelled_asmr |  | 86400.0 |
| 빗소리 asmr - 잠시도 쉬지 않고 쏟아지는 폭우 ⚡ 불면증에 좋은 최고의 빗소리 ⚡ 천둥 번개 빗소리 ⛈ 시원한 빗소리 ASMR | asmr_labelled→ambient_labelled_asmr |  | 86400.0 |
| Green Noise Sleep 24 Hours / Black Screen / Soft Natural Sound Day & Night | other→noise_not_asmr |  | 86340.0 |
| Emerald Green Noise 24 Hours Sleep Immediately Black Screen | other→noise_not_asmr |  | 84337.0 |
| 물끓는 소리 12시간 , ver. 2, 수면에 도움주는 ASMR | asmr_labelled→ambient_labelled_asmr |  | 45370.0 |
| 물끓는소리  ver. 1, 12시간, 수면에 도움되는 asmr | asmr_labelled→ambient_labelled_asmr |  | 44193.0 |
| 💤수면유도 빗소리 5분뒤 화면꺼짐 / 중간광고X / 12시간 / 백색소음 / 수면 / 꿀잠 / 빗소리 | other→noise_not_asmr |  | 43237.0 |
| [12시간] 델타파 + 빗소리 + 쉬소리 백색소음 / 미국 수면의학회 추천 / 수면음악 / 불면증 치료 | asmr_labelled→ambient_labelled_asmr |  | 43200.0 |
| 432 Hz Crystal Bowls for Deep Sleep / Let Your Mind Drift Away | other→noise_not_asmr |  | 43200.0 |
| Your Body Is Aligned With These Frequencies (Crystal Bowls) | other→noise_not_asmr |  | 43200.0 |
| 【赤ちゃんが泣き止む音】胎内音＋ママの心音でぐっすり眠れる｜まぶしくない黒画面・途中広告なし | ambient_labelled_asmr→asmr_labelled | B | 43200.0 |
| GOLD LEAF CALM INFUSION SOUND / 12 Hrs / Gold Leaf Glitter with Feathery Liquid Edges / Black Screen | other→noise_not_asmr |  | 43200.0 |
| THOUGHT LOOP EXIT PORTAL NOISE / 12 Hours / Calming Garden Breezes and Gentle Rhythms of Nature | other→noise_not_asmr |  | 43200.0 |
| ICE CRYSTAL BURNOUT AUDIO BALM / 12 Hours / Black Screen / Calming Sounds to Ease Overthinking | other→noise_not_asmr |  | 43200.0 |
| PEACE PORTAL MIND SHOWER / 12 Hours / Black Screen / No Midway Ads / Relax/ Calm Anxiety/ Focus | other→noise_not_asmr |  | 43200.0 |
| HOMEOSTATIC ZEN NOISE / 12 Hours / Black Screen / No Midway Ads / Sleep/ Focus/ Calm Anxiety | other→noise_not_asmr |  | 43200.0 |
| MIND GROUNDING EARTH FREQUENCY NOISE / 12 Hours / Black Screen / No Midway Ads / Relax/ Sleep/ Focus | other→noise_not_asmr |  | 43200.0 |
| 12H Deep Healing Music for Body & Soul - 432 Hz Music | other→noise_not_asmr |  | 43200.0 |
| [12 Hours] Medicine Buddha Meditation for Healing & Cleansing / 432Hz Deep Meditation Music | other→noise_not_asmr |  | 43200.0 |

Korean `빗소리` titles from v2 largest-moves list parsed: n=3; now ambient among those: **3**. All title-containing `빗소리` that were asmr_labelled in v2 and ambient in v3: **182**.

## Sleep title vs sleep_v2 by language

Note: lexicon coverage differs by script (Hangul has very few terms); **cross-language sleep shares are not comparable**.

| lang | n | sleep_title n | share | sleep_v2 n | share | sleep_v2 only |
|---|---:|---:|---:|---:|---:|---:|
| en | 142030 | 19205 | 0.1352 | 43004 | 0.3028 | 23799 |
| ja | 30263 | 6762 | 0.2234 | 11749 | 0.3882 | 4987 |
| zh | 154987 | 23310 | 0.1504 | 38749 | 0.25 | 15439 |
| ko | 17958 | 1708 | 0.0951 | 3647 | 0.2031 | 1939 |
| es | 3883 | 310 | 0.0798 | 1211 | 0.3119 | 901 |
| fr | 3069 | 234 | 0.0762 | 1254 | 0.4086 | 1020 |

## Samples (for manual judgement; not judged here)

- `data/class_check_v3_ambient.csv` (20)
- `data/class_check_v3_nonlatin_nature.csv` (20)
- `data/class_check_v3_longB.csv` (20)
- `data/class_check_v3_sleep_title.csv` (20 sleep_title + 10 sleep_v2-not-title)
- `data/class_check_v3_A.csv` (10)
