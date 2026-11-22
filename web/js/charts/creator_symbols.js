/* Creator-country proportional symbols + TikTok ranked bars (no map wording) */
import {
  appendSvg,
  attachTableToggle,
  clear,
  countryName,
  fmt,
  setCaveat,
  sizeOf,
} from "./util.js";
import { pickExpansionCaveat } from "./config.js";

let ctx = null;

export function render(container, data) {
  clear(container);
  const { creators, tiktok, lands, caveatEl } = data;

  const wrap = d3.select(container);
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(
      "Number of channels in our sample that say they are based in each country"
    );

  const biasNote = wrap.append("p").attr("class", "chart-bias-note");
  const covCh = fmt(creators.meta?.coverage_channels_pct, 1);
  const covVid = fmt(creators.meta?.coverage_videos_pct, 1);
  const medV = fmt(creators.meta?.median_videos_per_channel, 0);
  const p90V = fmt(creators.meta?.p90_videos_per_channel, 0);
  const caveats = creators.meta?.caveats || [];
  const samplingBias =
    caveats.find((c) => /Search-log bias|Chinese-character/i.test(c)) || "";
  biasNote.html(
    `Coverage: <strong>${covCh}%</strong> of channels · <strong>${covVid}%</strong> of videos (video-weighted). ` +
      `Videos per channel: median <strong>${medV}</strong>, p90 <strong>${p90V}</strong>. ` +
      samplingBias
  );

  const layout = wrap.append("div").attr("class", "creator-layout");
  const mapHost = layout.append("div").attr("class", "creator-map-host").node();
  const tkHost = layout.append("div").attr("class", "tiktok-bar-host").node();

  const tableApi = attachTableToggle(mapHost, () => tableData(creators, tiktok));
  drawCreatorMap(tableApi.visual, lands, creators);
  const tkTable = attachTableToggle(tkHost, () => tiktokTableData(tiktok));
  drawTiktokBars(tkTable.visual, tiktok);

  setCaveat(caveatEl, [
    pickExpansionCaveat(caveats),
    "Circle area is the number of channels (not videos) with a self-declared country in our sample.",
    caveats.find((c) => /self-declared countryCode/i.test(c)) || "",
  ].filter(Boolean));

  ctx = { creators, tiktok, tableApi, tkTable };
  return ctx;
}

function tiktokTableData(tiktok) {
  const rows = [...(tiktok.countries || [])]
    .filter((d) => d.iso3 && d.iso3 !== "UNKNOWN")
    .sort((a, b) => b.count - a.count)
    .map((d) => [d.iso3, d.count, d.total_plays, d.median_plays]);
  return {
    columns: ["iso3", "video_count", "total_plays", "median_plays"],
    rows,
  };
}

function tableData(creators, tiktok) {
  const rows = (creators.countries || [])
    .filter((d) => d.iso3 && d.iso3 !== "unknown")
    .sort((a, b) => b.channel_count - a.channel_count)
    .map((d) => [
      d.iso3,
      countryName(d.iso3),
      d.channel_count,
      d.video_count,
      d.share_asmr,
      d.share_sleep,
    ]);
  const tk = (tiktok.countries || [])
    .filter((d) => d.iso3 && d.iso3 !== "UNKNOWN")
    .sort((a, b) => b.count - a.count)
    .map((d) => [d.iso3, d.count, "tiktok_sample"]);
  return {
    columns: [
      "iso3",
      "name",
      "channel_count",
      "video_count",
      "share_asmr",
      "share_sleep",
    ],
    rows: rows.concat(
      tk.map((r) => [r[0], countryName(r[0]), "—", r[1], "—", "—"])
    ),
  };
}

function drawCreatorMap(container, lands, creators) {
  const { width, height } = sizeOf(container);
  const svg = appendSvg(
    container,
    width,
    Math.max(280, height - 40),
    "Proportional-symbol map of channel counts by self-declared channel country"
  );

  const projection = d3.geoNaturalEarth1().fitExtent(
    [
      [8, 8],
      [width - 8, height - 48],
    ],
    lands
  );
  const path = d3.geoPath(projection);

  svg
    .append("g")
    .selectAll("path")
    .data(lands.features)
    .join("path")
    .attr("d", path)
    .attr("fill", "#d5dee6")
    .attr("stroke", "#f4f7f9")
    .attr("stroke-width", 0.4)
    .attr("aria-hidden", "true");

  const rows = (creators.countries || []).filter(
    (d) => d.iso3 && d.iso3 !== "unknown" && d.channel_count > 0
  );
  const centroids = new Map();
  lands.features.forEach((f) => {
    const iso = f.properties?.iso3;
    if (!iso) return;
    const c = path.centroid(f);
    if (Number.isFinite(c[0]) && Number.isFinite(c[1])) centroids.set(iso, c);
  });

  const plotted = rows
    .map((d) => ({ ...d, xy: centroids.get(d.iso3) }))
    .filter((d) => d.xy);

  const r = d3
    .scaleSqrt()
    .domain([0, d3.max(plotted, (d) => d.channel_count) || 1])
    .range([2, 26]);

  svg
    .append("g")
    .attr("class", "symbols")
    .selectAll("circle")
    .data(plotted.sort((a, b) => b.channel_count - a.channel_count))
    .join("circle")
    .attr("cx", (d) => d.xy[0])
    .attr("cy", (d) => d.xy[1])
    .attr("r", (d) => r(d.channel_count))
    .attr("fill", "#0b6e4f")
    .attr("fill-opacity", 0.45)
    .attr("stroke", "#0b6e4f")
    .append("title")
    .text(
      (d) =>
        `${countryName(d.iso3)}: ${fmt(d.channel_count, 0)} channels · ${fmt(
          d.video_count,
          0
        )} videos in sample`
    );
}

function drawTiktokBars(container, tiktok) {
  clear(container);
  const n = tiktok.meta?.n;
  if (n == null || !Number.isFinite(n)) {
    throw new Error("tiktok_origin.json meta.n is missing");
  }
  d3.select(container)
    .append("p")
    .attr("class", "tiktok-headline")
    .text(`Validation sample, n = ${n}`);

  const rows = [...(tiktok.countries || [])]
    .filter((d) => d.iso3 && d.iso3 !== "UNKNOWN")
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const { width } = sizeOf(container);
  const height = Math.max(160, rows.length * 18 + 28);
  const margin = { top: 4, right: 36, bottom: 4, left: 36 };
  const w = width - margin.left - margin.right;
  const h = height - margin.top - margin.bottom;
  const svg = appendSvg(
    container,
    width,
    height,
    "Ranked bar chart of TikTok validation-sample video counts by location code"
  );
  const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const y = d3
    .scaleBand()
    .domain(rows.map((d) => d.iso3))
    .range([0, h])
    .padding(0.2);
  const x = d3
    .scaleLinear()
    .domain([0, d3.max(rows, (d) => d.count) || 1])
    .range([0, w]);

  g.selectAll("rect")
    .data(rows)
    .join("rect")
    .attr("y", (d) => y(d.iso3))
    .attr("height", y.bandwidth())
    .attr("width", (d) => x(d.count))
    .attr("fill", "#b35c00")
    .attr("fill-opacity", 0.75);

  g.selectAll(".lab")
    .data(rows)
    .join("text")
    .attr("class", "lab")
    .attr("x", -4)
    .attr("y", (d) => y(d.iso3) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("text-anchor", "end")
    .attr("font-size", 10)
    .text((d) => d.iso3);

  g.selectAll(".val")
    .data(rows)
    .join("text")
    .attr("class", "val")
    .attr("x", (d) => x(d.count) + 4)
    .attr("y", (d) => y(d.iso3) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .attr("font-size", 10)
    .text((d) => d.count);
}

export function update(step) {
  if (!ctx?.tableApi) return;
  ctx.tableApi.refreshTable();
  void step;
}
