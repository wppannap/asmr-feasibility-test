#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Comment sample under classification v3.2 final frame (local; unpublished).

Frame: asmr_labelled (title_only) ∧ ¬long_B ∧ sleep_title ∧ commentCount≥100.
Groups: Korean / Japanese / Han / Latin script. Per group: 100 top-view + 50 random
(seed 42). Reuse existing comments; fetch rest via commentThreads.list (1 page).
Hard cap 1,200 units. Key from .env — never printed.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_comments as FC  # noqa: E402
from comment_match import find_match, load_lexicon  # noqa: E402

DATA = ROOT / "data"
CLASSES = DATA / "yt_classes_v32.csv"
MASTER = DATA / "yt_master.csv"
OLD_V2 = DATA / "yt_comments_v2.csv"
OLD_SAMPLE = DATA / "yt_comments_sample.csv"
OUT_COMMENTS = DATA / "yt_comments_v32_frame.csv"
PLAN = DATA / "yt_comment_sample_plan_v32.csv"
PRECISION = DATA / "comment_precision_check_8.csv"
READY = DATA / "unpublished" / "web_ready" / "yt_comments_v32.json"
REVIEW = ROOT / "config" / "review_log.csv"
LEX = ROOT / "scripts" / "lexicon.yaml"
QUOTA_LOG = DATA / "api_quota_log.csv"

SCRIPTS = [
    "Korean script",
    "Japanese script",
    "Han script (mostly Chinese)",
    "Latin script",
]
THEMES = ["insomnia", "gratitude", "anxiety_stress", "sleep_aid_effectiveness"]
SEED = 42
TOP_N = 100
RAND_N = 50
HARD_CAP = 1200
MIN_COMMENTS = 100
BOOT_N = 2000


def load_frame() -> pd.DataFrame:
    cls = pd.read_csv(
        CLASSES,
        encoding="utf-8-sig",
        usecols=[
            "videoId",
            "script_group",
            "class_title_only",
            "long_B_title_only",
            "sleep_title",
            "title",
        ],
    )
    keep = cls[
        (cls["class_title_only"] == "asmr_labelled")
        & (~cls["long_B_title_only"].astype(bool))
        & (cls["sleep_title"] == True)
        & (cls["script_group"].isin(SCRIPTS))
    ].copy()
    ids = set(keep["videoId"].astype(str))
    parts = []
    usecols = ["videoId", "viewCount", "commentCount"]
    for chunk in pd.read_csv(
        MASTER, encoding="utf-8-sig", usecols=usecols, chunksize=50_000, low_memory=False
    ):
        chunk = chunk[chunk["videoId"].astype(str).isin(ids)]
        if len(chunk):
            parts.append(chunk)
    m = pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=usecols)
    m["viewCount"] = pd.to_numeric(m["viewCount"], errors="coerce").fillna(0).astype(int)
    m["commentCount"] = pd.to_numeric(m["commentCount"], errors="coerce").fillna(0).astype(int)
    m = m[m["commentCount"] >= MIN_COMMENTS]
    return keep.merge(m, on="videoId", how="inner")


def build_plan(frame: pd.DataFrame) -> pd.DataFrame:
    rng = np.random.default_rng(SEED)
    rows = []
    print("Available frame size per script group (commentCount≥100):", flush=True)
    for sg in SCRIPTS:
        g = frame[frame["script_group"] == sg].sort_values("viewCount", ascending=False)
        print(f"  {sg}: {len(g)}", flush=True)
        top = g.head(TOP_N)
        rest = g.iloc[TOP_N:]
        n_rand = min(RAND_N, len(rest))
        rand = rest.iloc[rng.choice(len(rest), size=n_rand, replace=False)] if n_rand else rest.iloc[0:0]
        for _, r in top.iterrows():
            rows.append({**r.to_dict(), "stratum": "top_view"})
        for _, r in rand.iterrows():
            rows.append({**r.to_dict(), "stratum": "random"})
    return pd.DataFrame(rows)


def load_existing_comments(video_ids: set[str]) -> list[dict]:
    out = []
    for path in (OLD_V2, OLD_SAMPLE):
        if not path.exists():
            continue
        with path.open("rb") as fb:
            raw = fb.read().replace(b"\x00", b"")
        with io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="") as f:
            for row in csv.DictReader(f):
                vid = (row.get("videoId") or "").strip()
                if vid in video_ids:
                    out.append(
                        {
                            "videoId": vid,
                            "commentId": row.get("commentId") or "",
                            "text": row.get("text") or "",
                            "likeCount": row.get("likeCount") or "",
                            "publishedAt": row.get("publishedAt") or "",
                            "language_group": row.get("language_group") or "",
                            "stratum": row.get("stratum") or "",
                        }
                    )
    return out


def theme_stats(plan: pd.DataFrame, comments: list[dict], lexicon: dict) -> dict:
    by_vid = defaultdict(list)
    for c in comments:
        by_vid[c["videoId"]].append(c.get("text") or "")
    meta = plan.set_index("videoId")
    rng = np.random.default_rng(SEED)
    out_rows = []
    low20 = {}
    for sg in SCRIPTS:
        vids_sg = plan[plan["script_group"] == sg]["videoId"].astype(str).tolist()
        n_low = sum(1 for v in vids_sg if len(by_vid.get(v, [])) < 20)
        low20[sg] = {"n_videos": len(vids_sg), "share_lt_20_comments": round(n_low / max(1, len(vids_sg)), 4)}
        for stratum in ("top_view", "random"):
            sub = plan[(plan["script_group"] == sg) & (plan["stratum"] == stratum)]
            for theme in THEMES:
                video_shares = []
                match_vids = 0
                n_comments = 0
                n_matches = 0
                per_vid_matches = []
                for _, r in sub.iterrows():
                    vid = str(r["videoId"])
                    texts = by_vid.get(vid, [])
                    n_comments += len(texts)
                    hits = sum(1 for t in texts if find_match(t, lexicon.get(theme) or []))
                    n_matches += hits
                    share = hits / len(texts) if texts else 0.0
                    video_shares.append(share)
                    per_vid_matches.append(hits)
                    if hits:
                        match_vids += 1
                mean_share = float(np.mean(video_shares)) if video_shares else 0.0
                # video-cluster bootstrap
                boots = []
                arr = np.asarray(video_shares, float)
                if len(arr):
                    for _ in range(BOOT_N):
                        boots.append(float(np.mean(rng.choice(arr, size=len(arr), replace=True))))
                    lo, hi = (float(x) for x in np.quantile(boots, [0.025, 0.975]))
                else:
                    lo = hi = None
                top_share = None
                if per_vid_matches and n_matches:
                    top_share = round(max(per_vid_matches) / n_matches, 4)
                out_rows.append(
                    {
                        "script_group": sg,
                        "stratum": stratum,
                        "theme": theme,
                        "n_videos": int(len(sub)),
                        "n_comments": int(n_comments),
                        "n_matches": int(n_matches),
                        "share": round(mean_share, 6),
                        "n_videos_with_match": int(match_vids),
                        "top_video_share_of_matches": top_share,
                        "share_ci95": [
                            None if lo is None else round(lo, 6),
                            None if hi is None else round(hi, 6),
                        ],
                    }
                )
    return {"theme_rows": out_rows, "low_comment_share": low20}


def write_precision(comments: list[dict], plan: pd.DataFrame, lexicon: dict) -> None:
    plan_u = plan.drop_duplicates("videoId", keep="first")
    by_vid = {
        str(r["videoId"]): {
            "script_group": r["script_group"],
            "title": r.get("title") or "",
        }
        for _, r in plan_u.iterrows()
    }
    rng = np.random.default_rng(SEED + 7)
    rows = []
    for sg in ("Korean script", "Han script (mostly Chinese)", "Latin script"):
        hits = []
        for c in comments:
            vid = c["videoId"]
            meta = by_vid.get(vid)
            if meta is None or meta["script_group"] != sg:
                continue
            if find_match(c.get("text") or "", lexicon.get("insomnia") or []):
                hits.append(
                    {
                        "script_group": sg,
                        "title": meta.get("title") or "",
                        "text": c.get("text") or "",
                    }
                )
        pick = hits
        if len(hits) > 10:
            idx = rng.choice(len(hits), size=10, replace=False)
            pick = [hits[i] for i in idx]
        for i, h in enumerate(pick[:10], 1):
            rows.append(
                {
                    "id": f"{sg[:2]}{i}",
                    "script_group": h["script_group"],
                    "title": h["title"],
                    "comment_text": h["text"][:500],
                    "my_judgment": "",
                    "note": "",
                }
            )
    with PRECISION.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(
            f, fieldnames=["id", "script_group", "title", "comment_text", "my_judgment", "note"]
        )
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {PRECISION.relative_to(ROOT)} n={len(rows)}", flush=True)


def ensure_review_row() -> None:
    rows = list(csv.DictReader(REVIEW.open(encoding="utf-8-sig")))
    fields = list(rows[0].keys())
    if any(r.get("file") == "comment_precision_check_8.csv" for r in rows):
        return
    with REVIEW.open("a", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writerow(
            {
                "file": "comment_precision_check_8.csv",
                "n": "",
                "result": "",
                "reviewed_by": "UNSET",
                "reviewer_note": "",
            }
        )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--budget", type=int, default=HARD_CAP)
    args = ap.parse_args()

    frame = load_frame()
    plan = build_plan(frame)
    plan.to_csv(PLAN, index=False, encoding="utf-8-sig")
    print(f"plan n={len(plan)} -> {PLAN.name}", flush=True)

    video_ids = set(plan["videoId"].astype(str))
    existing = load_existing_comments(video_ids)
    have = {c["videoId"] for c in existing}
    need = [vid for vid in plan["videoId"].astype(str) if vid not in have]
    print(f"reuse videos with comments: {len(have)}; need fetch: {len(need)}", flush=True)

    fetched = []
    units = 0
    if not args.dry_run and need:
        key = FC.load_api_key()
        salt = FC.get_salt()
        for vid in need:
            if units + FC.COST_PER_CALL > args.budget:
                FC.log(f"Hard cap reached ({units}/{args.budget}). Stopping.")
                break
            data, status, note, quota_hit = FC.api_comment_threads(key, vid)
            units += FC.COST_PER_CALL
            FC.append_rows(
                QUOTA_LOG,
                FC.QUOTA_FIELDS,
                [
                    {
                        "timestamp": FC.utc_now(),
                        "endpoint": "commentThreads.list",
                        "n_ids": 1,
                        "units": FC.COST_PER_CALL,
                        "http_status": status,
                        "ok": data is not None,
                        "note": f"{note};videoId={vid};v32_frame",
                    }
                ],
            )
            if quota_hit:
                FC.log("quotaExceeded — stopping cleanly.")
                break
            if data is None:
                continue
            rows = FC.parse_comments(data, vid, "", salt)
            for r in rows:
                r["stratum"] = ""
                fetched.append(r)
        print(f"fetched comment rows: {len(fetched)}; units={units}", flush=True)
    elif args.dry_run:
        print(f"[dry-run] would fetch up to {min(len(need), args.budget)} videos", flush=True)

    # attach stratum from plan
    stratum_map = plan.set_index("videoId")["stratum"].to_dict()
    all_comments = existing + fetched
    for c in all_comments:
        c["stratum"] = stratum_map.get(c["videoId"], c.get("stratum") or "")

    fields = ["videoId", "commentId", "text", "likeCount", "publishedAt", "language_group", "stratum"]
    with OUT_COMMENTS.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for c in all_comments:
            w.writerow({k: c.get(k, "") for k in fields})

    lexicon = load_lexicon(LEX)
    stats = theme_stats(plan, all_comments, lexicon)
    READY.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "generated_at": FC.utc_now(),
            "frame": "title_only asmr_labelled ∧ ¬long_B ∧ sleep_title ∧ commentCount≥100",
            "n_plan_videos": int(len(plan)),
            "n_comment_rows": int(len(all_comments)),
            "units_this_run": units,
            "caveats": [
                "Counts only; lexicon unchanged.",
                "Video-cluster bootstrap 95% CI (2,000, seed 42).",
            ],
        },
        **stats,
    }
    READY.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {READY.relative_to(ROOT)}", flush=True)
    for row in stats["theme_rows"]:
        print(
            f"{row['script_group']}|{row['stratum']}|{row['theme']}: "
            f"v={row['n_videos']} c={row['n_comments']} m={row['n_matches']} "
            f"share={row['share']} ci={row['share_ci95']}",
            flush=True,
        )
    for sg, v in stats["low_comment_share"].items():
        print(f"low<20 {sg}: {v}", flush=True)

    write_precision(all_comments, plan, lexicon)
    ensure_review_row()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
