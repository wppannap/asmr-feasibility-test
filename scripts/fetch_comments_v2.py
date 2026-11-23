#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Comments top-up v2 for human_asmr ∩ sleep_strict ∩ commentCount≥100.

Per language group {en,es,fr,ja,ko,zh}: 150 videos = 100 top-viewed + 50 random
(seed 42) from the remainder, with stratum column.

Reuses comments already in data/yt_comments_sample.csv for overlapping videoIds;
fetches only the rest via commentThreads.list (same method as fetch_comments.py).

Hard cap 1,200 units; stop on quotaExceeded; log to data/api_quota_log.csv.
Output: data/yt_comments_v2.csv (same schema + stratum; hashed commentId; no authors).

Usage:
  .venv/bin/python scripts/fetch_comments_v2.py
  .venv/bin/python scripts/fetch_comments_v2.py --dry-run
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_comments as FC  # noqa: E402

DATA = ROOT / "data"
OUT = DATA / "yt_comments_v2.csv"
PLAN = DATA / "yt_comment_sample_plan_v2.csv"
ATTEMPTED = DATA / "yt_comments_attempted_v2.csv"
OLD_SAMPLE = DATA / "yt_comments_sample.csv"
CLASSES = DATA / "yt_classes.csv"
MASTER = DATA / "yt_master.csv"
QUOTA_LOG = DATA / "api_quota_log.csv"

LANGS = ["en", "es", "fr", "ja", "ko", "zh"]
SEED = 42
TOP_N = 100
RAND_N = 50
PER_LANG = TOP_N + RAND_N  # 150
HARD_CAP = 1200
MIN_COMMENTS = 100

OUT_FIELDS = FC.OUT_FIELDS + ["stratum"]
PLAN_FIELDS = [
    "videoId", "language_group", "stratum", "viewCount", "commentCount",
    "defaultLanguage", "title_script",
]
ATTEMPTED_FIELDS = ["videoId", "language_group", "stratum", "status", "fetched_at"]


def load_frame() -> pd.DataFrame:
    cls = pd.read_csv(
        CLASSES, encoding="utf-8-sig",
        usecols=["videoId", "class", "sleep_strict"],
    )
    human = cls[(cls["class"] == "human_asmr") & (cls["sleep_strict"] == True)].copy()
    ids = set(human["videoId"].astype(str))

    parts = []
    usecols = [
        "videoId", "viewCount", "commentCount", "defaultLanguage", "title_script",
    ]
    for chunk in pd.read_csv(
        MASTER, encoding="utf-8-sig", usecols=usecols, chunksize=50_000, low_memory=False
    ):
        chunk = chunk[chunk["videoId"].astype(str).isin(ids)]
        if len(chunk):
            parts.append(chunk)
    m = pd.concat(parts, ignore_index=True)
    m["viewCount"] = pd.to_numeric(m["viewCount"], errors="coerce").fillna(0).astype(int)
    m["commentCount"] = pd.to_numeric(m["commentCount"], errors="coerce").fillna(0).astype(int)
    m = m[m["commentCount"] >= MIN_COMMENTS].copy()
    m["language_group"] = [
        FC.language_group(dl, ts)
        for dl, ts in zip(m["defaultLanguage"].fillna(""), m["title_script"].fillna(""))
    ]
    m = m[m["language_group"].isin(LANGS)].copy()
    return m


def build_plan(frame: pd.DataFrame) -> list[dict]:
    rng = np.random.default_rng(SEED)
    plan = []
    for lg in LANGS:
        g = frame[frame["language_group"] == lg].sort_values("viewCount", ascending=False)
        if len(g) == 0:
            FC.log(f"  {lg}: 0 eligible")
            continue
        top = g.head(TOP_N)
        rest = g.iloc[TOP_N:]
        n_rand = min(RAND_N, len(rest))
        if n_rand > 0:
            idx = rng.choice(len(rest), size=n_rand, replace=False)
            rand = rest.iloc[idx]
        else:
            rand = rest.iloc[0:0]
        FC.log(f"  {lg}: top={len(top)} random={len(rand)} pool={len(g)}")
        for _, r in top.iterrows():
            plan.append({**r.to_dict(), "stratum": "top_view"})
        for _, r in rand.iterrows():
            plan.append({**r.to_dict(), "stratum": "random"})
    return plan


def write_plan(plan: list[dict]) -> None:
    with PLAN.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PLAN_FIELDS)
        w.writeheader()
        for row in plan:
            w.writerow({k: row.get(k, "") for k in PLAN_FIELDS})


def copy_reused_comments(plan_ids: set[str], plan_meta: dict[str, dict]) -> set[str]:
    """Copy overlapping comments from v1 sample into v2; return videoIds copied."""
    if not OLD_SAMPLE.exists():
        return set()
    FC.ensure_csv(OUT, OUT_FIELDS)
    done = FC.load_ids_from_csv(OUT)
    reused = set()
    rows_out = []
    with OLD_SAMPLE.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            vid = (row.get("videoId") or "").strip()
            if vid not in plan_ids or vid in done:
                continue
            meta = plan_meta.get(vid, {})
            rows_out.append({
                "videoId": vid,
                "commentId": row.get("commentId", ""),
                "text": row.get("text", ""),
                "likeCount": row.get("likeCount", ""),
                "publishedAt": row.get("publishedAt", ""),
                "language_group": row.get("language_group") or meta.get("language_group", ""),
                "stratum": meta.get("stratum", ""),
            })
            reused.add(vid)
    # append unique by video (batch)
    if rows_out:
        # only videos not yet in OUT
        FC.append_rows(OUT, OUT_FIELDS, rows_out)
        for vid in reused:
            meta = plan_meta[vid]
            FC.append_rows(
                ATTEMPTED, ATTEMPTED_FIELDS,
                [{
                    "videoId": vid,
                    "language_group": meta.get("language_group", ""),
                    "stratum": meta.get("stratum", ""),
                    "status": "reused_v1",
                    "fetched_at": FC.utc_now(),
                }],
            )
    FC.log(f"Reused comments for {len(reused)} videos from v1 sample")
    return reused


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--budget", type=int, default=HARD_CAP)
    ap.add_argument("--sleep", type=float, default=0.05)
    args = ap.parse_args()

    key = FC.load_api_key()
    salt = FC.get_salt()

    FC.log("Loading frame (human_asmr ∩ sleep_strict ∩ commentCount≥100)…")
    frame = load_frame()
    FC.log(f"Frame videos: {len(frame)} by lang: {frame['language_group'].value_counts().to_dict()}")

    plan = build_plan(frame)
    write_plan(plan)
    FC.log(f"Plan size: {len(plan)} → {PLAN}")

    plan_meta = {p["videoId"]: p for p in plan}
    plan_ids = set(plan_meta)

    if args.dry_run:
        from collections import Counter
        FC.log(f"Plan by lang/stratum: {Counter((p['language_group'], p['stratum']) for p in plan)}")
        return 0

    FC.ensure_csv(OUT, OUT_FIELDS)
    FC.ensure_csv(QUOTA_LOG, FC.QUOTA_FIELDS)
    FC.ensure_csv(ATTEMPTED, ATTEMPTED_FIELDS)

    reused = copy_reused_comments(plan_ids, plan_meta)
    done = FC.load_ids_from_csv(OUT) | FC.load_ids_from_csv(ATTEMPTED)
    todo = [p for p in plan if p["videoId"] not in done]
    FC.log(f"Already done/attempted: {len(done)}; remaining to fetch: {len(todo)}; budget={args.budget}")

    units = 0
    n_comments = 0
    for i, v in enumerate(todo, 1):
        if units + FC.COST_PER_CALL > args.budget:
            FC.log(f"Hard cap reached ({units}/{args.budget}). Stopping.")
            break
        vid = v["videoId"]
        lg = v["language_group"]
        stratum = v["stratum"]
        FC.log(f"[{i}/{len(todo)}] {vid} ({lg}/{stratum}) views={v['viewCount']}")

        data, status, note, quota_hit = FC.api_comment_threads(key, vid)
        units += FC.COST_PER_CALL
        FC.append_rows(
            QUOTA_LOG, FC.QUOTA_FIELDS,
            [{
                "timestamp": FC.utc_now(),
                "endpoint": "commentThreads.list",
                "n_ids": 1,
                "units": FC.COST_PER_CALL,
                "http_status": status,
                "ok": data is not None,
                "note": f"v2;{note};videoId={vid};stratum={stratum}",
            }],
        )
        if quota_hit:
            FC.log("quotaExceeded — stopping cleanly.")
            break
        if note == "commentsDisabled":
            FC.append_rows(
                ATTEMPTED, ATTEMPTED_FIELDS,
                [{"videoId": vid, "language_group": lg, "stratum": stratum,
                  "status": "commentsDisabled", "fetched_at": FC.utc_now()}],
            )
            continue
        if data is None:
            FC.append_rows(
                ATTEMPTED, ATTEMPTED_FIELDS,
                [{"videoId": vid, "language_group": lg, "stratum": stratum,
                  "status": note, "fetched_at": FC.utc_now()}],
            )
            continue
        rows = FC.parse_comments(data, vid, lg, salt)
        for r in rows:
            r["stratum"] = stratum
        FC.append_rows(OUT, OUT_FIELDS, rows)
        FC.append_rows(
            ATTEMPTED, ATTEMPTED_FIELDS,
            [{"videoId": vid, "language_group": lg, "stratum": stratum,
              "status": f"ok_n={len(rows)}", "fetched_at": FC.utc_now()}],
        )
        n_comments += len(rows)
        if args.sleep > 0:
            import time
            time.sleep(args.sleep)

    FC.log(f"Done. New comments fetched: {n_comments}; units this run: {units}; reused videos: {len(reused)}; out={OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
