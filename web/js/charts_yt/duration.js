/* Vertical acoustic spindles — log-time densities as symmetric soundwave columns. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js";
import { themeColors } from "../theme.js";
import { renderReviewBanner } from "./review.js";

const WEIGHTS = [
  { id: "video", label: "video" },
  { id: "channel_equal", label: "channel-equal" },
  { id: "capped20", label: "capped-20" },
];
const TIERS = [
  { id: "tier_A", label: "tier A" },
  { id: "all_labelled", label: "all labelled" },
];
const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

const SCRIPT_ORDER = [
  { match: /Korean/i, label: "Korean" },
  { match: /Japanese/i, label: "Japanese" },
  { match: /Han|Chinese/i, label: "Han" },
  { match: /Latin/i, label: "Latin" },
];

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.duration || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const histograms = payload.histograms || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Duration · sleep_title vs not");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = {
    rows,
    histograms,
    markers: meta.markers_sec || [3600, 28800],
    weight: "channel_equal",
    tier: "tier_A",
    rule: "strict",
  };

  const controls = wrap.append("div").attr("class", "control-row chart-controls");
  addSeg(controls, "Rule", RULES, "rule");
  addSeg(controls, "Tier", TIERS, "tier");
  addSeg(controls, "Weight", WEIGHTS, "weight");

  wrap
    .append("p")
    .attr("class", "chart-inline-legend")
    .html(
      `<span class="leg-swatch leg-sleep"></span> sleep_title (left)` +
        ` <span class="leg-swatch leg-not"></span> not (right)`
    );

  ctx.ratioEl = wrap.append("p").attr("class", "chart-note").node();
  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
  bindResize();
}

function addSeg(parent, label, opts, key) {
  parent.append("span").attr("class", "control-label").text(label);
  const seg = parent.append("div").attr("class", "seg");
  opts.forEach((o) => {
    seg
      .append("button")
      .attr("type", "button")
      .classed("is-active", ctx[key] === o.id)
      .text(o.label)
      .on("click", function () {
        ctx[key] = o.id;
        seg.selectAll("button").classed("is-active", false);
        d3.select(this).classed("is-active", true);
        draw();
      });
  });
}

function filteredRows() {
  return ctx.rows.filter((r) => r.rule === ctx.rule && r.series === ctx.tier);
}

function filteredHists() {
  const raw = ctx.histograms.filter((h) => h.rule === ctx.rule && h.series === ctx.tier);
  const ordered = [];
  SCRIPT_ORDER.forEach((spec) => {
    const hit = raw.find((h) => spec.match.test(h.script_group || ""));
    if (hit) ordered.push({ ...hit, short: spec.label });
  });
  raw.forEach((h) => {
    if (!ordered.some((o) => o.script_group === h.script_group)) {
      ordered.push({
        ...h,
        short: (h.script_group || "").replace(" script", "").replace(" (mostly Chinese)", ""),
      });
    }
  });
  return ordered;
}

function ratioOf(r) {
  const w = r.weightings || {};
  const key =
    ctx.weight === "video" ? "video" : ctx.weight === "capped20" ? "capped20" : "channel_equal";
  return (w[key] || {}).ratio;
}

function tableRows() {
  return {
    columns: ["script_group", "n_ch_sleep", "n_ch_not", "ratio", "boot_CI", "order_holds"],
    rows: filteredRows().map((r) => {
      const ci = r.ratio_channel_boot_ci95;
      return [
        r.script_group,
        r.n_ch_sleep,
        r.n_ch_not,
        ratioOf(r) != null ? fmt(ratioOf(r), 3) : "—",
        Array.isArray(ci) ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : "—",
        String(!!r.order_holds_all_weightings),
      ];
    }),
  };
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

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const hists = filteredHists();
  const rows = filteredRows();
  if (ctx.ratioEl) {
    const bits = rows.map((r) => {
      const ci = r.ratio_channel_boot_ci95;
      const ratio = ratioOf(r);
      return `${r.script_group}: ${ratio != null ? fmt(ratio, 2) : "—"}×${
        Array.isArray(ci) ? ` [${fmt(ci[0], 2)}, ${fmt(ci[1], 2)}]` : ""
      }`;
    });
    ctx.ratioEl.textContent = bits.join(" · ");
  }

  const w = Math.max(300, mount.clientWidth || 560);
  const n = Math.max(1, hists.length);
  const margin = { top: 28, right: 12, bottom: 36, left: w < 520 ? 36 : 48 };
  const ih = w < 520 ? 360 : 420;
  const iw = w - margin.left - margin.right;
  const colW = iw / n;
  const c = themeColors();

  const allBins = (hists[0]?.sleep?.bins || hists[0]?.not?.bins || [30, 3600]).map(Number);
  const y = d3
    .scaleLog()
    .domain([allBins[0], allBins[allBins.length - 1]])
    .range([0, ih]); // top = short, bottom = long

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${ih + margin.top + margin.bottom}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Vertical acoustic spindles of duration density");
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  // Y axis
  g.append("g")
    .call(d3.axisLeft(y).ticks(6, "~s"))
    .selectAll("text")
    .attr("fill", c.muted);

  // Milestone strings
  ctx.markers.forEach((sec) => {
    const yy = y(sec);
    const label = sec === 3600 ? "1 h" : sec === 28800 ? "8 h · full night" : `${sec}s`;
    g.append("line")
      .attr("x1", 0)
      .attr("x2", iw)
      .attr("y1", yy)
      .attr("y2", yy)
      .attr("stroke", c.accent)
      .attr("stroke-width", 1)
      .attr("opacity", 0.45);
    g.append("text")
      .attr("class", "anno-label")
      .attr("x", iw - 4)
      .attr("y", yy - 4)
      .attr("text-anchor", "end")
      .attr("fill", c.muted)
      .text(label);
  });

  hists.forEach((hist, i) => {
    const cx = colW * i + colW / 2;
    const maxHalf = colW * 0.42;
    g.append("text")
      .attr("x", cx)
      .attr("y", -10)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-family", "Georgia, serif")
      .attr("fill", c.ink)
      .text(hist.short);

    // Center spine
    g.append("line")
      .attr("x1", cx)
      .attr("x2", cx)
      .attr("y1", 0)
      .attr("y2", ih)
      .attr("stroke", c.line)
      .attr("stroke-width", 0.75);

    drawHalf(g, hist.sleep, y, cx, maxHalf, c.accent, -1);
    drawHalf(g, hist.not, y, cx, maxHalf, c.neg, 1);

    if (hist.sleep?.median) {
      g.append("circle")
        .attr("cx", cx - 3)
        .attr("cy", y(hist.sleep.median))
        .attr("r", 3.2)
        .attr("fill", c.accent)
        .append("title")
        .text(`sleep median ${fmt(hist.sleep.median, 0)}s`);
    }
    if (hist.not?.median) {
      g.append("circle")
        .attr("cx", cx + 3)
        .attr("cy", y(hist.not.median))
        .attr("r", 3.2)
        .attr("fill", c.neg)
        .append("title")
        .text(`not median ${fmt(hist.not.median, 0)}s`);
    }
  });
}

function drawHalf(g, arm, y, cx, maxHalf, color, side) {
  if (!arm?.bins || !arm?.density) return;
  const bins = arm.bins.map(Number);
  const dens = arm.density.map(Number);
  const maxD = d3.max(dens) || 1;
  const xScale = d3.scaleLinear().domain([0, maxD]).range([0, maxHalf]);
  const pts = dens.map((d, i) => {
    const mid = Math.sqrt(bins[i] * bins[i + 1]);
    return [cx + side * xScale(d), y(mid)];
  });
  const area = d3
    .area()
    .curve(d3.curveBasis)
    .x0(cx)
    .x1((p) => p[0])
    .y((p) => p[1]);
  g.append("path").attr("d", area(pts)).attr("fill", color).attr("opacity", 0.35);
  const line = d3
    .line()
    .curve(d3.curveBasis)
    .x((p) => p[0])
    .y((p) => p[1]);
  g.append("path")
    .attr("d", line(pts))
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.25);
}

export function update() {
  if (ctx?.mount) draw();
}
