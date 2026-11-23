#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""YouTube explore 4 on classification v3 (asmr_labelled, exclude long_B; sleep_title).
Writes docs/YT_EXPLORE_4.md + unpublished summary. No channel ids/names.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import explore_yt_v3 as E  # noqa: E402

DATA = ROOT / "data"
OUT = DATA / "unpublished" / "v3yt"
DOC = ROOT / "docs" / "YT_EXPLORE_4.md"
CFG_TRIG = ROOT / "config" / "trigger_canonical.yaml"
CLASSES = DATA / "yt_classes_v3.csv"
SEED = 42
BOOT_N = 2000
CLOCK_BOOT = 1000
LANGS_CORE = ["en", "ja", "zh", "ko"]
LANGS_OPT = ["es", "fr"]
CLOCK_REGIONS = ["JP", "KR", "TW", "HK"]
TZ = {k: E.TZ_BY_COUNTRY[k] for k in CLOCK_REGIONS}
NIGHT_HOURS = {20, 21, 22, 23, 0, 1}  # 20:00–02:00


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_canonical():
    raw = yaml.safe_load(CFG_TRIG.read_text(encoding="utf-8"))
    alias_to_can = {}
    cans = list(raw["canonical"].keys())
    native_counts = {lg: 0 for lg in ["en", "ja", "zh", "ko", "es", "fr", "other"]}
    for can, aliases in raw["canonical"].items():
        for a in aliases:
            alias_to_can[a.lower()] = can
            # rough script bucket for native-term counts
            if any("\uac00" <= ch <= "\ud7a3" for ch in a):
                native_counts["ko"] += 1
            elif any("\u3040" <= ch <= "\u30ff" for ch in a):
                native_counts["ja"] += 1
            elif any("\u4e00" <= ch <= "\u9fff" for ch in a):
                native_counts["zh"] += 1
            elif a.isascii() and a.isalpha():
                native_counts["en"] += 1
            else:
                native_counts["other"] += 1
    return alias_to_can, cans, native_counts


def can_hits(text: str, alias_to_can: dict) -> set[str]:
    t = text.lower()
    return {can for alias, can in alias_to_can.items() if alias in t}


def medians_bundle(g: pd.DataFrame, sleep_col: str):
    gs, gn = g[g[sleep_col]], g[~g[sleep_col]]
    out = {}
    out["video"] = (
        float(np.nanmedian(gs["duration_sec"])),
        float(np.nanmedian(gn["duration_sec"])),
    )
    out["channel_equal"] = (
        float(gs.groupby("channelId")["duration_sec"].median().median()),
        float(gn.groupby("channelId")["duration_sec"].median().median()),
    )
    gg = g.copy()
    gg["_pub"] = pd.to_datetime(gg["publishedAt"], errors="coerce", utc=True)
    gg["_rank"] = gg.groupby("channelId")["_pub"].rank(ascending=False, method="first")
    cap = gg[gg["_rank"] <= 20]
    out["capped20"] = (
        float(np.nanmedian(cap.loc[cap[sleep_col], "duration_sec"])),
        float(np.nanmedian(cap.loc[~cap[sleep_col], "duration_sec"])),
    )
    return out, gs, gn


def ratio_boot(gs, gn, seed=SEED):
    s_vals = gs.groupby("channelId")["duration_sec"].median().to_numpy(float)
    n_vals = gn.groupby("channelId")["duration_sec"].median().to_numpy(float)
    s_vals = s_vals[np.isfinite(s_vals)]
    n_vals = n_vals[np.isfinite(n_vals)]
    rng = np.random.default_rng(seed)
    ratios = []
    if len(s_vals) and len(n_vals):
        for _ in range(BOOT_N):
            s_m = float(np.median(rng.choice(s_vals, size=len(s_vals), replace=True)))
            n_m = float(np.median(rng.choice(n_vals, size=len(n_vals), replace=True)))
            if n_m > 0 and np.isfinite(s_m):
                ratios.append(s_m / n_m)
    if not ratios:
        return None, None
    lo, hi = (float(x) for x in np.quantile(ratios, [0.025, 0.975]))
    return lo, hi


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Loading v3 classes + master…", flush=True)
    cls = pd.read_csv(
        CLASSES, encoding="utf-8-sig",
        usecols=["videoId", "class", "tier", "sleep_title", "long_B", "has_human_trigger", "has_asmr_label"],
    )
    labelled = cls[
        (cls["class"] == "asmr_labelled") & (~cls["long_B"].astype(bool))
    ].copy()
    ids = set(labelled["videoId"].astype(str))

    usecols = [
        "videoId", "title", "channelId", "tags", "description_short", "topicCategories",
        "duration_sec", "viewCount", "likeCount", "commentCount", "publishedAt",
        "defaultLanguage", "defaultAudioLanguage", "title_script",
    ]
    parts = []
    for chunk in pd.read_csv(
        DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols,
        chunksize=50_000, low_memory=False,
    ):
        chunk = chunk[chunk["videoId"].astype(str).isin(ids)]
        if len(chunk):
            parts.append(chunk)
    m = pd.concat(parts, ignore_index=True)
    df = labelled.merge(m, on="videoId", how="inner")
    for c in ["duration_sec", "viewCount", "likeCount", "commentCount"]:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["sleep_title"] = df["sleep_title"].astype(bool)
    df["text"] = df.apply(E.haystack, axis=1)

    ch = pd.read_csv(
        DATA / "yt_channel_country.csv", encoding="utf-8-sig",
        usecols=["channelId", "country", "subscriberCount"],
    ).drop_duplicates("channelId", keep="last")
    df = df.merge(ch, on="channelId", how="left")
    print(f"asmr_labelled (¬long_B): {len(df):,} / {df['channelId'].nunique():,} ch", flush=True)

    cache = OUT / "lang_cache.parquet"
    if cache.exists():
        cached = pd.read_parquet(cache)
        df = df.merge(cached, on="videoId", how="left")
    else:
        df = E.detect_languages(df)
    df["lang"] = df["lang"].fillna("und")

    ch_lang = E.channel_language(df)
    df = df.merge(ch_lang, on="channelId", how="left")
    est, _ = E.region_estimate(df, ch_lang)
    df = df.merge(est[["channelId", "region_estimate", "region_flag"]], on="channelId", how="left")

    alias_to_can, cans, native_counts = load_canonical()
    df["_cans"] = df["text"].apply(lambda t: can_hits(t, alias_to_can))

    # ── 1 duration ──
    print("duration…", flush=True)
    dur_rows = []
    for lang in LANGS_CORE + LANGS_OPT:
        g_all = df[df["lang"] == lang]
        g_a = g_all[g_all["tier"] == "A"]
        for label, g in (("tier_A", g_a), ("all_labelled", g_all)):
            gs, gn = g[g["sleep_title"]], g[~g["sleep_title"]]
            if gs["channelId"].nunique() < 30 or gn["channelId"].nunique() < 30:
                if lang in LANGS_OPT:
                    continue
                if label == "tier_A":
                    # still record skip
                    continue
                continue
            bundle, gs2, gn2 = medians_bundle(g, "sleep_title")
            lo, hi = ratio_boot(gs2, gn2, SEED + hash((lang, label)) % 5000)
            # ordering: sleep median > not under each weighting?
            order_ok = {
                w: bool(bundle[w][0] > bundle[w][1]) for w in bundle
            }
            dur_rows.append({
                "language": lang,
                "series": label,
                "n_ch_sleep": int(gs2["channelId"].nunique()),
                "n_ch_not": int(gn2["channelId"].nunique()),
                "weightings": {
                    w: {
                        "sleep_median_sec": round(bundle[w][0], 1),
                        "not_median_sec": round(bundle[w][1], 1),
                        "ratio": round(bundle[w][0] / bundle[w][1], 4) if bundle[w][1] > 0 else None,
                    }
                    for w in bundle
                },
                "ratio_channel_boot_ci95": [
                    None if lo is None else round(lo, 4),
                    None if hi is None else round(hi, 4),
                ],
                "ordering_sleep_gt_not": order_ok,
            })

    # ── 2 upload_clock ──
    print("upload_clock…", flush=True)
    clock = {}
    mclk = df[df["region_estimate"].isin(CLOCK_REGIONS) & df["region_flag"].isin(["declared", "estimated"])].copy()
    mclk["_pub"] = pd.to_datetime(mclk["publishedAt"], errors="coerce", utc=True)
    mclk = mclk.dropna(subset=["_pub"])
    for region in CLOCK_REGIONS:
        for sleep in (True, False):
            g = mclk[(mclk["region_estimate"] == region) & (mclk["sleep_title"] == sleep)]
            if g["channelId"].nunique() < 5 or len(g) < 100:
                continue
            tz = ZoneInfo(TZ[region])
            local = g["_pub"].dt.tz_convert(tz)
            g = g.assign(hour=local.dt.hour, minute=local.dt.minute)
            ch_ids = list(g["channelId"].unique())
            # per-channel hour distribution matrix
            ch_hour = np.zeros((len(ch_ids), 24))
            night_by_ch = []
            for i, ch in enumerate(ch_ids):
                gg = g[g["channelId"] == ch]
                hc = gg["hour"].value_counts(normalize=True)
                for h in range(24):
                    ch_hour[i, h] = float(hc.get(h, 0.0))
                night_by_ch.append(float(gg["hour"].isin(NIGHT_HOURS).mean()))
            mean_hour = ch_hour.mean(axis=0)
            # channel-bootstrap bands for hourly profile
            rng = np.random.default_rng(SEED)
            boots_h = np.zeros((CLOCK_BOOT, 24))
            night_boots = []
            nch = len(ch_ids)
            for b in range(CLOCK_BOOT):
                ii = rng.integers(0, nch, size=nch)
                boots_h[b] = ch_hour[ii].mean(axis=0)
                night_boots.append(float(np.mean(np.array(night_by_ch)[ii])))
            hour_lo = np.quantile(boots_h, 0.025, axis=0)
            hour_hi = np.quantile(boots_h, 0.975, axis=0)
            night_mean = float(np.mean(night_by_ch))
            night_lo, night_hi = (float(x) for x in np.quantile(night_boots, [0.025, 0.975]))

            # video-level night share
            night_vid = float(g["hour"].isin(NIGHT_HOURS).mean())
            on_half = float(((g["minute"] == 0) | (g["minute"] == 30)).mean())

            # busiest 3 hours among those with >=200 uploads
            hour_n = g["hour"].value_counts()
            eligible = [h for h in range(24) if int(hour_n.get(h, 0)) >= 200]
            busiest = sorted(eligible, key=lambda h: -int(hour_n.get(h, 0)))[:3]
            top_ch = {}
            for h in busiest:
                gh = g[g["hour"] == h]
                vc = gh["channelId"].value_counts(normalize=True)
                top_ch[str(h)] = {
                    "n": int(len(gh)),
                    "top_channel_share": round(float(vc.iloc[0]), 4) if len(vc) else None,
                }

            key = f"{region}_{'sleep' if sleep else 'not'}"
            clock[key] = {
                "region": region,
                "sleep_title": sleep,
                "n_videos": int(len(g)),
                "n_channels": int(nch),
                "hour_channel_equal": {str(h): round(float(mean_hour[h]), 4) for h in range(24)},
                "hour_channel_boot_ci95": {
                    str(h): [round(float(hour_lo[h]), 4), round(float(hour_hi[h]), 4)]
                    for h in range(24)
                },
                "night_20_02_channel_mean": round(night_mean, 4),
                "night_20_02_channel_ci95": [round(night_lo, 4), round(night_hi, 4)],
                "night_20_02_video": round(night_vid, 4),
                "share_on_hour_or_half": round(on_half, 4),
                "uniform_minute_expectation": round(2 / 60, 4),
                "busiest_hours_ge200_top_channel": top_ch,
            }

    # difference sleep − not per region (resample channels separately within each group)
    clock_diff = {}
    for region in CLOCK_REGIONS:
        ks, kn = f"{region}_sleep", f"{region}_not"
        if ks not in clock or kn not in clock:
            continue
        gs = mclk[(mclk["region_estimate"] == region) & (mclk["sleep_title"] == True)]
        gn = mclk[(mclk["region_estimate"] == region) & (mclk["sleep_title"] == False)]
        if gs.empty or gn.empty:
            continue
        tz = ZoneInfo(TZ[region])

        def night_by_channel(g):
            local = g["_pub"].dt.tz_convert(tz)
            g2 = g.assign(hour=local.dt.hour)
            out = []
            for _, gg in g2.groupby("channelId"):
                out.append(float(gg["hour"].isin(NIGHT_HOURS).mean()))
            return np.asarray(out, float)

        ns = night_by_channel(gs)
        nn = night_by_channel(gn)
        point = float(ns.mean() - nn.mean()) if len(ns) and len(nn) else None
        rng = np.random.default_rng(SEED + 17)
        boots = []
        for _ in range(CLOCK_BOOT):
            if not len(ns) or not len(nn):
                break
            boots.append(float(np.mean(rng.choice(ns, size=len(ns), replace=True))
                               - np.mean(rng.choice(nn, size=len(nn), replace=True))))
        lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975])) if boots else (None, None)
        # video-level difference
        local_s = gs["_pub"].dt.tz_convert(tz)
        local_n = gn["_pub"].dt.tz_convert(tz)
        vid_diff = float(local_s.dt.hour.isin(NIGHT_HOURS).mean() - local_n.dt.hour.isin(NIGHT_HOURS).mean())
        clock_diff[region] = {
            "diff_channel_mean": None if point is None else round(point, 4),
            "diff_channel_ci95": [
                None if lo is None else round(lo, 4),
                None if hi is None else round(hi, 4),
            ],
            "diff_video": round(vid_diff, 4),
        }

    # ── 3 triggers ──
    print("triggers…", flush=True)
    trig = {}
    coverage = {}
    for lang in LANGS_CORE:
        g = df[df["lang"] == lang]
        if g["channelId"].nunique() < 30:
            continue
        any_hit = g["_cans"].apply(bool).mean()
        coverage[lang] = {
            "n_channels": int(g["channelId"].nunique()),
            "n_videos": int(len(g)),
            "share_videos_any_trigger": round(float(any_hit), 4),
        }
        dom_counts = Counter()
        n_ch = 0
        for _, gg in g.groupby("channelId"):
            hits = Counter()
            for s in gg["_cans"]:
                for c in s:
                    hits[c] += 1
            n_ch += 1
            if hits:
                dom_counts[hits.most_common(1)[0][0]] += 1
        ch_share = {c: round(dom_counts.get(c, 0) / n_ch, 4) for c in cans}
        vid_share = {c: round(float(g["_cans"].apply(lambda s, cc=c: cc in s).mean()), 4) for c in cans}
        trig[lang] = {
            "n_channels": n_ch,
            "channel_dominant_share": ch_share,
            "video_contain_share": vid_share,
        }

    # ── 4 creators ──
    print("creators…", flush=True)
    creators = []
    for country, g in df.groupby("region_estimate"):
        n_ch = int(g["channelId"].nunique())
        if country != "unknown" and n_ch < 30:
            continue
        vc = g["channelId"].value_counts()
        k = max(1, int(math.ceil(0.05 * len(vc))))
        creators.append({
            "region_estimate": str(country),
            "n_channels": n_ch,
            "n_videos": int(len(g)),
            "top5pct_channel_video_share": round(float(vc.iloc[:k].sum() / len(g)), 4),
        })
    creators.sort(key=lambda r: -r["n_videos"])

    # docs
    lines = [
        "# YouTube explore 4 (classification v3)",
        "",
        f"_Generated {now_iso()}. Frame: asmr_labelled excluding long_B; sleep split = sleep_title. "
        f"Languages core {LANGS_CORE}; es/fr only if ≥30 channels/arm. No channel ids/names._",
        "",
        f"n_videos={len(df)} n_channels={df['channelId'].nunique()}",
        "",
        "## 1. Duration by language (sleep_title vs not)",
        "",
        "| lang | series | n_ch s/n | video | ch-equal | capped20 | ratio CI | order holds (v/c/cap) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for e in dur_rows:
        w = e["weightings"]
        oh = e["ordering_sleep_gt_not"]
        lines.append(
            f"| {e['language']} | {e['series']} | {e['n_ch_sleep']}/{e['n_ch_not']} | "
            f"{w['video']['sleep_median_sec']}/{w['video']['not_median_sec']} | "
            f"{w['channel_equal']['sleep_median_sec']}/{w['channel_equal']['not_median_sec']} | "
            f"{w['capped20']['sleep_median_sec']}/{w['capped20']['not_median_sec']} | "
            f"{e['ratio_channel_boot_ci95']} | "
            f"{oh['video']}/{oh['channel_equal']}/{oh['capped20']} |"
        )

    lines += ["", "## 2. Upload clock (JP/KR/TW/HK)", ""]
    for key, tab in sorted(clock.items()):
        lines.append(
            f"### {tab['region']} sleep_title={tab['sleep_title']} "
            f"n_vid={tab['n_videos']} n_ch={tab['n_channels']}"
        )
        lines.append(
            f"night 20–02 channel-mean={tab['night_20_02_channel_mean']} "
            f"CI={tab['night_20_02_channel_ci95']}; video-level={tab['night_20_02_video']}; "
            f"on :00/:30={tab['share_on_hour_or_half']} (uniform {tab['uniform_minute_expectation']})"
        )
        hs = " ".join(
            f"{h}:{tab['hour_channel_equal'][str(h)]}"
            f"[{tab['hour_channel_boot_ci95'][str(h)][0]}-{tab['hour_channel_boot_ci95'][str(h)][1]}]"
            for h in range(24)
        )
        lines.append(f"hour shares (channel-equal ±CI): {hs}")
        lines.append(f"busiest hours (≥200) top-channel share: {tab['busiest_hours_ge200_top_channel']}")
        lines.append("")
    lines.append("### Night share difference (sleep_title − not)")
    lines.append("")
    lines.append("| region | diff channel-mean | CI95 | diff video |")
    lines.append("|---|---:|---|---:|")
    for reg, d in clock_diff.items():
        lines.append(
            f"| {reg} | {d['diff_channel_mean']} | {d['diff_channel_ci95']} | {d['diff_video']} |"
        )

    lines += [
        "",
        "## 3. Trigger by language",
        "",
        f"Native-term counts (rough script buckets on aliases): {native_counts}",
        "",
        "Lexicon coverage (share of videos matching any canonical trigger):",
        "",
    ]
    for lang, cov in coverage.items():
        lines.append(
            f"- **{lang}**: n_ch={cov['n_channels']} n_vid={cov['n_videos']} "
            f"any-trigger share={cov['share_videos_any_trigger']}"
        )
    lines.append("")
    for lang, block in trig.items():
        top = sorted(block["channel_dominant_share"].items(), key=lambda kv: -kv[1])[:5]
        vtop = sorted(block["video_contain_share"].items(), key=lambda kv: -kv[1])[:5]
        lines.append(f"- **{lang}** n_ch={block['n_channels']}: dominant {top}; video-contain {vtop}")

    lines += [
        "",
        "## 4. Creator by country (declared ≥30 + unknown)",
        "",
        "| region | channels | videos | top5% video share |",
        "|---|---:|---:|---:|",
    ]
    for c in creators:
        lines.append(
            f"| {c['region_estimate']} | {c['n_channels']} | {c['n_videos']} | "
            f"{c['top5pct_channel_video_share']} |"
        )
    lines.append("")
    DOC.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {DOC.relative_to(ROOT)}", flush=True)

    E.dump_json(OUT / "explore_v3_4_summary.json", {
        "duration": dur_rows,
        "upload_clock_keys": list(clock.keys()),
        "clock_diff": clock_diff,
        "trigger_coverage": coverage,
        "native_term_counts": native_counts,
        "creators_n": len(creators),
        "generated_at": now_iso(),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
