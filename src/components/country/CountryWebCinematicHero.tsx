import { CinematicEditorialHero } from "@/components/v3/CinematicEditorialHero";
import type { CountryDesignV2 } from "@/lib/country-design-v2";
import "@/styles/v3-country-web-cinematic.css";

export type CountryWebCinematicHeroProps = {
  code: string;
  name: string;
  nativeName?: string | null;
  region?: string | null;
  accentColor?: string | null;
  /** Only a public, already-published Country V2 design may be supplied here. */
  publishedDesign?: CountryDesignV2 | null;
};

/**
 * Ordinary-browser Country masthead.
 * Media is read only from the already-published country design projection.
 * The official 3:2 flag, actions, navigation and content remain in the
 * parent profile's single identity strip, avoiding duplicated page chrome.
 */
export function CountryWebCinematicHero({
  code, name, nativeName, region, accentColor, publishedDesign,
}: CountryWebCinematicHeroProps) {
  const background = publishedDesign?.background;
  const imageUrl = background?.mode === "image" ? background.imageUrl : null;
  const focalPoint = background
    ? [background.positionX / 100, background.positionY / 100] as const
    : null;
  const subtitle = [
    nativeName && nativeName !== name ? nativeName : null,
    region,
  ].filter(Boolean).join(" · ");

  return (
    <div className="country-web-cinematic" data-country-web-experience="editorial">
      <CinematicEditorialHero
        kind="country"
        eyebrow={`Terra Solaris · ${code.toUpperCase()}`}
        title={name}
        subtitle={subtitle || null}
        imageUrl={imageUrl}
        focalPoint={focalPoint}
        fallbackColors={[accentColor, publishedDesign?.palette.backgroundSecondary]}
      />
    </div>
  );
}
