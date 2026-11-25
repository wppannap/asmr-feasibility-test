/** Read a CSS custom property from :root. */
export function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function themeColors() {
  return {
    bg: cssVar("--bg", "#fdfcfa"),
    bg2: cssVar("--bg2", "#f3f1ec"),
    ink: cssVar("--ink", "#121622"),
    muted: cssVar("--muted", "#525b70"),
    line: cssVar("--line", "#dfe2ea"),
    accent: cssVar("--accent", "#e06d2c"),
    neg: cssVar("--neg", "#1f7a8c"),
    neutral: cssVar("--neutral", "#d5d9e2"),
    nodata: cssVar("--nodata", "#ebe9e2"),
    nightBg: cssVar("--night-bg", "#141b2d"),
    nightInk: cssVar("--night-ink", "#f4f1ea"),
    nightAccent: cssVar("--night-accent", "#f4a259"),
    nightNeg: cssVar("--night-neg", "#66c2cf"),
  };
}
