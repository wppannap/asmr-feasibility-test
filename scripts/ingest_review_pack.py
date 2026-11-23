#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingest filled data/human_review_pack.csv into review_log + REVIEW_RESULTS.md.

Refuses to run if any my_judgment is blank. Does not invent judgments.
"""
from __future__ import annotations

import csv
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "data" / "human_review_pack.csv"
REVIEW = ROOT / "config" / "review_log.csv"
DOC = ROOT / "docs" / "REVIEW_RESULTS.md"

# Expected 1 = positive judgment per block (see REVIEW_PACK_INSTRUCTIONS.md)
EXPECT_ONE = {
    "ambient_v32": True,
    "sleep_title": True,
    "tierA": True,
    "tierB": True,
    "not_asmr_but_human_trigger": True,
}


def main() -> int:
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
        "reviewed_by": "human",
        "reviewer_note": "own review",
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
        f"_Ingested {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}. reviewed_by=human; reviewer_note=own review._",
        "",
        "| block | correct/n |",
        "|---|---|",
    ]
    for b in sorted(results):
        lines.append(f"| {b} | {results[b]['score']} |")
    lines.append("")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {REVIEW.relative_to(ROOT)} and {DOC.relative_to(ROOT)}", flush=True)
    for b, v in results.items():
        print(f"  {b}: {v['score']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
