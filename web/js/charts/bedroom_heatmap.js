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
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("");
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
      cx: (760 + hash(i) * 280).toFixed(1),
      cy: (16 + hash(i + 40) * 46).toFixed(1),
      r: (0.6 + hash(i + 7) * 1.1).toFixed(2),
      fill: "#f0ece3",
      "fill-opacity": "0.45",
    }));
  }
  const moon = el("g", { transform: "translate(620 -48)" });
  moon.appendChild(el("path", {
    d: "M210 64 A34 34 0 1 0 210 132 A22 22 0 1 1 210 64",
    fill: "#f0ece3",
    "fill-opacity": "0.55",
  }));
  sky.appendChild(moon);
  svg.appendChild(sky);

  const bldg = el("g", { class: "nw-bldg" });
  bldg.appendChild(el("path", {
    d: "M470 168 L540 78 L1020 96 L1070 168 L1070 640 L470 640 Z",
    fill: "#12182a",
    stroke: "#232f4a",
    "stroke-width": "1.2",
  }));

  const wins = rows.map((row, i) => {
    const col = i % 4;
    const line = Math.floor(i / 4);
    const x = 548 + col * 112;
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
    return { row, g, frame, glow, glass, outer, ring };
  });
  svg.appendChild(bldg);

  const defs = el("defs");
  const blur = el("filter", { id: "nw-blur", x: "-50%", y: "-50%", width: "200%", height: "200%" });
  blur.appendChild(el("feGaussianBlur", { stdDeviation: "3.2" }));
  defs.appendChild(blur);
  svg.insertBefore(defs, svg.firstChild);

  const copy = el("g", { class: "nw-copy" });
  const filters = [
    { label: "Warm lighting", count: nWarm, from: 0.2, y: 188 },
    { label: "Dim light (<75)", count: nDim, from: 0.45, y: 248 },
    { label: "Locked camera", count: nLocked, from: 0.7, y: 308 },
  ].map((item) => {
    const pct = Math.round((item.count / n) * 100);
    const row = el("text", { x: 48, y: item.y, fill: "#98a4be", "font-size": "16" });
    row.textContent = item.label + " — " + item.count + " / " + n + " (" + pct + "%)";
    const mark = el("rect", {
      x: 28, y: item.y - 12, width: 8, height: 8, rx: 1, fill: "#f4a259", opacity: "0.25",
    });
    copy.append(mark, row);
    return { ...item, row, mark };
  });
  const counter = el("text", { x: 48, y: 378, fill: "#f0ece3", "font-size": "14" });
  copy.appendChild(counter);
  const key = el("g", { transform: "translate(48 520)" });
  [
    ["#f4a259", "Amber = Warm", 0],
    ["#56c2d6", "Cyan = Cool", 26],
  ].forEach((item) => {
    key.appendChild(el("rect", { x: 0, y: item[2], width: 12, height: 12, rx: 2, fill: item[0] }));
    const label = el("text", { x: 20, y: item[2] + 11, fill: "#f0ece3", "font-size": "13" });
    label.textContent = item[1];
    key.appendChild(label);
  });
  const brightKey = el("text", { x: 0, y: 58, fill: "#f0ece3", "font-size": "13" });
  brightKey.textContent = "Brighter = Higher luminance";
  key.appendChild(brightKey);
  copy.appendChild(key);
  svg.appendChild(copy);

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

  function tipLine(row) {
    const warmth = Math.round(row.warmth);
    const lum = Math.round(row.video_lum);
    const warmBit = row.warm ? "Warm (+" + warmth + ")" : "Cool (" + warmth + ")";
    const dimBit = row.dim ? "Dim (" + lum + "/255)" : "Bright (" + lum + "/255)";
    const lockBit = row.locked ? "Locked camera" : "Handheld";
    return "Video " + row.code + " · " + warmBit + " · " + dimBit + " · " + lockBit;
  }
  function showTip(win, event) {
    const row = win.row;
    tip.textContent = tipLine(row);
    tip.hidden = false;
    const ax = event && event.clientX ? event.clientX : win.g.getBoundingClientRect().right;
    const ay = event && event.clientY ? event.clientY : win.g.getBoundingClientRect().top;
    const tipW = Math.min(320, window.innerWidth - 16);
    let left = ax + 14;
    if (left + tipW > window.innerWidth - 8) left = Math.max(8, ax - tipW - 8);
    tip.style.left = left + "px";
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

  const SLATE = "#1a2236";

  function passAmount(row, p) {
    let cut = 1;
    if (p >= 0.2 && !row.warm) cut = Math.min(cut, 1 - clamp((p - 0.2) / 0.16));
    if (p >= 0.45 && !row.dim) cut = Math.min(cut, 1 - clamp((p - 0.45) / 0.16));
    if (p >= 0.7 && !row.locked) cut = Math.min(cut, 1 - clamp((p - 0.7) / 0.16));
    return cut;
  }

  function matching(p) {
    return rows.filter((row) => {
      if (p >= 0.2 && !row.warm) return false;
      if (p >= 0.45 && !row.dim) return false;
      if (p >= 0.7 && !row.locked) return false;
      return true;
    }).length;
  }

  function apply(p, now) {
    const pull = p < 0.9 ? 1 : 1 - 0.1 * clamp((p - 0.9) / 0.1);
    bldg.setAttribute("transform", "translate(770 400) scale(" + pull.toFixed(3) + ") translate(-770 -400)");
    wins.forEach((win) => {
      const row = win.row;
      const pass = passAmount(row, p);
      const breathe = pass > 0.98 && p >= 0.9 && row.warm && row.dim && row.locked && !reduced
        ? 0.84 + 0.16 * Math.sin((now / 5000) * Math.PI * 2)
        : 1;
      const lit = mix("#9ecbff", "#f0a24a", row.tone);
      win.glass.setAttribute("fill", mix(SLATE, lit, pass));
      win.glass.setAttribute("fill-opacity", (0.78 + 0.22 * pass).toFixed(3));
      win.glow.setAttribute("fill", lit);
      win.glow.setAttribute("fill-opacity", ((0.08 + 0.5 * row.bright) * pass * breathe).toFixed(3));
      win.outer.setAttribute("stroke", pass > 0.45 ? "#f0ece3" : "#98a4be");
      win.outer.setAttribute("stroke-opacity", (0.34 + 0.56 * pass).toFixed(3));
      win.frame.style.opacity = "1";
      const hand = !row.locked && p >= 0.7 && p < 0.9 && pass > 0.35 && !reduced;
      win.frame.classList.toggle("is-hand", hand);
    });
    filters.forEach((item) => {
      const on = p >= item.from;
      item.row.setAttribute("fill", on ? "#f0ece3" : "#98a4be");
      item.mark.setAttribute("opacity", on ? "1" : "0.25");
    });
    counter.textContent = "Matching all active filters: " + matching(p) + " / " + n + " windows lit";
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
    if (track) {
      const rect = track.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (rect.bottom < -40 || rect.top > vh + 40) {
        requestAnimationFrame(frame);
        return;
      }
    }
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
