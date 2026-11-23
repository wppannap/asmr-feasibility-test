# Classification rules v3 check → v3.1

## 1. Term-matching code (v3.1)

```python
def term_is_cjk_or_hangul(term: str) -> bool:
    """CJK / Hangul / kana terms keep substring matching; Latin uses whole-word."""
    return bool(term and _CJK_HANGUL_RE.search(term))

def term_matches(text_lc: str, term: str) -> bool:
    """Lowercased text + term. Latin: Unicode-aware whole word; CJK/Hangul: substring."""
    if not term:
        return False
    t = term.lower()
    if term_is_cjk_or_hangul(term):
        return t in text_lc
    # Whole-word: edges must not be Unicode word characters (\w).
    return re.search(rf"(?<!\w){re.escape(t)}(?!\w)", text_lc) is not None

def has_any(text: str, terms: list[str]) -> bool:
    tl = text.lower()
    return any(term_matches(tl, t) for t in terms if t)

def matched(text: str, terms: list[str]) -> list[str]:
    tl = text.lower()
    return [t for t in terms if t and term_matches(tl, t)]

```

### Latin false-positive probes (substring vs whole-word)

**`rain`**
- `rain`: substring=True, whole_word=True
- `brain`: substring=True, whole_word=False
- `train`: substring=True, whole_word=False
- `terrain`: substring=True, whole_word=False
- `drain`: substring=True, whole_word=False
- `grain`: substring=True, whole_word=False

**`water`**
- `water`: substring=True, whole_word=True
- `waterfall`: substring=True, whole_word=False
- `underwater`: substring=True, whole_word=False

**`waves`**
- `waves`: substring=True, whole_word=True
- `microwaves`: substring=True, whole_word=False

**`regen`**
- `regen`: substring=True, whole_word=True
- `regeneration`: substring=True, whole_word=False

**`vacuum`**
- `vacuum`: substring=True, whole_word=True
- `vacuum cleaner noise`: substring=True, whole_word=True

**`heartbeat`**
- `heartbeat`: substring=True, whole_word=True
- `heartbeat sounds`: substring=True, whole_word=True

### Title counts: substring match but not whole-word (Latin probes)

| term | substr_not_word_n |
|---|---:|
| rain | 4302 |
| water | 939 |
| waves | 28 |
| regen | 221 |
| vacuum | 4 |
| heartbeat | 102 |

v3 used substring (`t.lower() in text.lower()`) for **all** ambient/nature/human lists. v3.1 switches Latin-script terms to Unicode-aware whole-word matching; CJK and Hangul keep substring matching.

## 2. Lexicon edits

- Removed bare `vacuum` from strong ambient (kept `vacuum noise`, added `vacuum cleaner noise`).
- Removed bare `heartbeat` (kept `heartbeat sounds` / `heartbeat sound`; `womb sounds` unchanged).
- Removed `作業用` from nature title-only (study-BGM cue, not nature).

### Move counts (class changed v3 → v3.1 among videos hitting removed terms)

- Bare `vacuum` (not `vacuum noise` / `vacuum cleaner noise`) & class moved: **45**
- Bare `heartbeat` (not `heartbeat sound*`) & class moved: **649**
- Title contains `作業用` & class moved: **434**

#### 10 example titles — vacuum moves

- 4 in 1 Car Vacuum Cleaner 120W Power Wet Dry Auto Portable Vacuums Air Compressor Tire Pressure
- #proton #x50 #x70 #trunkmat Proton X70 / X50 rear trunk mat.
- #rescue #emergency #tyrepressure #vacuum #gbcommerce
- ASMR 双声道极致捂耳：左右切换的真空压力音~Binaural Ultimate Ear Cupping: L-R Switching Vacuum Pressure Sounds
- INSANE KEYBOARDS The Ultimate Industrial ASMR Series #shorts
- Vacuum Cleaner Sound - PURE SOUND - Black Screen #sleepsound #vacuumcleaner #henry #Hetty #Hoover
- HENRY - Vacuum Cleaner Sound #Henry #vacuumcleaner #sleepsound #blackscreen
- Henry Vacuum Cleaner Black Screen Sleep Sound - 10 HOUR #SleepSound  #VacuumCleaner #Blackscreen
- CHECK OUT MY CHANNEL FOR HENRY SLEEP VIDEOS AND MORE #VacuumCleaner #Shorts #SleepSound #SleepShorts
- Vacuuming my car 1 HOUR garage hoover relaxing atmosphere DARK SCREEN

#### 10 example titles — heartbeat moves

- Black Screen | Sleeping on Boyfriend's chest 💖 [Breathing] [Heart Beat] [Rain] [ASMR]
- asmr Cuddling with your girlfriend [rainy sounds] [2 hour] [no talking] [soft breathing]
- Sleep Now ASMR | 4HR Deep Ear Cleaning, Ear Cupping & Heartbeat (No Talking)
- 【ASMR】快眠掏耳愛撫♡睡前給你安心的抱抱和KISS ♡【甘い囁き/両耳吐息/耳かき/耳ふー/心音/Ear Cleaning/Heartbeat/Relaxing】#3dio｜祈Iruni​​
- 【全肯定ASMR】我知道這個世界很辛苦♡但現在一切有我在｜ 囁き/耳のマッサージ/耳かき【羽芝扉扉 Uchi Fifi】
- [ASMR] face massage| Ear Cleaning make you feeling better | ASMR Chinese Traditional Massage
- ASMR免疫者請進！超困的四種助眠刷Mic~ 你的免疫有救了！【Sumimi ASMR】
- 【一介ASMR】心跳+呼吸 30分鐘 | Heartbeat & Breathing 30 min
- 助眠ASMR｜超～舒適人聲哄睡～惡龍咆哮/親親/噗尼/呼吸聲都有！
- 【女性向中文音聲】溫柔哄睡：失眠了？我來哄你入睡吧～（後段寢息聲 一路陪你到睡著）

#### 10 example titles — 作業用 moves

- 【Study with me】ひかるとマサと一緒に勉強【作業用】 #パラ高
- 【勉強用/作業用BGM】自習室の音【環境音ASMR】
- 【白噪音】⚡美丽树林雷雨声適合放鬆睡覺，睡覺的雨聲音樂，雨聲助睡眠，助眠BGM，BGM 作業用，雨聲asmr，失眠，ptsd，sleep music， 焦慮音樂，憂鬱症音樂，BGM music，放鬆B
- 【二創系列 】說外星人的故事給安妮亞 | 致敬老高與小茉 | 作業用bgm| 曾軒 ZENG,XUAN
- 【作業用BGM】股票AI歌曲串燒 Part2【蕾蒂希婭 Letizia】
- 【作業用BGM】股票AI歌曲串燒【蕾蒂希婭 Letizia】
- 【ASMR】最高に寝れる1000＋種類の音💤プレビューコレクション(4周年記念動画/作業用＆睡眠用)
- 雨の音、車の中。深い眠りへ導く メンタルヘルス／作業用 瞑想用 睡眠用 　Raindrop in a CarWindow
- Deep Focus Music 提高注意力 -【100%無廣告】超專心! 學習專注力讀書音樂 ♫ 作業用BGM , 勉強用BGM 鋼琴純音樂 ☕ 一個人安靜的工作&讀書
- 宮崎駿 - 水晶音樂 純音樂 高畫質加長版~ 閱讀和學習音樂 ,集中的音樂,學習專注力讀書音樂【作業用,勉強用BGM】 Relaxing Piano Music For Study and Focus
##### vacuum: ambient→asmr_labelled

- ASMR 双声道极致捂耳：左右切换的真空压力音~Binaural Ultimate Ear Cupping: L-R Switching Vacuum Pressure Sounds
- INSANE KEYBOARDS The Ultimate Industrial ASMR Series #shorts
- ASMR 🔥 She UNLOCKED My Stiff Neck! Deep Neck & Shoulder Massage
- 시각적팅글 폭발! 피부관리 ASMR 애니메이션 / 모공 청소, 여드름 압출, 안티에이징 까지
- ASMR  - Whispered tapping and scratching review of sebo vacuum - LOFI
- 진공청소기소리 1시간 Vacuum cleaner sound
- ASMR🎧Satisfying Sounds | No Talking ASMR Cupping #naturalsounds #shorts
- ASMR Cupping Therapy🎧Satisfying Sounds | No Talking ASMR
- [ASMR]🎧Cupping Therapy to Relax Her Back | New Silicone Cupping Set🎵 | No Talking
- ASMR Completely Hypnotic Crisp Triggers (No Talking)

##### vacuum: asmr_labelled→ambient/noise

- (none)

##### heartbeat: ambient→asmr_labelled

- Black Screen | Sleeping on Boyfriend's chest 💖 [Breathing] [Heart Beat] [Rain] [ASMR]
- asmr Cuddling with your girlfriend [rainy sounds] [2 hour] [no talking] [soft breathing]
- Sleep Now ASMR | 4HR Deep Ear Cleaning, Ear Cupping & Heartbeat (No Talking)
- 【ASMR】快眠掏耳愛撫♡睡前給你安心的抱抱和KISS ♡【甘い囁き/両耳吐息/耳かき/耳ふー/心音/Ear Cleaning/Heartbeat/Relaxing】#3dio｜祈Iruni​​
- 【全肯定ASMR】我知道這個世界很辛苦♡但現在一切有我在｜ 囁き/耳のマッサージ/耳かき【羽芝扉扉 Uchi Fifi】
- [ASMR] face massage| Ear Cleaning make you feeling better | ASMR Chinese Traditional Massage
- ASMR免疫者請進！超困的四種助眠刷Mic~ 你的免疫有救了！【Sumimi ASMR】
- 【一介ASMR】心跳+呼吸 30分鐘 | Heartbeat & Breathing 30 min
- 助眠ASMR｜超～舒適人聲哄睡～惡龍咆哮/親親/噗尼/呼吸聲都有！
- 【女性向中文音聲】溫柔哄睡：失眠了？我來哄你入睡吧～（後段寢息聲 一路陪你到睡著）

##### heartbeat: asmr_labelled→ambient/noise

- (none)

##### 作業用: ambient→asmr_labelled

- 【二創系列 】說外星人的故事給安妮亞 | 致敬老高與小茉 | 作業用bgm| 曾軒 ZENG,XUAN
- 【ASMR】最高に寝れる1000＋種類の音💤プレビューコレクション(4周年記念動画/作業用＆睡眠用)
- 雨の音、車の中。深い眠りへ導く メンタルヘルス／作業用 瞑想用 睡眠用 　Raindrop in a CarWindow
- 【4K×ASMR】あなたがほしい超能力はどれ？【睡眠用/作業用】#relaxing #satisfying #ability
- 【4K×ASMR】あなたはどのでベッドで寝てみたい？🛏️ 【睡眠用/作業用】#relaxing #satisfying #美女
- 【4K×ASMR】至福のクリスタルフルーツカット集【作業用/睡眠用】#fruit #relaxing #satisfying
- 【4K×ASMR】あなたの家のベッドがフルーツに？！🍓🍈🍑どのベットで寝てみたい？【作業用/睡眠用】
- 【4K×ASMR】どの動物と寝てみたい？動物園の人気の動物達🦁🐼🐻🐘🦒【作業用/睡眠用】
- 【ASMR】マグマモチ？！？！🌋🫓🥡　作業用・勉強用・睡眠用 #chill #aiasmr #relax #マグマ #mochi  #food
- 【ASMR】泡を！？🛁🫧🧼もぐもぐ　作業用・勉強用・睡眠用

##### 作業用: asmr_labelled→ambient/noise

- (none)

## 3. Sleep title vs sleep_v2 by language

### Language-assignment code used in CLASS_RULES_V3.md

```python
def language_group(default_language: str, title_script: str) -> str:
    """Normalize into coarse language groups for stratification."""
    dl = (default_language or "").strip()
    ts = (title_script or "").strip()
    raw = dl or ts
    if not raw:
        return "unknown"
    low = raw.replace("_", "-").lower()
    if low.startswith("zh") or low in ("zh", "chinese"):
        return "zh"
    if low.startswith("en") or low in ("en", "english"):
        return "en"
    if low.startswith("ja") or low in ("ja", "jp", "japanese"):
        return "ja"
    if low.startswith("ko") or low in ("ko", "kr", "korean"):
        return "ko"
    if low.startswith("es") or low in ("es", "spanish"):
        return "es"
    if low.startswith("fr") or low in ("fr", "french"):
        return "fr"
    if low.startswith("pt") or low in ("pt", "portuguese"):
        return "pt"
    if low.startswith("ru") or low in ("ru", "russian"):
        return "ru"
    if low.startswith("de") or low in ("de", "german"):
        return "de"
    if low.startswith("id") or low in ("id", "indonesian"):
        return "id"
    if low.startswith("th") or low == "thai":
        return "th"
    if low.startswith("vi") or low == "vietnamese":
        return "vi"
    if low.startswith("it") or low == "italian":
        return "it"
    if low in ("latn", "latin", "other"):
        return "other"
    primary = low.split("-", 1)[0]
    return primary if primary else "unknown"

```

### Lingua-based assignment (YT_EXPLORE)

```python
def detect_languages(df: pd.DataFrame) -> pd.DataFrame:
    cache = OUT / "lang_cache.parquet"
    if cache.exists():
        cached = pd.read_parquet(cache)
        if len(cached) == len(df) and set(cached["videoId"]) == set(df["videoId"].astype(str)):
            print("  language cache hit", flush=True)
            return df.merge(cached, on="videoId", how="left")

    print("  building lingua detector…", flush=True)
    det = build_detector()
    # map YouTube default*Language codes → iso639-1 when present
    yt_code_map = {
        "en": "en", "en-US": "en", "en-GB": "en", "ja": "ja", "ko": "ko",
        "zh": "zh", "zh-CN": "zh", "zh-TW": "zh", "zh-HK": "zh",
        "es": "es", "pt": "pt", "fr": "fr", "de": "de", "it": "it", "ru": "ru",
        "th": "th", "vi": "vi", "id": "id", "tr": "tr", "ar": "ar", "hi": "hi",
        "pl": "pl", "nl": "nl", "sv": "sv", "ro": "ro", "uk": "uk", "cs": "cs",
        "hu": "hu", "el": "el", "fi": "fi", "da": "da", "no": "no", "he": "he",
        "ms": "ms", "tl": "tl", "fil": "tl",
    }

    langs = []
    confs = []
    n = len(df)
    for i, row in enumerate(df.itertuples(index=False), 1):
        if i % 20000 == 0 or i == 1:
            print(f"  lang {i}/{n}", flush=True)
        title = str(getattr(row, "title", "") or "")
        desc = str(getattr(row, "description_short", "") or "")
        text = (title + "\n" + desc).strip()
        # soft prior from YouTube fields
        dal = str(getattr(row, "defaultAudioLanguage", "") or "").strip()
        dl = str(getattr(row, "defaultLanguage", "") or "").strip()
        yt_hint = yt_code_map.get(dal) or yt_code_map.get(dl) or yt_code_map.get(dal.split("-")[0] if dal else "") or yt_code_map.get(dl.split("-")[0] if dl else "")

        if len(text) < 3:
            langs.append(yt_hint or "und")
            confs.append(1.0 if yt_hint else 0.0)
            continue
        conf_vals = det.compute_language_confidence_values(text[:2000])
        if not conf_vals:
            langs.append(yt_hint or "und")
            confs.append(0.0)
            continue
        top = conf_vals[0]
        code = ISO639.get(top.language.name, "und")
        conf = float(top.value)
        # if low conf but YT hint agrees with 2nd-best etc., still need >= 0.8
        if conf >= LANG_CONF:
            langs.append(code)
            confs.append(conf)
        elif yt_hint and conf >= 0.5 and code == yt_hint:
            langs.append(code)
            confs.append(conf)
        elif yt_hint and conf < LANG_CONF:
            # weak text signal — use YT metadata only if text is nearly empty of letters
            letterish = sum(ch.isalpha() for ch in text)
            if letterish < 8:
                langs.append(yt_hint)
                confs.append(0.85)
            else:
                langs.append("und")
                confs.append(conf)
        else:
            langs.append("und")
            confs.append(conf)

    out = pd.DataFrame({
        "videoId": df["videoId"].astype(str).values,
        "lang": langs,
        "lang_confidence": confs,
    })
    # enforce und below threshold
    out.loc[out["lang_confidence"] < LANG_CONF, "lang"] = "und"
    try:
        out.to_parquet(cache, index=False)
    except Exception:
        out.to_csv(OUT / "lang_cache.csv", index=False, encoding="utf-8-sig")
    return df.merge(out, on="videoId", how="left")
```

Doc CLASS_RULES_V3.md used `language_group(defaultLanguage, title_script)` from `fetch_comments.language_group` on **all** classified rows (not asmr_labelled), so language n can exceed asmr_labelled and the six language n sum above the labelled frame. This recompute uses lingua-based `lang` from `explore_yt_v3.detect_languages` (cache `data/unpublished/v3yt/lang_cache.parquet` or equivalent) on **asmr_labelled ∩ ¬long_B** only. Cache: `data/unpublished/v3yt/lang_cache.parquet`.

| lang | n | sleep_title n | share | sleep_v2 n | share | sleep_v2 only |
|---|---:|---:|---:|---:|---:|---:|
| en | 60399 | 6960 | 0.1152 | 24074 | 0.3986 | 17114 |
| ja | 16016 | 4126 | 0.2576 | 7923 | 0.4947 | 3797 |
| zh | 13296 | 5418 | 0.4075 | 8621 | 0.6484 | 3203 |
| ko | 7821 | 302 | 0.0386 | 1519 | 0.1942 | 1217 |
| es | 1683 | 240 | 0.1426 | 900 | 0.5348 | 660 |
| fr | 1574 | 137 | 0.087 | 981 | 0.6233 | 844 |

Six-language n sum (asmr_labelled excl long_B): **100789**.

## 4. Before / after counts (v3 → v3.1)

v3 classes: {'other': 188050, 'asmr_labelled': 152391, 'noise_not_asmr': 16713, 'ambient_labelled_asmr': 10872}
v3.1 classes: {'other': 194350, 'asmr_labelled': 148741, 'noise_not_asmr': 15906, 'ambient_labelled_asmr': 9029}
v3 asmr_labelled tiers: {'A': 91151, 'B': 51178, 'C': 10062}
v3.1 asmr_labelled tiers: {'A': 91153, 'B': 53967, 'C': 3621}
rows with class change: **8694**
long_B v3.1: **2120**

## Samples (titles only; not judged)

- `data/class_check_v31_rain_word.csv` — 20 titles matched by `rain` as substring but not whole-word under v3 rules
- `data/class_check_v31_vacuum.csv` — 10 titles (bare vacuum class movers)
- `data/class_check_v31_heartbeat.csv` — 10 titles (bare heartbeat class movers)

## Ok Trends geos with population < 1 million

Source: World Bank `SP.POP.TOTL` (mrnev=1 / country-all). Among **104** ok geos, WB returns population for **102**; missing: **SHN** (Saint Helena), **TWN** (Taiwan).

Ok geos with WB population < 1,000,000: **none**.

Saint Helena (SHN) is ok / flat / growth_ratio=-0.069 / mean_first_12=14.55 / strict_ok=False but has **no** WB `SP.POP.TOTL` series; its population is far below 1M by non-WB sources, so it is the only plausible under-1M ok geo. Taiwan is large and also lacks this WB series.

| iso3 | name | population (WB) | quality | mean_first_12 | growth_ratio | mk_class | strict_ok |
|---|---|---:|---|---:|---:|---|---|
| SHN | Saint Helena | (no WB series) | ok | 14.55 | -0.069 | flat | False |

- Headline **with** all ok geos: n=104 rising=74 flat=27 falling=3 median_growth=0.2537
- Headline **excluding SHN** (only plausible <1M ok geo): n=103 rising=74 flat=26 falling=3 median_growth=0.2537

