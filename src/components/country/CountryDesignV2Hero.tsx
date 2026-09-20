import {
  Suspense,
  lazy,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { CountryDesignV2 } from "@/lib/country-design-v2";
import { cn } from "@/lib/utils";

const LazyGlassMaterial = lazy(() =>
  import("@/vendor/liquid-glass/GlassMaterial").then((module) => ({
    default: module.GlassMaterial,
  })),
);

type CountryDesignV2HeroProps = {
  as?: "section" | "header";
  design: CountryDesignV2;
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  motto?: string | null;
  flagImage?: string | null;
  eyebrow?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
  editorActive?: boolean;
};

export function CountryDesignV2Hero({
  as = "section",
  design,
  code,
  name,
  nativeName,
  region,
  description,
  motto,
  flagImage,
  eyebrow = "Terra Solaris",
  actions,
  compact = false,
  className,
  style,
  editorActive = false,
}: CountryDesignV2HeroProps) {
  const Root = as;
  const layout = compact ? "compact" : design.hero.layout;
  const liquidGlass = design.surface === "glass";

  const moveGlassLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!liquidGlass || event.pointerType === "touch") return;
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
    if (!liquidGlass) return;
    event.currentTarget.style.setProperty("--glass-pointer-x", "74%");
    event.currentTarget.style.setProperty("--glass-pointer-y", "16%");
    delete event.currentTarget.dataset.glassActive;
  };

  return (
    <Root
      className={cn("country-v2-hero", liquidGlass && "country-v2-hero--liquid", className)}
      data-country-v2-hero={layout}
      data-design-target="hero"
      data-design-active={editorActive ? "true" : undefined}
      data-liquid-glass={liquidGlass ? "true" : undefined}
      style={{
        textAlign: design.hero.alignment,
        ...style,
      }}
      onPointerMove={moveGlassLight}
      onPointerLeave={resetGlassLight}
    >
      {liquidGlass ? (
        <>
          <div className="country-v2-liquid-glass-scene" aria-hidden="true">
            {flagImage ? (
              <img
                className="country-v2-liquid-glass-scene-flag"
                src={flagImage}
                alt=""
                decoding="async"
              />
            ) : null}
            <span className="country-v2-liquid-glass-light country-v2-liquid-glass-light-a" />
            <span className="country-v2-liquid-glass-light country-v2-liquid-glass-light-b" />
          </div>
          <Suspense fallback={<div className="country-v2-liquid-glass-fallback" aria-hidden="true" />}>
            <LazyGlassMaterial
              className="country-v2-liquid-glass-material"
              aria-hidden="true"
              optics={{
                strength: 0.064,
                depth: 0.62,
                curvature: 0.38,
                bend: 0.6,
                bendWidth: 0.14,
                dispersion: 0.3,
                frost: 3,
                saturate: 1.22,
                sheen: 0.46,
                sheenWidth: 2.5,
                sheenFalloff: 1.7,
                glow: 0.12,
                glowSpread: 1,
                glowFalloff: 0.5,
                specular: 1.05,
              }}
            />
          </Suspense>
        </>
      ) : null}

      <div className="country-v2-hero-copy">
        <p className="country-v2-hero-eyebrow">{eyebrow}</p>
        <h1 className="country-v2-hero-title country-v2-display">{name}</h1>
        {design.hero.showNativeName && nativeName && nativeName !== name ? (
          <p className="country-v2-hero-native">{nativeName}</p>
        ) : null}
        {region ? <p className="country-v2-hero-region">{region}</p> : null}
        {description ? <p className="country-v2-hero-description">{description}</p> : null}
        {design.hero.showMotto && motto ? (
          <p className="country-v2-hero-description">“{motto}”</p>
        ) : null}
      </div>

      {design.hero.showFlag ? (
        <div className="country-v2-hero-flag" data-design-target="hero-flag">
          {flagImage ? (
            <img src={flagImage} alt={`Flag of ${name}`} loading="eager" decoding="async" />
          ) : (
            <span className="country-v2-hero-flag-fallback" role="status" aria-label={`Flag unavailable for ${name}`}>
              {code}
            </span>
          )}
        </div>
      ) : null}

      {actions ? <div className="country-v2-hero-actions">{actions}</div> : null}
    </Root>
  );
}
