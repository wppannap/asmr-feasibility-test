#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""YouTube explore 3 on asmr_labelled + sleep v2 → docs/YT_EXPLORE_3.md
+ data/lang_check_extra.csv + unpublished summary JSON.
No channel ids/names, no comment text in outputs.
"""
from __future__ import annotations

import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
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
DOC = ROOT / "docs" / "YT_EXPLORE_3.md"
COMMENT_DOC = ROOT / "docs" / "COMMENT_THEMES_V2_SUMMARY.md"
CFG_TRIG = ROOT / "config" / "trigger_canonical.yaml"
CLASSES_V2 = DATA / "yt_classes_v2.csv"
SEED = 42
BOOT_N = 2000
VERIFIED_LANGS = ["en", "ja", "zh", "ko", "es", "fr"]
CLOCK_REGIONS = ["JP", "KR", "TW", "HK"]
TZ = {k: E.TZ_BY_COUNTRY[k] for k in CLOCK_REGIONS}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def boot_ci(vals, seed=SEED):
    vals = np.asarray(vals, float)
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return None, None, None
    med = float(np.median(vals))
    rng = np.random.default_rng(seed)
    boots = [float(np.median(rng.choice(vals, size=len(vals), replace=True))) for _ in range(BOOT_N)]
    lo, hi = np.quantile(boots, [0.025, 0.975])
    return med, float(lo), float(hi)


def load_canonical():
    raw = yaml.safe_load(CFG_TRIG.read_text(encoding="utf-8"))
    alias_to_can = {}
    cans = list(raw["canonical"].keys())
    for can, aliases in raw["canonical"].items():
        for a in aliases:
            alias_to_can[a.lower()] = can
    return alias_to_can, cans


def can_hits(text: str, alias_to_can: dict) -> set[str]:
    t = text.lower()
    return {can for alias, can in alias_to_can.items() if alias in t}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    print("Loading classes v2 + master…", flush=True)
    cls = pd.read_csv(
        CLASSES_V2, encoding="utf-8-sig",
        usecols=["videoId", "class", "tier", "sleep_strict", "has_human_trigger", "has_asmr_label"],
    )
    labelled = cls[cls["class"] == "asmr_labelled"].copy()
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
    df["sleep_strict"] = df["sleep_strict"].astype(bool)
    df["text"] = df.apply(E.haystack, axis=1)

    ch = pd.read_csv(
        DATA / "yt_channel_country.csv", encoding="utf-8-sig",
        usecols=["channelId", "country", "subscriberCount"],
    ).drop_duplicates("channelId", keep="last")
    df = df.merge(ch, on="channelId", how="left")
    print(f"asmr_labelled joined: {len(df):,} videos / {df['channelId'].nunique():,} channels", flush=True)

    # language (reuse cache)
    cache = OUT / "lang_cache.parquet"
    if cache.exists():
        cached = pd.read_parquet(cache)
        df = df.merge(cached, on="videoId", how="left")
    else:
        df = E.detect_languages(df)
    df["lang"] = df["lang"].fillna("und")

    # lang_check_extra
    rng = np.random.default_rng(SEED)
    extra_rows = []
    for lg in ["da", "tl", "und"]:
        sub = df[df["lang"] == lg]
        if len(sub) == 0:
            continue
        idx = rng.choice(len(sub), size=min(40, len(sub)), replace=False)
        for i in idx:
            extra_rows.append({"lang": lg, "title": str(sub.iloc[i]["title"])[:300]})
    pd.DataFrame(extra_rows).to_csv(DATA / "lang_check_extra.csv", index=False, encoding="utf-8-sig")
    print(f"  wrote lang_check_extra.csv n={len(extra_rows)}", flush=True)

    # region estimate from channels
    ch_lang = E.channel_language(df)
    df = df.merge(ch_lang, on="channelId", how="left")
    est, _ = E.region_estimate(df, ch_lang)
    df = df.merge(est[["channelId", "region_estimate", "region_flag"]], on="channelId", how="left")

    alias_to_can, cans = load_canonical()
    df["_cans"] = df["text"].apply(lambda t: can_hits(t, alias_to_can))

    # ── 1 duration ──
    print("duration…", flush=True)
    dur_rows = []
    for lang in VERIFIED_LANGS:
        g = df[df["lang"] == lang]
        gs, gn = g[g["sleep_strict"]], g[~g["sleep_strict"]]
        if gs["channelId"].nunique() < 30 or gn["channelId"].nunique() < 30:
            continue
        entry = {
            "language": lang,
            "n_ch_sleep": int(gs["channelId"].nunique()),
            "n_ch_not": int(gn["channelId"].nunique()),
            "weightings": {},
        }
        # video-level medians
        for wname, getter in [
            ("video", lambda s, n: (float(np.nanmedian(s["duration_sec"])), float(np.nanmedian(n["duration_sec"])))),
            ("channel_equal", lambda s, n: (
                float(s.groupby("channelId")["duration_sec"].median().median()),
                float(n.groupby("channelId")["duration_sec"].median().median()),
            )),
            ("capped20", None),
        ]:
            if wname == "capped20":
                gg = g.copy()
                gg["_pub"] = pd.to_datetime(gg["publishedAt"], errors="coerce", utc=True)
                gg["_rank"] = gg.groupby("channelId")["_pub"].rank(ascending=False, method="first")
                cap = gg[gg["_rank"] <= 20]
                ms = float(np.nanmedian(cap.loc[cap["sleep_strict"], "duration_sec"]))
                mn = float(np.nanmedian(cap.loc[~cap["sleep_strict"], "duration_sec"]))
            else:
                ms, mn = getter(gs, gn)
            ratio = ms / mn if mn and mn > 0 else None
            entry["weightings"][wname] = {
                "sleep_median_sec": round(ms, 1),
                "not_median_sec": round(mn, 1),
                "ratio_sleep_over_not": None if ratio is None else round(ratio, 4),
            }
        # channel-bootstrap CI of ratio (channel medians); drop non-finite
        sleep_ch = gs.groupby("channelId")["duration_sec"].median().to_numpy(float)
        not_ch = gn.groupby("channelId")["duration_sec"].median().to_numpy(float)
        s_vals = sleep_ch[np.isfinite(sleep_ch)]
        n_vals = not_ch[np.isfinite(not_ch)]
        rng = np.random.default_rng(SEED)
        ratios = []
        if len(s_vals) and len(n_vals):
            for _ in range(BOOT_N):
                s_m = float(np.median(rng.choice(s_vals, size=len(s_vals), replace=True)))
                n_m = float(np.median(rng.choice(n_vals, size=len(n_vals), replace=True)))
                if n_m > 0 and np.isfinite(s_m):
                    ratios.append(s_m / n_m)
        if ratios:
            lo, hi = (float(x) for x in np.quantile(ratios, [0.025, 0.975]))
        else:
            lo, hi = None, None
        entry["ratio_channel_boot_ci95"] = [
            None if lo is None else round(lo, 4),
            None if hi is None else round(hi, 4),
        ]
        # tier A robustness
        ga = g[g["tier"] == "A"]
        gas, gan = ga[ga["sleep_strict"]], ga[~ga["sleep_strict"]]
        if gas["channelId"].nunique() >= 30 and gan["channelId"].nunique() >= 30:
            entry["tier_A"] = {
                "sleep_median_sec": round(float(np.nanmedian(gas["duration_sec"])), 1),
                "not_median_sec": round(float(np.nanmedian(gan["duration_sec"])), 1),
                "n_ch_sleep": int(gas["channelId"].nunique()),
                "n_ch_not": int(gan["channelId"].nunique()),
            }
        dur_rows.append(entry)

    # ── 2 upload_clock ──
    print("upload_clock…", flush=True)
    clock = {}
    mclk = df[df["region_estimate"].isin(CLOCK_REGIONS) & df["region_flag"].isin(["declared", "estimated"])].copy()
    mclk["_pub"] = pd.to_datetime(mclk["publishedAt"], errors="coerce", utc=True)
    mclk = mclk.dropna(subset=["_pub"])
    for region in CLOCK_REGIONS:
        for sleep in (True, False):
            g = mclk[(mclk["region_estimate"] == region) & (mclk["sleep_strict"] == sleep)]
            if g["channelId"].nunique() < 5 or len(g) < 100:
                continue
            tz = ZoneInfo(TZ[region])
            local = g["_pub"].dt.tz_convert(tz)
            g = g.assign(hour=local.dt.hour, minute=local.dt.minute)
            # per-channel hourly distribution, then average (channel-equal)
            ch_hour = np.zeros((g["channelId"].nunique(), 24))
            ch_ids = list(g["channelId"].unique())
            night_by_ch = []
            for i, ch in enumerate(ch_ids):
                gg = g[g["channelId"] == ch]
                hc = gg["hour"].value_counts(normalize=True)
                for h in range(24):
                    ch_hour[i, h] = float(hc.get(h, 0.0))
                # 20:00–02:00 local = hours {20,21,22,23,0,1}
                night_by_ch.append(float(gg["hour"].isin([20, 21, 22, 23, 0, 1]).mean()))
            mean_hour = ch_hour.mean(axis=0)
            # largest channel share per hour (of videos in that hour)
            hour_top = {}
            for h in range(24):
                gh = g[g["hour"] == h]
                if len(gh) == 0:
                    hour_top[str(h)] = {"n": 0, "top_channel_share": None, "flag_gt_25": False}
                    continue
                vc = gh["channelId"].value_counts(normalize=True)
                top = float(vc.iloc[0])
                hour_top[str(h)] = {
                    "n": int(len(gh)),
                    "share_channel_equal": round(float(mean_hour[h]), 4),
                    "top_channel_share": round(top, 4),
                    "flag_gt_25": bool(top > 0.25),
                }
            # on hour/half: minute in {0, 30}
            on_half = float(((g["minute"] == 0) | (g["minute"] == 30)).mean())
            # uniform minute: 2/60
            uniform = 2.0 / 60.0
            night_arr = np.asarray(night_by_ch, float)
            night_arr = night_arr[np.isfinite(night_arr)]
            point = float(np.mean(night_arr)) if len(night_arr) else None
            rng = np.random.default_rng(SEED)
            if len(night_arr):
                boots = [
                    float(np.mean(rng.choice(night_arr, size=len(night_arr), replace=True)))
                    for _ in range(BOOT_N)
                ]
                lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975]))
            else:
                lo, hi = None, None
            key = f"{region}_{'sleep' if sleep else 'not'}"
            clock[key] = {
                "region": region,
                "sleep_strict": sleep,
                "n_videos": int(len(g)),
                "n_channels": int(len(ch_ids)),
                "hour_channel_equal": {str(h): round(float(mean_hour[h]), 4) for h in range(24)},
                "hour_top_channel": hour_top,
                "share_20h_02h_channel_mean": None if point is None else round(point, 4),
                "share_20h_02h_channel_boot_ci95": [
                    None if lo is None else round(lo, 4),
                    None if hi is None else round(hi, 4),
                ],
                "on_hour_or_half_def": "local minute == 0 or 30",
                "share_on_hour_or_half": round(on_half, 4),
                "uniform_minute_expectation": round(uniform, 4),
            }

    # ── 3 trigger_by_language ──
    print("triggers…", flush=True)
    trig = {}
    largest_cells = []
    for lang in VERIFIED_LANGS:
        g = df[df["lang"] == lang]
        if g["channelId"].nunique() < 30:
            continue
        # channel dominant
        dom_counts = Counter()
        n_ch = 0
        for ch, gg in g.groupby("channelId"):
            hits = Counter()
            for s in gg["_cans"]:
                for c in s:
                    hits[c] += 1
            n_ch += 1
            if hits:
                dom_counts[hits.most_common(1)[0][0]] += 1
        vid_share = {
            c: round(float(g["_cans"].apply(lambda s, cc=c: cc in s).mean()), 4) for c in cans
        }
        ch_share = {c: round(dom_counts.get(c, 0) / n_ch, 4) for c in cans}
        trig[lang] = {
            "n_channels": n_ch,
            "n_videos": int(len(g)),
            "channel_dominant_share": ch_share,
            "video_contain_share": vid_share,
        }
        for c, sh in ch_share.items():
            largest_cells.append((sh * n_ch, lang, c, int(dom_counts.get(c, 0)), sh))
    largest_cells.sort(reverse=True)
    top3_cells = [
        {"language": lang, "trigger": c, "n_channels_dominant": n, "share": round(sh, 4)}
        for _, lang, c, n, sh in largest_cells[:3]
    ]

    # ── 5 creator_by_country ──
    print("creator map…", flush=True)
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

    # ── 6 like_rate ──
    print("like_rate…", flush=True)
    now = datetime.now(timezone.utc)
    pub = pd.to_datetime(df["publishedAt"], errors="coerce", utc=True)
    base = df[
        ((now - pub) > timedelta(days=90))
        & (df["viewCount"] >= 1000)
        & df["likeCount"].notna()
        & (df["viewCount"] > 0)
    ].copy()

    def paired_rel(sub: pd.DataFrame) -> dict:
        rels = []
        for ch, g in sub.groupby("channelId"):
            a = g[g["sleep_strict"]]
            b = g[~g["sleep_strict"]]
            if len(a) < 5 or len(b) < 5:
                continue
            la = float(np.nanmedian(a["likeCount"] / a["viewCount"]))
            lb = float(np.nanmedian(b["likeCount"] / b["viewCount"]))
            if lb > 0:
                rels.append(la / lb - 1)
        med, lo, hi = boot_ci(np.array(rels), SEED)
        return {
            "n_channels": len(rels),
            "median_rel_like_minus_1": None if med is None else round(med, 6),
            "ci95": [None if lo is None else round(lo, 6), None if hi is None else round(hi, 6)],
        }

    def paired_duration_matched(sub: pd.DataFrame, tol=0.30) -> dict:
        """Same channel; pair sleep/not videos with durations within ±30%."""
        rels = []
        n_ch = 0
        for ch, g in sub.groupby("channelId"):
            a = g[g["sleep_strict"]]
            b = g[~g["sleep_strict"]]
            if len(a) < 1 or len(b) < 1:
                continue
            pairs = []
            for _, ra in a.iterrows():
                da = ra["duration_sec"]
                if not np.isfinite(da) or da <= 0:
                    continue
                # find not-sleep with duration within tol
                bb = b[
                    b["duration_sec"].notna()
                    & (b["duration_sec"] > 0)
                    & ((b["duration_sec"] - da).abs() / da <= tol)
                ]
                if len(bb) == 0:
                    continue
                rb = bb.iloc[(bb["duration_sec"] - da).abs().argmin()]
                la = ra["likeCount"] / ra["viewCount"]
                lb = rb["likeCount"] / rb["viewCount"]
                if lb > 0 and np.isfinite(la) and np.isfinite(lb):
                    pairs.append(float(la / lb - 1))
            if pairs:
                n_ch += 1
                rels.append(float(np.median(pairs)))
        med, lo, hi = boot_ci(np.array(rels), SEED)
        return {
            "n_channels": n_ch,
            "median_rel_like_minus_1": None if med is None else round(med, 6),
            "ci95": [None if lo is None else round(lo, 6), None if hi is None else round(hi, 6)],
            "tol": tol,
        }

    like = {
        "lt_10min": paired_rel(base[base["duration_sec"] < 600]),
        "10_60min": paired_rel(base[(base["duration_sec"] >= 600) & (base["duration_sec"] <= 3600)]),
        "gt_60min": paired_rel(base[base["duration_sec"] > 3600]),
        "duration_matched_pm30pct": paired_duration_matched(base, 0.30),
    }

    # ── 7 comment themes summary (counts only) ──
    themes_path = OUT / "comment_themes_v2.json"
    if themes_path.exists():
        ct = json.loads(themes_path.read_text())
        clines = [
            "# Comment themes v2 summary (counts only)",
            "",
            f"_Generated {now_iso()}. Source: unpublished comment_themes_v2.json. No comment text._",
            "",
            "| language | theme | stratum | videos | comments | matches | share | distinct_videos_with_match | top_video_share |",
            "|---|---|---|---:|---:|---:|---:|---:|---:|",
        ]
        for cell in ct.get("cells", []):
            clines.append(
                f"| {cell.get('language_group')} | {cell.get('theme')} | {cell.get('stratum')} | "
                f"{cell.get('videos')} | {cell.get('comments')} | {cell.get('matches')} | "
                f"{cell.get('share')} | {cell.get('distinct_videos_with_match')} | "
                f"{cell.get('share_matches_from_top_video')} |"
            )
        clines += ["", "## Language-equal pool", ""]
        for p in ct.get("language_equal_pool", []):
            clines.append(
                f"- theme={p.get('theme')}: n_languages={p.get('n_languages')} "
                f"mean_share={p.get('mean_share')}"
            )
        clines.append("")
        COMMENT_DOC.write_text("\n".join(clines), encoding="utf-8")
        print(f"  wrote {COMMENT_DOC.relative_to(ROOT)}", flush=True)
    else:
        print("  skip comment summary — comment_themes_v2.json missing", flush=True)

    # ── write YT_EXPLORE_3.md ──
    lines = [
        "# YouTube explore 3 (asmr_labelled + sleep v2)",
        "",
        f"_Generated {now_iso()}. Frame: `yt_classes_v2` class=asmr_labelled. "
        f"Verified languages for language-level charts: {VERIFIED_LANGS}. "
        "da/tl/und held out pending `data/lang_check_extra.csv` judgement. No channel ids/names._",
        "",
        f"n_videos={len(df)} n_channels={df['channelId'].nunique()}",
        "",
        "## 1. Duration by language",
        "",
        "| lang | n_ch sleep/not | video med s/n | ch-equal | capped20 | ratio boot CI | tierA med s/n |",
        "|---|---|---|---|---|---|---|",
    ]
    for e in dur_rows:
        w = e["weightings"]
        ta = e.get("tier_A")
        ta_s = f"{ta['sleep_median_sec']}/{ta['not_median_sec']}" if ta else "—"
        lines.append(
            f"| {e['language']} | {e['n_ch_sleep']}/{e['n_ch_not']} | "
            f"{w['video']['sleep_median_sec']}/{w['video']['not_median_sec']} | "
            f"{w['channel_equal']['sleep_median_sec']}/{w['channel_equal']['not_median_sec']} | "
            f"{w['capped20']['sleep_median_sec']}/{w['capped20']['not_median_sec']} | "
            f"{e['ratio_channel_boot_ci95']} | {ta_s} |"
        )

    lines += ["", "## 2. Upload clock (JP/KR/TW/HK, channel-equal)", ""]
    for key, tab in sorted(clock.items()):
        lines.append(
            f"### {tab['region']} sleep={tab['sleep_strict']} "
            f"n_vid={tab['n_videos']} n_ch={tab['n_channels']}"
        )
        lines.append(
            f"night 20–02 channel-mean={tab['share_20h_02h_channel_mean']} "
            f"CI={tab['share_20h_02h_channel_boot_ci95']}; "
            f"on hour/half ({tab['on_hour_or_half_def']})="
            f"{tab['share_on_hour_or_half']} (uniform minutes would give {tab['uniform_minute_expectation']})"
        )
        hs = " ".join(f"{h}:{tab['hour_channel_equal'][str(h)]}" for h in range(24))
        lines.append(f"hour shares (channel-equal): {hs}")
        flagged = [h for h, v in tab["hour_top_channel"].items() if v.get("flag_gt_25")]
        lines.append(f"hours with top-channel share >25%: {flagged or 'none'}")
        lines.append("")

    lines += [
        "## 3. Trigger by language",
        "",
        f"Top 3 dominant-trigger cells: {top3_cells}",
        "",
    ]
    for lang, block in trig.items():
        top = sorted(block["channel_dominant_share"].items(), key=lambda kv: -kv[1])[:5]
        vtop = sorted(block["video_contain_share"].items(), key=lambda kv: -kv[1])[:5]
        lines.append(
            f"- **{lang}** n_ch={block['n_channels']}: dominant {top}; "
            f"video-contain top {vtop}"
        )

    lines += [
        "",
        "## 4. Language hold-outs",
        "",
        "`data/lang_check_extra.csv`: 40 titles each for da, tl, und (not judged here). "
        "Excluded from language-level sections above.",
        "",
        "## 5. Creator by country (declared ≥30 + unknown)",
        "",
        "| region | channels | videos | top5% video share |",
        "|---|---:|---:|---:|",
    ]
    for c in creators:
        lines.append(
            f"| {c['region_estimate']} | {c['n_channels']} | {c['n_videos']} | "
            f"{c['top5pct_channel_video_share']} |"
        )

    lines += [
        "",
        "## 6. Like rate (paired relative)",
        "",
        "| block | n_channels | median (sleep/not − 1) | CI95 |",
        "|---|---:|---:|---|",
    ]
    for name, b in like.items():
        lines.append(
            f"| {name} | {b['n_channels']} | {b['median_rel_like_minus_1']} | {b['ci95']} |"
        )
    lines += [
        "",
        "## 7. Comment themes",
        "",
        "See `docs/COMMENT_THEMES_V2_SUMMARY.md` (counts only).",
        "",
    ]
    DOC.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {DOC.relative_to(ROOT)} ({len(lines)} lines)", flush=True)

    E.dump_json(OUT / "explore_v3_3_summary.json", {
        "duration": dur_rows,
        "upload_clock_keys": list(clock.keys()),
        "trigger_top3": top3_cells,
        "creators_n": len(creators),
        "like_rate": like,
        "generated_at": now_iso(),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
