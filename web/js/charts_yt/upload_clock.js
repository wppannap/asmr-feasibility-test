/* Upload clock: JP/KR/TW/HK night profile (unpublished module). */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js";
import { renderReviewBanner } from "./review.js";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

let ctx = null;

export function render(container, data) {
  clear(container);
  const payload = data.upload_clock || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Upload clock · declared country");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (meta.jp_depends_on_rule) {
    wrap
      .append("p")
      .attr("class", "chart-note")
      .text("JP result depends on the rule");
  }
  wrap
    .append("p")
    .attr("class", "chart-note")
    .text("Exact :00/:30 times often mean scheduled publishing.");
  if (!ok) return;

  ctx = { rows, rule: "strict", meta };
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

  const tableApi = attachTableToggle(wrap.node(), () => tableRows());
  ctx.mount = tableApi.visual;
  draw();
}

function filtered() {
  return ctx.rows.filter((r) => r.rule === ctx.rule);
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
    rows: filtered().map((r) => [
      r.region,
      r.script_group,
      r.n_ch_sleep ?? r.n_ch_s,
      r.n_ch_not ?? r.n_ch_n,
      fmtCI(r.night_sleep_ci || r.night_sleep_CI),
      fmtCI(r.night_not_ci || r.night_not_CI),
      fmtCI(r.diff_ci || r.diff_sleep_minus_not_CI),
      String(r.sleep_gt_not ?? r.direction_sleep_gt_not ?? ""),
    ]),
  };
}

function fmtCI(ci) {
  if (!Array.isArray(ci) || ci.length < 2) return "—";
  return `[${fmt(ci[0], 3)}, ${fmt(ci[1], 3)}]`;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const data = filtered();
  // Aggregate night midpoint by region for a simple linear profile bars
  const byRegion = d3.rollups(
    data,
    (v) => {
      const mids = v
        .map((r) => {
          const ci = r.night_sleep_ci || r.night_sleep_CI;
          return Array.isArray(ci) ? (ci[0] + ci[1]) / 2 : null;
        })
        .filter((x) => x != null);
      return d3.mean(mids);
    },
    (d) => d.region
  );
  const w = Math.max(320, mount.clientWidth || 480);
  const h = 260;
  const svg = d3
    .select(mount)
    .append("svg")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Night upload share by region");
  const margin = { top: 16, right: 16, bottom: 36, left: 48 };
  const iw = w - margin.left - margin.right;
  const ih = h - margin.top - margin.bottom;
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3
    .scaleBand()
    .domain(byRegion.map((d) => d[0]))
    .range([0, iw])
    .padding(0.3);
  const y = d3.scaleLinear().domain([0, 1]).range([ih, 0]);
  g.append("g").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x));
  g.append("g").call(d3.axisLeft(y).ticks(5, "~%"));
  g.selectAll("rect")
    .data(byRegion)
    .join("rect")
    .attr("x", (d) => x(d[0]))
    .attr("width", x.bandwidth())
    .attr("y", (d) => y(d[1] || 0))
    .attr("height", (d) => ih - y(d[1] || 0))
    .attr("fill", "#4a6fa5");
}

export function update() {}
