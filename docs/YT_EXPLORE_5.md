# YouTube explore 5 (classification v3.2)

_Generated 2026-11-23T08:05:32Z. Frame: yt_classes_v32. Script groups only (no da/tl/und/lingua). Rules: strict vs title_only. Series: Tier A only vs all asmr_labelled excl long_B._

## Headline robust / sensitive

| result | group | verdict |
|---|---|---|
| duration_sleep_gt_not | Korean script | robust |
| duration_sleep_gt_not | Japanese script | robust |
| duration_sleep_gt_not | Han script (mostly Chinese) | robust |
| duration_sleep_gt_not | Latin script | robust |
| upload_night_sleep_gt_not | JP | sensitive |
| upload_night_sleep_gt_not | KR | robust |
| upload_night_sleep_gt_not | TW | robust |
| upload_night_sleep_gt_not | HK | robust |
| comments_theme_shares | all | report-only (counts/CIs; no direction test) |

## 1. Duration (sleep_title vs not)

| rule | series | script | n_ch s/n | video ratio | ch-eq ratio | cap20 ratio | ch-boot CI | order holds (v/c/cap) |
|---|---|---|---|---:|---:|---:|---|---|
| strict | tier_A | Korean script | 58/236 | 2.8715 | 2.3555 | 3.1212 | [1.5349, 2.9711] | True/True/True |
| strict | tier_A | Japanese script | 169/340 | 2.2203 | 2.4482 | 2.641 | [1.8778, 3.5863] | True/True/True |
| strict | tier_A | Han script (mostly Chinese) | 344/522 | 1.2242 | 1.3938 | 1.0916 | [1.1046, 1.7107] | True/True/True |
| strict | tier_A | Latin script | 466/1363 | 1.8304 | 2.1666 | 2.1416 | [1.9037, 2.4544] | True/True/True |
| strict | all_labelled | Korean script | 82/303 | 2.5816 | 2.3473 | 3.5636 | [1.8214, 3.2168] | True/True/True |
| strict | all_labelled | Japanese script | 230/440 | 2.2625 | 2.7974 | 2.8788 | [2.017, 3.5602] | True/True/True |
| strict | all_labelled | Han script (mostly Chinese) | 504/717 | 1.0668 | 1.4478 | 1.1804 | [1.1962, 1.7236] | True/True/True |
| strict | all_labelled | Latin script | 567/1803 | 2.6858 | 5.3379 | 4.7649 | [3.411, 8.2347] | True/True/True |
| title_only | tier_A | Korean script | 58/236 | 2.8715 | 2.3555 | 3.1212 | [1.5586, 2.9348] | True/True/True |
| title_only | tier_A | Japanese script | 169/340 | 2.2203 | 2.4482 | 2.641 | [1.8873, 3.5814] | True/True/True |
| title_only | tier_A | Han script (mostly Chinese) | 344/522 | 1.2242 | 1.3938 | 1.0916 | [1.0932, 1.7228] | True/True/True |
| title_only | tier_A | Latin script | 466/1363 | 1.8304 | 2.1666 | 2.1416 | [1.9034, 2.4669] | True/True/True |
| title_only | all_labelled | Korean script | 86/309 | 2.5762 | 2.3416 | 3.6974 | [1.7714, 3.1956] | True/True/True |
| title_only | all_labelled | Japanese script | 237/443 | 2.2905 | 2.6635 | 2.6456 | [1.9512, 3.4383] | True/True/True |
| title_only | all_labelled | Han script (mostly Chinese) | 525/737 | 1.1977 | 1.4127 | 1.1807 | [1.1792, 1.7373] | True/True/True |
| title_only | all_labelled | Latin script | 575/1820 | 2.6923 | 5.0669 | 4.6851 | [3.3884, 7.9339] | True/True/True |

## 2. Upload clock (declared country JP/KR/TW/HK)

| rule | region | script | n_ch s/n | night sleep CI | night not CI | diff sleep−not CI | :00/:30 s | :00/:30 n | sleep>not |
|---|---|---|---|---|---|---|---:|---:|---|
| strict | HK | Han script (mostly Chinese) | 93/118 | [0.4219, 0.5895] | [0.4196, 0.5685] | [-0.0917, 0.1186] | 0.5142 | 0.4574 | True |
| strict | HK | Japanese script | 9/17 | [0.2778, 0.8333] | [0.1273, 0.5089] | [-0.0873, 0.5737] | 0.7297 | 0.1176 | True |
| strict | HK | Latin script | 9/31 | [0.3386, 0.8719] | [0.2968, 0.5667] | [-0.1242, 0.4733] | 0.7391 | 0.2048 | True |
| strict | JP | Han script (mostly Chinese) | 6/34 | [0.0601, 0.8333] | [0.5222, 0.8029] | [-0.6547, 0.1067] | 0.1376 | 0.2846 | False |
| strict | JP | Japanese script | 132/210 | [0.6492, 0.7751] | [0.5555, 0.6705] | [0.0129, 0.1803] | 0.495 | 0.4725 | True |
| strict | JP | Korean script | 7/26 | [0.5106, 1.0] | [0.4035, 0.7477] | [-0.108, 0.5075] | 0.1667 | 0.2619 | True |
| strict | JP | Latin script | 16/53 | [0.6658, 0.9378] | [0.4832, 0.7114] | [0.0292, 0.396] | 0.7585 | 0.5602 | True |
| strict | KR | Korean script | 43/158 | [0.703, 0.9021] | [0.6451, 0.7614] | [-0.0142, 0.2213] | 0.2971 | 0.3838 | True |
| strict | KR | Latin script | 17/60 | [0.5424, 0.9245] | [0.5786, 0.7743] | [-0.1334, 0.2807] | 0.5618 | 0.5138 | True |
| strict | TW | Han script (mostly Chinese) | 106/168 | [0.4682, 0.639] | [0.3828, 0.5067] | [0.0083, 0.2144] | 0.3689 | 0.3953 | True |
| strict | TW | Japanese script | 30/44 | [0.4633, 0.7657] | [0.3967, 0.6386] | [-0.0954, 0.2991] | 0.1065 | 0.1585 | True |
| title_only | HK | Han script (mostly Chinese) | 96/121 | [0.4229, 0.5809] | [0.4169, 0.5582] | [-0.0999, 0.1196] | 0.5117 | 0.4578 | True |
| title_only | HK | Japanese script | 9/17 | [0.2778, 0.8333] | [0.1264, 0.5284] | [-0.1178, 0.5798] | 0.7297 | 0.1176 | True |
| title_only | HK | Latin script | 9/31 | [0.3329, 0.8723] | [0.3065, 0.5768] | [-0.1352, 0.4844] | 0.7391 | 0.2063 | True |
| title_only | JP | Han script (mostly Chinese) | 6/34 | [0.0601, 0.7869] | [0.5182, 0.7999] | [-0.6343, 0.1423] | 0.1376 | 0.2846 | False |
| title_only | JP | Japanese script | 132/210 | [0.6387, 0.7776] | [0.5618, 0.6735] | [0.0123, 0.179] | 0.4894 | 0.4731 | True |
| title_only | JP | Korean script | 7/26 | [0.5106, 1.0] | [0.402, 0.7575] | [-0.1147, 0.5005] | 0.1667 | 0.2619 | True |
| title_only | JP | Latin script | 16/53 | [0.6627, 0.9385] | [0.4857, 0.7121] | [0.0259, 0.3802] | 0.7585 | 0.5602 | True |
| title_only | KR | Korean script | 45/161 | [0.6824, 0.8908] | [0.6481, 0.7632] | [-0.0254, 0.2067] | 0.2934 | 0.3822 | True |
| title_only | KR | Latin script | 17/60 | [0.5578, 0.9328] | [0.566, 0.7756] | [-0.1256, 0.2828] | 0.5604 | 0.5132 | True |
| title_only | TW | Han script (mostly Chinese) | 113/175 | [0.4507, 0.6149] | [0.3749, 0.4983] | [-0.0064, 0.2019] | 0.31 | 0.411 | True |
| title_only | TW | Japanese script | 34/45 | [0.4502, 0.7253] | [0.4073, 0.6533] | [-0.1222, 0.2394] | 0.2543 | 0.1771 | True |

## 3. Creators by declared country (≥30 channels)

| rule | country | n_channels | n_videos | top5% ch | share videos from top5% |
|---|---|---:|---:|---:|---:|
| title_only | US | 658 | 40542 | 33 | 0.2475 |
| strict | US | 651 | 39915 | 33 | 0.2511 |
| strict | JP | 289 | 16698 | 15 | 0.2655 |
| title_only | JP | 289 | 16826 | 15 | 0.2637 |
| title_only | TW | 235 | 4836 | 12 | 0.4977 |
| strict | TW | 227 | 4043 | 12 | 0.5115 |
| title_only | KR | 202 | 8518 | 11 | 0.3757 |
| strict | KR | 198 | 8318 | 10 | 0.3506 |
| title_only | HK | 166 | 6394 | 9 | 0.3725 |
| strict | HK | 163 | 6370 | 9 | 0.3739 |
| strict | GB | 88 | 4734 | 5 | 0.3166 |
| title_only | GB | 88 | 4788 | 5 | 0.3137 |
| title_only | CA | 76 | 4228 | 4 | 0.2725 |
| strict | CA | 75 | 4220 | 4 | 0.2718 |
| strict | IN | 74 | 3353 | 4 | 0.3537 |
| title_only | IN | 74 | 3425 | 4 | 0.3463 |
| title_only | DE | 39 | 2647 | 2 | 0.2252 |
| strict | DE | 38 | 2640 | 2 | 0.2258 |
| strict | ID | 31 | 1257 | 2 | 0.4423 |
| title_only | ID | 31 | 1257 | 2 | 0.4423 |

## 4. Comments (900-sample membership under v3.2)

### strict: keep **241** / 900
Per script group: `{'Latin script': 110, 'Japanese script': 59, 'Korean script': 39, 'Han script (mostly Chinese)': 33}`

| script | stratum | theme | n_videos | mean share | CI95 |
|---|---|---|---:|---:|---|
| Han script (mostly Chinese) | random | anxiety_stress | 8 | 0.00258 | [0.0, 0.00641] |
| Han script (mostly Chinese) | random | gratitude | 8 | 0.060996 | [0.023741, 0.103991] |
| Han script (mostly Chinese) | random | insomnia | 8 | 0.0025 | [0.0, 0.00625] |
| Han script (mostly Chinese) | random | sleep_aid_effectiveness | 8 | 0.010986 | [0.00383, 0.018562] |
| Han script (mostly Chinese) | top_view | anxiety_stress | 25 | 0.008636 | [0.0036, 0.014711] |
| Han script (mostly Chinese) | top_view | gratitude | 25 | 0.141087 | [0.080605, 0.20289] |
| Han script (mostly Chinese) | top_view | insomnia | 25 | 0.018769 | [0.010285, 0.029104] |
| Han script (mostly Chinese) | top_view | sleep_aid_effectiveness | 25 | 0.03411 | [0.024454, 0.044514] |
| Japanese script | random | anxiety_stress | 13 | 0.004784 | [0.0, 0.010338] |
| Japanese script | random | gratitude | 13 | 0.170261 | [0.109844, 0.233349] |
| Japanese script | random | insomnia | 13 | 0.012926 | [0.003786, 0.025896] |
| Japanese script | random | sleep_aid_effectiveness | 13 | 0.030709 | [0.014647, 0.047678] |
| Japanese script | top_view | anxiety_stress | 46 | 0.009373 | [0.004607, 0.015879] |
| Japanese script | top_view | gratitude | 46 | 0.114415 | [0.090708, 0.140113] |
| Japanese script | top_view | insomnia | 46 | 0.008725 | [0.005217, 0.0129] |
| Japanese script | top_view | sleep_aid_effectiveness | 46 | 0.029382 | [0.023059, 0.036538] |
| Korean script | random | anxiety_stress | 9 | 0.006063 | [0.001389, 0.010786] |
| Korean script | random | gratitude | 9 | 0.191857 | [0.14303, 0.239901] |
| Korean script | random | insomnia | 9 | 0.013796 | [0.005, 0.024352] |
| Korean script | random | sleep_aid_effectiveness | 9 | 0.02867 | [0.013519, 0.043301] |
| Korean script | top_view | anxiety_stress | 30 | 0.016003 | [0.00867, 0.028333] |
| Korean script | top_view | gratitude | 30 | 0.165074 | [0.128146, 0.206741] |
| Korean script | top_view | insomnia | 30 | 0.028007 | [0.017347, 0.040015] |
| Korean script | top_view | sleep_aid_effectiveness | 30 | 0.04001 | [0.027992, 0.053695] |
| Latin script | random | anxiety_stress | 29 | 0.006258 | [0.003448, 0.009758] |
| Latin script | random | gratitude | 29 | 0.150682 | [0.115161, 0.18571] |
| Latin script | random | insomnia | 29 | 0.00572 | [0.002962, 0.008748] |
| Latin script | random | sleep_aid_effectiveness | 29 | 0.013507 | [0.008359, 0.019265] |
| Latin script | top_view | anxiety_stress | 81 | 0.010795 | [0.007194, 0.014788] |
| Latin script | top_view | gratitude | 81 | 0.116036 | [0.094408, 0.138459] |
| Latin script | top_view | insomnia | 81 | 0.008945 | [0.006165, 0.012124] |
| Latin script | top_view | sleep_aid_effectiveness | 81 | 0.032091 | [0.023705, 0.041036] |

### title_only: keep **244** / 900
Per script group: `{'Latin script': 110, 'Japanese script': 59, 'Korean script': 41, 'Han script (mostly Chinese)': 34}`

| script | stratum | theme | n_videos | mean share | CI95 |
|---|---|---|---:|---:|---|
| Han script (mostly Chinese) | random | anxiety_stress | 8 | 0.00258 | [0.0, 0.00641] |
| Han script (mostly Chinese) | random | gratitude | 8 | 0.060996 | [0.024007, 0.101605] |
| Han script (mostly Chinese) | random | insomnia | 8 | 0.0025 | [0.0, 0.005031] |
| Han script (mostly Chinese) | random | sleep_aid_effectiveness | 8 | 0.010986 | [0.004619, 0.018525] |
| Han script (mostly Chinese) | top_view | anxiety_stress | 26 | 0.010996 | [0.004291, 0.018752] |
| Han script (mostly Chinese) | top_view | gratitude | 26 | 0.147583 | [0.087811, 0.208731] |
| Han script (mostly Chinese) | top_view | insomnia | 26 | 0.021509 | [0.011444, 0.032099] |
| Han script (mostly Chinese) | top_view | sleep_aid_effectiveness | 26 | 0.036644 | [0.026353, 0.048462] |
| Japanese script | random | anxiety_stress | 13 | 0.004784 | [0.0, 0.010342] |
| Japanese script | random | gratitude | 13 | 0.170261 | [0.112904, 0.227338] |
| Japanese script | random | insomnia | 13 | 0.012926 | [0.003077, 0.025762] |
| Japanese script | random | sleep_aid_effectiveness | 13 | 0.030709 | [0.015386, 0.04649] |
| Japanese script | top_view | anxiety_stress | 46 | 0.009373 | [0.004574, 0.015912] |
| Japanese script | top_view | gratitude | 46 | 0.114415 | [0.090053, 0.140746] |
| Japanese script | top_view | insomnia | 46 | 0.008725 | [0.005033, 0.012869] |
| Japanese script | top_view | sleep_aid_effectiveness | 46 | 0.029382 | [0.022822, 0.036357] |
| Korean script | random | anxiety_stress | 10 | 0.006457 | [0.00225, 0.010664] |
| Korean script | random | gratitude | 10 | 0.194672 | [0.149905, 0.239618] |
| Korean script | random | insomnia | 10 | 0.012417 | [0.004163, 0.021583] |
| Korean script | random | sleep_aid_effectiveness | 10 | 0.026803 | [0.013437, 0.040274] |
| Korean script | top_view | anxiety_stress | 31 | 0.015487 | [0.008387, 0.027097] |
| Korean script | top_view | gratitude | 31 | 0.168459 | [0.133366, 0.207822] |
| Korean script | top_view | insomnia | 31 | 0.027103 | [0.017097, 0.03871] |
| Korean script | top_view | sleep_aid_effectiveness | 31 | 0.04001 | [0.028702, 0.053881] |
| Latin script | random | anxiety_stress | 29 | 0.006258 | [0.003155, 0.009707] |
| Latin script | random | gratitude | 29 | 0.150682 | [0.11818, 0.184277] |
| Latin script | random | insomnia | 29 | 0.00572 | [0.002834, 0.008748] |
| Latin script | random | sleep_aid_effectiveness | 29 | 0.013507 | [0.008296, 0.019347] |
| Latin script | top_view | anxiety_stress | 81 | 0.010795 | [0.007082, 0.014839] |
| Latin script | top_view | gratitude | 81 | 0.116036 | [0.094504, 0.137742] |
| Latin script | top_view | insomnia | 81 | 0.008945 | [0.006252, 0.011818] |
| Latin script | top_view | sleep_aid_effectiveness | 81 | 0.032091 | [0.023407, 0.040783] |


## Notes

- Duration CI: channel-bootstrap of median ratio (2,000, fixed seed).
- Upload clock: declared `country` only; channel-equal night 20:00–02:00; diff CI sleep−not.
- Creators: no sleep-share comparison.
- Comments: video-cluster bootstrap on per-video theme shares; counts only.

