# Classification rules v3.2

## Rules

- **White-noise family** (white/brown/pink/green noise, 白噪音, binaural beats, isochronic, brainwave, 432 hz, fan/hair-dryer noise, womb sounds, …):
  - **strict**: exclude (ambient) if the family appears **anywhere** (title/tags/description/topics).
  - **title_only**: exclude only if in the **TITLE**; if only in tags/description → keep in `asmr_labelled` and set `ambient_tag_only`.
- Other strong ambient (vacuum noise, heartbeat sounds, …) still exclude **anywhere** under both rules.
- Nature list remains **title-only**; v3.2 adds inflections (rainy, rainfall, thunderstorm(s), waterfall(s), seaside, …).
- Latin terms: Unicode whole-word; CJK/Hangul: substring (unchanged).
- **Script group** (title-based; replaces lingua for downstream): Hangul→Korean script; kana→Japanese script; Han without kana/Hangul→Han script (mostly Chinese); Latin letters only→Latin script; else→other. `declared_language` = defaultAudioLanguage/defaultLanguage when present.
- Do **not** use da / tl / und language labels.

## White-noise family list

`white noise`, `whitenoise`, `白噪音`, `白噪声`, `brown noise`, `pink noise`, `green noise`, `棕色噪音`, `棕噪音`, `粉紅噪音`, `粉红噪音`, `백색소음`, `ホワイトノイズ`, `ブラウンノイズ`, `ピンクノイズ`, `bruit blanc`, `ruido blanco`, `weißes rauschen`, `weisses rauschen`, `ruído branco`, `белый шум`, `binaural beats`, `binaural beat`, `isochronic`, `brainwave`, `腦波`, `脑波`, `432 hz`, `432hz`, `fan noise`, `fan sounds`, `hair-dryer noise`, `hair dryer noise`, `hairdryer noise`, `womb sounds`, `womb sound`

## Nature inflections added

`rainy`, `raining`, `rainfall`, `rainstorm`, `thunderstorm`, `thunderstorms`, `waterfall`, `waterfalls`, `seaside`, `pluvieux`, `lluvioso`, `chuvoso`, `Regenwetter`, `Unwetter`, `瀑布`, `瀑布声`, `雨天`, `豪雨`, `大雨`, `장마`, `폭우`

## Counts: strict vs title_only

strict classes: {'other': 193894, 'asmr_labelled': 148569, 'noise_not_asmr': 16362, 'ambient_labelled_asmr': 9201}
title_only classes: {'other': 198183, 'asmr_labelled': 151626, 'noise_not_asmr': 12073, 'ambient_labelled_asmr': 6144}
strict asmr_labelled tiers: {'A': 91070, 'B': 53795, 'C': 3704}
title_only asmr_labelled tiers: {'A': 91070, 'B': 54714, 'C': 5842}
ambient_tag_only flag (title_only rule): **3057**
videos ambient→asmr_labelled under title_only: **3057**
sleep_title share among asmr_labelled excl long_B — strict: **0.1446**; title_only: **0.1509**

### Tier transitions (strict tier → title_only tier; — = not labelled under that rule)

| tier_strict | tier_title_only | n |
|---|---|---:|
| A | A | 91070 |
| B | B | 53795 |
| C | C | 3704 |
| — | C | 2138 |
| — | B | 919 |

## Inflection moves

Titles matching a new inflection but not the pre-v3.2 nature list: **1217**.
Of those, nature-ambient classified (→ ambient/noise) under title_only: **1055**.
Of those, remaining asmr_labelled (human/object trigger present): **123**.

### 10 titles newly ambient via inflections

- Sleep in the tent on a rainy day
- It's raining. I'll sleep in the car! - Car Camping
- Heavy Thunderstorm Sounds
- It's raining, but we'll take you safely. 🚗🌂
- study with me cafe | 1-hour, coffee shop asmr, rainy day 🌧️ no music [with background noise]
- Midnight Creamy Pink Ramen 🍜🌧️ | Rainy Night Cooking ASMR • Ghibli Inspired
- Rainy Village Chicken Biryani 🍗🌧️ | Ghibli-Inspired Food ASMR | Traditional Cooking
- KOREAN ASMR｜비오는 날 귀투귀 수다｜Ear to Ear Whispering on a rainy day
- I'll wake you up when I arrive, you can sleep comfortably | rainy highway driving [No AI]
- ASMR Haircut on the Rainy Day

### 10 titles with new inflection hits that stay asmr_labelled

- asmr Cuddling with your girlfriend [rainy sounds] [2 hour] [no talking] [soft breathing]
- Rainy ASMR || Lay Your Head on My Lap... [Whispers] [Scritchies] [Cuddles] [Real Thunderstorm] ☔️
- Troll Tower but it's Rainy Keyboard ASMR + Aula F75 Unboxing!
- 【ASMR】雨天采耳店 硬質頑固耳垢|👂귀청소​|EarCleaning
- 【ASMR】下雨天小鎮采耳店 刻薄的店員|掏耳|吹氣|👂귀청소|RoleplayASMR
- ASMR//Soft Reading Chinese Short Story/中文耳语【床边故事 Bedtime Story】鲁迅《祝福》with raining sounds
- ASMR 角色扮演模拟耳朵放松护理，雨天掏耳，捂耳，精油按摩~role-playing simulation of ear cleaning
- ASMR- Assorted Triggers w/ Whisper Ramble (thunderstorm, tapping, mouth sounds, hand movements, etc)
- 비오는 휴가날☔ 동생 귀파주기ㅣ면봉&쇠귀이개&머리말려주기&로션ㅣa rainy holiday☔Cleaning your ears.
- ASMR 1 Hour+ of tingly comfort ⛈️ (from a gentle thunderstorm to massage rp, clicky whispers & more😴

## Script groups (asmr_labelled title_only, excl long_B)

Distribution: {'Latin script': 98654, 'Han script (mostly Chinese)': 19398, 'Japanese script': 18942, 'Korean script': 11867, 'other': 357}

Sample: `data/script_check.csv` (30 titles per group; not judged).

## Samples (titles only; not judged)

- `data/class_check_v32_ambient_tag_only.csv` (20 newly kept under title_only)
- `data/class_check_v32_inflect.csv` (20 newly excluded by inflections)

Output frame: `data/yt_classes_v32.csv` (n=368,026).

