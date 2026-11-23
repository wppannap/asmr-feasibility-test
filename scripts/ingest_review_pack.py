#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingest filled data/human_review_pack.csv into review_log + REVIEW_RESULTS.md.

Refuses to run if any my_judgment is blank. Does not invent judgments.

Default reviewed_by=human is for a real human fill. AI fills must pass
--reviewed-by AI-assisted (never mark AI judgments as human).
"""
from __future__ import annotations

import argparse
import csv
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "data" / "human_review_pack.csv"
REVIEW = ROOT / "config" / "review_log.csv"
DOC = ROOT / "docs" / "REVIEW_RESULTS.md"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--reviewed-by",
        choices=("human", "AI-assisted"),
        default="human",
        help="Who filled my_judgment. AI fills must use AI-assisted.",
    )
    ap.add_argument("--reviewer-note", default="")
    args = ap.parse_args()
    if args.reviewed_by == "human" and not args.reviewer_note:
        note = "own review"
    elif args.reviewed_by == "AI-assisted" and not args.reviewer_note:
        note = "title-only AI-assisted fill; not a human review"
    else:
        note = args.reviewer_note

    if not PACK.exists():
        print(f"missing {PACK}", flush=True)
        return 1
    rows = list(csv.DictReader(PACK.open(encoding="utf-8-sig")))
    blanks = [r["id"] for r in rows if str(r.get("my_judgment") or "").strip() == ""]
    if blanks:
        print(f"REFUSE: blank my_judgment for {len(blanks)} rows: {blanks[:10]}…", flush=True)
        return 2

    by_block: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_block[r["block"]].append(r)

    results = {}
    for block, items in by_block.items():
        n = len(items)
        correct = 0
        for r in items:
            j = str(r["my_judgment"]).strip()
            # 1 means the positive criterion in the instructions holds
            if j == "1":
                correct += 1
        results[block] = {"n": n, "correct": correct, "score": f"{correct}/{n}"}

    # Append / upsert review_log row for the pack file
    review_rows = list(csv.DictReader(REVIEW.open(encoding="utf-8-sig")))
    fields = list(review_rows[0].keys()) if review_rows else [
        "file",
        "n",
        "result",
        "reviewed_by",
        "reviewer_note",
    ]
    summary = "; ".join(f"{b} {results[b]['score']}" for b in sorted(results))
    entry = {
        "file": "human_review_pack.csv",
        "n": str(len(rows)),
        "result": summary,
        "reviewed_by": args.reviewed_by,
        "reviewer_note": note,
    }
    found = False
    for r in review_rows:
        if r.get("file") == "human_review_pack.csv":
            r.update(entry)
            found = True
            break
    if not found:
        review_rows.append(entry)
    with REVIEW.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(review_rows)

    lines = [
        "# Review results — human_review_pack",
        "",
        f"_Ingested {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}. "
        f"reviewed_by={args.reviewed_by}; reviewer_note={note}._",
        "",
        "| block | ones/n (criterion holds) |",
        "|---|---|",
    ]
    for b in sorted(results):
        lines.append(f"| {b} | {results[b]['score']} |")
    lines.append("")
    if args.reviewed_by != "human":
        lines.append(
            f"**Note:** This ingest is `{args.reviewed_by}`, not a human review. "
            "Re-run with `--reviewed-by human` after a real person fills the pack."
        )
        lines.append("")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {REVIEW.relative_to(ROOT)} and {DOC.relative_to(ROOT)}", flush=True)
    print(f"reviewed_by={args.reviewed_by}", flush=True)
    for b, v in results.items():
        print(f"  {b}: {v['score']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
