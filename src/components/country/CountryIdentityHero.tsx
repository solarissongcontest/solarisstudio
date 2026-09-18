import { Suspense, lazy, useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

import { PersonalityHeroRenderer } from "@/components/country/personality/PersonalityHeroRenderer";
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
 * Canonical Country/Wiki identity controller.
 *
 * The semantic data and factual flag contract are shared, but composition is
 * delegated to personality-specific renderers. This prevents visually distinct
 * source systems from being forced through one generic copy/art/flag/actions
 * grid while preserving one accessible data model and one flag state machine.
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

  const flag = (
    <>
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
    </>
  );

  const composition = (
    <PersonalityHeroRenderer
      personality={definition.id}
      code={code}
      name={name}
      nativeName={nativeName}
      region={region}
      description={description}
      eyebrow={eyebrow}
      actions={actions}
      flag={flag}
      geography={geography}
    />
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
      data-country-has-art={definition.id === "panorama" ? "true" : "false"}
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
        <Suspense fallback={composition}>
          <LazyGlassMaterial
            className="country-hero-glass-material"
            optics={{
              strength: 0.055,
              depth: 0.56,
              curvature: 0.3,
              dispersion: 0.22,
              frost: 7,
              saturate: 1.18,
              sheen: 0.34,
              glow: 0.07,
            }}
          >
            {composition}
          </LazyGlassMaterial>
        </Suspense>
      ) : composition}
    </Root>
  );
}
