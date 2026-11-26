/* Scroll reveals via local GSAP + ScrollTrigger. No CDN. */
(function () {
  if (!window.gsap || !window.ScrollTrigger) return;
  const reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  gsap.registerPlugin(ScrollTrigger);

  function initReveals() {
    const nodes = document.querySelectorAll(
      "[data-reveal], .story-title, .story-graphic, .story-key, .story-kpis, .story-beat, .hero-brand"
    );
    if (reduced) {
      nodes.forEach((el) => {
        el.style.opacity = "1";
        el.style.transform = "none";
      });
      return;
    }
    gsap.utils.toArray(nodes).forEach((el) => {
      gsap.fromTo(
        el,
        { autoAlpha: 0, y: 18 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.45,
          ease: "power2.out",
          scrollTrigger: {
            trigger: el,
            start: el.classList.contains("story-graphic") ? "top 82%" : "top 90%",
            once: true,
            toggleActions: "play none none none",
          },
        }
      );
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initReveals);
  } else {
    initReveals();
  }
  window.__asmrInitReveals = initReveals;
})();
