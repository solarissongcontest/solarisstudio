import type { CSSProperties, ReactNode } from "react";

import type { CountryDesignV2 } from "@/lib/country-design-v2";
import { cn } from "@/lib/utils";

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

  return (
    <Root
      className={cn("country-v2-hero", className)}
      data-country-v2-hero={layout}
      data-design-target="hero"
      data-design-active={editorActive ? "true" : undefined}
      style={{
        textAlign: design.hero.alignment,
        ...style,
      }}
    >
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
