import { useState, type CSSProperties, type ReactNode } from "react";

import { resolveCinematicObjectPosition, safeCinematicColor, type CinematicFocalPoint } from "@/lib/cinematic-hero";
import "@/styles/v3-cinematic-entities.css";

export type CinematicEditorialHeroProps = {
  kind: "country" | "edition";
  title: string;
  eyebrow: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  imageAltText?: string | null;
  priority?: boolean;
  focalPoint?: CinematicFocalPoint | null;
  fallbackColors?: readonly [string | null | undefined, string | null | undefined];
  context?: ReactNode;
  /** Preview embeds should not create a second page-level h1. */
  headingLevel?: 1 | 2;
};

/**
 * Shared presentation only: the caller supplies publication-safe media.
 * This component never queries data, grants access or publishes assets.
 */
export function CinematicEditorialHero({
  kind,
  title,
  eyebrow,
  subtitle,
  imageUrl,
  imageAltText,
  priority = true,
  focalPoint,
  fallbackColors,
  context,
  headingLevel = 1,
}: CinematicEditorialHeroProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const usableImage = imageUrl && imageUrl !== failedUrl ? imageUrl : null;
  const Heading = headingLevel === 2 ? "h2" : "h1";
  const fallbackStyle = {
    "--cinematic-identity-primary": safeCinematicColor(fallbackColors?.[0]) ?? "#385e7d",
    "--cinematic-identity-secondary": safeCinematicColor(fallbackColors?.[1]) ?? "#112d42",
  } as CSSProperties;
  return (
    <header
      className={`cinematic-entity-hero cinematic-entity-hero--${kind}`}
      style={fallbackStyle}
      data-cinematic-entity={kind}
      data-has-image={usableImage ? "true" : "false"}
    >
      <div className="cinematic-entity-hero__media" aria-hidden="true">
        <div className="cinematic-entity-hero__fallback" />
        {usableImage ? (
          <img
            src={usableImage}
            alt={imageAltText ?? ""}
            decoding="async"
            loading={priority ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : "auto"}
            onError={() => setFailedUrl(usableImage)}
            style={{ objectPosition: resolveCinematicObjectPosition(focalPoint) }}
          />
        ) : null}
      </div>
      <div className="cinematic-entity-hero__fade" aria-hidden="true" />
      <div className="cinematic-entity-hero__copy">
        <p className="cinematic-entity-hero__eyebrow">{eyebrow}</p>
        <Heading className="cinematic-entity-hero__title">{title}</Heading>
        {subtitle ? <p className="cinematic-entity-hero__subtitle">{subtitle}</p> : null}
        {context ? <div className="cinematic-entity-hero__context">{context}</div> : null}
      </div>
    </header>
  );
}
