import type { CSSProperties } from "react";

import type {
  CountryMedia,
  CountryProfile,
  CountryProfileSection,
} from "@/lib/country-account";
import { usePublicCountryIdentityHistory } from "@/lib/country-history";
import {
  countrySectionPresentation,
  factRowsForSection,
  normalizeCountryPageSection,
  sectionVisibleOn,
  type CountryPageSection,
  type CountrySectionImageAspect,
} from "@/lib/country-page-builder";
import type { Country } from "@/lib/data";

export function CountryCustomSections({
  country,
  profile,
  sections,
  media,
  surface,
}: {
  country: Country;
  profile?: CountryProfile | null;
  sections: CountryProfileSection[] | CountryPageSection[];
  media: CountryMedia[];
  surface: "country" | "wiki";
}) {
  const identityHistory = usePublicCountryIdentityHistory(country.id);
  const visible = (sections as CountryPageSection[])
    .map(normalizeCountryPageSection)
    .filter((section) => sectionVisibleOn(section, surface))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  const formerIdentities = (() => {
    if (surface !== "wiki") return [];
    const grouped = new Map<string, {
      name: string;
      flag: string | null;
      editions: Array<{ id: string; number: number | null; name: string }>;
    }>();

    for (const row of identityHistory.data ?? []) {
      const name = row.display_name?.trim();
      if (!name || name === country.name) continue;
      const flag = row.flag_image ?? country.flag_image ?? null;
      const key = `${name}\u0000${flag ?? ""}`;
      const current = grouped.get(key) ?? { name, flag, editions: [] };
      current.editions.push({
        id: row.edition_id,
        number: row.edition_number,
        name: row.edition_name,
      });
      grouped.set(key, current);
    }

    return [...grouped.values()].map((identity) => ({
      ...identity,
      editions: [...identity.editions].sort(
        (a, b) =>
          (a.number ?? Number.MAX_SAFE_INTEGER) - (b.number ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name),
      ),
    }));
  })();

  if (!visible.length && !formerIdentities.length) return null;

  return (
    <div
      className="w-full space-y-4"
      data-country-custom-sections={surface}
      data-country-media-count={media.length}
    >
      {surface === "wiki" && formerIdentities.length > 0 ? (
        <section className="country-personality-card w-full max-w-none rounded-2xl border border-border/70 bg-surface/60 p-4 sm:p-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-primary">Country history</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Former names & flags</h2>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            These identities were used by the same country in earlier Solaris Song Contest editions.
          </p>
          <div className="mt-4 space-y-2">
            {formerIdentities.map((identity) => (
              <div
                key={`${identity.name}-${identity.flag ?? "flag"}`}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-background/20 p-3 sm:flex-row sm:items-center"
              >
                {identity.flag ? (
                  <img
                    src={identity.flag}
                    alt={`${identity.name} flag`}
                    loading="lazy"
                    className="h-10 w-16 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-16 shrink-0 place-items-center rounded-md border border-border bg-surface text-[10px] font-bold text-muted-foreground">
                    {country.short_code}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="font-display text-base font-semibold">{identity.name}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {identity.editions
                      .map((edition) => edition.number != null ? `SSC ${edition.number}` : edition.name)
                      .join(" · ")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {visible.map((section) => (
        <CountryCustomSection
          key={section.id}
          country={country}
          profile={profile}
          section={section}
          surface={surface}
        />
      ))}
    </div>
  );
}

function CountryCustomSection({
  country,
  profile,
  section,
  surface,
}: {
  country: Country;
  profile?: CountryProfile | null;
  section: ReturnType<typeof normalizeCountryPageSection>;
  surface: "country" | "wiki";
}) {
  const presentation = countrySectionPresentation(section);

  // Gallery blocks are intentionally retired. Country images remain reusable
  // as article/feature assets, but there is no separate gallery surface.
  if (section.section_type === "gallery") return null;

  if (section.section_type === "divider") {
    const divider = presentation.dividerStyle === "dots"
      ? <div className="flex justify-center gap-2"><i className="size-1.5 rounded-full bg-primary/60" /><i className="size-1.5 rounded-full bg-primary/35" /><i className="size-1.5 rounded-full bg-primary/60" /></div>
      : presentation.dividerStyle === "glow"
        ? <div className="h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent shadow-[0_0_18px_hsl(var(--primary)/0.45)]" />
        : <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />;
    return <div className={`${widthClass()} ${spacingClass(presentation.spacing, true)}`} aria-hidden="true">{divider}</div>;
  }

  const style = section.background_tint
    ? ({ backgroundColor: `${section.background_tint}d9` } as CSSProperties)
    : undefined;
  const wrapperClass = [
    widthClass(),
    panelClass(presentation.panelStyle, surface),
    presentation.panelStyle === "transparent" ? "" : "country-personality-card",
    spacingClass(presentation.spacing),
    presentation.textAlign === "center" ? "text-center" : "text-left",
    "min-w-0 overflow-hidden",
  ].join(" ");

  if (section.section_type === "quote") {
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        {section.heading && <h2 className="font-display text-xl font-semibold">{section.heading}</h2>}
        <blockquote className={presentation.textAlign === "center"
          ? "mx-auto mt-3 max-w-3xl font-display text-lg italic leading-8 text-foreground sm:text-xl"
          : "mt-3 border-l-2 border-primary/50 pl-4 font-display text-lg italic leading-8 text-foreground sm:text-xl"}>
          {section.body}
        </blockquote>
      </section>
    );
  }

  if (section.section_type === "facts") {
    const rows = factRowsForSection(section, profile);
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        <h2 className="font-display text-xl font-semibold">{section.heading || "Facts"}</h2>
        {rows.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="rounded-xl border border-border/60 bg-background/20 p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p>
                <p className="mt-1 break-words text-sm font-semibold">{row.value}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No facts have been added to this block yet.</p>}
      </section>
    );
  }

  const hasImage = Boolean(section.image_url);
  const compactAdaptiveImage = hasImage
    && section.image_layout === "wide"
    && (presentation.imageSize === "small" || presentation.imageSize === "medium");
  const imageFirst = section.image_layout === "left";
  const sideBySide = hasImage && (
    ["split", "left", "right"].includes(section.image_layout) || compactAdaptiveImage
  );
  const full = hasImage && section.image_layout === "full";
  const fullBleed = fullBleedClass(presentation.spacing);
  const content = (
    <div className={sideBySide ? "min-w-0 self-center" : ""}>
      {section.kicker && <Kicker>{section.kicker}</Kicker>}
      {section.heading && <h2 className="font-display text-xl font-semibold sm:text-2xl">{section.heading}</h2>}
      {section.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{section.body}</p>}
    </div>
  );
  const image = hasImage ? (
    <figure className={full ? `${fullBleed} mb-4` : `${imageSizeClass(presentation.imageSize)} min-w-0 ${sideBySide ? "" : "mx-auto"}`}>
      <img
        src={section.image_url ?? ""}
        alt={section.image_caption || `${country.name} section image`}
        loading="lazy"
        className={`${full ? "w-full" : !sideBySide && section.image_layout === "wide" ? "mt-4 w-full rounded-xl" : "w-full rounded-xl"} ${aspectClass(presentation.imageAspect)} ${presentation.imageAspect === "auto" ? imageHeightClass(presentation.imageSize, full) : ""} ${presentation.imageFit === "contain" ? "object-contain" : "object-cover"}`}
        style={{
          objectPosition: `${presentation.focalX}% ${presentation.focalY}%`,
          ...imageFadeStyle(presentation.imageFade),
        }}
      />
      {section.image_caption && <figcaption className={`${full ? captionInsetClass(presentation.spacing) : ""} mt-2 text-[10px] leading-4 text-muted-foreground`}>{section.image_caption}</figcaption>}
    </figure>
  ) : null;

  const adaptiveGrid = compactAdaptiveImage
    ? presentation.imageSize === "small"
      ? "md:grid-cols-[minmax(0,1fr)_minmax(13rem,20rem)] md:items-center"
      : "md:grid-cols-[minmax(0,1.15fr)_minmax(18rem,28rem)] md:items-center"
    : "md:grid-cols-2 md:items-start";

  return (
    <section
      className={wrapperClass}
      style={style}
      data-country-image-placement={compactAdaptiveImage ? "adaptive" : section.image_layout}
    >
      {full ? image : null}
      {sideBySide ? (
        <div className={`grid gap-4 ${adaptiveGrid}`}>
          {imageFirst ? image : content}
          {imageFirst ? content : image}
        </div>
      ) : (
        <>
          {content}
          {!full ? image : null}
        </>
      )}
    </section>
  );
}

function widthClass() {
  // Cards intentionally share the same outer width. Different text/image sizes
  // live inside the card so neighbouring sections never leave accidental gaps.
  return "w-full max-w-none";
}

function panelClass(panelStyle: ReturnType<typeof countrySectionPresentation>["panelStyle"], surface: "country" | "wiki") {
  if (panelStyle === "transparent") return "border-0 bg-transparent";
  if (panelStyle === "outline") return "rounded-2xl border border-border/80 bg-transparent";
  if (panelStyle === "accent") return "rounded-2xl border border-primary/35 bg-primary/[0.07]";
  if (panelStyle === "solid") return "rounded-2xl border border-border/70 bg-surface";
  return surface === "wiki"
    ? "rounded-2xl border border-border/70 bg-surface/60"
    : "glass";
}

function spacingClass(spacing: ReturnType<typeof countrySectionPresentation>["spacing"], divider = false) {
  if (divider) {
    if (spacing === "compact") return "py-2";
    if (spacing === "spacious") return "py-7";
    return "py-4";
  }
  if (spacing === "compact") return "p-3 sm:p-4";
  if (spacing === "spacious") return "p-5 sm:p-7";
  return "p-4 sm:p-5";
}

function imageSizeClass(size: ReturnType<typeof countrySectionPresentation>["imageSize"]) {
  if (size === "small") return "w-full max-w-sm";
  if (size === "medium") return "w-full max-w-xl";
  if (size === "large") return "w-full max-w-3xl";
  return "w-full max-w-none";
}

function imageHeightClass(size: ReturnType<typeof countrySectionPresentation>["imageSize"], full: boolean) {
  if (full) return "max-h-[620px]";
  if (size === "small") return "max-h-[240px]";
  if (size === "medium") return "max-h-[360px]";
  if (size === "large") return "max-h-[520px]";
  return "max-h-[620px]";
}

function imageFadeStyle(fade: ReturnType<typeof countrySectionPresentation>["imageFade"]): CSSProperties {
  if (fade === "none") return {};
  const mask = fade === "top"
    ? "linear-gradient(to bottom, transparent 0%, #000 30%)"
    : fade === "bottom"
      ? "linear-gradient(to bottom, #000 70%, transparent 100%)"
      : fade === "left"
        ? "linear-gradient(to right, transparent 0%, #000 30%)"
        : "linear-gradient(to right, #000 70%, transparent 100%)";
  return { WebkitMaskImage: mask, maskImage: mask };
}

function fullBleedClass(spacing: ReturnType<typeof countrySectionPresentation>["spacing"]) {
  if (spacing === "compact") return "-mx-3 -mt-3 sm:-mx-4 sm:-mt-4";
  if (spacing === "spacious") return "-mx-5 -mt-5 sm:-mx-7 sm:-mt-7";
  return "-mx-4 -mt-4 sm:-mx-5 sm:-mt-5";
}

function captionInsetClass(spacing: ReturnType<typeof countrySectionPresentation>["spacing"]) {
  if (spacing === "compact") return "px-3 sm:px-4";
  if (spacing === "spacious") return "px-5 sm:px-7";
  return "px-4 sm:px-5";
}

function aspectClass(aspect: CountrySectionImageAspect, fallback: CountrySectionImageAspect = "auto") {
  const resolved = aspect === "auto" ? fallback : aspect;
  if (resolved === "16:9") return "aspect-video";
  if (resolved === "4:3") return "aspect-[4/3]";
  if (resolved === "square") return "aspect-square";
  if (resolved === "portrait") return "aspect-[3/4]";
  return "";
}

function Kicker({ children }: { children: string }) {
  return <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.17em] text-primary">{children}</p>;
}
