/* West vs East Asia — radar plus area-scaled orbs. No buttons. */
import { motionApi } from "./entrance.js?v=20261127g";

const SVG_NS = "http://www.w3.org/2000/svg";
const AXES = ["Talking", "Care", "Fast", "Tapping", "Ear"];
const WEST = [80, 35, 25, 20, 5];
const EAST = [30, 10, 10, 25, 55];
const CX = 220;
const CY = 198;
const R = 112;

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function polar(i, pct) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
  const reach = R * (pct / 100);
  return { x: CX + Math.cos(a) * reach, y: CY + Math.sin(a) * reach, a };
}

function points(values, t) {
  return values
    .map((v, i) => {
      const p = polar(i, v * t);
      return p.x.toFixed(1) + "," + p.y.toFixed(1);
    })
    .join(" ");
}

export function render(container) {
  if (!container) return;
  if (container._weUnlisten) container._weUnlisten();
  container.replaceChildren();
  container.classList.add("we-root");

  const grid = document.createElement("div");
  grid.className = "we-grid";

  const radarCol = document.createElement("div");
  radarCol.className = "we-col";
  const svg = el("svg", {
    class: "we-svg",
    viewBox: "0 0 440 400",
    role: "img",
    "aria-label": "Western and East Asian shares for talking, care, fast, tapping, and ear",
  });
  const web = el("g", { class: "we-web" });
  [0.25, 0.5, 0.75, 1].forEach((step) => {
    web.appendChild(el("polygon", {
      class: "we-ring",
      points: points(AXES.map(() => step * 100), 1),
    }));
  });
  AXES.forEach((_, i) => {
    const outer = polar(i, 100);
    web.appendChild(el("line", {
      class: "we-axis",
      x1: CX, y1: CY,
      x2: outer.x.toFixed(1),
      y2: outer.y.toFixed(1),
    }));
    const lab = polar(i, 122);
    const cos = Math.cos(lab.a);
    const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
    const text = el("text", {
      class: "we-axis-label",
      x: lab.x.toFixed(1),
      y: (lab.y + 4).toFixed(1),
      "text-anchor": anchor,
    });
    text.textContent = AXES[i];
    web.appendChild(text);
  });

  const west = el("polygon", { class: "we-poly we-west", points: points(WEST, 0) });
  const east = el("polygon", { class: "we-poly we-east", points: points(EAST, 0) });
  const dots = el("g", { class: "we-dots" });
  const dotNodes = [];
  AXES.forEach((_, i) => {
    ["west", "east"].forEach((side) => {
      const dot = el("circle", {
        class: "we-dot we-dot-" + side,
        r: 5.5,
        cx: CX,
        cy: CY,
      });
      dot.dataset.i = String(i);
      dot.dataset.side = side;
      dots.appendChild(dot);
      dotNodes.push(dot);
    });
  });
  svg.append(web, west, east, dots);
  radarCol.appendChild(svg);

  const orbCol = document.createElement("div");
  orbCol.className = "we-col we-orbs";
  const rows = [
    {
      title: "Median Length",
      max: 51.9,
      maxPx: 92,
      items: [
        { who: "East Asia", value: 51.9, label: "51.9 min", tone: "east" },
        { who: "Western", value: 34.5, label: "34.5 min", tone: "west" },
      ],
    },
    {
      title: "Median Views · 4.3× gap",
      max: 1.86,
      maxPx: 118,
      items: [
        { who: "East Asia", value: 1.86, label: "1.86M", tone: "east" },
        { who: "Western", value: 0.43, label: "430K", tone: "west" },
      ],
    },
  ];
  const orbs = [];
  rows.forEach((row) => {
    const block = document.createElement("div");
    block.className = "we-block";
    const title = document.createElement("p");
    title.className = "we-row-title";
    title.textContent = row.title;
    const pair = document.createElement("div");
    pair.className = "we-pair";
    row.items.forEach((item) => {
      const unit = document.createElement("div");
      unit.className = "we-unit";
      const orb = document.createElement("span");
      const d = row.maxPx * Math.sqrt(item.value / row.max);
      orb.className = "we-orb we-orb-" + item.tone;
      orb.style.width = d.toFixed(1) + "px";
      orb.style.height = d.toFixed(1) + "px";
      const val = document.createElement("span");
      val.className = "we-val";
      val.textContent = item.label;
      const who = document.createElement("span");
      who.className = "we-who";
      who.textContent = item.who;
      unit.append(orb, val, who);
      pair.appendChild(unit);
      orbs.push(orb);
    });
    block.append(title, pair);
    orbCol.appendChild(block);
  });

  const tip = document.createElement("div");
  tip.className = "we-tip";
  tip.hidden = true;

  function hideTip() {
    tip.hidden = true;
    west.classList.remove("is-on");
    east.classList.remove("is-on");
    svg.classList.remove("is-hot", "is-poly");
  }

  function showTip(event, lines) {
    tip.replaceChildren();
    lines.forEach((line, i) => {
      const p = document.createElement("p");
      p.textContent = line;
      if (i === 0) p.className = "we-tip-name";
      tip.appendChild(p);
    });
    tip.hidden = false;
    const ax = event.clientX;
    const ay = event.clientY;
    tip.style.left = "0px";
    tip.style.top = "0px";
    const rect = tip.getBoundingClientRect();
    let left = ax + 14;
    let top = ay + 14;
    if (left + rect.width > window.innerWidth - 8) left = ax - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = ay - rect.height - 12;
    tip.style.left = Math.max(8, left) + "px";
    tip.style.top = Math.max(8, top) + "px";
  }

  function axisLines(i) {
    return [
      AXES[i],
      "Western " + WEST[i] + "%",
      "East Asian " + EAST[i] + "%",
    ];
  }

  function bindPoly(node, side) {
    const values = side === "west" ? WEST : EAST;
    const name = side === "west" ? "Western" : "East Asian";
    node.addEventListener("pointerenter", (event) => {
      svg.classList.add("is-hot", "is-poly");
      west.classList.toggle("is-on", side === "west");
      east.classList.toggle("is-on", side === "east");
      showTip(event, [name].concat(AXES.map((axis, i) => axis + " " + values[i] + "%")));
    });
    node.addEventListener("pointermove", (event) => {
      if (!tip.hidden) showTip(event, [name].concat(AXES.map((axis, i) => axis + " " + values[i] + "%")));
    });
    node.addEventListener("pointerleave", hideTip);
  }
  bindPoly(west, "west");
  bindPoly(east, "east");
  dotNodes.forEach((dot) => {
    dot.addEventListener("pointerenter", (event) => {
      const i = +dot.dataset.i;
      svg.classList.add("is-hot");
      showTip(event, axisLines(i));
    });
    dot.addEventListener("pointermove", (event) => showTip(event, axisLines(+dot.dataset.i)));
    dot.addEventListener("pointerleave", hideTip);
  });

  grid.append(radarCol, orbCol);
  container.append(grid, tip);

  const state = { t: 0 };
  function paint(t) {
    west.setAttribute("points", points(WEST, t));
    east.setAttribute("points", points(EAST, t));
    dotNodes.forEach((dot) => {
      const i = +dot.dataset.i;
      const values = dot.dataset.side === "west" ? WEST : EAST;
      const p = polar(i, values[i] * t);
      dot.setAttribute("cx", p.x.toFixed(1));
      dot.setAttribute("cy", p.y.toFixed(1));
    });
  }
  paint(0);
  arm(container, { web, orbs, state, paint, hideTip });
}

function arm(container, parts) {
  const api = motionApi();
  if (!api) {
    parts.paint(1);
    parts.web.style.opacity = "1";
    parts.orbs.forEach((orb) => {
      orb.style.opacity = "1";
      orb.style.transform = "none";
    });
    return;
  }
  const { gsap } = api;
  gsap.set(parts.web, { opacity: 0 });
  gsap.set(parts.orbs, { scale: 0, transformOrigin: "50% 50%" });
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
    parts.state.t = 0;
    parts.paint(0);
    gsap.to(parts.web, { opacity: 1, duration: 0.4, ease: "power1.out", overwrite: "auto" });
    gsap.to(parts.state, {
      t: 1,
      duration: 0.7,
      delay: 0.18,
      ease: "power2.out",
      overwrite: "auto",
      onUpdate() { parts.paint(parts.state.t); },
    });
    gsap.fromTo(parts.orbs, { scale: 0, opacity: 0.4 }, {
      scale: 1,
      opacity: 1,
      duration: 0.55,
      stagger: 0.08,
      delay: 0.42,
      ease: "power2.out",
      transformOrigin: "50% 50%",
      overwrite: "auto",
      clearProps: "scale,transform",
    });
  }

  function playOut() {
    if (!shown) return;
    shown = false;
    parts.hideTip();
    gsap.killTweensOf(parts.state);
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
  container._weUnlisten = () => {
    window.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
  };
  gsap.set(container, { opacity: 0 });
  request();
}
