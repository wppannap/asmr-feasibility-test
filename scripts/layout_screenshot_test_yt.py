#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Layout screenshots with YouTube modules temporarily enabled (local copy only)."""
from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
READY = ROOT / "data" / "unpublished" / "web_ready"


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="asmr_yt_layout_"))
    web = tmp / "web"
    shutil.copytree(ROOT / "web", web)
    # payloads
    for name in ("yt_duration.json", "yt_upload_clock.json", "yt_creators.json"):
        shutil.copy2(READY / name, web / "data" / name)
    # inject fragments + enable sections in the temp copy
    index = web / "index.html"
    html = index.read_text(encoding="utf-8")
    for frag in ("scrolly-3.html", "scrolly-5.html", "scrolly-9.html"):
        block = (ROOT / "src_hidden" / "sections_hidden" / frag).read_text(encoding="utf-8")
        html = html.replace('  <footer class="site-footer">', block.rstrip() + "\n\n  <footer class=\"site-footer\">")
    index.write_text(html, encoding="utf-8")
    sj = web / "js" / "sections.js"
    text = sj.read_text(encoding="utf-8")
    text = text.replace(
        'export const ENABLED_SECTIONS = [\n  "top",\n  "scrolly-1",\n  "scrolly-2",\n  "scrolly-4",\n  "scrolly-6",\n];',
        'export const ENABLED_SECTIONS = [\n  "top",\n  "scrolly-1",\n  "scrolly-2",\n  "scrolly-3",\n  "scrolly-4",\n  "scrolly-5",\n  "scrolly-6",\n  "scrolly-9",\n];',
    )
    text = text.replace(
        'wiki: "data/wiki_lang.json",\n  // Populated',
        'wiki: "data/wiki_lang.json",\n  yt_creators: "data/yt_creators.json",\n  yt_duration: "data/yt_duration.json",\n  yt_upload_clock: "data/yt_upload_clock.json",\n  // Populated',
    )
    sj.write_text(text, encoding="utf-8")

    # run layout test against temp web by monkeypatching via env
    env_script = tmp / "run_layout.py"
    env_script.write_text(
        (ROOT / "scripts" / "layout_screenshot_test.py").read_text(encoding="utf-8")
        .replace('WEB = ROOT / "web"', f'WEB = Path(r"{web}")')
        .replace(
            'SECTIONS = [\n    ("scrolly-1", "map1"),\n    ("scrolly-2", "map2"),\n    ("scrolly-4", "association"),\n    ("scrolly-6", "wiki"),\n]',
            'SECTIONS = [\n    ("scrolly-1", "map1"),\n    ("scrolly-2", "map2"),\n    ("scrolly-3", "creators"),\n    ("scrolly-4", "association"),\n    ("scrolly-5", "duration"),\n    ("scrolly-6", "wiki"),\n    ("scrolly-9", "upload_clock"),\n]',
        ),
        encoding="utf-8",
    )
    print(f"temp web: {web}", flush=True)
    rc = subprocess.call([sys.executable, str(env_script)], cwd=ROOT)
    # cleanup yt payloads from real web/data if present from earlier test
    for name in ("yt_duration.json", "yt_upload_clock.json", "yt_creators.json"):
        p = ROOT / "web" / "data" / name
        if p.exists():
            p.unlink()
            print(f"removed accidental {p.relative_to(ROOT)}", flush=True)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
