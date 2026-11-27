#!/usr/bin/env python3
"""Place toolkit terms on a crescent mask. Local only; layout JSON has no channel data."""
from __future__ import annotations

import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from wordcloud import WordCloud

ROOT = Path(__file__).resolve().parents[1]
TERMS = ROOT / "web" / "data" / "toolkit_terms.json"
OUT = ROOT / "web" / "data" / "toolkit_layout.json"
FONT = "/Library/Fonts/Arial Unicode.ttf"
W, H = 1800, 1400


def crescent_mask() -> np.ndarray:
    img = Image.new("L", (W, H), 255)
    draw = ImageDraw.Draw(img)
    cx, cy, r = 980, 700, 560
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=0)
    draw.ellipse((cx - r + 200, cy - r - 30, cx + r + 260, cy + r + 30), fill=255)
    return np.array(img)


def main() -> None:
    doc = json.loads(TERMS.read_text())
    groups = {row["term"]: row["group"] for row in doc["terms"]}
    roots = {row["term"]: math.sqrt(row["n_videos"]) for row in doc["terms"]}
    lo, hi = min(roots.values()), max(roots.values())
    span = hi - lo or 1
    freqs = {term: 10 + (roots[term] - lo) / span * 62 for term in roots}
    mask = crescent_mask()
    cloud = WordCloud(
        font_path=FONT,
        width=W,
        height=H,
        mask=mask,
        background_color="white",
        max_words=320,
        prefer_horizontal=0.75,
        min_font_size=10,
        max_font_size=72,
        collocations=False,
        random_state=27,
        margin=2,
    )
    cloud.generate_from_frequencies(freqs)
    placed = []
    used = set()
    for item in cloud.layout_:
        (word, _count), size, (x, y), orientation, _color = item
        rotation = -90 if orientation else 0
        placed.append({
            "term": word,
            "x": int(x),
            "y": int(y),
            "size": int(max(10, min(90, size))),
            "rotation": rotation,
            "group": groups.get(word, "other"),
            "star": False,
        })
        used.add(word)
    # Wordcloud leaves gaps on a thin crescent. Spiral the rest onto the mask.
    grid = (mask == 0).astype(np.uint8)
    def occupies(x, y, w, h):
        x0, y0 = max(0, int(x)), max(0, int(y))
        x1, y1 = min(W, int(x + w)), min(H, int(y + h))
        if x1 - x0 < 4 or y1 - y0 < 4:
            return False
        block = grid[y0:y1, x0:x1]
        return block.size > 0 and float(block.mean()) > 0.86
    def claim(x, y, w, h):
        grid[int(y):int(y + h), int(x):int(x + w)] = 0
    for word in placed:
        claim(word["x"], word["y"], max(8, word["size"] * 0.55 * len(word["term"])), word["size"] * 1.05)
    cx = int(np.argmax(grid.sum(axis=0))) if False else 780
    cy = 700
    rest = [row for row in doc["terms"] if row["term"] not in used]
    rest.sort(key=lambda row: -freqs[row["term"]])
    for row in rest:
        size = int(round(freqs[row["term"]]))
        bw = max(8, size * 0.52 * len(row["term"]))
        bh = size * 1.15
        vertical = len(row["term"]) > 10
        if vertical:
            bw, bh = bh, bw
        theta = 0.0
        seated = False
        for _ in range(2400):
            theta += 0.22
            rad = 2.2 * theta
            x = cx + math.cos(theta) * rad - bw / 2
            y = cy + math.sin(theta) * rad * 0.85 - bh / 2
            if occupies(x, y, bw, bh):
                claim(x, y, bw, bh)
                placed.append({
                    "term": row["term"],
                    "x": int(x),
                    "y": int(y),
                    "size": size,
                    "rotation": -90 if vertical else 0,
                    "group": row["group"],
                    "star": False,
                })
                used.add(row["term"])
                seated = True
                break
        if not seated:
            continue
    rng = random.Random(27)
    stars = [row for row in doc["terms"] if row["term"] not in used]
    stars += [row for row in reversed(doc["terms"])]
    outside = []
    guard = 0
    while len(outside) < 60 and guard < 4000:
        guard += 1
        x = rng.randrange(20, W - 80)
        y = rng.randrange(20, H - 30)
        if mask[min(H - 1, y), min(W - 1, x)] == 0:
            continue
        if any(abs(x - s[0]) < 36 and abs(y - s[1]) < 16 for s in outside):
            continue
        outside.append((x, y))
    for i, (x, y) in enumerate(outside):
        row = stars[i % len(stars)]
        placed.append({
            "term": row["term"],
            "x": int(x),
            "y": int(y),
            "size": 9 + (i % 3),
            "rotation": 0 if rng.random() < 0.75 else -90,
            "group": row["group"],
            "star": True,
        })
    payload = {
        "meta": {
            "source_files": ["toolkit_terms.json"],
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "caveats": [
                "Crescent mask via Pillow. Positions from the wordcloud package, font size from sqrt(n_videos), clamped 10-90. Sixty star words sit outside the moon at 9-11 px.",
            ],
            "width": W,
            "height": H,
            "font": "Arial Unicode",
        },
        "words": placed,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False) + "\n")
    print("words", len(placed), "moon", sum(1 for w in placed if not w["star"]), "stars", sum(1 for w in placed if w["star"]))


if __name__ == "__main__":
    main()
