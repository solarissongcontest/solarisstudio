import type { ReactNode } from "react";

import { FlagChip } from "@/components/FlagChip";
import { CinematicEditorialHero } from "@/components/v3/CinematicEditorialHero";
import type { CountryDesignV2 } from "@/lib/country-design-v2";
import "@/styles/v3-country-web-cinematic.css";

type Props = {
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  description?: string | null;
  flagImage?: string | null;
  accentColor?: string | null;
  /** Already checked isPublishedV2 by the public Country route. */
  publishedDesign?: CountryDesignV2 | null;
  actions?: ReactNode;
};

/**
 * Ordinary mobile- and desktop-web Country identity, not an installed-app
 * shell. Publication, identity and permission decisions belong to the caller.
 * Reuses only the previously published V2 background until Hero Studio's
 * canonical media and versioned publication workflow has been adopted.
 */
export function CountryWebCinematicHero({
  code, name, nativeName, region, description, flagImage,
  accentColor, publishedDesign, actions,
}: Props) {
  const background = publishedDesign?.background;
  const publishedImageUrl =
    background?.mode === "image" ? background.imageUrl : null;
  const focalPoint = background
    ? [background.positionX / 100, background.positionY / 100] as const
    : null;
  const subtitle = [nativeName && nativeName !== name ? nativeName : null, region]
    .filter(Boolean).join(" · ");

  return (
    <div className="country-web-cinematic" data-country-web-experience="editorial">
      <CinematicEditorialHero
        kind="country"
        eyebrow="Terra Solaris · Country"
        title={name}
        subtitle={subtitle || null}
        imageUrl={publishedImageUrl}
        focalPoint={focalPoint}
        fallbackColors={[accentColor, publishedDesign?.palette.backgroundSecondary]}
      />
      <section className="country-web-cinematic__identity" aria-label={`${name} identity and actions`}>
        <FlagChip code={code} color={accentColor ?? "#40628a"} image={flagImage} size="lg" />
        <div className="country-web-cinematic__details">
          <p className="country-web-cinematic__code">{code.toUpperCase()}{region ? ` · ${region}` : ""}</p>
          {description ? <p className="country-web-cinematic__description">{description}</p> :
            <p className="country-web-cinematic__description">Explore this country's published Solaris history and profile.</p>}
        </div>
        {actions ? <div className="country-web-cinematic__actions">{actions}</div> : null}
      </section>
    </div>
  );
}
