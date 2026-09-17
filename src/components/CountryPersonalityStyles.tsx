import { useEffect } from "react";

import wikiBaseStyles from "@/country-wiki.css?inline";
import buttonStyles from "@/country-button-theme.css?inline";
import personalityV8 from "@/country-personality-system-v8.css?inline";
import wikiV8 from "@/country-wiki-v8.css?inline";

const countryPersonalityStyles = [
  wikiBaseStyles,
  buttonStyles,
  personalityV8,
  wikiV8,
].join("\n");

/**
 * Public Country/Wiki routes still use their older hero DOM until the route
 * modules are decomposed. V8's CSS keeps that markup collision-safe. This tiny
 * controller only moves the Liquid Glass highlight; it never changes layout.
 */
function PublicLiquidGlassPointerController() {
  useEffect(() => {
    const selector = ".country-public-hero, .wiki-public-hero";
    const supportsFinePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!supportsFinePointer || reducedMotion) return;

    const onMove = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!target) return;
      const layout = document.body.dataset.countryHeroLayout;
      if (layout !== "glass-card" && layout !== "water-drop") return;
      const rect = target.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      target.style.setProperty("--glass-pointer-x", `${x}%`);
      target.style.setProperty("--glass-pointer-y", `${y}%`);
    };

    const onOut = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!target) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && target.contains(next)) return;
      target.style.setProperty("--glass-pointer-x", "74%");
      target.style.setProperty("--glass-pointer-y", "16%");
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerout", onOut, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerout", onOut);
    };
  }, []);

  return null;
}

/** One route-scoped style payload. No unlayering, no V4/V5/V6/V7 repair stack. */
export function CountryPersonalityStyles() {
  return (
    <>
      <style data-country-personality-styles>{countryPersonalityStyles}</style>
      <PublicLiquidGlassPointerController />
    </>
  );
}
