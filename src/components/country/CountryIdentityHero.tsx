import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";

import type { CountryDecorationStyle, CountryHeroLayout } from "@/lib/visual-theme";
import { cn } from "@/lib/utils";

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
  eyebrow?: string;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * The one structural hero used by Country, Wiki and the appearance preview.
 * Personalities may style these named regions, but they never own semantic
 * order, image-fit policy, action placement or overflow behaviour.
 *
 * Glass gets one extra behaviour: pointer position is exposed as CSS variables
 * so the material can move its specular highlight without React re-renders.
 * Reduced-motion users still get a static, fully readable surface.
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
  eyebrow = "Terra Solaris",
  actions,
  compact = false,
  className,
  style,
}: CountryIdentityHeroProps) {
  const Root = as;
  const isLiquidGlass = personality === "glass-card" || personality === "water-drop";
  const flagStyle = flagImage
    ? ({ "--country-flag-art": `url(${JSON.stringify(flagImage)})` } as CSSProperties)
    : undefined;

  const moveGlassLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isLiquidGlass || event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
    event.currentTarget.style.setProperty("--glass-pointer-x", `${x}%`);
    event.currentTarget.style.setProperty("--glass-pointer-y", `${y}%`);
    event.currentTarget.dataset.glassActive = "true";
  };

  const resetGlassLight = (event: ReactPointerEvent<HTMLElement>) => {
    if (!isLiquidGlass) return;
    event.currentTarget.style.setProperty("--glass-pointer-x", "72%");
    event.currentTarget.style.setProperty("--glass-pointer-y", "18%");
    delete event.currentTarget.dataset.glassActive;
  };

  return (
    <Root
      className={cn(
        "country-identity-hero",
        compact && "country-identity-hero--compact",
        className,
      )}
      data-country-personality={personality}
      data-country-decoration={decoration}
      data-liquid-glass={isLiquidGlass ? "true" : undefined}
      style={{ ...flagStyle, ...style }}
      onPointerMove={moveGlassLight}
      onPointerLeave={resetGlassLight}
    >
      <div className="country-hero-atmosphere" aria-hidden="true" />
      {isLiquidGlass ? (
        <div className="country-liquid-glass-optics" aria-hidden="true">
          <span className="country-liquid-glass-refraction" />
          <span className="country-liquid-glass-specular" />
          <span className="country-liquid-glass-edge" />
        </div>
      ) : null}
      <div className="country-hero-decoration" aria-hidden="true">
        <span className="country-hero-signature country-hero-signature-a" />
        <span className="country-hero-signature country-hero-signature-b" />
        <span className="country-hero-signature country-hero-signature-c" />
      </div>

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

        <div className="country-hero-flag-zone">
          <div className="country-official-flag" data-flag-role="official">
            {flagImage ? (
              <img
                src={flagImage}
                alt={`Flag of ${name}`}
                loading="eager"
                decoding="async"
              />
            ) : (
              <span
                className="country-official-flag-fallback"
                aria-label={`Flag unavailable for ${name}`}
                style={{ borderColor: accentColor || undefined }}
              >
                {code}
              </span>
            )}
          </div>
          <span className="country-flag-caption">{code}</span>
        </div>

        {actions ? <div className="country-hero-actions">{actions}</div> : null}
      </div>
    </Root>
  );
}
