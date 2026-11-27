/* Creators · declared country — star-cluster density field.
 *
 * Cluster AREA ∝ top-5% share; uniform core density, soft feathered edges.
 * Named countries only (title_only); no Rule toggle.
 */
import { attachTableToggle, clear, fmt, setCaveat } from "../charts/util.js?v=20261126x";
import { onSceneEnter } from "../charts/entrance.js?v=20261127b";
import { themeColors } from "../theme.js?v=20261126x";
import { reviewLabel } from "./review.js?v=20261126x";

/** Harmonious starlight tints for named countries. */
const PALETTE = [
  "#e8b86d", // warm gold
  "#7ec8d8", // ice cyan
  "#c4a8e8", // soft lavender
  "#8fcdb0", // pale emerald
  "#e89a8a", // coral
  "#9eb6d4", // silver-blue
  "#d4a574",
  "#86c4c9",
  "#b8a0d8",
  "#a8c686",
];

/** Share → cluster radius. Same proportion as before, drawn larger on the full stage. */
const R_LO = 48;
const R_HI = 124;
const SHARE_LO = 0.23;
const SHARE_HI = 0.5;
const STARS_PER_PX2 = 0.032;
const COLLIDE_PAD = 28;
const LABEL_GAP = 14;
const RULE = "title_only";

let ctx = null;
let resizeBound = false;

export function render(container, data) {
  clear(container);
  const payload = data.creators || data;
  const meta = payload.meta || {};
  const rows = payload.rows || [];
  const caveatEl = data.caveatEl;

  const wrap = d3.select(container);
  if (!reviewLabel(meta).ok) return;
  void caveatEl;

  ctx = { rows, meta };
  // No Rule toggle — title_only is the fixed view for general readers.

  const tableApi = attachTableToggle(wrap.node(), () => tableRows(), { buttons: false });
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

/** Named countries for the starfield (≥30 channels; excludes unknown). */
function visualRows() {
  return ctx.rows
    .filter((r) => r.rule === RULE)
    .filter((r) => String(r.country || "").toLowerCase() !== "unknown")
    .slice()
    .sort((a, b) => (b.n_channels || 0) - (a.n_channels || 0));
}

/** Table includes unknown so readers can still inspect it. */
function tableRows() {
  const named = visualRows();
  const unknown = ctx.rows.filter(
    (r) => r.rule === RULE && String(r.country || "").toLowerCase() === "unknown"
  );
  const rows = [...named, ...unknown];
  return {
    columns: ["country", "n_channels", "n_videos", "top5pct_channels", "share_top5pct"],
    rows: rows.map((r) => [
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

/** Low-discrepancy Halton sequence for balanced 2D scatter. */
function halton(index, base) {
  let f = 1;
  let r = 0;
  let i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}

function countryColor(code, index) {
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

function clusterRadius(row) {
  const share = shareOf(row);
  const t = Math.max(0, Math.min(1, (share - SHARE_LO) / (SHARE_HI - SHARE_LO)));
  const u = Math.pow(t, 0.92);
  return R_LO + u * (R_HI - R_LO);
}

function countOverlaps(nodes) {
  let n = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const need = a.R + b.R + COLLIDE_PAD * 2;
      if (Math.hypot(a.x - b.x, a.y - b.y) < need - 0.5) n++;
    }
  }
  return n;
}

function canvasFor(rows, mobile) {
  const radii = rows.map((r) => clusterRadius(r));
  const area = radii.reduce((s, R) => s + Math.PI * (R + COLLIDE_PAD) ** 2, 0);
  const needSide = Math.sqrt(area / 0.48);
  const layoutFrac = 0.56; // 22–78% band
  let side = Math.ceil(needSide / layoutFrac + 48);
  side = Math.max(side, mobile ? 720 : 1280);
  const w = mobile ? Math.max(640, Math.round(side * 0.78)) : Math.max(1080, side);
  const h = mobile ? Math.max(860, Math.round(side * 1.05)) : Math.max(920, Math.round(side * 0.82));
  return { w, h };
}

/**
 * Jittered Halton scatter across full dark core [0.22–0.78], then forceCollide.
 */
function placeClusters(rows, iw, ih) {
  const rand = mulberry32(hashSeed(`cluster-halton-${RULE}-${rows.length}-v2`));
  const x0 = iw * 0.22;
  const x1 = iw * 0.78;
  const y0 = ih * 0.22;
  const y1 = ih * 0.78;

  const nodes = rows.map((r, i) => {
    const R = clusterRadius(r);
    // Halton bases 2 & 3; skip index 0; light jitter so it stays organic
    const hx = halton(i + 1, 2);
    const hy = halton(i + 1, 3);
    let x = x0 + hx * (x1 - x0) + (rand() - 0.5) * iw * 0.05;
    let y = y0 + hy * (y1 - y0) + (rand() - 0.5) * ih * 0.05;
    return { row: r, x, y, R };
  });

  function clamp() {
    nodes.forEach((d) => {
      const m = d.R * 0.4 + 10;
      d.x = Math.max(x0 + m, Math.min(x1 - m, d.x));
      d.y = Math.max(y0 + m, Math.min(y1 - m, d.y));
    });
  }

  function separate() {
    for (let iter = 0; iter < 200; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy) || 0.01;
          const minD = a.R + b.R + COLLIDE_PAD * 2;
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
      clamp();
    }
  }

  const sim = d3
    .forceSimulation(nodes)
    .force(
      "collide",
      d3
        .forceCollide((d) => d.R + COLLIDE_PAD)
        .iterations(4)
        .strength(1)
    )
    .stop();
  for (let i = 0; i < 320; i++) {
    sim.tick();
    clamp();
  }
  separate();
  clamp();

  let guard = 0;
  while (countOverlaps(nodes) > 0 && guard < 10) {
    guard++;
    nodes.forEach((d) => {
      d.x += (rand() - 0.5) * 32;
      d.y += (rand() - 0.5) * 32;
    });
    separate();
    clamp();
  }
  return nodes;
}

/**
 * Organic star cloud: ~75% dense core, ~25% soft outer feather (R·0.75–1.22).
 */
function buildClusterStars(cx, cy, R, rand) {
  const area = Math.PI * R * R;
  const n = Math.max(40, Math.round(area * STARS_PER_PX2));
  const nCore = Math.round(n * 0.75);
  const nFeather = n - nCore;
  const stars = [];

  for (let i = 0; i < nCore; i++) {
    const a = rand() * Math.PI * 2;
    const rr = R * 0.75 * Math.pow(rand(), 0.55);
    const bright = rand() < 0.08;
    stars.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr,
      bright,
      r: bright ? 1.15 + rand() * 1.35 : 0.35 + rand() * 0.7,
      op: bright ? 0.72 + rand() * 0.26 : 0.32 + rand() * 0.4,
    });
  }

  for (let i = 0; i < nFeather; i++) {
    const a = rand() * Math.PI * 2;
    const t = rand();
    const rr = R * (0.75 + t * 0.47); // 0.75 → 1.22
    const fade = 1 - t; // outer stars dimmer
    const bright = rand() < 0.04;
    stars.push({
      x: cx + Math.cos(a) * rr,
      y: cy + Math.sin(a) * rr,
      bright,
      r: bright ? 0.9 + rand() * 0.9 : 0.3 + rand() * 0.55,
      op: (bright ? 0.45 + rand() * 0.25 : 0.1 + rand() * 0.28) * (0.35 + fade * 0.65),
    });
  }
  return stars;
}

function resolveLabelPositions(items, iw, ih) {
  const x0 = iw * 0.22;
  const x1 = iw * 0.78;
  const y0 = ih * 0.22;
  const y1 = ih * 0.78;
  const lw = 58;
  const lh = 14;
  const labels = items.map((it) => ({
    ...it,
    lx: Math.max(x0 + 20, Math.min(x1 - 20, it.cx)),
    ly: Math.max(y0 + 12, Math.min(y1 - 6, it.preferY)),
  }));

  for (let iter = 0; iter < 55; iter++) {
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const dx = b.lx - a.lx;
        const dy = b.ly - a.ly;
        const ox = lw - Math.abs(dx);
        const oy = lh - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (Math.abs(dy) >= Math.abs(dx)) {
            const s = (oy / 2) * 0.55 * (dy === 0 ? (i % 2 ? 1 : -1) : Math.sign(dy));
            a.ly -= s;
            b.ly += s;
          } else {
            const s = (ox / 2) * 0.55 * (dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx));
            a.lx -= s;
            b.lx += s;
          }
        }
      }
      const it = labels[i];
      it.lx = Math.max(x0 + 16, Math.min(x1 - 16, it.lx));
      it.ly = Math.max(y0 + 12, Math.min(y1 - 4, it.ly));
      const mdx = it.lx - it.cx;
      const mdy = it.ly - it.cy;
      const md = Math.hypot(mdx, mdy);
      const maxLeash = it.R + 34;
      if (md > maxLeash) {
        it.lx = it.cx + (mdx / md) * maxLeash;
        it.ly = it.cy + (mdy / md) * maxLeash;
      }
    }
  }
  return labels;
}

function draw() {
  const mount = ctx.mount;
  clear(mount);
  const rows = visualRows();
  const mobile = (typeof window !== "undefined" ? window.innerWidth : 1000) < 700;
  const { w, h } = canvasFor(rows, mobile);
  const pad = 12;

  const svg = d3
    .select(mount)
    .append("svg")
    .attr("class", "creators-starfield")
    .attr("viewBox", `0 0 ${w} ${h}`)
    .attr("width", "100%")
    .attr("role", "img")
    .attr("aria-label", "Deep-night star-cluster density field by declared country")
    .style("overflow", "visible")
    .style("display", "block");

  const defs = svg.append("defs");

  const glow = defs
    .append("filter")
    .attr("id", "star-glow")
    .attr("x", "-80%")
    .attr("y", "-80%")
    .attr("width", "260%")
    .attr("height", "260%");
  glow.append("feGaussianBlur").attr("stdDeviation", 1.2).attr("result", "b");
  const merge = glow.append("feMerge");
  merge.append("feMergeNode").attr("in", "b");
  merge.append("feMergeNode").attr("in", "SourceGraphic");

  const sky = svg.append("g").attr("class", "starfield-sky");

  sky
    .append("rect")
    .attr("class", "starfield-canvas")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", w)
    .attr("height", h)
    .attr("fill", "none");

  const g = sky.append("g").attr("transform", `translate(${pad},${pad})`);
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  const cx0 = iw * 0.5;
  const cy0 = ih * 0.48;
  const solidR = Math.min(iw, ih) * 0.66;

  const field = g.append("g").attr("class", "field-stars").attr("pointer-events", "none");
  const fieldRand = mulberry32(0xc0ffee ^ hashSeed(RULE));
  let drawn = 0;
  let tries = 0;
  while (drawn < 1200 && tries < 6000) {
    tries++;
    const fx = fieldRand() * iw;
    const fy = fieldRand() * ih;
    const dist = Math.hypot(fx - cx0, fy - cy0) / solidR;
    const fade = dist < 0.95 ? 1 : dist > 1.45 ? 0 : 1 - (dist - 0.95) / 0.5;
    if (fade < 0.05) continue;
    field
      .append("circle")
      .attr("class", "field-star")
      .attr("cx", fx)
      .attr("cy", fy)
      .attr("r", 0.35 + fieldRand() * 0.65)
      .attr("fill", "#e8ecf5")
      .attr("opacity", (0.12 + fieldRand() * 0.28) * fade);
    drawn++;
  }

  const anchors = placeClusters(rows, iw, ih);
  const clusters = g.append("g").attr("class", "star-clusters");
  const groups = [];
  const labelItems = [];

  anchors.forEach((anchor, idx) => {
    const row = anchor.row;
    const code = String(row.country || "").toUpperCase();
    const color = countryColor(row.country, idx);
    const pct = sharePct(row);
    const R = anchor.R;
    const rand = mulberry32(hashSeed(`${RULE}-${code}-cluster-v2`));
    const stars = buildClusterStars(anchor.x, anchor.y, R, rand);

    const cg = clusters
      .append("g")
      .attr("class", `star-cluster c-${code}`)
      .attr("tabindex", 0)
      .attr("data-share", pct != null ? String(pct) : "0")
      .attr("data-r", R.toFixed(1))
      .attr("data-x", anchor.x.toFixed(1))
      .attr("data-y", anchor.y.toFixed(1))
      .style("outline", "none")
      .style("cursor", "pointer");

    cg.append("circle")
      .attr("class", "cluster-hit")
      .attr("cx", anchor.x)
      .attr("cy", anchor.y)
      .attr("r", R * 1.15)
      .attr("fill", color)
      .attr("opacity", 0)
      .attr("pointer-events", "all");

    const starLayer = cg.append("g").attr("class", "cluster-stars").attr("pointer-events", "none");
    stars.forEach((s) => {
      starLayer
        .append("circle")
        .attr("class", s.bright ? "cluster-star bright-star" : "cluster-star")
        .attr("cx", s.x)
        .attr("cy", s.y)
        .attr("r", s.r)
        .attr("fill", color)
        .attr("opacity", s.op)
        .attr("filter", s.bright ? "url(#star-glow)" : null);
    });

    const label = pct != null ? `${code} ${pct}%` : code;

    labelItems.push({
      cg,
      label,
      cx: anchor.x,
      cy: anchor.y,
      R,
      preferY: anchor.y + R * 0.78 + LABEL_GAP,
      tip:
        `${row.country}: ${row.n_channels} channels, ${row.n_videos} videos` +
        (pct != null ? `, top 5% share ${pct}%` : ""),
    });
    groups.push(cg);
  });

  const placed = resolveLabelPositions(labelItems, iw, ih);
  placed.forEach((item) => {
    item.cg
      .append("text")
      .attr("class", "cluster-label")
      .attr("x", item.lx)
      .attr("y", item.ly)
      .attr("text-anchor", "middle")
      .attr("font-size", mobile ? 10 : 12)
      .attr("font-family", 'Georgia, "Times New Roman", serif')
      .attr("letter-spacing", "0.04em")
      .attr("fill", "#eef1f7")
      .attr("opacity", 0.94)
      .attr("pointer-events", "none")
      .text(item.label);
    item.cg.append("title").text(item.tip);
  });

  function setFocus(active) {
    groups.forEach((cg) => {
      const on = !active || cg.node() === active;
      cg.attr("opacity", on ? 1 : 0.22);
      cg.selectAll(".bright-star").attr("opacity", on ? 0.95 : 0.25);
      cg.selectAll(".cluster-star:not(.bright-star)").attr("opacity", on ? null : 0.18);
      cg.selectAll(".cluster-label").attr("opacity", on ? 0.96 : 0.3);
    });
  }

  function holdShimmer() {
    mount._hovering = true;
    if (mount._shimmer) mount._shimmer.pause();
    if (window.gsap) window.gsap.set(mount.querySelectorAll(".bright-star"), { clearProps: "opacity" });
  }
  function releaseShimmer() {
    mount._hovering = false;
    if (mount.dataset.entrance === "done" && mount._shimmer && !document.hidden) mount._shimmer.resume();
  }

  groups.forEach((cg) => {
    cg.on("pointerenter", function () {
      holdShimmer();
      setFocus(this);
    })
      .on("pointerleave", () => {
        setFocus(null);
        releaseShimmer();
      })
      .on("focus", function () {
        holdShimmer();
        setFocus(this);
      })
      .on("blur", () => {
        setFocus(null);
        releaseShimmer();
      });
  });

  armClusterEntrance(mount, field.node(), pad);
}

function stopShimmer(mount) {
  if (mount._onShimmerVis) {
    document.removeEventListener("visibilitychange", mount._onShimmerVis);
    mount._onShimmerVis = null;
  }
  if (mount._shimmer) {
    mount._shimmer.kill();
    mount._shimmer = null;
  }
}

function startShimmer(mount) {
  stopShimmer(mount);
  const gsap = window.gsap;
  if (!gsap) return;
  const stars = [...mount.querySelectorAll(".bright-star")]
    .sort((a, b) => +b.getAttribute("r") - +a.getAttribute("r"))
    .slice(0, 8);
  if (!stars.length) return;
  const tween = gsap.to(stars, {
    opacity: 0.42,
    duration: 1.7,
    yoyo: true,
    repeat: -1,
    ease: "sine.inOut",
    stagger: { each: 0.22, repeat: -1 },
  });
  mount._shimmer = tween;
  if (document.hidden || mount._hovering) tween.pause();
  mount._onShimmerVis = () => {
    if (!mount._shimmer) return;
    if (document.hidden || mount._hovering) mount._shimmer.pause();
    else mount._shimmer.resume();
  };
  document.addEventListener("visibilitychange", mount._onShimmerVis);
}

function armClusterEntrance(mount, field, pad) {
  stopShimmer(mount);
  if (mount.dataset.entrance === "done") {
    startShimmer(mount);
    return;
  }
  const nodes = [...mount.querySelectorAll(".star-cluster")].sort(
    (a, b) => (+b.getAttribute("data-share") || 0) - (+a.getAttribute("data-share") || 0)
  );
  const gsap = window.gsap;
  if (gsap) {
    gsap.set(field, { opacity: 0 });
    nodes.forEach((node) => {
      const stars = node.querySelector(".cluster-stars");
      const label = node.querySelector(".cluster-label");
      const x = pad + (+node.getAttribute("data-x") || 0);
      const y = pad + (+node.getAttribute("data-y") || 0);
      if (stars) gsap.set(stars, { opacity: 0, scale: 0.88, svgOrigin: `${x} ${y}` });
      if (label) gsap.set(label, { opacity: 0 });
    });
  }
  const played = onSceneEnter(mount, (tween) => {
    mount.dataset.entrance = "done";
    tween.to(field, { opacity: 1, duration: 0.4, ease: "power1.out", clearProps: "opacity" });
    nodes.forEach((node, i) => {
      const stars = node.querySelector(".cluster-stars");
      const label = node.querySelector(".cluster-label");
      const x = pad + (+node.getAttribute("data-x") || 0);
      const y = pad + (+node.getAttribute("data-y") || 0);
      if (stars) {
        tween.to(stars, {
          opacity: 1,
          scale: 1,
          svgOrigin: `${x} ${y}`,
          duration: 0.48,
          delay: i * 0.18,
          ease: "power2.out",
          clearProps: "opacity,transform,scale",
        });
      }
      if (label) {
        tween.to(label, {
          opacity: 0.94,
          duration: 0.32,
          delay: i * 0.18 + 0.08,
          ease: "power1.out",
          clearProps: "opacity",
        });
      }
    });
    tween.delayedCall(nodes.length * 0.18 + 0.55, () => startShimmer(mount));
  });
  if (!played && gsap) {
    gsap.set(field, { clearProps: "opacity" });
    nodes.forEach((node) => {
      const stars = node.querySelector(".cluster-stars");
      const label = node.querySelector(".cluster-label");
      if (stars) gsap.set(stars, { clearProps: "opacity,transform,scale" });
      if (label) gsap.set(label, { clearProps: "opacity" });
    });
    mount.dataset.entrance = "done";
  }
}

export function update() {
  if (ctx?.mount) draw();
}
