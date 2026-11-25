#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ingest filled data/human_review_pack.csv into review_log + REVIEW_RESULTS.md.

ONLY this script may write reviewed_by=human into config/review_log.csv.
When --reviewed-by human, also writes config/review_ingest.json (sha256 of the
filled pack, row count, non-blank my_judgment count, timestamp).

Refuses to run if any my_judgment is blank. Does not invent judgments.
AI fills must pass --reviewed-by AI-assisted (never mark AI judgments as human).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "data" / "human_review_pack.csv"
REVIEW = ROOT / "config" / "review_log.csv"
INGEST = ROOT / "config" / "review_ingest.json"
DOC = ROOT / "docs" / "REVIEW_RESULTS.md"

ALLOWED_REVIEWED_BY = ("human", "AI-assisted", "script", "UNSET")
SCRIPT_OUTPUT_FILES = frozenset({"trends_repeat_check.csv"})


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_review_rows() -> tuple[list[dict], list[str]]:
    if not REVIEW.exists():
        fields = ["file", "n", "result", "reviewed_by", "reviewer_note"]
        return [], fields
    raw = REVIEW.read_bytes()
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("latin-1", errors="replace")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    rows = list(csv.DictReader(text.splitlines()))
    # Normalise BOM-ish field name
    if rows and "file" not in rows[0] and rows[0]:
        first = next(iter(rows[0]))
        if first.lstrip("\ufeff") == "file":
            for r in rows:
                r["file"] = r.pop(first)
    fields = list(rows[0].keys()) if rows else [
        "file",
        "n",
        "result",
        "reviewed_by",
        "reviewer_note",
    ]
    if "file" not in fields:
        fields = ["file"] + [f for f in fields if f != "file"]
    return rows, fields


def write_review_rows(rows: list[dict], fields: list[str]) -> None:
    with REVIEW.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def write_ingest_receipt(
    *,
    sha256: str,
    row_count: int,
    nonblank: int,
    blocks: list[str],
    ts: str,
) -> None:
    payload = {
        "generated_at": ts,
        "source": "scripts/ingest_review_pack.py",
        "files": {
            "human_review_pack.csv": {
                "sha256": sha256,
                "row_count": row_count,
                "nonblank_my_judgment": nonblank,
                "ingested_at": ts,
                "reviewed_by": "human",
            }
        },
        "pack_blocks": sorted(blocks),
    }
    INGEST.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


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

    pack_bytes = PACK.read_bytes()
    sha256 = hashlib.sha256(pack_bytes).hexdigest()
    rows = list(csv.DictReader(PACK.open(encoding="utf-8-sig")))
    blanks = [r["id"] for r in rows if str(r.get("my_judgment") or "").strip() == ""]
    if blanks:
        print(f"REFUSE: blank my_judgment for {len(blanks)} rows: {blanks[:10]}…", flush=True)
        return 2

    nonblank = sum(
        1 for r in rows if str(r.get("my_judgment") or "").strip() != ""
    )

    by_block: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_block[r["block"]].append(r)

    results = {}
    for block, items in by_block.items():
        n = len(items)
        correct = sum(1 for r in items if str(r["my_judgment"]).strip() == "1")
        results[block] = {"n": n, "correct": correct, "score": f"{correct}/{n}"}

    # Only this script writes reviewed_by=human (and only for the pack file).
    if args.reviewed_by == "human":
        for name in SCRIPT_OUTPUT_FILES:
            # never claim script outputs as human via this path
            pass
        ts = now_iso()
        write_ingest_receipt(
            sha256=sha256,
            row_count=len(rows),
            nonblank=nonblank,
            blocks=list(by_block.keys()),
            ts=ts,
        )
        print(f"wrote {INGEST.relative_to(ROOT)}", flush=True)
    reviewed_by = args.reviewed_by
    if reviewed_by not in ALLOWED_REVIEWED_BY:
        print(f"REFUSE: reviewed_by={reviewed_by!r} not allowed", flush=True)
        return 3

    review_rows, fields = read_review_rows()
    summary = "; ".join(f"{b} {results[b]['score']}" for b in sorted(results))
    entry = {
        "file": "human_review_pack.csv",
        "n": str(len(rows)),
        "result": summary,
        "reviewed_by": reviewed_by,
        "reviewer_note": note,
    }
    found = False
    for r in review_rows:
        if r.get("file") == "human_review_pack.csv":
            # Only overwrite reviewed_by=human through this script.
            r.update(entry)
            found = True
            break
    if not found:
        review_rows.append(entry)
    write_review_rows(review_rows, fields)

    lines = [
        "# Review results — human_review_pack",
        "",
        f"_Ingested {now_iso()}. "
        f"reviewed_by={reviewed_by}; reviewer_note={note}._",
        "",
        "| block | ones/n (criterion holds) |",
        "|---|---|",
    ]
    for b in sorted(results):
        lines.append(f"| {b} | {results[b]['score']} |")
    lines.append("")
    if reviewed_by != "human":
        lines.append(
            f"**Note:** This ingest is `{reviewed_by}`, not a human review. "
            "Re-run with `--reviewed-by human` after a real person fills the pack."
        )
        lines.append("")
        lines.append(
            "AI-assisted ingest does **not** write `config/review_ingest.json` "
            "and must not be treated as human."
        )
        lines.append("")
    DOC.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {REVIEW.relative_to(ROOT)} and {DOC.relative_to(ROOT)}", flush=True)
    print(f"reviewed_by={reviewed_by}", flush=True)
    print(f"pack sha256={sha256} rows={len(rows)} nonblank={nonblank}", flush=True)
    for b, v in results.items():
        print(f"  {b}: {v['score']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
