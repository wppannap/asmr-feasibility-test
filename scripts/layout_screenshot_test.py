#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Headless layout check + screenshots for published sections.

Fails if any two visible text elements in the same section have intersecting
bounding boxes, or if the page overflows the viewport horizontally.

Screenshots land in docs/screens/ (gitignored).
Requires Playwright (system or venv): pip install playwright && playwright install chromium.
"""
from __future__ import annotations

import http.server
import socketserver
import sys
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
OUT = ROOT / "docs" / "screens"

VIEWPORTS = [
    (375, 812, "375x812"),
    (390, 844, "390x844"),
    (430, 932, "430x932"),
    (1440, 900, "1440x900"),
]

SECTIONS = [
    ("scrolly-1", "map1"),
    ("scrolly-2", "map2"),
    ("scrolly-4", "association"),
    ("scrolly-6", "wiki"),
]

CHECK_JS = r"""
() => {
  const sections = ["scrolly-1", "scrolly-2", "scrolly-4", "scrolly-6"];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const failures = [];

  // Page-level horizontal overflow (ignore scrollable children)
  const scrollW = document.documentElement.scrollWidth;
  if (scrollW > vw + 1) {
    failures.push({
      type: "overflow",
      section: "(page)",
      scrollWidth: scrollW,
      vw,
    });
  }

  function visible(el) {
    const st = window.getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // must intersect viewport
    if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return false;
    return true;
  }

  function clippedByAncestor(el) {
    let p = el.parentElement;
    while (p) {
      const st = window.getComputedStyle(p);
      const ox = st.overflowX;
      const oy = st.overflowY;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" ||
          oy === "auto" || oy === "scroll" || oy === "hidden") {
        const pr = p.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        // fully outside clip box
        if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) {
          return true;
        }
      }
      p = p.parentElement;
    }
    return false;
  }

  function isTexty(el) {
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "svg", "path", "defs", "clippath", "mask", "g",
         "rect", "circle", "line", "polyline", "polygon", "table", "thead",
         "tbody", "tr", "td", "th"].includes(tag)) {
      return false;
    }
    const text = (el.innerText || "").trim();
    if (!text) return false;
    const kids = [...el.children].filter((c) => {
      const t = (c.innerText || "").trim();
      return t.length > 0;
    });
    // prefer leaves; allow buttons/summary/labels
    if (["button", "summary", "label", "a", "p", "span", "h1", "h2", "h3", "li"].includes(tag)) {
      return true;
    }
    return kids.length === 0;
  }

  function collectBoxes(root) {
    return [...root.querySelectorAll("*")]
      .filter(isTexty)
      .filter(visible)
      .filter((el) => !clippedByAncestor(el))
      .map((el) => ({
        el,
        r: el.getBoundingClientRect(),
        text: (el.innerText || "").trim().slice(0, 40),
        tag: el.tagName.toLowerCase(),
        className: (el.className || "").toString().slice(0, 60),
      }));
  }

  function findOverlaps(boxes, sid, scope) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const ar = a.r, br = b.r;
        const iw = Math.min(ar.right, br.right) - Math.max(ar.left, br.left);
        const ih = Math.min(ar.bottom, br.bottom) - Math.max(ar.top, br.top);
        if (iw > 2 && ih > 2) {
          failures.push({
            type: "overlap",
            section: sid,
            scope,
            a: `${a.tag}.${a.className}: ${a.text}`,
            b: `${b.tag}.${b.className}: ${b.text}`,
            iw: Math.round(iw),
            ih: Math.round(ih),
          });
        }
      }
    }
  }

  for (const sid of sections) {
    const sec = document.getElementById(sid);
    if (!sec || sec.hidden) continue;
    // Desktop scrolly keeps stage sticky beside steps — they intentionally share
    // the viewport. Check each column (or the whole section when stacked).
    if (vw > 820) {
      const stage = sec.querySelector(".stage");
      const steps = sec.querySelector(".steps");
      if (stage) findOverlaps(collectBoxes(stage), sid, "stage");
      if (steps) findOverlaps(collectBoxes(steps), sid, "steps");
    } else {
      findOverlaps(collectBoxes(sec), sid, "stacked");
    }
  }
  return failures;
}
"""


def serve_web(port: int = 8765):
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(WEB), **kwargs)

        def log_message(self, fmt, *args):
            pass

    httpd = socketserver.TCPServer(("127.0.0.1", port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def main() -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("FAIL: Playwright not installed (pip install playwright)", flush=True)
        return 2

    OUT.mkdir(parents=True, exist_ok=True)
    httpd, port = serve_web()
    base = f"http://127.0.0.1:{port}/"
    time.sleep(0.3)

    all_failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for w, h, label in VIEWPORTS:
            page = browser.new_page(viewport={"width": w, "height": h})
            page.goto(base, wait_until="networkidle", timeout=120_000)
            page.wait_for_timeout(800)
            for sid, name in SECTIONS:
                page.evaluate(
                    f"""() => {{
                  const el = document.getElementById('{sid}');
                  if (el) el.scrollIntoView({{block: 'start'}});
                }}"""
                )
                page.wait_for_timeout(450)
                path = OUT / f"{name}_{label}.png"
                page.screenshot(path=str(path), full_page=False)
                print(f"  wrote {path.relative_to(ROOT)}", flush=True)
                fails = page.evaluate(CHECK_JS)
                for f in fails:
                    f["viewport"] = label
                    f["at"] = name
                all_failures.extend(fails)
            page.close()
        browser.close()

    httpd.shutdown()

    seen = set()
    unique = []
    for f in all_failures:
        key = (
            f.get("type"),
            f.get("section"),
            f.get("a"),
            f.get("b"),
            f.get("viewport"),
            f.get("at"),
            f.get("scrollWidth"),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(f)

    if unique:
        print(f"FAIL: {len(unique)} layout issue(s)", flush=True)
        for f in unique[:50]:
            print(f"  {f}", flush=True)
        if len(unique) > 50:
            print(f"  … +{len(unique) - 50} more", flush=True)
        return 1

    print("PASS: no overlapping visible text; no horizontal overflow", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
