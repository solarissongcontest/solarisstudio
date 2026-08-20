import type { CSSProperties } from "react";

import type {
  CountryMedia,
  CountryProfile,
  CountryProfileSection,
} from "@/lib/country-account";
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
  const visible = (sections as CountryPageSection[])
    .map(normalizeCountryPageSection)
    .filter((section) => sectionVisibleOn(section, surface))
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));

  if (!visible.length) return null;

  return (
    <div className="space-y-4" data-country-custom-sections={surface}>
      {visible.map((section) => (
        <CountryCustomSection
          key={section.id}
          country={country}
          profile={profile}
          section={section}
          media={media}
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
  media,
  surface,
}: {
  country: Country;
  profile?: CountryProfile | null;
  section: ReturnType<typeof normalizeCountryPageSection>;
  media: CountryMedia[];
  surface: "country" | "wiki";
}) {
  const presentation = countrySectionPresentation(section);

  if (section.section_type === "divider") {
    const divider = presentation.dividerStyle === "dots"
      ? <div className="flex justify-center gap-2"><i className="size-1.5 rounded-full bg-primary/60" /><i className="size-1.5 rounded-full bg-primary/35" /><i className="size-1.5 rounded-full bg-primary/60" /></div>
      : presentation.dividerStyle === "glow"
        ? <div className="h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent shadow-[0_0_18px_hsl(var(--primary)/0.45)]" />
        : <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />;
    return <div className={`${widthClass(presentation.width)} ${spacingClass(presentation.spacing, true)}`} aria-hidden="true">{divider}</div>;
  }

  const style = section.background_tint
    ? ({ backgroundColor: `${section.background_tint}d9` } as CSSProperties)
    : undefined;
  const wrapperClass = [
    widthClass(presentation.width),
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
        <h2 className="font-display text-xl font-semibold">{section.heading || "Quick facts"}</h2>
        {rows.length ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="rounded-xl border border-border/60 bg-background/20 p-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{row.label}</p>
                <p className="mt-1 break-words text-sm font-semibold">{row.value}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No facts have been published for this block yet.</p>}
      </section>
    );
  }

  if (section.section_type === "gallery") {
    const gridClass = presentation.galleryColumns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : presentation.galleryColumns === 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-2 sm:grid-cols-3";
    return (
      <section className={wrapperClass} style={style}>
        {section.kicker && <Kicker>{section.kicker}</Kicker>}
        <h2 className="font-display text-xl font-semibold">{section.heading || "Gallery"}</h2>
        {media.length ? (
          <div className={`mt-4 grid gap-2 ${gridClass}`}>
            {media.map((item) => (
              <figure key={item.id} className="overflow-hidden rounded-xl bg-background/20">
                <img
                  src={item.public_url}
                  alt={item.alt_text || item.caption || `${country.name} gallery image`}
                  loading="lazy"
                  className={`w-full ${aspectClass(presentation.imageAspect, "4:3")} ${presentation.imageFit === "contain" ? "object-contain" : "object-cover"}`}
                  style={{ objectPosition: `${presentation.focalX}% ${presentation.focalY}%` }}
                />
                {item.caption && <figcaption className="p-2 text-[10px] leading-4 text-muted-foreground">{item.caption}</figcaption>}
              </figure>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-muted-foreground">No gallery images have been published yet.</p>}
      </section>
    );
  }

  const hasImage = Boolean(section.image_url);
  const imageFirst = section.image_layout === "left";
  const sideBySide = hasImage && ["split", "left", "right"].includes(section.image_layout);
  const full = hasImage && section.image_layout === "full";
  const fullBleed = fullBleedClass(presentation.spacing);
  const content = (
    <div className={sideBySide ? "min-w-0" : ""}>
      {section.kicker && <Kicker>{section.kicker}</Kicker>}
      {section.heading && <h2 className="font-display text-xl font-semibold sm:text-2xl">{section.heading}</h2>}
      {section.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{section.body}</p>}
    </div>
  );
  const image = hasImage ? (
    <figure className={full ? `${fullBleed} mb-4` : "min-w-0"}>
      <img
        src={section.image_url ?? ""}
        alt={section.image_caption || `${country.name} section image`}
        loading="lazy"
        className={`${full ? "w-full" : section.image_layout === "wide" ? "mt-4 w-full rounded-xl" : "w-full rounded-xl"} ${aspectClass(presentation.imageAspect)} ${presentation.imageAspect === "auto" ? (full ? "max-h-[560px]" : "max-h-[420px]") : ""} ${presentation.imageFit === "contain" ? "object-contain" : "object-cover"}`}
        style={{ objectPosition: `${presentation.focalX}% ${presentation.focalY}%` }}
      />
      {section.image_caption && <figcaption className={`${full ? captionInsetClass(presentation.spacing) : ""} mt-2 text-[10px] leading-4 text-muted-foreground`}>{section.image_caption}</figcaption>}
    </figure>
  ) : null;

  return (
    <section className={wrapperClass} style={style}>
      {full ? image : null}
      {sideBySide ? (
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
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

function widthClass(width: ReturnType<typeof countrySectionPresentation>["width"]) {
  if (width === "narrow") return "mx-auto w-full max-w-2xl";
  if (width === "wide") return "mx-auto w-full max-w-6xl";
  if (width === "full") return "w-full max-w-none";
  return "mx-auto w-full max-w-4xl";
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
