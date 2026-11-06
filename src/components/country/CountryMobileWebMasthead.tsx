import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { FlagFrame } from "@/components/FlagMedia";
import type { CountryIdentityModel } from "@/lib/country-semantic-model";

const COUNTRY_MOBILE_LINK_CLASS = "country-mobile-web-action inline-flex min-h-11 items-center rounded-lg border border-border bg-transparent px-3 py-2 text-sm font-semibold text-foreground no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Editorial Country identity for a mobile browser, not the installed PWA.
 * It consumes the same canonical identity but does not inherit the app layout.
 */
export function CountryMobileWebMasthead({
  identity,
  follow,
}: {
  identity: CountryIdentityModel;
  follow: ReactNode;
}) {
  const latestEntry = identity.currentEntry;
  const meaningfulStats = identity.statistics.slice(0, 3);
  const hasNativeName = identity.nativeName && identity.nativeName !== identity.name;
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const descriptionId = useId();
  const hasLongDescription = (identity.description?.length ?? 0) > 220;

  return (
    <section className="country-mobile-web-masthead mb-5" aria-labelledby="country-mobile-web-title">
      <Link
        to="/countries"
        className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Countries
      </Link>

      <div className="mt-4 flex min-w-0 items-start gap-4">
        <FlagFrame
          image={identity.flag.src}
          alt={identity.flag.alt}
          fallback={identity.code}
          loading="eager"
          className="!m-0 block aspect-[3/2] w-[108px] min-w-[108px] overflow-hidden rounded-lg border border-border/70 bg-surface"
          imageClassName="block h-full w-full"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">
            {identity.region || "Terra Solaris"} · {identity.code}
          </p>
          <h1
            id="country-mobile-web-title"
            className="mt-1 break-words font-display text-[clamp(1.65rem,7.5vw,2.25rem)] font-extrabold leading-[1.06] tracking-[-.045em] text-foreground"
          >
            {identity.name}
          </h1>
          {hasNativeName ? (
            <p className="mt-2 text-xs leading-5 text-muted-foreground">{identity.nativeName}</p>
          ) : null}
        </div>
      </div>

      {identity.description ? (
        <div className="mt-4">
          <p
            id={descriptionId}
            className="country-mobile-web-description text-sm leading-6 text-muted-foreground"
            data-collapsed={hasLongDescription && !descriptionExpanded ? "true" : undefined}
          >
            {identity.description}
          </p>
          {hasLongDescription ? (
            <button
              type="button"
              className="country-mobile-web-description-toggle mt-1 inline-flex min-h-11 items-center rounded px-1 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-controls={descriptionId}
              aria-expanded={descriptionExpanded}
              onClick={() => setDescriptionExpanded((expanded) => !expanded)}
            >
              {descriptionExpanded ? "Show less" : "Read more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {meaningfulStats.length ? (
        <dl className="mt-5 grid grid-cols-3 divide-x divide-border/70 border-y border-border/70 py-3">
          {meaningfulStats.map((stat) => (
            <div key={stat.id} className="min-w-0 px-3 first:pl-0 last:pr-0">
              <dt className="text-[10px] font-medium leading-4 text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 text-xl font-bold tabular-nums text-foreground">{stat.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {latestEntry ? (
        <div className="mt-5 border-l-2 border-primary/65 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
            Latest published entry · {latestEntry.editionLabel}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-foreground">
            {[latestEntry.artist, latestEntry.song].filter(Boolean).join(" · ") || "Details unavailable"}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Country links">
        <Link to="/wiki/$code" params={{ code: identity.code }} className={COUNTRY_MOBILE_LINK_CLASS}>
          Wiki
        </Link>
        <Link to="/compare" search={{ a: identity.code }} className={COUNTRY_MOBILE_LINK_CLASS}>
          Compare
        </Link>
        <Link to="/voting-dna/$code" params={{ code: identity.code }} className={COUNTRY_MOBILE_LINK_CLASS}>
          Voting DNA
        </Link>
        <span className="country-mobile-web-follow inline-flex min-h-11 items-center">{follow}</span>
      </div>
    </section>
  );
}
