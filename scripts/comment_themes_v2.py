#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Theme-match yt_comments_v2.csv → unpublished/v3yt/comment_themes_v2.json
+ data/comment_precision_check_6.csv (insomnia matches: 15 zh, 15 ko, 10 en).
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from comment_match import keyword_hits, load_lexicon  # noqa: E402

DATA = ROOT / "data"
COMMENTS = DATA / "yt_comments_v2.csv"
LEXICON = ROOT / "scripts" / "lexicon.yaml"
OUT = DATA / "unpublished" / "v3yt" / "comment_themes_v2.json"
PREC = DATA / "comment_precision_check_6.csv"
SEED = 42
THEMES_FOCUS = ["insomnia", "gratitude", "anxiety_stress", "sleep_aid_effectiveness"]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main() -> int:
    if not COMMENTS.exists():
        print(f"missing {COMMENTS} — run fetch_comments_v2.py first", flush=True)
        return 2
    lexicon = load_lexicon(LEXICON)
    themes = [t for t in THEMES_FOCUS if t in lexicon] or list(lexicon.keys())

    # aggregates: (lang, theme, stratum) and language-equal pooled
    # counts
    n_comments = defaultdict(int)  # (lang, stratum)
    n_videos = defaultdict(set)
    matches = defaultdict(int)  # (lang, theme, stratum)
    match_videos = defaultdict(set)
    match_by_video = defaultdict(Counter)  # (lang, theme, stratum) -> Counter(videoId)

    insomnia_pool = {"zh": [], "ko": [], "en": []}

    # Some comment texts contain NUL bytes; strip them while streaming.
    with COMMENTS.open("rb") as fb:
        raw = fb.read().replace(b"\x00", b"")
    import io
    with io.StringIO(raw.decode("utf-8-sig", errors="replace"), newline="") as f:
        for row in csv.DictReader(f):
            lg = (row.get("language_group") or "unknown").strip() or "unknown"
            stratum = (row.get("stratum") or "unknown").strip() or "unknown"
            vid = (row.get("videoId") or "").strip()
            text = row.get("text") or ""
            n_comments[(lg, stratum)] += 1
            if vid:
                n_videos[(lg, stratum)].add(vid)
            for theme in themes:
                hit_kw = None
                for kw in lexicon[theme]:
                    if keyword_hits(text, kw):
                        hit_kw = kw
                        break
                if not hit_kw:
                    continue
                matches[(lg, theme, stratum)] += 1
                if vid:
                    match_videos[(lg, theme, stratum)].add(vid)
                    match_by_video[(lg, theme, stratum)][vid] += 1
                if theme == "insomnia" and lg in insomnia_pool:
                    insomnia_pool[lg].append({
                        "language_group": lg,
                        "theme": theme,
                        "keyword": hit_kw,
                        "videoId": vid,
                        "stratum": stratum,
                        "text": text[:240],
                    })

    rows = []
    langs = sorted({lg for lg, _ in n_comments.keys()})
    strata = sorted({s for _, s in n_comments.keys()})
    for lg in langs:
        for theme in themes:
            for stratum in strata:
                nc = n_comments.get((lg, stratum), 0)
                nv = len(n_videos.get((lg, stratum), set()))
                m = matches.get((lg, theme, stratum), 0)
                dv = len(match_videos.get((lg, theme, stratum), set()))
                top_share = None
                if m > 0:
                    top = match_by_video[(lg, theme, stratum)].most_common(1)
                    top_share = round(top[0][1] / m, 4) if top else None
                rows.append({
                    "language_group": lg,
                    "theme": theme,
                    "stratum": stratum,
                    "videos": nv,
                    "comments": nc,
                    "matches": m,
                    "share": round(m / nc, 6) if nc else None,
                    "distinct_videos_with_match": dv,
                    "share_matches_from_top_video": top_share,
                })

    # language-equal pooled: equal weight per language (mean of per-lang totals collapsing stratum)
    pooled = []
    for theme in themes:
        per_lang_shares = []
        per_lang_stats = []
        for lg in langs:
            # collapse strata
            nc = sum(n_comments.get((lg, s), 0) for s in strata)
            m = sum(matches.get((lg, theme, s), 0) for s in strata)
            nv = len(set().union(*(n_videos.get((lg, s), set()) for s in strata)))
            dv = len(set().union(*(match_videos.get((lg, theme, s), set()) for s in strata)))
            share = (m / nc) if nc else None
            if share is not None:
                per_lang_shares.append(share)
            # top video across strata
            ctr = Counter()
            for s in strata:
                ctr.update(match_by_video[(lg, theme, s)])
            top_share = round(ctr.most_common(1)[0][1] / m, 4) if m and ctr else None
            per_lang_stats.append({
                "language_group": lg, "videos": nv, "comments": nc, "matches": m,
                "share": None if share is None else round(share, 6),
                "distinct_videos_with_match": dv,
                "share_matches_from_top_video": top_share,
            })
        pooled.append({
            "language_group": "language_equal_pool",
            "theme": theme,
            "stratum": "all",
            "n_languages": len(per_lang_shares),
            "mean_share": round(float(np.mean(per_lang_shares)), 6) if per_lang_shares else None,
            "per_language": per_lang_stats,
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "meta": {
            "generated_at": now_iso(),
            "source": "yt_comments_v2.csv",
            "lexicon": "scripts/lexicon.yaml",
            "themes": themes,
            "definitions": {
                "share": "matches / comments in cell",
                "language_equal_pool": "unweighted mean of per-language shares (strata collapsed)",
            },
        },
        "cells": rows,
        "language_equal_pool": pooled,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} cells={len(rows)}", flush=True)

    # precision check 6
    rng = np.random.default_rng(SEED)
    prec_rows = []
    for lg, n in [("zh", 15), ("ko", 15), ("en", 10)]:
        pool = insomnia_pool.get(lg, [])
        if not pool:
            continue
        idx = rng.choice(len(pool), size=min(n, len(pool)), replace=False)
        for i in idx:
            prec_rows.append(pool[i])
    with PREC.open("w", encoding="utf-8-sig", newline="") as f:
        fields = ["language_group", "theme", "keyword", "videoId", "stratum", "text"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in prec_rows:
            w.writerow({k: r.get(k, "") for k in fields})
    print(f"wrote {PREC.relative_to(ROOT)} n={len(prec_rows)}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
