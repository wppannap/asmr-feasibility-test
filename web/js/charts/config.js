/** Front-end display flags (not data).
 *  Source of truth: config/verified_themes.json (copied into comment_themes.json meta).
 *  Never compute or display a precision percentage — only config "check" n/n strings.
 */

/** Duration chart vertical markers; prefer youtube_yearly.meta.duration_markers_sec when present. */
export const DURATION_MARKERS = [
  { sec: 3600, label: "1 hour" },
  { sec: 28800, label: "8 hours" },
];

/** Fallback if meta.duration_tag_footnote is missing. */
export const DURATION_TAG_FOOTNOTE =
  "Tags come from keywords in title, tags, description or topic categories (a creator's own labelling, often added for search); not a judgement of the content.";

/** Fallback sample caveat; prefer JSON meta.caveats that mention channel expansion. */
export const SAMPLE_EXPANSION_CAVEAT =
  "Videos come from the catalogues of channels we found through ASMR/sleep searches (95.9% of videos entered through channel expansion, which pages each channel's uploads playlist newest-first, typically up to 100 videos per pass); recent uploads dominate (60.7% from 2025-26), so this sample says nothing about growth over time.";

/** Fallback if meta is missing. */
export const VERIFIED_THEME_META = {
  insomnia: {
    verified_langs: ["zh", "ko", "en", "ja", "fr", "es"],
    check: {
      zh: "n=20, 19 judged relevant",
      ko: "n=20, 19",
      en: "n=10, 9",
      ja: "n=10, 10",
      fr: "n=10, 8",
      es: "n=10, 10",
    },
    caveat:
      "keyword hits; includes a few sarcastic or joking uses (e.g. 'so good I can't sleep')",
  },
  gratitude: {
    verified_langs: ["pooled"],
    check: "n=20, 20/20 judged relevant",
    caveat: "keyword hits",
  },
  anxiety_stress: {
    verified_langs: ["pooled"],
    check: "n=20 pooled, 17/20 judged relevant",
    caveat:
      "keyword hits; includes some product names (anti-stress toys) and timestamp noise",
  },
  sleep_aid_effectiveness: {
    verified_langs: ["pooled"],
    check: "n=20 pooled, 19/20 judged relevant",
    caveat:
      "keyword hits of self-reported falling asleep; includes a few unrelated uses",
  },
};

export function verifiedThemeIds(metaVerified) {
  if (metaVerified && typeof metaVerified === "object" && !Array.isArray(metaVerified)) {
    return Object.keys(metaVerified);
  }
  if (Array.isArray(metaVerified) && metaVerified.length) {
    return metaVerified;
  }
  return Object.keys(VERIFIED_THEME_META);
}

export function themeMeta(theme, metaVerified) {
  if (metaVerified && typeof metaVerified === "object" && !Array.isArray(metaVerified)) {
    const m = metaVerified[theme];
    if (m && typeof m === "object") return m;
  }
  return VERIFIED_THEME_META[theme] || null;
}

export function themeVisible(theme, metaVerified) {
  return verifiedThemeIds(metaVerified).includes(theme);
}

/** Format check field: string or per-language object → display string(s). */
export function formatCheck(check) {
  if (!check) return "—";
  if (typeof check === "string") return check;
  if (typeof check === "object") {
    return Object.entries(check)
      .map(([lang, text]) => `${lang}: ${text}`)
      .join(" · ");
  }
  return String(check);
}

export function checkForLang(check, lang) {
  if (!check) return null;
  if (typeof check === "string") return check;
  if (typeof check === "object" && check[lang]) return check[lang];
  return null;
}

/**
 * Per-language bar label. "pooled" → every bar "not individually checked".
 * es pending still listed in verified_langs but marked via check text.
 */
export function langCheckLabel(lang, theme, metaVerified) {
  const m = themeMeta(theme, metaVerified);
  if (!m) return "not individually checked";
  const langs = m.verified_langs || [];
  if (langs.includes("pooled")) return "not individually checked";
  if (langs.includes(lang)) {
    const c = checkForLang(m.check, lang);
    if (c && /pending/i.test(c)) return "pending recheck";
    return "checked";
  }
  return "not individually checked";
}

export function pickExpansionCaveat(metaCaveats) {
  const list = metaCaveats || [];
  const hit = list.find((c) => /channel expansion|95\.9|60\.7/i.test(c));
  return hit || SAMPLE_EXPANSION_CAVEAT;
}
