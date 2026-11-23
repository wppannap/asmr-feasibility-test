#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Enable a YouTube chart section (fails closed on UNSET review_log rows)."""
from __future__ import annotations

import argparse
import csv
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVIEW = ROOT / "config" / "review_log.csv"
READY = ROOT / "data" / "unpublished" / "web_ready"
WEB_DATA = ROOT / "web" / "data"
SECTIONS_JS = ROOT / "web" / "js" / "sections.js"
INDEX = ROOT / "web" / "index.html"
HIDDEN = ROOT / "src_hidden" / "sections_hidden"

SECTION_CFG = {
    "creators": {
        "id": "scrolly-3",
        "payload": "yt_creators.json",
        "data_key": "yt_creators",
        "fragment": "scrolly-3.html",
        "gates": [
            "class_check_v32_ambient_tag_only.csv",
            "class_check_v32_inflect.csv",
            "script_check.csv",
        ],
    },
    "duration": {
        "id": "scrolly-5",
        "payload": "yt_duration.json",
        "data_key": "yt_duration",
        "fragment": "scrolly-5.html",
        "gates": [
            "class_check_v32_ambient_tag_only.csv",
            "class_check_v32_inflect.csv",
            "script_check.csv",
            "class_check_v3_sleep_title.csv",
        ],
    },
    "upload_clock": {
        "id": "scrolly-9",
        "payload": "yt_upload_clock.json",
        "data_key": "yt_upload_clock",
        "fragment": "scrolly-9.html",
        "gates": [
            "class_check_v32_ambient_tag_only.csv",
            "class_check_v32_inflect.csv",
            "script_check.csv",
            "class_check_v3_sleep_title.csv",
        ],
    },
}


def review_status() -> dict[str, str]:
    rows = list(csv.DictReader(REVIEW.open(encoding="utf-8-sig")))
    return {r["file"]: (r.get("reviewed_by") or "UNSET").strip() for r in rows}


def leak_scan() -> int:
    # lightweight: fail on Google API key prefixes in web/
    pat = "AIza" + "Sy"  # split so the repo scan does not flag this file
    hit = subprocess.run(
        ["rg", "-l", pat, "web/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
    )
    if hit.returncode == 0 and hit.stdout.strip():
        print("LEAK: API key prefix in web/", hit.stdout, flush=True)
        return 1
    return 0


def ensure_enabled(section_id: str, data_key: str, payload_name: str, dry: bool) -> None:
    text = SECTIONS_JS.read_text(encoding="utf-8")
    # ENABLED_SECTIONS
    m = re.search(r"ENABLED_SECTIONS\s*=\s*\[(.*?)\]", text, re.S)
    if not m:
        raise SystemExit("ENABLED_SECTIONS not found")
    body = m.group(1)
    if f'"{section_id}"' not in body:
        body2 = body.rstrip() + f'\n  "{section_id}",\n'
        text = text[: m.start(1)] + body2 + text[m.end(1) :]
    # ENABLED_DATA
    if f"{data_key}:" not in text:
        text = text.replace(
            "wiki: \"data/wiki_lang.json\",\n};",
            f'wiki: "data/wiki_lang.json",\n  {data_key}: "data/{payload_name}",\n}};',
        )
    if dry:
        print("[dry-run] would update sections.js", flush=True)
        return
    SECTIONS_JS.write_text(text, encoding="utf-8")


def inject_html(fragment: str, dry: bool) -> None:
    frag = (HIDDEN / fragment).read_text(encoding="utf-8")
    html = INDEX.read_text(encoding="utf-8")
    sid = re.search(r'id="(scrolly-\d+)"', frag)
    if not sid:
        raise SystemExit("fragment missing scrolly id")
    section_id = sid.group(1)
    if f'id="{section_id}"' in html:
        print(f"index already has {section_id}", flush=True)
        return
    # insert before footer
    marker = '  <footer class="site-footer">'
    if marker not in html:
        raise SystemExit("footer marker missing")
    if dry:
        print(f"[dry-run] would inject {fragment}", flush=True)
        return
    INDEX.write_text(html.replace(marker, frag.rstrip() + "\n\n" + marker), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--section", required=True, choices=sorted(SECTION_CFG))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    cfg = SECTION_CFG[args.section]
    status = review_status()
    unset = [f for f in cfg["gates"] if status.get(f, "UNSET") == "UNSET"]
    if unset:
        print("FAIL closed: UNSET review rows:", unset, flush=True)
        return 2
    src = READY / cfg["payload"]
    if not src.exists():
        print(f"missing payload {src}", flush=True)
        return 1
    dst = WEB_DATA / cfg["payload"]
    print(f"copy {src.name} -> web/data/", flush=True)
    if not args.dry_run:
        shutil.copy2(src, dst)
    ensure_enabled(cfg["id"], cfg["data_key"], cfg["payload"], args.dry_run)
    inject_html(cfg["fragment"], args.dry_run)
    if args.dry_run:
        print("[dry-run] skip verify", flush=True)
        return 0
    rc = subprocess.call([sys.executable, str(ROOT / "scripts" / "verify_web_data.py")], cwd=ROOT)
    if rc != 0:
        return rc
    if leak_scan() != 0:
        return 3
    print("enabled", args.section, cfg["id"], flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
