/* Hero waveform: summed sines + noise; flattens with scroll. No libraries. */
(function () {
  const canvas = document.getElementById("hero-waveform");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  let raf = 0;
  let last = 0;
  const FPS = 30;
  const FRAME = 1000 / FPS;
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function cssAccent() {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    return v || "#e0a43a";
  }

  function size() {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 320);
    const h = Math.max(1, canvas.clientHeight || 48);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function scrollProgress() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function draw(staticAmp) {
    const { w, h } = size();
    ctx.clearRect(0, 0, w, h);
    const p = staticAmp != null ? staticAmp : scrollProgress();
    const amp = 1 - Math.pow(p, 0.8);
    const mid = h / 2;
    const accent = cssAccent();
    ctx.beginPath();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x++) {
      const t = x / Math.max(1, w);
      const s =
        Math.sin(t * Math.PI * 6) * 0.45 +
        Math.sin(t * Math.PI * 13.3) * 0.28 +
        Math.sin(t * Math.PI * 23.7 + 0.4) * 0.15;
      const noise = (Math.sin(x * 12.9898) * 43758.5453) % 1;
      const n = (noise - 0.5) * 0.12;
      const y = mid + (s + n) * mid * 0.85 * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
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
      draw(0.35);
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  // Do not block touch scrolling
  canvas.style.pointerEvents = "none";
  canvas.setAttribute("aria-hidden", "true");

  window.addEventListener("scroll", () => {
    if (reduced) draw(1 - Math.pow(scrollProgress(), 0.8));
  }, { passive: true });
  window.addEventListener("resize", () => draw(), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else start();
  });

  start();
})();
