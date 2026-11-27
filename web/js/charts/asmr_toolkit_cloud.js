/* Moon of Words. Layout is precomputed. Scroll and pointer only. No buttons. */
const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR = {
  "visual craft": "#f4a259",
  formats: "#f0ece3",
  "props and triggers": "#56c2d6",
  other: "#c4bba8",
};
const WAVES = ["formats", "props and triggers", "visual craft", "other"];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export async function render(container) {
  if (!container) return;
  if (container._moonStop) container._moonStop();
  container.replaceChildren();
  container.classList.add("moon-stage");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  const [layout, termsDoc] = await Promise.all([
    d3.json("data/toolkit_layout.json?v=20261127n"),
    d3.json("data/toolkit_terms.json?v=20261127n"),
  ]);
  const counts = new Map(termsDoc.terms.map((row) => [row.term, row.n_videos]));
  const words = layout.words.filter((word) => !narrow || word.size >= 9);
  const W = layout.meta.width;
  const H = layout.meta.height;

  words.forEach((word) => {
    const mates = words.filter((other) => other.group === word.group && !other.star);
    const inner = Math.max(...mates.map((other) => other.x), word.x);
    const outer = Math.min(...mates.map((other) => other.x), word.x);
    word.rank = inner === outer ? 0 : (inner - word.x) / (inner - outer);
  });

  const svg = el("svg", {
    class: "moon-svg",
    viewBox: "0 0 " + W + " " + H,
    role: "img",
    "aria-label": "A crescent of ASMR terms",
  });
  const outline = el("g", { class: "moon-outline", fill: "none", stroke: "#98a4be", "stroke-width": "1.25" });
  outline.appendChild(el("circle", { cx: 980, cy: 700, r: 560 }));
  outline.appendChild(el("circle", { cx: 1210, cy: 700, r: 590, "stroke-opacity": "0.45" }));
  svg.appendChild(outline);

  const nodes = words.map((word, i) => {
    const text = el("text", {
      class: "moon-word",
      x: word.x,
      y: word.y,
      fill: COLOR[word.group] || COLOR.other,
      "font-size": word.size,
      "font-family": "var(--font-ui), sans-serif",
      "font-weight": word.size >= 28 ? "700" : "500",
    });
    text.textContent = word.term;
    if (word.rotation) text.setAttribute("transform", "rotate(-90 " + word.x + " " + word.y + ")");
    text.style.opacity = "0";
    svg.appendChild(text);
    return { word, text, i };
  });

  const legend = el("g", { class: "moon-legend", transform: "translate(36 " + (H - 72) + ")" });
  [["#f4a259", "Craft"], ["#f0ece3", "Formats"], ["#56c2d6", "Props"]].forEach((item, i) => {
    legend.appendChild(el("circle", { cx: i * 118, cy: 0, r: 5, fill: item[0] }));
    const label = el("text", {
      x: i * 118 + 12, y: 4, fill: "#f0ece3", "font-size": 16, "font-family": "var(--font-ui), sans-serif",
    });
    label.textContent = item[1];
    legend.appendChild(label);
  });
  svg.appendChild(legend);

  const tip = document.createElement("div");
  tip.className = "moon-tip";
  tip.hidden = true;

  const table = document.createElement("table");
  table.className = "sr-only";
  const cap = document.createElement("caption");
  cap.textContent = "Top toolkit terms";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Term", "Videos"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  });
  head.appendChild(hr);
  const body = document.createElement("tbody");
  termsDoc.terms.slice(0, 100).forEach((row) => {
    const tr = document.createElement("tr");
    [row.term, String(row.n_videos)].forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.append(cap, head, body);
  container.append(svg, tip, table);

  let pointer = null;
  function toSvg(event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * W,
      y: ((event.clientY - rect.top) / rect.height) * H,
      sx: event.clientX,
      sy: event.clientY,
    };
  }
  svg.addEventListener("pointermove", (event) => { pointer = toSvg(event); });
  svg.addEventListener("pointerdown", (event) => { pointer = toSvg(event); });
  svg.addEventListener("pointerleave", () => { pointer = null; tip.hidden = true; });

  const kept = [];
  nodes.forEach((node) => {
    const raw = node.text.getBBox();
    const box = { x: raw.x - 8, y: raw.y - 4, width: raw.width + 16, height: raw.height + 8 };
    const hit = kept.some((b) => {
      const ix = Math.min(box.x + box.width, b.x + b.width) - Math.max(box.x, b.x);
      const iy = Math.min(box.y + box.height, b.y + b.height) - Math.max(box.y, b.y);
      return ix > 0 && iy > 0;
    });
    if (hit) node.text.remove();
    else kept.push(box);
    node.dead = hit;
  });

  const track = container.closest(".kit-scroll");
  let running = true;

  function revealOf(word, p) {
    const gi = Math.max(0, WAVES.indexOf(word.group));
    const slot = 0.75 / WAVES.length;
    const start = 0.05 + gi * slot;
    const local = clamp((p - start) / (slot * 0.9));
    return clamp((local - word.rank * 0.5) / 0.5);
  }

  function apply(p, now) {
    container.style.setProperty("--p", p.toFixed(4));
    let nearest = null;
    nodes.forEach((node) => {
      if (node.dead) return;
      const shown = reduced ? 1 : revealOf(node.word, p);
      let opacity = shown;
      let scale = 1;
      if (pointer && shown > 0.35) {
        const dx = pointer.x - node.word.x;
        const dy = pointer.y - node.word.y;
        const dist = Math.hypot(dx, dy) * (svg.getBoundingClientRect().width / W);
        if (nearest == null || dist < nearest.dist) nearest = { dist, node, sx: pointer.sx, sy: pointer.sy };
        if (dist < 90) {
          opacity = 1;
          scale = 1.2;
        } else if (nearest && false) {
          opacity = shown;
        }
      }
      node.text.style.opacity = opacity.toFixed(3);
      node._scale = scale;
      node._shown = shown;
    });
    if (pointer) {
      nodes.forEach((node) => {
        if (node.dead || node._shown < 0.35) return;
        const hit = nearest && nearest.dist < 90 && nearest.node.word.group === node.word.group;
        const self = nearest && nearest.node === node && nearest.dist < 90;
        if (self) node.text.style.opacity = "1";
        else if (nearest && nearest.dist < 90) node.text.style.opacity = hit ? "0.8" : "0.35";
      });
    }
    nodes.forEach((node) => {
      if (node.dead) return;
      let dx = 0;
      let dy = 0;
      if (!reduced && p > 0.85 && node._shown > 0.8) {
        const period = 8000 + (node.i % 5) * 800;
        dx = Math.sin((now / period) * Math.PI * 2) * 2;
        dy = Math.cos((now / (period + 600)) * Math.PI * 2) * 2;
      }
      const sc = node._scale || 1;
      const rot = node.word.rotation ? " rotate(-90)" : "";
      node.text.setAttribute(
        "transform",
        "translate(" + dx.toFixed(2) + " " + dy.toFixed(2) + ") translate(" + node.word.x + " " + node.word.y + ") scale(" + sc.toFixed(3) + ")" + rot + " translate(" + (-node.word.x) + " " + (-node.word.y) + ")"
      );
    });
    if (nearest && nearest.dist < 90) {
      const n = counts.get(nearest.node.word.term) || 0;
      tip.textContent = nearest.node.word.term + " - " + n + " videos";
      tip.hidden = false;
      tip.style.left = Math.min(window.innerWidth - 160, nearest.sx + 14) + "px";
      tip.style.top = Math.max(8, nearest.sy - 28) + "px";
    } else {
      tip.hidden = true;
    }
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
    apply(reduced ? 1 : progress(), now);
    if (!reduced) requestAnimationFrame(frame);
  }
  if (reduced) apply(1, performance.now());
  else requestAnimationFrame(frame);
  container._moonStop = () => { running = false; };
}
