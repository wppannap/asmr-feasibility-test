/* Hero soundwave field: layered sines + particles; flattens past the hero. */
(function () {
  const canvas = document.getElementById("hero-waveform");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  let raf = 0;
  let last = 0;
  let t0 = performance.now();
  const FPS = 30;
  const FRAME = 1000 / FPS;
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const particles = Array.from({ length: 28 }, (_, i) => ({
    x: (i * 37.1) % 1,
    y: 0.2 + ((i * 17.3) % 60) / 100,
    r: 0.6 + (i % 4) * 0.35,
    vx: 0.00015 + (i % 5) * 0.00004,
    phase: i * 0.7,
  }));

  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  }

  function size() {
    const w = Math.max(
      1,
      canvas.clientWidth || canvas.parentElement?.clientWidth || 320
    );
    const h = Math.max(1, canvas.clientHeight || 160);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  /** 0 at top of page → 1 once scrolled past hero. */
  function heroProgress() {
    const hero = document.getElementById("top");
    if (!hero) return Math.min(1, window.scrollY / Math.max(1, window.innerHeight));
    const rect = hero.getBoundingClientRect();
    const span = Math.max(1, hero.offsetHeight * 0.85);
    const gone = Math.min(span, Math.max(0, -rect.top));
    return Math.min(1, gone / span);
  }

  function ribbon(w, h, mid, amp, time, color, width, layers) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.35 + amp * 0.45;
    for (let x = 0; x <= w; x++) {
      const t = x / Math.max(1, w);
      let s = 0;
      layers.forEach(([freq, weight, phase]) => {
        s += Math.sin(t * Math.PI * freq + time * phase) * weight;
      });
      const y = mid + s * mid * 0.72 * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function draw(forceAmp) {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const p = forceAmp != null ? 1 - forceAmp : heroProgress();
    const amp = 1 - Math.pow(p, 0.8);
    const mid = h * 0.52;
    const accent = cssVar("--accent", "#e0a43a");
    const neg = cssVar("--neg", "#3fa7a0");
    const time = (performance.now() - t0) / 1000;

    // Soft ambient particles (fade with amp)
    if (amp > 0.02) {
      particles.forEach((pt) => {
        pt.x = (pt.x + pt.vx * (0.4 + amp)) % 1;
        const px = pt.x * w;
        const py =
          mid +
          Math.sin(time * 0.6 + pt.phase) * mid * 0.35 * amp +
          (pt.y - 0.5) * h * 0.15;
        ctx.beginPath();
        ctx.fillStyle = pt.phase % 2 < 1 ? accent : neg;
        ctx.globalAlpha = 0.12 + amp * 0.28;
        ctx.arc(px, py, pt.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    }

    // Layered ribbons
    ribbon(
      w,
      h,
      mid - 6,
      amp,
      time,
      neg,
      1,
      [
        [4.2, 0.22, 0.4],
        [9.1, 0.14, -0.25],
        [17.5, 0.08, 0.7],
      ]
    );
    ribbon(
      w,
      h,
      mid,
      amp,
      time,
      accent,
      1.25,
      [
        [5.5, 0.38, 0.55],
        [12.4, 0.22, -0.35],
        [21.0, 0.12, 0.9],
      ]
    );
    ribbon(
      w,
      h,
      mid + 8,
      amp * 0.85,
      time,
      accent,
      1,
      [
        [7.2, 0.18, -0.5],
        [15.3, 0.1, 0.3],
      ]
    );

    // Quiet sleep line (always present; dominates as amp → 0)
    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35 + (1 - amp) * 0.65;
    for (let x = 0; x <= w; x++) {
      const t = x / Math.max(1, w);
      const whisper = amp > 0.01 ? Math.sin(t * Math.PI * 2.2 + time * 0.2) * 1.2 * amp : 0;
      const y = mid + whisper;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function tick(ts) {
    if (document.hidden) {
      raf = 0;
      return;
    }
    if (ts - last >= FRAME) {
      last = ts;
      draw();
    }
    raf = requestAnimationFrame(tick);
  }

  function start() {
    if (reduced) {
      draw(0.2);
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  canvas.style.pointerEvents = "none";
  canvas.setAttribute("aria-hidden", "true");

  window.addEventListener(
    "scroll",
    () => {
      if (reduced) draw(1 - Math.pow(heroProgress(), 0.8));
    },
    { passive: true }
  );
  window.addEventListener("resize", () => draw(), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  start();
})();
