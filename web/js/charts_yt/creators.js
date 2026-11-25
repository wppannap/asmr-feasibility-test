/* Creators · declared country — deep-night starfield constellations. */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126q";
import { themeColors } from "../theme.js?v=20261126q";
import { renderReviewBanner } from "./review.js?v=20261126q";

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
    .text(
      "Constellation size & bright stars = top 5% creators’ video share; star count = channels."
    );
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

function shareOf(row) {
  const s = row?.share_videos_from_top5pct_channels;
  return s != null && Number.isFinite(s) ? s : 0.28;
}

/** Sparse, irregular edges — not a neat spanning tree. */
function constellationEdges(stars, rand) {
  const edges = [];
  const used = new Set();
  stars.forEach((a, i) => {
    const dist = stars
      .map((b, j) => ({ j, d: (a.x - b.x) ** 2 + (a.y - b.y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((u, v) => u.d - v.d);
    const k = rand() < 0.35 ? 2 : 1;
    for (let n = 0; n < k && n < dist.length; n++) {
      const pick =
        n === 0 && rand() < 0.22 && dist.length > 2
          ? dist[1 + Math.floor(rand() * Math.min(2, dist.length - 1))]
          : dist[n];
      const j = pick.j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (used.has(key)) continue;
      used.add(key);
      edges.push([i, j]);
    }
  });
  return edges;
}

/**
 * Spread strongly tracks top-5% share so ~50% (TW) is ~2.2–2.5× ~23% (DE).
 * Channel count is only a light densify term.
 */
function clusterSpread(row, mobile) {
  const share = shareOf(row);
  const t = Math.max(0, Math.min(1, (share - 0.22) / (0.5 - 0.22)));
  const mul = 1 + Math.pow(t, 0.8) * 1.65; // ~1.0 @22% → ~2.65 @50%
  const base = mobile ? 22 : 28;
  const channelTerm = Math.sqrt(row.n_channels || 30) * (mobile ? 0.08 : 0.12);
  return base * mul + channelTerm;
}

/** Outer radius including star envelope + label clearance under the cloud. */
function outerRadius(spread, mobile) {
  return spread * 1.02 + (mobile ? 14 : 16);
}

function countClusterOverlaps(nodes) {
  let n = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const need = a.outerRadius + b.outerRadius + 52; // each collide radius = outer+26
      if (Math.hypot(a.x - b.x, a.y - b.y) < need - 0.5) n++;
    }
  }
  return n;
}

/**
 * Organic seeds + d3.forceCollide so constellations never overlap
 * (including label clearance) and stay in the dark inner sky.
 */
function placeAnchors(rows, iw, ih, mobile) {
  const rand = mulberry32(hashSeed(`sky-anchors-${ctx.rule}-${rows.length}-v5`));
  const slots = [
    [0.3, 0.26],
    [0.58, 0.2],
    [0.76, 0.3],
    [0.36, 0.4],
    [0.68, 0.44],
    [0.22, 0.54],
    [0.5, 0.56],
    [0.76, 0.62],
    [0.32, 0.72],
    [0.54, 0.76],
    [0.7, 0.7],
  ];
  const x0 = iw * 0.18;
  const x1 = iw * 0.82;
  const y0 = ih * 0.18;
  const y1 = ih * 0.82;
  const packW = x1 - x0;
  const packH = y1 - y0;

  let sizeScale = 1;
  // Fit collide disks into the dark core; keep relative share sizing
  {
    const raw = rows.map((r) => outerRadius(clusterSpread(r, mobile), mobile) + 26);
    const sumR = raw.reduce((s, r) => s + r, 0);
    const maxDim = Math.min(packW, packH) * 0.92;
    // Heuristic: sum of diameters along a loose packing path
    if (sumR * 1.35 > packW + packH) {
      sizeScale = Math.max(0.55, (packW + packH) / (sumR * 1.35));
    }
    const maxR = Math.max(...raw) * sizeScale;
    if (maxR * 2.2 > maxDim) sizeScale *= maxDim / (maxR * 2.2);
    sizeScale = Math.max(0.52, Math.min(1, sizeScale));
  }

  const nodes = rows.map((r, i) => {
    const spread = clusterSpread(r, mobile) * sizeScale;
    const or = outerRadius(spread, mobile);
    const slot = slots[i % slots.length];
    let x = iw * (slot[0] + (rand() - 0.5) * 0.06);
    let y = ih * (slot[1] + (rand() - 0.5) * 0.06);
    x = Math.max(x0 + or * 0.4, Math.min(x1 - or * 0.4, x));
    y = Math.max(y0 + or * 0.4, Math.min(y1 - or * 0.4, y));
    return { row: r, x, y, spread, outerRadius: or };
  });

  function clampSoft() {
    nodes.forEach((d) => {
      const m = d.outerRadius * 0.15;
      d.x = Math.max(x0 + m, Math.min(x1 - m, d.x));
      d.y = Math.max(y0 + m, Math.min(y1 - m, d.y));
    });
  }

  function hardSeparate() {
    for (let iter = 0; iter < 120; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minD = a.outerRadius + b.outerRadius + 52;
          if (dist < minD) {
            const push = ((minD - dist) / dist) * 0.55;
            dx *= push;
            dy *= push;
            a.x -= dx;
            a.y -= dy;
            b.x += dx;
            b.y += dy;
          }
        }
      }
      clampSoft();
    }
  }

  function runSim() {
    const sim = d3
      .forceSimulation(nodes)
      .force("x", d3.forceX(iw * 0.5).strength(0.03))
      .force("y", d3.forceY(ih * 0.5).strength(0.028))
      .force(
        "collide",
        d3
          .forceCollide((d) => d.outerRadius + 26)
          .iterations(5)
          .strength(1)
      )
      .stop();
    for (let i = 0; i < 250; i++) sim.tick();
    hardSeparate();
    clampSoft();
  }

  runSim();
  // Shrink & retry until zero overlaps (keep relative share sizing)
  let guard = 0;
  while (countClusterOverlaps(nodes) > 0 && guard < 6) {
    guard++;
    sizeScale *= 0.9;
    nodes.forEach((d) => {
      const spread = clusterSpread(d.row, mobile) * sizeScale;
      d.spread = spread;
      d.outerRadius = outerRadius(spread, mobile);
    });
    runSim();
  }
  return nodes;
}

/** Irregular star cloud with rim stars so share-scaled radius reads clearly. */
function buildStars(anchor, nStars, spread, share, rand) {
  const stars = [];
  const cx = anchor.x;
  const cy = anchor.y;
  const squash = 0.5 + rand() * 0.55;
  const tilt = rand() * Math.PI;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const clumps = [];
  const nClumps = 2 + (rand() < 0.5 ? 1 : 0);
  for (let c = 0; c < nClumps; c++) {
    const a = rand() * Math.PI * 2;
    const rr = spread * (0.12 + rand() * 0.48);
    clumps.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr * squash,
      w: 0.22 + rand() * 0.4,
    });
  }

  const rimN = Math.max(2, Math.round(nStars * (0.24 + share * 0.28)));

  for (let i = 0; i < nStars; i++) {
    let x;
    let y;
    if (i < rimN) {
      const a = (i / rimN) * Math.PI * 2 + rand() * 0.45;
      const rr = spread * (0.78 + rand() * 0.22);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    } else if (rand() < 0.55) {
      const cl = clumps[Math.floor(rand() * clumps.length)];
      const a = rand() * Math.PI * 2;
      const rr = spread * cl.w * (0.2 + rand() * 0.9);
      x = cl.x + Math.cos(a) * rr;
      y = cl.y + Math.sin(a) * rr * (0.6 + rand() * 0.55);
    } else {
      const a = rand() * Math.PI * 2;
      const rr = spread * (0.25 + rand() * 0.7);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    }
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 0.01;
    const maxR = spread * 1.02;
    if (d > maxR) {
      x = cx + (dx / d) * maxR;
      y = cy + (dy / d) * maxR;
    }
    stars.push({
      x,
      y,
      anchor: rand() < 0.12 + share * 0.45,
    });
  }

  if (share >= 0.35 && !stars.some((s) => s.anchor)) stars[0].anchor = true;
  const wantAnchors = Math.max(1, Math.round(1 + share * 5));
  let have = stars.filter((s) => s.anchor).length;
  for (let i = 0; have < wantAnchors && i < stars.length; i++) {
    if (!stars[i].anchor) {
      stars[i].anchor = true;
      have++;
    }
  }
  return stars;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = filtered();
  const w = Math.max(320, mount.clientWidth || 640);
  const mobile = w < 560;
  const h = mobile ? 560 : 640;
  const pad = 12;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night starfield of creator constellations by declared country")
    .style("overflow", "visible");

  const defs = svg.append("defs");

  // Clean deep midnight indigo fill (colour never mixes to paper grey)
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "55%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#1a2642");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", "#11182b");

  // Ultra-smooth alpha mask — dissolves before SVG edges (no oval ring / grey box)
  const feather = defs
    .append("radialGradient")
    .attr("id", "creators-sky-feather-grad")
    .attr("cx", "50%")
    .attr("cy", "50%")
    .attr("r", "46%");
  feather.append("stop").attr("offset", "0%").attr("stop-color", "#ffffff");
  feather.append("stop").attr("offset", "36%").attr("stop-color", "#ffffff");
  feather.append("stop").attr("offset", "56%").attr("stop-color", "#b8b8b8");
  feather.append("stop").attr("offset", "74%").attr("stop-color", "#555555");
  feather.append("stop").attr("offset", "88%").attr("stop-color", "#181818");
  feather.append("stop").attr("offset", "98%").attr("stop-color", "#000000");
  feather.append("stop").attr("offset", "100%").attr("stop-color", "#000000");

  const maskBlur = defs
    .append("filter")
    .attr("id", "creators-mask-blur")
    .attr("x", "-20%")
    .attr("y", "-20%")
    .attr("width", "140%")
    .attr("height", "140%");
  maskBlur.append("feGaussianBlur").attr("stdDeviation", 12).attr("result", "blur");

  const mask = defs
    .append("mask")
    .attr("id", "creators-sky-feather")
    .attr("maskUnits", "userSpaceOnUse");
  mask
    .append("rect")
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "#000");
  mask
    .append("circle")
    .attr("cx", w * 0.5)
    .attr("cy", h * 0.5)
    .attr("r", Math.min(w, h) * 0.62)
    .attr("fill", "url(#creators-sky-feather-grad)")
    .attr("filter", "url(#creators-mask-blur)");

  const glow = defs
    .append("filter")
    .attr("id", "star-glow")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%");
  glow.append("feGaussianBlur").attr("stdDeviation", 1.5).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  const sky = svg
    .append("g")
    .attr("class", "starfield-sky")
    .attr("mask", "url(#creators-sky-feather)");

  sky
    .append("rect")
    .attr("class", "starfield-canvas")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "url(#creators-midnight-sky)");

  const g = sky.append("g").attr("transform", `translate(${pad},${pad})`);
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const cx0 = iw * 0.5;
  const cy0 = ih * 0.5;
  // Fade envelope for field stars (matches mask radius roughly)
  const fadeR = Math.min(iw, ih) * 0.48;

  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  let fieldDrawn = 0;
  let attempts = 0;
  while (fieldDrawn < 240 && attempts < 900) {
    attempts++;
    // Bias toward center so stars sit in the opaque sky
    const ang = fieldRand() * Math.PI * 2;
    const rad = fadeR * Math.pow(fieldRand(), 0.55) * 0.98;
    const fx = cx0 + Math.cos(ang) * rad;
    const fy = cy0 + Math.sin(ang) * rad * (0.85 + fieldRand() * 0.3);
    const dist = Math.hypot(fx - cx0, fy - cy0) / fadeR;
    const edgeFade = dist < 0.5 ? 1 : dist > 1 ? 0 : 1 - (dist - 0.5) / 0.5;
    if (edgeFade <= 0.04) continue;
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fx)
      .attr("cy", fy)
      .attr("r", 0.35 + fieldRand() * 1.15)
      .attr("fill", "#e8ecf5")
      .attr("opacity", (0.12 + fieldRand() * 0.38) * edgeFade);
    fieldDrawn++;
  }

  [
    { cx: iw * 0.36, cy: ih * 0.52, r: Math.min(iw, ih) * 0.42 },
    { cx: iw * 0.66, cy: ih * 0.4, r: Math.min(iw, ih) * 0.3 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.7)
      .attr("opacity", 0.06)
      .attr("stroke-dasharray", i === 0 ? "2 12" : "1 15");
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
    const share = shareOf(row);
    const spread = anchor.spread;
    const nStars = Math.round(6 + Math.min(26, Math.sqrt(nCh) * 0.95) + share * 10);
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars-v5`));
    const stars = buildStars(anchor, nStars, spread, share, rand);

    const hitCx = anchor.x;
    const hitCy = anchor.y;
    const hitR = Math.max(spread * 1.08, spread + (mobile ? 2 : 3));

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
      .attr("data-outer", anchor.outerRadius)
      .style("outline", "none")
      .style("cursor", "pointer");

    cg.append("circle")
      .attr("class", "constellation-hit")
      .attr("cx", hitCx)
      .attr("cy", hitCy)
      .attr("r", hitR)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("pointer-events", "all");

    // Collision probe (for tests): exact outer radius used by forceCollide
    cg.append("circle")
      .attr("class", "constellation-bounds")
      .attr("cx", hitCx)
      .attr("cy", hitCy)
      .attr("r", anchor.outerRadius)
      .attr("fill", "none")
      .attr("stroke", "none")
      .attr("pointer-events", "none");

    constellationEdges(stars, rand).forEach(([i, j]) => {
      cg.append("line")
        .attr("class", "constellation-link")
        .attr("x1", stars[i].x)
        .attr("y1", stars[i].y)
        .attr("x2", stars[j].x)
        .attr("y2", stars[j].y)
        .attr("stroke", color)
        .attr("stroke-width", 0.75)
        .attr("opacity", 0.45)
        .attr("pointer-events", "none");
    });

    stars.forEach((s) => {
      const isAnchor = s.anchor;
      const glowBoost = 0.35 + share * 0.55;
      cg.append("circle")
        .attr("class", isAnchor ? "constellation-star anchor-star" : "constellation-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", isAnchor ? 1.7 + share * 2.4 : 0.85 + rand() * 0.55)
        .attr("fill", color)
        .attr("opacity", isAnchor ? Math.min(0.96, 0.5 + glowBoost * 0.45) : 0.38 + rand() * 0.28)
        .attr("filter", isAnchor ? "url(#star-glow)" : null)
        .attr("pointer-events", "none");
    });

    const label =
      pct != null
        ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%`
        : code === "UNKNOWN"
          ? "unknown"
          : code;
    // Label sits just under the star envelope, inside the collide radius
    const labelY = Math.min(ih * 0.82, hitCy + spread * 0.92 + 14);
    const labelX = Math.max(iw * 0.18, Math.min(iw * 0.82, hitCx));
    cg.append("text")
      .attr("class", "constellation-label")
      .attr("x", labelX)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 11)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.92)
      .attr("pointer-events", "none")
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
      cg.attr("opacity", on ? 1 : 0.22);
      cg.selectAll(".constellation-link").attr("opacity", on ? 0.78 : 0.16);
      cg.selectAll(".anchor-star").attr("opacity", on ? 1 : 0.28);
      cg.selectAll(".constellation-label").attr("opacity", on ? 0.95 : 0.35);
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
