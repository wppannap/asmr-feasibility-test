/* Scene 0 — smaller bed, one font, scattered thoughts that do not overlap. */
(function () {
  const root = document.getElementById("intro-night");
  const pin = root && root.querySelector(".intro-pin");
  const fig = root && root.querySelector(".intro-sleeper");
  const title = pin && pin.querySelector(".intro-title");
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

  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function place(attempt) {
    const w = pin.clientWidth;
    const h = pin.clientHeight;
    if (!w || !h) return;
    const attemptN = attempt || 0;
    const narrow = w < 720;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const minPx = 0.95 * rootPx;
    const maxPx = Math.max(minPx, Math.min(1.65 * rootPx, w * 0.0175));
    const shrink = Math.max(0.68, 1 - attemptN * 0.05);
    const ex = exclusion();
    const gap = narrow ? 6 : GAP;
    const x0 = w * 0.04;
    const y0 = h * 0.06;
    const x1 = w * 0.94;
    const y1 = Math.min(h * 0.92, h - 48);
    const flankRoom = Math.max(0, Math.min(ex.x - x0, x1 - (ex.x + ex.w)) - 4);
    const flankCap = Math.max(40, flankRoom);
    const bodyCap = narrow ? Math.min(128, (x1 - x0) * 0.42) : Math.min(230, w * 0.2);
    nodes.forEach((el, i) => {
      const flank = el.textContent.length <= (narrow ? 32 : 42);
      const size = (narrow ? minPx : minPx + halton(i, 5) * (maxPx - minPx)) * shrink;
      el.dataset.flank = flank ? "1" : "0";
      el.style.fontFamily = "var(--font-ui)";
      el.style.fontSize = size.toFixed(2) + "px";
      el.style.lineHeight = "1.18";
      el.style.maxWidth = (flank ? flankCap : bodyCap).toFixed(1) + "px";
      el.style.left = "0px";
      el.style.top = "0px";
    });

    const items = nodes.map((el, i) => {
      const r = el.getBoundingClientRect();
      return { i, w: r.width, h: r.height, x: x0, y: y0, flank: el.dataset.flank === "1" };
    });
    const placed = [];
    const rng = mulberry32(0xa5c31 + attemptN * 97);
    let packGap = gap;

    function linedUp(box) {
      let xHits = 0;
      let yHits = 0;
      for (let n = 0; n < placed.length; n++) {
        const p = placed[n];
        if (Math.abs(box.x - p.x) < 16 && Math.abs(box.y - p.y) > 8) xHits += 1;
        if (Math.abs(box.y - p.y) < 10 && Math.abs(box.x - p.x) > 16) yHits += 1;
      }
      return xHits >= 2 || yHits >= 2;
    }

    function free(box, strict) {
      if (box.x < x0 - 0.5 || box.y < y0 - 0.5) return false;
      if (box.x + box.w > x1 + 0.5 || box.y + box.h > y1 + 0.5) return false;
      if (hits(box, ex, 8)) return false;
      for (let n = 0; n < placed.length; n++) if (hits(box, placed[n], packGap)) return false;
      if (strict && linedUp(box)) return false;
      return true;
    }

    function dart(it, strict) {
      for (let k = 0; k < 360; k++) {
        let x;
        let y;
        const useFlank = it.flank && k < 180 && flankRoom + 1 >= it.w && ex.h > it.h + 4;
        if (useFlank) {
          const left = rng() < 0.5;
          const span = Math.max(0, flankRoom - it.w);
          x = left ? x0 + rng() * span : ex.x + ex.w + 4 + rng() * span;
          y = ex.y + 4 + rng() * Math.max(0, ex.h - it.h - 8);
        } else {
          x = x0 + rng() * Math.max(0, x1 - x0 - it.w);
          y = y0 + rng() * Math.max(0, y1 - y0 - it.h);
        }
        const trial = { x: x, y: y, w: it.w, h: it.h };
        if (free(trial, strict)) return trial;
      }
      return null;
    }

    function scan(it, strict) {
      const step = strict ? 11 : 4;
      const maxW = x1 - it.w;
      const maxH = y1 - it.h;
      if (maxW < x0 || maxH < y0) return null;
      const xs = [];
      const ys = [];
      for (let x = x0; x <= maxW + 0.1; x += step) xs.push(x);
      for (let y = y0; y <= maxH + 0.1; y += step) ys.push(y);
      if (!xs.length || !ys.length) return null;
      const xShift = it.i % xs.length;
      const yShift = (it.i * 3) % ys.length;
      for (let row = 0; row < ys.length; row++) {
        for (let col = 0; col < xs.length; col++) {
          const trial = {
            x: xs[(col + xShift) % xs.length],
            y: ys[(row + yShift) % ys.length],
            w: it.w,
            h: it.h,
          };
          if (free(trial, strict)) return trial;
        }
      }
      return null;
    }

    if (narrow) {
      const leftG = { x: x0, y: ex.y + 6, w: Math.max(0, ex.x - 8 - x0), h: Math.max(0, ex.h - 12) };
      const rightG = { x: ex.x + ex.w + 8, y: ex.y + 6, w: Math.max(0, x1 - (ex.x + ex.w + 8)), h: Math.max(0, ex.h - 12) };
      const top = { x: x0, y: y0, w: x1 - x0, h: Math.max(0, ex.y - 4 - y0) };
      const bottom = { x: x0, y: ex.y + ex.h + 4, w: x1 - x0, h: Math.max(0, y1 - (ex.y + ex.h + 4)) };
      nodes.forEach((el) => {
        el.style.lineHeight = "1.15";
      });
      function gutterSlots(gutter, outer) {
        const gap = 16;
        const a = outer ? gutter.x + gutter.w - Math.min(34, gutter.w) : gutter.x;
        const b = outer ? a - gap : a + gap;
        const widthA = outer ? gutter.x + gutter.w - a : b - a;
        const widthB = outer ? a - b : gutter.x + gutter.w - b;
        const third = gutter.h / 3;
        return [
          { x: a, y: gutter.y, w: Math.max(24, widthA), h: third - 6 },
          { x: a, y: gutter.y + third, w: Math.max(24, widthA), h: third - 6 },
          { x: b, y: gutter.y + third * 2, w: Math.max(24, widthB), h: third - 6 },
        ];
      }
      const flankSlots = gutterSlots(leftG, false).concat(gutterSlots(rightG, true));
      const leftLimit = leftG.x + leftG.w + 16;
      const rightLimit = rightG.x - 16;
      function bandSlots(region) {
        const rows = 2;
        const cols = 5;
        const rowH = region.h / rows;
        const origin = leftLimit;
        const pitch = (rightLimit - origin - 16) / cols;
        const boxW = Math.max(36, pitch - 6);
        const slots = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            slots.push({
              x: origin + c * pitch + (r % 2) * 16,
              y: region.y + r * rowH + (c % 3) * 10,
              w: boxW,
              h: rowH - 28,
            });
          }
        }
        return slots;
      }
      const bodySlots = bandSlots(top).concat(bandSlots(bottom));
      const flankItems = items.slice().sort((a, b) => nodes[a.i].textContent.length - nodes[b.i].textContent.length).slice(0, flankSlots.length);
      const flankSet = {};
      flankItems.forEach((it) => { flankSet[it.i] = true; });
      const bodyItems = items.filter((it) => !flankSet[it.i]);
      function fit(it, slot, px) {
        const el = nodes[it.i];
        el.style.fontSize = px + "px";
        el.style.maxWidth = Math.max(40, slot.w) + "px";
        const r = el.getBoundingClientRect();
        it.w = r.width;
        it.h = r.height;
        return it.h <= slot.h + 0.5 && it.w <= slot.w + 1;
      }
      flankItems.forEach((it, n) => {
        const slot = flankSlots[n];
        fit(it, slot, 12) || fit(it, slot, 11) || fit(it, slot, 10);
        it.x = slot.x;
        it.y = slot.y;
        placed.push(it);
      });
      bodyItems.forEach((it, n) => {
        const slot = bodySlots[n % bodySlots.length];
        fit(it, slot, 12) || fit(it, slot, 11) || fit(it, slot, 10);
        it.x = slot.x;
        it.y = slot.y;
        placed.push(it);
      });
    } else {
      items.slice().sort((a, b) => b.h - a.h).forEach((it) => {
        const chosen = dart(it, true) || scan(it, true) || dart(it, false) || scan(it, false);
        if (!chosen) return;
        it.x = chosen.x;
        it.y = chosen.y;
        placed.push(it);
      });
    }
    nodes.forEach((el, i) => {
      el.style.left = items[i].x.toFixed(1) + "px";
      el.style.top = items[i].y.toFixed(1) + "px";
    });
  }

  function tick() {
    const rect = root.getBoundingClientRect();
    const total = root.offsetHeight - window.innerHeight;
    const passed = Math.min(Math.max(-rect.top, 0), total);
    const t = total > 0 ? passed / total : 0;
    const fadeOut = t > 0.86 ? Math.max(0, 1 - (t - 0.86) / 0.12) : 1;
    const titleFade = Math.min(1, Math.max(0, t / 0.18));
    const titleOp = 1 - titleFade * titleFade * (3 - 2 * titleFade);
    const sceneIn = t <= 0.26 ? 0 : Math.min(1, (t - 0.26) / 0.08);
    fig.style.opacity = String(sceneIn * fadeOut);
    if (title) title.style.opacity = String(titleOp);
    if (cue) cue.style.opacity = String(titleOp * 0.85);
    nodes.forEach((el, i) => {
      const start = 0.26 + (i / (nodes.length - 1)) * 0.48;
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
