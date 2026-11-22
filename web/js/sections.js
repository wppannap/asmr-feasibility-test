/**
 * Enabled scrolly sections for the published site.
 * Hidden sections stay in the HTML but are not shown, linked, or data-fetched
 * until human_asmr-scoped payloads are verified and re-enabled.
 */
export const ENABLED_SECTIONS = [
  "top",
  "scrolly-1",
  "scrolly-2",
  "scrolly-4",
  "scrolly-6",
];

/** Data files required by enabled sections only. */
export const ENABLED_DATA = {
  topo: "data/countries-50m.json",
  trends: "data/trends_country_v2.json",
  monthly: "data/trends_monthly_v2.json",
  scatter: "data/insomnia_vs_asmr.json",
  wiki: "data/wiki_lang.json",
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
      const on = enabled.has(id);
      a.hidden = !on;
      a.style.display = on ? "" : "none";
    });
  }
  // Stage-1 creator layers need unpublished creator_country payload — hide those controls.
  const layer = doc.getElementById("layer-mode");
  if (layer) {
    layer.querySelectorAll('button[data-mode="creators"], button[data-mode="compare"]').forEach((btn) => {
      btn.hidden = true;
      btn.style.display = "none";
      btn.disabled = true;
    });
  }
}
