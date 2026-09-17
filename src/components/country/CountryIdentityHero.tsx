import type { CSSProperties, ReactNode } from "react";

import type { CountryHeroLayout } from "@/lib/visual-theme";
import { cn } from "@/lib/utils";

type CountryIdentityHeroProps = {
  as?: "section" | "header";
  personality: CountryHeroLayout;
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
 */
export function CountryIdentityHero({
  as = "section",
  personality,
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
  const flagStyle = flagImage
    ? ({ "--country-flag-art": `url(${JSON.stringify(flagImage)})` } as CSSProperties)
    : undefined;

  return (
    <Root
      className={cn(
        "country-identity-hero",
        compact && "country-identity-hero--compact",
        className,
      )}
      data-country-personality={personality}
      style={{ ...flagStyle, ...style }}
    >
      <div className="country-hero-atmosphere" aria-hidden="true" />
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
