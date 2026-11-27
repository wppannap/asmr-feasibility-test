/* The Fade-Out — mirrored editor waveform. Scroll and pointer only. No buttons. */
const PROPS = [
  { name: "Earpick", caption: "Bamboo earpick", at: 0.16, img: "img/props/stage1_props.jpg?v=20261127c", alt: "Bamboo earpick beside a glowing picking pad", x: "7%", y: "10%" },
  { name: "Brush", caption: "Brush and sponge", at: 0.5, img: "img/props/stage2_props.jpg?v=20261127c", alt: "Fluffy makeup brush beside a soft foam sponge", x: "38%", y: "68%" },
  { name: "Whisper", caption: "Snow mic whisper", at: 0.82, img: "img/props/stage3_props.jpg?v=20261127c", alt: "A bag of snow beads beside a microphone with a fluffy windscreen", x: "72%", y: "16%" },
];

const SEGMENTS = [
  ["Earpick", "1.00", "0.85"],
  ["Brush", "0.55", "0.25"],
  ["Whisper", "0.18", "0.04"],
];

function clamp(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
  return node;
}

function hash(i) {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function baseEnergy(x) {
  if (x < 0.33) return 1 - (1 - 0.85) * (x / 0.33);
  if (x < 0.66) return 0.55 - (0.55 - 0.25) * ((x - 0.33) / 0.33);
  return 0.18 - (0.18 - 0.04) * ((x - 0.66) / 0.34);
}

function mixHex(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

function tone(x) {
  if (x < 0.45) return mixHex("#f4a259", "#e87a64", x / 0.45);
  return mixHex("#e87a64", "#56c2d6", (x - 0.45) / 0.55);
}

function buildBars(n) {
  const bars = [];
  for (let i = 0; i < n; i += 1) {
    const u = i / (n - 1);
    const x = Math.pow(u, 1.48);
    const h = hash(i + 3);
    let e = baseEnergy(x);
    let spike = false;
    if (x < 0.33 && h < 0.17) {
      e = Math.min(1, e * (3 + hash(i + 91) * 3));
      spike = true;
    } else if (x < 0.66 && h < 0.05) {
      e = Math.min(0.7, e * (1.5 + hash(i + 17) * 0.7));
    } else if (x >= 0.965) {
      e = 0.04;
    } else if (x >= 0.66) {
      e *= 0.84 + 0.16 * Math.sin(x * 21);
    } else {
      e *= 0.78 + hash(i + 8) * 0.28;
    }
    bars.push({ x, e: Math.max(0.02, e), spike, burst: false });
  }
  return bars;
}

function energyAt(x) {
  return baseEnergy(clamp(x));
}

export function render(container) {
  if (!container) return;
  if (container._fadeStop) container._fadeStop();
  container.replaceChildren();
  container.classList.add("fx-stage");

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const narrow = window.matchMedia("(max-width: 820px)").matches;
  const bars = buildBars(narrow ? 120 : 220);
  const track = container.closest(".onset-scroll");

  const vignette = document.createElement("div");
  vignette.className = "fx-vignette";
  const canvas = document.createElement("canvas");
  canvas.className = "fx-sparks";
  canvas.setAttribute("aria-hidden", "true");
  const svg = svgEl("svg", {
    class: "fx-wave",
    viewBox: "0 0 1200 700",
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": "Mirrored waveform fading from earpick transients to a whisper",
  });
  const leaders = svgEl("svg", { class: "fx-leaders", "aria-hidden": "true" });

  const VB_W = 1200;
  const MID = 348;
  const LEFT = 92;
  const RIGHT = 1152;

  const vu = svgEl("g", { class: "fx-vu" });
  const vuSegs = [];
  for (let i = 0; i < 10; i += 1) {
    const seg = svgEl("rect", {
      x: 28,
      y: MID - 120 + (9 - i) * 16,
      width: 10,
      height: 11,
      rx: 2,
      fill: "#f0ece3",
      "fill-opacity": "0.06",
    });
    vu.appendChild(seg);
    vuSegs.push(seg);
  }
  svg.appendChild(vu);

  function geom(bar) {
    const px = LEFT + bar.x * (RIGHT - LEFT);
    const h = Math.max(1.4, bar.e * 292);
    const w = 3.6 * (1 - bar.x) + 0.65;
    return { px, y: MID - h / 2, h, w };
  }

  const nodes = bars.map((bar) => {
    const g = geom(bar);
    const rect = svgEl("rect", {
      x: (g.px - g.w / 2).toFixed(2),
      y: g.y.toFixed(2),
      width: g.w.toFixed(2),
      height: g.h.toFixed(2),
      rx: (g.w / 2).toFixed(2),
      fill: "#f0ece3",
      "fill-opacity": "0.12",
    });
    svg.appendChild(rect);
    return rect;
  });

  const breath = svgEl("line", {
    x1: LEFT + 0.965 * (RIGHT - LEFT),
    x2: RIGHT,
    y1: MID,
    y2: MID,
    stroke: "#56c2d6",
    "stroke-width": "1.2",
    "stroke-linecap": "round",
    "stroke-opacity": "0.12",
  });
  svg.appendChild(breath);

  const playhead = svgEl("line", {
    x1: LEFT, x2: LEFT, y1: 120, y2: 580,
    stroke: "#f4a259", "stroke-width": "1.4", "stroke-linecap": "round",
  });
  svg.appendChild(playhead);

  const knob = svgEl("g", { transform: "translate(1118 56)" });
  knob.appendChild(svgEl("circle", { r: 20, fill: "none", stroke: "#98a4be", "stroke-width": "1.25" }));
  knob.appendChild(svgEl("circle", { r: 3, fill: "#f0ece3" }));
  const needle = svgEl("line", { x1: 0, y1: 0, x2: 0, y2: -13, stroke: "#f0ece3", "stroke-width": "2", "stroke-linecap": "round" });
  knob.appendChild(needle);
  svg.appendChild(knob);

  const propEls = PROPS.map((prop) => {
    const el = document.createElement("figure");
    el.className = "fx-prop";
    el.style.left = prop.x;
    el.style.top = prop.y;
    const img = document.createElement("img");
    img.src = prop.img;
    img.alt = prop.alt;
    const cap = document.createElement("figcaption");
    cap.textContent = prop.caption;
    el.append(img, cap);
    return { ...prop, el, img };
  });

  const table = document.createElement("table");
  table.className = "sr-only";
  const caption = document.createElement("caption");
  caption.textContent = "Fade-out energy by segment";
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Segment", "Energy start", "Energy end"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  const tbody = document.createElement("tbody");
  SEGMENTS.forEach((row) => {
    const tr = document.createElement("tr");
    row.forEach((cell) => {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.append(caption, thead, tbody);

  container.append(vignette, canvas, svg, leaders, ...propEls.map((p) => p.el), table);

  const ctx = canvas.getContext("2d");
  const sparks = [];
  let litUntil = -1;
  let audioHooked = false;
  let restoreTo = 0.8;
  let restoreRaf = 0;

  function paintBar(i, lit) {
    const bar = bars[i];
    const node = nodes[i];
    if (!lit) {
      node.setAttribute("fill", "#f0ece3");
      node.setAttribute("fill-opacity", "0.12");
      node.removeAttribute("stroke");
      node.style.filter = "";
      return;
    }
    const color = tone(bar.x);
    node.setAttribute("fill", color);
    node.setAttribute("fill-opacity", "0.94");
    node.setAttribute("stroke", color);
    node.setAttribute("stroke-width", (bar.x < 0.33 ? 1.15 : bar.x < 0.66 ? 0.7 : 0.35).toFixed(2));
    node.style.filter = "";
  }

  function lightTo(p) {
    let idx = -1;
    for (let i = 0; i < bars.length; i += 1) if (bars[i].x <= p) idx = i;
    const from = Math.min(litUntil, idx);
    const to = Math.max(litUntil, idx);
    for (let i = Math.max(0, from); i <= to; i += 1) paintBar(i, i <= idx);
    litUntil = idx;
    if (!reduced) {
      for (let i = 0; i <= idx; i += 1) {
        const bar = bars[i];
        if (!bar.spike || bar.burst) continue;
        bar.burst = true;
        const g = geom(bar);
        for (let k = 0; k < 4 && sparks.length < 120; k += 1) {
          sparks.push({
            x: g.px / VB_W, y: 0.5 + (hash(i * 13 + k) - 0.5) * bar.e * 0.45,
            vx: (hash(k + 4) - 0.5) * 0.35,
            vy: (hash(k + 9) - 0.5) * 0.55,
            life: 1, kind: 1,
          });
        }
      }
    }
  }

  function syncAudio(inView, e) {
    const audio = document.getElementById("asmr-audio");
    const btn = document.getElementById("asmr-play");
    if (!audio || !btn) return;
    const playing = btn.classList.contains("is-playing") && !audio.paused;
    if (inView && playing) {
      if (!audioHooked) {
        audioHooked = true;
        restoreTo = audio.volume > 0.05 ? audio.volume : 0.8;
      }
      audio.volume = 0.2 + 0.8 * clamp(e);
      return;
    }
    if (!audioHooked) return;
    audioHooked = false;
    const start = audio.volume;
    const target = restoreTo;
    const t0 = performance.now();
    cancelAnimationFrame(restoreRaf);
    function step(now) {
      if (audioHooked) return;
      const k = Math.min(1, (now - t0) / 300);
      if (btn.classList.contains("is-playing") && !audio.paused) {
        audio.volume = start + (target - start) * k;
      }
      if (k < 1) restoreRaf = requestAnimationFrame(step);
    }
    restoreRaf = requestAnimationFrame(step);
  }

  function placeLeaders(p) {
    const box = container.getBoundingClientRect();
    if (box.width < 2) return;
    leaders.setAttribute("viewBox", "0 0 " + box.width.toFixed(1) + " " + box.height.toFixed(1));
    const wave = svg.getBoundingClientRect();
    leaders.replaceChildren();
    propEls.forEach((prop) => {
      const local = clamp((p - prop.at) / 0.06);
      prop.el.style.opacity = local.toFixed(3);
      prop.el.style.transform = "translateY(" + ((1 - local) * 14).toFixed(1) + "px)";
      const eHere = energyAt(Math.min(p, 0.999));
      prop.img.style.filter = "saturate(" + (0.15 + 0.85 * eHere).toFixed(3) + ")";
      if (local <= 0.02) return;
      const pr = prop.el.getBoundingClientRect();
      const x1 = wave.left - box.left + (wave.width * (LEFT + prop.at * (RIGHT - LEFT))) / VB_W;
      const y1 = wave.top - box.top + (wave.height * MID) / 700;
      const x2 = pr.left + pr.width * 0.5 - box.left;
      const y2 = pr.top + (prop.y.startsWith("6") ? 0 : pr.height) - box.top;
      const bend = (prop.at < 0.4 ? -36 : 28);
      const path = svgEl("path", {
        d: "M " + x1.toFixed(1) + " " + y1.toFixed(1) + " Q " + ((x1 + x2) / 2 + bend).toFixed(1) + " " + ((y1 + y2) / 2).toFixed(1) + " " + x2.toFixed(1) + " " + y2.toFixed(1),
        fill: "none",
        stroke: tone(prop.at),
        "stroke-width": "1",
        "stroke-opacity": (0.45 * local).toFixed(3),
      });
      leaders.appendChild(path);
    });
  }

  function resizeCanvas() {
    const box = container.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * dpr));
    canvas.height = Math.max(1, Math.round(box.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSparks(dt, p, e) {
    const box = container.getBoundingClientRect();
    ctx.clearRect(0, 0, box.width, box.height);
    if (reduced || p > 0.96) {
      sparks.length = 0;
      return;
    }
    const seg = p < 0.33 ? 1 : p < 0.66 ? 2 : 3;
    let spawn = 0;
    if (seg === 1) spawn = Math.round(e * 1.5);
    else if (seg === 2) spawn = e > 0.3 && hash(Math.floor(performance.now() / 80)) < 0.4 ? 1 : 0;
    else spawn = e > 0.06 && hash(Math.floor(performance.now() / 180)) < 0.25 ? 1 : 0;
    for (let s = 0; s < spawn && sparks.length < 120; s += 1) {
      sparks.push({
        x: p, y: 0.5,
        vx: seg === 1 ? (Math.random() - 0.5) * 0.25 : (Math.random() - 0.5) * 0.04,
        vy: seg === 3 ? -0.02 : (Math.random() - 0.5) * 0.08,
        life: 1,
        kind: seg,
      });
    }
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const s = sparks[i];
      s.life -= dt * (s.kind === 1 ? 0.85 : s.kind === 2 ? 0.35 : 0.18);
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, s.life) * (s.kind === 1 ? 0.85 : 0.45);
      ctx.fillStyle = s.kind === 3 ? "#56c2d6" : s.kind === 2 ? "#e7d7c4" : "#f4a259";
      const px = s.x * box.width;
      const py = s.y * box.height;
      ctx.beginPath();
      ctx.arc(px, py, s.kind === 1 ? 1.7 : 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  let running = true;

  function apply(p, now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    container.style.setProperty("--p", p.toFixed(4));
    const head = LEFT + p * (RIGHT - LEFT);
    playhead.setAttribute("x1", head.toFixed(1));
    playhead.setAttribute("x2", head.toFixed(1));
    playhead.setAttribute("stroke", tone(p));
    const e = p >= 0.965 ? 0.04 * (reduced ? 1 : 0.65 + 0.35 * Math.sin(now / 1000 * Math.PI * 2 * 0.25)) : energyAt(p);
    vuSegs.forEach((seg, i) => {
      const on = i < Math.round(clamp(e) * 10);
      seg.setAttribute("fill-opacity", on ? "0.28" : "0.05");
    });
    const breathe = reduced ? 0 : Math.sin(now / 1000 * Math.PI * 2 * 0.25) * 5;
    breath.setAttribute("y1", (MID + breathe).toFixed(2));
    breath.setAttribute("y2", (MID + breathe).toFixed(2));
    breath.setAttribute("stroke-opacity", p >= 0.9 ? "0.85" : "0.12");
    breath.setAttribute("stroke-width", p >= 0.9 ? "1.1" : "1.2");
    const angle = -140 + p * 280;
    needle.setAttribute("transform", "rotate(" + angle.toFixed(1) + ")");
    lightTo(p);
    placeLeaders(p);
    drawSparks(dt || 0.016, p, e);
    const rect = track ? track.getBoundingClientRect() : container.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const inView = rect.top < vh * 0.92 && rect.bottom > vh * 0.08;
    syncAudio(inView, e);
  }

  function progress() {
    if (!track) return 0;
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

  resizeCanvas();
  if (reduced) {
    bars.forEach((bar) => { bar.burst = true; });
    apply(1, performance.now());
  } else {
    requestAnimationFrame(frame);
  }

  function onResize() {
    resizeCanvas();
    if (reduced) apply(1, performance.now());
  }
  window.addEventListener("resize", onResize, { passive: true });
  container._fadeStop = () => {
    running = false;
    window.removeEventListener("resize", onResize);
    cancelAnimationFrame(restoreRaf);
  };
}
