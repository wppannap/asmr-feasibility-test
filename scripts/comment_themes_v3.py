#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comment themes on classification-v3 frame membership of the 900-video sample.
Writes docs/COMMENT_THEMES_V3.md, unpublished JSON, data/comment_precision_check_7.csv.
Counts only in docs — no comment text / channel ids / names.
"""
from __future__ import annotations

import csv
import io
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from comment_match import keyword_hits, load_lexicon  # noqa: E402
from fetch_comments import language_group  # noqa: E402

DATA = ROOT / "data"
COMMENTS = DATA / "yt_comments_v2.csv"
PLAN = DATA / "yt_comment_sample_plan_v2.csv"
CLASSES = DATA / "yt_classes_v3.csv"
MASTER = DATA / "yt_master.csv"
LEXICON = ROOT / "scripts" / "lexicon.yaml"
OUT_JSON = DATA / "unpublished" / "v3yt" / "comment_themes_v3.json"
OUT_DOC = ROOT / "docs" / "COMMENT_THEMES_V3.md"
PREC7 = DATA / "comment_precision_check_7.csv"
SEED = 42
BOOT_N = 2000
THEMES = ["insomnia", "gratitude", "anxiety_stress", "sleep_aid_effectiveness"]
LANGS = ["en", "es", "fr", "ja", "ko", "zh"]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}", flush=True)


def main() -> int:
    lexicon = load_lexicon(LEXICON)
    plan = pd.read_csv(PLAN, encoding="utf-8-sig")
    cls = pd.read_csv(
        CLASSES, encoding="utf-8-sig",
        usecols=["videoId", "class", "tier", "long_B", "sleep_title", "sleep_v2"],
    )
    plan = plan.merge(cls, on="videoId", how="left")

    # keep: asmr_labelled A/B/C, not ambient, not long_B
    keep_mask = (
        (plan["class"] == "asmr_labelled")
        & (plan["tier"].isin(["A", "B", "C"]))
        & (plan["long_B"] != True)
        & (plan["long_B"] != "True")
    )
    # long_B may be bool
    keep_mask = (
        (plan["class"] == "asmr_labelled")
        & (plan["tier"].isin(["A", "B", "C"]))
        & (~plan["long_B"].astype(bool))
    )
    leave = plan[~keep_mask]
    keep = plan[keep_mask]
    leave_tbl = (
        leave.groupby(["language_group", "stratum"]).size().reset_index(name="n_leave")
    )
    keep_tbl = (
        keep.groupby(["language_group", "stratum"]).size().reset_index(name="n_keep")
    )

    keep_ids = set(keep["videoId"].astype(str))
    print(f"sample keep {len(keep)} / 900; leave {len(leave)}", flush=True)

    # v3 analysis frame size per lang (for weighting): asmr_labelled ∩ ¬long_B ∩ sleep_title ∩ commentCount≥100
    print("Building v3 frame sizes…", flush=True)
    usecols = ["videoId", "commentCount", "viewCount", "defaultLanguage", "title_script"]
    parts = []
    id_set = set(cls.loc[
        (cls["class"] == "asmr_labelled") & (~cls["long_B"].astype(bool)) & (cls["sleep_title"] == True),
        "videoId",
    ].astype(str))
    for chunk in pd.read_csv(MASTER, encoding="utf-8-sig", usecols=usecols, chunksize=80_000, low_memory=False):
        chunk = chunk[chunk["videoId"].astype(str).isin(id_set)]
        if len(chunk):
            parts.append(chunk)
    frame = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=usecols)
    frame["commentCount"] = pd.to_numeric(frame["commentCount"], errors="coerce").fillna(0)
    frame = frame[frame["commentCount"] >= 100].copy()
    frame["language_group"] = [
        language_group(
            "" if pd.isna(a) else str(a),
            "" if pd.isna(b) else str(b),
        )
        for a, b in zip(frame["defaultLanguage"], frame["title_script"])
    ]
    frame_n = frame.groupby("language_group").size().to_dict()
    # beyond top 100
    beyond = {lg: max(0, int(frame_n.get(lg, 0)) - 100) for lg in LANGS}

    # load comments for kept videos only; build per-video match rates
    print("Scanning comments…", flush=True)
    # video -> list of comment texts (or match flags)
    # Store per (lang, stratum, theme): list of per-video shares (matches/comments)
    video_meta = {}  # vid -> (lang, stratum, n_comments, match_counts by theme)
    with COMMENTS.open("rb") as fb:
        raw = fb.read().replace(b"\x00", b"")
    with io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="") as f:
        for row in csv.DictReader(f):
            vid = (row.get("videoId") or "").strip()
            if vid not in keep_ids:
                continue
            lg = (row.get("language_group") or "").strip()
            stratum = (row.get("stratum") or "").strip()
            text = row.get("text") or ""
            if vid not in video_meta:
                video_meta[vid] = {
                    "lang": lg, "stratum": stratum,
                    "n": 0, "matches": {t: 0 for t in THEMES},
                }
            video_meta[vid]["n"] += 1
            for theme in THEMES:
                for kw in lexicon.get(theme, []):
                    if keyword_hits(text, kw):
                        video_meta[vid]["matches"][theme] += 1
                        break

    # also collect ko gratitude / sleep_aid for precision_7
    ko_pool = {"gratitude": [], "sleep_aid_effectiveness": []}
    with io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="") as f:
        for row in csv.DictReader(f):
            if (row.get("language_group") or "").strip() != "ko":
                continue
            vid = (row.get("videoId") or "").strip()
            if vid not in keep_ids:
                continue
            text = row.get("text") or ""
            for theme in ("gratitude", "sleep_aid_effectiveness"):
                hit = None
                for kw in lexicon.get(theme, []):
                    if keyword_hits(text, kw):
                        hit = kw
                        break
                if hit and len(ko_pool[theme]) < 500:
                    ko_pool[theme].append({
                        "language_group": "ko",
                        "theme": theme,
                        "keyword": hit,
                        "videoId": vid,
                        "stratum": row.get("stratum") or "",
                        "text": (text or "")[:240],
                    })

    rng = np.random.default_rng(SEED)
    # write precision_7
    prec_rows = []
    for theme in ("gratitude", "sleep_aid_effectiveness"):
        pool = ko_pool[theme]
        if not pool:
            continue
        idx = rng.choice(len(pool), size=min(10, len(pool)), replace=False)
        for i in idx:
            prec_rows.append(pool[i])
    with PREC7.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["language_group", "theme", "keyword", "videoId", "stratum", "text"])
        w.writeheader()
        for r in prec_rows:
            w.writerow(r)
    print(f"  wrote {PREC7.name} n={len(prec_rows)}", flush=True)

    def video_list(lang, stratum, theme):
        """Return arrays n_comments, n_matches per video."""
        ns, ms = [], []
        for vid, meta in video_meta.items():
            if meta["lang"] != lang or meta["stratum"] != stratum:
                continue
            if meta["n"] <= 0:
                continue
            ns.append(meta["n"])
            ms.append(meta["matches"][theme])
        return np.asarray(ns, int), np.asarray(ms, int)

    def share_from(ns, ms):
        if ns.sum() == 0:
            return None
        return float(ms.sum() / ns.sum())

    def boot_ci_videos(ns, ms, seed):
        if len(ns) == 0:
            return None, None, None
        point = share_from(ns, ms)
        rng_b = np.random.default_rng(seed)
        boots = []
        n = len(ns)
        for _ in range(BOOT_N):
            ii = rng_b.integers(0, n, size=n)
            s = share_from(ns[ii], ms[ii])
            if s is not None:
                boots.append(s)
        if not boots:
            return point, None, None
        lo, hi = np.quantile(boots, [0.025, 0.975])
        return point, float(lo), float(hi)

    cells = []
    for lg in LANGS:
        for stratum in ("top_view", "random"):
            for theme in THEMES:
                ns, ms = video_list(lg, stratum, theme)
                point, lo, hi = boot_ci_videos(ns, ms, SEED + hash((lg, stratum, theme)) % 10_000)
                cells.append({
                    "language_group": lg,
                    "stratum": stratum,
                    "theme": theme,
                    "n_videos": int(len(ns)),
                    "n_comments": int(ns.sum()) if len(ns) else 0,
                    "n_matches": int(ms.sum()) if len(ms) else 0,
                    "share": None if point is None else round(point, 6),
                    "share_ci95": [
                        None if lo is None else round(lo, 6),
                        None if hi is None else round(hi, 6),
                    ],
                })

    # frame-weighted: w_top=100, w_rand=beyond[lg]
    weighted = []
    ratios = []
    for lg in LANGS:
        w_top, w_rand = 100.0, float(beyond.get(lg, 0))
        for theme in THEMES:
            ns_t, ms_t = video_list(lg, "top_view", theme)
            ns_r, ms_r = video_list(lg, "random", theme)
            s_t = share_from(ns_t, ms_t)
            s_r = share_from(ns_r, ms_r)
            if s_t is None or s_r is None or (w_top + w_rand) == 0:
                fw = None
                fw_lo = fw_hi = None
            else:
                fw = (w_top * s_t + w_rand * s_r) / (w_top + w_rand)
                # bootstrap: resample videos in each stratum independently, then combine
                rng_b = np.random.default_rng(SEED + 1000 + hash((lg, theme)) % 9000)
                boots = []
                for _ in range(BOOT_N):
                    if len(ns_t):
                        ii = rng_b.integers(0, len(ns_t), size=len(ns_t))
                        st = share_from(ns_t[ii], ms_t[ii])
                    else:
                        st = None
                    if len(ns_r):
                        jj = rng_b.integers(0, len(ns_r), size=len(ns_r))
                        sr = share_from(ns_r[jj], ms_r[jj])
                    else:
                        sr = None
                    if st is None or sr is None:
                        continue
                    boots.append((w_top * st + w_rand * sr) / (w_top + w_rand))
                if boots:
                    fw_lo, fw_hi = (float(x) for x in np.quantile(boots, [0.025, 0.975]))
                else:
                    fw_lo = fw_hi = None
            ratio = None if (s_t is None or s_r is None or s_r == 0) else (s_t / s_r)
            weighted.append({
                "language_group": lg,
                "theme": theme,
                "w_top_view": w_top,
                "w_random": w_rand,
                "frame_n": int(frame_n.get(lg, 0)),
                "share_top_view": None if s_t is None else round(s_t, 6),
                "share_random": None if s_r is None else round(s_r, 6),
                "frame_weighted_share": None if fw is None else round(fw, 6),
                "frame_weighted_ci95": [
                    None if fw_lo is None else round(fw_lo, 6),
                    None if fw_hi is None else round(fw_hi, 6),
                ],
                "ratio_top_over_random": None if ratio is None else round(ratio, 4),
            })
            ratios.append({"language_group": lg, "theme": theme, "ratio": ratio})

    # Korean insomnia vs each other language (per stratum), video-cluster bootstrap of difference
    ko_tests = []
    for stratum in ("top_view", "random"):
        ns_k, ms_k = video_list("ko", stratum, "insomnia")
        s_k = share_from(ns_k, ms_k)
        for other in [lg for lg in LANGS if lg != "ko"]:
            ns_o, ms_o = video_list(other, stratum, "insomnia")
            s_o = share_from(ns_o, ms_o)
            if s_k is None or s_o is None or len(ns_k) == 0 or len(ns_o) == 0:
                ko_tests.append({
                    "stratum": stratum, "other": other,
                    "diff_ko_minus_other": None, "ci95": [None, None],
                    "share_ko": s_k, "share_other": s_o,
                })
                continue
            diff = s_k - s_o
            rng_b = np.random.default_rng(SEED + 2000 + hash((stratum, other)) % 8000)
            boots = []
            for _ in range(BOOT_N):
                ik = rng_b.integers(0, len(ns_k), size=len(ns_k))
                ioth = rng_b.integers(0, len(ns_o), size=len(ns_o))
                sk = share_from(ns_k[ik], ms_k[ik])
                so = share_from(ns_o[ioth], ms_o[ioth])
                if sk is not None and so is not None:
                    boots.append(sk - so)
            lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975])) if boots else (None, None)
            ko_tests.append({
                "stratum": stratum,
                "other": other,
                "share_ko": None if s_k is None else round(s_k, 6),
                "share_other": None if s_o is None else round(s_o, 6),
                "diff_ko_minus_other": round(diff, 6),
                "ci95": [None if lo is None else round(lo, 6), None if hi is None else round(hi, 6)],
                "ci_excludes_0": bool(lo is not None and hi is not None and (lo > 0 or hi < 0)),
            })

    payload = {
        "meta": {
            "generated_at": now_iso(),
            "n_sample_plan": 900,
            "n_keep_v3": int(len(keep)),
            "n_leave_v3": int(len(leave)),
            "keep_rule": "asmr_labelled tiers A/B/C AND NOT long_B",
            "frame_for_weights": "asmr_labelled ∩ ¬long_B ∩ sleep_title ∩ commentCount≥100",
            "bootstrap": f"video-cluster, {BOOT_N} resamples, seed={SEED}",
            "caveats": ["counts only; no comment text", "Not published."],
        },
        "leave_counts": leave_tbl.to_dict("records"),
        "keep_counts": keep_tbl.to_dict("records"),
        "cells": cells,
        "frame_weighted": weighted,
        "ko_insomnia_vs_other": ko_tests,
        "frame_n_by_lang": frame_n,
        "beyond_top100_by_lang": beyond,
    }
    dump(OUT_JSON, payload)

    # docs
    lines = [
        "# Comment themes v3 (classification-v3 membership)",
        "",
        f"_Generated {now_iso()}. Counts only. Source comments: yt_comments_v2 on v3-kept sample videos._",
        "",
        "## 1. Sample membership under v3",
        "",
        f"Keep rule: `asmr_labelled` tiers A/B/C and not `long_B`. "
        f"**Keep {len(keep)} / 900**; leave **{len(leave)}**.",
        "",
        "| language | stratum | n_leave | n_keep |",
        "|---|---|---:|---:|",
    ]
    merged = keep_tbl.merge(leave_tbl, on=["language_group", "stratum"], how="outer").fillna(0)
    for _, r in merged.sort_values(["language_group", "stratum"]).iterrows():
        lines.append(
            f"| {r['language_group']} | {r['stratum']} | {int(r.get('n_leave', 0))} | {int(r.get('n_keep', 0))} |"
        )

    lines += [
        "",
        "## 2. Theme shares (remaining videos) with video-cluster CI",
        "",
        "| lang | stratum | theme | videos | comments | matches | share | CI95 |",
        "|---|---|---|---:|---:|---:|---:|---|",
    ]
    for c in cells:
        lines.append(
            f"| {c['language_group']} | {c['stratum']} | {c['theme']} | {c['n_videos']} | "
            f"{c['n_comments']} | {c['n_matches']} | {c['share']} | {c['share_ci95']} |"
        )

    lines += [
        "",
        "## 3. Frame-weighted shares (w_top=100, w_random = frame_n − 100)",
        "",
        f"Frame: `{payload['meta']['frame_for_weights']}`.",
        "",
        "| lang | theme | frame_n | w_rand | share_top | share_rand | weighted | CI95 | top/rand |",
        "|---|---|---:|---:|---:|---:|---:|---|---:|",
    ]
    for w in weighted:
        lines.append(
            f"| {w['language_group']} | {w['theme']} | {w['frame_n']} | {int(w['w_random'])} | "
            f"{w['share_top_view']} | {w['share_random']} | {w['frame_weighted_share']} | "
            f"{w['frame_weighted_ci95']} | {w['ratio_top_over_random']} |"
        )

    lines += [
        "",
        "## 4. Korean insomnia − other language (video-cluster bootstrap)",
        "",
        "| stratum | other | share_ko | share_other | diff | CI95 | excludes 0? |",
        "|---|---|---:|---:|---:|---|---|",
    ]
    for t in ko_tests:
        lines.append(
            f"| {t['stratum']} | {t['other']} | {t.get('share_ko')} | {t.get('share_other')} | "
            f"{t.get('diff_ko_minus_other')} | {t.get('ci95')} | {t.get('ci_excludes_0')} |"
        )

    lines += [
        "",
        "## 5. Precision sample (not judged)",
        "",
        "`data/comment_precision_check_7.csv`: 10 ko gratitude + 10 ko sleep_aid_effectiveness matches.",
        "",
        "_Do not publish._",
        "",
    ]
    OUT_DOC.write_text("\n".join(lines), encoding="utf-8")
    print(f"  wrote {OUT_DOC.relative_to(ROOT)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
