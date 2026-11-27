/* Who creates calm, and who listens. Silhouettes and a voice arch. No buttons. */
import { motionApi } from "./entrance.js?v=20261127g";

const SVG_NS = "http://www.w3.org/2000/svg";
const SUBS = "Male top median subs: 708K vs Female 652K";
const GROUPS = [
  { id: "f", n: 68, label: "67.6% Female", note: SUBS },
  { id: "m", n: 24, label: "23.9% Male, up from 6.7% in 2018", note: SUBS },
  { id: "o", n: 8, label: "8.5% Other/Duo", note: SUBS },
];
const ARCS = [
  { share: 0.45, color: "#e87a64", name: "Female voice" },
  { share: 0.3, color: "#56c2d6", name: "No preference" },
  { share: 0.18, color: "#6ea8fe", name: "Male voice" },
  { share: 0.07, color: "#6c7894", name: "Unsure" },
];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function figure(svg, ox) {
  const g = el("g", { transform: "translate(" + ox + " 0)" });
  g.append(
    el("circle", { cx: "16", cy: "7.5", r: "5.2" }),
    el("path", { d: "M7 46V23.2C7 17.2 10.6 14.2 16 14.2S25 17.2 25 23.2V46h-5.6V31h-6.8v15H7z" })
  );
  svg.appendChild(g);
}

function person(duo) {
  const svg = el("svg", {
    class: "ge-fig",
    viewBox: duo ? "0 0 46 48" : "0 0 32 48",
    "aria-hidden": "true",
  });
  if (!duo) figure(svg, 0);
  else {
    figure(svg, 0);
    const second = svg.lastChild;
    second.setAttribute("transform", "translate(16 1) scale(0.9)");
  }
  return svg;
}

function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const s = p(a0);
  const e = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return "M " + s[0].toFixed(2) + " " + s[1].toFixed(2) + " A " + r + " " + r + " 0 " + large + " 1 " + e[0].toFixed(2) + " " + e[1].toFixed(2);
}

export function render(container) {
  if (!container) return;
  if (container._geUnlisten) container._geUnlisten();
  container.replaceChildren();
  container.classList.add("ge-root");

  const grid = document.createElement("div");
  grid.className = "ge-grid";

  const left = document.createElement("div");
  left.className = "ge-col";
  const matrix = document.createElement("div");
  matrix.className = "ge-matrix";
  const cells = [];
  GROUPS.forEach((group) => {
    for (let n = 0; n < group.n; n += 1) {
      const cell = document.createElement("div");
      cell.className = "ge-cell ge-" + group.id;
      cell.dataset.g = group.id;
      cell.appendChild(person(group.id === "o"));
      matrix.appendChild(cell);
      cells.push(cell);
    }
  });
  const legend = document.createElement("p");
  legend.className = "ge-legend";
  GROUPS.forEach((group) => {
    const bit = document.createElement("span");
    bit.className = "ge-key ge-key-" + group.id;
    bit.textContent = group.label;
    legend.appendChild(bit);
  });
  left.append(matrix, legend);

  const right = document.createElement("div");
  right.className = "ge-col";
  const svg = el("svg", {
    class: "ge-gauge",
    viewBox: "0 0 360 210",
    role: "img",
    "aria-label": "Voice preference. 45 percent female, 30 percent no preference, 18 percent male, 7 percent unsure",
  });
  const cx = 180;
  const cy = 168;
  const radius = 118;
  let cursor = 0;
  const arches = [];
  ARCS.forEach((seg) => {
    const a0 = Math.PI + Math.PI * cursor;
    cursor += seg.share;
    const a1 = Math.PI + Math.PI * cursor;
    const path = el("path", {
      class: "ge-arch",
      d: arcPath(cx, cy, radius, a0, a1),
      stroke: seg.color,
    });
    svg.appendChild(path);
    arches.push(path);
  });
  const call = el("text", { class: "ge-call", x: cx, y: 132, "text-anchor": "middle" });
  call.textContent = "22% vs 21%";
  const sub = el("text", { class: "ge-call-sub", x: cx, y: 152, "text-anchor": "middle" });
  sub.textContent = "Daily listening · Women vs. Men";
  svg.append(call, sub);

  const lines = document.createElement("div");
  lines.className = "ge-lines";
  [
    "No gender pref: Women 38% vs. Men 20%",
    "Top median subs: Male 708K vs. Female 652K",
  ].forEach((line) => {
    const p = document.createElement("p");
    p.className = "ge-line";
    p.textContent = line;
    lines.appendChild(p);
  });
  const tags = document.createElement("p");
  tags.className = "ge-tags";
  ARCS.forEach((seg) => {
    const bit = document.createElement("span");
    bit.style.color = seg.color === "#6c7894" ? "#98a4be" : seg.color;
    bit.textContent = Math.round(seg.share * 100) + "% " + seg.name;
    tags.appendChild(bit);
  });
  right.append(svg, tags, lines);

  const tip = document.createElement("div");
  tip.className = "ge-tip";
  tip.hidden = true;

  function hideTip() {
    tip.hidden = true;
    matrix.classList.remove("is-hot");
    cells.forEach((cell) => cell.classList.remove("is-on"));
  }

  function spotlight(id, event) {
    const group = GROUPS.find((item) => item.id === id);
    matrix.classList.add("is-hot");
    cells.forEach((cell) => cell.classList.toggle("is-on", cell.dataset.g === id));
    tip.replaceChildren();
    [group.label, group.note].forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "ge-tip-name";
      tip.appendChild(p);
    });
    tip.hidden = false;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    let left = event.clientX + 14;
    let top = event.clientY + 14;
    if (left + rect.width > window.innerWidth - 8) left = event.clientX - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = event.clientY - rect.height - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  matrix.addEventListener("pointerover", (event) => {
    const cell = event.target.closest(".ge-cell");
    if (!cell) return;
    spotlight(cell.dataset.g, event);
  });
  matrix.addEventListener("pointermove", (event) => {
    const cell = event.target.closest(".ge-cell");
    if (!cell || tip.hidden) return;
    spotlight(cell.dataset.g, event);
  });
  matrix.addEventListener("pointerleave", hideTip);

  grid.append(left, right);
  container.append(grid, tip);
  arm(container, { cells, arches, call, sub, hideTip });
}

function arm(container, parts) {
  const api = motionApi();
  if (!api) {
    parts.cells.forEach((cell) => { cell.style.opacity = "1"; });
    parts.arches.forEach((path) => path.setAttribute("stroke-dashoffset", "0"));
    parts.call.style.opacity = "1";
    parts.sub.style.opacity = "1";
    return;
  }
  const { gsap } = api;
  gsap.set(parts.cells, { opacity: 0 });
  parts.arches.forEach((path) => {
    const len = path.getTotalLength();
    path.setAttribute("stroke-dasharray", String(len));
    path.setAttribute("stroke-dashoffset", String(len));
  });
  gsap.set([parts.call, parts.sub], { opacity: 0 });

  const trigger = container.closest(".story-scene") || container;
  let shown = false;
  let ticking = false;

  function inView() {
    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    return r.top < vh * 0.86 && r.bottom > vh * 0.14;
  }

  function playIn() {
    if (shown) return;
    shown = true;
    parts.cells.forEach((cell, i) => {
      const row = Math.floor(i / 10);
      const col = i % 10;
      gsap.fromTo(cell, { opacity: 0 }, {
        opacity: 1,
        duration: 0.22,
        delay: (row + col) * 0.028,
        overwrite: "auto",
        clearProps: "opacity",
      });
    });
    parts.arches.forEach((path, i) => {
      const len = path.getTotalLength();
      path.setAttribute("stroke-dasharray", String(len));
      gsap.fromTo(path, { attr: { "stroke-dashoffset": len } }, {
        attr: { "stroke-dashoffset": 0 },
        duration: 0.48,
        delay: 0.32 + i * 0.2,
        ease: "power1.out",
        overwrite: "auto",
      });
    });
    gsap.fromTo([parts.call, parts.sub], { opacity: 0 }, {
      opacity: 1,
      duration: 0.4,
      delay: 0.9,
      overwrite: "auto",
    });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    parts.hideTip();
    gsap.killTweensOf(parts.cells);
    gsap.to(container, { opacity: 0, duration: 0.32, overwrite: "auto" });
  }

  function tick() {
    ticking = false;
    if (inView()) {
      gsap.set(container, { opacity: 1 });
      playIn();
    } else playOut();
  }
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(tick);
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  container._geUnlisten = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  gsap.set(container, { opacity: 0 });
  request();
}
