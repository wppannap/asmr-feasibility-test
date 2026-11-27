/* Moon of Words. Curated English toolkit. Scroll and pointer only. No buttons. */
const SVG_NS = "http://www.w3.org/2000/svg";
const COLOR = {
  formats: "#f0ece3",
  props: "#f4a259",
  craft: "#56c2d6",
};
const GROUP = {
  formats: "Formats",
  props: "Props & Triggers",
  craft: "Visual Craft",
};

const WORDS = [
  { term: "WHISPERING", group: "formats", tier: 1, vertical: false, role: "Soft speech for sleep" },
  { term: "NO TALKING", group: "formats", tier: 1, vertical: false, role: "Quiet attention, no speech" },
  { term: "EAR CLEANING", group: "props", tier: 1, vertical: false, role: "Close ear-care sounds" },
  { term: "PERSONAL ATTENTION", group: "formats", tier: 1, vertical: false, role: "Addressed to one listener" },
  { term: "TAPPING", group: "props", tier: 1, vertical: true, role: "Rhythmic surface taps" },
  { term: "ROLEPLAY", group: "formats", tier: 1, vertical: true, role: "A quiet acted scene" },
  { term: "MIC BRUSHING", group: "props", tier: 2, vertical: false, role: "Brush on the microphone" },
  { term: "MAKEUP BRUSHES", group: "props", tier: 2, vertical: false, role: "Soft brush passes" },
  { term: "SCRATCHING", group: "props", tier: 2, vertical: true, role: "Nail or tool scratches" },
  { term: "SOFT SPOKEN", group: "formats", tier: 2, vertical: false, role: "Slow, low speech" },
  { term: "3DIO / DUMMY HEAD", group: "formats", tier: 2, vertical: false, role: "Ear-shaped stereo mic" },
  { term: "LAYERED SOUNDS", group: "formats", tier: 2, vertical: false, role: "Several sounds at once" },
  { term: "FAST & AGGRESSIVE", group: "formats", tier: 2, vertical: false, role: "Quicker, sharper gestures" },
  { term: "MOUTH SOUNDS", group: "props", tier: 2, vertical: false, role: "Close mouth noises" },
  { term: "HAIR PLAY", group: "props", tier: 2, vertical: false, role: "Hair brushed or stroked" },
  { term: "HEAD MASSAGE", group: "props", tier: 2, vertical: false, role: "Hands on the scalp" },
  { term: "BAMBOO EARPICKS", group: "props", tier: 3, vertical: false, role: "Wooden ear picks" },
  { term: "SILICONE EARS", group: "props", tier: 3, vertical: false, role: "Soft ear models" },
  { term: "FLUFFY MIC", group: "props", tier: 3, vertical: false, role: "A covered microphone" },
  { term: "LONG NAILS", group: "props", tier: 3, vertical: false, role: "Nail taps and scratches" },
  { term: "SPONGES & FOAM", group: "props", tier: 3, vertical: false, role: "Soft foam textures" },
  { term: "CRINKLE / PLASTIC", group: "props", tier: 3, vertical: false, role: "Crinkle textures" },
  { term: "LENS TOUCH", group: "craft", tier: 3, vertical: false, role: "Fingers meet the lens" },
  { term: "EYE CONTACT", group: "craft", tier: 3, vertical: true, role: "Looking into the lens" },
  { term: "FULL FACE", group: "craft", tier: 3, vertical: true, role: "The whole face in frame" },
  { term: "FACELESS MACRO", group: "craft", tier: 3, vertical: false, role: "Close detail, no face" },
  { term: "LOCKED CAMERA", group: "craft", tier: 3, vertical: false, role: "A steady frame" },
  { term: "WARM LIGHT", group: "craft", tier: 3, vertical: true, role: "Amber room light" },
  { term: "SKINCARE", group: "props", tier: 3, vertical: true, role: "Lotion and skin sounds" },
  { term: "HAND MOVEMENTS", group: "props", tier: 3, vertical: false, role: "Hands working in view" },
  { term: "WATER & RAIN", group: "props", tier: 3, vertical: false, role: "Water textures" },
  { term: "WOOD & GLASS", group: "props", tier: 3, vertical: false, role: "Hard-surface taps" },
  { term: "SOAP CUTTING", group: "props", tier: 3, vertical: true, role: "Soap sliced close" },
  { term: "SLIME", group: "props", tier: 3, vertical: true, role: "Slow slime play" },
  { term: "GLOVES", group: "props", tier: 3, vertical: true, role: "Gloved hand sounds" },
  { term: "TRIGGER WORDS", group: "formats", tier: 3, vertical: false, role: "Repeated sleep cues" },
  { term: "BINAURAL", group: "formats", tier: 3, vertical: true, role: "Stereo close to the ear" },
  { term: "CLOSE WHISPER", group: "formats", tier: 3, vertical: false, role: "Whisper near the mic" },
  { term: "SCALP CHECK", group: "props", tier: 3, vertical: false, role: "Fingers through hair" },
  { term: "EAR MASSAGE", group: "props", tier: 3, vertical: false, role: "Slow ear massage" },
  { term: "FACE BRUSHING", group: "props", tier: 3, vertical: false, role: "Brush across the face" },
];

function el(name, attrs) {
  const node = document.createElementNS(SVG_NS, name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function overlaps(a, b, gap) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap;
}

function svgBox(svg, word, fontPx) {
  const text = el("text", {
    class: "moon-word",
    x: "0",
    y: "0",
    "font-size": fontPx.toFixed(2),
    "font-weight": word.tier === 1 ? "700" : "600",
    "text-anchor": "middle",
    "dominant-baseline": "central",
  });
  text.textContent = word.term;
  text.style.opacity = "0";
  svg.appendChild(text);
  const box = text.getBBox();
  text.remove();
  return word.vertical
    ? { w: box.height, h: box.width }
    : { w: box.width, h: box.height };
}

function measureWord(ctx, svg, word, fontPx) {
  ctx.font = (word.tier === 1 ? "700 " : "600 ") + fontPx.toFixed(2) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
  const metrics = ctx.measureText(word.term);
  const textW = Math.max(metrics.width, (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0));
  const textH = Math.max(
    (metrics.actualBoundingBoxAscent || 0) + (metrics.actualBoundingBoxDescent || 0),
    fontPx * 1.2
  );
  let boxW = word.vertical ? textH : textW;
  let boxH = word.vertical ? textW : textH;
  if (svg) {
    const drawn = svgBox(svg, word, fontPx);
    boxW = Math.max(boxW, drawn.w);
    boxH = Math.max(boxH, drawn.h);
  }
  return { w: boxW + 6, h: boxH + 6 };
}

function fontPx(word, unit, scale, floor) {
  const ratio = word.tier === 1 ? 0.058 : word.tier === 2 ? 0.036 : 0.024;
  const px = unit * ratio * scale;
  if (!floor) return px;
  const min = word.tier === 1 ? 16 : word.tier === 2 ? 11 : 9;
  return Math.max(min, px);
}

function fitsCluster(x, y, w, h, cx, cy, rx, ry, bounds) {
  if (x - w / 2 < bounds.left || x + w / 2 > bounds.right) return false;
  if (y - h / 2 < bounds.top || y + h / 2 > bounds.bottom) return false;
  const nx = (x - cx) / rx;
  const ny = (y - cy) / ry;
  return nx * nx + ny * ny <= 1;
}

function spiralPoints(cx, cy, rx, ry) {
  const pts = [];
  const sx = Math.max(2.5, rx / 90);
  const sy = Math.max(2.5, ry / 70);
  for (let y = cy - ry; y <= cy + ry; y += sy) {
    for (let x = cx - rx; x <= cx + rx; x += sx) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d <= 1) pts.push({ x, y, d });
    }
  }
  pts.sort((a, b) => a.d - b.d || a.x - b.x);
  return pts;
}

function pack(ctx, svg, width, height) {
  const legend = 46;
  const margin = 8;
  const cx = width / 2;
  const rx = (width - margin * 2) / 2;
  const ryMax = (height - legend - margin * 2) / 2;
  const order = WORDS.slice().sort((a, b) => a.tier - b.tier || b.term.length - a.term.length);
  const cache = new Map();
  let placed = [];
  const shapes = [0.62, 0.78, 0.92];
  const scales = [1, 0.86, 0.72, 0.6];
  for (let shape = 0; shape < shapes.length && placed.length !== WORDS.length; shape += 1) {
    const ry = Math.min(rx * shapes[shape], ryMax);
    const cy = Math.min(height * 0.44, height - legend - ry - 6);
    const bounds = {
      left: margin,
      top: Math.max(margin, cy - ry),
      right: width - margin,
      bottom: Math.min(height - legend, cy + ry),
    };
    const points = spiralPoints(cx, cy, rx, ry);
    const unit = Math.min(width, Math.max(ry * 2.1, width * 0.7));
    const narrow = width < 560;
    for (let attempt = 0; attempt < scales.length && placed.length !== WORDS.length; attempt += 1) {
      const scale = scales[attempt];
      const gap = 2;
      placed = [];
      let ok = true;
      for (let i = 0; i < order.length; i += 1) {
        const word = order[i];
        const min = narrow
          ? (word.tier === 1 ? 13 : word.tier === 2 ? 10 : 9)
          : (word.tier === 1 ? 22 : word.tier === 2 ? 14 : 11);
        const size = Math.max(min, fontPx(word, unit, scale, false));
        const key = word.term + "@" + size.toFixed(1);
        let box = cache.get(key);
        if (!box) {
          box = measureWord(ctx, svg, word, size);
          cache.set(key, box);
        }
        let spot = null;
        for (let s = 0; s < points.length; s += 1) {
          const pt = points[s];
          if (!fitsCluster(pt.x, pt.y, box.w, box.h, cx, cy, rx, ry, bounds)) continue;
          const candidate = { x: pt.x, y: pt.y, w: box.w, h: box.h };
          if (placed.some((other) => overlaps(candidate, other, gap))) continue;
          spot = candidate;
          break;
        }
        if (!spot) {
          ok = false;
          break;
        }
        placed.push({ ...word, ...spot, size });
      }
      if (!ok) placed = [];
    }
  }
  placed.sort((a, b) => a.tier - b.tier || a.x - b.x);
  placed.forEach((word, rank) => { word.rank = rank; });
  return { placed, width, height };
}

export function render(container) {
  if (!container) return;
  if (container._moonStop) container._moonStop();
  container.replaceChildren();
  container.classList.add("moon-stage");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const measure = document.createElement("canvas").getContext("2d");
  const svg = el("svg", {
    class: "moon-svg",
    role: "img",
    "aria-label": "Curated ASMR toolkit words",
  });
  const tip = document.createElement("div");
  tip.className = "moon-tip";
  tip.hidden = true;
  const table = document.createElement("table");
  table.className = "sr-only";
  const cap = document.createElement("caption");
  cap.textContent = "Curated ASMR toolkit words";
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Term", "Category", "Role"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  });
  head.appendChild(hr);
  const body = document.createElement("tbody");
  WORDS.forEach((word) => {
    const tr = document.createElement("tr");
    [word.term, GROUP[word.group], word.role].forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
  table.append(cap, head, body);
  container.append(svg, tip, table);

  let nodes = [];
  let pointer = null;
  let layout = null;
  let running = true;
  const track = container.closest(".kit-scroll");

  function draw(width, height) {
    svg.setAttribute("viewBox", "0 0 " + width.toFixed(1) + " " + height.toFixed(1));
    svg.replaceChildren();
    layout = pack(measure, svg, width, height);
    nodes = layout.placed.map((word) => {
      const text = el("text", {
        class: "moon-word",
        x: "0",
        y: "0",
        fill: COLOR[word.group],
        "font-size": word.size.toFixed(2),
        "font-weight": word.tier === 1 ? "700" : "600",
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      text.textContent = word.term;
      text.style.opacity = "0";
      svg.appendChild(text);
      return { word, text };
    });
    const legend = el("g", { class: "moon-legend", transform: "translate(" + (width * 0.08).toFixed(1) + " " + (height - 22).toFixed(1) + ")" });
    [["formats", "Formats"], ["props", "Props"], ["craft", "Craft"]].forEach((item, i) => {
      const x = i * Math.min(168, width * 0.28);
      legend.appendChild(el("circle", { cx: x, cy: 0, r: 5, fill: COLOR[item[0]] }));
      const label = el("text", {
        x: x + 12,
        y: 4,
        fill: "#f0ece3",
        "font-size": "13",
      });
      label.textContent = item[1];
      legend.appendChild(label);
    });
    svg.appendChild(legend);
  }

  function toSvg(event) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !layout) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * layout.width,
      y: ((event.clientY - rect.top) / rect.height) * layout.height,
      sx: event.clientX,
      sy: event.clientY,
    };
  }

  svg.addEventListener("pointermove", (event) => { pointer = toSvg(event); });
  svg.addEventListener("pointerdown", (event) => { pointer = toSvg(event); });
  svg.addEventListener("pointerleave", () => { pointer = null; tip.hidden = true; });

  function revealOf(word, p) {
    const start = 0.05 + word.rank * 0.012;
    return clamp((p - start) / 0.1);
  }

  function apply(p) {
    container.style.setProperty("--p", p.toFixed(4));
    let hit = null;
    let hitDist = Infinity;
    if (pointer) {
      nodes.forEach((node) => {
        const word = node.word;
        const shown = reduced ? 1 : revealOf(word, p);
        if (shown < 0.45) return;
        const near = Math.abs(pointer.x - word.x) * 2 < word.w + 12 && Math.abs(pointer.y - word.y) * 2 < word.h + 12;
        const dist = Math.hypot(pointer.x - word.x, pointer.y - word.y);
        if (near && dist < hitDist) {
          hit = node;
          hitDist = dist;
        }
      });
    }
    nodes.forEach((node) => {
      const shown = reduced ? 1 : revealOf(node.word, p);
      const word = node.word;
      const scale = hit === node ? 1.2 : 1;
      node.text.style.opacity = (hit === node ? 1 : shown).toFixed(3);
      const dy = reduced ? 0 : (1 - shown) * 16;
      const rot = word.vertical ? -90 : 0;
      node.text.setAttribute(
        "transform",
        "translate(" + word.x.toFixed(2) + " " + (word.y + dy).toFixed(2) + ") rotate(" + rot + ") scale(" + scale.toFixed(3) + ")"
      );
    });
    if (hit && pointer) {
      tip.hidden = false;
      tip.textContent = GROUP[hit.word.group] + " · " + hit.word.role;
      tip.style.left = Math.min(window.innerWidth - 180, pointer.sx + 14) + "px";
      tip.style.top = Math.max(8, pointer.sy - 28) + "px";
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

  function frame() {
    if (!running) return;
    if (track) {
      const rect = track.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (rect.bottom < -40 || rect.top > vh + 40) {
        requestAnimationFrame(frame);
        return;
      }
    }
    apply(reduced ? 1 : progress());
    if (!reduced) requestAnimationFrame(frame);
  }

  function layoutNow() {
    const box = container.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) return false;
    draw(box.width, box.height);
    apply(reduced ? 1 : progress());
    return true;
  }

  function boot() {
    if (!running) return;
    if (!layoutNow()) requestAnimationFrame(boot);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutNow, 80);
  }
  window.addEventListener("resize", onResize, { passive: true });
  boot();
  if (reduced) {
    layoutNow();
    apply(1);
  } else {
    requestAnimationFrame(frame);
  }
  container._moonStop = () => {
    running = false;
    window.removeEventListener("resize", onResize);
    clearTimeout(resizeTimer);
  };
}
