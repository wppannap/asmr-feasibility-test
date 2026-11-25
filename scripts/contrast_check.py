#!/usr/bin/env python3
"""Print WCAG contrast ratios for theme tokens (text on --bg)."""
from __future__ import annotations

TOKENS = {
    "--bg": "#14161a",
    "--bg2": "#1b1e24",
    "--ink": "#e8e4da",
    "--muted": "#9096a0",
    "--line": "#2b2f37",
    "--accent": "#e0a43a",
    "--neg": "#3fa7a0",
    "--neutral": "#3a3f48",
    "--nodata": "#1f2328",
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
    bg = TOKENS["--bg"]
    pairs = [
        ("--ink on --bg", TOKENS["--ink"], bg),
        ("--muted on --bg", TOKENS["--muted"], bg),
        ("--accent on --bg", TOKENS["--accent"], bg),
        ("--neg on --bg", TOKENS["--neg"], bg),
        ("--ink on --bg2", TOKENS["--ink"], TOKENS["--bg2"]),
        ("--muted on --bg2", TOKENS["--muted"], TOKENS["--bg2"]),
    ]
    print(f"{'pair':28} {'ratio':>8} {'>=4.5':>6}")
    ok = True
    for name, fg, back in pairs:
        r = contrast(fg, back)
        need = name.startswith("--ink") or name.startswith("--muted on --bg")
        passed = r >= 4.5
        if need and not passed:
            ok = False
        print(f"{name:28} {r:8.2f} {'PASS' if passed else 'FAIL':>6}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
