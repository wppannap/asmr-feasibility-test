/* Creators · declared country — deep-night starfield constellations. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126p";
import { themeColors } from "../theme.js?v=20261126p";
import { renderReviewBanner } from "./review.js?v=20261126p";

const RULES = [
  { id: "strict", label: "strict" },
  { id: "title_only", label: "title_only" },
];

/** Harmonious celestial palette; unknown is muted silver. */
const PALETTE = ["#f4a259", "#66c2cf", "#e88d72", "#b4a7e8", "#8fb8ed", "#95c9a8", "#d4a574", "#7eb8c9", "#c9a0dc", "#a8c686"];
const UNKNOWN_COLOR = "#8a94a8";

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.creators || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  wrap.append("h3").attr("class", "chart-section-title").text("Creators · declared country");
  wrap
    .append("p")
    .attr("class", "chart-subtitle chart-subtitle-plain")
    .text("Top 5% of channels’ share of videos — each country as a constellation in deep night.");
  wrap
    .append("p")
    .attr("class", "chart-subtitle")
    .text(meta.scope_line || "videos labelled as ASMR (excluding ambient-noise content)");
  const ok = renderReviewBanner(wrap, meta);
  setCaveat(caveatEl, meta.caveats || []);
  if (!ok) return;

  ctx = { rows, rule: "title_only", meta };
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
  if (!resizeBound) {
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
}

function filtered() {
  return ctx.rows
    .filter((r) => r.rule === ctx.rule)
    .slice()
    .sort((a, b) => (b.n_channels || 0) - (a.n_channels || 0));
}

function tableRows() {
  return {
    columns: ["country", "n_channels", "n_videos", "top5pct_channels", "share_top5pct"],
    rows: filtered().map((r) => [
      r.country,
      r.n_channels,
      r.n_videos,
      r.top5pct_channels,
      r.share_videos_from_top5pct_channels != null
        ? fmt(r.share_videos_from_top5pct_channels * 100, 1) + "%"
        : "—",
    ]),
  };
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function countryColor(code, index) {
  if (String(code).toLowerCase() === "unknown") return UNKNOWN_COLOR;
  return PALETTE[index % PALETTE.length];
}

function sharePct(row) {
  const s = row?.share_videos_from_top5pct_channels;
  if (s == null || !Number.isFinite(s)) return null;
  return Math.round(s * 100);
}

/** Sparse edges: each star to 1–2 nearest neighbours. */
function constellationEdges(stars) {
  const edges = [];
  const seen = new Set();
  stars.forEach((a, i) => {
    const dist = stars
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((u, v) => u.d - v.d);
    const k = i % 3 === 0 ? 2 : 1;
    for (let n = 0; n < k && n < dist.length; n++) {
      const j = dist[n].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  });
  return edges;
}

/** Organic, non-grid anchors with simple collision separation. */
function placeAnchors(rows, iw, ih, mobile) {
  const rand = mulberry32(hashSeed(`anchors-${ctx.rule}-${rows.length}`));
  const nodes = rows.map((r, i) => {
    // Asymmetric seed positions (not a 3×2 grid)
    const t = (i + 0.37) / Math.max(1, rows.length);
    const spiral = 0.18 + t * 0.62;
    const ang = t * Math.PI * 2.15 + rand() * 0.55;
    let x = iw * (0.5 + Math.cos(ang) * spiral * 0.42 + (rand() - 0.5) * 0.12);
    let y = ih * (0.48 + Math.sin(ang) * spiral * 0.38 + (rand() - 0.5) * 0.14);
    // Extra vertical stagger so clusters don't read as rows
    y += ((i % 5) - 2) * (mobile ? 10 : 14);
    x = Math.max(iw * 0.1, Math.min(iw * 0.9, x));
    y = Math.max(ih * 0.12, Math.min(ih * 0.88, y));
    const nCh = r.n_channels || 30;
    const spread = (mobile ? 28 : 36) + Math.sqrt(nCh) * (mobile ? 1.1 : 1.35);
    return { row: r, x, y, r: spread + 18 };
  });

  // Force-ish separation
  for (let iter = 0; iter < 48; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minD = a.r + b.r;
        if (dist < minD) {
          const push = ((minD - dist) / dist) * 0.5;
          dx *= push;
          dy *= push;
          a.x -= dx;
          a.y -= dy;
          b.x += dx;
          b.y += dy;
        }
      }
      nodes[i].x = Math.max(iw * 0.08, Math.min(iw * 0.92, nodes[i].x));
      nodes[i].y = Math.max(ih * 0.1, Math.min(ih * 0.9, nodes[i].y));
    }
  }
  return nodes;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  const c = themeColors();
  const w = Math.max(320, mount.clientWidth || 640);
  const mobile = w < 560;
  const h = mobile ? 460 : 520;
  const pad = 10;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night starfield of creator constellations by declared country");

  const defs = svg.append("defs");
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "50%")
    .attr("cy", "45%")
    .attr("r", "68%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#18223d");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#0d1220");

  // Soft glow for anchor stars
  const glow = defs
    .append("filter")
    .attr("id", "star-glow")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%");
  glow.append("feGaussianBlur").attr("stdDeviation", 1.4).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  // Deep midnight canvas
  svg
    .append("rect")
    .attr("class", "starfield-canvas")
    .attr("x", 0.5)
    .attr("y", 0.5)
    .attr("width", w - 1)
    .attr("height", h - 1)
    .attr("rx", 4)
    .attr("ry", 4)
    .attr("fill", "url(#creators-midnight-sky)")
    .attr("stroke", "#2a3550")
    .attr("stroke-width", 1);

  const g = svg.append("g").attr("transform", `translate(${pad},${pad})`);
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  // 220+ deterministic dim field stars
  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  const fieldN = 240;
  for (let i = 0; i < fieldN; i++) {
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fieldRand() * iw)
      .attr("cy", fieldRand() * ih)
      .attr("r", 0.4 + fieldRand() * 1.0)
      .attr("fill", "#e8ecf5")
      .attr("opacity", 0.12 + fieldRand() * 0.38);
  }

  // Ultra-faint celestial arcs
  [
    { cx: iw * 0.35, cy: ih * 0.55, r: Math.min(iw, ih) * 0.55 },
    { cx: iw * 0.72, cy: ih * 0.38, r: Math.min(iw, ih) * 0.42 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.7)
      .attr("opacity", 0.08)
      .attr("stroke-dasharray", i === 0 ? "2 10" : "1 14");
  });

  const anchors = placeAnchors(rows, iw, ih, mobile);
  const constellations = g.append("g").attr("class", "constellations");

  const groups = [];

  anchors.forEach((anchor, idx) => {
    const row = anchor.row;
    const code = String(row.country || "").toUpperCase();
    const color = countryColor(row.country, idx);
    const pct = sharePct(row);
    const nCh = row.n_channels || 30;
    const share = row.share_videos_from_top5pct_channels;
    const spread = (mobile ? 26 : 34) + Math.sqrt(nCh) * (mobile ? 1.05 : 1.3);
    const nStars = Math.round(7 + Math.min(28, Math.sqrt(nCh) * 1.15));
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars`));

    const stars = [];
    for (let i = 0; i < nStars; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = spread * (0.2 + rand() * 0.9) * (0.5 + rand() * 0.55);
      stars.push({
        x: anchor.x + Math.cos(ang) * rad + (rand() - 0.5) * spread * 0.3,
        y: anchor.y + Math.sin(ang) * rad * 0.7 + (rand() - 0.5) * spread * 0.28,
        anchor: rand() < 0.18 + (share != null ? share * 0.35 : 0),
      });
    }

    // Ensure at least one bright anchor when share is high
    if (share != null && share >= 0.35 && !stars.some((s) => s.anchor)) {
      stars[0].anchor = true;
    }

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
      .style("outline", "none")
      .style("cursor", "pointer");

    constellationEdges(stars).forEach(([i, j]) => {
      cg.append("line")
        .attr("class", "constellation-link")
        .attr("x1", stars[i].x)
        .attr("y1", stars[i].y)
        .attr("x2", stars[j].x)
        .attr("y2", stars[j].y)
        .attr("stroke", color)
        .attr("stroke-width", 0.75)
        .attr("opacity", 0.45);
    });

    stars.forEach((s) => {
      const isAnchor = s.anchor;
      const glowBoost = share != null ? 0.35 + share * 0.55 : 0.4;
      cg.append("circle")
        .attr("class", isAnchor ? "constellation-star anchor-star" : "constellation-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", isAnchor ? 1.8 + (share || 0) * 1.4 : 0.9 + rand() * 0.5)
        .attr("fill", color)
        .attr("opacity", isAnchor ? Math.min(0.95, 0.55 + glowBoost * 0.4) : 0.4 + rand() * 0.25)
        .attr("filter", isAnchor ? "url(#star-glow)" : null);
    });

    const labelY = Math.min(ih - 6, Math.max(...stars.map((s) => s.y)) + 14);
    const label = pct != null ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%` : code;
    cg.append("text")
      .attr("class", "constellation-label")
      .attr("x", anchor.x)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 11)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.88)
      .text(label);

    const tip =
      `${row.country}: ${row.n_channels} channels, ${row.n_videos} videos` +
      (pct != null ? `, top 5% share ${pct}%` : "");
    cg.append("title").text(tip);

    groups.push(cg);
  });

  function setFocus(active) {
    groups.forEach((cg) => {
      const on = !active || cg.node() === active;
      cg.attr("opacity", on ? 1 : 0.28);
      cg.selectAll(".constellation-link").attr("opacity", on ? 0.7 : 0.2);
      cg.selectAll(".anchor-star").attr("opacity", on ? 1 : 0.35);
    });
  }

  groups.forEach((cg) => {
    cg.on("pointerenter", function () {
      setFocus(this);
    })
      .on("pointerleave", () => setFocus(null))
      .on("focus", function () {
        setFocus(this);
      })
      .on("blur", () => setFocus(null));
  });
}

export function update() {
  if (ctx?.mount) draw();
}
