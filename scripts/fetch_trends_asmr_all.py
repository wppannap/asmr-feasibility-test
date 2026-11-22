#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch Google Trends interest-over-time for keyword ASMR across all planned geos.

Reuses TrendsClient plumbing from fetch_google_trends.py (no new deps).
ASMR only · timeframe 2021-11-01 2026-10-31 · web search · category 0.

Outputs:
  data/trends_asmr_all_geos.csv   (geo, date, value, isPartial, retrieved_at)
  data/trends_fetch_log.csv       (geo, status, rows, error, attempt, timestamp)

Resumable via the fetch log. Random sleep 30–90s between geos.
On 429: backoff 5 / 15 / 30 minutes; after 5 consecutive 429s stop cleanly.
"""
from __future__ import annotations

import csv
import hashlib
import json
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import fetch_google_trends as FGT  # noqa: E402

DATA = ROOT / "data"
LOGS = ROOT / "logs"
GEO_CFG = ROOT / "config" / "trends_asmr_geos.json"
OUT_CSV = DATA / "trends_asmr_all_geos.csv"
FETCH_LOG = DATA / "trends_fetch_log.csv"

KEYWORD = "ASMR"
TIMEFRAME = "2021-11-01 2026-10-31"
HL = "en-US"
SLEEP_MIN, SLEEP_MAX = 30.0, 90.0
BACKOFF_429_S = (5 * 60, 15 * 60, 30 * 60)  # 5, 15, 30 min
MAX_CONSEC_429 = 5
# Weekly gate: ~260 points over ~5y; allow a band
WEEKLY_ROWS_MIN, WEEKLY_ROWS_MAX = 200, 320
PROBE_GEO = "US"

OUT_FIELDS = ["geo", "date", "value", "isPartial", "retrieved_at"]
LOG_FIELDS = ["geo", "status", "rows", "error", "attempt", "timestamp"]


def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_geos() -> list[dict]:
    cfg = json.loads(GEO_CFG.read_text(encoding="utf-8"))
    return list(cfg["geos"])


def load_done_ok() -> set[str]:
    if not FETCH_LOG.exists():
        return set()
    done: set[str] = set()
    with FETCH_LOG.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            if (row.get("status") or "").strip().lower() == "ok":
                done.add((row.get("geo") or "").strip().upper())
    return done


def append_log(row: dict) -> None:
    DATA.mkdir(parents=True, exist_ok=True)
    new_file = not FETCH_LOG.exists()
    with FETCH_LOG.open("a", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if new_file:
            w.writeheader()
        w.writerow({k: row.get(k, "") for k in LOG_FIELDS})


def append_series(rows: list[dict]) -> None:
    if not rows:
        return
    DATA.mkdir(parents=True, exist_ok=True)
    geos = {(r.get("geo") or "").upper() for r in rows}
    existing: list[dict] = []
    if OUT_CSV.exists():
        with OUT_CSV.open(encoding="utf-8-sig", newline="") as f:
            existing = [
                r for r in csv.DictReader(f)
                if (r.get("geo") or "").upper() not in geos
            ]
    with OUT_CSV.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_FIELDS)
        w.writeheader()
        for r in existing:
            w.writerow({k: r.get(k, "") for k in OUT_FIELDS})
        for r in rows:
            w.writerow({k: r.get(k, "") for k in OUT_FIELDS})


class StrictTrendsClient(FGT.TrendsClient):
    """TrendsClient with long 429 backoff; exposes last HTTP status."""

    def __init__(self, hl: str = HL):
        super().__init__(hl=hl)
        self.last_status: int | None = None
        self.last_was_429 = False

    def _get(self, url: str, params: dict, label: str = "") -> dict | None:
        cache_key = hashlib.md5(
            f"{url}|{urlencode(sorted(params.items()))}".encode("utf-8")
        ).hexdigest()
        cache = FGT.CACHE_DIR / f"{cache_key}.json"
        if cache.exists():
            try:
                self.last_status = 200
                self.last_was_429 = False
                return json.loads(cache.read_text(encoding="utf-8"))
            except Exception:
                cache.unlink(missing_ok=True)

        for attempt, wait in enumerate(BACKOFF_429_S, start=1):
            elapsed = time.time() - self._last_call
            if elapsed < FGT.MIN_INTERVAL:
                time.sleep(FGT.MIN_INTERVAL - elapsed)
            self._last_call = time.time()
            try:
                r = self.session.get(url, params=params, timeout=FGT.TIMEOUT)
            except requests.RequestException as e:
                FGT.log_error("network", f"{label} attempt {attempt}: {type(e).__name__}: {e}")
                self.last_status = None
                self.last_was_429 = False
                time.sleep(min(wait, 60))
                continue

            self.n_requests += 1
            self.last_status = r.status_code

            if r.status_code == 429:
                self.last_was_429 = True
                FGT.log_error(
                    "rate_limit",
                    f"{label} HTTP 429 — sleeping {wait // 60} min (attempt {attempt}/{len(BACKOFF_429_S)})",
                )
                time.sleep(wait)
                continue

            self.last_was_429 = False
            if r.status_code != 200:
                FGT.log_error("http", f"{label} HTTP {r.status_code}: {r.text[:150]}")
                return None

            text = r.text.strip()
            if text.startswith(")]}'"):
                text = text[5:]
            try:
                payload = json.loads(text)
            except ValueError as e:
                FGT.log_error("json", f"{label} parse: {e}")
                time.sleep(min(wait, 60))
                continue

            FGT.CACHE_DIR.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
            return payload

        FGT.log_error("retry", f"{label} exhausted 429/network retries")
        return None


def fetch_iot(client: StrictTrendsClient, geo: str) -> tuple[list[dict] | None, str]:
    """Return (timeline rows as OUT_FIELDS dicts, error)."""
    widgets = client.explore([KEYWORD], TIMEFRAME, geo)
    if widgets is None:
        err = "429" if client.last_was_429 else f"explore_failed status={client.last_status}"
        return None, err
    ts_data = client.widget("TIMESERIES", widgets)
    if ts_data is None:
        err = "429" if client.last_was_429 else f"timeseries_failed status={client.last_status}"
        return None, err
    parsed = FGT.parse_timeseries(ts_data, [KEYWORD], geo, TIMEFRAME, group=f"{geo}:{KEYWORD}")
    retrieved = utc_now()
    out = []
    for p in parsed:
        out.append({
            "geo": geo,
            "date": p.get("date") or "",
            "value": p.get("interest") if p.get("interest") is not None else "",
            "isPartial": bool(p.get("is_partial")),
            "retrieved_at": retrieved,
        })
    return out, ""


def median_gap_days(rows: list[dict]) -> float | None:
    stamps = []
    for r in rows:
        # parse_timeseries stores formattedAxisTime in date; recover via explore raw is hard.
        # Use sequential index only if timestamps unavailable — caller also checks row count.
        pass
    # Prefer timestamps from raw widget when available; fall back to row-count gate.
    return None


def confirm_weekly(client: StrictTrendsClient) -> tuple[bool, str]:
    """Probe PROBE_GEO; require ~260 weekly points."""
    print(f"\n=== Weekly granularity probe ({PROBE_GEO}) ===", flush=True)
    rows, err = fetch_iot(client, PROBE_GEO)
    if rows is None:
        return False, f"probe failed: {err}"
    n = len(rows)
    # Recover timestamps from cache by re-reading last explore is awkward;
    # inspect spacing via widget default.timelineData through a direct call.
    widgets = client.explore([KEYWORD], TIMEFRAME, PROBE_GEO)
    ts_data = client.widget("TIMESERIES", widgets) if widgets else None
    timeline = ((ts_data or {}).get("default") or {}).get("timelineData") or []
    times = []
    for pt in timeline:
        try:
            times.append(int(pt.get("time")))
        except (TypeError, ValueError):
            continue
    times.sort()
    gaps = [(times[i + 1] - times[i]) / 86400.0 for i in range(len(times) - 1)]
    med = sorted(gaps)[len(gaps) // 2] if gaps else None
    msg = f"probe rows={n} timeline={len(timeline)} median_gap_days={med}"
    print(f"  {msg}", flush=True)
    if n < WEEKLY_ROWS_MIN or n > WEEKLY_ROWS_MAX:
        return False, f"row count not weekly-sized ({n}; expected ~260). {msg}"
    if med is not None and not (5.0 <= med <= 9.0):
        return False, f"median gap {med:.2f}d is not weekly. {msg}"
    # Persist probe rows so US is done
    append_series([{**r, "geo": PROBE_GEO} for r in rows])
    append_log({
        "geo": PROBE_GEO,
        "status": "ok",
        "rows": n,
        "error": "probe_weekly_ok",
        "attempt": 1,
        "timestamp": utc_now(),
    })
    return True, msg


def main() -> int:
    DATA.mkdir(parents=True, exist_ok=True)
    LOGS.mkdir(parents=True, exist_ok=True)
    FGT.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    geos = load_geos()
    done = load_done_ok()
    print(f"Geos planned: {len(geos)}; already ok: {len(done)}", flush=True)
    print(f"Keyword={KEYWORD!r} timeframe={TIMEFRAME!r}", flush=True)

    client = StrictTrendsClient(hl=HL)

    # Granularity gate (skip if probe geo already ok and output exists)
    if PROBE_GEO not in done or not OUT_CSV.exists():
        ok, msg = confirm_weekly(client)
        if not ok:
            print(f"STOP: {msg}", flush=True)
            return 2
        print(f"Weekly confirmed: {msg}", flush=True)
        done = load_done_ok()
    else:
        print(f"Skip probe — {PROBE_GEO} already ok in log", flush=True)

    consec_429 = 0
    pending = [g for g in geos if g["iso2"].upper() not in done]
    print(f"Remaining geos: {len(pending)}", flush=True)

    for i, g in enumerate(pending, 1):
        geo = g["iso2"].upper()
        print(f"\n[{i}/{len(pending)}] {geo} ({g.get('name')})", flush=True)
        attempt = 1
        rows, err = fetch_iot(client, geo)
        if rows is None and err == "429":
            consec_429 += 1
            append_log({
                "geo": geo,
                "status": "rate_limited",
                "rows": 0,
                "error": err,
                "attempt": attempt,
                "timestamp": utc_now(),
            })
            print(f"  429 consecutive={consec_429}/{MAX_CONSEC_429}", flush=True)
            if consec_429 >= MAX_CONSEC_429:
                print(
                    "\nSTOP: 5 consecutive HTTP 429 responses.\n"
                    "Resume with:\n"
                    f"  nohup python3 -u scripts/fetch_trends_asmr_all.py "
                    f">> logs/trends_asmr_all.log 2>&1 &\n"
                    f"Done geos stay skipped via {FETCH_LOG.name}.",
                    flush=True,
                )
                return 3
            # Already slept inside client; continue to next after inter-geo sleep
        elif rows is None:
            consec_429 = 0
            append_log({
                "geo": geo,
                "status": "error",
                "rows": 0,
                "error": err,
                "attempt": attempt,
                "timestamp": utc_now(),
            })
            print(f"  ✗ {err}", flush=True)
        else:
            consec_429 = 0
            append_series(rows)
            append_log({
                "geo": geo,
                "status": "ok",
                "rows": len(rows),
                "error": "",
                "attempt": attempt,
                "timestamp": utc_now(),
            })
            print(f"  ✓ {len(rows)} rows", flush=True)

        if i < len(pending):
            delay = random.uniform(SLEEP_MIN, SLEEP_MAX)
            print(f"  sleep {delay:.0f}s", flush=True)
            time.sleep(delay)

    print("\nALL GEOS DONE (or exhausted queue)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
