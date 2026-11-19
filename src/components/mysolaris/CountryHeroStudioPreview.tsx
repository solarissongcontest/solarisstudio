import { useState } from "react";

import { CinematicEditorialHero } from "@/components/v3/CinematicEditorialHero";
import type { CountryDesignV2 } from "@/lib/country-design-v2";
import "@/styles/v3-country-hero-studio-preview.css";

type Experience = "app" | "mobile-web" | "desktop";
const EXPERIENCES: readonly { id: Experience; label: string }[] = [
  { id: "app", label: "Installed app" },
  { id: "mobile-web", label: "Mobile website" },
  { id: "desktop", label: "Desktop" },
];

/**
 * DESIGN PREVIEW ONLY. Read existing verified Country V2 background selection.
 * Do not turn local draft image URLs into publicly published V3 hero truth.
 * A canonical System/Media draft, publication and CAS contract is required first.
 */
export function CountryHeroStudioPreview({
  name,
  nativeName,
  region,
  code,
  flagImage,
  design,
}: {
  name: string;
  nativeName: string | null;
  region: string | null;
  code: string;
  flagImage: string | null;
  design: CountryDesignV2;
}) {
  const [experience, setExperience] = useState<Experience>("app");
  const currentImage = design.background.mode === "image"
    ? design.background.imageUrl
    : null;
  const focus = [
    design.background.positionX / 100,
    design.background.positionY / 100,
  ] as const;

  return (
    <section className="country-hero-preview" aria-label="V3 Country Hero Studio preview">
      <p className="country-hero-preview__note">
        Design preview only. Your selected Country V2 background is shown here
        to test the new cinematic layout; this does not publish a V3 hero.
      </p>
      <div className="country-hero-preview__switch" role="group" aria-label="Choose preview experience">
        {EXPERIENCES.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={variant.id === experience}
            onClick={() => setExperience(variant.id)}
          >
            {variant.label}
          </button>
        ))}
      </div>
      <div className="country-hero-preview__frame" data-experience={experience}>
        <div className="country-hero-preview__page">
          <CinematicEditorialHero
            kind="country"
            headingLevel={2}
            eyebrow="Terra Solaris · Country"
            title={name}
            subtitle={[nativeName !== name ? nativeName : null, region].filter(Boolean).join(" · ")}
            imageUrl={currentImage}
            focalPoint={focus}
          />
          <div className="country-hero-preview__identity">
            <div className="country-hero-preview__flag">
              {flagImage ? (
                <img src={flagImage} alt={`Flag of ${name}`} loading="lazy" />
              ) : (
                <span aria-label={`Flag unavailable for ${name}`}>{code}</span>
              )}
            </div>
            <span className="country-hero-preview__country">{name}</span>
          </div>
          <div className="country-hero-preview__sections" aria-label="Sample section labels">
            <span>Overview</span>
            <span>Entries</span>
            <span>Results</span>
            <span>History</span>
            <span>World</span>
          </div>
          <p className="country-hero-preview__sample">
            Published country facts and participation will flow below this visual transition.
          </p>
        </div>
      </div>
    </section>
  );
}
