/* One-shot scroll entrances. No pinning, no height changes. */
import { prefersReducedMotion } from "./util.js?v=20261127b";

export function motionApi() {
  if (prefersReducedMotion()) return null;
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  if (!gsap || !ScrollTrigger) return null;
  gsap.registerPlugin(ScrollTrigger);
  return { gsap, ScrollTrigger };
}

/**
 * Run `play(gsap)` when the scene first enters the viewport.
 * Already-visible scenes play immediately. Scrolling back up does not replay or pin.
 * Returns false when motion is reduced or GSAP is missing — caller keeps the final state.
 */
export function onSceneEnter(mount, play) {
  const api = motionApi();
  if (!api || !mount) return false;
  const trigger = mount.closest(".story-scene") || mount;
  if (mount._entranceST) {
    mount._entranceST.kill();
    mount._entranceST = null;
  }
  const rect = trigger.getBoundingClientRect();
  // Already on screen, or the reader scrolled past before the chart painted.
  const reached = rect.top < window.innerHeight * 0.86;
  if (reached) {
    play(api.gsap);
    return true;
  }
  mount._entranceST = api.ScrollTrigger.create({
    trigger,
    start: "top 86%",
    once: true,
    onEnter(self) {
      play(api.gsap);
      self.kill();
      mount._entranceST = null;
    },
  });
  return true;
}
