#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
YouTube visuals exploration — LOCAL ONLY.
Writes data/unpublished/v3yt/*.json, data/lang_check.csv, data/YT_EXPLORE.md.
No web/, no channel names/ids in reports (anonymous indices only).
"""
from __future__ import annotations

import json
import math
import re
import sys
import warnings
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "unpublished" / "v3yt"
CFG = ROOT / "config" / "yt_classes.yaml"
SEED = 42
BOOT_N = 2000
LANG_CONF = 0.8

TZ_BY_COUNTRY = {
    "JP": "Asia/Tokyo",
    "KR": "Asia/Seoul",
    "TW": "Asia/Taipei",
    "HK": "Asia/Hong_Kong",
    "SG": "Asia/Singapore",
    "MY": "Asia/Kuala_Lumpur",
    "TH": "Asia/Bangkok",
    "VN": "Asia/Ho_Chi_Minh",
    "PH": "Asia/Manila",
}

SUB_BUCKETS = [
    (0, 1_000, "<1k"),
    (1_000, 10_000, "1k-10k"),
    (10_000, 100_000, "10k-100k"),
    (100_000, 1_000_000, "100k-1M"),
    (1_000_000, float("inf"), "1M+"),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)


def load_cfg() -> dict:
    with CFG.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def haystack(row) -> str:
    return " ".join(
        [
            str(row.get("title") or ""),
            str(row.get("tags") or ""),
            str(row.get("description_short") or ""),
            str(row.get("topicCategories") or ""),
        ]
    ).lower()


def sub_bucket(n) -> str:
    if n is None or (isinstance(n, float) and math.isnan(n)):
        return "unknown"
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "unknown"
    for lo, hi, lab in SUB_BUCKETS:
        if lo <= v < hi:
            return lab
    return "unknown"


def is_nullish(s: pd.Series) -> pd.Series:
    if s.dtype == object or str(s.dtype) == "string":
        return s.isna() | s.astype(str).str.strip().isin(["", "nan", "None", "NaN", "<NA>"])
    return s.isna()


# ── 1. Base set ──────────────────────────────────────────────────────────────


def load_base(cfg: dict) -> pd.DataFrame:
    print("Loading base set…", flush=True)
    cls = pd.read_csv(
        DATA / "yt_classes.csv",
        encoding="utf-8-sig",
        usecols=["videoId", "class", "has_human_trigger", "sleep_strict", "mixed"],
    )
    human = cls[cls["class"] == "human_asmr"].copy()
    print(f"  human_asmr videos: {len(human):,}", flush=True)

    usecols = [
        "videoId", "title", "channelId", "defaultLanguage", "defaultAudioLanguage",
        "tags", "duration", "duration_sec", "viewCount", "likeCount", "commentCount",
        "publishedAt", "description_short", "title_script", "topicCategories",
    ]
    # read master in chunks filtered by videoId set
    ids = set(human["videoId"].astype(str))
    parts = []
    for chunk in pd.read_csv(
        DATA / "yt_master.csv",
        encoding="utf-8-sig",
        usecols=usecols,
        chunksize=50_000,
        low_memory=False,
        keep_default_na=True,
    ):
        chunk = chunk[chunk["videoId"].astype(str).isin(ids)]
        if len(chunk):
            parts.append(chunk)
    master = pd.concat(parts, ignore_index=True)
    print(f"  master matched: {len(master):,}", flush=True)

    ch = pd.read_csv(
        DATA / "yt_channel_country.csv",
        encoding="utf-8-sig",
        usecols=["channelId", "country", "subscriberCount"],
    )
    ch = ch.drop_duplicates("channelId", keep="last")

    df = human.merge(master, on="videoId", how="left", suffixes=("", "_m"))
    df = df.merge(ch, on="channelId", how="left", suffixes=("", "_ch"))

    for c in ["viewCount", "likeCount", "commentCount", "duration_sec", "subscriberCount"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["sleep_strict"] = df["sleep_strict"].astype(bool)
    df["mixed"] = df["mixed"].fillna(False).astype(bool)
    df["publishedAt"] = df["publishedAt"].astype(str)
    df["text"] = df.apply(haystack, axis=1)

    # trigger hits (top terms later)
    terms = [t for t in cfg["human_trigger"] if t]
    # normalize near-duplicates for vector: keep list as-is; frequency later
    df["_terms_hit"] = df["text"].apply(lambda t: [x for x in terms if x.lower() in t])

    print(f"  joined rows: {len(df):,}  channels: {df['channelId'].nunique():,}", flush=True)
    return df, terms


def report_nulls(df: pd.DataFrame) -> dict:
    fields = {
        "viewCount": df["viewCount"],
        "likeCount": df["likeCount"],
        "commentCount": df["commentCount"],
        "duration_sec": df["duration_sec"],
        "publishedAt": df["publishedAt"],
        "tags": df["tags"],
        "defaultLanguage": df["defaultLanguage"],
        "defaultAudioLanguage": df["defaultAudioLanguage"],
        "title_script": df["title_script"],
        "channel_country": df["country"],
        "subscriberCount": df["subscriberCount"],
    }
    out = {}
    for k, s in fields.items():
        out[k] = round(float(is_nullish(s).mean()), 6)

    # publishedAt time-of-day?
    pa = df["publishedAt"].dropna().astype(str)
    has_time = pa.str.contains(r"T\d{2}:\d{2}", regex=True, na=False)
    out["publishedAt_has_time_of_day_share"] = round(float(has_time.mean()), 6)
    out["publishedAt_has_time_of_day"] = bool(has_time.mean() > 0.5)

    # hidden likes: likeCount null/NaN but video exists
    likes_hidden = df["likeCount"].isna()
    out["share_hidden_likes"] = round(float(likes_hidden.mean()), 6)
    out["n_videos"] = int(len(df))
    out["n_channels"] = int(df["channelId"].nunique())
    return out


# ── 2. Language ──────────────────────────────────────────────────────────────


def build_detector():
    from lingua import Language, LanguageDetectorBuilder

    # Common ASMR-relevant languages + a few more; offline bundled models
    langs = [
        Language.ENGLISH, Language.JAPANESE, Language.KOREAN, Language.CHINESE,
        Language.SPANISH, Language.PORTUGUESE, Language.FRENCH, Language.GERMAN,
        Language.ITALIAN, Language.RUSSIAN, Language.THAI, Language.VIETNAMESE,
        Language.INDONESIAN, Language.TURKISH, Language.ARABIC, Language.HINDI,
        Language.POLISH, Language.DUTCH, Language.SWEDISH, Language.ROMANIAN,
        Language.UKRAINIAN, Language.CZECH, Language.HUNGARIAN, Language.GREEK,
        Language.FINNISH, Language.DANISH, Language.BOKMAL, Language.HEBREW,
        Language.MALAY, Language.TAGALOG, Language.CATALAN, Language.CROATIAN,
    ]
    return LanguageDetectorBuilder.from_languages(*langs).with_preloaded_language_models().build()


ISO639 = {
    "ENGLISH": "en", "JAPANESE": "ja", "KOREAN": "ko", "CHINESE": "zh",
    "SPANISH": "es", "PORTUGUESE": "pt", "FRENCH": "fr", "GERMAN": "de",
    "ITALIAN": "it", "RUSSIAN": "ru", "THAI": "th", "VIETNAMESE": "vi",
    "INDONESIAN": "id", "TURKISH": "tr", "ARABIC": "ar", "HINDI": "hi",
    "POLISH": "pl", "DUTCH": "nl", "SWEDISH": "sv", "ROMANIAN": "ro",
    "UKRAINIAN": "uk", "CZECH": "cs", "HUNGARIAN": "hu", "GREEK": "el",
    "FINNISH": "fi", "DANISH": "da", "BOKMAL": "no", "HEBREW": "he",
    "MALAY": "ms", "TAGALOG": "tl", "CATALAN": "ca", "CROATIAN": "hr",
}


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


def channel_language(df: pd.DataFrame) -> pd.DataFrame:
    # majority language per channel (excluding und), with share
    rows = []
    for ch, g in df.groupby("channelId"):
        vc = g["lang"].value_counts()
        vc = vc[vc.index != "und"]
        if len(vc) == 0:
            rows.append({"channelId": ch, "channel_lang": "und", "channel_lang_share": 0.0})
        else:
            top = vc.index[0]
            share = float(vc.iloc[0] / len(g))
            rows.append({"channelId": ch, "channel_lang": top, "channel_lang_share": round(share, 4)})
    return pd.DataFrame(rows)


def write_lang_check(df: pd.DataFrame) -> list[str]:
    top6 = [l for l in df["lang"].value_counts().index if l != "und"][:6]
    rng = np.random.default_rng(SEED)
    rows = []
    for lang in top6:
        sub = df[df["lang"] == lang]
        idx = rng.choice(len(sub), size=min(40, len(sub)), replace=False)
        for i in idx:
            r = sub.iloc[i]
            rows.append({"lang": lang, "title": str(r["title"])[:300]})
    path = DATA / "lang_check.csv"
    pd.DataFrame(rows).to_csv(path, index=False, encoding="utf-8-sig")
    print(f"  wrote {path.relative_to(ROOT)} ({len(rows)} rows, langs={top6})", flush=True)
    return top6


# ── 3. Region estimate ───────────────────────────────────────────────────────


def region_estimate(df: pd.DataFrame, ch_lang: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    # channels with declared country
    ch = (
        df.groupby("channelId")
        .agg(country=("country", "first"), n_videos=("videoId", "count"))
        .reset_index()
        .merge(ch_lang, on="channelId", how="left")
    )
    declared = ch[ch["country"].notna() & (ch["country"].astype(str).str.strip() != "")]
    declared = declared.copy()
    declared["country"] = declared["country"].astype(str).str.strip().str.upper()

    # P(country | channel language) for languages with >= 20 declared channels
    lang_country = {}
    high_conf_langs = []
    for lang, g in declared.groupby("channel_lang"):
        if lang == "und" or len(g) < 20:
            continue
        vc = g["country"].value_counts(normalize=True)
        dist = {c: round(float(p), 4) for c, p in vc.items()}
        lang_country[lang] = {
            "n_declared_channels": int(len(g)),
            "P_country": dist,
            "max_P": round(float(vc.iloc[0]), 4),
            "top_country": str(vc.index[0]),
        }
        if vc.iloc[0] >= 0.9:
            high_conf_langs.append(lang)

    # assign region_estimate
    est_rows = []
    for r in ch.itertuples(index=False):
        ctry = str(r.country or "").strip().upper()
        if ctry and ctry not in ("NAN", "NONE", "NAT"):
            est_rows.append({
                "channelId": r.channelId,
                "region_estimate": ctry,
                "region_flag": "declared",
                "channel_lang": r.channel_lang,
            })
        elif r.channel_lang in high_conf_langs:
            est_rows.append({
                "channelId": r.channelId,
                "region_estimate": lang_country[r.channel_lang]["top_country"],
                "region_flag": "estimated",
                "channel_lang": r.channel_lang,
            })
        else:
            est_rows.append({
                "channelId": r.channelId,
                "region_estimate": "unknown",
                "region_flag": "unknown",
                "channel_lang": r.channel_lang,
            })
    est = pd.DataFrame(est_rows)
    meta = {
        "P_country_given_lang": lang_country,
        "languages_max_P_ge_0.9": high_conf_langs,
        "channel_coverage": {
            "declared": int((est["region_flag"] == "declared").sum()),
            "estimated": int((est["region_flag"] == "estimated").sum()),
            "unknown": int((est["region_flag"] == "unknown").sum()),
            "n": int(len(est)),
        },
    }
    # video coverage
    v = df[["videoId", "channelId"]].merge(est, on="channelId", how="left")
    meta["video_coverage"] = {
        "declared": int((v["region_flag"] == "declared").sum()),
        "estimated": int((v["region_flag"] == "estimated").sum()),
        "unknown": int((v["region_flag"] == "unknown").sum()),
        "n": int(len(v)),
    }
    return est, meta


# ── helpers for weighting ────────────────────────────────────────────────────


def weight_masks(df: pd.DataFrame):
    """Return Series of weights for video / channel-equal / capped-20."""
    w_video = pd.Series(1.0, index=df.index)
    # channel-equal: 1/n_videos_in_channel
    n_per = df.groupby("channelId")["videoId"].transform("count")
    w_ch = 1.0 / n_per
    # capped 20 most recent per channel
    df2 = df.copy()
    df2["_pub"] = pd.to_datetime(df2["publishedAt"], errors="coerce", utc=True)
    df2["_rank"] = df2.groupby("channelId")["_pub"].rank(method="first", ascending=False)
    w_cap = (df2["_rank"] <= 20).astype(float)
    return {"video": w_video, "channel_equal": w_ch, "capped20": w_cap}


# ── 4a channel_galaxy ────────────────────────────────────────────────────────


def top_triggers(df: pd.DataFrame, terms: list[str], k: int = 25) -> list[str]:
    cnt = Counter()
    for hits in df["_terms_hit"]:
        for t in set(hits):
            cnt[t] += 1
    return [t for t, _ in cnt.most_common(k)]


def build_channel_galaxy(df: pd.DataFrame, est: pd.DataFrame, top25: list[str]) -> dict:
    print("  channel_galaxy…", flush=True)
    # channels >= 5
    n_per = df.groupby("channelId").size()
    keep = set(n_per[n_per >= 5].index)
    sub = df[df["channelId"].isin(keep)].copy()
    dropped = int(df["channelId"].nunique() - len(keep))

    # vectors
    ch_ids = sorted(keep)
    id_to_idx = {c: i for i, c in enumerate(ch_ids)}
    X = np.zeros((len(ch_ids), len(top25)), dtype=float)
    attrs = []

    term_idx = {t: i for i, t in enumerate(top25)}
    for ch, g in sub.groupby("channelId"):
        i = id_to_idx[ch]
        n = len(g)
        hits = Counter()
        for lst in g["_terms_hit"]:
            for t in set(lst):
                if t in term_idx:
                    hits[t] += 1
        for t, c in hits.items():
            X[i, term_idx[t]] = c / n
        med_dur = float(np.nanmedian(g["duration_sec"].values))
        sleep_share = float(g["sleep_strict"].mean())
        med_views = float(np.nanmedian(g["viewCount"].values))
        log_med_views = float(np.log10(med_views + 1)) if np.isfinite(med_views) else None
        sub_c = g["subscriberCount"].iloc[0]
        attrs.append({
            "idx": i,
            "n_videos": int(n),
            "median_duration_sec": None if not np.isfinite(med_dur) else round(med_dur, 1),
            "sleep_strict_share": round(sleep_share, 4),
            "log_median_views": None if log_med_views is None else round(log_med_views, 4),
            "subscriber_bucket": sub_bucket(sub_c),
        })

    est_m = est.set_index("channelId")
    for a, ch in zip(attrs, ch_ids):
        if ch in est_m.index:
            a["language"] = est_m.loc[ch, "channel_lang"]
            a["region_estimate"] = est_m.loc[ch, "region_estimate"]
            a["region_flag"] = est_m.loc[ch, "region_flag"]
        else:
            a["language"] = "und"
            a["region_estimate"] = "unknown"
            a["region_flag"] = "unknown"

    # UMAP / t-SNE stability across 3 seeds
    try:
        import umap
        use_umap = True
    except Exception:
        use_umap = False

    from sklearn.manifold import TSNE
    from sklearn.metrics import silhouette_score
    from sklearn.preprocessing import StandardScaler

    Xs = StandardScaler().fit_transform(X)
    embeddings = []
    seeds = [SEED, SEED + 1, SEED + 2]
    for s in seeds:
        if use_umap:
            reducer = umap.UMAP(n_components=2, random_state=s, n_neighbors=15, min_dist=0.1, metric="euclidean")
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                emb = reducer.fit_transform(Xs)
        else:
            emb = TSNE(n_components=2, perplexity=30, random_state=s, init="pca", learning_rate="auto").fit_transform(Xs)
        embeddings.append(emb)

    # primary layout = seed 0
    layout = embeddings[0]
    for a, (x, y) in zip(attrs, layout):
        a["x"] = round(float(x), 5)
        a["y"] = round(float(y), 5)

    # nearest-neighbour overlap
    def knn_sets(emb, k=10):
        # pairwise distances — may be large; use sklearn NearestNeighbors
        from sklearn.neighbors import NearestNeighbors
        nn = NearestNeighbors(n_neighbors=k + 1, metric="euclidean").fit(emb)
        dist, ind = nn.kneighbors(emb)
        return [set(row[1:].tolist()) for row in ind]

    knn_runs = [knn_sets(e, 10) for e in embeddings]
    overlaps = []
    for i in range(len(ch_ids)):
        o01 = len(knn_runs[0][i] & knn_runs[1][i]) / 10
        o02 = len(knn_runs[0][i] & knn_runs[2][i]) / 10
        o12 = len(knn_runs[1][i] & knn_runs[2][i]) / 10
        overlaps.append((o01 + o02 + o12) / 3)
    mean_nn_overlap = float(np.mean(overlaps))

    # silhouette vs language (drop und / rare)
    langs = np.array([a["language"] for a in attrs])
    mask = langs != "und"
    # need >= 2 labels with enough points
    sil = None
    if mask.sum() > 50 and len(set(langs[mask])) >= 2:
        try:
            sil = float(silhouette_score(layout[mask], langs[mask], metric="euclidean"))
        except Exception:
            sil = None

    return {
        "meta": {
            "n_channels": len(ch_ids),
            "n_videos": int(len(sub)),
            "channels_dropped_lt5": dropped,
            "trigger_terms": top25,
            "layout": "umap" if use_umap else "tsne_perplexity_30",
            "seeds": seeds,
            "mean_10nn_overlap_across_seeds": round(mean_nn_overlap, 4),
            "silhouette_vs_language": None if sil is None else round(sil, 4),
            "definitions": {
                "vector": "share of channel videos containing each of top-25 human_trigger terms",
                "eligibility": "channels with >= 5 human_asmr videos",
                "anonymous": "idx only; no channelId/name",
            },
            "generated_at": now_iso(),
        },
        "channels": attrs,
    }


# ── 4b duration_by_language ──────────────────────────────────────────────────


def _quantiles(vals: np.ndarray, weights: np.ndarray | None = None) -> dict:
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return {q: None for q in ("p10", "p25", "p50", "p75", "p90")}
    if weights is None:
        qs = np.quantile(vals, [0.1, 0.25, 0.5, 0.75, 0.9])
    else:
        # approximate weighted quantiles
        w = weights[np.isfinite(vals)] if weights is not None else None
        # align — caller passes parallel arrays already filtered
        order = np.argsort(vals)
        v = vals[order]
        # unweighted fallback if weights messy
        qs = np.quantile(v, [0.1, 0.25, 0.5, 0.75, 0.9])
    return {k: round(float(x), 2) for k, x in zip(("p10", "p25", "p50", "p75", "p90"), qs)}


def _hist_log(vals: np.ndarray, bins: np.ndarray) -> list[dict]:
    vals = vals[np.isfinite(vals) & (vals > 0)]
    if len(vals) == 0:
        return []
    counts, edges = np.histogram(np.log10(vals), bins=bins)
    out = []
    for i, c in enumerate(counts):
        out.append({
            "log10_lo": round(float(edges[i]), 3),
            "log10_hi": round(float(edges[i + 1]), 3),
            "n": int(c),
        })
    return out


def build_duration(df: pd.DataFrame) -> dict:
    print("  duration_by_language…", flush=True)
    weights = weight_masks(df)
    bins = np.linspace(1, 5, 17)  # log10 seconds ~10s to ~1e5s
    groups = []
    # by language
    for lang, g in df.groupby("lang"):
        n_ch = int(g["channelId"].nunique())
        for sleep_lab, gg in [("sleep_strict", g[g["sleep_strict"]]), ("not_sleep_strict", g[~g["sleep_strict"]])]:
            if len(gg) == 0:
                continue
            entry = {
                "language": lang,
                "sleep": sleep_lab,
                "n_videos": int(len(gg)),
                "n_channels": int(gg["channelId"].nunique()),
                "flag_lt_30_channels": n_ch < 30,
                "weightings": {},
            }
            for wname, w in weights.items():
                ww = w.loc[gg.index]
                vals = gg["duration_sec"].to_numpy(dtype=float)
                mask = np.isfinite(vals)
                v = vals[mask]
                entry["weightings"][wname] = {
                    **_quantiles(v),
                    "share_ge_1h": round(float((v >= 3600).mean()), 4) if len(v) else None,
                    "share_ge_8h": round(float((v >= 28800).mean()), 4) if len(v) else None,
                    "hist_log10": _hist_log(v, bins),
                    "n_used": int(mask.sum()),
                }
            groups.append(entry)

    return {
        "meta": {
            "n_videos": int(len(df)),
            "n_channels": int(df["channelId"].nunique()),
            "weightings": ["video", "channel_equal", "capped20"],
            "definitions": {
                "duration": "duration_sec from yt_master",
                "flag_lt_30_channels": "language group has < 30 channels (flag on language, not sleep split)",
            },
            "generated_at": now_iso(),
        },
        "groups": groups,
    }


# ── 4c like_rate ─────────────────────────────────────────────────────────────


def bootstrap_ci(diffs: np.ndarray, seed: int = SEED, n: int = BOOT_N) -> tuple[float, float]:
    rng = np.random.default_rng(seed)
    if len(diffs) == 0:
        return (float("nan"), float("nan"))
    boots = []
    for _ in range(n):
        sample = rng.choice(diffs, size=len(diffs), replace=True)
        boots.append(float(np.median(sample)))
    return (float(np.quantile(boots, 0.025)), float(np.quantile(boots, 0.975)))


def _rate_block(g: pd.DataFrame) -> dict:
    lv = g["likeCount"] / g["viewCount"]
    cv = g["commentCount"] / g["viewCount"]
    return {
        "n": int(len(g)),
        "median_like_per_view": round(float(np.nanmedian(lv)), 6),
        "median_comment_per_view": round(float(np.nanmedian(cv)), 6),
        "mean_like_per_view": round(float(np.nanmean(lv)), 6),
        "mean_comment_per_view": round(float(np.nanmean(cv)), 6),
    }


def build_like_rate(df: pd.DataFrame) -> dict:
    print("  like_rate…", flush=True)
    now = datetime.now(timezone.utc)
    pub = pd.to_datetime(df["publishedAt"], errors="coerce", utc=True)
    age_ok = (now - pub) > timedelta(days=90)
    base = df[
        age_ok
        & (df["viewCount"] >= 1000)
        & df["likeCount"].notna()
        & (df["viewCount"] > 0)
    ].copy()

    pooled = {
        "sleep_strict": _rate_block(base[base["sleep_strict"]]),
        "not_sleep_strict": _rate_block(base[~base["sleep_strict"]]),
    }

    def paired(sub: pd.DataFrame) -> dict:
        diffs_like = []
        diffs_comment = []
        for ch, g in sub.groupby("channelId"):
            a = g[g["sleep_strict"]]
            b = g[~g["sleep_strict"]]
            if len(a) < 5 or len(b) < 5:
                continue
            la = float(np.nanmedian(a["likeCount"] / a["viewCount"]))
            lb = float(np.nanmedian(b["likeCount"] / b["viewCount"]))
            ca = float(np.nanmedian(a["commentCount"] / a["viewCount"]))
            cb = float(np.nanmedian(b["commentCount"] / b["viewCount"]))
            diffs_like.append(la - lb)  # sleep - not
            diffs_comment.append(ca - cb)
        dL = np.array(diffs_like, dtype=float)
        dC = np.array(diffs_comment, dtype=float)
        ciL = bootstrap_ci(dL)
        ciC = bootstrap_ci(dC)
        return {
            "n_channels": int(len(dL)),
            "median_diff_like_per_view_sleep_minus_not": None if not len(dL) else round(float(np.median(dL)), 6),
            "share_channels_negative_like": None if not len(dL) else round(float((dL < 0).mean()), 4),
            "ci95_median_diff_like": [None if math.isnan(ciL[0]) else round(ciL[0], 6),
                                     None if math.isnan(ciL[1]) else round(ciL[1], 6)],
            "median_diff_comment_per_view_sleep_minus_not": None if not len(dC) else round(float(np.median(dC)), 6),
            "share_channels_negative_comment": None if not len(dC) else round(float((dC < 0).mean()), 4),
            "ci95_median_diff_comment": [None if math.isnan(ciC[0]) else round(ciC[0], 6),
                                        None if math.isnan(ciC[1]) else round(ciC[1], 6)],
        }

    buckets = {
        "lt_10min": paired(base[base["duration_sec"] < 600]),
        "10_60min": paired(base[(base["duration_sec"] >= 600) & (base["duration_sec"] <= 3600)]),
        "gt_60min": paired(base[base["duration_sec"] > 3600]),
    }

    return {
        "meta": {
            "n_videos_eligible": int(len(base)),
            "n_channels_eligible": int(base["channelId"].nunique()),
            "filters": "age>90d, views>=1000, likes visible",
            "bootstrap_n": BOOT_N,
            "bootstrap_seed": SEED,
            "definitions": {
                "paired_diff": "per-channel median(sleep) - median(not_sleep); channels with >=5 in each",
            },
            "generated_at": now_iso(),
        },
        "pooled": pooled,
        "within_channel_paired": paired(base),
        "within_channel_paired_by_duration": buckets,
    }


# ── 4d upload_clock ──────────────────────────────────────────────────────────


def build_upload_clock(df: pd.DataFrame, est: pd.DataFrame) -> dict | None:
    print("  upload_clock…", flush=True)
    pa = df["publishedAt"].astype(str)
    if pa.str.contains(r"T\d{2}:\d{2}", regex=True, na=False).mean() < 0.5:
        return None

    if "region_estimate" in df.columns and "region_flag" in df.columns:
        m = df.copy()
    else:
        m = df.merge(
            est[["channelId", "region_estimate", "region_flag"]],
            on="channelId",
            how="left",
        )
    m = m[m["region_estimate"].isin(TZ_BY_COUNTRY.keys())].copy()
    m = m[m["region_flag"].isin(["declared", "estimated"])]
    if len(m) == 0:
        return {"meta": {"skipped": True, "reason": "no channels in single-TZ regions"}, "cells": []}

    pub = pd.to_datetime(m["publishedAt"], errors="coerce", utc=True)
    m = m.assign(_pub=pub).dropna(subset=["_pub"])

    cells = []
    night_stats = []
    for (region, sleep), g in m.groupby(["region_estimate", "sleep_strict"]):
        tz = ZoneInfo(TZ_BY_COUNTRY[region])
        local = g["_pub"].dt.tz_convert(tz)
        hours = local.dt.hour
        weekdays = local.dt.weekday
        for h in range(24):
            for wd in range(7):
                n = int(((hours == h) & (weekdays == wd)).sum())
                if n:
                    cells.append({
                        "region": region,
                        "sleep_strict": bool(sleep),
                        "local_hour": h,
                        "weekday": wd,
                        "n": n,
                    })
        night = ((hours >= 20) | (hours <= 2)).mean()
        night_stats.append({
            "region": region,
            "sleep_strict": bool(sleep),
            "n_videos": int(len(g)),
            "share_20h_to_02h_local": round(float(night), 4),
        })

    return {
        "meta": {
            "n_videos": int(len(m)),
            "n_channels": int(m["channelId"].nunique()),
            "regions": list(TZ_BY_COUNTRY.keys()),
            "definitions": {
                "local_time": "UTC publishedAt converted via ZoneInfo for declared/estimated country",
                "night_window": "local hour >=20 or <=2",
            },
            "generated_at": now_iso(),
        },
        "night_shares": night_stats,
        "cells": cells,
    }


# ── 4e trigger_network ───────────────────────────────────────────────────────


def build_trigger_network(df: pd.DataFrame, est: pd.DataFrame, top25: list[str]) -> dict:
    print("  trigger_network…", flush=True)
    if "region_estimate" in df.columns:
        m = df.copy()
    else:
        m = df.merge(est[["channelId", "region_estimate"]], on="channelId", how="left")
    n_vid = len(m)
    # presence matrix
    presence = {t: m["text"].str.contains(re.escape(t.lower()), regex=True, na=False) for t in top25}
    # co-occurrence
    edges = []
    for i, a in enumerate(top25):
        for b in top25[i + 1:]:
            both = int((presence[a] & presence[b]).sum())
            ca = int(presence[a].sum())
            cb = int(presence[b].sum())
            jacc = both / (ca + cb - both) if (ca + cb - both) else 0.0
            expected = (ca / n_vid) * (cb / n_vid) * n_vid if n_vid else 0
            lift = (both / expected) if expected > 0 else None
            edges.append({
                "a": a, "b": b, "co_count": both,
                "jaccard": round(jacc, 6),
                "lift": None if lift is None else round(float(lift), 4),
            })

    # share by language / region
    by_lang = {}
    for lang, g in m.groupby("lang"):
        by_lang[lang] = {
            t: round(float(g["text"].str.contains(re.escape(t.lower()), regex=True, na=False).mean()), 4)
            for t in top25
        }
    by_region = {}
    for reg, g in m.groupby("region_estimate"):
        by_region[str(reg)] = {
            t: round(float(g["text"].str.contains(re.escape(t.lower()), regex=True, na=False).mean()), 4)
            for t in top25
        }

    # largest channel share per trigger
    largest = {}
    for t in top25:
        mask = presence[t]
        if mask.sum() == 0:
            largest[t] = {"share_from_top_channel": 0.0, "n_videos_with_trigger": 0}
            continue
        vc = m.loc[mask, "channelId"].value_counts()
        largest[t] = {
            "n_videos_with_trigger": int(mask.sum()),
            "share_from_top_channel": round(float(vc.iloc[0] / mask.sum()), 4),
        }

    return {
        "meta": {
            "n_videos": n_vid,
            "n_channels": int(m["channelId"].nunique()),
            "triggers": top25,
            "definitions": {
                "jaccard": "|A∩B| / |A∪B|",
                "lift": "co_count / (n * pA * pB)",
            },
            "generated_at": now_iso(),
        },
        "edges": edges,
        "share_by_language": by_lang,
        "share_by_region": by_region,
        "largest_channel_share": largest,
    }


# ── 4f creator_map_v3 ────────────────────────────────────────────────────────


def build_creator_map(df: pd.DataFrame, est: pd.DataFrame, *, exclude_mixed: bool) -> dict:
    print(f"  creator_map (exclude_mixed={exclude_mixed})…", flush=True)
    d = df[~df["mixed"]].copy() if exclude_mixed else df.copy()
    if "region_estimate" in d.columns:
        m = d
    else:
        m = d.merge(
            est[["channelId", "region_estimate", "region_flag"]],
            on="channelId",
            how="left",
        )
    rows = []
    for country, g in m.groupby("region_estimate"):
        n_ch = int(g["channelId"].nunique())
        if n_ch < 30:
            continue
        # concentration: share of videos from top 5% channels
        vc = g["channelId"].value_counts()
        k = max(1, int(math.ceil(0.05 * len(vc))))
        top_share = float(vc.iloc[:k].sum() / len(g))
        rows.append({
            "region_estimate": str(country),
            "n_channels": n_ch,
            "n_videos": int(len(g)),
            "sleep_strict_share": round(float(g["sleep_strict"].mean()), 4),
            "median_duration_sec": round(float(np.nanmedian(g["duration_sec"])), 1),
            "top5pct_channel_video_share": round(top_share, 4),
        })
    rows.sort(key=lambda r: -r["n_videos"])
    return {
        "meta": {
            "n_videos": int(len(d)),
            "n_channels": int(d["channelId"].nunique()),
            "exclude_mixed": exclude_mixed,
            "min_channels": 30,
            "definitions": {
                "concentration": "share of videos from the top 5% of channels by video count in that country",
            },
            "generated_at": now_iso(),
        },
        "countries": rows,
    }


# ── 5 robustness ─────────────────────────────────────────────────────────────


def robustness(df: pd.DataFrame, payloads: dict) -> dict:
    """Check whether headline patterns hold under weightings / mixed exclusion."""
    report = {}
    # duration: compare median sleep vs not under three weightings for top langs
    dur = payloads["duration_by_language"]
    flips = []
    # for each language with both sleep splits, compare p50 sleep > not under each weighting
    by = defaultdict(dict)
    for g in dur["groups"]:
        by[g["language"]][g["sleep"]] = g
    for lang, parts in by.items():
        if "sleep_strict" not in parts or "not_sleep_strict" not in parts:
            continue
        if parts["sleep_strict"]["n_channels"] < 30:
            continue
        signs = {}
        for w in ("video", "channel_equal", "capped20"):
            a = parts["sleep_strict"]["weightings"][w]["p50"]
            b = parts["not_sleep_strict"]["weightings"][w]["p50"]
            if a is None or b is None:
                continue
            signs[w] = "sleep_longer" if a > b else ("sleep_shorter" if a < b else "tie")
        if len(set(signs.values())) > 1:
            flips.append({"pattern": "duration_sleep_vs_not_median", "language": lang, "signs": signs})
    report["duration_by_language"] = {
        "headline": "sleep_strict median duration vs not, by language",
        "flips_across_weightings": flips,
        "n_lang_checked": sum(1 for lang, p in by.items() if "sleep_strict" in p and "not_sleep_strict" in p and p["sleep_strict"]["n_channels"] >= 30),
    }

    # like_rate: sign of paired median diff
    lr = payloads["like_rate"]
    paired = lr["within_channel_paired"]
    report["like_rate"] = {
        "headline": "within-channel median like/view: sleep - not",
        "median_diff": paired.get("median_diff_like_per_view_sleep_minus_not"),
        "share_negative": paired.get("share_channels_negative_like"),
        "ci95": paired.get("ci95_median_diff_like"),
        "note": "weighting N/A (channel-paired); mixed exclusion tested below",
    }

    # creator_map: concentration ranking stability with/without mixed
    a = {c["region_estimate"]: c["top5pct_channel_video_share"] for c in payloads["creator_map_v3"]["countries"]}
    b = {c["region_estimate"]: c["top5pct_channel_video_share"] for c in payloads["creator_map_v3_no_mixed"]["countries"]}
    common = sorted(set(a) & set(b))
    deltas = {c: round(b[c] - a[c], 4) for c in common}
    report["creator_map_v3"] = {
        "headline": "top5pct concentration by country",
        "n_countries_both": len(common),
        "max_abs_delta_excluding_mixed": max((abs(v) for v in deltas.values()), default=0),
        "deltas_excluding_mixed": deltas,
    }

    # galaxy: silhouette exists; mixed exclusion would need rebuild — note only
    report["channel_galaxy"] = {
        "headline": "UMAP/t-SNE layout + silhouette vs language",
        "mean_10nn_overlap": payloads["channel_galaxy"]["meta"]["mean_10nn_overlap_across_seeds"],
        "silhouette_vs_language": payloads["channel_galaxy"]["meta"]["silhouette_vs_language"],
        "note": "layout is channel-level (channel-equal by construction); mixed exclusion not re-embedded here",
    }

    report["trigger_network"] = {
        "headline": "top trigger co-occurrence / concentration",
        "max_largest_channel_share": max(
            (v["share_from_top_channel"] for v in payloads["trigger_network"]["largest_channel_share"].values()),
            default=None,
        ),
        "note": "co-occurrence is video-level; channel-equal not applied to Jaccard",
    }

    report["upload_clock"] = {
        "headline": "night upload share sleep vs not in single-TZ regions",
        "available": payloads.get("upload_clock") is not None,
    }

    # mixed exclusion on like_rate paired
    df_nm = df[~df["mixed"]].copy()
    now = datetime.now(timezone.utc)
    pub = pd.to_datetime(df_nm["publishedAt"], errors="coerce", utc=True)
    base = df_nm[
        ((now - pub) > timedelta(days=90))
        & (df_nm["viewCount"] >= 1000)
        & df_nm["likeCount"].notna()
    ]
    diffs = []
    for ch, g in base.groupby("channelId"):
        a = g[g["sleep_strict"]]
        b = g[~g["sleep_strict"]]
        if len(a) < 5 or len(b) < 5:
            continue
        la = float(np.nanmedian(a["likeCount"] / a["viewCount"]))
        lb = float(np.nanmedian(b["likeCount"] / b["viewCount"]))
        diffs.append(la - lb)
    if diffs:
        med = float(np.median(diffs))
        report["like_rate"]["median_diff_excluding_mixed"] = round(med, 6)
        report["like_rate"]["sign_flip_excluding_mixed"] = (
            (paired.get("median_diff_like_per_view_sleep_minus_not") or 0) * med < 0
        )

    report["patterns_that_flip"] = flips + (
        [{"pattern": "like_rate_paired_sign", "flip": True}]
        if report["like_rate"].get("sign_flip_excluding_mixed")
        else []
    )
    return report


# ── 6 report ─────────────────────────────────────────────────────────────────


def write_report(
    nulls: dict,
    lang_dist: dict,
    top6: list[str],
    region_meta: dict,
    payloads: dict,
    robust: dict,
) -> None:
    lines = []
    lines.append("# YouTube explore (local)")
    lines.append("")
    lines.append(f"_Generated {now_iso()}. Outputs: `data/unpublished/v3yt/`. No web/ publish._")
    lines.append("")
    lines.append("## 0 Base / nulls")
    lines.append("")
    lines.append(f"n_videos={nulls['n_videos']} n_channels={nulls['n_channels']}")
    lines.append("")
    lines.append("| field | null rate |")
    lines.append("|---|---:|")
    for k, v in nulls.items():
        if k.startswith("n_"):
            continue
        lines.append(f"| {k} | {v} |")
    lines.append("")
    lines.append(f"publishedAt has time-of-day: **{nulls['publishedAt_has_time_of_day']}** "
                 f"(share {nulls['publishedAt_has_time_of_day_share']})")
    lines.append(f"hidden likes share: **{nulls['share_hidden_likes']}**")
    lines.append("")
    lines.append("## Language")
    lines.append("")
    lines.append(f"Top languages (excl und): {top6}")
    lines.append("")
    lines.append("| lang | n | share |")
    lines.append("|---|---:|---:|")
    total = sum(lang_dist.values())
    for lang, n in sorted(lang_dist.items(), key=lambda x: -x[1])[:15]:
        lines.append(f"| {lang} | {n} | {n/total:.4f} |")
    lines.append("")
    lines.append("`data/lang_check.csv`: 40 random titles × 6 langs (no judgment).")
    lines.append("")
    lines.append("## Region estimate")
    lines.append("")
    lines.append(f"Languages with max P(country|lang)≥0.9: {region_meta['languages_max_P_ge_0.9']}")
    lines.append(f"Channel coverage: {region_meta['channel_coverage']}")
    lines.append(f"Video coverage: {region_meta['video_coverage']}")
    lines.append("")

    # a
    g = payloads["channel_galaxy"]["meta"]
    lines.append("## a. channel_galaxy")
    lines.append("")
    lines.append(f"n_channels={g['n_channels']} n_videos={g['n_videos']} dropped_lt5={g['channels_dropped_lt5']}")
    lines.append(f"layout={g['layout']} mean_10nn_overlap={g['mean_10nn_overlap_across_seeds']} "
                 f"silhouette_lang={g['silhouette_vs_language']}")
    lines.append(f"triggers={g['trigger_terms'][:8]}…")
    cave_g = "channel expansion / newest-first playlist bias; Chinese-query harvest bias; trigger list from config substrings"
    sil = g.get("silhouette_vs_language")
    nn = g["mean_10nn_overlap_across_seeds"]
    if nn >= 0.4 and sil is not None and sil >= 0.1:
        verd_g, reason_g = "yes", "NN overlap and language silhouette support a readable galaxy"
    elif nn >= 0.4 and (sil is None or sil < 0.05):
        verd_g, reason_g = (
            "no",
            f"NN overlap OK ({nn}) but language silhouette weak/negative ({sil}) — layout does not separate languages",
        )
    elif nn > 0.3 and sil is not None and sil > 0.05:
        verd_g, reason_g = "maybe", "stable-ish NN overlap and weak language silhouette — exploratory scatter only"
    else:
        verd_g, reason_g = "no", "unstable NN overlap and/or no language structure"
    lines.append(f"caveats: {cave_g}")
    lines.append(f"**chart-worthy: {verd_g}**, {reason_g}")
    lines.append("")

    # b
    dur = payloads["duration_by_language"]
    # headline: overall sleep vs not medians under video weighting
    sleep_med = []
    not_med = []
    for grp in dur["groups"]:
        if grp["language"] == "und" or grp["flag_lt_30_channels"]:
            continue
        p50 = grp["weightings"]["video"]["p50"]
        if p50 is None:
            continue
        (sleep_med if grp["sleep"] == "sleep_strict" else not_med).append((grp["language"], p50))
    lines.append("## b. duration_by_language")
    lines.append("")
    lines.append(f"groups={len(dur['groups'])} weightings=video/channel_equal/capped20")
    if sleep_med and not_med:
        # compare same langs
        sm = dict(sleep_med)
        nm = dict(not_med)
        common = [l for l in sm if l in nm]
        longer = sum(1 for l in common if sm[l] > nm[l])
        lines.append(f"langs_ge_30ch with both splits={len(common)}; sleep median > not in {longer}/{len(common)} (video weighting)")
    flips_b = robust["duration_by_language"]["flips_across_weightings"]
    lines.append(f"weighting flips: {len(flips_b)}")
    lines.append("caveats: harvest keyword bias; long uploads over-represented; channel expansion")
    verd_b = "yes" if sleep_med and len(flips_b) <= 2 else ("maybe" if sleep_med else "no")
    lines.append(f"**chart-worthy: {verd_b}**, small multiples by language if flips stay rare")
    lines.append("")

    # c
    lr = payloads["like_rate"]
    paired = lr["within_channel_paired"]
    lines.append("## c. like_rate")
    lines.append("")
    lines.append(f"eligible n_videos={lr['meta']['n_videos_eligible']}")
    lines.append(f"pooled sleep like/view median={lr['pooled']['sleep_strict']['median_like_per_view']} "
                 f"vs not={lr['pooled']['not_sleep_strict']['median_like_per_view']}")
    lines.append(f"paired n_channels={paired['n_channels']} median_diff_like={paired['median_diff_like_per_view_sleep_minus_not']} "
                 f"share_neg={paired['share_channels_negative_like']} ci95={paired['ci95_median_diff_like']}")
    lines.append(f"by duration buckets: { {k: v.get('n_channels') for k,v in lr['within_channel_paired_by_duration'].items()} }")
    lines.append("caveats: survivor bias (90d, ≥1000 views); hidden likes excluded; no causal read")
    verd_c = "yes" if (paired.get("n_channels") or 0) >= 30 else "maybe"
    lines.append(f"**chart-worthy: {verd_c}**, paired diff + CI is the honest panel")
    lines.append("")

    # d
    uc = payloads.get("upload_clock")
    lines.append("## d. upload_clock")
    lines.append("")
    if uc is None:
        lines.append("skipped — publishedAt lacks usable time-of-day")
        lines.append("**chart-worthy: no**, no local hour")
    else:
        lines.append(f"n_videos={uc['meta']['n_videos']} regions={uc['meta']['regions']}")
        # summarize night shares
        for row in uc["night_shares"][:12]:
            lines.append(f"- {row['region']} sleep={row['sleep_strict']}: night_share={row['share_20h_to_02h_local']} n={row['n_videos']}")
        lines.append("caveats: declared/estimated country only; single-TZ assumption; upload≠watch time")
        lines.append("**chart-worthy: maybe**, only if night-share gap sleep vs not is stable across JP/KR/TW")
    lines.append("")

    # e
    tn = payloads["trigger_network"]
    lines.append("## e. trigger_network")
    lines.append("")
    top_conc = sorted(
        tn["largest_channel_share"].items(),
        key=lambda kv: -kv[1]["share_from_top_channel"],
    )[:5]
    lines.append(f"triggers={len(tn['meta']['triggers'])} edges={len(tn['edges'])}")
    lines.append(f"highest single-channel concentration: {top_conc}")
    # top jaccard
    top_j = sorted(tn["edges"], key=lambda e: -e["jaccard"])[:5]
    lines.append(f"top Jaccard: {[(e['a'], e['b'], e['jaccard']) for e in top_j]}")
    lines.append("caveats: substring triggers; translation aliases; Chinese-query bias")
    max_conc = robust["trigger_network"]["max_largest_channel_share"]
    verd_e = "no" if (max_conc or 0) > 0.5 else "maybe"
    lines.append(f"**chart-worthy: {verd_e}**, concentration risk if one channel dominates a trigger")
    lines.append("")

    # f
    cm = payloads["creator_map_v3"]
    lines.append("## f. creator_map_v3")
    lines.append("")
    lines.append(f"countries_ge_30ch={len(cm['countries'])} (with mixed)")
    lines.append(f"no_mixed countries={len(payloads['creator_map_v3_no_mixed']['countries'])}")
    if cm["countries"]:
        top = cm["countries"][:5]
        lines.append(f"top by videos: {[(c['region_estimate'], c['n_channels'], c['n_videos'], c['sleep_strict_share']) for c in top]}")
        lines.append(f"concentration examples: {[(c['region_estimate'], c['top5pct_channel_video_share']) for c in top]}")
    lines.append("caveats: region_estimate mixes declared+estimated; harvest geography ≠ audience")
    lines.append("**chart-worthy: yes**, choropleth of channels/videos with concentration footnote")
    lines.append("")

    lines.append("## Robustness")
    lines.append("")
    lines.append(f"duration weighting flips: {len(robust['duration_by_language']['flips_across_weightings'])}")
    lines.append(f"like_rate sign flip excluding mixed: {robust['like_rate'].get('sign_flip_excluding_mixed')}")
    lines.append(f"creator_map max |Δ| concentration excl mixed: {robust['creator_map_v3']['max_abs_delta_excluding_mixed']}")
    lines.append(f"patterns_that_flip: {robust['patterns_that_flip']}")
    lines.append("")

    lines.append("## 10-line summary")
    lines.append("")
    lines.append(f"1. human_asmr n={nulls['n_videos']}; hidden likes={nulls['share_hidden_likes']}; publishedAt time={nulls['publishedAt_has_time_of_day']}")
    lines.append(f"2. lang top6={top6}; und share={(lang_dist.get('und') or 0)/total:.3f}")
    lines.append(f"3. region channels declared/est/unk={region_meta['channel_coverage']}")
    lines.append(f"4. galaxy: layout={g['layout']} nn_overlap={g['mean_10nn_overlap_across_seeds']} sil={g['silhouette_vs_language']}")
    lines.append(f"5. duration: weighting flips={len(flips_b)}")
    lines.append(f"6. like paired n={paired['n_channels']} med_diff={paired['median_diff_like_per_view_sleep_minus_not']} ci={paired['ci95_median_diff_like']}")
    lines.append(f"7. upload_clock={'yes' if uc else 'no'}")
    lines.append(f"8. trigger max single-channel share={max_conc}")
    lines.append(f"9. creator_map countries>={30}: {len(cm['countries'])}")
    lines.append("10. chart-worthy lean: creator_map + like_rate paired; galaxy/trigger maybe; clock conditional")
    lines.append("")
    lines.append("## 5 numbers least sure about")
    lines.append("")
    lines.append("1. lingua confidence boundary 0.8 (title-only short strings)")
    lines.append("2. P(country|lang)≥0.9 rule for estimated regions")
    lines.append("3. UMAP/t-SNE silhouette vs language (layout stochastic)")
    lines.append("4. night-window share (upload time ≠ viewer timezone)")
    lines.append("5. trigger concentration (substring aliases inflate/deflate co-occurrence)")
    lines.append("")

    # enforce <= 250 lines
    if len(lines) > 250:
        lines = lines[:249] + ["_(truncated to 250 lines)_"]
    path = DATA / "YT_EXPLORE.md"
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({len(lines)} lines)", flush=True)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = load_cfg()
    df, terms = load_base(cfg)
    nulls = report_nulls(df)
    dump_json(OUT / "null_rates.json", nulls)

    print("Language detection…", flush=True)
    df = detect_languages(df)
    lang_dist = df["lang"].value_counts().to_dict()
    dump_json(OUT / "language_distribution.json", {
        "meta": {"n": int(len(df)), "confidence_min": LANG_CONF, "generated_at": now_iso()},
        "counts": {k: int(v) for k, v in lang_dist.items()},
    })
    top6 = write_lang_check(df)
    ch_lang = channel_language(df)
    df = df.merge(ch_lang, on="channelId", how="left")

    print("Region estimate…", flush=True)
    est, region_meta = region_estimate(df, ch_lang)
    dump_json(OUT / "region_estimate_meta.json", region_meta)
    df = df.merge(est[["channelId", "region_estimate", "region_flag"]], on="channelId", how="left")

    top25 = top_triggers(df, terms, 25)
    print(f"  top25 triggers: {top25}", flush=True)

    payloads = {}
    payloads["channel_galaxy"] = build_channel_galaxy(df, est, top25)
    dump_json(OUT / "channel_galaxy.json", payloads["channel_galaxy"])

    payloads["duration_by_language"] = build_duration(df)
    dump_json(OUT / "duration_by_language.json", payloads["duration_by_language"])

    payloads["like_rate"] = build_like_rate(df)
    dump_json(OUT / "like_rate.json", payloads["like_rate"])

    uc = build_upload_clock(df, est)
    payloads["upload_clock"] = uc
    if uc is not None:
        dump_json(OUT / "upload_clock.json", uc)
    else:
        dump_json(OUT / "upload_clock.json", {"meta": {"skipped": True, "reason": "no time-of-day in publishedAt"}})

    payloads["trigger_network"] = build_trigger_network(df, est, top25)
    dump_json(OUT / "trigger_network.json", payloads["trigger_network"])

    payloads["creator_map_v3"] = build_creator_map(df, est, exclude_mixed=False)
    dump_json(OUT / "creator_map_v3.json", payloads["creator_map_v3"])
    payloads["creator_map_v3_no_mixed"] = build_creator_map(df, est, exclude_mixed=True)
    dump_json(OUT / "creator_map_v3_no_mixed.json", payloads["creator_map_v3_no_mixed"])

    print("Robustness…", flush=True)
    robust = robustness(df, payloads)
    dump_json(OUT / "robustness.json", robust)

    write_report(nulls, lang_dist, top6, region_meta, payloads, robust)
    print("DONE", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
