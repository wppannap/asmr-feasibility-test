#!/usr/bin/env python3
"""Print WCAG contrast ratios for day + night theme tokens."""
from __future__ import annotations

TOKENS = {
    "--bg": "#0b101d",
    "--bg2": "#121a2e",
    "--ink": "#f0ece3",
    "--muted": "#98a4be",
    "--line": "#232f4a",
    "--accent": "#f4a259",
    "--neg": "#56c2d6",
    "--neutral": "#2d3a59",
    "--nodata": "#141c30",
    "--night-bg": "#0b101d",
    "--night-ink": "#f0ece3",
    "--night-accent": "#f4a259",
    "--night-neg": "#56c2d6",
}


def hex_to_rgb(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))  # type: ignore


def lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rel_lum(rgb: tuple[float, float, float]) -> float:
    r, g, b = (lin(x) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a: str, b: str) -> float:
    la, lb = rel_lum(hex_to_rgb(a)), rel_lum(hex_to_rgb(b))
    lighter, darker = max(la, lb), min(la, lb)
    return (lighter + 0.05) / (darker + 0.05)


def main() -> int:
    pairs = [
        ("--ink on --bg", TOKENS["--ink"], TOKENS["--bg"], True),
        ("--muted on --bg", TOKENS["--muted"], TOKENS["--bg"], True),
        # Accent is a large-area chart fill (not body text); report but do not gate.
        ("--accent on --bg", TOKENS["--accent"], TOKENS["--bg"], False),
        ("--neg on --bg", TOKENS["--neg"], TOKENS["--bg"], True),
        ("--ink on --bg2", TOKENS["--ink"], TOKENS["--bg2"], True),
        ("--muted on --bg2", TOKENS["--muted"], TOKENS["--bg2"], True),
        ("--night-ink on --night-bg", TOKENS["--night-ink"], TOKENS["--night-bg"], True),
        (
            "--night-accent on --night-bg",
            TOKENS["--night-accent"],
            TOKENS["--night-bg"],
            True,
        ),
        ("--night-neg on --night-bg", TOKENS["--night-neg"], TOKENS["--night-bg"], True),
    ]
    print(f"{'pair':36} {'ratio':>8} {'>=4.5':>6}")
    ok = True
    for name, fg, back, required in pairs:
        r = contrast(fg, back)
        passed = r >= 4.5
        if required and not passed:
            ok = False
        print(f"{name:36} {r:8.2f} {'PASS' if passed else 'FAIL':>6}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
