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
/** Page canvas — soft edge of the sky blends into this. */
const PAGE_BG = "#fdfcfa";

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
      // occasionally skip nearest for a more broken star-chart look
      const pick = n === 0 && rand() < 0.22 && dist.length > 2 ? dist[1 + Math.floor(rand() * Math.min(2, dist.length - 1))] : dist[n];
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
 * Cluster radius driven mainly by top-5% share (percentage),
 * with a lighter n_channels contribution so dense markets still feel full.
 */
function clusterSpread(row, mobile) {
  const share = shareOf(row);
  const nCh = row.n_channels || 30;
  // Share dominates size (TW ~50% clearly larger than DE ~23%); channels are a light dense-fill term.
  const shareTerm = (mobile ? 58 : 78) * Math.pow(Math.max(0.18, share) / 0.5, 1.35);
  const channelTerm = Math.sqrt(nCh) * (mobile ? 0.35 : 0.45);
  return (mobile ? 16 : 20) + shareTerm + channelTerm;
}

/** Organic, asymmetric anchors — deliberately non-grid / non-spiral. */
function placeAnchors(rows, iw, ih, mobile) {
  const rand = mulberry32(hashSeed(`sky-anchors-${ctx.rule}-${rows.length}-v2`));
  // Precompute spreads so collision radii track share-driven size
  const nodes = rows.map((r, i) => {
    const spread = clusterSpread(r, mobile);
    // Scattered seed: jittered columns + strong y noise (not a lattice)
    const col = (i * 0.6180339887) % 1;
    const band = Math.floor(i / 3) / Math.max(1, Math.ceil(rows.length / 3));
    let x = iw * (0.12 + col * 0.76 + (rand() - 0.5) * 0.2);
    let y = ih * (0.16 + band * 0.62 + (rand() - 0.5) * 0.28);
    // Push a few outliers into corners / mid gaps
    if (rand() < 0.28) {
      x = iw * (rand() < 0.5 ? 0.1 + rand() * 0.22 : 0.68 + rand() * 0.22);
      y = ih * (0.14 + rand() * 0.72);
    }
    x = Math.max(iw * 0.1, Math.min(iw * 0.9, x));
    y = Math.max(ih * 0.12, Math.min(ih * 0.86, y));
    return { row: r, x, y, r: spread + (mobile ? 14 : 18), spread };
  });

  // Soft separation — fewer iterations so clusters stay uneven
  for (let iter = 0; iter < 36; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        const minD = (a.r + b.r) * 0.92;
        if (dist < minD) {
          const push = ((minD - dist) / dist) * 0.42;
          dx *= push;
          dy *= push;
          a.x -= dx;
          a.y -= dy;
          b.x += dx;
          b.y += dy;
        }
      }
      nodes[i].x = Math.max(iw * 0.09, Math.min(iw * 0.91, nodes[i].x));
      nodes[i].y = Math.max(ih * 0.11, Math.min(ih * 0.88, nodes[i].y));
    }
  }
  return nodes;
}

/** Irregular star cloud: clumpy, elliptical, with a few outliers. */
function buildStars(anchor, nStars, spread, share, rand) {
  const stars = [];
  const cx = anchor.x;
  const cy = anchor.y;
  const squash = 0.55 + rand() * 0.5;
  const tilt = rand() * Math.PI;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  // 2–3 denser clumps inside the constellation
  const clumps = [];
  const nClumps = 2 + (rand() < 0.45 ? 1 : 0);
  for (let c = 0; c < nClumps; c++) {
    const a = rand() * Math.PI * 2;
    const rr = spread * (0.15 + rand() * 0.55);
    clumps.push({
      x: cx + Math.cos(a) * rr * (0.7 + rand() * 0.5),
      y: cy + Math.sin(a) * rr * squash,
      w: 0.25 + rand() * 0.45,
    });
  }

  for (let i = 0; i < nStars; i++) {
    const useClump = rand() < 0.62;
    let x;
    let y;
    if (useClump) {
      const cl = clumps[Math.floor(rand() * clumps.length)];
      const a = rand() * Math.PI * 2;
      const rr = spread * cl.w * (0.15 + rand() * 0.95);
      x = cl.x + Math.cos(a) * rr;
      y = cl.y + Math.sin(a) * rr * (0.65 + rand() * 0.5);
    } else {
      // elongated stray arm
      const a = rand() * Math.PI * 2;
      const rr = spread * (0.35 + rand() * 0.95);
      const lx = Math.cos(a) * rr;
      const ly = Math.sin(a) * rr * squash;
      x = cx + lx * cosT - ly * sinT;
      y = cy + lx * sinT + ly * cosT;
    }
    // rare short stray — keep within the share-scaled envelope
    if (rand() < 0.08) {
      x += (rand() - 0.5) * spread * 0.35;
      y += (rand() - 0.5) * spread * 0.28;
    }
    // soft clamp so cluster radius tracks share
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy) || 0.01;
    const maxR = spread * 1.05;
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
  // Higher share → more bright cores
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
  const h = mobile ? 480 : 540;
  const pad = 8;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night starfield of creator constellations by declared country");

  const defs = svg.append("defs");

  // Sky that eases from midnight core → dusk → page ivory at the rim
  const skyGrad = defs
    .append("radialGradient")
    .attr("id", "creators-midnight-sky")
    .attr("cx", "48%")
    .attr("cy", "42%")
    .attr("r", "72%");
  skyGrad.append("stop").attr("offset", "0%").attr("stop-color", "#1a2544");
  skyGrad.append("stop").attr("offset", "42%").attr("stop-color", "#121a30");
  skyGrad.append("stop").attr("offset", "68%").attr("stop-color", "#1c2438");
  skyGrad.append("stop").attr("offset", "84%").attr("stop-color", "#5c5f6a");
  skyGrad.append("stop").attr("offset", "93%").attr("stop-color", "#c5c2ba");
  skyGrad.append("stop").attr("offset", "100%").attr("stop-color", PAGE_BG);

  // Soft feather so the hard rect edge never punches the light page
  const feather = defs
    .append("radialGradient")
    .attr("id", "creators-sky-feather-grad")
    .attr("cx", "50%")
    .attr("cy", "48%")
    .attr("r", "72%");
  feather.append("stop").attr("offset", "0%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "78%").attr("stop-color", "#fff").attr("stop-opacity", 1);
  feather.append("stop").attr("offset", "92%").attr("stop-color", "#fff").attr("stop-opacity", 0.55);
  feather.append("stop").attr("offset", "100%").attr("stop-color", "#fff").attr("stop-opacity", 0);
  defs
    .append("mask")
    .attr("id", "creators-sky-feather")
    .attr("maskUnits", "userSpaceOnUse")
    .append("rect")
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "url(#creators-sky-feather-grad)");

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

  const sky = svg.append("g").attr("class", "starfield-sky").attr("mask", "url(#creators-sky-feather)");

  sky
    .append("rect")
    .attr("class", "starfield-canvas")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "url(#creators-midnight-sky)");

  // Hairline dusk rim (low contrast vs page) instead of a hard navy box
  svg
    .append("rect")
    .attr("x", 0.5)
    .attr("y", 0.5)
    .attr("width", w - 1)
    .attr("height", h - 1)
    .attr("rx", 6)
    .attr("ry", 6)
    .attr("fill", "none")
    .attr("stroke", "#b8b4ab")
    .attr("stroke-width", 1)
    .attr("opacity", 0.45);

  const g = sky.append("g").attr("transform", `translate(${pad},${pad})`);
  const iw = w - pad * 2;
  const ih = h - pad * 2;

  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(ctx.rule));
  const fieldN = 260;
  for (let i = 0; i < fieldN; i++) {
    g.append("circle")
      .attr("class", "field-star")
      .attr("cx", fieldRand() * iw)
      .attr("cy", fieldRand() * ih)
      .attr("r", 0.35 + fieldRand() * 1.15)
      .attr("fill", "#e8ecf5")
      .attr("opacity", 0.1 + fieldRand() * 0.4);
  }

  [
    { cx: iw * 0.32, cy: ih * 0.58, r: Math.min(iw, ih) * 0.58 },
    { cx: iw * 0.74, cy: ih * 0.36, r: Math.min(iw, ih) * 0.4 },
  ].forEach((arc, i) => {
    g.append("circle")
      .attr("class", "celestial-arc")
      .attr("cx", arc.cx)
      .attr("cy", arc.cy)
      .attr("r", arc.r)
      .attr("fill", "none")
      .attr("stroke", "#e8ecf5")
      .attr("stroke-width", 0.7)
      .attr("opacity", 0.07)
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
    // Star count: channels set the floor; higher share densifies a bit
    const nStars = Math.round(6 + Math.min(26, Math.sqrt(nCh) * 0.95) + share * 10);
    const rand = mulberry32(hashSeed(`${ctx.rule}-${code}-stars-v2`));
    const stars = buildStars(anchor, nStars, spread, share, rand);

    const xs = stars.map((s) => s.x);
    const ys = stars.map((s) => s.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const hitCx = (minX + maxX) / 2;
    const hitCy = (minY + maxY) / 2;
    // Hit disc tracks share-scaled spread so the whole neighbourhood is hot
    const hitR = spread + (mobile ? 16 : 20);

    const cg = constellations
      .append("g")
      .attr("class", `constellation c-${code}`)
      .attr("tabindex", 0)
      .style("outline", "none")
      .style("cursor", "pointer");

    // Invisible hit disc — hover anywhere in the constellation neighbourhood
    cg.append("circle")
      .attr("class", "constellation-hit")
      .attr("cx", hitCx)
      .attr("cy", hitCy)
      .attr("r", hitR)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("pointer-events", "all");

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
        .attr("r", isAnchor ? 1.7 + share * 2.2 : 0.85 + rand() * 0.55)
        .attr("fill", color)
        .attr("opacity", isAnchor ? Math.min(0.96, 0.5 + glowBoost * 0.45) : 0.38 + rand() * 0.28)
        .attr("filter", isAnchor ? "url(#star-glow)" : null)
        .attr("pointer-events", "none");
    });

    const labelY = Math.min(ih - 4, maxY + 16);
    const label = pct != null ? `${code === "UNKNOWN" ? "unknown" : code} ${pct}%` : code;
    cg.append("text")
      .attr("class", "constellation-label")
      .attr("x", hitCx)
      .attr("y", labelY)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 11)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.9)
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
