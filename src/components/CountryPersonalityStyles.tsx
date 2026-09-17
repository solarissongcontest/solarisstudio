import { useEffect } from "react";

import wikiStyles from "@/country-wiki.css?inline";
import buttonStyles from "@/country-button-theme.css?inline";
import v7Styles from "@/country-personality-system-v7.css?inline";
import v7Refinements from "@/country-personality-system-v7-refinements.css?inline";
import productionBridge from "@/country-personality-v7-production-bridge.css?inline";
import wikiV7 from "@/country-wiki-v7.css?inline";
import liquidGlassPublic from "@/country-liquid-glass-public-v7.css?inline";

/**
 * V7 files are authored inside a named layer so they remain self-contained if
 * imported elsewhere. This route component must compete with older unlayered
 * global CSS, and unlayered author rules outrank normal layered rules. Strip
 * only the outer V7 wrapper before injection so source order works as intended.
 */
function unlayerV7(css: string) {
  const opened = css.replace(/@layer\s+country-v7\s*\{/, "");
  return opened.replace(/\}\s*$/, "");
}

const countryPersonalityStyles = [
  wikiStyles,
  buttonStyles,
  unlayerV7(v7Styles),
  unlayerV7(v7Refinements),
  unlayerV7(productionBridge),
  unlayerV7(wikiV7),
  unlayerV7(liquidGlassPublic),
].join("\n");

/** Track the light source on the existing public hero markup without turning
 * pointer movement into React state. The custom CountryIdentityHero used by the
 * editor owns the same behaviour itself; this controller is only the bridge for
 * the older Country/Wiki route markup.
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
      target.dataset.glassActive = "true";
    };

    const onOut = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(selector) : null;
      if (!target) return;
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (next && target.contains(next)) return;
      target.style.setProperty("--glass-pointer-x", "72%");
      target.style.setProperty("--glass-pointer-y", "18%");
      delete target.dataset.glassActive;
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

/**
 * Country and Wiki presentation is route-scoped and intentionally composed as
 * one style text node. V7 replaces the former repair-on-repair cascade with a
 * canonical article foundation, one constrained personality system, a guarded
 * production-markup bridge, and final article/Liquid-Glass contracts.
 */
export function CountryPersonalityStyles() {
  return (
    <>
      <style data-country-personality-styles>{countryPersonalityStyles}</style>
      <PublicLiquidGlassPointerController />
    </>
  );
}
