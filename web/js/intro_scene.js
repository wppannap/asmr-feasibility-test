/* Scene 0 — smaller bed, one font, scattered thoughts that do not overlap. */
(function () {
  const root = document.getElementById("intro-night");
  const pin = root && root.querySelector(".intro-pin");
  const fig = root && root.querySelector(".intro-sleeper");
  const host = document.getElementById("intro-danmaku");
  const cue = document.getElementById("intro-cue");
  if (!root || !pin || !host || !fig) return;

  const lines = [
    "I'm so tired but I can't sleep.",
    "I have an exam tomorrow, help 😭",
    "Please let me fall asleep tonight.",
    "I can't sleep without ASMR anymore.",
    "This is the only thing that helps me sleep.",
    "My mind won't stop thinking.",
    "I'm so stressed. I just want to sleep.",
    "It's 3 AM and I'm still awake...",
    "One more video and I promise I'll sleep.",
    "Anyone else can't sleep without listening to this?",
    "Why is my brain loudest at 2 AM?",
    "Just 10 more minutes of rain and whispering...",
    "Counting sheep hasn't worked since 2016.",
    "Exhausted all day, wide awake the second I hit the pillow.",
    "Tapping sounds are literally my lullaby now.",
    "6 hours of sleep if I fall asleep right now...",
    "5 hours and 42 minutes if I fall asleep right now...",
    "Earphones in, world off.",
    "Please brain, shut down.",
    "Why am I replaying a conversation from 2019?",
    "ASMR is doing more for my sleep than melatonin.",
    "Everyone's asleep and I'm still staring at the ceiling.",
    "Soft spoken voices are the only thing that calms me down.",
    "Promised myself I'd sleep at 11. It's 3:14 AM.",
    "Just let me drift off already...",
    "Thank you for keeping me company at 3 AM.",
  ];

  const tiers = [0.65, 0.78, 0.88, 0.98];
  const nodes = lines.map((text, i) => {
    const p = document.createElement("p");
    p.className = "thought";
    p.textContent = text;
    p.dataset.tier = String(tiers[i % tiers.length]);
    host.appendChild(p);
    return p;
  });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const GAP = 10;

  function halton(index, base) {
    let f = 1;
    let r = 0;
    let n = index + 1;
    while (n > 0) {
      f /= base;
      r += f * (n % base);
      n = Math.floor(n / base);
    }
    return r;
  }

  function hits(a, b, gap) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  }

  function exclusion() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    const narrow = w < 720;
    const bedW = narrow ? 200 : Math.min(250, w * 0.54);
    const bedH = bedW * (913 / 1024);
    const pad = narrow ? 16 : 22;
    const cx = w / 2;
    const cy = h * 0.48;
    return {
      x: cx - bedW / 2 - pad,
      y: cy - bedH / 2 - pad,
      w: bedW + pad * 2,
      h: bedH + pad * 2,
    };
  }

  function pushFrom(box, block) {
    if (!hits(box, block, 0)) return;
    const penL = box.x + box.w - block.x;
    const penR = block.x + block.w - box.x;
    const penU = box.y + box.h - block.y;
    const penD = block.y + block.h - box.y;
    const m = Math.min(penL, penR, penU, penD);
    if (m === penL) box.x = block.x - box.w - GAP;
    else if (m === penR) box.x = block.x + block.w + GAP;
    else if (m === penU) box.y = block.y - box.h - GAP;
    else box.y = block.y + block.h + GAP;
  }

  function place() {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    const narrow = w < 720;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const minPx = 0.95 * rootPx;
    const maxPx = Math.max(minPx, Math.min(1.65 * rootPx, w * 0.0175));
    const cueH = 42;
    const ex = exclusion();
    const gap = narrow ? 4 : GAP;
    const bands = [
      { x: 8, y: 6, w: w - 16, h: Math.max(40, ex.y - 10) },
      { x: 8, y: ex.y + ex.h + 10, w: w - 16, h: Math.max(40, h - (ex.y + ex.h) - cueH) },
    ];
    const colCount = narrow ? 2 : 4;
    const cols = [];
    bands.forEach((band) => {
      const colW = (band.w - gap * (colCount - 1)) / colCount;
      for (let c = 0; c < colCount; c++) {
        cols.push({
          x: band.x + c * (colW + gap),
          y: band.y,
          w: colW,
          maxY: band.y + band.h,
          cursor: band.y,
        });
      }
    });
    nodes.forEach((el, i) => {
      const size = narrow ? minPx : minPx + halton(i, 5) * (maxPx - minPx);
      el.style.fontFamily = "var(--font-ui)";
      el.style.fontSize = size.toFixed(2) + "px";
      el.style.lineHeight = narrow ? "1.12" : "1.2";
      el.style.maxWidth = Math.max(40, cols[0].w - 2).toFixed(1) + "px";
      el.style.left = "0px";
      el.style.top = "0px";
    });
    const items = nodes.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, w: r.width, h: r.height, x: 8, y: 6 };
    });
    const order = items.slice().sort((a, b) => b.h - a.h || a.i - b.i);
    order.forEach((it, n) => {
      const start = n % cols.length;
      let col = null;
      for (let k = 0; k < cols.length; k++) {
        const candidate = cols[(start + k) % cols.length];
        if (candidate.cursor + it.h <= candidate.maxY + 0.5) {
          col = candidate;
          break;
        }
      }
      if (!col) col = cols.slice().sort((a, b) => (a.maxY - a.cursor) - (b.maxY - b.cursor)).pop();
      const slack = Math.max(0, col.w - it.w);
      it.x = col.x + halton(it.i + 1, 2) * slack;
      it.y = col.cursor;
      col.cursor = it.y + it.h + gap;
    });
    nodes.forEach((el, i) => {
      const box = items[i];
      box.x = Math.max(4, Math.min(w - box.w - 4, box.x));
      box.y = Math.max(4, Math.min(h - box.h - cueH, box.y));
      el.style.left = box.x.toFixed(1) + "px";
      el.style.top = box.y.toFixed(1) + "px";
    });
  }

  function tick() {
    const rect = root.getBoundingClientRect();
    const total = root.offsetHeight - window.innerHeight;
    const passed = Math.min(Math.max(-rect.top, 0), total);
    const t = total > 0 ? passed / total : 0;
    const fadeOut = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.12) : 1;
    fig.style.opacity = String(Math.min(1, t / 0.1) * fadeOut);
    if (cue) cue.style.opacity = String(t < 0.06 ? 0.85 : Math.max(0, 0.85 - (t - 0.06) / 0.06));
    nodes.forEach((el, i) => {
      const start = 0.04 + (i / (nodes.length - 1)) * 0.68;
      const local = Math.min(1, Math.max(0, (t - start) / 0.045));
      const tier = Number(el.dataset.tier) || 0.9;
      el.style.opacity = String(local * fadeOut * tier);
      if (reduce) el.style.transform = "none";
    });
  }

  window.addEventListener("scroll", tick, { passive: true });
  window.addEventListener("resize", function () { place(); tick(); }, { passive: true });
  place();
  requestAnimationFrame(function () { place(); tick(); });
  tick();
})();
