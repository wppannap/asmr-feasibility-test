/* Concentric 24h vinyl night dial — ONE sculptural dial; JP/KR/TW/HK rings (no 2x2 grid). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261125b";
import { themeColors } from "../theme.js?v=20261125b";
import { renderReviewBanner } from "./review.js?v=20261125b";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];
const REGIONS = ["JP", "KR", "TW", "HK"]; // inner → outer

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.upload_clock || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const profiles = payload.hourly_profiles || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Upload clock · local hour");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  if (meta.jp_depends_on_rule) {
    wrap
      .append("p")
      .attr("class", "chart-note chart-note-jp badge-jp")
      .text("JP result depends on the classification rule");
  }

  ctx = { rows, profiles, rule: "strict", meta };
  const controls = wrap.append("div").attr("class", "control-row chart-controls");
  controls.append("span").attr("class", "control-label").text("Rule");
  const seg = controls.append("div").attr("class", "seg");
  RULES.forEach((o) => {
    seg
      .append("button")
      .attr("type", "button")
      .classed("is-active", o.id === ctx.rule)
      .text(o.label)
      .on("click", function () {
        ctx.rule = o.id;
        seg.selectAll("button").classed("is-active", false);
        d3.select(this).classed("is-active", true);
        draw();
      });
  });

  wrap
    .append("p")
    .attr("class", "chart-inline-legend")
    .html(
      `<span class="leg-swatch leg-sleep"></span> sleep_title (outward)` +
        ` <span class="leg-swatch leg-not"></span> not (inward)` +
        ` <span class="leg-swatch leg-night"></span> 20:00–02:00`
    );

  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
  bindResize();
}

function tableRows() {
  return {
    columns: [
      "region",
      "script_group",
      "n_ch_sleep",
      "n_ch_not",
      "night_sleep_CI",
      "night_not_CI",
      "diff_CI",
      "sleep_gt_not",
    ],
    rows: ctx.rows
      .filter((r) => r.rule === ctx.rule)
      .map((r) => [
        r.region,
        r.script_group,
        r.n_ch_sleep,
        r.n_ch_not,
        fmtCI(r.night_sleep?.ci95 || r.night_sleep_CI),
        fmtCI(r.night_not?.ci95 || r.night_not_CI),
        fmtCI(r.night_diff_sleep_minus_not?.ci95 || r.diff_ci),
        String(r.direction_sleep_gt_not ?? ""),
      ]),
  };
}

function fmtCI(ci) {
  if (!Array.isArray(ci) || ci.length < 2) return "—";
  return `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]`;
}

function bindResize() {
  if (resizeBound) return;
  resizeBound = true;
  let t = 0;
  window.addEventListener(
    "resize",
    () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (ctx?.mount) draw();
      }, 150);
    },
    { passive: true }
  );
}

/** Angle: hour 0 at top (12 o'clock), clockwise. */
function hourAngle(h) {
  return (h / 24) * 2 * Math.PI - Math.PI / 2;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const w = Math.max(300, mount.clientWidth || 640);
  const labelW = w < 520 ? 28 : 42;
  const size = Math.min(w - labelW - 8, w < 520 ? 340 : 520);
  const h = size + 16;
  const c = themeColors();
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Concentric 24-hour upload vinyl dial");

  const cx = labelW + size / 2;
  const cy = size / 2 + 4;
  const g = svg.append("g").attr("transform", `translate(${cx},${cy})`);

  const rMax = size * 0.42;
  const rMin = size * 0.12;
  const ringGap = (rMax - rMin) / (REGIONS.length - 0.2);

  // Night wedge 20→02
  const a0 = hourAngle(20);
  const a1 = hourAngle(2) + 2 * Math.PI;
  const x0 = Math.cos(a0) * rMax;
  const y0 = Math.sin(a0) * rMax;
  const x1 = Math.cos(a1) * rMax;
  const y1 = Math.sin(a1) * rMax;
  g.append("path")
    .attr("d", `M0,0 L${x0},${y0} A${rMax},${rMax} 0 1 1 ${x1},${y1} Z`)
    .attr("fill", c.accent)
    .attr("opacity", 0.1);

  // Outer dial
  g.append("circle")
    .attr("r", rMax + 2)
    .attr("fill", "none")
    .attr("stroke", c.line)
    .attr("stroke-width", 1);

  // Hour labels 0,6,12,18
  [0, 6, 12, 18].forEach((h) => {
    const a = hourAngle(h);
    const rr = rMax + 14;
    g.append("text")
      .attr("x", Math.cos(a) * rr)
      .attr("y", Math.sin(a) * rr)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 10)
      .attr("font-variant-numeric", "tabular-nums")
      .attr("fill", c.muted)
      .text(String(h).padStart(2, "0"));
  });

  // Annotation for night band
  g.append("text")
    .attr("class", "anno-label")
    .attr("x", Math.cos(hourAngle(23)) * (rMax * 0.55))
    .attr("y", Math.sin(hourAngle(23)) * (rMax * 0.55))
    .attr("text-anchor", "middle")
    .attr("fill", c.muted)
    .text("20:00–02:00");

  REGIONS.forEach((region, i) => {
    const R = rMin + i * ringGap;
    g.append("circle")
      .attr("r", R)
      .attr("fill", "none")
      .attr("stroke", c.line)
      .attr("stroke-width", 0.75)
      .attr("opacity", 0.7);

    // Vertical ring labels (left)
    svg
      .append("text")
      .attr("x", 4)
      .attr("y", cy - R + 4)
      .attr("font-size", 11)
      .attr("font-family", "Georgia, serif")
      .attr("fill", c.ink)
      .text(region);

    const sleep = ctx.profiles.find(
      (p) => p.rule === ctx.rule && p.region === region && p.arm === "sleep"
    );
    const not = ctx.profiles.find(
      (p) => p.rule === ctx.rule && p.region === region && p.arm === "not"
    );
    const sleepMean = sleep?.profile?.mean || [];
    const notMean = not?.profile?.mean || [];
    const maxS = d3.max(sleepMean) || 0.1;
    const maxN = d3.max(notMean) || 0.1;
    const barMax = ringGap * 0.38;

    for (let h = 0; h < 24; h++) {
      const a = hourAngle(h);
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const sVal = sleepMean[h] != null ? sleepMean[h] / maxS : 0;
      const nVal = notMean[h] != null ? notMean[h] / maxN : 0;
      const sLen = sVal * barMax;
      const nLen = nVal * barMax;

      // sleep outward
      g.append("line")
        .attr("x1", ux * R)
        .attr("y1", uy * R)
        .attr("x2", ux * (R + sLen))
        .attr("y2", uy * (R + sLen))
        .attr("stroke", c.accent)
        .attr("stroke-width", 1.6)
        .attr("stroke-linecap", "round")
        .attr("opacity", 0.85)
        .append("title")
        .text(
          `${region} · hour ${String(h).padStart(2, "0")} · sleep_title share ${
            sleepMean[h] != null ? fmt(sleepMean[h], 3) : "—"
          }`
        );

      // not inward
      g.append("line")
        .attr("x1", ux * R)
        .attr("y1", uy * R)
        .attr("x2", ux * (R - nLen))
        .attr("y2", uy * (R - nLen))
        .attr("stroke", c.neg)
        .attr("stroke-width", 1.4)
        .attr("stroke-linecap", "round")
        .attr("opacity", 0.8)
        .append("title")
        .text(
          `${region} · hour ${String(h).padStart(2, "0")} · not share ${
            notMean[h] != null ? fmt(notMean[h], 3) : "—"
          }`
        );

      // Hit target for accessibility focus
      g.append("circle")
        .attr("cx", ux * R)
        .attr("cy", uy * R)
        .attr("r", 4)
        .attr("fill", "transparent")
        .attr("tabindex", 0)
        .attr("role", "img")
        .attr(
          "aria-label",
          `${region} hour ${h}: sleep ${
            sleepMean[h] != null ? fmt(sleepMean[h], 3) : "—"
          }, not ${notMean[h] != null ? fmt(notMean[h], 3) : "—"}`
        );
    }
  });
}

export function update() {
  if (ctx?.mount) draw();
}
