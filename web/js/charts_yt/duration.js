/* Sleep audio-track timeline — log-time densities as sound-bar waveforms. */
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
      `<span class="leg-swatch leg-sleep"></span> sleep_title` +
        ` <span class="leg-swatch leg-not"></span> not`
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
  return ctx.histograms.filter((h) => h.rule === ctx.rule && h.series === ctx.tier);
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

  const w = Math.max(280, mount.clientWidth || 560);
  const left = w < 520 ? 76 : 110;
  const trackH = 64;
  const h = 48 + hists.length * trackH;
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Duration audio-track densities by script group");
  const margin = { top: 18, right: 16, bottom: 28, left };
  const iw = Math.max(40, w - margin.left - margin.right);
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const allBins = (hists[0]?.sleep?.bins || hists[0]?.not?.bins || [30, 3600]).map(Number);
  const x = d3.scaleLog().domain([allBins[0], allBins[allBins.length - 1]]).range([0, iw]);
  g.append("g")
    .attr("transform", `translate(0,${hists.length * trackH})`)
    .call(d3.axisBottom(x).ticks(6, "~s"))
    .selectAll("text")
    .attr("fill", themeColors().muted);

  const c = themeColors();
  // Milestone lines 1h / 8h
  ctx.markers.forEach((sec) => {
    const label = sec === 3600 ? "1 h" : sec === 28800 ? "8 h · full night" : `${sec}s`;
    const x0 = x(sec);
    g.append("line")
      .attr("class", "track-milestone")
      .attr("x1", x0)
      .attr("x2", x0)
      .attr("y1", -4)
      .attr("y2", hists.length * trackH)
      .attr("stroke", c.accent)
      .attr("stroke-width", 1.25)
      .attr("opacity", 0.55);
    const lx = Math.min(iw - 4, x0 + 6);
    g.append("text")
      .attr("class", "anno-label")
      .attr("x", lx)
      .attr("y", -2)
      .attr("fill", c.muted)
      .text(label);
  });

  hists.forEach((hist, i) => {
    const y0 = i * trackH;
    // Track bed
    g.append("rect")
      .attr("x", 0)
      .attr("y", y0 + 8)
      .attr("width", iw)
      .attr("height", trackH - 16)
      .attr("fill", c.bg2)
      .attr("stroke", c.line)
      .attr("stroke-width", 1);

    g.append("text")
      .attr("x", -8)
      .attr("y", y0 + trackH / 2)
      .attr("text-anchor", "end")
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11)
      .attr("fill", c.ink)
      .text(hist.script_group.replace(" script", "").replace(" (mostly Chinese)", ""));

    drawWave(g, hist.sleep, x, y0, trackH, c.accent, 0.55);
    drawWave(g, hist.not, x, y0, trackH, c.neg, 0.4, true);

    if (hist.sleep?.median) {
      g.append("line")
        .attr("x1", x(hist.sleep.median))
        .attr("x2", x(hist.sleep.median))
        .attr("y1", y0 + 10)
        .attr("y2", y0 + trackH - 10)
        .attr("stroke", c.accent)
        .attr("stroke-width", 1.5);
    }
    if (hist.not?.median) {
      g.append("line")
        .attr("x1", x(hist.not.median))
        .attr("x2", x(hist.not.median))
        .attr("y1", y0 + 10)
        .attr("y2", y0 + trackH - 10)
        .attr("stroke", c.neg)
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "2 2");
    }
  });
}

function drawWave(g, arm, x, y0, trackH, color, opacity, dashed = false) {
  if (!arm?.bins || !arm?.density) return;
  const bins = arm.bins.map(Number);
  const dens = arm.density.map(Number);
  const maxD = d3.max(dens) || 1;
  const mid = y0 + trackH / 2;
  const amp = (trackH - 20) / 2;
  const y = d3.scaleLinear().domain([0, maxD]).range([0, amp]);
  const pts = dens.map((d, i) => {
    const midBin = Math.sqrt(bins[i] * bins[i + 1]);
    return [x(midBin), y(d)];
  });
  // Symmetric sound-bar area around track midline
  const area = d3
    .area()
    .curve(d3.curveBasis)
    .x((p) => p[0])
    .y0((p) => mid - p[1])
    .y1((p) => mid + p[1]);
  g.append("path")
    .attr("d", area(pts))
    .attr("fill", color)
    .attr("opacity", opacity * 0.55);
  const line = d3
    .line()
    .curve(d3.curveBasis)
    .x((p) => p[0])
    .y((p) => mid - p[1]);
  g.append("path")
    .attr("d", line(pts))
    .attr("fill", "none")
    .attr("stroke", color)
    .attr("stroke-width", 1.25)
    .attr("stroke-dasharray", dashed ? "3 2" : null);
}

export function update() {
  if (ctx?.mount) draw();
}
