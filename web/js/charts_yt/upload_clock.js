/* Midnight-centered 24h upload waves — 4 stacked strips (JP/KR/TW/HK). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261125c";
import { themeColors } from "../theme.js?v=20261125c";
import { renderReviewBanner } from "./review.js?v=20261125c";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];
/** Display order top → bottom. */
const REGIONS = ["JP", "KR", "TW", "HK"];

/**
 * Shared X axis centered on midnight:
 * display index 0..24 maps to local hours 12,13,…,23,0,1,…,11,12
 */
function hourAt(displayIdx) {
  return (12 + displayIdx) % 24;
}

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
  wrap.append("h3").attr("class", "chart-section-title").text("Upload clock · midnight-centered");
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
      `<span class="leg-swatch leg-sleep"></span> sleep_title` +
        ` <span class="leg-swatch leg-not"></span> not (dashed)` +
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

function profileMeans(region, arm) {
  const p = ctx.profiles.find(
    (row) => row.rule === ctx.rule && row.region === region && row.arm === arm
  );
  return p?.profile?.mean || [];
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const w = Math.max(300, mount.clientWidth || 640);
  const mobile = w < 520;
  const margin = { top: 28, right: 16, bottom: 36, left: mobile ? 36 : 48 };
  const stripH = mobile ? 72 : 88;
  const gap = 10;
  const n = REGIONS.length;
  const ih = n * stripH + (n - 1) * gap;
  const iw = w - margin.left - margin.right;
  const c = themeColors();

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${ih + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Midnight-centered 24-hour upload waves by region");

  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // X: display 0..24 → hours 12..11..12 with midnight at center (12)
  const x = d3.scaleLinear().domain([0, 24]).range([0, iw]);
  const midX = x(12); // midnight

  // Shared axis ticks at noon, 18, midnight, 06, noon
  const tickHours = [12, 18, 0, 6, 12];
  const tickDisplay = [0, 6, 12, 18, 24];
  const axisG = g.append("g").attr("transform", `translate(0,${ih + 8})`);
  tickDisplay.forEach((d, i) => {
    const h = tickHours[i];
    const label = h === 0 ? "00:00" : `${String(h).padStart(2, "0")}:00`;
    axisG
      .append("text")
      .attr("x", x(d))
      .attr("y", 14)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-variant-numeric", "tabular-nums")
      .attr("fill", h === 0 ? c.ink : c.muted)
      .attr("font-weight", h === 0 ? 600 : 400)
      .text(label);
  });

  REGIONS.forEach((region, i) => {
    const y0 = i * (stripH + gap);
    const sleep = profileMeans(region, "sleep");
    const not = profileMeans(region, "not");
    const maxY = Math.max(d3.max(sleep) || 0, d3.max(not) || 0, 0.01);
    const y = d3.scaleLinear().domain([0, maxY]).range([stripH - 6, 8]);

    const strip = g.append("g").attr("transform", `translate(0,${y0})`);

    // Night band 20:00–02:00 → display 8..14
    strip
      .append("rect")
      .attr("x", x(8))
      .attr("y", 0)
      .attr("width", x(14) - x(8))
      .attr("height", stripH)
      .attr("fill", c.accent)
      .attr("opacity", 0.1);

    // Baseline
    strip
      .append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", stripH - 6)
      .attr("y2", stripH - 6)
      .attr("stroke", c.line)
      .attr("stroke-width", 0.75);

    // Midnight hairline
    strip
      .append("line")
      .attr("x1", midX)
      .attr("x2", midX)
      .attr("y1", 0)
      .attr("y2", stripH)
      .attr("stroke", c.ink)
      .attr("stroke-width", 1)
      .attr("opacity", 0.55);

    if (i === 0) {
      strip
        .append("text")
        .attr("class", "anno-label")
        .attr("x", midX + 4)
        .attr("y", 12)
        .attr("fill", c.muted)
        .text("Midnight");
    }

    // Build series in display order (closed for area)
    const sleepPts = d3.range(0, 25).map((d) => {
      const h = hourAt(d === 24 ? 0 : d);
      const v = sleep[h] != null ? sleep[h] : 0;
      return [d, v];
    });
    // For d===24 use hour 12 again
    sleepPts[24] = [24, sleep[12] != null ? sleep[12] : 0];

    const notPts = d3.range(0, 25).map((d) => {
      const h = hourAt(d === 24 ? 0 : d);
      const v = not[h] != null ? not[h] : 0;
      return [d, v];
    });
    notPts[24] = [24, not[12] != null ? not[12] : 0];

    const area = d3
      .area()
      .curve(d3.curveMonotoneX)
      .x((p) => x(p[0]))
      .y0(stripH - 6)
      .y1((p) => y(p[1]));
    const line = d3
      .line()
      .curve(d3.curveMonotoneX)
      .x((p) => x(p[0]))
      .y((p) => y(p[1]));

    strip
      .append("path")
      .attr("d", area(sleepPts))
      .attr("fill", c.accent)
      .attr("opacity", 0.35);

    strip
      .append("path")
      .attr("d", line(sleepPts))
      .attr("fill", "none")
      .attr("stroke", c.accent)
      .attr("stroke-width", 1.6);

    strip
      .append("path")
      .attr("d", line(notPts))
      .attr("fill", "none")
      .attr("stroke", c.neg)
      .attr("stroke-width", 1.4)
      .attr("stroke-dasharray", "4 3")
      .attr("opacity", 0.9);

    // Peak annotation for sleep
    let peakIdx = 0;
    let peakVal = -1;
    sleepPts.forEach((p, idx) => {
      if (idx === 24) return;
      if (p[1] > peakVal) {
        peakVal = p[1];
        peakIdx = idx;
      }
    });
    if (peakVal > 0) {
      const px = x(peakIdx);
      const py = y(peakVal);
      const ph = hourAt(peakIdx);
      strip
        .append("circle")
        .attr("cx", px)
        .attr("cy", py)
        .attr("r", 3)
        .attr("fill", c.accent);
      strip
        .append("text")
        .attr("class", "anno-label")
        .attr("x", Math.min(iw - 4, px + 6))
        .attr("y", Math.max(11, py - 6))
        .attr("fill", c.muted)
        .text(`${String(ph).padStart(2, "0")}:00 · ${fmt(peakVal, 3)}`);
    }

    // Region label
    strip
      .append("text")
      .attr("x", -8)
      .attr("y", stripH / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 12)
      .attr("font-family", "Georgia, serif")
      .attr("fill", c.ink)
      .text(region);
  });
}

export function update() {
  if (ctx?.mount) draw();
}
