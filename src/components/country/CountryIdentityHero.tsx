import { Suspense, lazy, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { AtlasMapModule } from "@/components/country/AtlasMapModule";
import { countryPersonality } from "@/lib/country-personality-system";
import { countryPersonalitySource } from "@/lib/country-personality-sources";
import type { CountryGeography } from "@/lib/country-semantic-model";
import type { CountryDecorationStyle, CountryHeroLayout } from "@/lib/visual-theme";
import { cn } from "@/lib/utils";

const LazyGlassMaterial = lazy(() =>
  import("@/vendor/liquid-glass/GlassMaterial").then((module) => ({
    default: module.GlassMaterial,
  })),
);

type CountryIdentityHeroProps = {
  as?: "section" | "header";
  personality: CountryHeroLayout;
  decoration?: CountryDecorationStyle;
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  flagImage?: string | null;
  accentColor?: string | null;
  geography?: CountryGeography | null;
  eyebrow?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Canonical Country/Wiki identity structure.
 *
 * Semantic content always remains in normal grid flow. Personalities can style
 * the named regions but may not absolutely position the title, flag, metadata
 * or actions. Experimental artwork receives its own bounded grid cell, so a
 * line/ribbon/seal can never physically pass through a button or text region.
 */
export function CountryIdentityHero({
  as = "section",
  personality,
  decoration = "auto",
  code,
  name,
  nativeName,
  region,
  description,
  flagImage,
  accentColor,
  geography,
  eyebrow = "Terra Solaris",
  actions,
  compact = false,
  className,
  style,
}: CountryIdentityHeroProps) {
  const Root = as;
  const definition = countryPersonality(personality);
  const sourceDefinition = countryPersonalitySource(definition.id);
  const isLiquidGlass = definition.id === "glass-card";
  const [flagState, setFlagState] = useState<"missing" | "loading" | "ready" | "error">(
    flagImage ? "loading" : "missing",
  );

  useEffect(() => {
    setFlagState(flagImage ? "loading" : "missing");
  }, [flagImage]);
  const flagStyle = flagImage
    ? ({ "--country-flag-art": `url(${JSON.stringify(flagImage)})` } as CSSProperties)
    : undefined;

  const moveGlassLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isLiquidGlass || event.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    event.currentTarget.style.setProperty("--glass-pointer-x", `${x}%`);
    event.currentTarget.style.setProperty("--glass-pointer-y", `${y}%`);
    event.currentTarget.dataset.glassActive = "true";
  };

  const resetGlassLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isLiquidGlass) return;
    event.currentTarget.style.setProperty("--glass-pointer-x", "74%");
    event.currentTarget.style.setProperty("--glass-pointer-y", "16%");
    delete event.currentTarget.dataset.glassActive;
  };

  const heroLayout = (
    <div className="country-hero-layout">
      <div className="country-hero-copy">
        <p className="country-hero-eyebrow">{eyebrow}{region ? ` · ${region}` : ""}</p>
        <h1 className="country-hero-title" dir="auto">{name}</h1>
        {(nativeName && nativeName !== name) || region ? (
          <p className="country-hero-meta" dir="auto">
            {[nativeName && nativeName !== name ? nativeName : null, region].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {description ? <p className="country-hero-description" dir="auto">{description}</p> : null}
      </div>

      {definition.allowsGraphicArt ? (
        definition.id === "panorama" ? (
          <div className="country-hero-art country-hero-art--atlas">
            <AtlasMapModule
              countryName={name}
              region={region}
              geography={geography}
            />
          </div>
        ) : (
          <div className="country-hero-art" aria-hidden="true">
            <span className="country-hero-art-primary" />
            <span className="country-hero-art-secondary" />
            <span className="country-hero-art-tertiary" />
          </div>
        )
      ) : null}

      <div className="country-hero-flag-zone">
        <div
          className="country-official-flag"
          data-flag-role="official"
          data-flag-state={flagState}
          aria-busy={flagState === "loading" ? "true" : undefined}
        >
          {flagImage ? (
            <img
              src={flagImage}
              alt={flagState === "ready" ? `Flag of ${name}` : ""}
              loading="eager"
              decoding="async"
              onLoad={() => setFlagState("ready")}
              onError={() => setFlagState("error")}
              style={{ visibility: flagState === "ready" ? "visible" : "hidden" }}
            />
          ) : null}
          {flagState !== "ready" ? (
            <span
              className="country-official-flag-fallback"
              role="status"
              aria-live="polite"
              aria-label={
                flagState === "loading"
                  ? `Flag loading for ${name}`
                  : `Flag unavailable for ${name}`
              }
              style={{ borderColor: accentColor || undefined }}
            >
              {flagState === "loading" ? "…" : code}
            </span>
          ) : null}
        </div>
        <span className="country-flag-caption">{code}</span>
      </div>

      {actions ? <div className="country-hero-actions">{actions}</div> : null}
    </div>
  );

  return (
    <Root
      className={cn(
        "country-identity-hero",
        compact && "country-identity-hero--compact",
        className,
      )}
      data-country-personality={definition.id}
      data-country-layout={definition.layout}
      data-country-composition={sourceDefinition.compositionFamily}
      data-country-background-policy={sourceDefinition.backgroundPolicy}
      data-country-source-status={sourceDefinition.status}
      data-country-decoration={decoration}
      data-country-has-art={definition.allowsGraphicArt ? "true" : "false"}
      data-liquid-glass={isLiquidGlass ? "true" : undefined}
      style={{ ...flagStyle, ...style }}
      onPointerMove={moveGlassLight}
      onPointerLeave={resetGlassLight}
    >
      <div className="country-hero-scene" aria-hidden="true">
        {flagImage ? <img className="country-hero-scene-flag" src={flagImage} alt="" decoding="async" /> : null}
        <span className="country-hero-scene-light country-hero-scene-light-a" />
        <span className="country-hero-scene-light country-hero-scene-light-b" />
      </div>

      {isLiquidGlass ? (
        <Suspense fallback={heroLayout}>
          <LazyGlassMaterial
            className="country-hero-glass-material"
            optics={{
              strength: 0.045,
              depth: 0.52,
              curvature: 0.34,
              dispersion: 0.24,
              frost: 10,
              saturate: 1.24,
              sheen: 0.28,
              glow: 0.08,
            }}
          >
            {heroLayout}
          </LazyGlassMaterial>
        </Suspense>
      ) : heroLayout}

    </Root>
  );
}
