#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""YouTube explore follow-ups → data/YT_EXPLORE_2.md + unpublished/v3yt/*_canonical*.json
Requires prior explore_yt_v3 language cache / base data locally.
"""
from __future__ import annotations

import json
import math
import re
import sys
import warnings
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import explore_yt_v3 as E  # noqa: E402

DATA = ROOT / "data"
OUT = DATA / "unpublished" / "v3yt"
CFG_TRIG = ROOT / "config" / "trigger_canonical.yaml"
DOC = DATA / "YT_EXPLORE_2.md"
SEED = 42
BOOT_N = 2000

TZ_BY_COUNTRY = E.TZ_BY_COUNTRY


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_canonical() -> tuple[dict[str, str], list[str]]:
    raw = yaml.safe_load(CFG_TRIG.read_text(encoding="utf-8"))
    alias_to_can = {}
    cans = list(raw["canonical"].keys())
    for can, aliases in raw["canonical"].items():
        for a in aliases:
            alias_to_can[a.lower()] = can
        alias_to_can[can.lower()] = can
    return alias_to_can, cans


def canonical_hits(text: str, alias_to_can: dict[str, str]) -> set[str]:
    t = text.lower()
    hit = set()
    for alias, can in alias_to_can.items():
        if alias in t:
            hit.add(can)
    return hit


def bootstrap_median_ci(vals: np.ndarray, seed: int = SEED) -> tuple[float, float, float]:
    vals = vals[np.isfinite(vals)]
    if len(vals) == 0:
        return (float("nan"), float("nan"), float("nan"))
    med = float(np.median(vals))
    rng = np.random.default_rng(seed)
    boots = [float(np.median(rng.choice(vals, size=len(vals), replace=True))) for _ in range(BOOT_N)]
    lo, hi = np.quantile(boots, [0.025, 0.975])
    return med, float(lo), float(hi)


def script_of_keyword(kw: str) -> str:
    for c in kw:
        o = ord(c)
        if 0xAC00 <= o <= 0xD7AF or 0x1100 <= o <= 0x11FF:
            return "Hangul"
        if 0x3040 <= o <= 0x30FF or 0x3400 <= o <= 0x9FFF or 0xF900 <= o <= 0xFAFF:
            return "CJK"
    if re.search(r"[A-Za-z]", kw):
        return "Latin"
    return "other"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    cfg = E.load_cfg()
    df, _terms = E.load_base(cfg)
    # language
    cache = OUT / "lang_cache.parquet"
    if cache.exists():
        cached = pd.read_parquet(cache)
        df = df.merge(cached, on="videoId", how="left")
    else:
        df = E.detect_languages(df)
    ch_lang = E.channel_language(df)
    df = df.merge(ch_lang, on="channelId", how="left")
    est, region_meta = E.region_estimate(df, ch_lang)
    df = df.merge(est[["channelId", "region_estimate", "region_flag"]], on="channelId", how="left")

    alias_to_can, cans = load_canonical()
    df["_can_hits"] = df["text"].apply(lambda t: canonical_hits(t, alias_to_can))

    # ── a galaxy + trigger network on canonical ──
    print("canonical galaxy…", flush=True)
    n_per = df.groupby("channelId").size()
    keep = set(n_per[n_per >= 5].index)
    sub = df[df["channelId"].isin(keep)].copy()
    ch_ids = sorted(keep)
    id_to_idx = {c: i for i, c in enumerate(ch_ids)}
    X = np.zeros((len(ch_ids), len(cans)), dtype=float)
    attrs = []
    can_idx = {c: i for i, c in enumerate(cans)}
    for ch, g in sub.groupby("channelId"):
        i = id_to_idx[ch]
        n = len(g)
        hits = Counter()
        for s in g["_can_hits"]:
            for c in s:
                hits[c] += 1
        for c, cnt in hits.items():
            X[i, can_idx[c]] = cnt / n
        # dominant
        if hits:
            dom, dom_n = hits.most_common(1)[0]
            dom_share = dom_n / n
        else:
            dom, dom_share = None, 0.0
        med_dur = float(np.nanmedian(g["duration_sec"].values))
        med_views = float(np.nanmedian(g["viewCount"].values))
        attrs.append({
            "idx": i,
            "n_videos": int(n),
            "dominant_trigger": dom,
            "dominant_share": round(dom_share, 4),
            "language": est.set_index("channelId").loc[ch, "channel_lang"] if ch in est.set_index("channelId").index else "und",
            "region_estimate": est.set_index("channelId").loc[ch, "region_estimate"] if ch in est.set_index("channelId").index else "unknown",
            "region_flag": est.set_index("channelId").loc[ch, "region_flag"] if ch in est.set_index("channelId").index else "unknown",
            "median_duration_bucket": (
                "<10m" if med_dur < 600 else ("10-60m" if med_dur <= 3600 else ">60m")
            ) if np.isfinite(med_dur) else "unknown",
            "views_bucket": (
                "<1k" if med_views < 1e3 else ("1k-10k" if med_views < 1e4 else ("10k-100k" if med_views < 1e5 else ("100k-1M" if med_views < 1e6 else "1M+")))
            ) if np.isfinite(med_views) else "unknown",
            "subscriber_bucket": E.sub_bucket(g["subscriberCount"].iloc[0]),
        })

    try:
        import umap
        use_umap = True
    except Exception:
        use_umap = False
    from sklearn.manifold import TSNE
    from sklearn.metrics import silhouette_score
    from sklearn.neighbors import NearestNeighbors
    from sklearn.preprocessing import StandardScaler

    Xs = StandardScaler().fit_transform(X)
    seeds = [SEED + i for i in range(5)]
    embeddings = []
    for s in seeds:
        if use_umap:
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                emb = umap.UMAP(n_components=2, random_state=s, n_neighbors=15, min_dist=0.1).fit_transform(Xs)
        else:
            emb = TSNE(n_components=2, perplexity=30, random_state=s, init="pca", learning_rate="auto").fit_transform(Xs)
        embeddings.append(emb)

    def knn_sets(emb, k=10):
        nn = NearestNeighbors(n_neighbors=k + 1).fit(emb)
        _, ind = nn.kneighbors(emb)
        return [set(row[1:].tolist()) for row in ind]

    knn_runs = [knn_sets(e) for e in embeddings]
    overlaps = []
    for i in range(len(ch_ids)):
        pairs = []
        for a in range(5):
            for b in range(a + 1, 5):
                pairs.append(len(knn_runs[a][i] & knn_runs[b][i]) / 10)
        overlaps.append(float(np.mean(pairs)))
    mean_nn = float(np.mean(overlaps))

    layout = embeddings[0]
    for a, (x, y) in zip(attrs, layout):
        a["x"] = round(float(x), 5)
        a["y"] = round(float(y), 5)

    doms = np.array([a["dominant_trigger"] if a["dominant_trigger"] else "none" for a in attrs])
    mask = doms != "none"
    sil = None
    if mask.sum() > 50 and len(set(doms[mask])) >= 2:
        try:
            sil = float(silhouette_score(layout[mask], doms[mask]))
        except Exception:
            sil = None

    share_dom50 = float(np.mean([a["dominant_share"] >= 0.5 for a in attrs]))
    dom_counts = Counter(a["dominant_trigger"] for a in attrs if a["dominant_trigger"])

    galaxy = {
        "meta": {
            "n_channels": len(ch_ids),
            "n_videos": int(len(sub)),
            "canonical_triggers": cans,
            "layout": "umap" if use_umap else "tsne",
            "seeds": seeds,
            "mean_10nn_overlap_5seeds": round(mean_nn, 4),
            "silhouette_vs_dominant_trigger": None if sil is None else round(sil, 4),
            "share_channels_dominant_ge_50pct": round(share_dom50, 4),
            "dominant_trigger_counts": {k: int(v) for k, v in dom_counts.most_common()},
            "mapping_source": "config/trigger_canonical.yaml",
            "generated_at": now_iso(),
        },
        "channels": attrs,
    }
    E.dump_json(OUT / "channel_galaxy_canonical.json", galaxy)

    # trigger network canonical
    print("canonical trigger network…", flush=True)
    n_vid = len(df)
    presence = {c: df["_can_hits"].apply(lambda s, cc=c: cc in s) for c in cans}
    edges = []
    for i, a in enumerate(cans):
        for b in cans[i + 1:]:
            both = int((presence[a] & presence[b]).sum())
            ca, cb = int(presence[a].sum()), int(presence[b].sum())
            jacc = both / (ca + cb - both) if (ca + cb - both) else 0.0
            exp = (ca / n_vid) * (cb / n_vid) * n_vid if n_vid else 0
            lift = (both / exp) if exp > 0 else None
            edges.append({"a": a, "b": b, "co_count": both, "jaccard": round(jacc, 6),
                          "lift": None if lift is None else round(float(lift), 4)})
    largest = {}
    for c in cans:
        mask = presence[c]
        if mask.sum() == 0:
            largest[c] = {"n": 0, "share_from_top_channel": 0.0}
            continue
        vc = df.loc[mask, "channelId"].value_counts()
        largest[c] = {"n": int(mask.sum()), "share_from_top_channel": round(float(vc.iloc[0] / mask.sum()), 4)}
    tn = {
        "meta": {"n_videos": n_vid, "triggers": cans, "generated_at": now_iso()},
        "edges": edges,
        "largest_channel_share": largest,
        "alias_mapping": {can: list(E.load_cfg() and yaml.safe_load(CFG_TRIG.read_text())["canonical"][can]) for can in cans},
    }
    E.dump_json(OUT / "trigger_network_canonical.json", tn)

    # ── b duration ──
    print("duration…", flush=True)
    weights = E.weight_masks(df)
    dur_rows = []
    sleep_not_longer = []
    for lang, g in df.groupby("lang"):
        n_ch = int(g["channelId"].nunique())
        gs = g[g["sleep_strict"]]
        gn = g[~g["sleep_strict"]]
        if gs["channelId"].nunique() < 30 or gn["channelId"].nunique() < 30:
            continue
        entry = {"language": lang, "n_channels_sleep": int(gs["channelId"].nunique()),
                 "n_channels_not": int(gn["channelId"].nunique()), "weightings": {}}
        longer_flags = []
        for wname, w in weights.items():
            ms = float(np.nanmedian(gs["duration_sec"]))
            mn = float(np.nanmedian(gn["duration_sec"]))
            # channel-equal / capped: approximate via weighted — use simple median of
            # channel medians for channel_equal; capped20 subset
            if wname == "channel_equal":
                ms = float(gs.groupby("channelId")["duration_sec"].median().median())
                mn = float(gn.groupby("channelId")["duration_sec"].median().median())
            elif wname == "capped20":
                gg = g.copy()
                gg["_pub"] = pd.to_datetime(gg["publishedAt"], errors="coerce", utc=True)
                gg["_rank"] = gg.groupby("channelId")["_pub"].rank(ascending=False, method="first")
                cap = gg[gg["_rank"] <= 20]
                ms = float(np.nanmedian(cap.loc[cap["sleep_strict"], "duration_sec"]))
                mn = float(np.nanmedian(cap.loc[~cap["sleep_strict"], "duration_sec"]))
            entry["weightings"][wname] = {
                "sleep_median_sec": round(ms, 1),
                "not_median_sec": round(mn, 1),
                "sleep_longer": bool(ms > mn),
            }
            longer_flags.append(ms > mn)
        if not all(longer_flags):
            sleep_not_longer.append(lang)
        dur_rows.append(entry)

    # ── c like_rate relative ──
    print("like_rate relative…", flush=True)
    now = datetime.now(timezone.utc)
    pub = pd.to_datetime(df["publishedAt"], errors="coerce", utc=True)
    base = df[
        ((now - pub) > timedelta(days=90))
        & (df["viewCount"] >= 1000)
        & df["likeCount"].notna()
        & (df["viewCount"] > 0)
    ].copy()

    def paired_relative(sub: pd.DataFrame) -> dict:
        rel_like, rel_comm = [], []
        pooled_sleep_l, pooled_not_l = [], []
        pooled_sleep_c, pooled_not_c = [], []
        for ch, g in sub.groupby("channelId"):
            a = g[g["sleep_strict"]]
            b = g[~g["sleep_strict"]]
            if len(a) < 5 or len(b) < 5:
                continue
            la = float(np.nanmedian(a["likeCount"] / a["viewCount"]))
            lb = float(np.nanmedian(b["likeCount"] / b["viewCount"]))
            ca = float(np.nanmedian(a["commentCount"] / a["viewCount"]))
            cb = float(np.nanmedian(b["commentCount"] / b["viewCount"]))
            if lb > 0:
                rel_like.append(la / lb - 1)
            if cb > 0:
                rel_comm.append(ca / cb - 1)
            pooled_sleep_l.append(la)
            pooled_not_l.append(lb)
            pooled_sleep_c.append(ca)
            pooled_not_c.append(cb)
        ml, llo, lhi = bootstrap_median_ci(np.array(rel_like, float))
        mc, clo, chi = bootstrap_median_ci(np.array(rel_comm, float))
        return {
            "n_channels": len(rel_like),
            "median_rel_like_minus_1": None if not np.isfinite(ml) else round(ml, 6),
            "ci95_like": [None if not np.isfinite(llo) else round(llo, 6),
                          None if not np.isfinite(lhi) else round(lhi, 6)],
            "median_rel_comment_minus_1": None if not np.isfinite(mc) else round(mc, 6),
            "ci95_comment": [None if not np.isfinite(clo) else round(clo, 6),
                             None if not np.isfinite(chi) else round(chi, 6)],
            "pooled_median_like_sleep": round(float(np.median(pooled_sleep_l)), 6) if pooled_sleep_l else None,
            "pooled_median_like_not": round(float(np.median(pooled_not_l)), 6) if pooled_not_l else None,
            "pooled_median_comment_sleep": round(float(np.median(pooled_sleep_c)), 6) if pooled_sleep_c else None,
            "pooled_median_comment_not": round(float(np.median(pooled_not_c)), 6) if pooled_not_c else None,
        }

    like_blocks = {
        "all_eligible": paired_relative(base),
        "lt_10min": paired_relative(base[base["duration_sec"] < 600]),
        "10_60min": paired_relative(base[(base["duration_sec"] >= 600) & (base["duration_sec"] <= 3600)]),
        "gt_60min": paired_relative(base[base["duration_sec"] > 3600]),
        "excl_gt_60min": paired_relative(base[base["duration_sec"] <= 3600]),
    }
    # exclude top 5% channels by video count
    vc = base["channelId"].value_counts()
    k = max(1, int(math.ceil(0.05 * len(vc))))
    top_ch = set(vc.head(k).index)
    like_blocks["excl_top5pct_channels"] = paired_relative(base[~base["channelId"].isin(top_ch)])

    # ── d upload clock ──
    print("upload_clock…", flush=True)
    m = df[df["region_estimate"].isin(TZ_BY_COUNTRY)].copy()
    m = m[m["region_flag"].isin(["declared", "estimated"])]
    m["_pub"] = pd.to_datetime(m["publishedAt"], errors="coerce", utc=True)
    m = m.dropna(subset=["_pub"])
    clock_tables = {}
    night = []
    on_half = []
    why_missing = {}
    for region in TZ_BY_COUNTRY:
        for sleep in (True, False):
            g = m[(m["region_estimate"] == region) & (m["sleep_strict"] == sleep)]
            if len(g) < 300:
                why_missing.setdefault(region, []).append(
                    f"sleep={sleep} n={len(g)} < 300"
                )
                continue
            tz = ZoneInfo(TZ_BY_COUNTRY[region])
            local = g["_pub"].dt.tz_convert(tz)
            hours = local.dt.hour
            mins = local.dt.minute
            weekdays = local.dt.weekday
            total = len(g)
            hour_share = {str(h): {"share": round(float((hours == h).mean()), 4),
                                   "n": int((hours == h).sum())} for h in range(24)}
            night_share = float(((hours >= 20) | (hours <= 2)).mean())
            on_hh = float(((mins == 0) | (mins == 30)).mean())
            wd = {str(d): {"share": round(float((weekdays == d).mean()), 4),
                           "n": int((weekdays == d).sum())} for d in range(7)}
            key = f"{region}_{'sleep' if sleep else 'not'}"
            clock_tables[key] = {
                "region": region, "sleep_strict": sleep, "n": total,
                "hour": hour_share, "weekday": wd,
                "share_20h_02h": round(night_share, 4),
                "uniform_25pct": 0.25,
                "share_on_hour_or_half": round(on_hh, 4),
            }
            night.append({"region": region, "sleep_strict": sleep, "n": total,
                          "share_20h_02h": round(night_share, 4)})
    # explain TW/TH/VN if absent
    for reg in ("TW", "TH", "VN"):
        if not any(k.startswith(reg + "_") for k in clock_tables):
            gs = m[m["region_estimate"] == reg]
            why_missing[reg] = [
                f"total n={len(gs)}; sleep={int(((gs['sleep_strict'])==True).sum())} "
                f"not={int(((gs['sleep_strict'])==False).sum())}; need ≥300 per group"
            ]

    # ── e creator_map + keyword script ──
    print("creator_map…", flush=True)
    # sleep_strict keyword script: which sleep_strict terms matched
    sleep_latin = [t.lower() for t in cfg.get("sleep_strict_latin", [])]
    sleep_sub = [t.lower() for t in cfg.get("sleep_strict_substring", [])]

    def sleep_script(text: str) -> str:
        t = text.lower()
        hits = []
        for term in sleep_sub:
            if term in t:
                hits.append(script_of_keyword(term))
        for term in sleep_latin:
            if re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", t):
                hits.append("Latin")
        if not hits:
            return "none"
        # priority if multiple
        for pref in ("Hangul", "CJK", "Latin", "other"):
            if pref in hits:
                return pref
        return hits[0]

    df["_sleep_script"] = df.apply(
        lambda r: sleep_script(r["text"]) if r["sleep_strict"] else "n/a", axis=1
    )

    cmap = []
    for country, g in df.groupby("region_estimate"):
        n_ch = int(g["channelId"].nunique())
        if country != "unknown" and n_ch < 30:
            continue
        if country == "unknown" and n_ch < 30:
            continue
        vc = g["channelId"].value_counts()
        k = max(1, int(math.ceil(0.05 * len(vc))))
        top_share = float(vc.iloc[:k].sum() / len(g))
        sleep_g = g[g["sleep_strict"]]
        script_shares = {}
        if len(sleep_g):
            vc_s = sleep_g["_sleep_script"].value_counts(normalize=True)
            script_shares = {str(k): round(float(v), 4) for k, v in vc_s.items()}
        cmap.append({
            "region_estimate": str(country),
            "n_channels": n_ch,
            "n_videos": int(len(g)),
            "sleep_strict_share": round(float(g["sleep_strict"].mean()), 4),
            "sleep_keyword_script_share": script_shares,
            "top5pct_channel_video_share": round(top_share, 4),
        })
    cmap.sort(key=lambda r: -r["n_videos"])

    # write doc
    mapping_lines = ["| canonical | aliases |", "|---|---|"]
    raw_can = yaml.safe_load(CFG_TRIG.read_text())["canonical"]
    for can, als in raw_can.items():
        mapping_lines.append(f"| {can} | {', '.join(als)} |")

    lines = [
        "# YouTube explore 2",
        "",
        f"_Generated {now_iso()}. Local only under `data/unpublished/v3yt/`._",
        "",
        "## a. Canonical triggers",
        "",
        f"n_canonical={len(cans)}. Mapping:",
        "",
        *mapping_lines,
        "",
        f"Galaxy (≥5 videos/channel): n_channels={galaxy['meta']['n_channels']} "
        f"5-seed mean 10-NN overlap={galaxy['meta']['mean_10nn_overlap_5seeds']} "
        f"silhouette_dominant={galaxy['meta']['silhouette_vs_dominant_trigger']} "
        f"share_dominant≥50%={galaxy['meta']['share_channels_dominant_ge_50pct']}",
        f"dominant counts: {galaxy['meta']['dominant_trigger_counts']}",
        "",
        "## b. Duration by language (≥30 channels both groups)",
        "",
        "| lang | n_ch sleep | n_ch not | video med sleep/not | ch-equal | capped20 | sleep longer all? |",
        "|---|---:|---:|---|---|---|---|",
    ]
    for e in dur_rows:
        w = e["weightings"]
        lines.append(
            f"| {e['language']} | {e['n_channels_sleep']} | {e['n_channels_not']} | "
            f"{w['video']['sleep_median_sec']}/{w['video']['not_median_sec']} | "
            f"{w['channel_equal']['sleep_median_sec']}/{w['channel_equal']['not_median_sec']} | "
            f"{w['capped20']['sleep_median_sec']}/{w['capped20']['not_median_sec']} | "
            f"{all(x['sleep_longer'] for x in w.values())} |"
        )
    lines += [
        "",
        f"Languages where sleep is **not** longer (any weighting): {sleep_not_longer or 'none'}",
        "",
        "## c. Like rate relative effect",
        "",
        "| block | n_ch | median (like sleep/not − 1) | CI95 | median (comment …) | CI95 | pooled like sleep/not |",
        "|---|---:|---:|---|---:|---|---|",
    ]
    for name, b in like_blocks.items():
        lines.append(
            f"| {name} | {b['n_channels']} | {b['median_rel_like_minus_1']} | {b['ci95_like']} | "
            f"{b['median_rel_comment_minus_1']} | {b['ci95_comment']} | "
            f"{b['pooled_median_like_sleep']}/{b['pooled_median_like_not']} |"
        )

    lines += [
        "",
        "## d. Upload clock",
        "",
        f"Regions with n≥300 per group present: {sorted({v['region'] for v in clock_tables.values()})}",
        f"Why TW/TH/VN absent (if): { {k: why_missing[k] for k in ('TW','TH','VN') if k in why_missing} }",
        "",
    ]
    for key, tab in sorted(clock_tables.items()):
        lines.append(
            f"### {tab['region']} sleep={tab['sleep_strict']} n={tab['n']}"
        )
        lines.append(
            f"night 20–02 share={tab['share_20h_02h']} (uniform 0.25); "
            f"on hour/half={tab['share_on_hour_or_half']}"
        )
        # compact hour shares
        hs = " ".join(f"{h}:{tab['hour'][str(h)]['share']}" for h in range(24))
        lines.append(f"hour shares: {hs}")
        ws = " ".join(f"{d}:{tab['weekday'][str(d)]['share']}" for d in range(7))
        lines.append(f"weekday shares (Mon=0): {ws}")
        lines.append("")

    lines += [
        "## e. Creator map (+ sleep keyword script)",
        "",
        "| region | channels | videos | sleep_share | top5% video share | sleep script shares |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for c in cmap:
        lines.append(
            f"| {c['region_estimate']} | {c['n_channels']} | {c['n_videos']} | "
            f"{c['sleep_strict_share']} | {c['top5pct_channel_video_share']} | "
            f"{c['sleep_keyword_script_share']} |"
        )
    lines += ["", "_No story text._", ""]

    # truncate if needed
    if len(lines) > 400:
        lines = lines[:399] + ["_(truncated)_"]
    DOC.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {DOC.relative_to(ROOT)} ({len(lines)} lines)", flush=True)

    E.dump_json(OUT / "explore_v3_2_summary.json", {
        "duration": dur_rows,
        "sleep_not_longer": sleep_not_longer,
        "like_rate_relative": like_blocks,
        "upload_clock_keys": list(clock_tables.keys()),
        "why_missing_regions": why_missing,
        "creator_map": cmap,
        "galaxy_meta": galaxy["meta"],
        "generated_at": now_iso(),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
