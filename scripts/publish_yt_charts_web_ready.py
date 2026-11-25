#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build unpublished YouTube chart payloads under data/unpublished/web_ready/.

Includes duration log-bin histograms, 24h upload profiles with bands, creators+unknown.
Does NOT write under web/data/ and does NOT touch ENABLED_SECTIONS.
"""
from __future__ import annotations

import csv
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import explore_yt_v3_5 as E  # noqa: E402

SRC = ROOT / "data" / "unpublished" / "v3yt" / "explore_v3_5_summary.json"
OUT = ROOT / "data" / "unpublished" / "web_ready"
REVIEW = ROOT / "config" / "review_log.csv"
SEED = 42
BOOT_N = 1000
LOG_BINS = np.logspace(np.log10(30), np.log10(3600 * 12), 24)  # 30s .. 12h

GATE_DURATION = [
    "class_check_v32_ambient_tag_only.csv",
    "class_check_v32_inflect.csv",
    "script_check.csv",
    "class_check_v3_sleep_title.csv",
]
GATE_CREATORS = [
    "class_check_v32_ambient_tag_only.csv",
    "class_check_v32_inflect.csv",
    "script_check.csv",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def review_meta(gate_files: list[str]) -> dict:
    """Build front-end review label from gate files.

    Labels: "(human review, n-item check)", "(AI-assisted review)",
    nothing for script-only, block for UNSET.
    """
    rows = []
    if REVIEW.exists():
        raw = REVIEW.read_bytes()
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            text = raw.decode("latin-1", errors="replace")
        rows = list(csv.DictReader(text.replace("\r\n", "\n").splitlines()))
    by_file = {r.get("file"): r for r in rows}
    statuses = []
    n_items = 0
    for name in gate_files:
        r = by_file.get(name) or {}
        rb = (r.get("reviewed_by") or "UNSET").strip()
        statuses.append((name, rb))
        try:
            n_items += int(str(r.get("n") or "0").strip() or "0")
        except ValueError:
            pass
    # script rows are not content reviews
    content = [(n, s) for n, s in statuses if s != "script"]
    unset = [n for n, s in content if s == "UNSET"]
    assisted = [n for n, s in content if s == "AI-assisted"]
    human = [n for n, s in content if s.lower() == "human"]
    if unset:
        label, reviewed_by, gate_ok = None, "UNSET", False
    elif not content:
        label, reviewed_by, gate_ok = "", "script", True
    elif human and not assisted:
        label = f"(human review, {n_items}-item check)"
        reviewed_by, gate_ok = "human", True
    else:
        label, reviewed_by, gate_ok = "(AI-assisted review)", "AI-assisted", True
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


def hist_channel_equal(g: pd.DataFrame) -> dict:
    """Channel-equal: each channel contributes its median duration, then density on log bins."""
    med = g.groupby("channelId")["duration_sec"].median().dropna().to_numpy(float)
    med = med[(med > 0) & np.isfinite(med)]
    if len(med) == 0:
        return {"bins": LOG_BINS.tolist(), "density": [0.0] * (len(LOG_BINS) - 1), "median": None}
    dens, _ = np.histogram(med, bins=LOG_BINS, density=True)
    return {
        "bins": [round(float(x), 4) for x in LOG_BINS],
        "density": [round(float(x), 8) for x in dens],
        "median": round(float(np.median(med)), 1),
        "n_channels": int(len(med)),
    }


def hourly_channel_equal(g: pd.DataFrame, tz: ZoneInfo, seed: int) -> dict:
    local = g["_pub"].dt.tz_convert(tz)
    g2 = g.assign(hour=local.dt.hour)
    # per channel: 24-vector of hour shares
    mats = []
    for _, gg in g2.groupby("channelId"):
        if len(gg) == 0:
            continue
        counts = np.bincount(gg["hour"].to_numpy(int), minlength=24).astype(float)
        s = counts.sum()
        if s <= 0:
            continue
        mats.append(counts / s)
    if not mats:
        return {
            "hours": list(range(24)),
            "mean": [0.0] * 24,
            "ci95_low": [0.0] * 24,
            "ci95_high": [0.0] * 24,
            "n_channels": 0,
        }
    M = np.vstack(mats)
    mean = M.mean(axis=0)
    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(BOOT_N):
        idx = rng.integers(0, len(M), size=len(M))
        boots.append(M[idx].mean(axis=0))
    B = np.vstack(boots)
    lo = np.quantile(B, 0.025, axis=0)
    hi = np.quantile(B, 0.975, axis=0)
    return {
        "hours": list(range(24)),
        "mean": [round(float(x), 5) for x in mean],
        "ci95_low": [round(float(x), 5) for x in lo],
        "ci95_high": [round(float(x), 5) for x in hi],
        "n_channels": int(len(M)),
    }


def main() -> int:
    if not SRC.exists():
        print(f"missing {SRC}; run explore_yt_v3_5.py first", flush=True)
        return 1
    src = json.loads(SRC.read_text(encoding="utf-8"))
    robust = src.get("robust_sensitive") or []
    jp_flag = any(
        r.get("result") == "upload_night_sleep_gt_not"
        and r.get("group") == "JP"
        and r.get("verdict") == "sensitive"
        for r in robust
    )

    # ── Duration (+ histograms) ──
    print("Building duration histograms…", flush=True)
    histograms = []
    for rule in E.RULES:
        for tier_a_only in (True, False):
            series = "tier_A" if tier_a_only else "all_labelled"
            df = E.load_frame(rule, tier_a_only)
            for sg in E.SCRIPTS:
                g = df[df["script_group"] == sg]
                gs, gn = g[g["sleep_title"]], g[~g["sleep_title"]]
                histograms.append(
                    {
                        "rule": rule,
                        "series": series,
                        "script_group": sg,
                        "sleep": hist_channel_equal(gs),
                        "not": hist_channel_equal(gn),
                    }
                )

    duration = {
        "meta": {
            "generated_at": now_iso(),
            "source": "explore_v3_5_summary + live histograms",
            "version": "yt_charts_v32",
            "review": review_meta(GATE_DURATION),
            "markers_sec": [3600, 28800],
            "caveats": [
                "Duration distributions are channel-equal medians on a log time axis.",
                "Ratios compare sleep_title vs not; channel-bootstrap CI from explore.",
                "Weightings: video / channel-equal / capped-20; tiers A / all labelled excl long_B.",
            ],
        },
        "rows": src.get("duration") or [],
        "histograms": histograms,
        "robust_sensitive": [r for r in robust if str(r.get("result", "")).startswith("duration")],
    }
    dump(OUT / "yt_duration.json", duration)

    # ── Upload clock 24h profiles ──
    print("Building 24h upload profiles…", flush=True)
    profiles = []
    for rule in E.RULES:
        df = E.load_frame(rule, False)
        df = df[df["country"].isin(E.CLOCK_REGIONS)].copy()
        df["_pub"] = pd.to_datetime(df["publishedAt"], errors="coerce", utc=True)
        df = df.dropna(subset=["_pub"])
        for region in E.CLOCK_REGIONS:
            tz = ZoneInfo(E.TZ[region])
            for arm, flag in (("sleep", True), ("not", False)):
                g = df[(df["country"] == region) & (df["sleep_title"] == flag)]
                profiles.append(
                    {
                        "rule": rule,
                        "region": region,
                        "arm": arm,
                        "profile": hourly_channel_equal(
                            g, tz, SEED + hash((rule, region, arm)) % 9000
                        ),
                    }
                )

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
            "source": "explore_v3_5_summary + hourly profiles",
            "version": "yt_charts_v32",
            "review": review_meta(GATE_DURATION),
            "jp_depends_on_rule": bool(jp_flag),
            "caveats": [
                "24-hour upload profile for declared country JP/KR/TW/HK; channel-equal with bootstrap bands.",
                "Exact :00/:30 timestamps often mean scheduled publishing.",
                "JP result depends on the rule" if jp_flag else "JP night contrast is robust across rules in this build.",
            ],
        },
        "rows": clock_rows,
        "hourly_profiles": profiles,
        "robust_sensitive": [r for r in robust if str(r.get("result", "")).startswith("upload")],
    }
    dump(OUT / "yt_upload_clock.json", upload)

    # ── Creators (+ unknown) ──
    print("Building creators (+ unknown)…", flush=True)
    creators_rows = list(src.get("creators") or [])
    for rule in E.RULES:
        df = E.load_frame(rule, False)
        known = df["country"].notna() & (df["country"].astype(str).str.len() == 2)
        unk = df[~known]
        n_ch = int(unk["channelId"].nunique())
        if n_ch:
            vc = unk["channelId"].value_counts()
            k = max(1, int(np.ceil(0.05 * len(vc))))
            top = set(vc.head(k).index)
            share = float(unk["channelId"].isin(top).mean()) if len(unk) else 0.0
            creators_rows.append(
                {
                    "rule": rule,
                    "country": "unknown",
                    "n_channels": n_ch,
                    "n_videos": int(len(unk)),
                    "top5pct_channels": int(k),
                    "share_videos_from_top5pct_channels": round(share, 4),
                }
            )

    creators = {
        "meta": {
            "generated_at": now_iso(),
            "source": "explore_v3_5_summary + unknown",
            "version": "yt_charts_v32",
            "review": review_meta(GATE_CREATORS),
            "caveats": [
                "Channels by self-declared countryCode; countries with ≥30 channels plus unknown.",
                "Top-5%-of-channels share of videos; no sleep-share comparison across countries.",
            ],
        },
        "rows": creators_rows,
    }
    dump(OUT / "yt_creators.json", creators)

    print("web_ready YouTube payloads done (unpublished).", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
