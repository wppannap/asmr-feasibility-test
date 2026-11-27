/**
 * Enabled scrolly sections for the published site.
 * Editorial order is defined in web/index.html DOM order.
 * Disabled section HTML lives under src_hidden/sections_hidden/ (not deployed).
 */
// pages-redeploy
export const ENABLED_SECTIONS = [
  "top",
  "scrolly-1",
  "scrolly-9",
  "scrolly-5",
  "scrolly-onset",
  "scrolly-phones",
  "scrolly-bed",
  "scrolly-kit",
  "scrolly-3",
  "scrolly-west",
  "scrolly-gender",
];

/** Data files required by enabled sections only. */
export const ENABLED_DATA = {
  topo: "data/countries-50m.json",
  trends: "data/trends_country_v3c.json",
  monthly: "data/trends_monthly_v3c.json",
  yt_creators: "data/yt_creators.json",
  yt_duration: "data/yt_duration.json",
  yt_upload_clock: "data/yt_upload_clock.json",
};

/** Chart module paths loaded only when the matching section id is enabled. */
export const SECTION_CHART_MODULES = {
  "scrolly-3": "./charts_yt/creators.js?v=20261127k",
  "scrolly-5": "./charts_yt/duration.js?v=20261127k",
  "scrolly-9": "./charts_yt/upload_clock.js?v=20261127k",
  "scrolly-onset": "./charts/sleep_onset_wave.js?v=20261127l",
  "scrolly-phones": "./charts/sound_samples.js?v=20261127k",
  "scrolly-bed": "./charts/bedroom_heatmap.js?v=20261127m",
  "scrolly-kit": "./charts/asmr_toolkit_cloud.js?v=20261127n",
  "scrolly-west": "./charts/west_vs_east.js?v=20261127k",
  "scrolly-gender": "./charts/gender_audience.js?v=20261127k",
};

/** Map caption notes (not hardcoded in HTML). */
export const MAP_CAPTION_NOTES = {
  mainlandChina:
    "Mainland China is not shown: Google is not accessible there, so Google Trends does not measure it.",
  latinAsmrOnly: "Only the Latin-script term ASMR is measured.",
  window: "Window: Nov 2021 to Oct 2026",
};

export function applySectionVisibility(doc = document) {
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
      const on = enabled.has(id) || id === "top" || id === "explore";
      a.hidden = !on;
      a.style.display = on ? "" : "none";
    });
  }
}
