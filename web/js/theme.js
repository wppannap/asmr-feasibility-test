/** Read a CSS custom property from :root. */
export function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function themeColors() {
  return {
    bg: cssVar("--bg", "#14161a"),
    bg2: cssVar("--bg2", "#1b1e24"),
    ink: cssVar("--ink", "#e8e4da"),
    muted: cssVar("--muted", "#9096a0"),
    line: cssVar("--line", "#2b2f37"),
    accent: cssVar("--accent", "#e0a43a"),
    neg: cssVar("--neg", "#3fa7a0"),
    neutral: cssVar("--neutral", "#3a3f48"),
    nodata: cssVar("--nodata", "#1f2328"),
  };
}
