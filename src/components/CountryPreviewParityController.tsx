import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { BackgroundFlag } from "@/components/BackgroundFlag";
import { FlagChip } from "@/components/FlagChip";
import {
  useCountryWorldProfile,
  useMyCountryAccount,
} from "@/lib/country-account";
import { useCountries, type Country } from "@/lib/data";
import { appRoutePath } from "@/lib/route-path";

type PreviewSurface = "country" | "wiki";
type PreviewDecoration =
  | "none"
  | "flag"
  | "orbits"
  | "rays"
  | "grid"
  | "waves"
  | "aurora"
  | "constellation"
  | "facets"
  | "topography"
  | "eclipse";

function sameTargets(a: HTMLElement[], b: HTMLElement[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function CountryPreviewParityController() {
  const location = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  });
  const routePath = appRoutePath(location.pathname);
  const { data: accountData } = useMyCountryAccount();
  const { data: countries } = useCountries();
  const [targets, setTargets] = useState<HTMLElement[]>([]);
  const [surface, setSurface] = useState<PreviewSurface>("country");

  const targetCountryId =
    typeof (location.search as Record<string, unknown> | undefined)?.country === "string"
      ? String((location.search as Record<string, unknown>).country)
      : null;

  const country = useMemo(() => {
    if (accountData?.access.isOrganizer && targetCountryId) {
      return (countries ?? []).find((item) => item.id === targetCountryId) ?? null;
    }
    return accountData?.country ?? null;
  }, [accountData, countries, targetCountryId]);

  const world = useCountryWorldProfile(country?.id);

  useEffect(() => {
    if (routePath !== "/country-hub/theme") {
      setTargets([]);
      return;
    }

    const refresh = () => {
      const next = Array.from(
        document.querySelectorAll<HTMLElement>(".country-theme-live-preview"),
      );
      setTargets((current) => (sameTargets(current, next) ? current : next));
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [routePath]);

  if (routePath !== "/country-hub/theme" || !country || targets.length === 0) {
    return null;
  }

  return (
    <>
      {targets.map((target) => (
        <PreviewPortal
          key={target.dataset.parityPreviewKey ?? target.className}
          target={target}
          country={country}
          wikiSummary={world.data?.profile?.summary ?? null}
          surface={surface}
          onSurfaceChange={setSurface}
        />
      ))}
    </>
  );
}

function PreviewPortal({
  target,
  country,
  wikiSummary,
  surface,
  onSurfaceChange,
}: {
  target: HTMLElement;
  country: Country;
  wikiSummary: string | null;
  surface: PreviewSurface;
  onSurfaceChange: (surface: PreviewSurface) => void;
}) {
  const [decoration, setDecoration] = useState<PreviewDecoration>(() =>
    readDecoration(target.dataset.previewDecoration),
  );

  useEffect(() => {
    target.dataset.parityPreview = "true";

    const sync = () => setDecoration(readDecoration(target.dataset.previewDecoration));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(target, {
      attributes: true,
      attributeFilter: ["data-preview-layout", "data-preview-decoration", "style"],
    });

    return () => {
      observer.disconnect();
      delete target.dataset.parityPreview;
    };
  }, [target]);

  const showFlagMaterial = decoration === "flag";
  const showAbstractDecoration = decoration !== "flag" && decoration !== "none";

  return createPortal(
    <>
      <div
        className="parity-preview-controls"
        aria-label="Preview page type"
        data-parity-preview-child="true"
      >
        <button
          type="button"
          onClick={() => onSurfaceChange("country")}
          aria-pressed={surface === "country"}
        >
          Country
        </button>
        <button
          type="button"
          onClick={() => onSurfaceChange("wiki")}
          aria-pressed={surface === "wiki"}
        >
          Wiki
        </button>
      </div>

      <BackgroundFlag
        image={country.flag_image}
        className="country-hero-background-flag parity-preview-flag -right-20 -top-24 h-80 w-80"
        opacity={surface === "country" ? 0.14 : 0.1}
      />

      {showAbstractDecoration && (
        <div
          aria-hidden="true"
          className="country-decoration-layer parity-preview-decoration"
          data-decoration={decoration}
          data-parity-preview-child="true"
        />
      )}

      <div
        aria-hidden="true"
        className="country-personality-signature parity-preview-signature"
        data-parity-preview-child="true"
      />

      {surface === "country" ? (
        <CountryHeroPreview country={country} showFlagMaterial={showFlagMaterial} />
      ) : (
        <WikiHeroPreview
          country={country}
          summary={wikiSummary || country.description}
          showFlagMaterial={showFlagMaterial}
        />
      )}
    </>,
    target,
  );
}

function CountryHeroPreview({
  country,
  showFlagMaterial,
}: {
  country: Country;
  showFlagMaterial: boolean;
}) {
  return (
    <div
      className="relative z-10 parity-preview-content grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end"
      data-parity-preview-child="true"
    >
      {showFlagMaterial && country.flag_image && (
        <div
          aria-hidden="true"
          className="country-glass-panel-flag"
          style={{ backgroundImage: `url(${JSON.stringify(country.flag_image)})` }}
        />
      )}
      <div className="min-w-0">
        <div className="country-hero-identity flex min-w-0 items-center gap-4">
          <FlagChip
            code={country.short_code}
            color={country.accent_color}
            image={country.flag_image}
            size="xl"
          />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {country.region}
            </p>
            <h1 className="country-hero-title mt-1 break-words font-display text-3xl font-bold sm:text-4xl">
              {country.name}
            </h1>
            {country.native_name && country.native_name !== country.name && (
              <p className="mt-1 text-xs text-muted-foreground">{country.native_name}</p>
            )}
          </div>
        </div>

        {country.description && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {country.description}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end" aria-hidden="true">
        <span className="rounded-xl bg-aurora px-3 py-2 text-xs font-semibold text-primary-foreground">
          Wiki
        </span>
        <span className="rounded-xl border border-border bg-surface px-3 py-2 text-xs">
          Compare
        </span>
        <span className="rounded-xl border border-border bg-surface px-3 py-2 text-xs">
          Follow
        </span>
      </div>
    </div>
  );
}

function WikiHeroPreview({
  country,
  summary,
  showFlagMaterial,
}: {
  country: Country;
  summary: string | null;
  showFlagMaterial: boolean;
}) {
  return (
    <div
      className="relative z-10 parity-preview-content max-w-3xl"
      data-parity-preview-child="true"
    >
      {showFlagMaterial && country.flag_image && (
        <div
          aria-hidden="true"
          className="country-glass-panel-flag"
          style={{ backgroundImage: `url(${JSON.stringify(country.flag_image)})` }}
        />
      )}
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
        Terra Solaris Wiki
      </p>
      <h1 className="country-hero-title mt-2 break-words font-display text-3xl font-bold sm:text-5xl">
        {country.name}
      </h1>
      {country.native_name && country.native_name !== country.name && (
        <p className="mt-1 text-sm text-muted-foreground">{country.native_name}</p>
      )}
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
        {summary || `${country.name} is a country in Terra Solaris and a participant in Solaris Song Contest.`}
      </p>
    </div>
  );
}

function readDecoration(value: string | undefined): PreviewDecoration {
  switch (value) {
    case "none":
    case "flag":
    case "orbits":
    case "rays":
    case "grid":
    case "waves":
    case "aurora":
    case "constellation":
    case "facets":
    case "topography":
    case "eclipse":
      return value;
    default:
      return "flag";
  }
}
