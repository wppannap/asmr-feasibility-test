/* Scroll fade-in / fade-out. No pinning. One passive frame for every story block. */
(function () {
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const nodes = () =>
    document.querySelectorAll(
      ".story-scene > .story-title, .story-scene > .story-kpis, .story-scene > .story-key, .story-scene > .story-graphic, .story-scene > .story-beat, .hero > .hero-brand, .hero > .hero-line, .hero > .asmr-play, .hero > .asmr-audio-hint, .hero > .hero-waveform, .hero > .story-beat, .site-footer"
    );

  function showAll() {
    nodes().forEach((el) => {
      el.style.opacity = "1";
      el.style.transform = "none";
    });
  }

  if (reduced) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showAll);
    else showAll();
    return;
  }

  let scheduled = false;

  function clamp(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function frame() {
    scheduled = false;
    const vh = window.innerHeight || 1;
    const list = nodes();
    const rects = [];
    list.forEach((el) => rects.push(el.getBoundingClientRect()));
    list.forEach((el, i) => {
      if (el.dataset.scoreHold === "1") return;
      const r = rects[i];
      const fadeIn = clamp((vh - r.top) / (vh * 0.22));
      const fadeOut = clamp(r.bottom / (vh * 0.16));
      const k = Math.min(fadeIn, fadeOut);
      const opacity = 0.08 + 0.92 * k;
      const y = (1 - fadeIn) * 14 + (1 - fadeOut) * -10;
      el.style.opacity = opacity.toFixed(3);
      el.style.transform = "translate3d(0," + y.toFixed(2) + "px,0)";
    });
  }

  function requestFrame() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(frame);
  }

  window.addEventListener("scroll", requestFrame, { passive: true });
  window.addEventListener("resize", requestFrame, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", requestFrame);
  else requestFrame();
})();
