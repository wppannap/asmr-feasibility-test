/* Night Windows. Flags derived from bedroom_filter_20.json. No buttons. */
const SVG_NS = "http://www.w3.org/2000/svg";

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function mix(a, b, t) {
  const k = clamp(t);
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const pa = parse(a);
  const pb = parse(b);
  return "rgb(" + pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(",") + ")";
}

function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/* warmth > 0 matches the spectrum chart, which paints warmth < 0 as cool (17/20).
   dim is video_lum < 75. locked is lum_span < 10. Both cuts are in the JSON caveats. */
function decorate(rows) {
  const warmMin = Math.min(...rows.map((r) => r.warmth));
  const warmMax = Math.max(...rows.map((r) => r.warmth));
  const lumMin = Math.min(...rows.map((r) => r.video_lum));
  const lumMax = Math.max(...rows.map((r) => r.video_lum));
  const span = warmMax - warmMin || 1;
  const lumSpan = lumMax - lumMin || 1;
  return rows.map((row) => ({
    code: row.code,
    warmth: row.warmth,
    video_lum: row.video_lum,
    lum_span: row.lum_span,
    warm: row.warmth > 0,
    dim: row.video_lum < 75,
    locked: row.lum_span < 10,
    tone: (row.warmth - warmMin) / span,
    bright: (row.video_lum - lumMin) / lumSpan,
  }));
}

function bulb() {
  const g = el("g", { class: "nw-glyph" });
  g.appendChild(el("circle", { cx: 0, cy: -4, r: 7, fill: "none", stroke: "#f0a24a", "stroke-width": "1.4" }));
  g.appendChild(el("rect", { x: -3, y: 4, width: 6, height: 4, rx: 1, fill: "#f0a24a" }));
  return g;
}

function dimmer() {
  const g = el("g", { class: "nw-glyph" });
  g.appendChild(el("circle", { cx: 0, cy: 0, r: 7, fill: "none", stroke: "#9ecbff", "stroke-width": "1.4" }));
  g.appendChild(el("path", { d: "M0 -6.2 A6.2 6.2 0 0 0 0 6.2 Z", fill: "#9ecbff" }));
  return g;
}

function tripod() {
  const g = el("g", { class: "nw-glyph" });
  g.appendChild(el("path", {
    d: "M0 -6 L0 2 M0 2 L-7 10 M0 2 L7 10",
    fill: "none",
    stroke: "#f0ece3",
    "stroke-width": "1.4",
    "stroke-linecap": "round",
  }));
  return g;
}

export async function render(container) {
  if (!container) return;
  if (container._nwStop) container._nwStop();
  container.replaceChildren();
  container.classList.add("nw-stage");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const data = await d3.json("data/bedroom_filter_20.json?v=20261127m");
  const rows = decorate(data.rows);
  const n = rows.length;
  const nWarm = rows.filter((r) => r.warm).length;
  const nDim = rows.filter((r) => r.dim).length;
  const nLocked = rows.filter((r) => r.locked).length;
  const nKeep = rows.filter((r) => r.warm && r.dim && r.locked).length;

  const svg = el("svg", {
    class: "nw-svg",
    viewBox: "0 0 1100 700",
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Night windows filtered by warmth, dimness and a locked camera",
  });
  const sky = el("g", { class: "nw-sky" });
  for (let i = 0; i < 16; i += 1) {
    sky.appendChild(el("circle", {
      cx: (40 + hash(i) * 360).toFixed(1),
      cy: (30 + hash(i + 40) * 180).toFixed(1),
      r: (0.6 + hash(i + 7) * 1.1).toFixed(2),
      fill: "#f0ece3",
      "fill-opacity": "0.45",
    }));
  }
  sky.appendChild(el("path", {
    d: "M210 64 A34 34 0 1 0 210 132 A22 22 0 1 1 210 64",
    fill: "#f0ece3",
    "fill-opacity": "0.55",
  }));
  svg.appendChild(sky);

  const bldg = el("g", { class: "nw-bldg" });
  bldg.appendChild(el("path", {
    d: "M430 168 L500 78 L980 96 L1040 168 L1040 640 L430 640 Z",
    fill: "#12182a",
    stroke: "#232f4a",
    "stroke-width": "1.2",
  }));

  const wins = rows.map((row, i) => {
    const col = i % 4;
    const line = Math.floor(i / 4);
    const x = 500 + col * 125;
    const y = 200 + line * 84;
    const g = el("g", { class: "nw-win", transform: "translate(" + x + " " + y + ")" });
    g.dataset.code = row.code;
    const frame = el("g", { class: "nw-frame" });
    const glow = el("ellipse", {
      cx: 28, cy: 22, rx: (10 + 18 * row.bright).toFixed(1), ry: (8 + 12 * row.bright).toFixed(1),
      fill: mix("#9ecbff", "#f0a24a", row.tone),
      "fill-opacity": "0.35",
      filter: "url(#nw-blur)",
    });
    const glass = el("rect", {
      x: 8, y: 6, width: 40, height: 32, rx: 2,
      fill: mix("#9ecbff", "#f0a24a", row.tone),
    });
    const outer = el("rect", {
      x: 4, y: 2, width: 48, height: 40, rx: 2,
      fill: "none", stroke: "#f0ece3", "stroke-width": row.locked ? "1.6" : "1",
    });
    frame.append(glow, glass, outer);
    if (row.locked) {
      frame.appendChild(el("rect", {
        x: 1, y: -1, width: 54, height: 46, rx: 2,
        fill: "none", stroke: "#f0ece3", "stroke-width": "0.8", "stroke-opacity": "0.7",
      }));
      const pod = tripod();
      pod.setAttribute("transform", "translate(28 52) scale(0.7)");
      frame.appendChild(pod);
    }
    const ring = el("rect", {
      class: "nw-ring",
      x: -2, y: -4, width: 60, height: 52, rx: 3,
      fill: "none", stroke: "#f0ece3", "stroke-width": "1.2", opacity: "0",
    });
    g.append(frame, ring);
    bldg.appendChild(g);
    return { row, g, frame, glow, glass, ring };
  });
  svg.appendChild(bldg);

  const defs = el("defs");
  const blur = el("filter", { id: "nw-blur", x: "-50%", y: "-50%", width: "200%", height: "200%" });
  blur.appendChild(el("feGaussianBlur", { stdDeviation: "3.2" }));
  defs.appendChild(blur);
  svg.insertBefore(defs, svg.firstChild);

  const readouts = [
    { node: el("g", { transform: "translate(78 250)" }), glyph: bulb(), count: nWarm, from: 0.2 },
    { node: el("g", { transform: "translate(78 340)" }), glyph: dimmer(), count: nDim, from: 0.45 },
    { node: el("g", { transform: "translate(78 430)" }), glyph: tripod(), count: nLocked, from: 0.7 },
  ];
  readouts.forEach((item) => {
    item.glyph.setAttribute("transform", "translate(0 0)");
    const num = el("text", {
      x: 22, y: 5, fill: "#f0ece3", "font-size": "22", "font-family": "var(--font-ui)",
    });
    num.textContent = String(item.count);
    item.node.append(item.glyph, num);
    item.node.style.opacity = "0";
    item.num = num;
    svg.appendChild(item.node);
  });

  const finalNum = el("text", {
    x: 78, y: 560, fill: "#f0ece3", "font-size": "28", "font-family": "var(--font-ui)",
  });
  finalNum.textContent = nKeep + " / " + n;
  finalNum.style.opacity = "0";
  svg.appendChild(finalNum);

  const tip = document.createElement("div");
  tip.className = "nw-tip";
  tip.hidden = true;

  const table = document.createElement("table");
  table.className = "sr-only";
  const cap = document.createElement("caption");
  cap.textContent = "Night windows, twenty videos";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Video", "Warm", "Dim", "Locked"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  });
  head.appendChild(hr);
  const body = document.createElement("tbody");
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    [row.code, row.warm ? "yes" : "no", row.dim ? "yes" : "no", row.locked ? "yes" : "no"].forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.append(cap, head, body);
  container.append(svg, tip, table);

  function showTip(win, event) {
    const row = win.row;
    tip.replaceChildren();
    const name = document.createElement("p");
    name.className = "nw-tip-id";
    name.textContent = row.code;
    const flags = document.createElement("p");
    flags.className = "nw-tip-flags";
    flags.textContent = (row.warm ? "●" : "○") + "  " + (row.dim ? "◐" : "○") + "  " + (row.locked ? "⊥" : "○");
    tip.append(name, flags);
    tip.hidden = false;
    const ax = event && event.clientX ? event.clientX : win.g.getBoundingClientRect().right;
    const ay = event && event.clientY ? event.clientY : win.g.getBoundingClientRect().top;
    tip.style.left = Math.min(window.innerWidth - 72, ax + 12) + "px";
    tip.style.top = Math.max(8, ay - 28) + "px";
    wins.forEach((other) => other.ring.setAttribute("opacity", other === win ? "1" : "0"));
  }
  function hideTip() {
    tip.hidden = true;
    wins.forEach((other) => other.ring.setAttribute("opacity", "0"));
  }
  wins.forEach((win) => {
    win.g.addEventListener("pointerenter", (event) => showTip(win, event));
    win.g.addEventListener("pointermove", (event) => showTip(win, event));
    win.g.addEventListener("pointerleave", hideTip);
  });

  const track = container.closest(".bed-scroll");
  let running = true;
  let lastP = -1;

  function opacityFor(row, p, now) {
    const base = 0.28 + 0.72 * row.bright;
    if (p < 0.2) return base;
    if (!row.warm) {
      const t = clamp((p - 0.2) / 0.25);
      if (p >= 0.45 || reduced) return 0;
      return base * Math.abs(Math.sin(t * Math.PI * 3));
    }
    if (p < 0.45) return base;
    if (!row.dim) return base * (1 - clamp((p - 0.45) / 0.25));
    if (p < 0.7) return base;
    if (!row.locked) return base * (1 - clamp((p - 0.78) / 0.12));
    if (p < 0.9 || reduced) return base;
    return base * (0.78 + 0.22 * Math.sin((now / 5000) * Math.PI * 2));
  }

  function apply(p, now) {
    const pull = p < 0.9 ? 1 : 1 - 0.1 * clamp((p - 0.9) / 0.1);
    bldg.setAttribute("transform", "translate(720 390) scale(" + pull.toFixed(3) + ") translate(-720 -390)");
    wins.forEach((win) => {
      const op = opacityFor(win.row, p, now);
      win.frame.style.opacity = op.toFixed(3);
      const hand = !win.row.locked && p >= 0.7 && p < 0.9 && op > 0.05 && !reduced;
      win.frame.classList.toggle("is-hand", hand);
    });
    readouts.forEach((item) => {
      const t = clamp((p - item.from) / 0.12);
      item.node.style.opacity = t.toFixed(3);
      item.node.setAttribute("transform", "translate(78 " + (item.from === 0.2 ? 250 : item.from === 0.45 ? 340 : 430) + ") translate(0 " + ((1 - t) * 16).toFixed(1) + ")");
    });
    finalNum.style.opacity = p < 0.9 ? "0" : clamp((p - 0.9) / 0.08).toFixed(3);
    container.style.setProperty("--p", p.toFixed(4));
  }

  function progress() {
    if (!track) return reduced ? 1 : 0;
    const rect = track.getBoundingClientRect();
    const total = track.offsetHeight - window.innerHeight;
    if (total <= 1) return 0;
    return clamp(-rect.top / total);
  }

  function frame(now) {
    if (!running) return;
    const p = reduced ? 1 : progress();
    if (reduced) {
      apply(1, now);
      return;
    }
    apply(p, now);
    lastP = p;
    requestAnimationFrame(frame);
  }

  if (reduced) apply(1, performance.now());
  else requestAnimationFrame(frame);
  container._nwStop = () => { running = false; };
  return { n, nWarm, nDim, nLocked, nKeep };
}
