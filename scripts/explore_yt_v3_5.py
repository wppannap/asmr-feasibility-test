#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""YouTube explore 5 on classification v3.2 (strict + title_only; script groups).

Writes docs/YT_EXPLORE_5.md + unpublished summary. No channel ids/names. No da/tl/und.
"""
from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import explore_yt_v3 as E  # noqa: E402
from comment_match import keyword_hits  # noqa: E402

DATA = ROOT / "data"
OUT = DATA / "unpublished" / "v3yt"
DOC = ROOT / "docs" / "YT_EXPLORE_5.md"
CLASSES = DATA / "yt_classes_v32.csv"
PLAN = DATA / "yt_comment_sample_plan_v2.csv"
COMMENTS = DATA / "yt_comments_v2.csv"
LEX = ROOT / "scripts" / "lexicon.yaml"
SEED = 42
BOOT_N = 2000
CLOCK_BOOT = 1000
SCRIPTS = [
    "Korean script",
    "Japanese script",
    "Han script (mostly Chinese)",
    "Latin script",
]
CLOCK_REGIONS = ["JP", "KR", "TW", "HK"]
TZ = {k: E.TZ_BY_COUNTRY[k] for k in CLOCK_REGIONS}
NIGHT_HOURS = {20, 21, 22, 23, 0, 1}
THEMES = ["insomnia", "gratitude", "anxiety_stress", "sleep_aid_effectiveness"]
RULES = ("strict", "title_only")


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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


def night_share_by_channel(g, tz):
    local = g["_pub"].dt.tz_convert(tz)
    g2 = g.assign(hour=local.dt.hour, minute=local.dt.minute)
    shares = []
    on_half = []
    for _, gg in g2.groupby("channelId"):
        shares.append(float(gg["hour"].isin(NIGHT_HOURS).mean()))
        on_half.append(float(((gg["minute"] == 0) | (gg["minute"] == 30)).mean()))
    return np.asarray(shares, float), np.asarray(on_half, float)


def boot_mean_ci(vals, seed, n=CLOCK_BOOT):
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return None, None, None
    rng = np.random.default_rng(seed)
    boots = [float(np.mean(rng.choice(vals, size=len(vals), replace=True))) for _ in range(n)]
    lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975]))
    return float(np.mean(vals)), lo, hi


def boot_diff_ci(a, b, seed, n=CLOCK_BOOT):
    a = a[np.isfinite(a)]
    b = b[np.isfinite(b)]
    if len(a) == 0 or len(b) == 0:
        return None, None, None
    rng = np.random.default_rng(seed)
    diffs = []
    for _ in range(n):
        diffs.append(
            float(np.mean(rng.choice(a, size=len(a), replace=True))
                  - np.mean(rng.choice(b, size=len(b), replace=True)))
        )
    lo, hi = (float(x) for x in np.quantile(diffs, [0.025, 0.975]))
    return float(np.mean(a) - np.mean(b)), lo, hi


def load_frame(rule: str, tier_a_only: bool) -> pd.DataFrame:
    class_col = "class_strict" if rule == "strict" else "class_title_only"
    tier_col = "tier_strict" if rule == "strict" else "tier_title_only"
    long_col = "long_B_strict" if rule == "strict" else "long_B_title_only"
    cls = pd.read_csv(
        CLASSES, encoding="utf-8-sig",
        usecols=["videoId", "script_group", "sleep_title", class_col, tier_col, long_col],
    )
    cls = cls.rename(columns={class_col: "class", tier_col: "tier", long_col: "long_B"})
    lab = cls[(cls["class"] == "asmr_labelled") & (~cls["long_B"].astype(bool))].copy()
    if tier_a_only:
        lab = lab[lab["tier"] == "A"].copy()
    ids = set(lab["videoId"].astype(str))
    usecols = [
        "videoId", "title", "channelId", "duration_sec", "publishedAt",
    ]
    parts = []
    for chunk in pd.read_csv(
        DATA / "yt_master.csv", encoding="utf-8-sig", usecols=usecols,
        chunksize=50_000, low_memory=False,
    ):
        chunk = chunk[chunk["videoId"].astype(str).isin(ids)]
        if len(chunk):
            parts.append(chunk)
    m = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=usecols)
    df = lab.merge(m, on="videoId", how="inner")
    df["duration_sec"] = pd.to_numeric(df["duration_sec"], errors="coerce")
    df["sleep_title"] = df["sleep_title"].astype(bool)
    ch = pd.read_csv(
        DATA / "yt_channel_country.csv", encoding="utf-8-sig",
        usecols=["channelId", "country", "subscriberCount"],
    ).drop_duplicates("channelId", keep="last")
    df = df.merge(ch, on="channelId", how="left")
    return df


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    if not CLASSES.exists():
        print("Missing yt_classes_v32.csv — run classify_yt_classes_v32.py first", flush=True)
        return 1

    summary = {"generated_at": now_iso(), "duration": {}, "upload_clock": {}, "creators": {}, "comments": {}}
    robust_rows = []

    # ── 1 Duration ──
    print("=== Duration ===", flush=True)
    dur_table = []
    for rule in RULES:
        for tier_a_only in (True, False):
            series = "tier_A" if tier_a_only else "all_labelled"
            print(f"  duration {rule} {series}…", flush=True)
            df = load_frame(rule, tier_a_only)
            for sg in SCRIPTS:
                g = df[df["script_group"] == sg]
                gs, gn = g[g["sleep_title"]], g[~g["sleep_title"]]
                if gs["channelId"].nunique() < 30 or gn["channelId"].nunique() < 30:
                    continue
                bundle, gs2, gn2 = medians_bundle(g, "sleep_title")
                lo, hi = ratio_boot(gs2, gn2, SEED + hash((rule, series, sg)) % 5000)
                order = {w: bool(bundle[w][0] > bundle[w][1]) for w in bundle}
                holds = all(order.values())
                row = {
                    "rule": rule, "series": series, "script_group": sg,
                    "n_ch_sleep": int(gs2["channelId"].nunique()),
                    "n_ch_not": int(gn2["channelId"].nunique()),
                    "order_holds_all_weightings": holds,
                    "ordering": order,
                    "ratio_channel_boot_ci95": [
                        None if lo is None else round(lo, 4),
                        None if hi is None else round(hi, 4),
                    ],
                    "weightings": {
                        w: {
                            "sleep": round(bundle[w][0], 1),
                            "not": round(bundle[w][1], 1),
                            "ratio": round(bundle[w][0] / bundle[w][1], 4) if bundle[w][1] > 0 else None,
                        }
                        for w in bundle
                    },
                }
                dur_table.append(row)
    summary["duration"] = dur_table
    # robust per script_group: same direction in all 4 combos (2 rules × 2 series)
    for sg in SCRIPTS:
        sub = [r for r in dur_table if r["script_group"] == sg]
        if len(sub) < 4:
            verdict = "incomplete"
        else:
            verdict = "robust" if all(r["order_holds_all_weightings"] for r in sub) else "sensitive"
        robust_rows.append({"result": "duration_sleep_gt_not", "group": sg, "verdict": verdict})

    # ── 2 Upload clock (declared country) ──
    print("=== Upload clock ===", flush=True)
    clock_out = {}
    for rule in RULES:
        df = load_frame(rule, False)
        # declared country only
        df = df[df["country"].isin(CLOCK_REGIONS)].copy()
        df["_pub"] = pd.to_datetime(df["publishedAt"], errors="coerce", utc=True)
        df = df.dropna(subset=["_pub"])
        for region in CLOCK_REGIONS:
            for sg in SCRIPTS:
                key = f"{rule}|{region}|{sg}"
                gs = df[(df["country"] == region) & (df["script_group"] == sg) & (df["sleep_title"] == True)]
                gn = df[(df["country"] == region) & (df["script_group"] == sg) & (df["sleep_title"] == False)]
                if gs["channelId"].nunique() < 5 or gn["channelId"].nunique() < 5:
                    continue
                tz = ZoneInfo(TZ[region])
                s_night, s_half = night_share_by_channel(gs, tz)
                n_night, n_half = night_share_by_channel(gn, tz)
                sm, slo, shi = boot_mean_ci(s_night, SEED + hash(key + "s") % 9000)
                nm, nlo, nhi = boot_mean_ci(n_night, SEED + hash(key + "n") % 9000)
                dm, dlo, dhi = boot_diff_ci(s_night, n_night, SEED + hash(key + "d") % 9000)
                # overall on :00/:30 (video-level)
                def on_half_vid(g):
                    local = g["_pub"].dt.tz_convert(tz)
                    return float(((local.dt.minute == 0) | (local.dt.minute == 30)).mean())
                clock_out[key] = {
                    "rule": rule, "region": region, "script_group": sg,
                    "n_ch_sleep": int(gs["channelId"].nunique()),
                    "n_ch_not": int(gn["channelId"].nunique()),
                    "night_sleep": {"mean": None if sm is None else round(sm, 4),
                                    "ci95": [None if slo is None else round(slo, 4),
                                             None if shi is None else round(shi, 4)]},
                    "night_not": {"mean": None if nm is None else round(nm, 4),
                                  "ci95": [None if nlo is None else round(nlo, 4),
                                           None if nhi is None else round(nhi, 4)]},
                    "night_diff_sleep_minus_not": {
                        "mean": None if dm is None else round(dm, 4),
                        "ci95": [None if dlo is None else round(dlo, 4),
                                 None if dhi is None else round(dhi, 4)],
                    },
                    "share_on_00_or_30_sleep": round(on_half_vid(gs), 4),
                    "share_on_00_or_30_not": round(on_half_vid(gn), 4),
                    "direction_sleep_gt_not": bool(dm is not None and dm > 0),
                }
    summary["upload_clock"] = clock_out
    for region in CLOCK_REGIONS:
        dirs = [v["direction_sleep_gt_not"] for k, v in clock_out.items() if v["region"] == region]
        if not dirs:
            verdict = "incomplete"
        else:
            verdict = "robust" if all(dirs) and all(
                v["direction_sleep_gt_not"] == dirs[0] for v in clock_out.values() if v["region"] == region
            ) else ("robust" if all(dirs) else "sensitive")
        # direction holds under both rules for all script groups present
        by_rule = {}
        for rule in RULES:
            rr = [v["direction_sleep_gt_not"] for v in clock_out.values()
                  if v["region"] == region and v["rule"] == rule]
            by_rule[rule] = all(rr) if rr else None
        if by_rule["strict"] is True and by_rule["title_only"] is True:
            verdict = "robust"
        elif by_rule["strict"] is None and by_rule["title_only"] is None:
            verdict = "incomplete"
        else:
            verdict = "sensitive" if by_rule["strict"] != by_rule["title_only"] or not all(
                x for x in by_rule.values() if x is not None
            ) else "robust"
        robust_rows.append({"result": "upload_night_sleep_gt_not", "group": region, "verdict": verdict})

    # ── 3 Creators by declared country ──
    print("=== Creators ===", flush=True)
    creators = []
    for rule in RULES:
        df = load_frame(rule, False)
        df = df[df["country"].notna() & (df["country"].astype(str).str.len() == 2)]
        for country, g in df.groupby("country"):
            n_ch = g["channelId"].nunique()
            if n_ch < 30:
                continue
            # top 5% channels by video count
            vc = g["channelId"].value_counts()
            k = max(1, int(np.ceil(0.05 * len(vc))))
            top = set(vc.head(k).index)
            share = float(g["channelId"].isin(top).mean())
            creators.append({
                "rule": rule, "country": country, "n_channels": int(n_ch),
                "n_videos": int(len(g)),
                "top5pct_channels": int(k),
                "share_videos_from_top5pct_channels": round(share, 4),
            })
    summary["creators"] = creators

    # ── 4 Comments ──
    print("=== Comments ===", flush=True)
    lexicon = yaml.safe_load(LEX.read_text(encoding="utf-8"))
    plan = pd.read_csv(PLAN, encoding="utf-8-sig")
    # attach v32 membership
    v32 = pd.read_csv(
        CLASSES, encoding="utf-8-sig",
        usecols=["videoId", "script_group", "class_strict", "class_title_only",
                 "long_B_strict", "long_B_title_only", "sleep_title"],
    )
    plan = plan.merge(v32, on="videoId", how="left")
    comment_summary = {}
    for rule in RULES:
        class_col = "class_strict" if rule == "strict" else "class_title_only"
        long_col = "long_B_strict" if rule == "strict" else "long_B_title_only"
        keep = plan[
            (plan[class_col] == "asmr_labelled")
            & (~plan[long_col].astype(bool))
            & (plan["sleep_title"] == True)
        ].copy()
        keep_ids = set(keep["videoId"].astype(str))
        per_group = keep["script_group"].value_counts().to_dict()
        # stratum from plan (top_view / random); fall back if missing
        strat_col = "stratum" if "stratum" in keep.columns else None
        print(f"  comments {rule}: keep {len(keep)}/900; by script {per_group}", flush=True)
        if strat_col:
            ct = (
                keep.groupby(["script_group", strat_col])
                .size()
                .reset_index(name="n")
                .sort_values(["script_group", strat_col])
            )
            for _, row in ct.iterrows():
                print(
                    f"    {row['script_group']} × {row[strat_col]}: {int(row['n'])}",
                    flush=True,
                )
            print(f"    TOTAL: {len(keep)}", flush=True)

        video_meta = {}
        with COMMENTS.open("rb") as fb:
            raw = fb.read().replace(b"\x00", b"")
        with io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="") as f:
            for row in csv.DictReader(f):
                vid = (row.get("videoId") or "").strip()
                if vid not in keep_ids:
                    continue
                if vid not in video_meta:
                    sg = keep.loc[keep["videoId"].astype(str) == vid, "script_group"]
                    stratum = (row.get("stratum") or "").strip()
                    video_meta[vid] = {
                        "script_group": (sg.iloc[0] if len(sg) else "other"),
                        "stratum": stratum,
                        "n": 0,
                        "matches": {t: 0 for t in THEMES},
                    }
                video_meta[vid]["n"] += 1
                text = row.get("text") or ""
                for theme in THEMES:
                    for kw in lexicon.get(theme, []):
                        if keyword_hits(text, kw):
                            video_meta[vid]["matches"][theme] += 1
                            break

        # per script × stratum × theme: mean share + video-cluster bootstrap
        cells = defaultdict(list)  # (sg, stratum, theme) -> list of per-video shares
        for vid, meta in video_meta.items():
            if meta["n"] <= 0:
                continue
            for theme in THEMES:
                share = meta["matches"][theme] / meta["n"]
                cells[(meta["script_group"], meta["stratum"], theme)].append(share)

        rng = np.random.default_rng(SEED + (0 if rule == "strict" else 1))
        cell_rows = []
        for (sg, stratum, theme), shares in sorted(cells.items()):
            arr = np.asarray(shares, float)
            mean = float(arr.mean())
            boots = []
            for _ in range(BOOT_N):
                boots.append(float(np.mean(rng.choice(arr, size=len(arr), replace=True))))
            lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975]))
            cell_rows.append({
                "script_group": sg, "stratum": stratum, "theme": theme,
                "n_videos": int(len(arr)),
                "mean_share": round(mean, 6),
                "ci95": [round(lo, 6), round(hi, 6)],
            })
        comment_summary[rule] = {
            "n_keep": int(len(keep)),
            "per_script_group": {str(k): int(v) for k, v in per_group.items()},
            "cells": cell_rows,
        }
    summary["comments"] = comment_summary
    robust_rows.append({
        "result": "comments_theme_shares",
        "group": "all",
        "verdict": "report-only (counts/CIs; no direction test)",
    })

    summary["robust_sensitive"] = robust_rows
    (OUT / "explore_v3_5_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── markdown ──
    lines = [
        "# YouTube explore 5 (classification v3.2)",
        "",
        f"_Generated {now_iso()}. Frame: yt_classes_v32. Script groups only (no da/tl/und/lingua). "
        f"Rules: strict vs title_only. Series: Tier A only vs all asmr_labelled excl long_B._",
        "",
        "## Headline robust / sensitive",
        "",
        "| result | group | verdict |",
        "|---|---|---|",
    ]
    for r in robust_rows:
        lines.append(f"| {r['result']} | {r['group']} | {r['verdict']} |")

    lines += ["", "## 1. Duration (sleep_title vs not)", ""]
    lines.append(
        "| rule | series | script | n_ch s/n | video ratio | ch-eq ratio | cap20 ratio | "
        "ch-boot CI | order holds (v/c/cap) |"
    )
    lines.append("|---|---|---|---|---:|---:|---:|---|---|")
    for r in dur_table:
        w = r["weightings"]
        o = r["ordering"]
        lines.append(
            f"| {r['rule']} | {r['series']} | {r['script_group']} | "
            f"{r['n_ch_sleep']}/{r['n_ch_not']} | "
            f"{w['video']['ratio']} | {w['channel_equal']['ratio']} | {w['capped20']['ratio']} | "
            f"{r['ratio_channel_boot_ci95']} | "
            f"{o['video']}/{o['channel_equal']}/{o['capped20']} |"
        )

    lines += ["", "## 2. Upload clock (declared country JP/KR/TW/HK)", ""]
    lines.append(
        "| rule | region | script | n_ch s/n | night sleep CI | night not CI | "
        "diff sleep−not CI | :00/:30 s | :00/:30 n | sleep>not |"
    )
    lines.append("|---|---|---|---|---|---|---|---:|---:|---|")
    for k in sorted(clock_out.keys()):
        v = clock_out[k]
        lines.append(
            f"| {v['rule']} | {v['region']} | {v['script_group']} | "
            f"{v['n_ch_sleep']}/{v['n_ch_not']} | "
            f"{v['night_sleep']['ci95']} | {v['night_not']['ci95']} | "
            f"{v['night_diff_sleep_minus_not']['ci95']} | "
            f"{v['share_on_00_or_30_sleep']} | {v['share_on_00_or_30_not']} | "
            f"{v['direction_sleep_gt_not']} |"
        )

    lines += ["", "## 3. Creators by declared country (≥30 channels)", ""]
    lines.append("| rule | country | n_channels | n_videos | top5% ch | share videos from top5% |")
    lines.append("|---|---|---:|---:|---:|---:|")
    for r in sorted(creators, key=lambda x: (-x["n_channels"], x["rule"], x["country"])):
        lines.append(
            f"| {r['rule']} | {r['country']} | {r['n_channels']} | {r['n_videos']} | "
            f"{r['top5pct_channels']} | {r['share_videos_from_top5pct_channels']} |"
        )

    lines += ["", "## 4. Comments (900-sample membership under v3.2)", ""]
    for rule, block in comment_summary.items():
        lines.append(f"### {rule}: keep **{block['n_keep']}** / 900")
        lines.append(f"Per script group: `{block['per_script_group']}`")
        lines.append("")
        lines.append("| script | stratum | theme | n_videos | mean share | CI95 |")
        lines.append("|---|---|---|---:|---:|---|")
        for c in block["cells"]:
            lines.append(
                f"| {c['script_group']} | {c['stratum']} | {c['theme']} | "
                f"{c['n_videos']} | {c['mean_share']} | {c['ci95']} |"
            )
        lines.append("")

    lines += [
        "",
        "## Notes",
        "",
        "- Duration CI: channel-bootstrap of median ratio (2,000, fixed seed).",
        "- Upload clock: declared `country` only; channel-equal night 20:00–02:00; diff CI sleep−not.",
        "- Creators: no sleep-share comparison.",
        "- Comments: video-cluster bootstrap on per-video theme shares; counts only.",
        "",
    ]
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {DOC}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
