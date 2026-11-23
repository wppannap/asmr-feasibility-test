/* Duration: sleep_title vs not by title-script group (unpublished module). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js";
import { renderReviewBanner } from "./review.js";

const WEIGHTS = [
  { id: "video", label: "video" },
  { id: "channel_equal", label: "channel-equal" },
  { id: "capped_20", label: "capped-20" },
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

export function render(container, data) {
  clear(container);
  const payload = data.duration || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Duration · sleep_title vs not");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = { rows, weight: "channel_equal", tier: "tier_A", rule: "strict" };

  const controls = wrap.append("div").attr("class", "control-row chart-controls");
  addSeg(controls, "Rule", RULES, "rule");
  addSeg(controls, "Tier", TIERS, "tier");
  addSeg(controls, "Weight", WEIGHTS, "weight");

  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
}

function addSeg(parent, label, opts, key) {
  parent.append("span").attr("class", "control-label").text(label);
  const seg = parent.append("div").attr("class", "seg");
  opts.forEach((o, i) => {
    seg
      .append("button")
      .attr("type", "button")
      .attr("data-key", key)
      .attr("data-val", o.id)
      .classed("is-active", ctx[key] === o.id || (i === 0 && ctx[key] == null))
      .text(o.label)
      .on("click", function () {
        ctx[key] = o.id;
        seg.selectAll("button").classed("is-active", false);
        d3.select(this).classed("is-active", true);
        draw();
      });
  });
}

function filtered() {
  return ctx.rows.filter(
    (r) => r.rule === ctx.rule && r.series === ctx.tier
  );
}

function ratioOf(r) {
  const w = r.weightings || {};
  if (ctx.weight === "video") return w.video_ratio ?? r.video_ratio;
  if (ctx.weight === "capped_20") return w.cap20_ratio ?? w.capped_20_ratio ?? r.cap20_ratio;
  return w.channel_equal_ratio ?? w.ch_eq_ratio ?? r.ch_eq_ratio;
}

function tableRows() {
  const cols = ["script_group", "n_ch_sleep", "n_ch_not", "ratio", "boot_CI", "order_holds"];
  const rows = filtered().map((r) => {
    const ci = r.ratio_channel_boot_ci95;
    return [
      r.script_group,
      r.n_ch_sleep,
      r.n_ch_not,
      ratioOf(r) != null ? fmt(ratioOf(r), 3) : "—",
      Array.isArray(ci) ? `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]` : "—",
      String(r.order_holds_all_weightings ?? r.ordering ?? ""),
    ];
  });
  return { columns: cols, rows };
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const data = filtered();
  const w = Math.max(320, mount.clientWidth || 480);
  const h = 280;
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Duration ratios by script group");

  const margin = { top: 16, right: 16, bottom: 48, left: 48 };
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3
    .scaleBand()
    .domain(data.map((d) => d.script_group))
    .range([0, iw])
    .padding(0.25);
  const vals = data.map(ratioOf).filter((v) => v != null && Number.isFinite(+v));
  const y = d3
    .scaleLinear()
    .domain([0, Math.max(2, d3.max(vals) || 1)])
    .nice()
    .range([ih, 0]);
  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x)).selectAll("text")
    .attr("transform", "rotate(-18)").style("text-anchor", "end");
  g.append("g").call(d3.axisLeft(y));
  g.selectAll("rect")
    .data(data)
    .join("rect")
    .attr("x", (d) => x(d.script_group))
    .attr("width", x.bandwidth())
    .attr("y", (d) => y(ratioOf(d) || 0))
    .attr("height", (d) => ih - y(ratioOf(d) || 0))
    .attr("fill", "#3d8b6e");
  g.append("line")
    .attr("x1", 0)
    .attr("x2", iw)
    .attr("y1", y(1))
    .attr("y2", y(1))
    .attr("stroke", "#1a242c")
    .attr("stroke-dasharray", "4 3")
    .attr("opacity", 0.5);
}

export function update() {}
