/** Read a CSS custom property from :root. */
export function cssVar(name, fallback = "") {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function themeColors() {
  return {
    bg: cssVar("--bg", "#faf8f4"),
    bg2: cssVar("--bg2", "#f1ede4"),
    ink: cssVar("--ink", "#1a1c20"),
    muted: cssVar("--muted", "#5c626d"),
    line: cssVar("--line", "#dad3c5"),
    accent: cssVar("--accent", "#c45d2c"),
    neg: cssVar("--neg", "#246a68"),
    neutral: cssVar("--neutral", "#d8d2c7"),
    nodata: cssVar("--nodata", "#ebe6dc"),
  };
}
