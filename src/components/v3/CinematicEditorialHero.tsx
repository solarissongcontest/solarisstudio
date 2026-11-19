import type { ReactNode } from "react";

import { resolveCinematicObjectPosition, type CinematicFocalPoint } from "@/lib/cinematic-hero";
import "@/styles/v3-cinematic-entities.css";

export type CinematicEditorialHeroProps = {
  kind: "country" | "edition";
  title: string;
  eyebrow: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  focalPoint?: CinematicFocalPoint | null;
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
  focalPoint,
  context,
  headingLevel = 1,
}: CinematicEditorialHeroProps) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <header
      className={`cinematic-entity-hero cinematic-entity-hero--${kind}`}
      data-cinematic-entity={kind}
      data-has-image={imageUrl ? "true" : "false"}
    >
      <div className="cinematic-entity-hero__media" aria-hidden="true">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            decoding="async"
            loading="eager"
            fetchPriority="high"
            style={{ objectPosition: resolveCinematicObjectPosition(focalPoint) }}
          />
        ) : (
          <div className="cinematic-entity-hero__fallback" />
        )}
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
