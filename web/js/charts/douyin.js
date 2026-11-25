/* Douyin keywords — bars by collect-to-like; grey small samples (n < 30) */
import {
  appendSvg,
  attachTableToggle,
  clear,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js?v=20261125b";

let ctx = null;

export function render(container, data) {
  clear(container);
  const { douyin, caveatEl } = data;
  const rows = [...(douyin.keywords || [])].sort(
    (a, b) => (b.median_collect_to_like || 0) - (a.median_collect_to_like || 0)
  );

  const wrap = d3.select(container);
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(
      "Median collect-to-like ratio by search keyword (bubble size = video count; n shown on each bar)"
    );

  const tableApi = attachTableToggle(wrap.node(), () => ({
    columns: [
      "keyword",
      "count",
      "median_collect_to_like",
      "median_likes",
      "median_collects",
      "small_sample",
    ],
    rows: rows.map((d) => [
      d.keyword,
      d.count,
      d.median_collect_to_like,
      d.median_likes,
      d.median_collects,
      d.count < 30 ? "yes" : "no",
    ]),
  }));

  const mount = tableApi.visual;
  const { width, height } = sizeOf(mount);
  const margin = { top: 16, right: 72, bottom: 36, left: 72 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const svg = appendSvg(
    mount,
    width,
    height,
    "Douyin keywords ranked by median collect-to-like ratio"
  );
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.keyword))
    .range([0, h])
    .padding(0.2);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.median_collect_to_like) * 1.1 || 1])
    .nice()
    .range([0, w]);
  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(rows, (d) => d.count) || 1])
    .range([4, 16]);

  g.append("g")
    .attr("transform", `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(5))
    .call((s) => s.selectAll("text").attr("font-size", 10));
  g.append("g")
    .call(d3.axisLeft(y))
    .call((s) => s.selectAll("text").attr("font-size", 11));

  g.append("text")
    .attr("x", w / 2)
    .attr("y", h + 30)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#5a6b76")
    .text("Median collect-to-like ratio");

  const bars = g
    .selectAll(".dy-bar")
    .data(rows)
    .join("g")
    .attr("class", "dy-bar")
    .attr("transform", (d) => `translate(0,${y(d.keyword)})`);

  bars
    .append("rect")
    .attr("height", y.bandwidth() * 0.55)
    .attr("y", y.bandwidth() * 0.22)
    .attr("width", (d) => x(d.median_collect_to_like || 0))
    .attr("fill", (d) => (d.count < 30 ? "#9aa7b2" : "#0b6e4f"))
    .attr("fill-opacity", (d) => (d.count < 30 ? 0.45 : 0.55));

  bars
    .append("circle")
    .attr("cx", (d) => x(d.median_collect_to_like || 0))
    .attr("cy", y.bandwidth() / 2)
    .attr("r", (d) => r(d.count))
    .attr("fill", (d) => (d.count < 30 ? "#9aa7b2" : "#b35c00"))
    .attr("fill-opacity", 0.85)
    .attr("stroke", "#fff")
    .attr("stroke-width", 1);

  bars
    .append("text")
    .attr("x", (d) => x(d.median_collect_to_like || 0) + r(d.count) + 6)
    .attr("y", y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 10)
    .attr("fill", (d) => (d.count < 30 ? "#5a6b76" : "#1a242c"))
    .text((d) => (d.count < 30 ? `n=${d.count} · small sample` : `n=${d.count}`));

  setCaveat(caveatEl, [
    ...(douyin.meta?.caveats || []),
    "Keywords with n < 30 are greyed and labelled small sample.",
  ]);

  ctx = { bars, rows, tableApi };
  return ctx;
}

export function update(step) {
  if (!ctx) return;
  const n = typeof step === "number" ? step : parseInt(String(step).split("-").pop(), 10) || 1;
  ctx.bars
    .select("rect")
    .attr("fill-opacity", (d, i) => {
      if (d.count < 30) return 0.45;
      return n >= 2 && i === 0 ? 0.9 : 0.55;
    });
  ctx.tableApi?.refreshTable();
}
