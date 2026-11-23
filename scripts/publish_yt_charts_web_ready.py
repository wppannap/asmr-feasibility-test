#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build unpublished YouTube chart payloads under data/unpublished/web_ready/.

Does NOT write under web/data/ and does NOT touch ENABLED_SECTIONS.
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "unpublished" / "v3yt" / "explore_v3_5_summary.json"
OUT = ROOT / "data" / "unpublished" / "web_ready"
REVIEW = ROOT / "config" / "review_log.csv"

# Checks that gate enabling these charts (must not be UNSET)
GATE_FILES = [
    "class_check_v3_A.csv",
    "class_check_v3_ambient.csv",
    "class_check_v3_sleep_title.csv",
    "class_check_v3_longB.csv",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def review_meta() -> dict:
    rows = []
    if REVIEW.exists():
        with REVIEW.open(encoding="utf-8-sig", newline="") as f:
            rows = list(csv.DictReader(f))
    by_file = {r.get("file"): r for r in rows}
    statuses = []
    for name in GATE_FILES:
        r = by_file.get(name) or {}
        statuses.append((name, (r.get("reviewed_by") or "UNSET").strip()))
    unset = [n for n, s in statuses if s == "UNSET"]
    assisted = [n for n, s in statuses if s == "AI-assisted"]
    human = [n for n, s in statuses if s.lower() == "human"]
    if unset:
        label = None
        reviewed_by = "UNSET"
        gate_ok = False
    elif human and not assisted:
        label = "(human review)"
        reviewed_by = "human"
        gate_ok = True
    else:
        label = "(AI-assisted review)"
        reviewed_by = "AI-assisted"
        gate_ok = True
    return {
        "label": label,
        "reviewed_by": reviewed_by,
        "gate_ok": gate_ok,
        "gate_files": [{"file": n, "reviewed_by": s} for n, s in statuses],
    }


def dump(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)", flush=True)


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}; run explore_yt_v3_5.py first", flush=True)
        return 1
    src = json.loads(SRC.read_text(encoding="utf-8"))
    rev = review_meta()
    robust = src.get("robust_sensitive") or []
    jp_flag = any(
        r.get("result") == "upload_night_sleep_gt_not"
        and r.get("group") == "JP"
        and r.get("verdict") == "sensitive"
        for r in robust
    )

    duration = {
        "meta": {
            "generated_at": now_iso(),
            "source": "data/unpublished/v3yt/explore_v3_5_summary.json",
            "version": "yt_charts_v32",
            "review": rev,
            "caveats": [
                "Duration ratios compare sleep_title vs not within each title-script group.",
                "Channel-bootstrap CI on the channel-equal median ratio (seed fixed in explore).",
                "Weightings: video / channel-equal / capped-20; tiers A / all labelled excl long_B; rules strict / title_only.",
            ],
        },
        "rows": src.get("duration") or [],
        "robust_sensitive": [r for r in robust if str(r.get("result", "")).startswith("duration")],
    }
    dump(OUT / "yt_duration.json", duration)

    # reshape upload clock dict → rows
    clock_rows = []
    for key, val in (src.get("upload_clock") or {}).items():
        parts = key.split("|")
        row = dict(val) if isinstance(val, dict) else {"raw": val}
        if len(parts) >= 3:
            row.setdefault("rule", parts[0])
            row.setdefault("region", parts[1])
            row.setdefault("script_group", parts[2])
        clock_rows.append(row)
    upload = {
        "meta": {
            "generated_at": now_iso(),
            "source": "data/unpublished/v3yt/explore_v3_5_summary.json",
            "version": "yt_charts_v32",
            "review": rev,
            "jp_depends_on_rule": bool(jp_flag),
            "caveats": [
                "24-hour upload profile for declared country JP/KR/TW/HK; channel-equal with bands.",
                "Exact :00/:30 timestamps often mean scheduled publishing.",
                "JP night sleep>not result depends on the classification rule." if jp_flag else "JP night contrast is robust across rules in this build.",
            ],
        },
        "rows": clock_rows,
        "robust_sensitive": [r for r in robust if str(r.get("result", "")).startswith("upload")],
    }
    dump(OUT / "yt_upload_clock.json", upload)

    creators = {
        "meta": {
            "generated_at": now_iso(),
            "source": "data/unpublished/v3yt/explore_v3_5_summary.json",
            "version": "yt_charts_v32",
            "review": rev,
            "caveats": [
                "Channels by self-declared countryCode; countries with ≥30 channels plus unknown.",
                "Top-5%-of-channels share of videos; no sleep-share comparison across countries.",
            ],
        },
        "rows": src.get("creators") or [],
    }
    dump(OUT / "yt_creators.json", creators)

    print("web_ready YouTube payloads done (unpublished).", flush=True)
    print(f"review gate_ok={rev['gate_ok']} label={rev['label']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
