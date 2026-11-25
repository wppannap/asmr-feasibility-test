/**
 * Enabled scrolly sections for the published site.
 * Disabled section HTML lives under src_hidden/sections_hidden/ (not deployed).
 * To re-enable: copy markup into web/index.html and add the id here.
 */
// pages-redeploy
export const ENABLED_SECTIONS = [
  "top",
  "scrolly-1",
  "scrolly-2",
  "scrolly-3",
  "scrolly-4",
  "scrolly-5",
  "scrolly-6",
  "scrolly-9",
];

/** Data files required by enabled sections only. */
export const ENABLED_DATA = {
  topo: "data/countries-50m.json",
  trends: "data/trends_country_v3c.json",
  monthly: "data/trends_monthly_v3c.json",
  scatter: "data/correlations_v3c.json",
  scatter_points: "data/scatter_points_v3c.json",
  wiki: "data/wiki_lang.json",
  yt_creators: "data/yt_creators.json",
  yt_duration: "data/yt_duration.json",
  yt_upload_clock: "data/yt_upload_clock.json",
};

/** Chart module paths loaded only when the matching section id is enabled. */
export const SECTION_CHART_MODULES = {
  "scrolly-3": "./charts_yt/creators.js",
  "scrolly-4": "./charts/scatter.js",
  "scrolly-5": "./charts_yt/duration.js",
  "scrolly-6": "./charts/wiki.js",
  "scrolly-9": "./charts_yt/upload_clock.js",
};

/** Map caption notes (not hardcoded in HTML). */
export const MAP_CAPTION_NOTES = {
  mainlandChina:
    "Mainland China is not shown: Google is not accessible there, so Google Trends does not measure it.",
  latinAsmrOnly: "Only the Latin-script term ASMR is measured.",
  window: "Window: Nov 2021 to Oct 2026",
};

export function applySectionVisibility(doc = document) {
  // index.html now contains only enabled sections; keep as a safety net.
  const enabled = new Set(ENABLED_SECTIONS);
  doc.querySelectorAll("section.scrolly[id]").forEach((el) => {
    const on = enabled.has(el.id);
    el.hidden = !on;
    el.style.display = on ? "" : "none";
  });
  const nav = doc.getElementById("site-nav");
  if (nav) {
    nav.querySelectorAll("a[href^='#']").forEach((a) => {
      const id = (a.getAttribute("href") || "").replace(/^#/, "");
      const on = enabled.has(id) || id === "top";
      a.hidden = !on;
      a.style.display = on ? "" : "none";
    });
  }
  const metric = doc.getElementById("metric-toggle");
  if (metric) {
    const row = metric.closest(".control-row");
    if (row) {
      row.hidden = true;
      row.style.display = "none";
    }
  }
}
